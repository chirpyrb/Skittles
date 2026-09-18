const SQ3 = require('./sql')
const multer = require('multer')

// Keep uploads in memory, limit their size, and accept only CSV files.
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (file.originalname.toLowerCase().endsWith('.csv')) return callback(null, true)
        callback(new Error('Please upload a CSV file.'))
    }
})

// Allow only signed-in developer or league-secretary users to upload data.
function requireBulkUploadAccess(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/users/login')
    }
    if (req.session.user.access !== 'dev' && req.session.user.access !== 'LeagueSecretary') {
        return res.status(403).send('You are not authorised to upload data.')
    }
    next()
}

// Parse one CSV line while respecting quoted commas and escaped quotes.
function parseCSVLine(line) {
    const columns = []
    let value = ''
    let quoted = false

    for (let index = 0; index < line.length; index++) {
        const character = line[index]
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                value += '"'
                index++
            } else {
                quoted = !quoted
            }
        } else if (character === ',' && !quoted) {
            columns.push(value.trim())
            value = ''
        } else {
            value += character
        }
    }

    if (quoted) throw new Error('A CSV value has an unmatched quote.')
    columns.push(value.trim())
    return columns
}

// Convert CSV text into non-empty arrays of parsed columns.
function csvRows(content) {
    return content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim()).map(parseCSVLine)
}

// Detect whether the first CSV row is the expected header row.
function isHeader(columns, firstColumn) {
    return columns[0].toLowerCase() === firstColumn.toLowerCase()
}

// Validate, de-duplicate, and transactionally insert records using a model-specific config.
async function importRows(content, config) {
    const rows = csvRows(content)
    const errors = []
    const records = []
    const keys = new Set()

    rows.forEach((columns, index) => {
        if (index === 0 && isHeader(columns, config.header)) return
        const validColumnCount = Array.isArray(config.columns) ? config.columns.includes(columns.length) : columns.length === config.columns
        if (!validColumnCount || columns.some(column => !column)) {
            errors.push(`Row ${index + 1}: expected ${config.description}.`)
            return
        }
        records.push({ rowNumber: index + 1, columns })
    })

    for (const record of records) {
        const result = await config.resolve(record.columns)
        if (result.error) {
            errors.push(`Row ${record.rowNumber}: ${result.error}`)
            continue
        }

        const duplicateKey = config.key(result.value)
        if (keys.has(duplicateKey)) {
            errors.push(`Row ${record.rowNumber}: duplicate record in this CSV.`)
            continue
        }
        keys.add(duplicateKey)

        const existing = await config.existing(result.value)
        if (existing) {
            errors.push(`Row ${record.rowNumber}: this record already exists.`)
            continue
        }
        record.value = result.value
    }

    if (errors.length) return { imported: 0, errors }

    await SQ3.execute(SQ3.db, 'BEGIN TRANSACTION')
    try {
        for (const record of records) await config.insert(record.value)
        await SQ3.execute(SQ3.db, 'COMMIT')
    } catch (error) {
        await SQ3.execute(SQ3.db, 'ROLLBACK')
        throw error
    }
    return { imported: records.length, errors: [] }
}

// Import pubs from CSV text after resolving duplicate names.
async function importPubs(content) {
    return importRows(content, {
        header: 'name',
        columns: [1, 2, 3],
        description: 'name, location (or id, name, location)',
        resolve: async columns => ({
            value: {
                name: columns.length === 3 ? columns[1] : columns[0],
                location: columns.length === 3 ? columns[2] : columns[1]
            }
        }),
        key: record => record.name.toLowerCase(),
        existing: record => SQ3.fetchFirst(SQ3.db, 'SELECT id FROM Pubs WHERE lower(trim(name)) = lower(trim(?))', [record.name]),
        insert: record => SQ3.execute(SQ3.db, 'INSERT INTO Pubs(name, location) VALUES (?, ?)', [record.name, record.location])
    })
}

// Import players after resolving each player's team.
async function importPlayers(content) {
    return importRows(content, {
        header: 'firstName',
        columns: 4,
        description: 'firstName, secondName, alias, teamName',
        resolve: async ([firstName, secondName, alias, teamName]) => {
            const team = await SQ3.fetchFirst(SQ3.db, 'SELECT id FROM Teams WHERE lower(trim(teamName)) = lower(trim(?))', [teamName])
            if (!team) return { error: `team '${teamName}' was not found.` }
            return { value: { firstName, secondName, alias, teamId: team.id } }
        },
        key: record => `${record.firstName}|${record.secondName}|${record.teamId}`.toLowerCase(),
        existing: record => SQ3.fetchFirst(SQ3.db, 'SELECT id FROM Players WHERE lower(firstName) = lower(?) AND lower(secondName) = lower(?) AND team = ?', [record.firstName, record.secondName, record.teamId]),
        insert: record => SQ3.execute(SQ3.db, 'INSERT INTO Players(firstName,secondName,alias,team) VALUES (?,?,?,?)', [record.firstName, record.secondName, record.alias, record.teamId])
    })
}

// Import alleys after resolving each alley's pub by name or ID.
async function importAlleys(content) {
    return importRows(content, {
        header: 'name',
        columns: [2, 3],
        description: 'name, pubName (or id, name, pubId)',
        resolve: async columns => {
            const name = columns.length === 3 ? columns[1] : columns[0]
            const pubReference = columns.length === 3 ? columns[2] : columns[1]
            const pub = await SQ3.fetchFirst(SQ3.db,
                /^\d+$/.test(pubReference) ? 'SELECT id FROM Pubs WHERE id = ?' : 'SELECT id FROM Pubs WHERE lower(trim(name)) = lower(trim(?))',
                [pubReference])
            if (!pub) return { error: `pub '${pubReference}' was not found.` }
            return { value: { name, pubId: pub.id } }
        },
        key: record => `${record.name}|${record.pubId}`.toLowerCase(),
        existing: record => SQ3.fetchFirst(SQ3.db, 'SELECT id FROM Alleys WHERE lower(name) = lower(?) AND pub = ?', [record.name, record.pubId]),
        insert: record => SQ3.execute(SQ3.db, 'INSERT INTO Alleys(name,pub) VALUES (?,?)', [record.name, record.pubId])
    })
}

// Import teams after resolving alleys, leagues, and home-night values.
async function importTeams(content) {
    return importRows(content, {
        header: 'teamName',
        columns: [4, 5],
        description: 'teamName, alleyName, leagueName, homeNight (or id, teamName, alleyId, leagueId, homeNight)',
        resolve: async columns => {
            const teamName = columns.length === 5 ? columns[1] : columns[0]
            const alleyReference = columns.length === 5 ? columns[2] : columns[1]
            const leagueReference = columns.length === 5 ? columns[3] : columns[2]
            const homeNight = columns[columns.length - 1]
            const alley = await SQ3.fetchFirst(SQ3.db,
                /^\d+$/.test(alleyReference) ? 'SELECT id FROM Alleys WHERE id = ?' : 'SELECT id FROM Alleys WHERE lower(trim(name)) = lower(trim(?))',
                [alleyReference])
            let league = await SQ3.fetchFirst(SQ3.db,
                /^\d+$/.test(leagueReference) ? 'SELECT id FROM Leagues WHERE id = ?' : 'SELECT id FROM Leagues WHERE lower(trim(name)) = lower(trim(?))',
                [leagueReference])
            if (!league) {
                const div = await SQ3.fetchFirst(SQ3.db,
                    /^\d+$/.test(leagueReference) ? 'SELECT s.leagueId FROM Divisions d JOIN Seasons s ON s.id = d.seasonId WHERE d.id = ?' : 'SELECT s.leagueId FROM Divisions d JOIN Seasons s ON s.id = d.seasonId WHERE lower(trim(d.name)) = lower(trim(?))',
                    [leagueReference])
                if (div && div.leagueId) {
                    league = { id: div.leagueId }
                }
            }
            const night = Number(homeNight)
            if (!alley) return { error: `alley '${alleyReference}' was not found.` }
            if (!league) return { error: `league '${leagueReference}' was not found.` }
            if (!Number.isInteger(night) || night < 1 || night > 7) return { error: 'homeNight must be a number from 1 to 7.' }
            return { value: { teamName, alleyId: alley.id, leagueId: league.id, homeNight: night } }
        },
        key: record => record.teamName.toLowerCase(),
        existing: record => SQ3.fetchFirst(SQ3.db, 'SELECT id FROM Teams WHERE lower(trim(teamName)) = lower(trim(?))', [record.teamName]),
        insert: record => SQ3.execute(SQ3.db, 'INSERT INTO Teams(teamName,homeAlley,leagueId,home_night) VALUES (?,?,?,?)', [record.teamName, record.alleyId, record.leagueId, record.homeNight])
    })
}

module.exports = { csvUpload, requireBulkUploadAccess, importPubs, importPlayers, importAlleys, importTeams }
