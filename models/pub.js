
const SQ3 = require('../models/sql')

// Keep the legacy initializer available; the central schema creates this table.
async function initTable() {
}

// Return all pubs with an empty string when location is not recorded.
async function getAllPubs() {
    return await SQ3.fetchAll(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs;')
}

// Find pubs by their exact name.
async function searchPubList(pubName) {
    return await SQ3.fetchAll(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs WHERE name=?;', pubName)
}

// Insert a pub and its location.
async function createPub(newPubName, location) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Pubs(name, location) VALUES(?, ?)', [newPubName, location])
}

// Return one pub by ID with a normalized location value.
async function getPubById(pubId) {
    return await SQ3.fetchFirst(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs WHERE id = ?', [pubId])
}

// Update a pub's name and location.
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