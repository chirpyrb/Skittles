const SQ3 = require('../models/sql')

// Keep the legacy initializer available; the central schema creates fixture tables.
async function initTable() {
}

// Return every fixture with team, competition, division, date, and live-score details.
async function getAllFixtures() {
    // Returns a list of all fixtures.
    let fixtureList = await SQ3.fetchAll(SQ3.db,
        "SELECT Fixtures.id, \
        Fixtures.status, \
        Fixtures.homeScore, \
        Fixtures.awayScore, \
        Home.id as homeTeamID, \
        Away.id as awayTeamID, \
        COALESCE(Home.teamName, 'BYE') AS homeTeam, \
        COALESCE(Away.teamName, 'BYE') AS awayTeam, \
        CASE WHEN Fixtures.status = 'Bye' THEN 1 ELSE COALESCE(Home.home_night, Away.home_night, 1) END AS matchDay, \
        matchDate, \
        Fixtures.competition, \
        Competitions.division, \
        Divisions.name AS divisionName \
        FROM Fixtures \
        LEFT JOIN Teams Home ON Home.id = Fixtures.homeTeam \
        LEFT JOIN Teams Away ON Away.id = Fixtures.awayTeam \
        LEFT JOIN Competitions ON Competitions.id = Fixtures.competition \
        LEFT JOIN Divisions ON Divisions.id = Competitions.division \
        ;")

    // Scan existing temporary score tables once instead of once per fixture.
    const liveTotals = await getLiveScoreTotals()
    for (const currentFixture of fixtureList) {
        const fixtureTotals = liveTotals[currentFixture.id] || {}
        if (currentFixture.homeScore === null || currentFixture.homeScore === undefined) {
            currentFixture.homeScore = fixtureTotals[currentFixture.homeTeamID] ?? null
        }
        if (currentFixture.awayScore === null || currentFixture.awayScore === undefined) {
            currentFixture.awayScore = fixtureTotals[currentFixture.awayTeamID] ?? null
        }
    }

    // SQLITE doesnt have a specific date type.
    // So format it here so we can sort later.
    fixtureList = formatFixtureDate(fixtureList)
    return fixtureList
}

// Return fixtures involving a specific team.
async function getAllFixturesByTeamID(teamID) {
    // Returns a list of all fixtures for a given team ID.
    const fixtureList = await SQ3.fetchAll(SQ3.db,
        "SELECT Fixtures.id, \
        Fixtures.status, \
        Fixtures.homeScore, \
        Fixtures.awayScore, \
        Home.id as homeTeamID, \
        Away.id as awayTeamID, \
        COALESCE(Home.teamName, 'BYE') AS homeTeam, \
        COALESCE(Away.teamName, 'BYE') AS awayTeam, \
        CASE WHEN Fixtures.status = 'Bye' THEN 1 ELSE COALESCE(Home.home_night, Away.home_night, 1) END AS matchDay, \
        matchDate, \
        Fixtures.competition, \
        Competitions.division, \
        Divisions.name AS divisionName \
        FROM Fixtures \
        LEFT JOIN Teams Home ON Home.id = Fixtures.homeTeam \
        LEFT JOIN Teams Away ON Away.id = Fixtures.awayTeam \
        LEFT JOIN Competitions ON Competitions.id = Fixtures.competition \
        LEFT JOIN Divisions ON Divisions.id = Competitions.division \
        WHERE Fixtures.homeTeam = ? OR Fixtures.awayTeam = ?;",
        [teamID, teamID])

    // SQLITE doesnt have a specific date type.
    // So format it here so we can sort later.
    fixtureList = formatFixtureDate(fixtureList)
    return fixtureList
}

// Sort fixtures chronologically by their calculated match date.
function sortFixturesByDate(fixtureList) {
    // Sorts a list of fixtures by date.
    fixtureList.sort((a, b) => a.matchDate - b.matchDate)
    return fixtureList
}

// Convert stored dates into Date objects and apply each team's match-day offset.
function formatFixtureDate(fixtureList) {
    // Formats the date of a fixture.
    for (let f of fixtureList) {
        f.matchDate = new Date(f.matchDate)
        f.matchDate.setDate(f.matchDate.getDate() + f.matchDay - 1)
    }
    return fixtureList
}

// Group fixtures by month and day for calendar-style display.
function groupFixturesByMonth(fixtureList) {

    // Groups a list of fixtures by month.
    const groupedFixtures = {}
    for (let f of fixtureList) {
        let monthKey = 'Unscheduled'
        let monthLabel = 'Unscheduled'
        let displayDate = 'Unscheduled'
        let sortableDate = '0000-00-00'

        if (f.matchDate && !isNaN(f.matchDate.getTime())) {
            const y = f.matchDate.getFullYear()
            const m = String(f.matchDate.getMonth() + 1).padStart(2, '0')
            const d = String(f.matchDate.getDate()).padStart(2, '0')
            monthKey = `${y}-${m}`
            monthLabel = f.matchDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
            displayDate = f.matchDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
            sortableDate = `${y}-${m}-${d}`
        }

        f.displayDate = displayDate

        if (!groupedFixtures[monthKey]) {
            groupedFixtures[monthKey] = {
                label: monthLabel,
                days: {}
            }
        }

        if (!groupedFixtures[monthKey].days[sortableDate]) {
            groupedFixtures[monthKey].days[sortableDate] = {
                displayDate: displayDate,
                fixtures: []
            }
        }

        groupedFixtures[monthKey].days[sortableDate].fixtures.push(f)
    }

    Object.values(groupedFixtures).forEach(month => {
        Object.values(month.days).forEach(day => {
            // Sort each day's fixtures by division and then home team.
            day.fixtures.sort((first, second) => {
                const divisionCompare = (first.divisionName || 'Unassigned').localeCompare(second.divisionName || 'Unassigned', undefined, { numeric: true })
                if (divisionCompare !== 0) return divisionCompare
                return (first.homeTeam || '').localeCompare(second.homeTeam || '')
            })

            day.divisionGroups = []
            day.fixtures.forEach(currentFixture => {
                const divisionName = currentFixture.divisionName || 'Unassigned division'
                let divisionGroup = day.divisionGroups.find(group => group.name === divisionName)
                if (!divisionGroup) {
                    divisionGroup = { name: divisionName, fixtures: [] }
                    day.divisionGroups.push(divisionGroup)
                }
                divisionGroup.fixtures.push(currentFixture)
            })
        })
    })

    return groupedFixtures
}

// Return the current status of one fixture.
async function getFixtureStatus(id) {
    // Returns the status of a given fixture.
    const gameStatus = await SQ3.fetchFirst(SQ3.db, 'SELECT Status FROM Fixtures WHERE id = ?', id)
    return gameStatus.Status
}

// Return the teams, captains, date, status, and scores for one fixture.
async function getFixtureInfo(id) {
    // Returns the fixture summary for a given fixture.
    const fixtureInfo = await SQ3.fetchFirst(SQ3.db, "\
        SELECT Fixtures.id, \
        Home.id AS homeTeamID, \
        Home.teamName AS homeTeam, \
        Away.id AS awayTeamID, \
        Away.teamName AS awayTeam, \
        Home.captainId AS homeCaptainId, \
        Away.captainId AS awayCaptainId, \
        matchDate, \
        status, \
        homeScore, \
        awayScore \
        FROM Fixtures \
        INNER JOIN Teams Home ON Home.id = Fixtures.homeTeam \
        INNER JOIN Teams Away ON Away.id = Fixtures.awayTeam \
        WHERE Fixtures.id = ?;",
        id)
    return fixtureInfo

}

// Create per-user temporary game tables and mark the fixture as awaiting teams.
async function beginGame(gameid, userid) {
    // A user wants to begin a game.

    // Safest way is to create a new table with the GameID and UserID as these should always be unique.
    try {
        // Create a table for the team
        await SQ3.execute(SQ3.db,
            `CREATE TABLE IF NOT EXISTS temptable_game${gameid}_user${userid} \
            (id INTEGER PRIMARY KEY, \
            Player INTEGER, \
            FOREIGN KEY (Player) REFERENCES Players(id))`)

        // Create a table for the scores.
        await SQ3.execute(SQ3.db,
            `CREATE TABLE IF NOT EXISTS temptable_scores${gameid}_user${userid} \
            (id INTEGER PRIMARY KEY, \
            Fixture INTEGER, \
            Hand INTEGER, \
            Team INTEGER, \
            Player INTEGER, \
            Position INTEGER, \
            Score INTEGER, \
            Bolters INTEGER, \
            isSquare INTEGER, \
            isFlopper INTEGER, \
            isChance INTEGER, \
            FOREIGN KEY (Fixture) REFERENCES Fixtures(id), \
            FOREIGN KEY (Team) REFERENCES Teams(id), \
            FOREIGN KEY (Player) REFERENCES Players(id))`)

        // Set game status to awaiting teams.
        SQ3.execute(SQ3.db, 'UPDATE Fixtures SET Status = "Awaiting teams" WHERE id = ?', gameid)

        return true
    } catch (e) {
        return e
    }
}

// Insert a fixture connecting two teams to a competition.
async function createFixture(homeTeam, awayTeam, matchDate, comp, status = null) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Fixtures(homeTeam,awayTeam,matchDate,competition,status) VALUES (?,?,?,?,?);', [homeTeam, awayTeam, matchDate, comp, status])
}

// Parse one fixture CSV line while respecting quoted values.
function parseCSVLine(line) {
    const columns = []
    let value = ''
    let quoted = false

    for (let i = 0; i < line.length; i++) {
        const character = line[i]
        if (character === '"') {
            if (quoted && line[i + 1] === '"') {
                value += '"'
                i++
            } else {
                quoted = !quoted
            }
        } else if (character === ',' && !quoted) {
            columns.push(value.trim())
            value = ''
        } else {
            value += character
        }
    }

    if (quoted) throw new Error('A CSV value has an unmatched quote.')
    columns.push(value.trim())
    return columns
}

// Validate that a date is a real Monday in YYYY-MM-DD format.
function parseMondayDate(value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null

    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    if (date.getUTCFullYear() !== Number(match[1]) ||
        date.getUTCMonth() !== Number(match[2]) - 1 ||
        date.getUTCDate() !== Number(match[3]) ||
        date.getUTCDay() !== 1) {
        return null
    }

    return value
}

// Validate fixture CSV content, resolve references, and insert valid fixtures.
async function importFixturesFromCSVContent(csvContent, competitionIds, divisionModel, teamModel) {
    const rows = csvContent.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
    const errors = []
    const fixtures = []
    const uploadedFixtureKeys = new Set()

    rows.forEach((line, index) => {
        let columns
        try {
            columns = parseCSVLine(line)
        } catch (error) {
            errors.push(`Row ${index + 1}: ${error.message}`)
            return
        }

        if (index === 0 && columns[0].toLowerCase() === 'division') return
        if (columns.length !== 4 || columns.some(column => !column)) {
            errors.push(`Row ${index + 1}: expected division, Monday date, home team, away team.`)
            return
        }

        const [divisionName, monday, homeTeamName, awayTeamName] = columns
        const homeIsBye = homeTeamName.toUpperCase() === 'BYE'
        const awayIsBye = awayTeamName.toUpperCase() === 'BYE'
        if (homeIsBye && awayIsBye) {
            errors.push(`Row ${index + 1}: home and away teams cannot both be BYE.`)
            return
        }
        const parsedMonday = parseMondayDate(monday)
        if (!parsedMonday) {
            errors.push(`Row ${index + 1}: '${monday}' must be a valid Monday in YYYY-MM-DD format.`)
            return
        }

        fixtures.push({ index, divisionName, monday: parsedMonday, homeTeamName, awayTeamName })
    })

    for (const row of fixtures) {
        const division = await divisionModel.getDivisionByName(row.divisionName)
        const homeTeam = row.homeTeamName.toUpperCase() === 'BYE' ? null : await teamModel.getTeamForFixtureByName(row.homeTeamName)
        const awayTeam = row.awayTeamName.toUpperCase() === 'BYE' ? null : await teamModel.getTeamForFixtureByName(row.awayTeamName)

        if (!division) errors.push(`Row ${row.index + 1}: division '${row.divisionName}' was not found.`)
        if (!homeTeam && row.homeTeamName.toUpperCase() !== 'BYE') errors.push(`Row ${row.index + 1}: home team '${row.homeTeamName}' was not found.`)
        if (!awayTeam && row.awayTeamName.toUpperCase() !== 'BYE') errors.push(`Row ${row.index + 1}: away team '${row.awayTeamName}' was not found.`)
        if ((!homeTeam && row.homeTeamName.toUpperCase() !== 'BYE') || (!awayTeam && row.awayTeamName.toUpperCase() !== 'BYE') || !division) continue

        const realTeam = homeTeam || awayTeam
        if (realTeam.division !== division.id) {
            errors.push(`Row ${row.index + 1}: team '${realTeam.teamName}' is not in '${row.divisionName}'.`)
        }
        if (!Number.isInteger(realTeam.home_night) || realTeam.home_night < 1 || realTeam.home_night > 7) {
            errors.push(`Row ${row.index + 1}: team '${realTeam.teamName}' has no valid home night.`)
        }
        if (homeTeam && awayTeam && homeTeam.division !== division.id) {
            errors.push(`Row ${row.index + 1}: home team '${row.homeTeamName}' is not in '${row.divisionName}'.`)
        }
        if (homeTeam && awayTeam && awayTeam.division !== division.id) {
            errors.push(`Row ${row.index + 1}: away team '${row.awayTeamName}' is not in '${row.divisionName}'.`)
        }

        const resolvedRow = {
            ...row,
            division,
            homeTeam,
            awayTeam,
            competitionId: competitionIds[division.id],
            playedDate: row.homeTeamName.toUpperCase() === 'BYE'
                ? row.monday
                : new Date(Date.UTC(Number(row.monday.slice(0, 4)), Number(row.monday.slice(5, 7)) - 1, Number(row.monday.slice(8, 10)) + homeTeam.home_night - 1)).toISOString().slice(0, 10),
            status: row.homeTeamName.toUpperCase() === 'BYE' || row.awayTeamName.toUpperCase() === 'BYE' ? 'Bye' : null
        }

        if (!resolvedRow.competitionId) {
            errors.push(`Row ${row.index + 1}: no competition exists for '${row.divisionName}' in the active season.`)
        }

        const fixtureKey = `${resolvedRow.competitionId}|${homeTeam ? homeTeam.id : 'BYE'}|${awayTeam ? awayTeam.id : 'BYE'}|${row.monday}`
        if (uploadedFixtureKeys.has(fixtureKey)) {
            errors.push(`Row ${row.index + 1}: duplicate fixture for '${row.homeTeamName}' vs '${row.awayTeamName}' on ${row.monday}.`)
        } else if (resolvedRow.competitionId) {
            const existingFixture = await SQ3.fetchFirst(
                SQ3.db,
                'SELECT id FROM Fixtures WHERE competition = ? AND homeTeam IS ? AND awayTeam IS ? AND matchDate = ?',
                [resolvedRow.competitionId, homeTeam ? homeTeam.id : null, awayTeam ? awayTeam.id : null, row.monday]
            )
            if (existingFixture) {
                errors.push(`Row ${row.index + 1}: duplicate fixture for '${row.homeTeamName}' vs '${row.awayTeamName}' on ${row.monday}.`)
            }
        }

        uploadedFixtureKeys.add(fixtureKey)

        fixtures[fixtures.indexOf(row)] = resolvedRow
    }

    if (errors.length) return { imported: 0, errors }

    for (const row of fixtures) {
        await createFixture(row.homeTeam ? row.homeTeam.id : null, row.awayTeam ? row.awayTeam.id : null, row.monday, row.competitionId, row.status)
    }

    return { imported: fixtures.length, errors: [] }
}
// Create or update one temporary score entry for an in-progress game.
async function saveTempScore(gameid, userid, hand, teamid, playerid, position, score, bolters, isFlopper = 0, isSquare = 0, isChance = 0) {
    const tableName = `temptable_scores${gameid}_user${userid}`;

    // Ensure table exists just in case
    await SQ3.execute(SQ3.db,
        `CREATE TABLE IF NOT EXISTS ${tableName} \
        (id INTEGER PRIMARY KEY, \
        Fixture INTEGER, \
        Hand INTEGER, \
        Team INTEGER, \
        Player INTEGER, \
        Position INTEGER, \
        Score INTEGER, \
        Bolters INTEGER, \
        isSquare INTEGER, \
        isFlopper INTEGER, \
        isChance INTEGER)`)

    const existing = await SQ3.fetchFirst(SQ3.db, `SELECT id FROM ${tableName} WHERE Hand = ? AND Position = ?`, [hand, position]);
    if (existing) {
        await SQ3.execute(SQ3.db, `UPDATE ${tableName} SET Player = ?, Score = ?, Bolters = ?, isFlopper = ?, isSquare = ?, isChance = ? WHERE id = ?`, [playerid, score, bolters, isFlopper, isSquare, isChance, existing.id]);
    } else {
        await SQ3.execute(SQ3.db, `INSERT INTO ${tableName} (Fixture, Hand, Team, Player, Position, Score, Bolters, isFlopper, isSquare, isChance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [gameid, hand, teamid, playerid, position, score, bolters, isFlopper, isSquare, isChance]);
    }
}

// Collect and de-duplicate temporary scores from every user table for a fixture.
async function getAllScoresForFixture(gameid) {
    // Finds all temp score tables for a given game ID and aggregates the scores.
    const tables = await SQ3.fetchAll(SQ3.db, `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'temptable\\_scores${gameid}\\_user%' ESCAPE '\\'`);
    const scoresByEntry = new Map();
    if (tables) {
        for (const table of tables) {
            const scores = await SQ3.fetchAll(SQ3.db, `
                SELECT s.*, p.alias as playerName, t.teamName 
                FROM ${table.name} s 
                LEFT JOIN Players p ON s.Player = p.id
                LEFT JOIN Teams t ON s.Team = t.id
                ORDER BY s.Hand ASC, s.Position ASC
            `);
            if (scores && scores.length) {
                for (const score of scores) {
                    const entryKey = `${score.Team}_${score.Position}_${score.Hand}`;
                    scoresByEntry.set(entryKey, score);
                }
            }
        }
    }
    return Array.from(scoresByEntry.values()).sort((a, b) => {
        return a.Hand - b.Hand || a.Position - b.Position
    });
}

// Return the temporary score entries for one user and game.
async function getTempScoresForUser(gameid, userid) {
    const tableName = `temptable_scores${parseInt(gameid)}_user${parseInt(userid)}`;
    const table = await SQ3.fetchFirst(SQ3.db,
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        tableName)

    if (!table) return []

    return await SQ3.fetchAll(SQ3.db,
        `SELECT Hand, Team, Player, Position, Score, Bolters, isFlopper, isSquare, isChance FROM ${tableName} ORDER BY Hand ASC, Position ASC`)
}

// Import fixtures from a legacy CSV file and adjust dates for home-team nights.
async function importFixturesFromCSV(csvFilePath, compID = 1) {
    const fs = require('fs');
    const teamModel = require('./team');

    if (!fs.existsSync(csvFilePath)) {
        console.error("CSV file not found:", csvFilePath);
        return 0;
    }

    const fileContent = fs.readFileSync(csvFilePath, 'utf8');
    const lines = fileContent.split(/\r?\n/);

    let count = 0;
    for (const line of lines) {
        if (!line.trim()) continue;

        // Simple CSV splitter
        const cols = line.split(',');
        if (cols.length < 3) continue;

        let matchDate = cols[0].replace(/['"]/g, '').trim();
        let homeTeamName = cols[1].replace(/['"]/g, '').trim();
        let awayTeamName = cols[2].replace(/['"]/g, '').trim();

        // Skip potential header row
        if (matchDate.toLowerCase() === 'date' || matchDate.toLowerCase().includes('monday') || matchDate.toLowerCase().includes('date')) {
            continue;
        }

        let homeTeamRow = await teamModel.getTeamIdByName(homeTeamName);
        let awayTeamRow = await teamModel.getTeamIdByName(awayTeamName);

        if (homeTeamRow && awayTeamRow) {
            let finalMatchDate = matchDate;
            try {
                // Lookup home team's play night (Monday = 1, Tuesday = 2, ..., Sunday = 7)
                const nightRow = await teamModel.getTeamHomeNight(homeTeamRow.id);
                if (nightRow && nightRow.home_night) {
                    const daysToAdd = parseInt(nightRow.home_night) - 1;
                    if (daysToAdd >= 0) {
                        // Parse the CSV date (assumed to be a Monday)
                        const dateObj = new Date(matchDate);
                        if (!isNaN(dateObj.getTime())) {
                            dateObj.setDate(dateObj.getDate() + daysToAdd);
                            // Format back to YYYY-MM-DD
                            finalMatchDate = dateObj.toISOString().split('T')[0];
                        }
                    }
                }
            } catch (err) {
                console.error("Error calculating match date:", err);
            }

            await createFixture(homeTeamRow.id, awayTeamRow.id, finalMatchDate, compID);
            count++;
        } else {
            console.warn(`Could not find one or both teams for fixture: ${homeTeamName} vs ${awayTeamName}`);
        }
    }
    console.log(`Successfully imported ${count} fixtures from ${csvFilePath}.`);
    return count;
}

// Update a fixture's status and any supplied home or away score.
async function updateFixtureScore(gameid, homeScore, awayScore, status = 'Completed') {
    let sql = 'UPDATE Fixtures SET status = ?';
    const params = [status];
    if (homeScore !== undefined && homeScore !== null) {
        sql += ', homeScore = ?';
        params.push(homeScore);
    }
    if (awayScore !== undefined && awayScore !== null) {
        sql += ', awayScore = ?';
        params.push(awayScore);
    }
    sql += ' WHERE id = ?';
    params.push(gameid);
    return await SQ3.execute(SQ3.db, sql, params);
}

// Return fixture status and approval details for both participating teams.
async function getFixtureApprovalStatus(fixtureId) {
    await initTable()
    return await SQ3.fetchFirst(SQ3.db, `
        SELECT f.id, f.status, f.homeTeam, f.awayTeam,
            Home.captainId AS homeCaptainId,
            Away.captainId AS awayCaptainId,
            homeApproval.userId AS homeApprovedBy,
            awayApproval.userId AS awayApprovedBy,
            homeApproval.approvedAt AS homeApprovedAt,
            awayApproval.approvedAt AS awayApprovedAt
        FROM Fixtures f
        LEFT JOIN Teams Home ON Home.id = f.homeTeam
        LEFT JOIN Teams Away ON Away.id = f.awayTeam
        LEFT JOIN FixtureApprovals homeApproval ON homeApproval.fixtureId = f.id AND homeApproval.teamId = f.homeTeam
        LEFT JOIN FixtureApprovals awayApproval ON awayApproval.fixtureId = f.id AND awayApproval.teamId = f.awayTeam
        WHERE f.id = ?`, [fixtureId])
}

// Record a team's approval after verifying it belongs to the fixture.
async function approveFixture(fixtureId, teamId, userId) {
    const fixtureInfo = await getFixtureInfo(fixtureId)
    if (!fixtureInfo || (fixtureInfo.homeTeamID !== teamId && fixtureInfo.awayTeamID !== teamId)) {
        throw new Error('User team is not part of this fixture.')
    }
    if (fixtureInfo.status !== 'Provisional') throw new Error('Only provisional scores can be approved.')
    await SQ3.execute(SQ3.db,
        'INSERT OR REPLACE INTO FixtureApprovals(fixtureId, teamId, userId) VALUES (?,?,?)',
        [fixtureId, teamId, userId])
}

// Confirm provisional scores after both teams have approved them.
async function confirmFixture(fixtureId) {
    const approval = await getFixtureApprovalStatus(fixtureId)
    if (!approval || approval.status !== 'Provisional' || !approval.homeApprovedBy || !approval.awayApprovedBy) {
        throw new Error('Both team captains must approve the provisional scores first.')
    }
    await SQ3.execute(SQ3.db, 'UPDATE Fixtures SET status = "Confirmed" WHERE id = ?', [fixtureId])
}

// Generate home-and-away fixtures for every division team pair.
async function generateSeasonFixtures(seasonId, seasonStartDateStr = '2026-09-07') {
    const divisions = [1, 2, 3];
    let createdCount = 0;

    let baseDate = new Date(seasonStartDateStr);
    if (isNaN(baseDate.getTime())) {
        baseDate = new Date('2026-09-07');
    }

    for (const divId of divisions) {
        const teams = await SQ3.fetchAll(SQ3.db, 'SELECT id FROM Teams WHERE division = ?', [divId]);
        if (!teams || teams.length < 2) continue;

        const teamIds = teams.map(t => t.id);
        const pairs = [];

        for (let i = 0; i < teamIds.length; i++) {
            for (let j = 0; j < teamIds.length; j++) {
                if (i !== j) {
                    pairs.push({ home: teamIds[i], away: teamIds[j] });
                }
            }
        }

        let matchDate = new Date(baseDate);
        for (let k = 0; k < pairs.length; k++) {
            const dateStr = matchDate.toISOString().split('T')[0];
            await createFixture(pairs[k].home, pairs[k].away, dateStr, seasonId);
            createdCount++;
            matchDate.setDate(matchDate.getDate() + 7);
        }
    }

    return createdCount;
}

module.exports = {
    initTable,
    getAllFixtures,
    getFixtureStatus,
    getFixtureInfo,
    beginGame,
    createFixture,
    importFixturesFromCSVContent,
    saveTempScore,
    getAllScoresForFixture,
    getTempScoresForUser,
    importFixturesFromCSV,
    groupFixturesByMonth,
    updateFixtureScore,
    getFixtureApprovalStatus,
    approveFixture,
    confirmFixture,
    generateSeasonFixtures
}

// Sum all currently saved temporary scores by fixture and team.
async function getLiveScoreTotals() {
    const tables = await SQ3.fetchAll(SQ3.db, `
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'temptable\\_scores%\\_user%' ESCAPE '\\'`)
    const entries = new Map()

    for (const table of tables) {
        const scores = await SQ3.fetchAll(SQ3.db,
            `SELECT Fixture, Team, Position, Hand, Score FROM ${table.name}`)
        for (const score of scores) {
            entries.set(`${score.Fixture}_${score.Team}_${score.Position}_${score.Hand}`, score)
        }
    }

    return Array.from(entries.values()).reduce((totals, score) => {
        if (!totals[score.Fixture]) totals[score.Fixture] = {}
        totals[score.Fixture][score.Team] = (totals[score.Fixture][score.Team] || 0) + (parseInt(score.Score) || 0)
        return totals
    }, {})
}