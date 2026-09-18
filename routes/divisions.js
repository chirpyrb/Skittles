const express = require('express')
const router = express.Router()

const division = require('../models/division')

// Get all alleys.
router.get('/', async (req, res) => {
    try {
        const allDivs = await division.getAllDivisions()
        console.log(allDivs)
        res.render('divisions/index', { allDivs: allDivs })
    } catch (err) {
        console.error(err)
        res.redirect('/')
    }
})

// New Division
router.get('/new', async (req, res) => {
    const competitionModel = require('../models/competition')
    const seasons = await competitionModel.getAllCompetitions()
        .then(rows => rows.filter(row => row.seasonId).map(row => ({
            id: row.seasonId,
            name: row.seasonName || row.name
        })))
    res.render('divisions/new', { seasons })
})

router.post('/', async (req, res) => {
    const divName = String(req.body.newDivName || '').trim()
    const seasonId = req.body.seasonId ? Number(req.body.seasonId) : null

    if (!divName) {
        return res.status(400).send('Division name is required.')
    }

    if (!Number.isInteger(seasonId)) {
        return res.status(400).send('A season is required for a division.')
    }

    try {
        await division.createDivision(divName, seasonId)
        res.redirect('/divisions')
    } catch (err) {
        console.error(err)
        res.status(400).send(err.message || 'Unable to create division.')
    }
})

module.exports = router