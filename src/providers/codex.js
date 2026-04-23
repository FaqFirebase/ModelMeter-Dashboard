import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import { aggregateSessions, upsertSessions, insertTurns, recomputeSessionTotals } from './db-helpers.js';

const PROVIDER_ID = 'codex';
const PROVIDER_NAME = 'OpenAI Codex';

const CODEX_DB_PATH = join(homedir(), '.codex', 'logs_2.sqlite');

function extractTokenUsage(body) {
  const tokensMatch = body.match(/total_usage_tokens=(\d+)/);
  const modelMatch = body.match(/model=([\w.\-]+)/);
  const threadMatch = body.match(/thread_id=([\w\-]+)/);
  const turnMatch = body.match(/turn_id=([\w\-]+)/);

  if (!tokensMatch || !modelMatch) return null;

  return {
    totalTokens: parseInt(tokensMatch[1], 10),
    model: modelMatch[1],
    threadId: threadMatch ? threadMatch[1] : 'unknown',
    turnId: turnMatch ? turnMatch[1] : '',
  };
}

function extractModelFromContext(body) {
  const modelMatch = body.match(/model=([\w.\-]+)/);
  return modelMatch ? modelMatch[1] : 'unknown';
}

export function scan(db, options = {}) {
  const dbPath = options.dbPath || CODEX_DB_PATH;
  const verbose = options.verbose !== false;

  if (!existsSync(dbPath)) {
    if (verbose) console.log(`  [codex] Database not found at ${dbPath}`);
    return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
  }

  if (verbose) console.log(`  [codex] Scanning ${dbPath} ...`);

  let lastScannedId = 0;
  const row = db.prepare(
    'SELECT mtime FROM processed_files WHERE path = ?'
  ).get(dbPath);
  if (row) {
    lastScannedId = Math.floor(row.mtime);
  }

  const codexDb = new Database(dbPath, { readonly: true });

  const logs = codexDb.prepare(`
    SELECT id, ts, feedback_log_body
    FROM logs
    WHERE id > ?
      AND feedback_log_body LIKE '%post sampling token usage%'
    ORDER BY id ASC
  `).all(lastScannedId);

  if (logs.length === 0) {
    codexDb.close();
    if (verbose) console.log(`  [codex] No new usage data`);
    return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
  }

  const turns = [];
  const sessions = new Map();

  for (const log of logs) {
    const usage = extractTokenUsage(log.feedback_log_body);
    if (!usage) continue;

    const timestamp = new Date(log.ts * 1000).toISOString();

    if (!sessions.has(usage.threadId)) {
      sessions.set(usage.threadId, {
        session_id: usage.threadId,
        provider_id: PROVIDER_ID,
        project_name: 'codex',
        first_timestamp: timestamp,
        last_timestamp: timestamp,
        model: usage.model,
      });
    } else {
      const meta = sessions.get(usage.threadId);
      if (timestamp > meta.last_timestamp) meta.last_timestamp = timestamp;
      if (usage.model && usage.model !== 'unknown') meta.model = usage.model;
    }

    turns.push({
      session_id: usage.threadId,
      provider_id: PROVIDER_ID,
      timestamp,
      model: usage.model,
      input_tokens: usage.totalTokens,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      reasoning_tokens: 0,
      tool_name: null,
      message_id: usage.turnId,
    });
  }

  codexDb.close();

  if (turns.length > 0) {
    const sessionList = Array.from(sessions.values());
    const aggregated = aggregateSessions(sessionList, turns, PROVIDER_ID);
    upsertSessions(db, aggregated);
    insertTurns(db, turns);
  }

  const maxId = logs[logs.length - 1].id;
  db.prepare(
    'INSERT OR REPLACE INTO processed_files (path, mtime, lines) VALUES (?, ?, ?)'
  ).run(dbPath, maxId, logs.length);

  recomputeSessionTotals(db, PROVIDER_ID);

  const result = {
    new: 1,
    updated: 0,
    skipped: 0,
    turns: turns.length,
    sessions: sessions.size,
  };

  if (verbose) {
    console.log(`  [codex] Done: ${result.sessions} sessions, ${result.turns} turns`);
  }
  return result;
}

export function getProviderName() { return PROVIDER_NAME; }
