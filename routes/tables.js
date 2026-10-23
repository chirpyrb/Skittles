const express = require('express')
const router = express.Router()
const divisionModel = require('../models/division')
const leagueModel = require('../models/league')

router.get('/', async (req, res) => {
    try {
        const leagues = await leagueModel.getAllLeagues()
        const selectedLeagueId = req.query.leagueId ? Number(req.query.leagueId) : (leagues[0] ? leagues[0].id : null)
        
        let seasons = []
        if (selectedLeagueId) {
            seasons = await leagueModel.getSeasonsForLeague(selectedLeagueId)
        }
        const selectedSeasonId = req.query.seasonId ? Number(req.query.seasonId) : (seasons[0] ? seasons[0].id : null)

        const tables = await divisionModel.getAllLeagueTables(selectedLeagueId, selectedSeasonId)

        res.render('tables/index', {
            leagues,
            seasons,
            selectedLeagueId,
            selectedSeasonId,
            tables
        })
    } catch (err) {
        console.error('Error loading league tables:', err)
        res.status(500).send('Unable to load league tables.')
    }
})

module.exports = router
