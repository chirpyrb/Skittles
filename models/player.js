const SQ3 = require('../models/sql')

// Keep the legacy initializer available; the central schema creates this table.
async function initTable() {
}

// Return approved players belonging to a team.
async function getPlayerListForTeam(teamID) {
    // Returns a list of players for a given team
    return await SQ3.fetchAll(SQ3.db,
        'SELECT * FROM Players WHERE team = ? AND approved = 1;',
        teamID
    )
}

// Return approved player names for a team name.
async function getPlayersOnTeamByName(teamName) {
    return await SQ3.fetchAll(SQ3.db,
        'SELECT Players.firstName, Players.secondName, Players.alias FROM Teams INNER JOIN Players ON Teams.id = Players.team WHERE Teams.teamName = ? AND Players.approved = 1;',
        [teamName])
}

// Insert a player and assign the player's approval state and team.
async function createPlayer(firstName, secondName, alias, teamID, approved = 1) {
    return await SQ3.execute(SQ3.db, "INSERT INTO Players(firstName,secondName,alias,team,approved) VALUES(?,?,?,?,?)", [firstName, secondName, alias, teamID, approved])
}

// Update a player's identifying and display information.
async function updatePlayer(id, firstName, secondName, alias) {
    return await SQ3.execute(SQ3.db, "UPDATE Players SET firstName = ?, secondName = ?, alias = ? WHERE id = ?", [firstName, secondName, alias, id])
}

// Return all players with their team names for administrative views.
async function getAllPlayers() {
    return await SQ3.fetchAll(SQ3.db, `SELECT P.id, P.firstName, P.secondName, P.alias, P.team AS teamId, P.approved, T.teamName FROM Players P LEFT JOIN Teams T ON P.team = T.id ORDER BY P.secondName ASC, P.firstName ASC;`)
}

// Calculate player scoring totals and per-game averages for selected competitions.
async function getPlayerStatsForTeamSeason(teamId, competitionIds) {
    const scorecard = require('./scorecard')
    await scorecard.initTable()
    if (!competitionIds || competitionIds.length === 0) return []

    const placeholders = competitionIds.map(() => '?').join(',')
    const rows = await SQ3.fetchAll(SQ3.db, `
        SELECT P.id, P.firstName, P.secondName, P.alias,
            COUNT(DISTINCT S.fixtureId) AS gamesPlayed,
            COALESCE(SUM(S.score), 0) AS totalPins,
            COALESCE(SUM(S.bolters), 0) AS bolters,
            COALESCE(SUM(S.isFlopper), 0) AS floppers,
            COALESCE(SUM(S.isSquare), 0) AS squares,
            COALESCE(SUM(S.isChance), 0) AS chances
        FROM Players P
        LEFT JOIN Scorecards S ON S.playerId = P.id
            AND S.fixtureId IN (
                SELECT id FROM Fixtures
                WHERE competition IN (${placeholders})
                    AND status IN ('Provisional', 'Confirmed', 'Completed')
            )
        WHERE P.team = ? AND P.approved = 1
        GROUP BY P.id, P.firstName, P.secondName, P.alias
        ORDER BY P.secondName ASC, P.firstName ASC`,
        [...competitionIds, teamId])

    return rows.map(row => {
        const gamesPlayed = Number(row.gamesPlayed) || 0
        const totalPins = Number(row.totalPins) || 0
        const bolters = Number(row.bolters) || 0
        const floppers = Number(row.floppers) || 0
        const squares = Number(row.squares) || 0
        const chances = Number(row.chances) || 0
        return {
            ...row,
            gamesPlayed,
            totalPins,
            scoreAverage: gamesPlayed ? Number((totalPins / gamesPlayed).toFixed(2)) : 0,
            bolters,
            bolterAverage: gamesPlayed ? Number((bolters / gamesPlayed).toFixed(2)) : 0,
            floppers,
            squares,
            chances
        }
    })
}

// Mark a player as approved for scorecard selection.
async function approvePlayer(playerId) {
    return await SQ3.execute(SQ3.db, 'UPDATE Players SET approved = 1 WHERE id = ?', [playerId])
}

module.exports = {
    initTable,
    getPlayerListForTeam,
    getPlayersOnTeamByName,
    createPlayer,
    updatePlayer,
    getAllPlayers,
    getPlayerStatsForTeamSeason,
    approvePlayer
}