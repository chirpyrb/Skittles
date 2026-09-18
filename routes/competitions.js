const express = require('express')
const router = express.Router()

const competition = require('../models/competition')

router.get('/', async (req, res) => {
    try {
        const competitions = await competition.getAllCompetitions() || []
        res.render('competitions/index', { Competitions: competitions })
    } catch (err) {
        console.error(err)
        res.render('competitions/index', { Competitions: [] })
    }
})

router.get('/new', async (req, res) => {
    res.render('competitions/new')
})

router.get('/:competitionId', async (req, res) => {
    const competitionId = Number(req.params.competitionId)
    if (!Number.isInteger(competitionId)) return res.redirect('/competitions')

    const allCompetitions = await competition.getAllCompetitions()
    const selectedCompetition = allCompetitions.find(currentCompetition => currentCompetition.id === competitionId)
    if (!selectedCompetition) return res.status(404).send('Competition not found')

    const seasons = allCompetitions
        .filter(currentCompetition => currentCompetition.id === competitionId)
        .filter(currentCompetition => currentCompetition.seasonId)
        .map(currentCompetition => ({
            id: currentCompetition.seasonId,
            name: currentCompetition.seasonName || currentCompetition.name,
            startDate: currentCompetition.seasonStartDate,
            endDate: currentCompetition.seasonEndDate,
            status: currentCompetition.seasonStatus || currentCompetition.status
        }))

    res.render('competitions/season', {
        competition: selectedCompetition,
        seasons,
        seasonStartYear: selectedCompetition.seasonStartYear || new Date(selectedCompetition.startDate || '2026-07-01').getUTCFullYear()
    })
})

router.post('/', async (req, res) => {
    const competitionName = String(req.body.competitionName || '').trim()
    const seasonName = String(req.body.seasonName || '').trim()
    const seasonStartDate = req.body.seasonStartDate
    const seasonEndDate = req.body.seasonEndDate

    if (!competitionName) {
        return res.status(400).send('Competition name is required.')
    }

    try {
        const createdCompetition = await competition.createCompetition(competitionName)
        if (seasonStartDate && seasonEndDate) {
            await competition.createSeason(createdCompetition.id, seasonName || `${competitionName} season`, seasonStartDate, seasonEndDate, 'Active')
        }
        res.redirect('/competitions')
    } catch (err) {
        console.error(err)
        res.status(500).send('Unable to create competition.')
    }
})

module.exports = router