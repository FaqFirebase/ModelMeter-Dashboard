import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';

const DATA_DIR = join(homedir(), '.modelmeter');
const DB_PATH = join(DATA_DIR, 'usage.db');

export function getDbPath() {
  return DB_PATH;
}

export function getDataDir() {
  return DATA_DIR;
}

export function getDb(dbPath = DB_PATH) {
  const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      enabled     INTEGER DEFAULT 1,
      config      TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id          TEXT PRIMARY KEY,
      provider_id         TEXT NOT NULL,
      project_name        TEXT,
      first_timestamp     TEXT,
      last_timestamp      TEXT,
      model               TEXT,
      total_input_tokens  INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_read    INTEGER DEFAULT 0,
      total_cache_creation INTEGER DEFAULT 0,
      total_reasoning_tokens INTEGER DEFAULT 0,
      total_reported_total_tokens INTEGER,
      total_reported_cost_usd REAL,
      turn_count          INTEGER DEFAULT 0,
      FOREIGN KEY (provider_id) REFERENCES providers(id)
    );

    CREATE TABLE IF NOT EXISTS turns (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id            TEXT NOT NULL,
      provider_id           TEXT NOT NULL,
      timestamp             TEXT,
      model                 TEXT,
      input_tokens          INTEGER DEFAULT 0,
      output_tokens         INTEGER DEFAULT 0,
      cache_read_tokens     INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      reasoning_tokens      INTEGER DEFAULT 0,
      reported_total_tokens INTEGER,
      reported_cost_usd     REAL,
      tool_name             TEXT,
      message_id            TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id),
      FOREIGN KEY (provider_id) REFERENCES providers(id)
    );

    CREATE TABLE IF NOT EXISTS processed_files (
      path  TEXT PRIMARY KEY,
      mtime REAL,
      lines INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
    CREATE INDEX IF NOT EXISTS idx_turns_provider ON turns(provider_id);
    CREATE INDEX IF NOT EXISTS idx_turns_timestamp ON turns(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_first ON sessions(first_timestamp);
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_message_provider
    ON turns(message_id, provider_id)
    WHERE message_id IS NOT NULL AND message_id != '';
  `);

  ensureColumn(db, 'sessions', 'total_reported_cost_usd', 'REAL');
  ensureColumn(db, 'sessions', 'total_reported_total_tokens', 'INTEGER');
  ensureColumn(db, 'turns', 'reported_cost_usd', 'REAL');
  ensureColumn(db, 'turns', 'reported_total_tokens', 'INTEGER');
}

export function registerProvider(db, id, name, config = {}) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO providers (id, name, config)
      VALUES (?, ?, ?)
    `).run(id, name, JSON.stringify(config));
  } catch (error) {
    if (String(error?.code) !== 'SQLITE_READONLY') {
      throw error;
    }
  }
}

export function closeDb(db) {
  if (db) db.close();
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some(column => column.name === columnName)) {
    try {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
      if (String(error?.code) !== 'SQLITE_READONLY') {
        throw error;
      }
    }
  }
}
