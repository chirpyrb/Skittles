const express = require('express')
const router = express.Router()

const sqlite3 = require('sqlite3').verbose()
const SQ3 = require('../models/sql')
const db = new sqlite3.Database("./skittles.sql3")
const pub = require('../models/pub')

// Get all pubs.
router.get('/', async (req, res) => {
    console.log(req.session.user)
    let SQL = ""
    let params = {}
    if (req.query.pubSearchName != null && req.query.pubSearchName !== '') {
        pubList = await pub.searchPubList(req.query.pubSearchName)
    } else {
        pubList = await pub.getAllPubs();
    }

    try {
        res.render('pubs/index', {pubListArray: pubList, user: req.session.user })
    } catch (err) {
        res.redirect('/')
    }
    
})

// New teams
router.get('/new', (req, res) => {
    res.render('pubs/new', {newName: {"Pub_Name": ""}})
})

// Create team.
router.post('/', async (req, res) => {
    const newPubName = req.body.newName
    console.log(newPubName)
    try {
        await SQ3.execute(db, 'INSERT INTO Pubs(name) VALUES(?)', [newPubName])
        res.redirect('/pubs')
    } catch {
        res.send('Error creating a pub')
    }
    
})

module.exports = router