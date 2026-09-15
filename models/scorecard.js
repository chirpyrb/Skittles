const SQ3 = require('../models/sql')

// Keep the legacy initializer available; the central schema creates this table.
async function initTable() {
}

// Validate, replace, and save the final scores for one fixture and team.
async function saveFinalScores(fixtureId, teamId, userId, playerScores) {
    await initTable()
    const playerIds = playerScores.map(entry => entry.playerId).filter(Boolean)
    if (playerIds.length) {
        const placeholders = playerIds.map(() => '?').join(',')
        const approvedPlayers = await SQ3.fetchAll(SQ3.db,
            `SELECT id FROM Players WHERE team = ? AND approved = 1 AND id IN (${placeholders})`,
            [teamId, ...playerIds])
        const approvedIds = new Set(approvedPlayers.map(player => player.id))
        if (playerIds.some(playerId => !approvedIds.has(playerId))) {
            throw new Error('Only approved players can be entered on a scorecard.')
        }
    }
    // Remove existing scores for this fixture and team to avoid duplicates on re-submission
    await SQ3.execute(SQ3.db, `DELETE FROM Scorecards WHERE fixtureId = ? AND teamId = ?`, [fixtureId, teamId])

    for (const entry of playerScores) {
        await SQ3.execute(SQ3.db,
            `INSERT INTO Scorecards (fixtureId, teamId, userId, playerIndex, playerId, handNumber, score, bolters, isFlopper, isSquare, isChance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [fixtureId, teamId, userId, entry.playerIndex, entry.playerId, entry.handNumber, entry.score, entry.bolters, entry.isFlopper, entry.isSquare, entry.isChance]
        )
    }
}

// Return all saved scorecard rows for a fixture.
async function getScorecardsForFixture(fixtureId) {
    await initTable()
    return await SQ3.fetchAll(SQ3.db, `SELECT * FROM Scorecards WHERE fixtureId = ?`, [fixtureId])
}

module.exports = {
    initTable,
    saveFinalScores,
    getScorecardsForFixture
}