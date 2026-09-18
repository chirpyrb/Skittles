const SQ3 = require('./sql')

async function getAllLeagues() {
    return await SQ3.fetchAll(SQ3.db, `
        SELECT l.*,
               COUNT(DISTINCT c.id) AS competitionCount,
               COUNT(DISTINCT s.id) AS seasonCount
        FROM Leagues l
        LEFT JOIN Competitions c ON c.leagueId = l.id AND c.competitionId IS NOT NULL
        LEFT JOIN Seasons s ON s.leagueId = l.id
        GROUP BY l.id
        ORDER BY l.name ASC`)
}

async function getLeagueById(leagueId) {
    return await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Leagues WHERE id = ?', [leagueId])
}

async function getCompetitionsForLeague(leagueId) {
    return await SQ3.fetchAll(SQ3.db,
        `SELECT * FROM Competitions
         WHERE leagueId = ? AND competitionId IS NOT NULL
         ORDER BY name ASC`, [leagueId])
}

async function getCompetitionByName(leagueId, name) {
        return await SQ3.fetchFirst(SQ3.db,
                `SELECT * FROM Competitions
                 WHERE leagueId = ? AND competitionId IS NOT NULL
                     AND lower(trim(name)) = lower(trim(?))
                 ORDER BY id LIMIT 1`, [leagueId, name])
}

async function getSeasonsForLeague(leagueId) {
    return await SQ3.fetchAll(SQ3.db,
        'SELECT * FROM Seasons WHERE leagueId = ? ORDER BY startDate DESC, id DESC', [leagueId])
}

async function createLeague(name, status = 'Active') {
    const leagueName = String(name ?? '').trim()
    if (!leagueName) throw new Error('League name is required.')

    await SQ3.execute(SQ3.db,
        'INSERT INTO Leagues(name, status) VALUES (?, ?)', [leagueName, status])
    const league = await SQ3.fetchFirst(SQ3.db,
        'SELECT * FROM Leagues WHERE name = ? ORDER BY id DESC LIMIT 1', [leagueName])
    await SQ3.execute(SQ3.db,
        `INSERT INTO Competitions(name, status, leagueId, competitionId)
         VALUES (?, ?, ?, NULL)`, [leagueName, status, league.id])
    return league
}

async function createCompetition(leagueId, name, status = 'Active') {
    const competitionName = String(name ?? '').trim()
    if (!competitionName) throw new Error('Competition name is required.')

    const league = await getLeagueById(leagueId)
    if (!league) throw new Error('League not found.')
    const leagueCompetition = await SQ3.fetchFirst(SQ3.db,
        'SELECT id FROM Competitions WHERE leagueId = ? AND competitionId IS NULL ORDER BY id LIMIT 1', [leagueId])
    if (!leagueCompetition) throw new Error('League root is missing.')

    await SQ3.execute(SQ3.db,
        `INSERT INTO Competitions(name, status, leagueId, competitionId)
         VALUES (?, ?, ?, NULL)`, [competitionName, status, leagueId])
    const created = await SQ3.fetchFirst(SQ3.db,
        `SELECT * FROM Competitions
         WHERE name = ? AND leagueId = ? AND competitionId IS NULL
         ORDER BY id DESC LIMIT 1`, [competitionName, leagueId])

    await SQ3.execute(SQ3.db,
        'UPDATE Competitions SET competitionId = ? WHERE id = ?', [leagueCompetition.id, created.id])
    return await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Competitions WHERE id = ?', [created.id])
}

async function createSeason(leagueId, seasonName, startDate, endDate, status = 'Active') {
    const league = await getLeagueById(leagueId)
    if (!league) throw new Error('League not found.')
    if (!startDate || !endDate) throw new Error('Season start and end dates are required.')
    const leagueCompetition = await SQ3.fetchFirst(SQ3.db,
        'SELECT id FROM Competitions WHERE leagueId = ? AND competitionId IS NULL ORDER BY id LIMIT 1', [leagueId])
    if (!leagueCompetition) throw new Error('League root is missing.')

    await SQ3.execute(SQ3.db,
        `INSERT INTO Seasons(competitionId, leagueId, name, startDate, endDate, status, seasonStartYear)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [leagueCompetition.id, league.id, String(seasonName || '').trim() || `${league.name} season`, startDate, endDate, status, new Date(`${startDate}T00:00:00Z`).getUTCFullYear()])

    return await SQ3.fetchFirst(SQ3.db,
        'SELECT * FROM Seasons WHERE leagueId = ? ORDER BY id DESC LIMIT 1', [leagueId])
}

async function getCurrentSeason() {
    return await SQ3.fetchFirst(SQ3.db, `
        SELECT s.*, l.name AS leagueName
        FROM Seasons s
        INNER JOIN Leagues l ON l.id = s.leagueId
        WHERE s.status = 'Active'
        ORDER BY s.startDate DESC
        LIMIT 1`)
}

module.exports = {
    getAllLeagues,
    getLeagueById,
    getCompetitionsForLeague,
    getCompetitionByName,
    getSeasonsForLeague,
    createLeague,
    createCompetition,
    createSeason,
    getCurrentSeason
}
