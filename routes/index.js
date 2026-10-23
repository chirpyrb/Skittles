const express = require('express')
const router = express.Router()
const division = require('../models/division')

router.get('/', async (req, res) => {
    try {
        const tables = await division.getAllLeagueTables()
        res.render('index', { tables })
    } catch (err) {
        console.error('Error rendering homepage tables:', err)
        res.render('index', { tables: [] })
    }
})

module.exports = router