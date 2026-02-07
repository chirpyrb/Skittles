const express = require('express')
const router = express.Router()

const sqlite3 = require('sqlite3').verbose()
const SQ3 = require('../models/sql')
const bodyParser = require('body-parser')
const db = new sqlite3.Database("./skittles.sql3")

// Create a table, if we havent already.
db.run('CREATE TABLE IF NOT EXISTS Players (id INTEGER PRIMARY KEY, firstName TEXT NOT NULL, secondName TEXT NOT NULL, alias TEXT NOT NULL, team INTEGER, FOREIGN KEY (team) REFERENCES Teams(id))')

// Get all players
router.get('/', async (req, res) => {
    const teamName = req.query.teamName
    console.log(teamName)
    const SQL = `SELECT Players.[First Name], Players.Surname, Players.Alias FROM Teams INNER JOIN Players ON Teams.[ID] = Players.[Team] WHERE Teams.[Team Name] = '${teamName}';`
    console.log(SQL)
    // const playerList = await SQ3.fetchAll(db, `SELECT Players.[First Name], Players.Surname, Players.Alias FROM Teams INNER JOIN Players ON Teams.[ID] = Players.[Team] WHERE Teams.[Team Name] = '${teamName}';`)
    // console.log(playerList)
    res.send('Players')
})

// New player
router.get('/new', async (req, res) => {
    // All players should be added to a team
    if (req.query.teamName != null) {
        res.render('players/new', {teamName: req.query.teamName})
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
    const teamID = await SQ3.fetchFirst(db, "SELECT id FROM Teams WHERE teamName=?", teamName)
    console.log(teamID)
    console.log(firstName, secondName, alias, teamName)
    await SQ3.execute(db, "INSERT INTO Players(firstName,secondName,alias,team) VALUES(?,?,?,?)", [firstName, secondName, alias, teamID.id])
    res.redirect(`/teams?teamName=${teamName}`)
})

module.exports = router