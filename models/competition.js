const SQ3 = require('../models/sql')

async function initTable() {
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Competitions (id INTEGER PRIMARY KEY, name TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL);')
}

async function getAllCompetitions() {
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Competitions')
}

async function createCompetition(seasonName, seasonStartDate, seasonEndDate) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Competitions(name,startDate,endDate) VALUES (?,?,?)', [seasonName, seasonStartDate, seasonEndDate])
}

module.exports = {
    initTable,
    getAllCompetitions,
    createCompetition
}
