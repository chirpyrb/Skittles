const SQ3 = require('../models/sql')

async function initTable() {
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Divisions (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
    // Ensure Divisions 1, 2, 3 exist
    const divs = await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Divisions');
    if (!divs || divs.length === 0) {
        await SQ3.execute(SQ3.db, 'INSERT INTO Divisions(id, name) VALUES (1, "Division 1"), (2, "Division 2"), (3, "Division 3")');
    }
}

async function getAllDivisions() {
    await initTable()
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Divisions ORDER BY id ASC')
}

async function getDivisionByName(name) {
    return await SQ3.fetchFirst(SQ3.db, 'SELECT id, name FROM Divisions WHERE lower(trim(name)) = lower(trim(?))', [name])
}

async function createDivision(divName) {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Divisions(name) VALUES (?)', [divName])
}

async function getAllTeamsFromDivision(divisionId) {
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Teams WHERE division = ?', [divisionId])
}

async function calculateStandings(seasonId, divisionId) {
    await initTable()
    const teams = await SQ3.fetchAll(SQ3.db, `
        SELECT DISTINCT Teams.id, Teams.teamName AS teamName
        FROM Teams
        INNER JOIN Fixtures ON Fixtures.homeTeam = Teams.id OR Fixtures.awayTeam = Teams.id
        INNER JOIN Competitions ON Competitions.id = Fixtures.competition
        WHERE Fixtures.competition = ? AND Competitions.division = ?`, [seasonId, divisionId])
    
    const teamMap = {};
    (teams || []).forEach(t => {
        teamMap[t.id] = {
            teamId: t.id,
            teamName: t.teamName,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            pinsFor: 0,
            pinsAgainst: 0,
            pinDiff: 0,
            points: 0
        }
    })

    let sql = 'SELECT * FROM Fixtures WHERE homeScore IS NOT NULL AND awayScore IS NOT NULL'
    const params = []
    if (seasonId) {
        sql += ' AND competition = ?'
        params.push(seasonId)
    }

    const completedFixtures = await SQ3.fetchAll(SQ3.db, sql, params);

    (completedFixtures || []).forEach(f => {
        const homeScore = parseInt(f.homeScore) || 0
        const awayScore = parseInt(f.awayScore) || 0

        if (teamMap[f.homeTeam]) {
            const t = teamMap[f.homeTeam]
            t.played++
            t.pinsFor += homeScore
            t.pinsAgainst += awayScore
            if (homeScore > awayScore) {
                t.won++
                t.points += 2
            } else if (homeScore < awayScore) {
                t.lost++
            } else {
                t.drawn++
                t.points += 1
            }
        }

        if (teamMap[f.awayTeam]) {
            const t = teamMap[f.awayTeam]
            t.played++
            t.pinsFor += awayScore
            t.pinsAgainst += homeScore
            if (awayScore > homeScore) {
                t.won++
                t.points += 2
            } else if (awayScore < homeScore) {
                t.lost++
            } else {
                t.drawn++
                t.points += 1
            }
        }
    })

    const standings = Object.values(teamMap)
    standings.forEach(t => {
        t.pinDiff = t.pinsFor - t.pinsAgainst
    })

    standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.pinDiff !== a.pinDiff) return b.pinDiff - a.pinDiff;
        if (b.pinsFor !== a.pinsFor) return b.pinsFor - a.pinsFor;
        return (a.teamName || '').localeCompare(b.teamName || '');
    })

    standings.forEach((t, i) => {
        t.rank = i + 1;
    })

    return standings
}

async function executePromotionAndRelegation(seasonId) {
    const standingsDiv1 = await calculateStandings(seasonId, 1);
    const standingsDiv2 = await calculateStandings(seasonId, 2);
    const standingsDiv3 = await calculateStandings(seasonId, 3);

    const changes = {
        relegatedToDiv2: [],
        promotedToDiv1: [],
        relegatedToDiv3: [],
        promotedToDiv2: []
    };

    // Relegate bottom 2 from Division 1 -> Division 2
    if (standingsDiv1 && standingsDiv1.length > 2) {
        const relegated1 = standingsDiv1.slice(-2);
        for (const t of relegated1) {
            await SQ3.execute(SQ3.db, 'UPDATE Teams SET division = 2 WHERE id = ?', [t.teamId]);
            changes.relegatedToDiv2.push(t.teamName);
        }
    }

    // Promote top 2 from Division 2 -> Division 1
    if (standingsDiv2 && standingsDiv2.length >= 2) {
        const promoted2 = standingsDiv2.slice(0, 2);
        for (const t of promoted2) {
            await SQ3.execute(SQ3.db, 'UPDATE Teams SET division = 1 WHERE id = ?', [t.teamId]);
            changes.promotedToDiv1.push(t.teamName);
        }
    }

    // Relegate bottom 2 from Division 2 -> Division 3
    if (standingsDiv2 && standingsDiv2.length > 4) {
        const relegated2 = standingsDiv2.slice(-2);
        for (const t of relegated2) {
            await SQ3.execute(SQ3.db, 'UPDATE Teams SET division = 3 WHERE id = ?', [t.teamId]);
            changes.relegatedToDiv3.push(t.teamName);
        }
    }

    // Promote top 2 from Division 3 -> Division 2
    if (standingsDiv3 && standingsDiv3.length >= 2) {
        const promoted3 = standingsDiv3.slice(0, 2);
        for (const t of promoted3) {
            await SQ3.execute(SQ3.db, 'UPDATE Teams SET division = 2 WHERE id = ?', [t.teamId]);
            changes.promotedToDiv2.push(t.teamName);
        }
    }

    return changes;
}

module.exports = {
    initTable,
    getAllDivisions,
    getDivisionByName,
    createDivision,
    getAllTeamsFromDivision,
    calculateStandings,
    executePromotionAndRelegation
}
