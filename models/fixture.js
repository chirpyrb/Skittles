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
        FOREIGN KEY (homeTeam) REFERENCES Teams(id), \
        FOREIGN KEY (awayTeam) REFERENCES Teams(id), \
        FOREIGN KEY (competition) REFERENCES competitions(id))')
}

async function getAllFixtures() {
    // Returns a list of all fixtures.
    // Probably want to filter this at some point.
    const fixtureList = await SQ3.fetchAll(SQ3.db, "SELECT Fixtures.id, Home.teamName AS homeTeam, Away.teamName AS awayTeam, matchDate, competition FROM Fixtures INNER JOIN Teams Home ON Home.id = Fixtures.homeTeam INNER JOIN Teams Away ON Away.id = Fixtures.awayTeam;")
    return fixtureList
}

async function getFixtureStatus(id) {
    // Returns the status of a given fixture.
    const gameStatus = await SQ3.fetchFirst(SQ3.db, 'SELECT Status FROM Fixtures WHERE id = ?', id)
    return gameStatus.Status
}

async function getFixtureInfo(id) {
    // Returns the fixture summary for a given fixture.
    const fixtureInfo = await SQ3.fetchFirst(SQ3.db, "\
        SELECT Fixtures.id, Home.id AS homeTeamID, Home.teamName AS homeTeam, Away.id AS awayTeamID, Away.teamName AS awayTeam, matchDate, Status, comp.name AS Comp \
        FROM Fixtures \
        INNER JOIN Teams Home ON Home.id = Fixtures.homeTeam \
        INNER JOIN Teams Away ON Away.id = Fixtures.awayTeam \
        INNER JOIN Competitions Comp ON Comp.id = Fixtures.Competition \
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



module.exports = {
    initTable,
    getAllFixtures,
    getFixtureStatus,
    getFixtureInfo,
    beginGame
}