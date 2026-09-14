const SQ3 = require('../models/sql')

async function initTable() {
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Competitions \
        (id INTEGER PRIMARY KEY, \
        name TEXT NOT NULL, \
        startDate TEXT NOT NULL, \
        endDate TEXT NOT NULL, \
        status TEXT DEFAULT "Active", \
        seasonStartYear INTEGER, \
        division INTEGER);')
    try { await SQ3.execute(SQ3.db, 'ALTER TABLE Competitions ADD COLUMN status TEXT DEFAULT "Active"'); } catch(e) {}
    try { await SQ3.execute(SQ3.db, 'ALTER TABLE Competitions ADD COLUMN seasonStartYear INTEGER'); } catch(e) {}
    try { await SQ3.execute(SQ3.db, 'ALTER TABLE Competitions ADD COLUMN division INTEGER'); } catch(e) {}
    await SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS TeamSeasonDivisions (teamId INTEGER NOT NULL, seasonStartYear INTEGER NOT NULL, division INTEGER NOT NULL, PRIMARY KEY (teamId, seasonStartYear), FOREIGN KEY (teamId) REFERENCES Teams(id))')

    await ensureSeason(2025, 'Completed')
    await ensureCurrentSeason()
    await migrateExistingFixtures()
}

function getSeasonDates(startYear) {
    const sYear = parseInt(startYear);
    return {
        name: `${sYear}/${sYear + 1} Season`,
        startDate: `${sYear}-07-01`,
        endDate: `${sYear + 1}-06-30`
    };
}

async function getAllCompetitions() {
    return await SQ3.fetchAll(SQ3.db, 'SELECT Competitions.*, Divisions.name AS divisionName FROM Competitions LEFT JOIN Divisions ON Divisions.id = Competitions.division ORDER BY seasonStartYear DESC, division ASC, id DESC')
}

async function getCurrentSeason() {
    return await SQ3.fetchFirst(SQ3.db, 'SELECT seasonStartYear, MIN(startDate) AS startDate, MAX(endDate) AS endDate FROM Competitions WHERE status = "Active" GROUP BY seasonStartYear ORDER BY seasonStartYear DESC')
}

async function createCompetition(seasonName, seasonStartDate, seasonEndDate, status = 'Active') {
    return await SQ3.execute(SQ3.db, 'INSERT INTO Competitions(name,startDate,endDate,status) VALUES (?,?,?,?)', [seasonName, seasonStartDate, seasonEndDate, status])
}

async function createSeasonForYear(startYear) {
    const dates = getSeasonDates(startYear);
    const previousSeason = await getCurrentSeason()
    if (previousSeason && previousSeason.seasonStartYear !== startYear) {
        await archiveSeason(previousSeason.seasonStartYear)
        const divisionModel = require('./division')
        const firstDivision = await getCompetitionForDivision(previousSeason.seasonStartYear, 1)
        if (firstDivision) await divisionModel.executePromotionAndRelegation(firstDivision.id)
    }
    await SQ3.execute(SQ3.db, 'UPDATE Competitions SET status = "Completed" WHERE status = "Active"');
    await ensureSeason(startYear, 'Active')
    return await getCurrentSeason();
}

async function ensureCurrentSeason() {
    const today = new Date()
    const currentStartYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1
    const activeSeason = await getCurrentSeason()
    if (!activeSeason || activeSeason.seasonStartYear !== currentStartYear) {
        if (activeSeason) {
            await archiveSeason(activeSeason.seasonStartYear)
            const divisionModel = require('./division')
            const firstDivision = await getCompetitionForDivision(activeSeason.seasonStartYear, 1)
            if (firstDivision) await divisionModel.executePromotionAndRelegation(firstDivision.id)
        }
        await SQ3.execute(SQ3.db, 'UPDATE Competitions SET status = "Completed" WHERE status = "Active"')
        await ensureSeason(currentStartYear, 'Active')
    } else {
        await ensureSeason(currentStartYear, 'Active')
    }
    return await getCurrentSeason()
}

async function archiveSeason(seasonStartYear) {
    await SQ3.execute(SQ3.db, `
        INSERT OR IGNORE INTO TeamSeasonDivisions(teamId, seasonStartYear, division)
        SELECT DISTINCT teamId, ?, division
        FROM (
            SELECT homeTeam AS teamId, Competitions.division
            FROM Fixtures INNER JOIN Competitions ON Competitions.id = Fixtures.competition
            WHERE Competitions.seasonStartYear = ? AND homeTeam IS NOT NULL
            UNION
            SELECT awayTeam AS teamId, Competitions.division
            FROM Fixtures INNER JOIN Competitions ON Competitions.id = Fixtures.competition
            WHERE Competitions.seasonStartYear = ? AND awayTeam IS NOT NULL
        )`, [seasonStartYear, seasonStartYear, seasonStartYear])
}

async function ensureSeason(startYear, status = 'Active') {
    const dates = getSeasonDates(startYear)
    for (let division = 1; division <= 3; division++) {
        const existing = await SQ3.fetchFirst(SQ3.db, 'SELECT id FROM Competitions WHERE seasonStartYear = ? AND division = ?', [startYear, division])
        if (!existing) {
            await SQ3.execute(SQ3.db,
                'INSERT INTO Competitions(name,startDate,endDate,status,seasonStartYear,division) VALUES (?,?,?,?,?,?)',
                [`Division ${division}`, dates.startDate, dates.endDate, status, startYear, division])
        } else if (status === 'Active') {
            await SQ3.execute(SQ3.db, 'UPDATE Competitions SET status = "Active" WHERE id = ?', [existing.id])
        }
    }
}

async function getCompetitionForDivision(seasonStartYear, divisionId) {
    return await SQ3.fetchFirst(SQ3.db,
        'SELECT * FROM Competitions WHERE seasonStartYear = ? AND division = ?',
        [seasonStartYear, divisionId])
}

async function migrateExistingFixtures() {
    const fixtureTable = await SQ3.fetchFirst(SQ3.db, 'SELECT name FROM sqlite_master WHERE type = "table" AND name = "Fixtures"')
    const teamTable = await SQ3.fetchFirst(SQ3.db, 'SELECT name FROM sqlite_master WHERE type = "table" AND name = "Teams"')
    if (!fixtureTable || !teamTable) return

    const fixtures = await SQ3.fetchAll(SQ3.db, 'SELECT id, homeTeam, awayTeam, matchDate FROM Fixtures')
    const competitions = await SQ3.fetchAll(SQ3.db, 'SELECT id, seasonStartYear, division FROM Competitions')
    const teams = await SQ3.fetchAll(SQ3.db, 'SELECT id, division FROM Teams')
    const teamDivisions = new Map(teams.map(team => [team.id, team.division]))
    const competitionIds = new Map(competitions.map(comp => [`${comp.seasonStartYear}-${comp.division}`, comp.id]))

    for (const currentFixture of fixtures) {
        const fixtureDate = parseStoredDate(currentFixture.matchDate)
        if (!fixtureDate) continue
        const seasonStartYear = fixtureDate >= new Date('2026-07-01T00:00:00Z') ? 2026 : 2025
        const division = teamDivisions.get(currentFixture.homeTeam) || teamDivisions.get(currentFixture.awayTeam) || 1
        const competitionId = competitionIds.get(`${seasonStartYear}-${division}`)
        if (competitionId) await SQ3.execute(SQ3.db, 'UPDATE Fixtures SET competition = ? WHERE id = ?', [competitionId, currentFixture.id])
    }
}

function parseStoredDate(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`)
    const match = String(value).match(/^(\d{2})-([A-Za-z]{3})-(\d{2})$/)
    if (!match) return null
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months.indexOf(match[2])
    if (month < 0) return null
    return new Date(Date.UTC(2000 + Number(match[3]), month, Number(match[1])))
}

async function completeSeason(seasonId) {
    const season = await SQ3.fetchFirst(SQ3.db, 'SELECT id, seasonStartYear, status FROM Competitions WHERE id = ?', [seasonId])
    if (!season) return

    await SQ3.execute(SQ3.db, 'UPDATE Competitions SET status = "Completed" WHERE id = ?', [seasonId])
    if (season.status === 'Completed') return

    const activeDivision = await SQ3.fetchFirst(SQ3.db,
        'SELECT id FROM Competitions WHERE seasonStartYear = ? AND status = "Active"',
        [season.seasonStartYear])
    if (!activeDivision) {
        await archiveSeason(season.seasonStartYear)
        const divisionModel = require('./division')
        const firstDivision = await getCompetitionForDivision(season.seasonStartYear, 1)
        if (firstDivision) await divisionModel.executePromotionAndRelegation(firstDivision.id)
    }
}

module.exports = {
    initTable,
    getSeasonDates,
    getAllCompetitions,
    getCurrentSeason,
    getCompetitionForDivision,
    ensureCurrentSeason,
    createCompetition,
    createSeasonForYear,
    completeSeason
}
