const express = require('express')
const router = express.Router()
const multer = require('multer')
const fs = require('fs')
const path = require('path')

const team = require('../models/team')
const player = require('../models/player')
const alley = require('../models/alley')
const division = require('../models/division')
const bulkImport = require('../models/bulkImport')
const competition = require('../models/competition')
const league = require('../models/league')
const fixture = require('../models/fixture')

const teamLogoDirectory = path.join(__dirname, '..', 'public', 'images', 'team-logos')
fs.mkdirSync(teamLogoDirectory, { recursive: true })
const teamLogoUpload = multer({
    storage: multer.diskStorage({
        destination: teamLogoDirectory,
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname || '').toLowerCase()
            callback(null, `team-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`)
        }
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimetype)) {
            return callback(new Error('Team logos must be PNG, JPG, WEBP, or GIF images.'))
        }
        callback(null, true)
    }
})

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
        const currentSeason = await competition.ensureCurrentSeason()
        const competitions = await competition.getAllCompetitions()
        const competitionIds = competitions
            .filter(currentCompetition => currentCompetition.seasonStartYear === currentSeason.seasonStartYear)
            .map(currentCompetition => currentCompetition.id)
        const playerStats = qTeam
            ? await player.getPlayerStatsForTeamSeason(qTeam.id, currentSeason.seasonStartYear, competitionIds)
            : []
        const teamFixtures = qTeam ? await fixture.getAllFixturesByTeamID(qTeam.id) : []
        const previousResults = teamFixtures
            .filter(currentFixture => ['Completed', 'Confirmed'].includes(currentFixture.status) ||
                (currentFixture.homeScore != null && currentFixture.awayScore != null &&
                    ['Provisional', 'Completed', 'Confirmed'].includes(currentFixture.status)))
            .sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate))
        const upcomingFixtures = teamFixtures
            .filter(currentFixture => !previousResults.includes(currentFixture) && currentFixture.status !== 'Bye')
            .sort((a, b) => new Date(a.matchDate) - new Date(b.matchDate))
        const standings = qTeam && qTeam.divisionId
            ? await division.calculateStandings(currentSeason.id, qTeam.divisionId)
            : []
        res.render('teams/teamPage', {
            team: qTeam,
            playerStats: playerStats,
            seasonStartYear: currentSeason.seasonStartYear,
            previousResults,
            upcomingFixtures,
            standings,
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
    const alleyList = await alley.getAlleys(null)
    const leagues = await league.getAllLeagues()
    const selectedLeagueId = req.query.leagueId ? Number(req.query.leagueId) : null
    res.render('teams/new', { alleyList, leagues, selectedLeagueId })
})

router.get('/edit/:id', requireTeamManagementAccess, async (req, res) => {
    const teamInfo = await team.getTeamById(req.params.id)
    if (!teamInfo) return res.status(404).send('Team not found')

    const divList = await division.getAllDivisions()
    const alleyList = await alley.getAlleys(null)
    const leagues = await league.getAllLeagues()
    res.render('teams/edit', { team: teamInfo, divList: divList, alleyList: alleyList, leagues: leagues })
})

router.post('/edit/:id', requireTeamManagementAccess, (req, res, next) => {
    teamLogoUpload.single('logo')(req, res, async error => {
        if (error) return res.status(400).send(error.message)
        const teamName = String(req.body.teamName || '').trim()
        const homeAlley = Number(req.body.homeAlley)
        const divisionId = req.body.division ? Number(req.body.division) : null
        const leagueId = req.body.leagueId ? Number(req.body.leagueId) : null
        const homeNight = Number(req.body.homeNight)

        if (!teamName || !Number.isInteger(homeAlley) || !Number.isInteger(homeNight) || homeNight < 1 || homeNight > 7) {
            return res.status(400).send('Team name, alley, and a home night from 1 to 7 are required.')
        }

        try {
            const logoPath = req.file ? `/images/team-logos/${req.file.filename}` : undefined
            await team.updateTeam(req.params.id, teamName, homeAlley, divisionId, homeNight, leagueId, logoPath)
            res.redirect(`/teams?teamName=${encodeURIComponent(teamName)}`)
        } catch (error) {
            console.error(error)
            res.status(400).send('Unable to update team details.')
        }
    })
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
router.post('/', (req, res, next) => {
    teamLogoUpload.single('logo')(req, res, async error => {
        if (error) return res.status(400).send(error.message)
        const newTeamName = String(req.body.newTeamName || '').trim()
        const newTeamAlley = req.body.newTeamAlley ? Number(req.body.newTeamAlley) : null
        const leagueId = req.body.leagueId ? Number(req.body.leagueId) : null

        if (!newTeamName || !leagueId) {
            return res.status(400).send('Team name and league are required.')
        }

        try {
            const logoPath = req.file ? `/images/team-logos/${req.file.filename}` : null
            await team.createTeam(newTeamName, newTeamAlley, leagueId, logoPath)
            res.redirect('/teams')
        } catch (err) {
            console.error(err)
            res.status(400).send(err.message || 'Unable to create team.')
        }
    })
})

module.exports = router