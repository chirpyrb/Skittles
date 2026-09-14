const express = require('express')
const router = express.Router()

const pub = require('../models/pub')
const bulkImport = require('../models/bulkImport')

function requireDirectoryManagementAccess(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }
    if (!['dev', 'LeagueSecretary', 'TeamSecratary', 'TeamSecretary'].includes(req.session.user.access)) {
        return res.status(403).send('You are not authorised to edit pub details.')
    }
    next()
}

// Get all pubs.
router.get('/', async (req, res) => {
    console.log(req.session.user)
    let pubList = []
    if (req.query.pubSearchName != null && req.query.pubSearchName !== '') {
        pubList = await pub.searchPubList(req.query.pubSearchName)
    } else {
        pubList = await pub.getAllPubs();
    }

    try {
        res.render('pubs/index', { pubListArray: pubList, user: req.session.user })
    } catch (err) {
        res.redirect('/')
    }

})

// New teams
router.get('/new', (req, res) => {
    res.render('pubs/new', { newName: { name: '', location: '' } })
})

router.get('/edit/:id', requireDirectoryManagementAccess, async (req, res) => {
    const pubInfo = await pub.getPubById(req.params.id)
    if (!pubInfo) return res.status(404).send('Pub not found')
    res.render('pubs/edit', { pub: pubInfo })
})

router.post('/edit/:id', requireDirectoryManagementAccess, async (req, res) => {
    const name = String(req.body.name || '').trim()
    const location = String(req.body.location || '').trim()
    if (!name || !location) return res.status(400).send('A pub name and location are required.')
    try {
        await pub.updatePub(req.params.id, name, location)
        res.redirect('/pubs')
    } catch (error) {
        console.error(error)
        res.status(400).send('Unable to update pub details.')
    }
})

router.get('/bulk-upload', bulkImport.requireBulkUploadAccess, (req, res) => {
    res.render('pubs/bulkUpload', { imported: null, errors: [] })
})

router.post('/bulk-upload', bulkImport.requireBulkUploadAccess, (req, res, next) => {
    bulkImport.csvUpload.single('csvFile')(req, res, async error => {
        if (error || !req.file) return res.status(400).render('pubs/bulkUpload', { imported: null, errors: [error ? error.message : 'Select a CSV file.'] })
        try {
            const result = await bulkImport.importPubs(req.file.buffer.toString('utf8'))
            res.status(result.errors.length ? 400 : 200).render('pubs/bulkUpload', result)
        } catch (err) { next(err) }
    })
})

// Create team.
router.post('/', async (req, res) => {
    const newPubName = String(req.body.newName || '').trim()
    const location = String(req.body.location || '').trim()
    if (!newPubName || !location) return res.status(400).send('A pub name and location are required.')
    try {
        await pub.createPub(newPubName, location)
        res.redirect('/pubs')
    } catch {
        res.send('Error creating a pub')
    }

})

module.exports = router