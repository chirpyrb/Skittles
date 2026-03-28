const SQ3 = require('../models/sql')


async function initTable() {
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Divisions (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
}

async function getAllDivisions() {
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Divisions')
}

async function createDivision(divName) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Divisions(name) VALUES (?)', divName)
}

async function getAllTeamsFromDivision(divisionId) {
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Teams WHERE id = ?', divisionId)
}

module.exports = {
    initTable,
    getAllDivisions,
    createDivision,
    getAllTeamsFromDivision
}
