
const SQ3 = require('../models/sql')

async function initTable() {
    // Create a table, if we havent already.
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Pubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
}

async function getAllPubs() {
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Pubs;')
}

async function searchPubList(pubName) {
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Pubs WHERE name=?;', pubName)
}

module.exports = {
    initTable,
    getAllPubs,
    searchPubList
}