const express = require('express')
const router = express.Router()

const fixture = require('../models/fixture')
const auth = require('../models/user')
const player = require('../models/player.js')
const scorecard = require('../models/scorecard.js')

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

        res.render('fixtures/gameSummary', { gameInfo: gameInfo, user: req.session.user || req.user, scores: groupedScores })
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
    if (req.session.user == null) {
        req.session.returnTo = '/fixtures' + req.url
        res.redirect('/users/login')
        return
    }

    const fixtureID = req.query.gameid || req.session.user.gamesInProgress
    if (!fixtureID) {
        res.redirect('/fixtures')
        return
    }

    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)
    if (!fixtureInfo) {
        res.redirect('/fixtures')
        return
    }

    if (!req.session.user.gamesInProgress) {
        req.session.user.gamesInProgress = fixtureID
        req.session.save()
    }

    if (!req.session.teamSheet) {
        res.redirect('/fixtures/scorecard/new/team')
        return
    }

    const allPlayers = await player.getPlayerListForTeam(req.session.user.Team)
    const mappedPlayers = req.session.teamSheet.map(id => {
        if (id === 'null' || !id) return { alias: 'Empty' }
        return allPlayers.find(p => p.id == id) || { alias: 'Unknown' }
    })

    res.render('fixtures/scorecard', { fixtureInfo: fixtureInfo, players: mappedPlayers })
})

router.get('/scorecard/new/team', async (req, res) => {
    if (req.session.user == null) {
        res.redirect('/users/login')
        return
    }

    if (req.session.user.gamesInProgress == null) {
        res.redirect('/fixtures')
        return
    }

    const fixtureID = req.session.user.gamesInProgress
    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)

    let targetTeamId = null
    if (req.query.teamType === 'away') {
        targetTeamId = fixtureInfo ? fixtureInfo.awayTeamID : null
    } else if (req.query.teamType === 'home') {
        targetTeamId = fixtureInfo ? fixtureInfo.homeTeamID : null
    } else if (req.query.teamId) {
        targetTeamId = parseInt(req.query.teamId)
    }

    if (!targetTeamId && req.session.user.Team) {
        targetTeamId = req.session.user.Team
    }

    if (!targetTeamId) {
        const linkedPlayer = await auth.getPlayerForUser(req.session.user.userName)
        if (linkedPlayer && linkedPlayer.team) {
            targetTeamId = linkedPlayer.team
        }
    }

    if (!targetTeamId && fixtureInfo) {
        targetTeamId = fixtureInfo.homeTeamID
    }

    req.session.user.Team = targetTeamId
    req.session.save()

    let teamList = targetTeamId ? await player.getPlayerListForTeam(targetTeamId) : []
    if ((!teamList || teamList.length === 0) && fixtureInfo) {
        teamList = await player.getPlayerListForTeam(fixtureInfo.homeTeamID)
        if (!teamList || teamList.length === 0) {
            teamList = await player.getPlayerListForTeam(fixtureInfo.awayTeamID)
        }
    }

    res.render('fixtures/scorecard/setTeam', { playerList: teamList, fixtureInfo: fixtureInfo, targetTeamId: targetTeamId, user: req.session.user })
})

router.post('/scorecard/new/team', async (req, res) => {
    req.session.teamSheet = req.body.player
    req.session.save()

    const fixtureID = req.session.user.gamesInProgress
    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)

    let targetTeamId = req.session.user.Team
    if (!targetTeamId && fixtureInfo) {
        targetTeamId = fixtureInfo.homeTeamID
    }

    let allPlayers = targetTeamId ? await player.getPlayerListForTeam(targetTeamId) : []
    if ((!allPlayers || allPlayers.length === 0) && fixtureInfo) {
        allPlayers = await player.getPlayerListForTeam(fixtureInfo.homeTeamID)
        if (!allPlayers || allPlayers.length === 0) {
            allPlayers = await player.getAllPlayers()
        }
    }

    const rawSheet = Array.isArray(req.session.teamSheet) ? req.session.teamSheet : [req.session.teamSheet]
    const mappedPlayers = rawSheet.map(id => {
        if (id === 'null' || !id) return { alias: 'Empty' }
        return allPlayers.find(p => p.id == id) || { alias: 'Unknown' }
    })

    res.render('fixtures/scorecard', { teamSheet: req.session.teamSheet, players: mappedPlayers, fixtureInfo: fixtureInfo })
})

router.post('/scorecard', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/users/login')
    }

    const gameid = req.session.user.gamesInProgress || req.query.gameid || req.body.gameid
    if (!gameid) {
        return res.redirect('/fixtures')
    }

    const teamid = req.session.user.Team
    const userid = req.session.user.id || 1

    try {
        const fixtureInfo = await fixture.getFixtureInfo(gameid)
        const playerScores = []
        let teamTotalScore = 0

        for (let playerIndex = 0; playerIndex < 8; playerIndex++) {
            let playerId = null
            if (req.session.teamSheet && req.session.teamSheet[playerIndex]) {
                const rawId = req.session.teamSheet[playerIndex]
                playerId = (rawId === 'null' || !rawId) ? null : parseInt(rawId)
            }

            for (let handNumber = 1; handNumber <= 7; handNumber++) {
                const sKey = `score${handNumber}_${playerIndex}`
                const bKey = `bolters${handNumber}_${playerIndex}`

                const sVal = parseInt(req.body[sKey]) || 0
                const bVal = parseInt(req.body[bKey]) || 0

                teamTotalScore += sVal

                playerScores.push({
                    playerIndex: playerIndex,
                    playerId: playerId,
                    handNumber: handNumber,
                    score: sVal,
                    bolters: bVal
                })
            }
        }

        await scorecard.saveFinalScores(gameid, teamid, userid, playerScores)

        let homeScore = fixtureInfo ? fixtureInfo.homeScore : null
        let awayScore = fixtureInfo ? fixtureInfo.awayScore : null

        if (fixtureInfo && teamid == fixtureInfo.homeTeamID) {
            homeScore = teamTotalScore
        } else if (fixtureInfo && teamid == fixtureInfo.awayTeamID) {
            awayScore = teamTotalScore
        } else {
            if (homeScore === null || homeScore === undefined) homeScore = teamTotalScore
        }

        const newStatus = (homeScore !== null && awayScore !== null) ? 'Completed' : 'In Progress'
        await fixture.updateFixtureScore(gameid, homeScore, awayScore, newStatus)

        req.session.user.gamesInProgress = null
        req.session.teamSheet = null
        req.session.save()

        res.redirect(`/fixtures/scorecard?gameid=${gameid}`)
    } catch (err) {
        console.error("Error submitting scorecard:", err)
        res.redirect('/fixtures')
    }
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