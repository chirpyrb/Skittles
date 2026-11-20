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

async function isTeamMember(user, teamId) {
    if (!user || !teamId) return false
    const linkedPlayer = await auth.getPlayerForUser(user.userName)
    return !!linkedPlayer && String(linkedPlayer.team) === String(teamId)
}

function isCaptainForTeam(user, fixtureInfo, teamId) {
    if (!fixtureInfo || !user) return false
    return String(teamId) === String(fixtureInfo.homeTeamID) && String(fixtureInfo.homeCaptainId) === String(user.id) ||
        String(teamId) === String(fixtureInfo.awayTeamID) && String(fixtureInfo.awayCaptainId) === String(user.id) ||
        user.access === 'TeamCaptain' && String(user.Team) === String(teamId)
}

async function canManageTeam(user, fixtureInfo, teamId) {
    if (isLeagueSecretary(user)) return true
    if (!fixtureInfo || !user ||
        String(teamId) !== String(fixtureInfo.homeTeamID) && String(teamId) !== String(fixtureInfo.awayTeamID)) return false
    return isCaptainForTeam(user, fixtureInfo, teamId) || await isTeamMember(user, teamId)
}

function rosterFromScoreRows(scoreRows, maxHand, mostRecentFirst) {
    const sortedScores = (scoreRows || [])
        .filter(entry => Number(entry.Hand) <= maxHand)
        .sort((first, second) => mostRecentFirst
            ? Number(second.Hand) - Number(first.Hand)
            : Number(first.Hand) - Number(second.Hand))
    const playersByPosition = new Map()
    for (const entry of sortedScores) {
        const position = Number(entry.Position)
        if (position >= 0 && position < 8 && !playersByPosition.has(position)) {
            playersByPosition.set(position, entry.Player || null)
        }
    }
    return Array.from({ length: 8 }, (_, playerIndex) => ({
        playerIndex,
        playerId: playersByPosition.get(playerIndex) || null
    }))
}

async function getTeamStartedHand(fixtureId, teamId) {
    let startedHand = await fixture.getFixtureTeamProgress(fixtureId, teamId)
    const temporaryScores = await fixture.getAllScoresForFixture(fixtureId)
    const submittedScores = await scorecard.getScorecardsForFixture(fixtureId)
    const teamTemporaryScores = (temporaryScores || []).filter(entry => String(entry.Team) === String(teamId))
    const teamSubmittedScores = (submittedScores || []).filter(entry => String(entry.Team) === String(teamId))
    const teamScores = [...teamTemporaryScores, ...teamSubmittedScores]

    if (startedHand === 7 && teamSubmittedScores.length === 0) {
        const meaningfulHand = teamTemporaryScores.reduce((highestHand, entry) => {
            const hasScoreData = (Number(entry.Score) || 0) > 0 ||
                (Number(entry.Bolters) || 0) > 0 ||
                (Number(entry.isFlopper) || 0) > 0 ||
                (Number(entry.isSquare) || 0) > 0 ||
                (Number(entry.isChance) || 0) > 0
            return hasScoreData ? Math.max(highestHand, Number(entry.Hand) || 0) : highestHand
        }, 0)
        const firstBlankHand = Math.max(1, meaningfulHand + 1)
        const hasBlankTail = meaningfulHand < 7 &&
            Array.from({ length: 8 - firstBlankHand }, (_, index) => firstBlankHand + index)
                .every(handNumber => {
                    const handEntries = teamTemporaryScores.filter(entry => Number(entry.Hand) === handNumber)
                    return handEntries.length === 8 && handEntries.every(entry =>
                        (Number(entry.Score) || 0) === 0 &&
                        (Number(entry.Bolters) || 0) === 0 &&
                        (Number(entry.isFlopper) || 0) === 0 &&
                        (Number(entry.isSquare) || 0) === 0 &&
                        (Number(entry.isChance) || 0) === 0)
                })

        if (hasBlankTail) {
            startedHand = Math.max(1, meaningfulHand)
            await fixture.clearBlankTempScoresAfterHand(fixtureId, teamId, startedHand)
            await fixture.setFixtureTeamProgress(fixtureId, teamId, startedHand)
            return startedHand
        }
    }

    for (const entry of teamScores) {
        if (String(entry.Team) === String(teamId)) {
            startedHand = Math.max(startedHand, Number(entry.Hand) || 0)
        }
    }
    return startedHand
}

async function canSubmitTeamScorecard(user, fixtureInfo, teamId) {
    if (user && user.access === 'dev') return true
    if (isCaptainForTeam(user, fixtureInfo, teamId)) return true
    return user && ['TeamSecretary', 'TeamSecratary'].includes(user.access) && await isTeamMember(user, teamId)
}

function canEditSubmittedScorecard(user) {
    return isLeagueSecretary(user)
}

async function renderTeamScorecard(req, res, fixtureInfo, teamId) {
    const user = req.session.user
    if (!await canManageTeam(user, fixtureInfo, teamId)) {
        return res.status(403).send('You cannot enter scores for this team.')
    }

    const isSubmitted = await scorecard.hasTeamSubmittedScorecard(fixtureInfo.id, teamId)
    if (isSubmitted && !canEditSubmittedScorecard(user)) {
        return res.status(403).send('Only the league secretary or a developer can edit a submitted scorecard.')
    }

    req.session.user.gamesInProgress = fixtureInfo.id
    req.session.user.Team = teamId
    const allSavedScores = await fixture.getTempScoresForUser(fixtureInfo.id, user.id)
    let savedScores = (allSavedScores || []).filter(entry => String(entry.Team) === String(teamId))
    const submittedScores = await scorecard.getScorecardsForFixture(fixtureInfo.id)
    const mergedScores = new Map(savedScores.map(entry => [`${entry.Team}_${entry.Position}_${entry.Hand}`, entry]))
    for (const entry of (submittedScores || []).filter(item => String(item.Team) === String(teamId))) {
        mergedScores.set(`${entry.Team}_${entry.Position}_${entry.Hand}`, {
                Hand: entry.Hand,
                Team: entry.Team,
                Player: entry.Player,
                Position: entry.Position,
                Score: entry.Score,
                Bolters: entry.Bolters,
                isFlopper: entry.isFlopper,
                isSquare: entry.isSquare,
                isChance: entry.isChance
        })
    }
    savedScores = Array.from(mergedScores.values())

    const startedHand = await getTeamStartedHand(fixtureInfo.id, teamId)
    const resumeHand = 1
    await fixture.markFixtureTeamHandStarted(fixtureInfo.id, teamId, startedHand)
    const allPlayers = await player.getPlayerListForTeam(teamId)
    const playersByHand = {}
    for (let handNumber = 1; handNumber <= 7; handNumber++) {
        const sheet = await fixture.getFixtureTeamSheet(fixtureInfo.id, teamId, handNumber)
        playersByHand[handNumber] = Array.from({ length: 8 }, (_, playerIndex) => {
            const savedEntry = savedScores.find(entry =>
                Number(entry.Hand) === handNumber && Number(entry.Position) === playerIndex && entry.Player)
            const sheetEntry = sheet.find(entry => Number(entry.playerIndex) === playerIndex)
            const playerId = sheet.length ? (sheetEntry || {}).playerId : savedEntry && savedEntry.Player
            return allPlayers.find(currentPlayer => String(currentPlayer.id) === String(playerId)) || { alias: 'Empty' }
        })
    }

    const currentSheet = await fixture.getFixtureTeamSheet(fixtureInfo.id, teamId, resumeHand)
    if (currentSheet.length === 0) {
        return res.redirect(`/fixtures/scorecard/new/team?gameid=${fixtureInfo.id}&teamId=${teamId}`)
    }

    const teamHandTotals = await getTeamHandTotals(fixtureInfo.id, fixtureInfo)
    const canSubmit = await canSubmitTeamScorecard(user, fixtureInfo, teamId)
    return res.render('fixtures/scorecard', {
        fixtureInfo,
        players: playersByHand[resumeHand],
        playersByHand,
        savedScores,
        resumeHand,
        teamHandTotals,
        currentTeamId: teamId,
        canSubmit,
        canCorrectTeamSheet: !isSubmitted,
        canSubstitute: startedHand < 3 && !isSubmitted,
        user
    })
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

router.get('/scorecard/live-totals', requireRegisteredUser, async (req, res) => {
    try {
        const fixtureInfo = await fixture.getFixtureInfo(req.query.gameid)
        const teamId = req.query.teamId
        if (!fixtureInfo || !await canManageTeam(req.session.user, fixtureInfo, teamId)) {
            return res.status(403).json({ error: 'You cannot view live scores for this fixture.' })
        }

        const temporaryScores = await fixture.getAllScoresForFixture(fixtureInfo.id)
        const submittedScores = await scorecard.getScorecardsForFixture(fixtureInfo.id)
        const scoresByEntry = new Map()
        for (const entry of (temporaryScores || [])) {
            scoresByEntry.set(`${entry.Team}_${entry.Position}_${entry.Hand}`, entry)
        }
        for (const entry of (submittedScores || [])) {
            scoresByEntry.set(`${entry.Team}_${entry.Position}_${entry.Hand}`, entry)
        }

        const entries = Array.from(scoresByEntry.values())
            .filter(entry => String(entry.Team) === String(teamId))
            .map(entry => ({
                hand: Number(entry.Hand),
                position: Number(entry.Position),
                score: Number(entry.Score) || 0,
                bolters: Number(entry.Bolters) || 0,
                isFlopper: Number(entry.isFlopper) || 0,
                isSquare: Number(entry.isSquare) || 0,
                isChance: Number(entry.isChance) || 0
            }))

        return res.json({
            teamHandTotals: await getTeamHandTotals(fixtureInfo.id, fixtureInfo),
            entries
        })
    } catch (error) {
        console.error('Unable to load live scorecard totals:', error)
        return res.status(500).json({ error: 'Unable to load live scorecard totals.' })
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
        const createPlayerScoreSummary = (teamId, teamName, position, playerId, playerName) => ({
            teamId,
            playerId,
            teamName,
            playerName,
            Position: position,
            hands: [0, 0, 0, 0, 0, 0, 0],
            handBolters: [0, 0, 0, 0, 0, 0, 0],
            handSquares: [false, false, false, false, false, false, false],
            handFloppers: [false, false, false, false, false, false, false],
            total: 0,
            bolters: 0,
            floppers: 0,
            squares: 0,
            chances: 0
        })

        for (const s of (allScores || [])) {
            const key = `${s.Team}_${s.Position}_${s.Player || 'empty'}`;
            if (!playerScores[key]) {
                playerScores[key] = createPlayerScoreSummary(
                    s.Team,
                    s.teamName,
                    s.Position,
                    s.Player || null,
                    s.playerName || 'Empty/Unknown'
                )
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

        for (const teamId of [gameInfo.homeTeamID, gameInfo.awayTeamID]) {
            const teamName = String(teamId) === String(gameInfo.homeTeamID) ? gameInfo.homeTeam : gameInfo.awayTeam
            const rosterEntries = new Map()
            for (let handNumber = 1; handNumber <= 7; handNumber++) {
                const teamSheet = await fixture.getFixtureTeamSheet(req.query.gameid, teamId, handNumber)
                for (const entry of teamSheet) {
                    rosterEntries.set(`${entry.playerIndex}_${entry.playerId || 'empty'}`, entry)
                }
            }

            if (rosterEntries.size === 0) {
                const teamPlayers = await player.getPlayerListForTeam(teamId)
                teamPlayers.forEach((teamPlayer, position) => {
                    rosterEntries.set(`${position}_${teamPlayer.id}`, {
                        playerIndex: position,
                        playerId: teamPlayer.id,
                        playerName: teamPlayer.alias
                    })
                })
            }

            const teamPlayers = await player.getPlayerListForTeam(teamId)
            const playersById = new Map(teamPlayers.map(teamPlayer => [String(teamPlayer.id), teamPlayer]))
            for (const entry of rosterEntries.values()) {
                const playerId = entry.playerId || null
                const playerName = playerId
                    ? (playersById.get(String(playerId)) || {}).alias || 'Empty/Unknown'
                    : 'Empty/Unknown'
                const key = `${teamId}_${entry.playerIndex}_${playerId || 'empty'}`
                if (!playerScores[key]) {
                    playerScores[key] = createPlayerScoreSummary(teamId, teamName, entry.playerIndex, playerId, playerName)
                }
            }
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
        const user = req.session.user || req.user
        let canEnterGame = false
        for (const teamId of [gameInfo.homeTeamID, gameInfo.awayTeamID]) {
            if (await canManageTeam(user, gameInfo, teamId) &&
                (!await scorecard.hasTeamSubmittedScorecard(req.query.gameid, teamId) || canEditSubmittedScorecard(user))) {
                canEnterGame = true
                break
            }
        }
        res.render('fixtures/gameSummary', {
            gameInfo,
            user,
            scores: groupedScores,
            approval,
            canEnterGame,
            canEditSubmittedScorecard: canEditSubmittedScorecard(user)
        })
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

    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)
    if (!fixtureInfo) {
        res.redirect('/fixtures')
        return
    }
    const user = req.session.user
    const teams = [fixtureInfo.homeTeamID, fixtureInfo.awayTeamID]
    let targetTeamId = req.query.teamId ? Number(req.query.teamId) : Number(user.Team)
    if (!teams.some(teamId => String(teamId) === String(targetTeamId)) ||
        !await canManageTeam(user, fixtureInfo, targetTeamId)) {
        const linkedPlayer = await auth.getPlayerForUser(user.userName)
        targetTeamId = linkedPlayer && teams.some(teamId => String(teamId) === String(linkedPlayer.team))
            ? linkedPlayer.team : null
        if (!targetTeamId) {
            for (const teamId of teams) {
                if (await canManageTeam(user, fixtureInfo, teamId)) {
                    targetTeamId = teamId
                    break
                }
            }
        }
    }

    if (!targetTeamId || !await canManageTeam(user, fixtureInfo, targetTeamId)) {
        return res.status(403).send('You are not a member of either team in this fixture.')
    }
    if (String(req.session.user.gamesInProgress) !== String(fixtureID)) {
        req.session.teamSheet = null
    }
    return renderTeamScorecard(req, res, fixtureInfo, targetTeamId)
})

router.get('/scorecard/new/team', async (req, res) => {
    if (req.session.user == null) {
        res.redirect('/users/login')
        return
    }

    const fixtureID = req.query.gameid || req.session.user.gamesInProgress
    if (fixtureID == null) {
        res.redirect('/fixtures')
        return
    }

    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)
    if (!fixtureInfo) return res.status(404).send('Fixture not found.')
    req.session.user.gamesInProgress = fixtureID

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

    if (!targetTeamId) {
        targetTeamId = await canManageTeam(req.session.user, fixtureInfo, fixtureInfo.homeTeamID)
            ? fixtureInfo.homeTeamID : fixtureInfo.awayTeamID
    }
    if (!await canManageTeam(req.session.user, fixtureInfo, targetTeamId)) {
        return res.status(403).send('You cannot manage the selected team.')
    }

    const isSubmitted = await scorecard.hasTeamSubmittedScorecard(fixtureID, targetTeamId)
    const startedHand = await getTeamStartedHand(fixtureID, targetTeamId)
    if (isSubmitted && !canEditSubmittedScorecard(req.session.user)) {
        return res.status(403).send('Submitted scorecards can only be edited by the league secretary or a developer.')
    }
    const mode = req.query.mode === 'substitute' ? 'substitute' : 'correct'
    if (mode === 'substitute' && (startedHand >= 3 || isSubmitted)) {
        return res.status(403).send('A substitution cannot be made after the third hand has started.')
    }
    req.session.user.Team = targetTeamId
    let existingSheet = await fixture.getFixtureTeamSheet(
        fixtureID,
        targetTeamId,
        mode === 'substitute' ? startedHand : 1
    )
    if (existingSheet.length === 0) {
        const temporaryScores = await fixture.getAllScoresForFixture(fixtureID)
        const submittedScores = await scorecard.getScorecardsForFixture(fixtureID)
        const teamScores = [
            ...(temporaryScores || []),
            ...(submittedScores || []).map(entry => ({
                Hand: entry.Hand,
                Team: entry.Team,
                Position: entry.Position,
                Player: entry.Player
            }))
        ].filter(entry => String(entry.Team) === String(targetTeamId))
        existingSheet = rosterFromScoreRows(teamScores, mode === 'substitute' ? startedHand : 1, mode === 'substitute')
    }
    req.session.teamSheet = Array.from({ length: 8 }, (_, position) => {
        const entry = existingSheet.find(sheetEntry => Number(sheetEntry.playerIndex) === position)
        return entry && entry.playerId ? String(entry.playerId) : 'null'
    })
    req.session.teamSheetTeamId = String(targetTeamId)
    req.session.save()

    const teamList = await player.getPlayerListForTeam(targetTeamId)
    const selectableTeams = []
    for (const teamId of [fixtureInfo.homeTeamID, fixtureInfo.awayTeamID]) {
        if (await canManageTeam(req.session.user, fixtureInfo, teamId)) selectableTeams.push(String(teamId))
    }

    res.render('fixtures/scorecard/setTeam', {
        playerList: teamList,
        fixtureInfo,
        targetTeamId,
        teamSheet: req.session.teamSheet,
        handFrom: mode === 'substitute' && existingSheet.length ? startedHand + 1 : 1,
        mode,
        selectableTeams,
        user: req.session.user
    })
})

router.post('/scorecard/new/team', async (req, res) => {
    if (!req.session.user) return res.redirect('/users/login')
    const fixtureID = req.body.gameid || req.session.user.gamesInProgress
    const fixtureInfo = await fixture.getFixtureInfo(fixtureID)
    const targetTeamId = Number(req.body.teamId || req.session.user.Team)
    if (!fixtureInfo || !await canManageTeam(req.session.user, fixtureInfo, targetTeamId)) {
        return res.status(403).send('You cannot manage the selected team.')
    }
    const startedHand = await getTeamStartedHand(fixtureID, targetTeamId)
    const isSubmitted = await scorecard.hasTeamSubmittedScorecard(fixtureID, targetTeamId)
    const mode = req.body.mode === 'substitute' ? 'substitute' : 'correct'
    if (mode === 'substitute' && (startedHand >= 3 || isSubmitted)) {
        return res.status(403).send('A substitution cannot be made after the third hand has started.')
    }
    if (isSubmitted && !canEditSubmittedScorecard(req.session.user)) {
        return res.status(403).send('Submitted scorecards can only be edited by the league secretary or a developer.')
    }

    const submittedPlayers = Array.isArray(req.body.player) ? req.body.player : [req.body.player]
    if (submittedPlayers.length !== 8) {
        return res.status(400).send('Select exactly eight player positions.')
    }
    const teamPlayers = await player.getPlayerListForTeam(targetTeamId)
    const allowedPlayerIds = new Set(teamPlayers.map(currentPlayer => String(currentPlayer.id)))
    const normalizedPlayers = submittedPlayers.map(playerId =>
        !playerId || playerId === 'null' ? null : Number(playerId))
    if (normalizedPlayers.some(playerId => playerId !== null &&
        (!Number.isInteger(playerId) || !allowedPlayerIds.has(String(playerId)))) ||
        normalizedPlayers.filter(Boolean).length !== new Set(normalizedPlayers.filter(Boolean)).size) {
        return res.status(400).send('Each selected player must be an approved member of this team and appear only once.')
    }

    let existingSheet = await fixture.getFixtureTeamSheet(
        fixtureID,
        targetTeamId,
        mode === 'substitute' ? startedHand : 1
    )
    const temporaryScores = await fixture.getAllScoresForFixture(fixtureID)
    const submittedScores = await scorecard.getScorecardsForFixture(fixtureID)
    const teamScores = [
        ...(temporaryScores || []),
        ...(submittedScores || []).map(entry => ({
            Hand: entry.Hand,
            Team: entry.Team,
            Position: entry.Position,
            Player: entry.Player
        }))
    ].filter(entry => String(entry.Team) === String(targetTeamId))
    if (existingSheet.length === 0 && mode === 'substitute' && teamScores.length > 0) {
        const initialRoster = rosterFromScoreRows(teamScores, 1, false).map(entry => entry.playerId)
        await fixture.saveFixtureTeamSheet(fixtureID, targetTeamId, initialRoster, 1)
        if (startedHand > 1) {
            const currentRoster = rosterFromScoreRows(teamScores, startedHand, true).map(entry => entry.playerId)
            await fixture.saveFixtureTeamSheet(fixtureID, targetTeamId, currentRoster, startedHand)
        }
        existingSheet = await fixture.getFixtureTeamSheet(fixtureID, targetTeamId, startedHand)
    }
    const handFrom = mode === 'substitute' && (existingSheet.length || teamScores.length)
        ? startedHand + 1 : 1
    await fixture.saveFixtureTeamSheet(fixtureID, targetTeamId, normalizedPlayers, handFrom)
    if (!['In Progress', 'Provisional', 'Confirmed'].includes(fixtureInfo.status)) {
        await fixture.updateFixtureScore(fixtureID, fixtureInfo.homeScore, fixtureInfo.awayScore, 'In Progress')
    }
    req.session.user.gamesInProgress = fixtureID
    req.session.user.Team = targetTeamId
    req.session.teamSheet = normalizedPlayers.map(playerId => playerId ? String(playerId) : 'null')
    req.session.teamSheetTeamId = String(targetTeamId)
    req.session.save()
    return res.redirect(`/fixtures/scorecard/new?gameid=${fixtureID}&teamId=${targetTeamId}`)
})

router.post('/scorecard', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/users/login')
    }

    const gameid = req.body.gameid || req.query.gameid || req.session.user.gamesInProgress
    if (!gameid) {
        return res.redirect('/fixtures')
    }

    const teamid = Number(req.body.teamId || req.session.user.Team)
    const userid = req.session.user.id || 1

    try {
        const fixtureInfo = await fixture.getFixtureInfo(gameid)
        if (!fixtureInfo || !await canManageTeam(req.session.user, fixtureInfo, teamid)) {
            return res.status(403).send('You cannot submit scores for this team.')
        }
        if (!await canSubmitTeamScorecard(req.session.user, fixtureInfo, teamid)) {
            return res.status(403).send('Only the team captain, team secretary, or a developer can submit this scorecard.')
        }
        const alreadySubmitted = await scorecard.hasTeamSubmittedScorecard(gameid, teamid)
        if (alreadySubmitted && !canEditSubmittedScorecard(req.session.user)) {
            return res.status(403).send('Only the league secretary or a developer can edit a submitted scorecard.')
        }
        const playerScores = []
        let teamTotalScore = 0

        for (let handNumber = 1; handNumber <= 7; handNumber++) {
            const sheet = await fixture.getFixtureTeamSheet(gameid, teamid, handNumber)
            if (sheet.length !== 8) {
                return res.status(400).send(`A team sheet must be set for hand ${handNumber} before submitting.`)
            }
            for (let playerIndex = 0; playerIndex < 8; playerIndex++) {
                const sKey = `score${handNumber}_${playerIndex}`
                const bKey = `bolters${handNumber}_${playerIndex}`

                const sVal = parseInt(req.body[sKey]) || 0
                const bVal = parseInt(req.body[bKey]) || 0
                const playerId = (sheet.find(entry => Number(entry.playerIndex) === playerIndex) || {}).playerId || null

                teamTotalScore += sVal

                playerScores.push({
                    playerIndex,
                    playerId,
                    handNumber,
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
        req.session.teamSheetTeamId = null
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
        if (!fixtureInfo || !await canManageTeam(req.session.user, fixtureInfo, teamid)) {
            return res.status(403).send("Unauthorized");
        }
        const { handNumber, playerIndex, score, bolters, isFlopper, isSquare, isChance } = req.body;
        const hand = Number(handNumber)
        const position = Number(playerIndex)
        if (!Number.isInteger(hand) || hand < 1 || hand > 7 ||
            !Number.isInteger(position) || position < 0 || position > 7) {
            return res.status(400).send('Invalid hand or player position.')
        }
        const alreadySubmitted = await scorecard.hasTeamSubmittedScorecard(gameid, teamid)
        if (alreadySubmitted && !canEditSubmittedScorecard(req.session.user)) {
            return res.status(403).send('Only the league secretary or a developer can edit a submitted scorecard.')
        }
        const sheet = await fixture.getFixtureTeamSheet(gameid, teamid, hand)
        const playerId = (sheet.find(entry => Number(entry.playerIndex) === position) || {}).playerId || null

        await fixture.markFixtureTeamHandStarted(gameid, teamid, hand)
        await fixture.saveTempScore(gameid, userid, hand, teamid, playerId, position, score || 0, bolters || 0, isFlopper ? 1 : 0, isSquare ? 1 : 0, isChance ? 1 : 0);
        res.status(200).send("Saved");
    } catch (err) {
        console.error("Error saving score", err);
        res.status(500).send("Error");
    }
})

router.post('/scorecard/hand', async (req, res) => {
    if (!req.session.user || !req.session.user.gamesInProgress) {
        return res.status(401).send('Unauthorized')
    }

    try {
        const gameid = req.session.user.gamesInProgress
        const teamid = req.session.user.Team
        const fixtureInfo = await fixture.getFixtureInfo(gameid)
        const handNumber = Number(req.body.handNumber)
        if (!fixtureInfo || !await canManageTeam(req.session.user, fixtureInfo, teamid)) {
            return res.status(403).send('Unauthorized')
        }
        if (!Number.isInteger(handNumber) || handNumber < 1 || handNumber > 7) {
            return res.status(400).send('Invalid hand number.')
        }
        await fixture.markFixtureTeamHandStarted(gameid, teamid, handNumber)
        return res.sendStatus(204)
    } catch (error) {
        console.error('Error recording started hand:', error)
        return res.status(500).send('Unable to record the started hand.')
    }
})

module.exports = router