const SQ3 = require('../models/sql')

// Keep the legacy initializer available; the central schema creates this table.
async function initTable() {
}

// Find a team by name and return readable alley and division details.
async function getTeamByName(teamName) {
    const t = await SQ3.fetchFirst(SQ3.db, "SELECT Teams.id, Teams.teamName, Teams.homeAlley AS homeAlleyId, Teams.division AS divisionId, Teams.home_night AS homeNight, Alleys.name AS alleyName, Divisions.name AS divisionName FROM Teams LEFT JOIN Alleys ON Teams.homeAlley = Alleys.id LEFT JOIN Divisions ON Teams.division = Divisions.id WHERE Teams.teamName = ?;", [teamName])
    if (!t) return null;

    return {
        id: t.id,
        teamName: t.teamName,
        homeAlleyId: t.homeAlleyId,
        homeAlley: t.alleyName || (t.homeAlleyId ? `Alley #${t.homeAlleyId}` : '-'),
        divisionId: t.divisionId,
        division: t.divisionName || (t.divisionId ? `Division ${t.divisionId}` : '-'),
        homeNight: t.homeNight
    }
}

// Return only the ID of a team with the supplied name.
async function getTeamIdByName(teamName) {
    const res = await SQ3.fetchFirst(SQ3.db, "SELECT id FROM Teams WHERE teamName=?", [teamName])
    return res ? res.id : null;
}

// Find a fixture team using normalized apostrophes and case-insensitive matching.
async function getTeamForFixtureByName(teamName) {
    const normalizedTeamName = String(teamName).replace(/[\u2018\u2019]/g, "'")
    return await SQ3.fetchFirst(SQ3.db,
        "SELECT id, teamName, division, home_night FROM Teams WHERE lower(trim(replace(replace(teamName, char(8217), char(39)), char(8216), char(39)))) = lower(trim(?))",
        [normalizedTeamName])
}

// Return all teams with readable alley, division, and home-night fields.
async function getAllTeams() {
    const teams = await SQ3.fetchAll(SQ3.db, "SELECT Teams.id, Teams.teamName, Teams.homeAlley AS homeAlleyId, Teams.division AS divisionId, Teams.home_night AS homeNight, Alleys.name AS alleyName, Divisions.name AS divisionName FROM Teams LEFT JOIN Alleys ON Teams.homeAlley = Alleys.id LEFT JOIN Divisions ON Teams.division = Divisions.id ORDER BY Teams.teamName ASC;")
    
    return (teams || []).map(t => {
        const aName = t.alleyName || (t.homeAlleyId ? `Alley #${t.homeAlleyId}` : '-');
        const dName = t.divisionName || (t.divisionId ? `Division ${t.divisionId}` : '-');
        return {
            id: t.id,
            teamName: t.teamName || `Team #${t.id}`,
            homeAlley: aName,
            division: dName,
            homeNight: t.homeNight
        }
    })
}

// Insert a team with its home alley and division.
async function createTeam(newTeamName, newTeamAlley, newTeamDiv) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Teams(teamName,homeAlley,division) VALUES (?,?,?)', [newTeamName, newTeamAlley, newTeamDiv])
}

// Update a team's name, home alley, division, and home night.
async function updateTeam(teamId, teamName, homeAlley, divisionId, homeNight) {
    return await SQ3.execute(SQ3.db,
        'UPDATE Teams SET teamName = ?, homeAlley = ?, division = ?, home_night = ? WHERE id = ?',
        [teamName, homeAlley, divisionId, homeNight, teamId])
}

// Count players and fixtures that reference a team.
async function getTeamDependencyCounts(teamId) {
    const players = await SQ3.fetchFirst(SQ3.db, 'SELECT COUNT(*) AS count FROM Players WHERE team = ?', [teamId])
    const fixtures = await SQ3.fetchFirst(SQ3.db, 'SELECT COUNT(*) AS count FROM Fixtures WHERE homeTeam = ? OR awayTeam = ?', [teamId, teamId])
    return {
        players: players ? players.count : 0,
        fixtures: fixtures ? fixtures.count : 0
    }
}

// Detach players and delete a team within one transaction.
async function deleteTeam(teamId) {
    await SQ3.execute(SQ3.db, 'BEGIN TRANSACTION')
    try {
        await SQ3.execute(SQ3.db, 'UPDATE Players SET team = NULL WHERE team = ?', [teamId])
        await SQ3.execute(SQ3.db, 'DELETE FROM Teams WHERE id = ?', [teamId])
        await SQ3.execute(SQ3.db, 'COMMIT')
    } catch (error) {
        await SQ3.execute(SQ3.db, 'ROLLBACK')
        throw error
    }
}

// Return the raw team row for an ID.
async function getTeamById(id) {
    return await SQ3.fetchFirst(SQ3.db, "SELECT * FROM Teams WHERE id = ?", id)
}

// Link a user account as the team's captain.
async function setTeamCaptain(teamId, userId) {
    return await SQ3.execute(SQ3.db, "UPDATE Teams SET captainId = ? WHERE id = ?", [userId, teamId])
}

// Return the weekday number assigned to a team's home night.
async function getTeamHomeNight(teamId) {
    return await SQ3.fetchFirst(SQ3.db, "SELECT home_night FROM Teams WHERE id = ?", teamId)
}

module.exports = {
    initTable,
    getTeamByName,
    getTeamIdByName,
    getTeamForFixtureByName,
    getAllTeams,
    createTeam,
    updateTeam,
    getTeamDependencyCounts,
    deleteTeam,
    getTeamById,
    setTeamCaptain,
    getTeamHomeNight
}
