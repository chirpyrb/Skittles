const express = require('express')
const router = express.Router()
const liveModel = require('../models/live')

// GET /live - Main Live Matchday & Videoprinter Page
router.get('/', async (req, res) => {
    try {
        const divisions = await liveModel.getLiveScoresByDivision()
        const initialEvents = await liveModel.getVideoprinterEvents(35)
        res.render('live/index', {
            divisions,
            initialEvents
        })
    } catch (err) {
        console.error('Error rendering live page:', err)
        res.status(500).send('Unable to load live matchday page.')
    }
})

// GET /live/api/feed - JSON endpoint for real-time client polling
router.get('/api/feed', async (req, res) => {
    try {
        const divisions = await liveModel.getLiveScoresByDivision()
        const events = await liveModel.getVideoprinterEvents(35)
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            divisions,
            events
        })
    } catch (err) {
        console.error('Error fetching live API feed:', err)
        res.status(500).json({ error: 'Unable to fetch live feed.' })
    }
})

module.exports = router
