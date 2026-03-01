const SQ3 = require('../models/sql')

async function initTable() {
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Alleys (id INTEGER PRIMARY KEY, name TEXT NOT NULL, pub INTEGER, FOREIGN KEY(pub) REFERENCES pub(id))')
}

async function getAlleys(alleySearchName) {
    let SQL = ""
    let params = {}
    if (alleySearchName != null && alleySearchName !== '') {
        SQL = 'SELECT Pubs.name, Alleys.name FROM Pubs INNER JOIN Alleys ON Pubs.id = Alleys.pub WHERE Alleys.name = ?'
        params = alleySearchName
    } else {
        SQL = 'SELECT Pubs.name AS PubName, Alleys.name AS AlleyName FROM Pubs INNER JOIN Alleys ON Pubs.id = Alleys.pub'
    }
    return await SQ3.fetchAll(SQ3.db, SQL, params)
}

async function createAlley(newAlleyName, pubID) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Alleys(name,pub) VALUES(?,?)', [newAlleyName, pubID])
}

module.exports = {
    initTable,
    getAlleys,
    createAlley
}
