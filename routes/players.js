const express = require('express')
const router = express.Router()

const player = require('../models/player')
const team = require('../models/team')
const bodyParser = require('body-parser')

// Get all players
router.get('/', async (req, res) => {
    try {
        const playerList = await player.getAllPlayers()
        res.render('players/index', { playerList: playerList })
    } catch (err) {
        console.error(err)
        res.redirect('/')
    }
})

// New player form
router.get('/new', async (req, res) => {
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

// Create player
router.post('/', async (req, res) => {
    try {
        const { firstName, secondName, alias, teamID } = req.body
        let finalTeamId = teamID;
        if (!finalTeamId && req.query.teamName) {
            const found = await team.getTeamIdByName(req.query.teamName)
            if (found) finalTeamId = found;
        }
        if (firstName && secondName) {
            await player.createPlayer(firstName, secondName, alias || '', finalTeamId || null)
        }
        res.redirect('/players')
    } catch (err) {
        console.error("Error creating player:", err)
        res.redirect('/players')
    }
})

module.exports = router