const express = require('express')
const router = express.Router()
const multer = require('multer')

const fixture = require('../models/fixture')
const league = require('../models/league')
const auth = require('../models/user')
const player = require('../models/player.js')
const scorecard = require('../models/scorecard.js')
const alley = require('../models/alley.js')

function requireRegisteredUser(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }
    next()
}

function isLeagueSecretary(user) {
    return user && (user.access === 'LeagueSecretary' || user.access === 'dev')
}

function isCaptainForFixture(user, fixtureInfo) {
    return !!fixtureInfo && !!user && (
        fixtureInfo.homeCaptainId === user.id ||
        fixtureInfo.awayCaptainId === user.id ||
        user.access === 'TeamCaptain' && (String(user.Team) === String(fixtureInfo.homeTeamID) || String(user.Team) === String(fixtureInfo.awayTeamID))
    )
}

function canManageScorecard(user, fixtureInfo) {
    return isLeagueSecretary(user) || isCaptainForFixture(user, fixtureInfo)
}

function canManageTeam(user, fixtureInfo, teamId) {
    if (isLeagueSecretary(user)) return true
    if (!fixtureInfo || !user) return false
    return String(teamId) === String(fixtureInfo.homeTeamID) && fixtureInfo.homeCaptainId === user.id ||
        String(teamId) === String(fixtureInfo.awayTeamID) && fixtureInfo.awayCaptainId === user.id
}

async function getTeamHandTotals(fixtureId, fixtureInfo) {
    const temporaryScores = await fixture.getAllScoresForFixture(fixtureId)
    const submittedScores = await scorecard.getScorecardsForFixture(fixtureId)
    const scoresByEntry = new Map()

    for (const entry of (temporaryScores || [])) {
        const teamId = entry.Team || entry.teamId
        const position = entry.Position
        const hand = entry.Hand
        if (teamId && hand) scoresByEntry.set(`${teamId}_${position}_${hand}`, entry)
    }
    for (const entry of (submittedScores || [])) {
        const teamId = entry.Team
        const position = entry.Position
        const hand = entry.Hand
        if (teamId && hand) scoresByEntry.set(`${teamId}_${position}_${hand}`, entry)
    }

    const totals = {}
    for (const teamId of [fixtureInfo.homeTeamID, fixtureInfo.awayTeamID]) {
        totals[teamId] = {
            name: String(teamId) === String(fixtureInfo.homeTeamID) ? fixtureInfo.homeTeam : fixtureInfo.awayTeam,
            hands: [0, 0, 0, 0, 0, 0, 0],
            grandTotal: 0
        }
    }

    for (const entry of scoresByEntry.values()) {
        const teamId = entry.Team || entry.teamId
        const team = totals[teamId]
        const hand = parseInt(entry.Hand) || 0
        if (!team || hand < 1 || hand > 7) continue
        const score = parseInt(entry.Score) || 0
        team.hands[hand - 1] += score
        team.grandTotal += score
    }

    return totals
}

// Get all fixtures.
router.get('/', async (req, res) => {
    try {
        const currentSeason = await league.getCurrentSeason()
        let fixtureList = (await fixture.getAllFixtures())
            .filter(currentFixture => !currentSeason || currentFixture.seasonId === currentSeason.id)
        const alleys = await alley.getAlleys(null)
        const selectedAlleyId = req.query.alleyId ? Number(req.query.alleyId) : null
        if (selectedAlleyId) {
            fixtureList = fixtureList.filter(currentFixture =>
                Number(currentFixture.alleyId) === selectedAlleyId
            )
        }

        // Group fixtures by competition then month.
        const groupedFixtures = fixture.groupFixturesByCompetitionAndMonth(fixtureList)
        res.render('fixtures/index', {
            user: req.session.user,
            groupedFixtures: groupedFixtures,
            alleys: alleys,
            selectedAlleyId: selectedAlleyId
        })
    } catch (err) {
        console.error(err)
        res.redirect('/')
    }
})

router.get('/live-scores', requireRegisteredUser, async (req, res) => {
    try {
        const fixtureList = await fixture.getAllFixtures()
        const scores = fixtureList.reduce((liveScores, currentFixture) => {
            liveScores[currentFixture.id] = {
                homeScore: currentFixture.homeScore,
                awayScore: currentFixture.awayScore,
                status: currentFixture.status
            }
            return liveScores
        }, {})
        res.json(scores)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Unable to load live scores' })
    }
})

router.get('/scorecard', requireRegisteredUser, async (req, res) => {
    if (req.query.gameid != null) {
        // Lookup the status of this game.
        const gameStatus = await fixture.getFixtureStatus(req.query.gameid)
        const gameInfo = await fixture.getFixtureInfo(req.query.gameid)

        // Prefer submitted scorecard entries, retaining temporary entries for in-progress teams.
        const temporaryScores = await fixture.getAllScoresForFixture(req.query.gameid)
        const submittedScores = await scorecard.getScorecardsForFixture(req.query.gameid)
        const scoresByEntry = new Map()
        for (const entry of (temporaryScores || [])) {
            scoresByEntry.set(`${entry.Team}_${entry.Position}_${entry.Hand}`, entry)
        }
        for (const entry of (submittedScores || [])) {
            scoresByEntry.set(`${entry.Team}_${entry.Position}_${entry.Hand}`, entry)
        }
        const allScores = Array.from(scoresByEntry.values())

        const playerScores = {};
        for (const s of (allScores || [])) {
            const key = `${s.Team}_${s.Position}`;
            if (!playerScores[key]) {
                playerScores[key] = {
                    teamName: s.teamName,
                    playerName: s.playerName || 'Empty/Unknown',
                    Position: s.Position,
                    hands: [0, 0, 0, 0, 0, 0, 0],
                    handBolters: [0, 0, 0, 0, 0, 0, 0],
                    handSquares: [false, false, false, false, false, false, false],
                    handFloppers: [false, false, false, false, false, false, false],
                    total: 0,
                    bolters: 0,
                    floppers: 0,
                    squares: 0,
                    chances: 0
                };
            }
            const score = parseInt(s.Score) || 0;
            // Hands should be 1-indexed up to 7, check boundary just in case
            if (s.Hand >= 1 && s.Hand <= 7) {
                playerScores[key].hands[s.Hand - 1] = score;
                playerScores[key].handBolters[s.Hand - 1] = parseInt(s.Bolters) || 0;
                playerScores[key].handSquares[s.Hand - 1] = (parseInt(s.isSquare) || 0) > 0;
                playerScores[key].handFloppers[s.Hand - 1] = (parseInt(s.isFlopper) || 0) > 0;
            }
            playerScores[key].total += score;
            playerScores[key].bolters += parseInt(s.Bolters) || 0;
            playerScores[key].floppers += parseInt(s.isFlopper) || 0;
            playerScores[key].squares += parseInt(s.isSquare) || 0;
            playerScores[key].chances += parseInt(s.isChance) || 0;
        }

        const groupedScores = Object.values(playerScores);
        // Sort by Team then Position
        groupedScores.sort((a, b) => {
            if (a.teamName !== b.teamName) {
                return (a.teamName || '').localeCompare(b.teamName || '');
            }
            return a.Position - b.Position;
        });

        const approval = await fixture.getFixtureApprovalStatus(req.query.gameid)
        res.render('fixtures/gameSummary', { gameInfo: gameInfo, user: req.session.user || req.user, scores: groupedScores, approval: approval })
    } else {
        res.send('Game ID error')
    }
})

router.get('/live', requireRegisteredUser, async (req, res) => {
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
const division = require('../models/division')
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (file.originalname.toLowerCase().endsWith('.csv')) return callback(null, true)
        callback(new Error('Please upload a CSV file.'))
    }
})

function requireFixtureUploadAccess(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }

    if (req.session.user.access !== 'dev' && req.session.user.access !== 'LeagueSecretary') {
        return res.status(403).send('You are not authorised to upload fixtures.')
    }

    next()
}

// New fixture
router.get('/new', async (req, res) => {
    const teamList = await team.getAllTeams()
    const leagues = await league.getAllLeagues()
    const selectedLeagueId = req.query.leagueId ? Number(req.query.leagueId) : (leagues.length ? leagues[0].id : null)
    const compList = selectedLeagueId ? await league.getCompetitionsForLeague(selectedLeagueId) : []
    const seasonList = selectedLeagueId ? await league.getSeasonsForLeague(selectedLeagueId) : []
    res.render('fixtures/new', { teamList, compList, seasonList, leagues, selectedLeagueId })
})

router.get('/bulk-upload', requireFixtureUploadAccess, (req, res) => {
    res.render('fixtures/bulkUpload', { imported: null, errors: [] })
})

router.post('/bulk-upload', requireFixtureUploadAccess, (req, res, next) => {
    csvUpload.single('fixturesCsv')(req, res, async err => {
        if (err) {
            return res.status(400).render('fixtures/bulkUpload', {
                imported: null,
                errors: [err.message]
            })
        }

        if (!req.file) {
            return res.status(400).render('fixtures/bulkUpload', {
                imported: null,
                errors: ['Select a CSV file to upload.']
            })
        }

        try {
            const currentSeason = await league.getCurrentSeason()
            if (!currentSeason) {
                return res.status(400).render('fixtures/bulkUpload', {
                    imported: null,
                    errors: ['Create an active league season before uploading fixtures.']
                })
            }

            const currentCompetitions = await league.getCompetitionsForLeague(currentSeason.leagueId)
            const competitionIds = currentCompetitions.reduce((ids, currentCompetition) => {
                    ids[currentCompetition.id] = currentCompetition.id
                    return ids
                }, {})
            const competitionModel = {
                getCompetitionByName: name => league.getCompetitionByName(currentSeason.leagueId, name)
            }

            const result = await fixture.importFixturesFromCSVContent(
                req.file.buffer.toString('utf8'),
                competitionIds,
                competitionModel,
                team,
                currentSeason.id,
                currentSeason.leagueId
            )

            if (result.errors.length) {
                return res.status(400).render('fixtures/bulkUpload', result)
            }

            res.render('fixtures/bulkUpload', result)
        } catch (error) {
            next(error)
        }
    })
})

router.post('/', async (req, res) => {
    const homeTeam = req.body.homeTeam ? Number(req.body.homeTeam) : null
    const awayTeam = req.body.awayTeam ? Number(req.body.awayTeam) : null
    const matchDate = req.body.matchDate
    const leagueId = req.body.leagueId ? Number(req.body.leagueId) : null
    const comp = req.body.comp ? Number(req.body.comp) : null
    const seasonId = req.body.seasonId ? Number(req.body.seasonId) : null

    if ((!homeTeam && !awayTeam) || !matchDate || !comp) {
        return res.status(400).send('At least one team, match date, and competition are required.')
    }

    try {
        await fixture.createFixture(homeTeam, awayTeam, matchDate, comp, null, seasonId, null, leagueId)
        res.redirect('/fixtures')
    } catch (err) {
        console.error(err)
        res.status(500).send('Unable to create fixture.')
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

    if (req.query.gameid && req.session.user.gamesInProgress &&
        String(req.session.user.gamesInProgress) !== String(fixtureID)) {
        req.session.teamSheet = null
        req.session.user.gamesInProgress = fixtureID
    }

    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)
    if (!fixtureInfo) {
        res.redirect('/fixtures')
        return
    }
    if (!canManageScorecard(req.session.user, fixtureInfo)) {
        return res.status(403).send('Only captains or the league secretary can edit scorecards.')
    }

    if (!req.session.user.gamesInProgress) {
        req.session.user.gamesInProgress = fixtureID
        req.session.save()
    }

    const userid = req.session.user.id || 1
    let savedScores = await fixture.getTempScoresForUser(fixtureID, userid)
    if (savedScores.length > 0) {
        req.session.user.Team = savedScores[0].Team
    } else if (isLeagueSecretary(req.session.user)) {
        req.session.user.Team = req.session.user.Team &&
            (String(req.session.user.Team) === String(fixtureInfo.homeTeamID) || String(req.session.user.Team) === String(fixtureInfo.awayTeamID))
            ? req.session.user.Team : fixtureInfo.homeTeamID
    } else if (!canManageTeam(req.session.user, fixtureInfo, req.session.user.Team)) {
        req.session.user.Team = fixtureInfo.homeCaptainId === req.session.user.id
            ? fixtureInfo.homeTeamID : fixtureInfo.awayTeamID
    }

    if (savedScores.length === 0 && req.session.user.Team) {
        const submittedScores = await scorecard.getScorecardsForFixture(fixtureID)
        savedScores = (submittedScores || [])
            .filter(entry => String(entry.Team) === String(req.session.user.Team))
            .map(entry => ({
                Hand: entry.Hand,
                Team: entry.Team,
                Player: entry.Player,
                Position: entry.Position,
                Score: entry.Score,
                Bolters: entry.Bolters,
                isFlopper: entry.isFlopper,
                isSquare: entry.isSquare,
                isChance: entry.isChance
            }))
    }
    const resumeHand = savedScores.reduce((highestHand, savedScore) => {
        return Math.max(highestHand, parseInt(savedScore.Hand) || 0)
    }, 1)

    if (!req.session.teamSheet) {
        if (savedScores.length > 0) {
            req.session.teamSheet = Array(8).fill('null')
            savedScores.forEach(savedScore => {
                if (savedScore.Position >= 0 && savedScore.Position < 8 && savedScore.Player) {
                    req.session.teamSheet[savedScore.Position] = String(savedScore.Player)
                }
            })
            req.session.user.Team = savedScores[0].Team
            req.session.save()
        } else {
            res.redirect('/fixtures/scorecard/new/team')
            return
        }
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
    const teamHandTotals = await getTeamHandTotals(fixtureID, fixtureInfo)

    res.render('fixtures/scorecard', {
        fixtureInfo: fixtureInfo,
        players: mappedPlayers,
        savedScores: savedScores,
        resumeHand: resumeHand,
        teamHandTotals: teamHandTotals,
        currentTeamId: req.session.user.Team
    })
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
    if (!canManageScorecard(req.session.user, fixtureInfo)) {
        return res.status(403).send('Only captains or the league secretary can edit scorecards.')
    }

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
    if (!canManageTeam(req.session.user, fixtureInfo, targetTeamId)) {
        return res.status(403).send('You cannot manage the selected team.')
    }

    req.session.teamSheet = null

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
    if (!req.session.user) return res.redirect('/users/login')
    const fixtureID = req.session.user.gamesInProgress
    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)
    let targetTeamId = req.session.user.Team
    if (!canManageTeam(req.session.user, fixtureInfo, targetTeamId)) {
        return res.status(403).send('You cannot manage the selected team.')
    }
    req.session.teamSheet = req.body.player
    req.session.save()

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

    let savedScores = await fixture.getTempScoresForUser(fixtureID, req.session.user.id || 1)
    savedScores = savedScores.filter(entry => String(entry.Team) === String(targetTeamId))
    if (savedScores.length === 0) {
        const submittedScores = await scorecard.getScorecardsForFixture(fixtureID)
        savedScores = (submittedScores || [])
            .filter(entry => String(entry.Team) === String(targetTeamId))
            .map(entry => ({
                Hand: entry.Hand,
                Team: entry.Team,
                Player: entry.Player,
                Position: entry.Position,
                Score: entry.Score,
                Bolters: entry.Bolters,
                isFlopper: entry.isFlopper,
                isSquare: entry.isSquare,
                isChance: entry.isChance
            }))
        if (savedScores.length > 0) {
            req.session.teamSheet = Array(8).fill('null')
            savedScores.forEach(savedScore => {
                if (savedScore.Position >= 0 && savedScore.Position < 8 && savedScore.Player) {
                    req.session.teamSheet[savedScore.Position] = String(savedScore.Player)
                }
            })
            req.session.save()
        }
    }
    const resumeHand = savedScores.reduce((highestHand, savedScore) => {
        return Math.max(highestHand, parseInt(savedScore.Hand) || 0)
    }, 1)
    const teamHandTotals = await getTeamHandTotals(fixtureID, fixtureInfo)

    res.render('fixtures/scorecard', {
        teamSheet: req.session.teamSheet,
        players: mappedPlayers,
        fixtureInfo: fixtureInfo,
        savedScores: savedScores,
        resumeHand: resumeHand,
        teamHandTotals: teamHandTotals,
        currentTeamId: targetTeamId
    })
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
        if (!canManageTeam(req.session.user, fixtureInfo, teamid)) {
            return res.status(403).send('You cannot enter scores for this team.')
        }
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
                    bolters: bVal,
                    isFlopper: req.body[`flopper${handNumber}_${playerIndex}`] ? 1 : 0,
                    isSquare: req.body[`square${handNumber}_${playerIndex}`] ? 1 : 0,
                    isChance: req.body[`chance${handNumber}_${playerIndex}`] ? 1 : 0
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

        const newStatus = fixtureInfo.status === 'Confirmed'
            ? 'Confirmed'
            : ((homeScore !== null && awayScore !== null) ? 'Provisional' : 'In Progress')
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

router.post('/scorecard/approve', async (req, res) => {
    if (!req.session.user) return res.redirect('/users/login')

    try {
        const fixtureInfo = await fixture.getFixtureInfo(req.body.gameid)
        const userId = req.session.user.id
        const teamId = fixtureInfo && fixtureInfo.homeCaptainId === userId
            ? fixtureInfo.homeTeamID
            : fixtureInfo && fixtureInfo.awayCaptainId === userId
                ? fixtureInfo.awayTeamID
                : null
        if (!teamId) return res.status(403).send('Only the assigned team captain can approve these scores.')

        await fixture.approveFixture(req.body.gameid, teamId, userId)
        res.redirect(`/fixtures/scorecard?gameid=${encodeURIComponent(req.body.gameid)}`)
    } catch (error) {
        console.error(error)
        res.status(400).send(error.message)
    }
})

router.post('/scorecard/confirm', async (req, res) => {
    if (!req.session.user) return res.redirect('/users/login')
    if (req.session.user.access !== 'dev' && req.session.user.access !== 'LeagueSecretary') {
        return res.status(403).send('Only a league secretary can confirm scores.')
    }

    try {
        await fixture.finaliseFixture(req.body.gameid)
        res.redirect(`/fixtures/scorecard?gameid=${encodeURIComponent(req.body.gameid)}`)
    } catch (error) {
        console.error(error)
        res.status(400).send(error.message)
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
        const fixtureInfo = await fixture.getFixtureInfo(gameid)
        if (!canManageTeam(req.session.user, fixtureInfo, teamid)) {
            return res.status(403).send("Unauthorized");
        }
        const { handNumber, playerIndex, score, bolters, isFlopper, isSquare, isChance } = req.body;

        let playerId = null;
        if (req.session.teamSheet && req.session.teamSheet[playerIndex]) {
            playerId = req.session.teamSheet[playerIndex] === 'null' ? null : parseInt(req.session.teamSheet[playerIndex]);
        }

        await fixture.saveTempScore(gameid, userid, handNumber, teamid, playerId, playerIndex, score || 0, bolters || 0, isFlopper ? 1 : 0, isSquare ? 1 : 0, isChance ? 1 : 0);
        res.status(200).send("Saved");
    } catch (err) {
        console.error("Error saving score", err);
        res.status(500).send("Error");
    }
})

module.exports = router