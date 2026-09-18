const express = require('express')
const router = express.Router()
const league = require('../models/league')
const team = require('../models/team')

router.get('/', async (req, res) => {
    try {
        res.render('leagues/index', { leagues: await league.getAllLeagues() })
    } catch (error) {
        console.error(error)
        res.status(500).send('Unable to load leagues.')
    }
})

router.get('/new', (req, res) => {
    res.render('leagues/new')
})

router.post('/', async (req, res) => {
    try {
        await league.createLeague(req.body.name)
        res.redirect('/leagues')
    } catch (error) {
        console.error(error)
        res.status(400).send(error.message || 'Unable to create league.')
    }
})

router.get('/:leagueId', async (req, res) => {
    try {
        const leagueId = Number(req.params.leagueId)
        const selectedLeague = await league.getLeagueById(leagueId)
        if (!selectedLeague) return res.status(404).send('League not found.')

        res.render('leagues/show', {
            league: selectedLeague,
            competitions: await league.getCompetitionsForLeague(leagueId),
            seasons: await league.getSeasonsForLeague(leagueId),
            teams: await team.getTeamsForLeague(leagueId)
        })
    } catch (error) {
        console.error(error)
        res.status(500).send('Unable to load league.')
    }
})

router.post('/:leagueId/competitions', async (req, res) => {
    try {
        await league.createCompetition(Number(req.params.leagueId), req.body.name)
        res.redirect(`/leagues/${req.params.leagueId}`)
    } catch (error) {
        console.error(error)
        res.status(400).send(error.message || 'Unable to create competition.')
    }
})

router.post('/:leagueId/seasons', async (req, res) => {
    try {
        await league.createSeason(
            Number(req.params.leagueId),
            req.body.name,
            req.body.startDate,
            req.body.endDate
        )
        res.redirect(`/leagues/${req.params.leagueId}`)
    } catch (error) {
        console.error(error)
        res.status(400).send(error.message || 'Unable to create season.')
    }
})

module.exports = router
