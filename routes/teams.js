const express = require('express')
const router = express.Router()

const team = require('../models/team')
const player = require('../models/player')
const alley = require('../models/alley')
const division = require('../models/division')
const bulkImport = require('../models/bulkImport')
const competition = require('../models/competition')

function requireRegisteredUser(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }
    next()
}

function requireTeamManagementAccess(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }

    if (!['dev', 'LeagueSecretary', 'TeamSecratary', 'TeamSecretary'].includes(req.session.user.access)) {
        return res.status(403).send('You are not authorised to edit team details.')
    }

    next()
}

// Get all teams
router.get('/', async (req, res) => {
    if (req.query.teamName != null) {
        if (!req.session.user) {
            req.session.returnTo = req.originalUrl
            return res.redirect('/users/login')
        }
        const teamName = req.query.teamName
        const qTeam = await team.getTeamByName(teamName)
        const playerList = await player.getPlayersOnTeamByName(teamName)
        const currentSeason = await competition.ensureCurrentSeason()
        const competitions = await competition.getAllCompetitions()
        const competitionIds = competitions
            .filter(currentCompetition => currentCompetition.seasonStartYear === currentSeason.seasonStartYear)
            .map(currentCompetition => currentCompetition.id)
        const playerStats = qTeam ? await player.getPlayerStatsForTeamSeason(qTeam.id, competitionIds) : []
        res.render('teams/teamPage', {
            team: qTeam,
            playerList: playerList,
            playerStats: playerStats,
            seasonStartYear: currentSeason.seasonStartYear,
            user: req.session.user
        })
    } else {
        try {
            const allTeams = await team.getAllTeams()
            res.render('teams/index', { allTeams: allTeams })
        } catch (err) {
            console.error(err)
            res.redirect('/')
        }
    }
})

// New teams
router.get('/new', async (req, res) => {
    const divList = await division.getAllDivisions()
    const alleyList = await alley.getAlleys(null)
    res.render('teams/new', { divList: divList, alleyList: alleyList })
})

router.get('/edit/:id', requireTeamManagementAccess, async (req, res) => {
    const teamInfo = await team.getTeamById(req.params.id)
    if (!teamInfo) return res.status(404).send('Team not found')

    const divList = await division.getAllDivisions()
    const alleyList = await alley.getAlleys(null)
    res.render('teams/edit', { team: teamInfo, divList: divList, alleyList: alleyList })
})

router.post('/edit/:id', requireTeamManagementAccess, async (req, res) => {
    const teamName = String(req.body.teamName || '').trim()
    const homeAlley = Number(req.body.homeAlley)
    const divisionId = Number(req.body.division)
    const homeNight = Number(req.body.homeNight)

    if (!teamName || !Number.isInteger(homeAlley) || !Number.isInteger(divisionId) || !Number.isInteger(homeNight) || homeNight < 1 || homeNight > 7) {
        return res.status(400).send('Team name, alley, division, and a home night from 1 to 7 are required.')
    }

    try {
        await team.updateTeam(req.params.id, teamName, homeAlley, divisionId, homeNight)
        res.redirect(`/teams?teamName=${encodeURIComponent(teamName)}`)
    } catch (error) {
        console.error(error)
        res.status(400).send('Unable to update team details.')
    }
})

router.post('/delete/:id', requireTeamManagementAccess, async (req, res) => {
    try {
        const teamInfo = await team.getTeamById(req.params.id)
        if (!teamInfo) return res.status(404).send('Team not found')

        const dependencies = await team.getTeamDependencyCounts(req.params.id)
        if (dependencies.fixtures) {
            const reasons = []
            reasons.push(`${dependencies.fixtures} fixture(s)`)
            return res.status(409).send(`This team cannot be deleted because it has ${reasons.join(' and ')}. Historical fixtures must be preserved first.`)
        }

        await team.deleteTeam(req.params.id)
        res.redirect('/teams')
    } catch (error) {
        console.error(error)
        res.status(400).send('Unable to delete team.')
    }
})

router.get('/bulk-upload', bulkImport.requireBulkUploadAccess, (req, res) => {
    res.render('teams/bulkUpload', { imported: null, errors: [] })
})

router.post('/bulk-upload', bulkImport.requireBulkUploadAccess, (req, res, next) => {
    bulkImport.csvUpload.single('csvFile')(req, res, async error => {
        if (error || !req.file) return res.status(400).render('teams/bulkUpload', { imported: null, errors: [error ? error.message : 'Select a CSV file.'] })
        try {
            const result = await bulkImport.importTeams(req.file.buffer.toString('utf8'))
            res.status(result.errors.length ? 400 : 200).render('teams/bulkUpload', result)
        } catch (err) { next(err) }
    })
})

// Create team.
router.post('/', async (req, res) => {
    const newTeamName = req.body.newTeamName
    const newTeamAlley = req.body.newTeamAlley
    const newTeamDiv = req.body.newTeamDiv
    console.log(newTeamName)
    try {
        await team.createTeam(newTeamName, newTeamAlley, newTeamDiv)
        res.redirect('/teams')
    } catch (err) {

    }
})

module.exports = router