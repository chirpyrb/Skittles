const SQ3 = require('../models/sql')

// Keep the legacy initializer available; the central schema creates this table.
async function initTable() {
}

// Return alleys, optionally filtered by alley name and including pub details.
async function getAlleys(alleySearchName) {
    let SQL = ""
    let params = {}
    if (alleySearchName != null && alleySearchName !== '') {
        SQL = 'SELECT Alleys.id, Pubs.name AS PubName, Alleys.name AS AlleyName, Alleys.name AS name FROM Pubs \
        INNER JOIN Alleys ON Pubs.id = Alleys.pub WHERE Alleys.name = ?'
        params = alleySearchName
    } else {
        SQL = 'SELECT Alleys.id, Pubs.name AS PubName, Alleys.name AS AlleyName, Alleys.name AS name FROM Pubs \
        INNER JOIN Alleys ON Pubs.id = Alleys.pub'
    }
    return await SQ3.fetchAll(SQ3.db, SQL, params)
}

// Insert a new alley and associate it with a pub.
async function createAlley(newAlleyName, pubID) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Alleys(name,pub) VALUES(?,?)', [newAlleyName, pubID])
}

// Return one alley together with its pub name.
async function getAlleyById(alleyId) {
    return await SQ3.fetchFirst(SQ3.db,
        'SELECT Alleys.id, Alleys.name, Alleys.pub, Pubs.name AS pubName FROM Alleys LEFT JOIN Pubs ON Pubs.id = Alleys.pub WHERE Alleys.id = ?',
        [alleyId])
}

// Update an alley's name and linked pub.
async function updateAlley(alleyId, name, pubId) {
    return await SQ3.execute(SQ3.db, 'UPDATE Alleys SET name = ?, pub = ? WHERE id = ?', [name, pubId, alleyId])
}

module.exports = {
    initTable,
    getAlleys,
    createAlley,
    getAlleyById,
    updateAlley
}
