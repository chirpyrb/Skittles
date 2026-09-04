
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

module.exports = {db, execute, fetchAll, fetchFirst}