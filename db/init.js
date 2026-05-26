// db/init.js — Database using sql.js (pure JS, no native compilation needed)
const initSqlJs = require('sql.js');
const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), '.data', 'program.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let _db = null;

async function getDb() {
  if (_db) return _db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
    await applySchema(_db);
    await seedData(_db);
    saveDb();
  }
  _db.run('PRAGMA foreign_keys = ON;');
  return _db;
}

function saveDb() {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Convenience: run a statement and save
function exec(sql, params = []) {
  _db.run(sql, params);
  saveDb();
}

// Query: returns array of row objects
function query(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Query one row
function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

// Insert and return lastInsertRowid
function insert(sql, params = []) {
  _db.run(sql, params);
  const row = queryOne('SELECT last_insert_rowid() as id');
  saveDb();
  return row ? row.id : null;
}

async function applySchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS participants (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name    TEXT NOT NULL,
      last_name     TEXT NOT NULL,
      date_of_birth TEXT,
      sport_group   TEXT NOT NULL,
      medical_notes TEXT DEFAULT '',
      pin           TEXT NOT NULL UNIQUE,
      nfc_uid       TEXT UNIQUE,
      qr_code       TEXT UNIQUE,
      active        INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS guardians (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL,
      full_name      TEXT NOT NULL,
      relationship   TEXT NOT NULL,
      phone_number   TEXT NOT NULL,
      wa_verified    INTEGER DEFAULT 0,
      sms_enabled    INTEGER DEFAULT 1,
      created_at     TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL,
      full_name      TEXT NOT NULL,
      phone_number   TEXT NOT NULL,
      relationship   TEXT DEFAULT 'Emergency Contact',
      notes          TEXT DEFAULT '',
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL,
      event_type     TEXT NOT NULL,
      event_time     TEXT DEFAULT (datetime('now')),
      checked_in_by  TEXT DEFAULT 'staff',
      notes          TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sms_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      guardian_id    INTEGER NOT NULL,
      session_log_id INTEGER,
      message_text   TEXT NOT NULL,
      wa_url         TEXT NOT NULL,
      status         TEXT DEFAULT 'pending',
      sent_at        TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS staff (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      pin        TEXT NOT NULL UNIQUE,
      role       TEXT DEFAULT 'staff',
      active     INTEGER DEFAULT 1,
      sport_group  TEXT DEFAULT NULL,
      phone_number TEXT DEFAULT NULL,
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `);
}

async function seedData(db) {
  // Default admin
  db.run("INSERT OR IGNORE INTO staff (name, pin, role) VALUES ('Admin','0000','admin')");
  db.run("INSERT OR IGNORE INTO staff (name, pin, role) VALUES ('Coordinator','1111','coordinator')");
  db.run("INSERT OR IGNORE INTO staff (name, pin, role, sport_group) VALUES ('Coach Basketball','2222','coach','Basketball')");
  db.run("INSERT OR IGNORE INTO staff (name, pin, role, sport_group) VALUES ('Coach Computer','3333','coach','Computer')");
  db.run("INSERT OR IGNORE INTO staff (name, pin, role, sport_group) VALUES ('Coach Music','4444','coach','Music')");
  db.run("INSERT OR IGNORE INTO staff (name, pin, role) VALUES ('Staff Member','5555','checkin_staff')");

  // Sample participants
  const samples = [
    { fn:'Amara',    ln:'Mensah',  dob:'2016-03-12', sport:'Basketball', pin:'1001', g1n:'Fatima Mensah',  g1r:'Mother', g1p:'231770123456', g2n:'Kofi Mensah',  g2r:'Father', g2p:'231880654321' },
    { fn:'Grace',    ln:'Kollie',  dob:'2015-07-04', sport:'Computer',   pin:'1002', g1n:'Mary Kollie',    g1r:'Mother', g1p:'231770111222' },
    { fn:'Emmanuel', ln:'Dolo',    dob:'2014-11-20', sport:'Music',      pin:'1003', g1n:'James Dolo',     g1r:'Father', g1p:'231880333444' },
    { fn:'Precious', ln:'Tarr',    dob:'2016-01-30', sport:'Basketball', pin:'1004', g1n:'Alice Tarr',     g1r:'Mother', g1p:'231770555666' },
    { fn:'Samuel',   ln:'Cooper',  dob:'2015-05-18', sport:'Computer',   pin:'1005', g1n:'David Cooper',   g1r:'Father', g1p:'231880777888' },
  ];
  for (const s of samples) {
    const qr = 'QR' + Math.random().toString(36).substr(2,8).toUpperCase();
    db.run(
      'INSERT OR IGNORE INTO participants (first_name,last_name,date_of_birth,sport_group,pin,qr_code) VALUES (?,?,?,?,?,?)',
      [s.fn, s.ln, s.dob, s.sport, s.pin, qr]
    );
    const row = db.exec(`SELECT id FROM participants WHERE pin='${s.pin}'`);
    if (!row[0]) continue;
    const pid = row[0].values[0][0];
    db.run('INSERT INTO guardians (participant_id,full_name,relationship,phone_number,wa_verified) VALUES (?,?,?,?,1)',
      [pid, s.g1n, s.g1r, s.g1p]);
    if (s.g2n) db.run('INSERT INTO guardians (participant_id,full_name,relationship,phone_number,wa_verified) VALUES (?,?,?,?,1)',
      [pid, s.g2n, s.g2r, s.g2p]);
  }
}

async function initDb() {
  await getDb();
  console.log('✅ Database initialized at', DB_PATH);
}

module.exports = { getDb, saveDb, exec, query, queryOne, insert, initDb };

if (require.main === module) initDb().catch(console.error);
