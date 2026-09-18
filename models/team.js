const SQ3 = require('../models/sql')

// Keep the legacy initializer available; the central schema creates this table.
async function initTable() {
}

// Find a team by name and return readable alley, division, and league details.
async function getTeamByName(teamName) {
    const t = await SQ3.fetchFirst(SQ3.db, "SELECT Teams.id, Teams.teamName, Teams.homeAlley AS homeAlleyId, Teams.division AS divisionId, Teams.leagueId, Teams.home_night AS homeNight, Alleys.name AS alleyName, Divisions.name AS divisionName, Leagues.name AS leagueName FROM Teams LEFT JOIN Alleys ON Teams.homeAlley = Alleys.id LEFT JOIN Divisions ON Teams.division = Divisions.id LEFT JOIN Leagues ON Teams.leagueId = Leagues.id WHERE Teams.teamName = ?;", [teamName])
    if (!t) return null;

    return {
        id: t.id,
        teamName: t.teamName,
        homeAlleyId: t.homeAlleyId,
        homeAlley: t.alleyName || (t.homeAlleyId ? `Alley #${t.homeAlleyId}` : '-'),
        divisionId: t.divisionId,
        division: t.divisionName || (t.divisionId ? `Division ${t.divisionId}` : '-'),
        leagueId: t.leagueId,
        league: t.leagueName || (t.leagueId ? `League #${t.leagueId}` : '-'),
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
        "SELECT id, teamName, division, leagueId, home_night FROM Teams WHERE lower(trim(replace(replace(teamName, char(8217), char(39)), char(8216), char(39)))) = lower(trim(?))",
        [normalizedTeamName])
}

// Return all teams with readable alley, division, league, and home-night fields.
async function getAllTeams() {
    const teams = await SQ3.fetchAll(SQ3.db, "SELECT Teams.id, Teams.teamName, Teams.homeAlley AS homeAlleyId, Teams.division AS divisionId, Teams.leagueId, Teams.home_night AS homeNight, Alleys.name AS alleyName, Divisions.name AS divisionName, Leagues.name AS leagueName FROM Teams LEFT JOIN Alleys ON Teams.homeAlley = Alleys.id LEFT JOIN Divisions ON Teams.division = Divisions.id LEFT JOIN Leagues ON Teams.leagueId = Leagues.id ORDER BY Teams.teamName ASC;")
    
    return (teams || []).map(t => {
        const aName = t.alleyName || (t.homeAlleyId ? `Alley #${t.homeAlleyId}` : '-');
        const dName = t.divisionName || (t.divisionId ? `Division ${t.divisionId}` : '-');
        const lName = t.leagueName || (t.leagueId ? `League #${t.leagueId}` : '-');
        return {
            id: t.id,
            teamName: t.teamName || `Team #${t.id}`,
            homeAlley: aName,
            division: dName,
            leagueId: t.leagueId,
            league: lName,
            homeNight: t.homeNight
        }
    })
}

// Fetch all teams belonging to a specific league.
async function getTeamsForLeague(leagueId) {
    const teams = await SQ3.fetchAll(SQ3.db,
        "SELECT Teams.id, Teams.teamName, Teams.homeAlley AS homeAlleyId, Alleys.name AS alleyName " +
        "FROM Teams " +
        "LEFT JOIN Alleys ON Teams.homeAlley = Alleys.id " +
        "WHERE Teams.leagueId = ? " +
        "ORDER BY Teams.teamName ASC;", [leagueId])

    return (teams || []).map(t => ({
        id: t.id,
        teamName: t.teamName,
        homeAlley: t.alleyName || (t.homeAlleyId ? `Alley #${t.homeAlleyId}` : '-')
    }))
}

// Insert a team with its home alley and league.
async function createTeam(newTeamName, newTeamAlley, leagueId) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Teams(teamName,homeAlley,leagueId) VALUES (?,?,?)', [newTeamName, newTeamAlley, leagueId])
}

// Update a team's name, home alley, division, home night, and league.
async function updateTeam(teamId, teamName, homeAlley, divisionId, homeNight, leagueId) {
    return await SQ3.execute(SQ3.db,
        'UPDATE Teams SET teamName = ?, homeAlley = ?, division = ?, home_night = ?, leagueId = ? WHERE id = ?',
        [teamName, homeAlley, divisionId, homeNight, leagueId, teamId])
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
    getTeamsForLeague,
    createTeam,
    updateTeam,
    getTeamDependencyCounts,
    deleteTeam,
    getTeamById,
    setTeamCaptain,
    getTeamHomeNight
}
