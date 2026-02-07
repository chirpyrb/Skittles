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


//const flash = require('express-flash')


//const sqlite3 = require('sqlite3').verbose()
//const SQ3 = require('./models/sql')
//const db = new sqlite3.Database("./skittles.sql3")

//const passport = require('passport')
//const initPassport = require('./passport-config')
//initPassport(passport,
//    async userName => { return await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Users WHERE userName = ?', userName) }, 
//    async id => { return await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Users WHERE id = ?', id) }
//)

// Use the view-engine
app.set('view engine', 'ejs')
app.set('views', __dirname + '/views')
app.set('layout', 'layouts/layout')

app.use(expressLayouts)
app.use(express.static('public'))
app.use(bodyParser.urlencoded({limit: '10mb', extended: false}))

// Use the auth
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))

//app.use(flash())
//app.use(passport.initialize())
//app.use(passport.session())

// Create a table, if we havent already.
//db.run('CREATE TABLE IF NOT EXISTS Pubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')

const indexRouter = require('./routes/index')
const pubRouter = require('./routes/pubs')
const teamsRouter = require('./routes/teams')
const alleysRouter = require('./routes/alleys')
const divRouter = require('./routes/divisions')
const playerRouter = require('./routes/players')
const seasonsRouter = require('./routes/competitions')
const fixtureRouter = require('./routes/fixtures')


app.use('/', indexRouter)
app.use('/teams', teamsRouter)
app.use('/pubs', pubRouter)
app.use('/alleys', alleysRouter)
app.use('/divisions', divRouter)
app.use('/players', playerRouter)
app.use('/competitions', seasonsRouter)
app.use('/fixtures', fixtureRouter)
app.use('/users', require('./routes/users'))

https.createServer(secOpts, app).listen(process.env.PORT, () => {
    console.log(`HTTPS Server running on https://localhost:${process.env.PORT}`)
})