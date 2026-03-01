const express = require('express')
const router = express.Router()

const player = require('../models/player')
const team = require('../models/team')
const bodyParser = require('body-parser')

// Get all players
router.get('/', async (req, res) => {
    const teamName = req.query.teamName
    console.log(teamName)
    // const playerList = await player.getPlayersOnTeamByName(teamName)
    // console.log(playerList)
    res.send('Players')
})

// New player
router.get('/new', async (req, res) => {
    // All players should be added to a team
    if (req.query.teamName != null) {
        res.render('players/new', { teamName: req.query.teamName })
    } else {
        res.send("Players must be added to a team")
    }
})

// Create team.
router.post('/', async (req, res) => {
    const firstName = req.body.firstName
    const secondName = req.body.secondName
    const alias = req.body.alias
    const teamName = req.query.teamName
    const teamID = await team.getTeamIdByName(teamName)
    console.log(teamID)
    console.log(firstName, secondName, alias, teamName)
    await player.createPlayer(firstName, secondName, alias, teamID.id)
    res.redirect(`/teams?teamName=${teamName}`)
})

module.exports = router