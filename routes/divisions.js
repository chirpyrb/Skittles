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
    res.render('divisions/new')
})

router.post('/', async (req, res) => {
    const divName = req.body.newDivName
    console.log(divName)
    try {
        await division.createDivision([divName])
        res.redirect('/divisions')
    } catch (err) {
        console.error(err)
    }
})

module.exports = router