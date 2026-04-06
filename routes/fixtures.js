const express = require('express')
const router = express.Router()

const fixture = require('../models/fixture')
const auth = require('../models/user')
const player = require('../models/player.js')

// Get all fixtures.
router.get('/', async (req, res) => {
    try {
        // Get all fixtures.
        const fixtureList = await fixture.getAllFixtures()

        // Sort fixtures by date.
        const groupedFixtures = fixture.groupFixturesByMonth(fixtureList)
        res.render('fixtures/index', { user: req.session.user, groupedFixtures: groupedFixtures })
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

        // Fetch provisional/saved scores across all hands and users for this game
        const allScores = await fixture.getAllScoresForFixture(req.query.gameid)

        const playerScores = {};
        for (const s of (allScores || [])) {
            const key = `${s.Team}_${s.Position}`;
            if (!playerScores[key]) {
                playerScores[key] = {
                    teamName: s.teamName,
                    playerName: s.playerName || 'Empty/Unknown',
                    Position: s.Position,
                    hands: [0, 0, 0, 0, 0, 0, 0],
                    total: 0
                };
            }
            const score = parseInt(s.Score) || 0;
            // Hands should be 1-indexed up to 7, check boundary just in case
            if (s.Hand >= 1 && s.Hand <= 7) {
                playerScores[key].hands[s.Hand - 1] = score;
            }
            playerScores[key].total += score;
        }

        const groupedScores = Object.values(playerScores);
        // Sort by Team then Position
        groupedScores.sort((a, b) => {
            if (a.teamName !== b.teamName) {
                return (a.teamName || '').localeCompare(b.teamName || '');
            }
            return a.Position - b.Position;
        });

        res.render('fixtures/gameSummary', { gameInfo: gameInfo, user: req.user, scores: groupedScores })
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
            res.render('fixtures/_scorecard', { scoreCardInfo: scorecardInfo })
        }


    } else {
        res.render('fixtures/gameSummary', { gameInfo: gameInfo, user: req.user })
    }
})

const team = require('../models/team')
const competition = require('../models/competition')

// New fixture
router.get('/new', async (req, res) => {
    const teamList = await team.getAllTeams()
    const compList = await competition.getAllCompetitions()
    res.render('fixtures/new', { teamList: teamList, compList: compList })
})

router.post('/', async (req, res) => {
    const homeTeam = req.body.homeTeam
    const awayTeam = req.body.awayTeam
    const matchDate = req.body.matchDate
    const comp = req.body.comp
    console.log(homeTeam, awayTeam, matchDate)
    try {
        await fixture.createFixture(homeTeam, awayTeam, matchDate, comp)
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
    res.render('fixtures/scorecard', { fixtureInfo: fixtureInfo, playerList: awaysquad })
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
    res.render('fixtures/scorecard/setTeam', { playerList: teamList })
})

router.post('/scorecard/new/team', async (req, res) => {
    // Get the team sheet data from the form.
    console.log(req.body.player)

    // TODO Validate the data, check the players are in the team, etc.

    // Save the team sheet data to the session for now, but this should be saved to the database.
    req.session.teamSheet = req.body.player
    req.session.save()

    const allPlayers = await player.getPlayerListForTeam(req.session.user.Team)
    const mappedPlayers = req.session.teamSheet.map(id => {
        if (id === 'null' || !id) return { alias: 'Empty' }
        return allPlayers.find(p => p.id == id) || { alias: 'Unknown' }
    })

    res.render('fixtures/scorecard', { teamSheet: req.session.teamSheet, players: mappedPlayers })
})

router.post('/scorecard', async (req, res) => {
    console.log("gamedata:", req.body)
    res.send(req.body)
})

router.post('/scorecard/team', async (req, res) => {

    // Submit the team sheet before starting the fixture.

})

router.post('/scorecard/entry', async (req, res) => {
    // Save an individual entry to the temporary table
    if (!req.session.user || !req.session.user.gamesInProgress) {
        return res.status(401).send("Unauthorized");
    }

    try {
        const gameid = req.session.user.gamesInProgress;
        const userid = req.session.user.id || req.user.id;
        const teamid = req.session.user.Team;
        const { handNumber, playerIndex, score, bolters } = req.body;

        let playerId = null;
        if (req.session.teamSheet && req.session.teamSheet[playerIndex]) {
            playerId = req.session.teamSheet[playerIndex] === 'null' ? null : parseInt(req.session.teamSheet[playerIndex]);
        }

        await fixture.saveTempScore(gameid, userid, handNumber, teamid, playerId, playerIndex, score || 0, bolters || 0);
        res.status(200).send("Saved");
    } catch (err) {
        console.error("Error saving score", err);
        res.status(500).send("Error");
    }
})

module.exports = router