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

router.get('/:seasonStartYear', async (req, res) => {
    const seasonStartYear = Number(req.params.seasonStartYear)
    if (!Number.isInteger(seasonStartYear)) return res.redirect('/competitions')

    const competitions = (await competition.getAllCompetitions())
        .filter(currentCompetition => currentCompetition.seasonStartYear === seasonStartYear)
    if (!competitions.length) return res.status(404).send('Season not found')

    const fixtureModel = require('../models/fixture')
    const allFixtures = await fixtureModel.getAllFixtures()
    const competitionIds = new Set(competitions.map(currentCompetition => currentCompetition.id))
    const fixtures = allFixtures.filter(currentFixture => competitionIds.has(currentFixture.competition))
    res.render('competitions/season', { seasonStartYear, competitions, fixtures })
})

// New season
router.get('/new', async (req, res) => {
    res.redirect('/competitions')
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