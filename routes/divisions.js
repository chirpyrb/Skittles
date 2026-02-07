const express = require('express')
const router = express.Router()

const sqlite3 = require('sqlite3').verbose()
const SQ3 = require('../models/sql')
const db = new sqlite3.Database("./skittles.sql3")

// Create a table, if we havent already.
db.run('CREATE TABLE IF NOT EXISTS Divisions (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')

// Get all alleys.
router.get('/', async (req, res) => {
    let SQL = ""
    SQL = 'SELECT * FROM Divisions'
    console.log(SQL)
    try {
        const allDivs = await SQ3.fetchAll(db, SQL)
        console.log(allDivs)
        res.render('divisions/index', {allDivs: allDivs })
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
        SQL = 'INSERT INTO Divisions(name) VALUES (?)'
        await SQ3.execute(db, SQL, divName)
        res.redirect('/divisions')
    } catch (err) {
        console.error(err)
    }
})

module.exports = router