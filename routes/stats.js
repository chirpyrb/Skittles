const express = require('express')
const router = express.Router()

const competition = require('../models/competition')
const statisticsModel = require('../models/statistics')

router.get('/', async (req, res) => {
    try {
        const currentSeason = await competition.ensureCurrentSeason()
        const seasons = await statisticsModel.getSeasons()
        const alleys = await statisticsModel.getAlleys()
        const statisticId = statisticsModel.statistics[req.query.stat]
            ? req.query.stat
            : 'player-average'
        const requestedYear = req.query.season
        const seasonYear = requestedYear === 'all'
            ? null
            : Number.isInteger(Number(requestedYear)) &&
                seasons.some(season => Number(season.year) === Number(requestedYear))
                ? Number(requestedYear)
                : Number(currentSeason.seasonStartYear)
        const requestedAlleyId = Number(req.query.alley)
        const alleyId = Number.isInteger(requestedAlleyId) &&
            alleys.some(alley => Number(alley.id) === requestedAlleyId)
            ? requestedAlleyId
            : null
        const requestedLimit = Number(req.query.limit)
        const limit = [10, 20, 50].includes(requestedLimit) ? requestedLimit : 20
        const requestedMinimum = Number(req.query.minimumGames)
        const minimumGames = [1, 3, 5, 10].includes(requestedMinimum) ? requestedMinimum : 1
        const statistic = statisticsModel.statistics[statisticId]
        const results = await statisticsModel.getStatisticResults(statisticId, {
            seasonYear,
            alleyId,
            limit,
            minimumGames
        })

        res.render('stats/index', {
            statistics: statisticsModel.statistics,
            statisticId,
            statistic,
            seasons,
            seasonYear,
            alleys,
            alleyId,
            limit,
            minimumGames,
            results
        })
    } catch (error) {
        console.error('Error loading statistics:', error)
        res.status(500).send('Unable to load statistics.')
    }
})

module.exports = router
