const express = require('express')
const router = express.Router()

const team = require('../models/team')
const player = require('../models/player')
const alley = require('../models/alley')
const division = require('../models/division')

// Get all teams
router.get('/', async (req, res) => {
    if (req.query.teamName != null) {
        const teamName = req.query.teamName
        const qTeam = await team.getTeamByName(teamName)
        const playerList = await player.getPlayersOnTeamByName(teamName)
        res.render('teams/teamPage', { team: qTeam, playerList: playerList })
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