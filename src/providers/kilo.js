import { execSync } from 'child_process';
import { basename, join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import { aggregateSessions, upsertSessions, insertTurns, recomputeSessionTotals } from './db-helpers.js';

const PROVIDER_ID = 'kilo';
const PROVIDER_NAME = 'Kilo Code';
const KILO_DB_PATH = join(homedir(), '.local', 'share', 'kilo', 'kilo.db');
const LIVE_SESSION_ID = 'kilo-live';

function findCodexbar() {
  const isWindows = process.platform === 'win32';

  // Cross-platform paths
  const paths = [
    // macOS Homebrew
    '/usr/local/bin/codexbar',
    '/opt/homebrew/bin/codexbar',
    // Linux Homebrew
    '/home/linuxbrew/.linuxbrew/bin/codexbar',
    // Windows: Win-CodexBar installed locations
    join(homedir(), 'AppData', 'Local', 'codexbar', 'codexbar.exe'),
    join(homedir(), '.cargo', 'bin', 'codexbar.exe'),
    'C:\\Program Files\\codexbar\\codexbar.exe',
    // WSL: Windows codexbar.exe accessible via /mnt/c/
    '/mnt/c/Program Files/codexbar/codexbar.exe',
    '/mnt/c/Users/' + process.env.USER + '/AppData/Local/codexbar/codexbar.exe',
  ];

  for (const p of paths) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // Skip inaccessible paths
    }
  }

  // Try PATH lookup
  try {
    const cmd = isWindows ? 'where codexbar' : 'which codexbar';
    return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

function projectNameFromDirectory(directory, title) {
  if (directory && directory !== homedir()) {
    return basename(directory) || directory;
  }
  return title || 'kilo';
}

function parseMessageRow(row) {
  let data;
  try {
    data = JSON.parse(row.data);
  } catch {
    return null;
  }

  const tokens = data.tokens || {};
  const cache = tokens.cache || {};
  const totalTokens = Number(tokens.total || 0);
  const inputTokens = Number(tokens.input || 0);
  const outputTokens = Number(tokens.output || 0);
  const reasoningTokens = Number(tokens.reasoning || 0);
  const cacheRead = Number(cache.read || 0);
  const cacheWrite = Number(cache.write || 0);

  if (data.role !== 'assistant') return null;
  if (totalTokens + Number(data.cost || 0) === 0) return null;

  const createdAt = data.time?.completed || data.time?.created || row.time_updated || row.time_created;
  const timestamp = new Date(createdAt).toISOString();
  const model = data.modelID || 'unknown';
  const directory = data.path?.cwd || row.directory || '';
  const title = row.title || '';

  return {
    session: {
      session_id: row.session_id,
      provider_id: PROVIDER_ID,
      project_name: projectNameFromDirectory(directory, title),
      first_timestamp: timestamp,
      last_timestamp: timestamp,
      model,
    },
    turn: {
      session_id: row.session_id,
      provider_id: PROVIDER_ID,
      timestamp,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheRead,
      cache_creation_tokens: cacheWrite,
      reasoning_tokens: reasoningTokens,
      reported_total_tokens: totalTokens || null,
      reported_cost_usd: Number(data.cost || 0) || null,
      tool_name: data.providerID || data.mode || null,
      message_id: row.id,
    },
  };
}

export function parseKiloUsage(payload) {
  const usage = payload?.usage || {};
  const primary = usage.primary || {};
  const updatedAt = usage.updatedAt || new Date().toISOString();
  const source = payload?.source || 'unknown';
  const loginMethod = usage.loginMethod || usage.identity?.loginMethod || 'unknown';
  const resetDescription = primary.resetDescription || '';
  const usedPercent = Number.isFinite(primary.usedPercent) ? primary.usedPercent : null;

  const creditsMatch = resetDescription.match(/([\d.]+)\s*\/\s*([\d.]+)\s*credits/i);
  const usedCredits = creditsMatch ? Number.parseFloat(creditsMatch[1]) : null;
  const totalCredits = creditsMatch ? Number.parseFloat(creditsMatch[2]) : null;

  const projectParts = [];
  if (usedCredits !== null && totalCredits !== null) {
    projectParts.push(`${usedCredits.toFixed(2)} / ${totalCredits.toFixed(2)} credits`);
  }
  if (usedPercent !== null) {
    projectParts.push(`${usedPercent.toFixed(2)}% used`);
  }
  projectParts.push(loginMethod);

  return {
    session: {
      session_id: LIVE_SESSION_ID,
      provider_id: PROVIDER_ID,
      project_name: projectParts.join(' · '),
      first_timestamp: updatedAt,
      last_timestamp: updatedAt,
      model: `kilo-${source}`,
    },
    turn: {
      session_id: LIVE_SESSION_ID,
      provider_id: PROVIDER_ID,
      timestamp: updatedAt,
      model: `kilo-${source}`,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      reasoning_tokens: 0,
      reported_total_tokens: null,
      reported_cost_usd: null,
      tool_name: loginMethod,
      message_id: `${LIVE_SESSION_ID}-${updatedAt}`,
    },
  };
}

function scanKiloDb(db, dbPath, verbose) {
  if (!existsSync(dbPath)) {
    if (verbose) console.log(`  [kilo] Database not found at ${dbPath}`);
    return null;
  }

  let lastScanned = 0;
  const row = db.prepare('SELECT mtime FROM processed_files WHERE path = ?').get(dbPath);
  if (row) lastScanned = Math.floor(row.mtime);

  const kiloDb = new Database(dbPath, { readonly: true });
  const rows = kiloDb.prepare(`
    SELECT
      m.id,
      m.session_id,
      m.time_created,
      m.time_updated,
      m.data,
      s.directory,
      s.title
    FROM message m
    LEFT JOIN session s ON s.id = m.session_id
    WHERE m.time_updated > ?
    ORDER BY m.time_updated ASC
  `).all(lastScanned);

  if (rows.length === 0) {
    kiloDb.close();
    return { new: 0, updated: 0, skipped: 1, turns: 0, sessions: 0 };
  }

  const sessions = new Map();
  const turns = [];

  for (const rowData of rows) {
    const parsed = parseMessageRow(rowData);
    if (!parsed) continue;

    if (!sessions.has(parsed.session.session_id)) {
      sessions.set(parsed.session.session_id, parsed.session);
    } else {
      const existing = sessions.get(parsed.session.session_id);
      if (parsed.session.last_timestamp > existing.last_timestamp) {
        existing.last_timestamp = parsed.session.last_timestamp;
      }
      if (parsed.session.model && parsed.session.model !== 'unknown') {
        existing.model = parsed.session.model;
      }
    }

    turns.push(parsed.turn);
  }

  kiloDb.close();

  if (turns.length === 0) {
    db.prepare('INSERT OR REPLACE INTO processed_files (path, mtime, lines) VALUES (?, ?, ?)').run(dbPath, Date.now(), rows.length);
    return { new: 0, updated: 0, skipped: 1, turns: 0, sessions: 0 };
  }

  const aggregated = aggregateSessions(Array.from(sessions.values()), turns, PROVIDER_ID);
  upsertSessions(db, aggregated);
  insertTurns(db, turns);
  recomputeSessionTotals(db, PROVIDER_ID);

  const maxSeen = rows[rows.length - 1].time_updated;
  db.prepare('INSERT OR REPLACE INTO processed_files (path, mtime, lines) VALUES (?, ?, ?)').run(dbPath, maxSeen, rows.length);

  return { new: 1, updated: 0, skipped: 0, turns: turns.length, sessions: sessions.size };
}

function scanLiveKiloUsage(db, verbose) {
  const codexbar = findCodexbar();
  if (!codexbar) {
    if (verbose) console.log('  [kilo] CodexBar CLI not found for live usage fallback');
    return { new: 0, updated: 0, skipped: 1, turns: 0, sessions: 0 };
  }

  let jsonStr;
  try {
    jsonStr = execSync(`${codexbar} --provider kilo --format json --pretty`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (verbose) console.log(`  [kilo] Live fallback error: ${err.message}`);
    return { new: 0, updated: 0, skipped: 1, turns: 0, sessions: 0 };
  }

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    if (verbose) console.log('  [kilo] Failed to parse live fallback JSON');
    return { new: 0, updated: 0, skipped: 1, turns: 0, sessions: 0 };
  }

  const payload = Array.isArray(data) ? data.find(entry => entry?.provider === 'kilo') : data;
  if (!payload?.usage) {
    return { new: 0, updated: 0, skipped: 1, turns: 0, sessions: 0 };
  }

  const { session, turn } = parseKiloUsage(payload);
  db.prepare('DELETE FROM turns WHERE provider_id = ? AND session_id = ?').run(PROVIDER_ID, LIVE_SESSION_ID);
  db.prepare('DELETE FROM sessions WHERE provider_id = ? AND session_id = ?').run(PROVIDER_ID, LIVE_SESSION_ID);

  const aggregated = aggregateSessions([session], [turn], PROVIDER_ID);
  upsertSessions(db, aggregated);
  insertTurns(db, [turn]);
  recomputeSessionTotals(db, PROVIDER_ID);

  return { new: 1, updated: 0, skipped: 0, turns: 1, sessions: 1 };
}

export function scan(db, options = {}) {
  const verbose = options.verbose !== false;
  const dbPath = options.dbPath || KILO_DB_PATH;

  const dbResult = scanKiloDb(db, dbPath, verbose);
  if (dbResult && dbResult.turns > 0) {
    if (verbose) console.log(`  [kilo] Imported ${dbResult.turns} turns from local Kilo DB`);
    return dbResult;
  }

  const liveResult = scanLiveKiloUsage(db, verbose);
  if (verbose && liveResult.turns > 0) {
    console.log('  [kilo] Using live CodexBar fallback');
  }
  return liveResult;
}

export function getProviderId() { return PROVIDER_ID; }
export function getProviderName() { return PROVIDER_NAME; }
