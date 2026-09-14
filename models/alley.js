const SQ3 = require('../models/sql')

async function initTable() {
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Alleys \
        (id INTEGER PRIMARY KEY, \
        name TEXT NOT NULL, pub INTEGER, \
        FOREIGN KEY(pub) REFERENCES pub(id))')
}

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

async function createAlley(newAlleyName, pubID) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Alleys(name,pub) VALUES(?,?)', [newAlleyName, pubID])
}

async function getAlleyById(alleyId) {
    return await SQ3.fetchFirst(SQ3.db,
        'SELECT Alleys.id, Alleys.name, Alleys.pub, Pubs.name AS pubName FROM Alleys LEFT JOIN Pubs ON Pubs.id = Alleys.pub WHERE Alleys.id = ?',
        [alleyId])
}

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
