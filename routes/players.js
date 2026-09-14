const express = require('express')
const router = express.Router()

const player = require('../models/player')
const team = require('../models/team')
const bodyParser = require('body-parser')
const bulkImport = require('../models/bulkImport')

function requireRegisteredUser(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }
    next()
}

function requirePlayerManagementAccess(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }
    if (!['dev', 'LeagueSecretary', 'TeamSecratary', 'TeamSecretary'].includes(req.session.user.access)) {
        return res.status(403).send('You are not authorised to add players.')
    }
    next()
}

function requireLeagueSecretary(req, res, next) {
    if (!req.session.user) return res.redirect('/users/login')
    if (!['dev', 'LeagueSecretary'].includes(req.session.user.access)) {
        return res.status(403).send('Only a league secretary can approve players.')
    }
    next()
}

// Get all players
router.get('/', requireRegisteredUser, async (req, res) => {
    try {
        const playerList = await player.getAllPlayers()
        res.render('players/index', { playerList: playerList })
    } catch (err) {
        console.error(err)
        res.redirect('/')
    }
})

// New player form
router.get('/new', requirePlayerManagementAccess, async (req, res) => {
    try {
        const teamList = await team.getAllTeams()
        let selectedTeamId = req.query.teamID || null;
        if (!selectedTeamId && req.query.teamName) {
            const found = await team.getTeamIdByName(req.query.teamName);
            if (found) selectedTeamId = found;
        }
        res.render('players/new', { teamList: teamList, selectedTeamId: selectedTeamId })
    } catch (err) {
        console.error(err)
        res.redirect('/players')
    }
})

router.get('/bulk-upload', bulkImport.requireBulkUploadAccess, (req, res) => {
    res.render('players/bulkUpload', { imported: null, errors: [] })
})

router.post('/bulk-upload', bulkImport.requireBulkUploadAccess, (req, res, next) => {
    bulkImport.csvUpload.single('csvFile')(req, res, async error => {
        if (error || !req.file) return res.status(400).render('players/bulkUpload', { imported: null, errors: [error ? error.message : 'Select a CSV file.'] })
        try {
            const result = await bulkImport.importPlayers(req.file.buffer.toString('utf8'))
            res.status(result.errors.length ? 400 : 200).render('players/bulkUpload', result)
        } catch (err) { next(err) }
    })
})

// Create player
router.post('/', requirePlayerManagementAccess, async (req, res) => {
    try {
        const { firstName, secondName, alias, teamID } = req.body
        let finalTeamId = teamID;
        if (!finalTeamId && req.query.teamName) {
            const found = await team.getTeamIdByName(req.query.teamName)
            if (found) finalTeamId = found;
        }
        if (firstName && secondName) {
            const approved = ['dev', 'LeagueSecretary'].includes(req.session.user.access) ? 1 : 0
            await player.createPlayer(firstName, secondName, alias || '', finalTeamId || null, approved)
        }
        res.redirect('/players')
    } catch (err) {
        console.error("Error creating player:", err)
        res.redirect('/players')
    }
})

router.post('/approve/:id', requireLeagueSecretary, async (req, res) => {
    try {
        await player.approvePlayer(req.params.id)
        res.redirect('/players')
    } catch (error) {
        console.error(error)
        res.status(400).send('Unable to approve player.')
    }
})

module.exports = router