const express = require('express')
const router = express.Router()

const sqlite3 = require('sqlite3').verbose()
const SQ3 = require('../models/sql')
const db = new sqlite3.Database("./skittles.sql3")

// Create a table, if we havent already.
db.run('CREATE TABLE IF NOT EXISTS Competitions (id INTEGER PRIMARY KEY, name TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL);')

// Get all seasons
router.get('/', async (req, res) => {
    const Competitions = await SQ3.fetchAll(db, 'SELECT * FROM Competitions')
    if (Competitions != null) {
        res.render('competitions/index', {Competitions: Competitions})
    } else {
        res.render('competitions/index', {Competitions: []})
    }
})

// New season
router.get('/new', async (req, res) => {
    res.render('competitions/new')
})

// Create season.
router.post('/', async (req, res) => {
    const seasonName = req.body.seasonName
    const seasonStartDate = req.body.seasonStartDate
    const seasonEndDate = req.body.seasonEndDate
    try {
        await SQ3.execute(db, 'INSERT INTO Competitions(name,startDate,endDate) VALUES (?,?,?)', [seasonName, seasonStartDate, seasonEndDate])
        res.redirect('/competitions')
    } catch (err) {

    }
})

module.exports = router