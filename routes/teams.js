const express = require('express')
const router = express.Router()

const sqlite3 = require('sqlite3').verbose()
const SQ3 = require('../models/sql')
const db = new sqlite3.Database("./skittles.sql3")

// Create a table, if we havent already.
db.run('CREATE TABLE IF NOT EXISTS Teams (id INTEGER PRIMARY KEY, teamName TEXT NOT NULL, homeAlley INTEGER, division INETGER, FOREIGN KEY(homeAlley) REFERENCES Alleys(id), FOREIGN KEY (division) REFERENCES Divisions(id))')


// Get all teams
router.get('/', async (req, res) => {
    if (req.query.teamName != null) {
        var SQL = "SELECT Teams.[teamName], Alleys.[name] AS homeAlley, Divisions.name AS division FROM Alleys INNER JOIN (Divisions INNER JOIN Teams ON Divisions.[ID] = Teams.[division]) ON Alleys.[ID] = Teams.[homeAlley] WHERE Teams.[teamName] = ?;"
        const qTeam = await SQ3.fetchFirst(db, SQL, req.query.teamName)
        const teamName = req.query.teamName
        const playerList = await SQ3.fetchAll(db, `SELECT Players.firstName, Players.secondName, Players.alias FROM Teams INNER JOIN Players ON Teams.id = Players.team WHERE Teams.teamName = '${teamName}';`)
        res.render('teams/teamPage', {team: qTeam, playerList: playerList})
    } else {
        const SQL = "SELECT Teams.[teamName], Alleys.[name] AS homeAlley, Divisions.name AS division FROM Alleys INNER JOIN (Divisions INNER JOIN Teams ON Divisions.[ID] = Teams.[division]) ON Alleys.[ID] = Teams.[homeAlley];"
        try {
            const allTeams = await SQ3.fetchAll(db, SQL)
            res.render('teams/index', {allTeams: allTeams})
        } catch (err) {
            console.error(err)
            res.redirect('/')
        }
    }
})

// New teams
router.get('/new', async (req, res) => {
    const divList = await SQ3.fetchAll(db, 'SELECT * FROM Divisions')
    const alleyList = await SQ3.fetchAll(db, 'SELECT * FROM Alleys')
    res.render('teams/new', {divList: divList, alleyList: alleyList})
})

// Create team.
router.post('/', async (req, res) => {
    const newTeamName = req.body.newTeamName
    const newTeamAlley = req.body.newTeamAlley
    const newTeamDiv = req.body.newTeamDiv
    console.log(newTeamName)
    try {
        await SQ3.execute(db, 'INSERT INTO Teams(teamName,homeAlley,division) VALUES (?,?,?)', [newTeamName, newTeamAlley, newTeamDiv])
        res.redirect('/teams')
    } catch (err) {

    }
})

module.exports = router