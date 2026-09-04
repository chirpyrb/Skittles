const SQ3 = require('../models/sql')

async function initTable() {
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Teams \
        (id INTEGER PRIMARY KEY, \
        teamName TEXT NOT NULL, \
        homeAlley INTEGER, \
        division INETGER, \
        home_night INTEGER, \
        FOREIGN KEY(homeAlley) REFERENCES Alleys(id), \
        FOREIGN KEY (division) REFERENCES Divisions(id), \
        FOREIGN KEY (home_night) REFERENCES Day(id))')
}

async function getTeamByName(teamName) {
    const t = await SQ3.fetchFirst(SQ3.db, "SELECT Teams.id, Teams.teamName, Teams.homeAlley AS homeAlleyId, Teams.division AS divisionId, Alleys.name AS alleyName, Divisions.name AS divisionName FROM Teams LEFT JOIN Alleys ON Teams.homeAlley = Alleys.id LEFT JOIN Divisions ON Teams.division = Divisions.id WHERE Teams.teamName = ?;", [teamName])
    if (!t) return null;

    let alleyName = t.alleyName;
    if (!alleyName && t.homeAlleyId) {
        const a = await SQ3.fetchFirst(SQ3.db, "SELECT name FROM Alleys WHERE id = ?", [t.homeAlleyId])
        alleyName = a ? a.name : `Alley #${t.homeAlleyId}`;
    }

    let divisionName = t.divisionName;
    if (!divisionName && t.divisionId) {
        const d = await SQ3.fetchFirst(SQ3.db, "SELECT name FROM Divisions WHERE id = ?", [t.divisionId])
        divisionName = d ? d.name : `Division ${t.divisionId}`;
    }

    return {
        id: t.id,
        teamName: t.teamName,
        homeAlley: alleyName || '-',
        division: divisionName || '-'
    }
}

async function getTeamIdByName(teamName) {
    const res = await SQ3.fetchFirst(SQ3.db, "SELECT id FROM Teams WHERE teamName=?", [teamName])
    return res ? res.id : null;
}

async function getAllTeams() {
    const teams = await SQ3.fetchAll(SQ3.db, "SELECT Teams.id, Teams.teamName, Teams.homeAlley AS homeAlleyId, Teams.division AS divisionId, Alleys.name AS alleyName, Divisions.name AS divisionName FROM Teams LEFT JOIN Alleys ON Teams.homeAlley = Alleys.id LEFT JOIN Divisions ON Teams.division = Divisions.id ORDER BY Teams.teamName ASC;")
    
    const alleys = await SQ3.fetchAll(SQ3.db, "SELECT * FROM Alleys;")
    const alleyMap = {}
    if (alleys) {
        alleys.forEach(a => {
            if (a.id) alleyMap[a.id] = a.name || a.AlleyName;
        })
    }

    const divs = await SQ3.fetchAll(SQ3.db, "SELECT * FROM Divisions;")
    const divMap = {}
    if (divs) {
        divs.forEach(d => {
            if (d.id) divMap[d.id] = d.name;
        })
    }

    return (teams || []).map(t => {
        const aName = t.alleyName || alleyMap[t.homeAlleyId] || (t.homeAlleyId ? `Alley #${t.homeAlleyId}` : '-');
        const dName = t.divisionName || divMap[t.divisionId] || (t.divisionId ? `Division ${t.divisionId}` : '-');
        return {
            id: t.id,
            teamName: t.teamName || `Team #${t.id}`,
            homeAlley: aName,
            division: dName
        }
    })
}

async function createTeam(newTeamName, newTeamAlley, newTeamDiv) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Teams(teamName,homeAlley,division) VALUES (?,?,?)', [newTeamName, newTeamAlley, newTeamDiv])
}

async function getTeamById(id) {
    return await SQ3.fetchFirst(SQ3.db, "SELECT * FROM Teams WHERE id = ?", id)
}

async function setTeamCaptain(teamId, userId) {
    return await SQ3.execute(SQ3.db, "UPDATE Teams SET captainId = ? WHERE id = ?", [userId, teamId])
}

async function getTeamHomeNight(teamId) {
    return await SQ3.fetchFirst(SQ3.db, "SELECT home_night FROM Teams WHERE id = ?", teamId)
}

module.exports = {
    initTable,
    getTeamByName,
    getTeamIdByName,
    getAllTeams,
    createTeam,
    getTeamById,
    setTeamCaptain,
    getTeamHomeNight
}
