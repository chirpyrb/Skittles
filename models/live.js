const SQ3 = require('./sql')

// Return live scores grouped by division
async function getLiveScoresByDivision() {
    // 1. Get all division competitions
    const divisions = await SQ3.fetchAll(SQ3.db, `
        SELECT id, name FROM Competitions
        WHERE competitionId IS NOT NULL
        ORDER BY id ASC
    `)

    const result = []

    for (const div of divisions) {
        // Query fixtures belonging to this division
        const fixtures = await SQ3.fetchAll(SQ3.db, `
            SELECT f.id, f.homeTeam AS homeTeamId, f.awayTeam AS awayTeamId,
                   COALESCE(Home.teamName, 'BYE') AS homeTeam,
                   COALESCE(Away.teamName, 'BYE') AS awayTeam,
                   f.homeScore, f.awayScore, f.status, f.matchDate,
                   Alleys.name AS alleyName
            FROM Fixtures f
            LEFT JOIN Teams Home ON Home.id = f.homeTeam
            LEFT JOIN Teams Away ON Away.id = f.awayTeam
            LEFT JOIN Alleys ON Alleys.id = Home.homeAlley
            WHERE f.competition = ? OR f.divisionId = ?
            ORDER BY f.id ASC
            LIMIT 15
        `, [div.id, div.id])

        // Calculate live score totals for in-progress games
        const liveTotals = await getLiveTotalsForFixtures()

        const processedFixtures = (fixtures || []).map(f => {
            const totals = liveTotals[f.id] || {}
            const liveHomeScore = f.homeScore !== null ? f.homeScore : (totals[f.homeTeamId] ?? 0)
            const liveAwayScore = f.awayScore !== null ? f.awayScore : (totals[f.awayTeamId] ?? 0)
            
            let currentStatus = f.status || 'Scheduled'
            if (totals.maxHand && totals.maxHand > 0 && f.status !== 'Completed' && f.status !== 'Confirmed') {
                currentStatus = totals.maxHand >= 7 ? 'Completed' : `In Progress (Hand ${totals.maxHand}/7)`
            }

            return {
                id: f.id,
                homeTeam: f.homeTeam,
                awayTeam: f.awayTeam,
                homeScore: liveHomeScore,
                awayScore: liveAwayScore,
                status: currentStatus,
                matchDate: f.matchDate,
                alleyName: f.alleyName || 'Main Alley'
            }
        })

        result.push({
            divisionId: div.id,
            divisionName: div.name,
            fixtures: processedFixtures
        })
    }

    return result
}

// Sum live scores from temporary user score tables
async function getLiveTotalsForFixtures() {
    const tables = await SQ3.fetchAll(SQ3.db, `
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'temptable\\_scores%\\_user%' ESCAPE '\\'
    `)

    const fixtureData = {}

    for (const table of tables) {
        const scores = await SQ3.fetchAll(SQ3.db, `SELECT Fixture, Team, Hand, Score FROM ${table.name}`)
        for (const s of scores) {
            if (!s.Fixture) continue
            if (!fixtureData[s.Fixture]) {
                fixtureData[s.Fixture] = { maxHand: 0 }
            }
            const f = fixtureData[s.Fixture]
            if (s.Team) {
                f[s.Team] = (f[s.Team] || 0) + (parseInt(s.Score) || 0)
            }
            if (s.Hand && s.Hand > f.maxHand) {
                f.maxHand = s.Hand
            }
        }
    }

    return fixtureData
}

// Generate/fetch videoprinter events for squares, floppers, end of hands, end of game
async function getVideoprinterEvents(limit = 25) {
    const events = []
    const now = new Date()

    // 1. Scan temp score tables for live events
    const tables = await SQ3.fetchAll(SQ3.db, `
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'temptable\\_scores%\\_user%' ESCAPE '\\'
    `)

    for (const table of tables) {
        const rows = await SQ3.fetchAll(SQ3.db, `
            SELECT s.*, p.firstName, p.secondName, p.alias, t.teamName, c.name AS divisionName, f.id AS fixtureId
            FROM ${table.name} s
            LEFT JOIN Players p ON p.id = s.Player
            LEFT JOIN Teams t ON t.id = s.Team
            LEFT JOIN Fixtures f ON f.id = s.Fixture
            LEFT JOIN Competitions c ON c.id = f.competition
            ORDER BY s.id DESC
        `)

        for (const row of rows) {
            const playerName = row.alias || (row.firstName ? `${row.firstName} ${row.secondName}` : 'Player')
            const teamName = row.teamName || 'Team'
            const divName = row.divisionName || 'Division 1'

            if (row.isSquare || row.Score === 12) {
                events.push({
                    id: `sq-${row.id}-${table.name}`,
                    type: 'SQUARE',
                    division: divName,
                    team: teamName,
                    player: playerName,
                    score: row.Score || 12,
                    hand: row.Hand,
                    timestamp: formatTime(now, events.length * 45),
                    text: `SQUARE! ${playerName} (${teamName}) scored a Square (${row.Score || 12} pins) in Hand ${row.Hand}`
                })
            }

            if (row.isFlopper || (row.Score === 0 && row.isFlopper !== null)) {
                events.push({
                    id: `fl-${row.id}-${table.name}`,
                    type: 'FLOPPER',
                    division: divName,
                    team: teamName,
                    player: playerName,
                    score: 0,
                    hand: row.Hand,
                    timestamp: formatTime(now, events.length * 45 + 15),
                    text: `FLOPPER! ${playerName} (${teamName}) scored a Flopper (0 pins) in Hand ${row.Hand}`
                })
            }
        }
    }

    // 2. Add Hand End and Full Time events from fixtures
    const completedFixtures = await SQ3.fetchAll(SQ3.db, `
        SELECT f.*, Home.teamName AS homeTeamName, Away.teamName AS awayTeamName, c.name AS divisionName
        FROM Fixtures f
        LEFT JOIN Teams Home ON Home.id = f.homeTeam
        LEFT JOIN Teams Away ON Away.id = f.awayTeam
        LEFT JOIN Competitions c ON c.id = f.competition
        WHERE f.homeScore IS NOT NULL AND f.awayScore IS NOT NULL
        ORDER BY f.id DESC
        LIMIT 10
    `)

    completedFixtures.forEach((f, idx) => {
        events.push({
            id: `ft-${f.id}`,
            type: 'FULL_TIME',
            division: f.divisionName || 'Division 1',
            homeTeam: f.homeTeamName,
            awayTeam: f.awayTeamName,
            homeScore: f.homeScore,
            awayScore: f.awayScore,
            timestamp: formatTime(now, idx * 90 + 30),
            text: `FULL TIME: ${f.homeTeamName} ${f.homeScore} - ${f.awayScore} ${f.awayTeamName} (${f.divisionName || 'Division'})`
        })
    })

    // 3. Fallback / Seed demonstration events if database has no live events recorded yet
    if (events.length < 5) {
        const demoEvents = [
            {
                id: 'demo-1',
                type: 'FULL_TIME',
                division: 'Division 1',
                timestamp: formatTime(now, 120),
                text: 'FULL TIME — Division 1: Do-Nuts 385 - 360 Whistlers (MATCH CONFIRMED)'
            },
            {
                id: 'demo-2',
                type: 'SQUARE',
                division: 'Division 1',
                timestamp: formatTime(now, 95),
                text: 'SQUARE! Dave Smith (Do-Nuts) hit a 12-pin SQUARE in Hand 6'
            },
            {
                id: 'demo-3',
                type: 'END_HAND',
                division: 'Division 2',
                timestamp: formatTime(now, 80),
                text: 'END OF HAND 5 — Division 2: Lucky Barstars 245 - 238 Hardy\'s Admirals'
            },
            {
                id: 'demo-4',
                type: 'FLOPPER',
                division: 'Division 2',
                timestamp: formatTime(now, 65),
                text: 'FLOPPER! Mike Johnson (Stingers) scored a Flopper (0 pins) in Hand 4'
            },
            {
                id: 'demo-5',
                type: 'END_HAND',
                division: 'Division 1',
                timestamp: formatTime(now, 50),
                text: 'END OF HAND 4 — Division 1: Pinups 198 - 192 Shamrocks'
            },
            {
                id: 'demo-6',
                type: 'SQUARE',
                division: 'Division 3',
                timestamp: formatTime(now, 30),
                text: 'SQUARE! Chris Lee (Leg Irons) hit a 12-pin SQUARE in Hand 3'
            },
            {
                id: 'demo-7',
                type: 'END_HAND',
                division: 'Division 3',
                timestamp: formatTime(now, 15),
                text: 'END OF HAND 3 — Division 3: Chapelhay W\'s 142 - 138 Chapelhay Charmers'
            }
        ]
        events.push(...demoEvents)
    }

    return events.slice(0, limit)
}

function formatTime(baseDate, offsetSeconds) {
    const d = new Date(baseDate.getTime() - offsetSeconds * 1000)
    const hours = String(d.getHours()).padStart(2, '0')
    const mins = String(d.getMinutes()).padStart(2, '0')
    const secs = String(d.getSeconds()).padStart(2, '0')
    return `${hours}:${mins}:${secs}`
}

module.exports = {
    getLiveScoresByDivision,
    getVideoprinterEvents
}
