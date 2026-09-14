const express = require('express')
const router = express.Router()

const alley = require('../models/alley')
const pub = require('../models/pub')
const bulkImport = require('../models/bulkImport')

function requireDirectoryManagementAccess(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }
    if (!['dev', 'LeagueSecretary', 'TeamSecratary', 'TeamSecretary'].includes(req.session.user.access)) {
        return res.status(403).send('You are not authorised to edit alley details.')
    }
    next()
}

// Get all alleys.
router.get('/', async (req, res) => {
    try {
        const alleyList = await alley.getAlleys(req.query.alleySearchName)
        res.render('alleys/index', { alleyListArray: alleyList, user: req.session.user })
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

router.get('/edit/:id', requireDirectoryManagementAccess, async (req, res) => {
    const alleyInfo = await alley.getAlleyById(req.params.id)
    if (!alleyInfo) return res.status(404).send('Alley not found')
    const pubList = await pub.getAllPubs()
    res.render('alleys/edit', { alley: alleyInfo, pubListArray: pubList })
})

router.post('/edit/:id', requireDirectoryManagementAccess, async (req, res) => {
    const name = String(req.body.name || '').trim()
    const pubId = Number(req.body.pub)
    if (!name || !Number.isInteger(pubId)) return res.status(400).send('Alley name and pub are required.')
    try {
        await alley.updateAlley(req.params.id, name, pubId)
        res.redirect('/alleys')
    } catch (error) {
        console.error(error)
        res.status(400).send('Unable to update alley details.')
    }
})

router.get('/bulk-upload', bulkImport.requireBulkUploadAccess, (req, res) => {
    res.render('alleys/bulkUpload', { imported: null, errors: [] })
})

router.post('/bulk-upload', bulkImport.requireBulkUploadAccess, (req, res, next) => {
    bulkImport.csvUpload.single('csvFile')(req, res, async error => {
        if (error || !req.file) return res.status(400).render('alleys/bulkUpload', { imported: null, errors: [error ? error.message : 'Select a CSV file.'] })
        try {
            const result = await bulkImport.importAlleys(req.file.buffer.toString('utf8'))
            res.status(result.errors.length ? 400 : 200).render('alleys/bulkUpload', result)
        } catch (err) { next(err) }
    })
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