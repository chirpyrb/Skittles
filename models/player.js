const SQ3 = require('../models/sql')

async function initTable() {
    // Create a table, if we havent already.
    await SQ3.execute(SQ3.db,
        'CREATE TABLE IF NOT EXISTS Players \
        (id INTEGER PRIMARY KEY, \
        firstName TEXT NOT NULL, \
        secondName TEXT NOT NULL, \
        alias TEXT NOT NULL, \
        team INTEGER, FOREIGN KEY (team) REFERENCES Teams(id))')

}

async function getPlayerListForTeam(teamID) {
    // Returns a list of players for a given team
    return await SQ3.fetchAll(SQ3.db,
        'SELECT * FROM Players WHERE team = ?;',
        teamID
    )
}

async function getPlayersOnTeamByName(teamName) {
    return await SQ3.fetchAll(SQ3.db, `SELECT Players.firstName, Players.secondName, Players.alias FROM Teams INNER JOIN Players ON Teams.id = Players.team WHERE Teams.teamName = '${teamName}';`)
}

async function createPlayer(firstName, secondName, alias, teamID) {
    return await SQ3.execute(SQ3.db, "INSERT INTO Players(firstName,secondName,alias,team) VALUES(?,?,?,?)", [firstName, secondName, alias, teamID])
}

module.exports = {
    initTable,
    getPlayerListForTeam,
    getPlayersOnTeamByName,
    createPlayer
}