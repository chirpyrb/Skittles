
const sqlite3 = require('sqlite3').verbose()

// Open the SQLite database file. SQLite creates the file when it does not exist.
const db = new sqlite3.Database("./skittles.sql3")

// Execute either a parameterized statement or a multi-statement SQL script.
const execute = async (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (params && params.length > 0) {
            db.run(sql, params, (err) => {
                if (err) return reject(err);
                resolve()
            })
        } else {
            db.exec(sql, (err) => {
                if (err) return reject(err);
                resolve()
            })
        }
    })
}

// Return every row from a query, converting a single parameter to an array when needed.
const fetchAll = async (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    let p = Array.isArray(params) ? params : (params !== undefined && params !== null && typeof params !== 'object' ? [params] : []);
    db.all(sql, p, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

// Return the first matching row from a query.
const fetchFirst = async (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    let p = Array.isArray(params) ? params : (params !== undefined && params !== null && typeof params !== 'object' ? [params] : []);
    db.get(sql, p, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

// Create the complete persistent schema in one SQLite call.
const initSchema = async () => {
  await execute(db, `
    -- Lookup values used by teams and competitions.
    CREATE TABLE IF NOT EXISTS Divisions (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS Days (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    -- Home-night values are fixed lookup data: Monday is 1 through Sunday is 7.
    INSERT INTO Days (id, name)
    SELECT 1, 'Monday' WHERE NOT EXISTS (SELECT 1 FROM Days WHERE id = 1)
    UNION ALL SELECT 2, 'Tuesday' WHERE NOT EXISTS (SELECT 1 FROM Days WHERE id = 2)
    UNION ALL SELECT 3, 'Wednesday' WHERE NOT EXISTS (SELECT 1 FROM Days WHERE id = 3)
    UNION ALL SELECT 4, 'Thursday' WHERE NOT EXISTS (SELECT 1 FROM Days WHERE id = 4)
    UNION ALL SELECT 5, 'Friday' WHERE NOT EXISTS (SELECT 1 FROM Days WHERE id = 5)
    UNION ALL SELECT 6, 'Saturday' WHERE NOT EXISTS (SELECT 1 FROM Days WHERE id = 6)
    UNION ALL SELECT 7, 'Sunday' WHERE NOT EXISTS (SELECT 1 FROM Days WHERE id = 7);

    -- Locations are separated into pubs and their individual alleys.
    CREATE TABLE IF NOT EXISTS Pubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, location TEXT);
    CREATE TABLE IF NOT EXISTS Alleys (id INTEGER PRIMARY KEY, name TEXT NOT NULL, pub INTEGER, FOREIGN KEY (pub) REFERENCES Pubs(id));

    -- Teams can refer to lookup tables and to a user who captains the team.
    CREATE TABLE IF NOT EXISTS Teams (
      id INTEGER PRIMARY KEY, teamName TEXT NOT NULL, homeAlley INTEGER,
      division INTEGER, home_night INTEGER, captainId INTEGER REFERENCES Users(id),
      FOREIGN KEY (homeAlley) REFERENCES Alleys(id), FOREIGN KEY (division) REFERENCES Divisions(id),
      FOREIGN KEY (home_night) REFERENCES Days(id)
    );

    -- Players belong to teams and are approved before appearing on scorecards.
    CREATE TABLE IF NOT EXISTS Players (
      id INTEGER PRIMARY KEY, firstName TEXT NOT NULL, secondName TEXT NOT NULL,
      alias TEXT NOT NULL, team INTEGER, approved INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (team) REFERENCES Teams(id)
    );

    -- Users may optionally be linked to a player account.
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY, userName TEXT NOT NULL, password TEXT NOT NULL,
      access TEXT NOT NULL, playerId INTEGER REFERENCES Players(id)
    );

    -- Competitions represent seasons or divisions within a season.
    CREATE TABLE IF NOT EXISTS Competitions (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, startDate TEXT NOT NULL,
      endDate TEXT NOT NULL, status TEXT DEFAULT 'Active',
      seasonStartYear INTEGER, division INTEGER
    );

    -- Fixtures connect teams to a competition and store the final scores.
    CREATE TABLE IF NOT EXISTS Fixtures (
      id INTEGER PRIMARY KEY, homeTeam INTEGER, awayTeam INTEGER, competition INTEGER,
      matchDate TEXT NOT NULL, status TEXT, homeScore INTEGER, awayScore INTEGER,
      FOREIGN KEY (homeTeam) REFERENCES Teams(id), FOREIGN KEY (awayTeam) REFERENCES Teams(id),
      FOREIGN KEY (competition) REFERENCES Competitions(id)
    );

    -- Track which teams and users have approved a fixture.
    CREATE TABLE IF NOT EXISTS FixtureApprovals (
      fixtureId INTEGER NOT NULL, teamId INTEGER NOT NULL, userId INTEGER NOT NULL,
      approvedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (fixtureId, teamId),
      FOREIGN KEY (fixtureId) REFERENCES Fixtures(id), FOREIGN KEY (teamId) REFERENCES Teams(id),
      FOREIGN KEY (userId) REFERENCES Users(id)
    );

    -- Preserve a team's division for each season.
    CREATE TABLE IF NOT EXISTS TeamSeasonDivisions (
      teamId INTEGER NOT NULL, seasonStartYear INTEGER NOT NULL, division INTEGER NOT NULL,
      PRIMARY KEY (teamId, seasonStartYear), FOREIGN KEY (teamId) REFERENCES Teams(id)
    );

    -- Store each player's scorecard entries and special scoring flags.
    CREATE TABLE IF NOT EXISTS Scorecards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fixtureId INTEGER, teamId INTEGER, userId INTEGER,
      playerIndex INTEGER, playerId INTEGER, handNumber INTEGER, score INTEGER, bolters INTEGER,
      isFlopper INTEGER DEFAULT 0, isSquare INTEGER DEFAULT 0, isChance INTEGER DEFAULT 0,
      FOREIGN KEY (fixtureId) REFERENCES Fixtures(id), FOREIGN KEY (teamId) REFERENCES Teams(id)
    );
  `)
}

// Add indexes used by the most common fixture, player, scorecard, and user queries.
const initPerformanceIndexes = async () => {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_fixtures_competition ON Fixtures(competition)',
    'CREATE INDEX IF NOT EXISTS idx_fixtures_home_team ON Fixtures(homeTeam)',
    'CREATE INDEX IF NOT EXISTS idx_fixtures_away_team ON Fixtures(awayTeam)',
    'CREATE INDEX IF NOT EXISTS idx_players_team_approved ON Players(team, approved)',
    'CREATE INDEX IF NOT EXISTS idx_scorecards_fixture_team ON Scorecards(fixtureId, teamId)',
    'CREATE INDEX IF NOT EXISTS idx_competitions_season_division ON Competitions(seasonStartYear, division)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON Users(userName)'
  ]

  // Create each index only when it is missing, so startup is repeatable.
  for (const index of indexes) await execute(db, index)
}

// Expose the database connection and shared database helpers to the models.
module.exports = {db, execute, fetchAll, fetchFirst, initSchema, initPerformanceIndexes}