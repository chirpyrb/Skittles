const SQ3 = require('../models/sql')

// Keep the legacy initializer available without creating league data.
async function initTable() {
}

// Build the display name and July-to-June date range for a season year.
function getSeasonDates(startYear) {
    const sYear = parseInt(startYear)
    return {
        name: `${sYear}/${sYear + 1} Season`,
        startDate: `${sYear}-07-01`,
        endDate: `${sYear + 1}-06-30`
    }
}

async function getAllCompetitions() {
    return await SQ3.fetchAll(SQ3.db, `
        SELECT c.*, s.id AS seasonId, s.name AS seasonName, s.startDate AS seasonStartDate,
               s.endDate AS seasonEndDate, s.status AS seasonStatus, s.seasonStartYear
        FROM Competitions c
        LEFT JOIN Seasons s ON s.competitionId = c.id
        ORDER BY c.name ASC, s.startDate DESC
    `)
}

async function getCurrentSeason() {
    return await SQ3.fetchFirst(SQ3.db, `
        SELECT s.*, c.name AS competitionName
        FROM Seasons s
        INNER JOIN Competitions c ON c.id = s.competitionId
        WHERE s.status = 'Active'
        ORDER BY s.startDate DESC
        LIMIT 1
    `)
}

async function createCompetition(name, status = 'Active') {
    const competitionName = String(name ?? '').trim()
    if (!competitionName) throw new Error('Competition name is required.')

    const now = new Date()
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), 6, 1)).toISOString().slice(0, 10)
    const endDate = new Date(Date.UTC(now.getUTCFullYear() + 1, 5, 30)).toISOString().slice(0, 10)

    await SQ3.execute(SQ3.db, 'INSERT INTO Competitions(name, startDate, endDate, status) VALUES (?, ?, ?, ?)', [competitionName, startDate, endDate, status])
    const created = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Competitions WHERE name = ? ORDER BY id DESC LIMIT 1', [competitionName])
    const seasonName = `${competitionName} season`
    await SQ3.execute(SQ3.db,
        'INSERT INTO Seasons(competitionId, name, startDate, endDate, status, seasonStartYear) VALUES (?, ?, ?, ?, ?, ?)',
        [created.id, seasonName, startDate, endDate, status, new Date(`${startDate}T00:00:00Z`).getUTCFullYear()])

    return created
}

async function createSeason(competitionId, seasonName, seasonStartDate, seasonEndDate, status = 'Active') {
    const competition = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Competitions WHERE id = ?', [competitionId])
    if (!competition) throw new Error('Competition not found.')

    const name = String(seasonName ?? '').trim() || `${competition.name} ${seasonStartDate || ''}`.trim()
    const startDate = seasonStartDate || competition.startDate || '2026-07-01'
    const endDate = seasonEndDate || competition.endDate || '2027-06-30'

    await SQ3.execute(SQ3.db,
        'INSERT INTO Seasons(competitionId, name, startDate, endDate, status, seasonStartYear) VALUES (?, ?, ?, ?, ?, ?)',
        [competitionId, name, startDate, endDate, status, new Date(`${startDate}T00:00:00Z`).getUTCFullYear()])

    return await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Seasons WHERE competitionId = ? ORDER BY id DESC LIMIT 1', [competitionId])
}

async function createSeasonForYear(startYear) {
    const dates = getSeasonDates(startYear)
    const existingCompetition = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Competitions WHERE name = ?', [`League ${startYear}/${String(startYear + 1).slice(-2)}`])
    const competition = existingCompetition || await createCompetition(`League ${startYear}/${String(startYear + 1).slice(-2)}`, 'Active')
    return await createSeason(competition.id, `${startYear}/${String(startYear + 1).slice(-2)} season`, dates.startDate, dates.endDate, 'Active')
}

async function ensureCurrentSeason() {
    const today = new Date()
    const currentStartYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1
    const activeSeason = await getCurrentSeason()

    if (activeSeason && String(activeSeason.seasonStartYear || new Date(`${activeSeason.startDate}T00:00:00Z`).getUTCFullYear()) === String(currentStartYear)) {
        return activeSeason
    }

    const defaultCompetition = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Competitions ORDER BY id DESC LIMIT 1')
        || await createCompetition(`League ${currentStartYear}/${String(currentStartYear + 1).slice(-2)}`, 'Active')

    const seasonName = `${currentStartYear}/${String(currentStartYear + 1).slice(-2)} season`
    const dates = getSeasonDates(currentStartYear)
    return await createSeason(defaultCompetition.id, seasonName, dates.startDate, dates.endDate, 'Active')
}

async function archiveSeason(seasonStartYear) {
    await SQ3.execute(SQ3.db, 'UPDATE Seasons SET status = "Completed" WHERE seasonStartYear = ?', [seasonStartYear])
}

async function ensureSeason(startYear, status = 'Active') {
    const dates = getSeasonDates(startYear)
    const existingCompetition = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Competitions WHERE name = ?', [`League ${startYear}/${String(startYear + 1).slice(-2)}`])
    const competition = existingCompetition || await createCompetition(`League ${startYear}/${String(startYear + 1).slice(-2)}`, status)
    const season = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Seasons WHERE competitionId = ? AND seasonStartYear = ?', [competition.id, startYear])

    if (season) {
        await SQ3.execute(SQ3.db, 'UPDATE Seasons SET status = ? WHERE id = ?', [status, season.id])
        return season
    }

    return await createSeason(competition.id, `${startYear}/${String(startYear + 1).slice(-2)} season`, dates.startDate, dates.endDate, status)
}

async function getCompetitionForDivision(seasonStartYear, divisionId) {
    return await SQ3.fetchFirst(SQ3.db,
        'SELECT * FROM Competitions WHERE seasonStartYear = ? AND division = ?',
        [seasonStartYear, divisionId])
}

async function migrateExistingFixtures() {
    return null
}

async function completeSeason(seasonId) {
    if (!seasonId) return
    await SQ3.execute(SQ3.db, 'UPDATE Seasons SET status = "Completed" WHERE id = ?', [seasonId])
}

module.exports = {
    initTable,
    getSeasonDates,
    getAllCompetitions,
    getCurrentSeason,
    getCompetitionForDivision,
    ensureCurrentSeason,
    createCompetition,
    createSeason,
    createSeasonForYear,
    completeSeason,
    ensureSeason,
    archiveSeason,
    migrateExistingFixtures
}
