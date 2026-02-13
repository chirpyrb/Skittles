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

    // Check that the User is logged in.
    if (req.session.user == null) {
        console.log("User not logged in")
        console.log(req.url)
        req.session.returnTo = '/fixtures' + req.url
        res.redirect('/users/login')
        return
    }

    console.log('2', req.session.user)
    // Check that the User is a captain of one of the teams in the fixture.
    if (!auth.userPermissions(req.session.user.userName, "dev")) {
        console.log("User doesn't have permissions to manage fixtures")
        res.redirect('/users/login')
        return
    }
  
    // Check that the User hasn't started a fixture already.
    if (req.session.user.gamesInProgress == null) {
        // No fixtures in progress, so they haven't started this one.
        // Get the info of the fixture being managed.
        const fixtureID = req.query.gameid
        const fixtureInfo = await fixture.getFixtureInfo(fixtureID)

        // Check which team the User plays for, and that they are a captain of that team.
        if (req.session.user.Team == fixtureInfo.homeTeamID) {
            console.log("User is home team captain")
            // User is home team captain.
            req.session.user.gamesInProgress = fixtureID
            req.session.save()
            res.redirect('/fixtures/scorecard/new/team')
            return
        } else if (req.session.user.Team == fixtureInfo.awayTeamID) {
            // User is away team captain.
            console.log("User is away team captain")
            req.session.user.gamesInProgress = fixtureID
            req.session.save()
            res.redirect('/fixtures/scorecard/new/team')
            return
        } else {
            // User isn't a captain of either team, so they can't manage this fixture.
            console.log("User isn't a captain of either team, so they can't manage this fixture.")
            res.redirect('/users/login')
            return
        }
    } else {
    }
    // Show the set team page.
    res.render('fixtures/scorecard', {fixtureInfo: fixtureInfo, playerList: awaysquad})
})

router.get('/scorecard/new/team', async (req, res) => {

    // Check that the User is logged in.
    if (req.session.user == null) {
        res.redirect('/users/login')
        return
    }

    if (req.session.user.gamesInProgress == null) {
        console.log("User doesn't have a game in progress")
        res.redirect('/fixtures')
        return
    }   

    // Get the player list for the user's team.
    const teamList = await player.getPlayerListForTeam(req.session.user.Team)
    res.render('fixtures/scorecard/setTeam', {playerList: teamList})
})

router.post('/scorecard/new/team', async (req, res) => {
    // Get the team sheet data from the form.
    console.log(req.body.player)

    // TODO Validate the data, check the players are in the team, etc.

    // Save the team sheet data to the session for now, but this should be saved to the database.
    req.session.teamSheet = req.body.player
    req.session.save()

    res.render('fixtures/scorecard', {teamSheet: req.session.teamSheet})
})

router.post('/scorecard', async (req, res) => {
    console.log("gamedata:", req.body)
    res.send(req.body)
})

router.post('/scorecard/team', async (req, res) => {

    // Submit the team sheet before starting the fixture.
    
})

module.exports = router