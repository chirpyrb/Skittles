const express = require('express')
const router = express.Router()

const fixture = require('../models/fixture')
const auth = require('../models/user')
const player = require('../models/player.js')

// Get all fixtures.
router.get('/', async (req, res) => {
    try {
        const fixtureList = await fixture.getAllFixtures()
        if (fixtureList != null) {
            res.render('fixtures/index', {user: req.session.user, fixtureList: fixtureList})
        } else{
            res.render('fixtures/index')
        }
    } catch (err) {
        console.error(err)
        res.redirect('/')
    }
    
})

router.get('/scorecard', async (req, res) => {
    if (req.query.gameid != null) {
        // Lookup the status of this game.
        const gameStatus = await fixture.getFixtureStatus(req.query.gameid)
        const gameInfo = await fixture.getFixtureInfo(req.query.gameid)
        // const homeTeamPlayerList = await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Players INNER JOIN Teams')
        res.render('fixtures/gameSummary', {gameInfo: gameInfo, user: req.user})
    } else {
        res.send('Game ID error')
    }
})

router.get('/live', async (req, res) => {
    // TODO Check the user is allowed to do this.
    const gameInfo = await fixture.getFixtureInfo(req.query.gameid)
    console.log(gameInfo)
    if (true) {
        const gameStatus = await fixture.getFixtureStatus(req.query.gameid)
        if (gameStatus != "Live") {
            // Begin the game.
            const result = await fixture.beginGame(req.query.gameid, req.session.user)
        } else {
            const players = await player.getPlayerListForTeam(gameInfo.awayTeamID)
            console.log(players)
            const scorecardInfo = {
                playerList: players
            }
            res.render('fixtures/_scorecard', {scoreCardInfo: scorecardInfo})
        }

        
    } else {
        res.render('fixtures/gameSummary', {gameInfo: gameInfo, user: req.user})
    }
})

// New fixture
router.get('/new', async (req, res) => {
    const teamList = await SQ3.fetchAll(db, 'SELECT * FROM Teams')
    const compList = await SQ3.fetchAll(db, 'SELECT * FROM Competitions')
    res.render('fixtures/new', {teamList: teamList, compList: compList})
})

router.post('/', async (req, res) => {
    const homeTeam = req.body.homeTeam
    const awayTeam = req.body.awayTeam
    const matchDate = req.body.matchDate
    const comp = req.body.comp
    console.log(homeTeam, awayTeam, matchDate)
    try {
        await SQ3.execute(db, 'INSERT INTO Fixtures(homeTeam,awayTeam,matchDate,competition) VALUES (?,?,?,?);', [homeTeam, awayTeam, matchDate, comp])
        res.redirect('/fixtures')
    } catch (err) {
        console.error(err)
    }
})

router.get('/scorecard/new', async (req, res) => {
    
    // Get the info of the fixture being managed.
    const fixtureID = req.query.gameid;
    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)
    const homeSquad = await player.getPlayerListForTeam(fixtureInfo.homeTeamID)
    const awaysquad = await player.getPlayerListForTeam(fixtureInfo.awayTeamID)

    // Check that the User is a member of one of the teams.
    // if (req.session.user.teamID == fixtureInfo.homeTeamID) {
    // const plyerList = homeSquad
    // } || req.session.user.teamID != fixtureInfo.awayTeamID)
    // Assume for now, they are.

    // Show the set team page.

    res.render('fixtures/scorecard', {fixtureInfo: fixtureInfo, playerList: awaysquad})


})

router.post('/scorecard', async (req, res) => {
    console.log("gamedata:", req.body)
    res.send(req.body)
})

router.post('/scorecard/team', async (req, res) => {

    // Submit the team sheet before starting the fixture.
    
})

module.exports = router