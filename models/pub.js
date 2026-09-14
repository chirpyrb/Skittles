
const SQ3 = require('../models/sql')

async function initTable() {
    // Create a table, if we havent already.
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Pubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, location TEXT)')
    try { await SQ3.execute(SQ3.db, 'ALTER TABLE Pubs ADD COLUMN location TEXT'); } catch(e) {}
}

async function getAllPubs() {
    return await SQ3.fetchAll(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs;')
}

async function searchPubList(pubName) {
    return await SQ3.fetchAll(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs WHERE name=?;', pubName)
}

async function createPub(newPubName, location) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Pubs(name, location) VALUES(?, ?)', [newPubName, location])
}

async function getPubById(pubId) {
    return await SQ3.fetchFirst(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs WHERE id = ?', [pubId])
}

async function updatePub(pubId, name, location) {
    return await SQ3.execute(SQ3.db, 'UPDATE Pubs SET name = ?, location = ? WHERE id = ?', [name, location, pubId])
}

module.exports = {
    initTable,
    getAllPubs,
    searchPubList,
    createPub,
    getPubById,
    updatePub
}