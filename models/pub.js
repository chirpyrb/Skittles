
const SQ3 = require('../models/sql')

// Keep the legacy initializer available; the central schema creates this table.
async function initTable() {
}

// Helper to attach alleys and teams to pub objects
async function attachAlleysAndTeams(pubs) {
    if (!pubs || !pubs.length) return []
    for (const pub of pubs) {
        const alleys = await SQ3.fetchAll(SQ3.db, `
            SELECT id, name FROM Alleys WHERE pub = ? ORDER BY name ASC
        `, [pub.id])

        pub.alleys = []
        for (const alley of alleys) {
            const teams = await SQ3.fetchAll(SQ3.db, `
                SELECT t.id, t.teamName, d.name AS homeNight, c.name AS divisionName
                FROM Teams t
                LEFT JOIN Days d ON d.id = t.home_night
                LEFT JOIN Competitions c ON c.id = t.division
                WHERE t.homeAlley = ?
                ORDER BY t.teamName ASC
            `, [alley.id])

            alley.teams = teams || []
            pub.alleys.push(alley)
        }

        pub.teams = pub.alleys.flatMap(a => a.teams)
    }
    return pubs
}

// Return all pubs with their alleys and home teams.
async function getAllPubs() {
    const pubs = await SQ3.fetchAll(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs ORDER BY name ASC;')
    return await attachAlleysAndTeams(pubs)
}

// Find pubs by search name with their alleys and teams.
async function searchPubList(pubName) {
    const term = String(pubName || '').trim()
    const pubs = await SQ3.fetchAll(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs WHERE lower(name) LIKE lower(?);', [`%${term}%`])
    return await attachAlleysAndTeams(pubs)
}

// Insert a pub and its location.
async function createPub(newPubName, location) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Pubs(name, location) VALUES(?, ?)', [newPubName, location])
}

// Return one pub by ID with a normalized location value.
async function getPubById(pubId) {
    const pub = await SQ3.fetchFirst(SQ3.db, 'SELECT id, name, COALESCE(location, "") AS location FROM Pubs WHERE id = ?', [pubId])
    if (!pub) return null
    const result = await attachAlleysAndTeams([pub])
    return result[0]
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