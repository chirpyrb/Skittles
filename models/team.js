const SQ3 = require('../models/sql')

async function initTable() {
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Teams (id INTEGER PRIMARY KEY, teamName TEXT NOT NULL, homeAlley INTEGER, division INETGER, FOREIGN KEY(homeAlley) REFERENCES Alleys(id), FOREIGN KEY (division) REFERENCES Divisions(id))')
}

async function getTeamByName(teamName) {
    return await SQ3.fetchFirst(SQ3.db, "SELECT Teams.[teamName], Alleys.[name] AS homeAlley, Divisions.name AS division FROM Alleys INNER JOIN (Divisions INNER JOIN Teams ON Divisions.[ID] = Teams.[division]) ON Alleys.[ID] = Teams.[homeAlley] WHERE Teams.[teamName] = ?;", teamName)
}

async function getTeamIdByName(teamName) {
    return await SQ3.fetchFirst(SQ3.db, "SELECT id FROM Teams WHERE teamName=?", teamName)
}

async function getAllTeams() {
    return await SQ3.fetchAll(SQ3.db, "SELECT Teams.[teamName], Alleys.[name] AS homeAlley, Divisions.name AS division FROM Alleys INNER JOIN (Divisions INNER JOIN Teams ON Divisions.[ID] = Teams.[division]) ON Alleys.[ID] = Teams.[homeAlley];")
}

async function createTeam(newTeamName, newTeamAlley, newTeamDiv) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Teams(teamName,homeAlley,division) VALUES (?,?,?)', [newTeamName, newTeamAlley, newTeamDiv])
}

module.exports = {
    initTable,
    getTeamByName,
    getTeamIdByName,
    getAllTeams,
    createTeam
}
