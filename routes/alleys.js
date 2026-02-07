const express = require('express')
const router = express.Router()

const sqlite3 = require('sqlite3').verbose()
const SQ3 = require('../models/sql')
const db = new sqlite3.Database("./skittles.sql3")

// Create a table, if we havent already.
db.run('CREATE TABLE IF NOT EXISTS Alleys (id INTEGER PRIMARY KEY, name TEXT NOT NULL, pub INTEGER, FOREIGN KEY(pub) REFERENCES pub(id))')

// Get all alleys.
router.get('/', async (req, res) => {
    let SQL = ""
    let params = {}
    if (req.query.alleySearchName != null && req.query.alleySearchName !== '') {
        SQL = 'SELECT Pubs.name, Alleys.name FROM Pubs INNER JOIN Alleys ON Pubs.id = Alleys.pub WHERE Alleys.name = ?'
        params = req.query.alleySearchName
    } else {
        // SQL = 'SELECT * FROM Alleys'
        SQL = 'SELECT Pubs.name AS PubName, Alleys.name AS AlleyName FROM Pubs INNER JOIN Alleys ON Pubs.id = Alleys.pub'
    }

    try {
        const alleyList = await SQ3.fetchAll(db, SQL, params)
        console.log(SQL)
        console.log(alleyList)
        res.render('alleys/index', {alleyListArray: alleyList })
    } catch (err) {
        res.redirect('/')
    }
    
})

// New alley
router.get('/new', async (req, res) => {
    // Get all the pubs. The Alley must be at a pub.
    SQL = 'SELECT * FROM Pubs'
    const pubList = await SQ3.fetchAll(db, SQL)
    res.render('alleys/new', {"Alley_Name": "", pubListArray: pubList })
})

// Create team.
router.post('/', async (req, res) => {
    const pubID = req.body.newAlleyPub
    const newAlleyName = req.body.newAlleyName
    try {
        await SQ3.execute(db, 'INSERT INTO Alleys(name,pub) VALUES(?,?)', [newAlleyName, pubID])
        res.redirect('/alleys')
    } catch {
        res.send('Error creating alley')
    }
    
})

module.exports = router