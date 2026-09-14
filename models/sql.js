
const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database("./skittles.sql3")

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

const fetchAll = async (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    let p = Array.isArray(params) ? params : (params !== undefined && params !== null && typeof params !== 'object' ? [params] : []);
    db.all(sql, p, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

const fetchFirst = async (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    let p = Array.isArray(params) ? params : (params !== undefined && params !== null && typeof params !== 'object' ? [params] : []);
    db.get(sql, p, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

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
  for (const index of indexes) await execute(db, index)
}

module.exports = {db, execute, fetchAll, fetchFirst, initPerformanceIndexes}