// Init the .env variables
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

// Init Express
const express = require('express')
const app = express()

// HTTPS Init
const fs = require('fs')
const https = require('https')
const secOpts = {
    key: fs.readFileSync("key.pem"),
    cert: fs.readFileSync("cert.pem")
}

// Init authorisation middleware
const bcrypt = require('bcrypt')
const session = require('express-session')

// Init views middleware
const expressLayouts = require('express-ejs-layouts')
const bodyParser = require('body-parser')

// Use the view-engine
app.set('view engine', 'ejs')
app.set('views', __dirname + '/views')
app.set('layout', 'layouts/layout')

app.use(expressLayouts)
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ limit: '10mb', extended: false }))
app.use(bodyParser.json())

// Use the auth
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))

app.use((req, res, next) => {
    res.locals.user = req.session ? req.session.user : null
    next()
})

app.get('/health', (req, res) => res.status(200).send('ok'))

const indexRouter = require('./routes/index')
const pubRouter = require('./routes/pubs')
const teamsRouter = require('./routes/teams')
const alleysRouter = require('./routes/alleys')
const divRouter = require('./routes/divisions')
const playerRouter = require('./routes/players')
const seasonsRouter = require('./routes/competitions')
const fixtureRouter = require('./routes/fixtures')
const leagueRouter = require('./routes/leagues')
const SQ3 = require('./models/sql')


app.use('/', indexRouter)
app.use('/teams', teamsRouter)
app.use('/pubs', pubRouter)
app.use('/alleys', alleysRouter)
app.use('/divisions', divRouter)
app.use('/players', playerRouter)
app.use('/competitions', seasonsRouter)
app.use('/fixtures', fixtureRouter)
app.use('/leagues', leagueRouter)
app.use('/users', require('./routes/users'))

async function initDatabase() {
    // Create all persistent tables in one schema batch.
    await SQ3.initSchema()

    // Add indexes after all referenced tables have been created.
    await SQ3.initPerformanceIndexes()
}

// Start the HTTPS server only after database initialization succeeds.
initDatabase()
    .then(() => {
        // Bind the application to the configured HTTPS port.
        https.createServer(secOpts, app).listen(process.env.PORT, () => {
            console.log(`HTTPS Server running on https://localhost:${process.env.PORT}`)
        })
    })
    .catch(error => {
        // Prevent the server from running against an incomplete database.
        console.error('Database initialization failed:', error)
        process.exitCode = 1
    })