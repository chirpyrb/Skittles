const SQ3 = require('../models/sql')

async function initTable() {
    // Initialise the table.

    await SQ3.execute(SQ3.db,
        'CREATE TABLE IF NOT EXISTS Scorecards \
        '
    )
}