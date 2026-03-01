const express = require('express')
const router = express.Router()

const alley = require('../models/alley')
const pub = require('../models/pub')

// Get all alleys.
router.get('/', async (req, res) => {
    try {
        const alleyList = await alley.getAlleys(req.query.alleySearchName)
        res.render('alleys/index', { alleyListArray: alleyList })
    } catch (err) {
        res.redirect('/')
    }
})

// New alley
router.get('/new', async (req, res) => {
    // Get all the pubs. The Alley must be at a pub.
    const pubList = await pub.getAllPubs()
    res.render('alleys/new', { "Alley_Name": "", pubListArray: pubList })
})

// Create team.
router.post('/', async (req, res) => {
    const pubID = req.body.newAlleyPub
    const newAlleyName = req.body.newAlleyName
    try {
        await alley.createAlley(newAlleyName, pubID)
        res.redirect('/alleys')
    } catch {
        res.send('Error creating alley')
    }
})

module.exports = router