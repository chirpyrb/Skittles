const SQ3 = require('../models/sql')

async function initTable() {
    await SQ3.execute(SQ3.db,
        `CREATE TABLE IF NOT EXISTS Scorecards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fixtureId INTEGER,
            teamId INTEGER,
            userId INTEGER,
            playerIndex INTEGER,
            playerId INTEGER,
            handNumber INTEGER,
            score INTEGER,
            bolters INTEGER,
            FOREIGN KEY (fixtureId) REFERENCES Fixtures(id),
            FOREIGN KEY (teamId) REFERENCES Teams(id)
        )`
    )
}

async function saveFinalScores(fixtureId, teamId, userId, playerScores) {
    await initTable()
    // Remove existing scores for this fixture and team to avoid duplicates on re-submission
    await SQ3.execute(SQ3.db, `DELETE FROM Scorecards WHERE fixtureId = ? AND teamId = ?`, [fixtureId, teamId])

    for (const entry of playerScores) {
        await SQ3.execute(SQ3.db,
            `INSERT INTO Scorecards (fixtureId, teamId, userId, playerIndex, playerId, handNumber, score, bolters)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [fixtureId, teamId, userId, entry.playerIndex, entry.playerId, entry.handNumber, entry.score, entry.bolters]
        )
    }
}

async function getScorecardsForFixture(fixtureId) {
    await initTable()
    return await SQ3.fetchAll(SQ3.db, `SELECT * FROM Scorecards WHERE fixtureId = ?`, [fixtureId])
}

module.exports = {
    initTable,
    saveFinalScores,
    getScorecardsForFixture
}