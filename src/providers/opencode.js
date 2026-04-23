import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import { aggregateSessions, upsertSessions, insertTurns, recomputeSessionTotals } from './db-helpers.js';

const PROVIDER_ID = 'opencode';
const PROVIDER_NAME = 'OpenCode';

const OPENCODE_DB_PATH = join(homedir(), '.local', 'share', 'opencode', 'opencode.db');

export function scan(db, options = {}) {
  const dbPath = options.dbPath || OPENCODE_DB_PATH;
  const verbose = options.verbose !== false;

  if (!existsSync(dbPath)) {
    if (verbose) console.log(`  [opencode] Database not found at ${dbPath}`);
    return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
  }

  if (verbose) console.log(`  [opencode] Scanning ${dbPath} ...`);

  let lastScannedId = 0;
  const row = db.prepare(
    'SELECT mtime FROM processed_files WHERE path = ?'
  ).get(dbPath);
  if (row) {
    lastScannedId = row.mtime;
  }

  const opencodeDb = new Database(dbPath, { readonly: true });

  // Find step-finish parts that contain token usage data
  // Join with message to get model info from the parent user message
  const parts = opencodeDb.prepare(`
    SELECT
      p.id as part_id,
      p.message_id,
      p.session_id,
      p.data as part_data,
      p.time_created,
      m.data as message_data
    FROM part p
    LEFT JOIN message m ON m.id = p.message_id
    WHERE p.data LIKE '%"step-finish"%'
      AND p.time_created > ?
    ORDER BY p.time_created ASC
  `).all(lastScannedId);

  if (parts.length === 0) {
    opencodeDb.close();
    if (verbose) console.log(`  [opencode] No new usage data`);
    return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
  }

  // Get session metadata
  const sessionIds = [...new Set(parts.map(p => p.session_id))];
  const placeholders = sessionIds.map(() => '?').join(',');
  const sessionRows = opencodeDb.prepare(
    `SELECT id, directory, title, time_created, time_updated FROM session WHERE id IN (${placeholders})`
  ).all(...sessionIds);

  const sessionMeta = new Map();
  for (const s of sessionRows) {
    sessionMeta.set(s.id, s);
  }

  const turns = [];
  const sessions = new Map();

  for (const part of parts) {
    let partData;
    try {
      partData = JSON.parse(part.part_data);
    } catch { continue; }
    if (partData.type !== 'step-finish' || !partData.tokens) continue;

    const tokens = partData.tokens;
    const timestamp = new Date(part.time_created).toISOString();
    const sessionId = part.session_id;

    // Extract model from the assistant message's data
    let model = 'unknown';
    if (part.message_data) {
      try {
        const msgData = JSON.parse(part.message_data);
        if (msgData.model && msgData.model.modelID) {
          model = msgData.model.modelID;
        }
      } catch { /* skip */ }
    }

    if (!sessions.has(sessionId)) {
      const meta = sessionMeta.get(sessionId);
      sessions.set(sessionId, {
        session_id: sessionId,
        provider_id: PROVIDER_ID,
        project_name: meta ? projectNameFromDir(meta.directory) : 'unknown',
        first_timestamp: timestamp,
        last_timestamp: timestamp,
        model,
      });
    } else {
      const s = sessions.get(sessionId);
      if (timestamp > s.last_timestamp) s.last_timestamp = timestamp;
      if (model && model !== 'unknown') s.model = model;
    }

    turns.push({
      session_id: sessionId,
      provider_id: PROVIDER_ID,
      timestamp,
      model,
      input_tokens: tokens.input || 0,
      output_tokens: tokens.output || 0,
      cache_read_tokens: tokens.cache?.read || 0,
      cache_creation_tokens: tokens.cache?.write || 0,
      reasoning_tokens: tokens.reasoning || 0,
      reported_total_tokens: tokens.total || null,
      reported_cost_usd: partData.cost || null,
      tool_name: null,
      message_id: part.message_id,
    });
  }

  opencodeDb.close();

  if (turns.length > 0) {
    const sessionList = Array.from(sessions.values());
    const aggregated = aggregateSessions(sessionList, turns, PROVIDER_ID);
    upsertSessions(db, aggregated);
    insertTurns(db, turns);
  }

  const maxTime = parts[parts.length - 1].time_created;
  db.prepare(
    'INSERT OR REPLACE INTO processed_files (path, mtime, lines) VALUES (?, ?, ?)'
  ).run(dbPath, maxTime, parts.length);

  recomputeSessionTotals(db, PROVIDER_ID);

  const result = {
    new: 1,
    updated: 0,
    skipped: 0,
    turns: turns.length,
    sessions: sessions.size,
  };

  if (verbose) {
    console.log(`  [opencode] Done: ${result.sessions} sessions, ${result.turns} turns`);
  }
  return result;
}

function projectNameFromDir(dir) {
  if (!dir) return 'unknown';
  const parts = dir.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  if (parts.length >= 2) return parts.slice(-2).join('/');
  return parts[parts.length - 1] || 'unknown';
}

export function getProviderName() { return PROVIDER_NAME; }
