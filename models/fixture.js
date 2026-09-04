const SQ3 = require('../models/sql')

async function initTable() {
    // Create the table, if we havent already.
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Fixtures \
        (id INTEGER PRIMARY KEY, \
        homeTeam INTEGER, \
        awayTeam INTEGER, \
        competition INTEGER, \
        matchDate TEXT NOT NULL, \
        status TEXT, \
        homeScore INTEGER, \
        awayScore INTEGER, \
        FOREIGN KEY (homeTeam) REFERENCES Teams(id), \
        FOREIGN KEY (awayTeam) REFERENCES Teams(id), \
        FOREIGN KEY (competition) REFERENCES competitions(id))')
    try { await SQ3.execute(SQ3.db, 'ALTER TABLE Fixtures ADD COLUMN homeScore INTEGER'); } catch(e) {}
    try { await SQ3.execute(SQ3.db, 'ALTER TABLE Fixtures ADD COLUMN awayScore INTEGER'); } catch(e) {}
}

async function getAllFixtures() {
    // Returns a list of all fixtures.
    let fixtureList = await SQ3.fetchAll(SQ3.db,
        "SELECT Fixtures.id, \
        Fixtures.status, \
        Fixtures.homeScore, \
        Fixtures.awayScore, \
        Home.id as homeTeamID, \
        Away.id as awayTeamID, \
        Home.teamName AS homeTeam, \
        Away.teamName AS awayTeam, \
        Home.home_night AS matchDay, \
        matchDate, \
        competition \
        FROM Fixtures \
        INNER JOIN Teams Home ON Home.id = Fixtures.homeTeam \
        INNER JOIN Teams Away ON Away.id = Fixtures.awayTeam \
        ;")

    // SQLITE doesnt have a specific date type.
    // So format it here so we can sort later.
    fixtureList = formatFixtureDate(fixtureList)
    return fixtureList
}

async function getAllFixturesByTeamID(teamID) {
    // Returns a list of all fixtures for a given team ID.
    const fixtureList = await SQ3.fetchAll(SQ3.db,
        "SELECT Fixtures.id, \
        Fixtures.status, \
        Fixtures.homeScore, \
        Fixtures.awayScore, \
        Home.id as homeTeamID, \
        Away.id as awayTeamID, \
        Home.teamName AS homeTeam, \
        Away.teamName AS awayTeam, \
        Home.home_night AS matchDay, \
        matchDate, \
        competition \
        FROM Fixtures \
        INNER JOIN Teams Home ON Home.id = Fixtures.homeTeam \
        INNER JOIN Teams Away ON Away.id = Fixtures.awayTeam \
        WHERE Fixtures.homeTeam = ? OR Fixtures.awayTeam = ?;",
        [teamID, teamID])

    // SQLITE doesnt have a specific date type.
    // So format it here so we can sort later.
    fixtureList = formatFixtureDate(fixtureList)
    return fixtureList
}

function sortFixturesByDate(fixtureList) {
    // Sorts a list of fixtures by date.
    fixtureList.sort((a, b) => a.matchDate - b.matchDate)
    return fixtureList
}

function formatFixtureDate(fixtureList) {
    // Formats the date of a fixture.
    for (let f of fixtureList) {
        f.matchDate = new Date(f.matchDate)
        f.matchDate.setDate(f.matchDate.getDate() + f.matchDay - 1)
    }
    return fixtureList
}

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
    return groupedFixtures
}

async function getFixtureStatus(id) {
    // Returns the status of a given fixture.
    const gameStatus = await SQ3.fetchFirst(SQ3.db, 'SELECT Status FROM Fixtures WHERE id = ?', id)
    return gameStatus.Status
}

async function getFixtureInfo(id) {
    // Returns the fixture summary for a given fixture.
    const fixtureInfo = await SQ3.fetchFirst(SQ3.db, "\
        SELECT Fixtures.id, \
        Home.id AS homeTeamID, \
        Home.teamName AS homeTeam, \
        Away.id AS awayTeamID, \
        Away.teamName AS awayTeam, \
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

async function createFixture(homeTeam, awayTeam, matchDate, comp) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Fixtures(homeTeam,awayTeam,matchDate,competition) VALUES (?,?,?,?);', [homeTeam, awayTeam, matchDate, comp])
}
async function saveTempScore(gameid, userid, hand, teamid, playerid, position, score, bolters) {
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
        await SQ3.execute(SQ3.db, `UPDATE ${tableName} SET Player = ?, Score = ?, Bolters = ? WHERE id = ?`, [playerid, score, bolters, existing.id]);
    } else {
        await SQ3.execute(SQ3.db, `INSERT INTO ${tableName} (Fixture, Hand, Team, Player, Position, Score, Bolters) VALUES (?, ?, ?, ?, ?, ?, ?)`, [gameid, hand, teamid, playerid, position, score, bolters]);
    }
}

async function getAllScoresForFixture(gameid) {
    // Finds all temp score tables for a given game ID and aggregates the scores.
    const tables = await SQ3.fetchAll(SQ3.db, `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'temptable\\_scores${gameid}\\_user%' ESCAPE '\\'`);
    let allScores = [];
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
                allScores = allScores.concat(scores);
            }
        }
    }
    return allScores;
}

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

module.exports = {
    initTable,
    getAllFixtures,
    getFixtureStatus,
    getFixtureInfo,
    beginGame,
    createFixture,
    saveTempScore,
    getAllScoresForFixture,
    importFixturesFromCSV,
    groupFixturesByMonth,
    updateFixtureScore
}