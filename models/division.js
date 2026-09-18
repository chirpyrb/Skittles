const SQ3 = require('../models/sql')

// Keep the legacy initializer available without creating league data.
async function initTable() {
}

// Return all divisions in numeric order.
async function getAllDivisions() {
    await initTable()
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Divisions ORDER BY id ASC')
}

async function getDivisionsForSeason(seasonId) {
    return await SQ3.fetchAll(SQ3.db,
        'SELECT * FROM Divisions WHERE seasonId = ? ORDER BY name ASC',
        [seasonId])
}

// Find a division by name without being sensitive to case or surrounding spaces.
async function getDivisionByName(name) {
    return await SQ3.fetchFirst(SQ3.db, 'SELECT id, name FROM Divisions WHERE lower(trim(name)) = lower(trim(?))', [name])
}

// Insert a new named division.
async function createDivision(divName, seasonId = null) {
    const raw = Array.isArray(divName) ? divName[0] : divName
    const name = String(raw ?? '').trim()

    if (!name) {
        throw new Error('Division name is required.')
    }

    if (!Number.isInteger(seasonId)) {
        throw new Error('A season is required for a division.')
    }

    const season = await SQ3.fetchFirst(SQ3.db, `
        SELECT Seasons.*, Competitions.name AS competitionName
        FROM Seasons
        INNER JOIN Competitions ON Competitions.id = Seasons.competitionId
        WHERE Seasons.id = ?`, [seasonId])

    if (!season) {
        throw new Error('Season not found.')
    }

    const existingDivision = await SQ3.fetchFirst(SQ3.db,
        'SELECT id FROM Divisions WHERE lower(trim(name)) = lower(trim(?)) AND seasonId = ?',
        [name, seasonId])

    if (existingDivision) {
        throw new Error('That division already exists for the selected season.')
    }

    await SQ3.execute(SQ3.db, 'BEGIN TRANSACTION')
    try {
        await SQ3.execute(SQ3.db,
            'INSERT INTO Divisions(name, seasonId, competitionId) VALUES (?, ?, NULL)',
            [name, seasonId])

        const division = await SQ3.fetchFirst(SQ3.db,
            'SELECT id FROM Divisions WHERE name = ? AND seasonId = ? ORDER BY id DESC LIMIT 1',
            [name, seasonId])

        await SQ3.execute(SQ3.db, `
            INSERT INTO Competitions(
                name, startDate, endDate, status, seasonStartYear, division, competitionId
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                season.startDate,
                season.endDate,
                season.status || 'Active',
                season.seasonStartYear,
                division.id,
                season.competitionId
            ])

        const divisionCompetition = await SQ3.fetchFirst(SQ3.db,
            'SELECT id FROM Competitions WHERE name = ? AND division = ? AND competitionId = ? ORDER BY id DESC LIMIT 1',
            [name, division.id, season.competitionId])

        await SQ3.execute(SQ3.db,
            'UPDATE Divisions SET competitionId = ? WHERE id = ?',
            [divisionCompetition.id, division.id])

        await SQ3.execute(SQ3.db, 'COMMIT')
    } catch (error) {
        await SQ3.execute(SQ3.db, 'ROLLBACK')
        throw error
    }
}

// Return all teams currently assigned to a division.
async function getAllTeamsFromDivision(divisionId) {
    return await SQ3.fetchAll(SQ3.db, 'SELECT * FROM Teams WHERE division = ?', [divisionId])
}

// Calculate played, result, pin, point, and rank totals for a division.
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

// Move the bottom and top teams between the three divisions using standings.
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
    getDivisionsForSeason,
    getDivisionByName,
    createDivision,
    getAllTeamsFromDivision,
    calculateStandings,
    executePromotionAndRelegation
}
