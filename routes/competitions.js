const express = require('express')
const router = express.Router()

const competition = require('../models/competition')

// Get all seasons
router.get('/', async (req, res) => {
    const Competitions = await competition.getAllCompetitions()
    if (Competitions != null) {
        res.render('competitions/index', { Competitions: Competitions })
    } else {
        res.render('competitions/index', { Competitions: [] })
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
        await competition.createCompetition(seasonName, seasonStartDate, seasonEndDate)
        res.redirect('/competitions')
    } catch (err) {

    }
})

module.exports = router