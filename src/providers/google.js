import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { aggregateSessions, upsertSessions, insertTurns } from './db-helpers.js';

const PROVIDER_ID = 'google';
const PROVIDER_NAME = 'Google Gemini';
const MTIME_TOLERANCE_MS = 0.01;

const GOOGLE_LOG_DIRS = [
  join(homedir(), '.google', 'gemini', 'logs'),
  join(homedir(), '.config', 'google', 'logs'),
];

function projectNameFromPath(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1].replace(/\.(jsonl|json)$/, '');
}

async function findLogFiles(dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findLogFiles(fullPath)));
      } else if (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json')) {
        const s = await stat(fullPath);
        results.push({ path: fullPath, mtime: s.mtimeMs, size: s.size });
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return results;
}

async function parseGoogleJsonl(filepath) {
  const turns = [];
  const sessionMeta = new Map();
  let lineCount = 0;

  const rl = createInterface({
    input: createReadStream(filepath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineCount++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const sessionId = record.session_id || record.conversation_id || filepath;
    const timestamp = record.timestamp || record.createTime || '';
    const model = record.model || '';

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheRead = 0;

    // Google AI Studio / Vertex AI usage format
    const usage = record.usageMetadata || record.usage || {};
    if (usage) {
      inputTokens = usage.promptTokenCount || usage.input_tokens || 0;
      outputTokens = usage.candidatesTokenCount || usage.output_tokens || 0;
      cacheRead = usage.cachedContentTokenCount || 0;
    }

    if (inputTokens + outputTokens + cacheRead === 0) continue;

    const messageId = record.id || record.name || '';

    if (!sessionMeta.has(sessionId)) {
      sessionMeta.set(sessionId, {
        session_id: sessionId,
        project_name: projectNameFromPath(filepath),
        first_timestamp: String(timestamp),
        last_timestamp: String(timestamp),
        model,
      });
    } else {
      const meta = sessionMeta.get(sessionId);
      const tsStr = String(timestamp);
      if (tsStr && (!meta.last_timestamp || tsStr > meta.last_timestamp)) {
        meta.last_timestamp = tsStr;
      }
      if (model) meta.model = model;
    }

    turns.push({
      session_id: sessionId,
      provider_id: PROVIDER_ID,
      timestamp: String(timestamp),
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheRead,
      cache_creation_tokens: 0,
      reasoning_tokens: 0,
      tool_name: null,
      message_id: messageId,
    });
  }

  return {
    sessions: Array.from(sessionMeta.values()),
    turns,
    lineCount,
  };
}

export async function scan(db, options = {}) {
  const dirsToScan = options.dirs || GOOGLE_LOG_DIRS;
  const verbose = options.verbose !== false;

  let newFiles = 0;
  let skippedFiles = 0;
  let totalTurns = 0;
  const totalSessions = new Set();

  for (const dir of dirsToScan) {
    const files = await findLogFiles(dir);
    if (files.length === 0) continue;

    if (verbose) console.log(`  [google] Scanning ${dir} ...`);

    for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
      const row = db.prepare(
        'SELECT mtime, lines FROM processed_files WHERE path = ?'
      ).get(file.path);

      if (row && Math.abs(row.mtime - file.mtime) < MTIME_TOLERANCE_MS) {
        skippedFiles++;
        continue;
      }

      if (verbose) console.log(`    [NEW] ${file.path}`);

      const { sessions, turns, lineCount } = await parseGoogleJsonl(file.path);

      if (turns.length > 0) {
        const aggregated = aggregateSessions(sessions, turns, PROVIDER_ID);
        upsertSessions(db, aggregated);
        insertTurns(db, turns);
        for (const s of aggregated) totalSessions.add(s.session_id);
        totalTurns += turns.length;
        newFiles++;
      }

      db.prepare(
        'INSERT OR REPLACE INTO processed_files (path, mtime, lines) VALUES (?, ?, ?)'
      ).run(file.path, file.mtime, lineCount);
    }
  }

  const result = { new: newFiles, updated: 0, skipped: skippedFiles, turns: totalTurns, sessions: totalSessions.size };
  if (verbose) {
    console.log(`  [google] Done: ${result.new} new, ${result.skipped} skipped, ${result.turns} turns`);
  }
  return result;
}

export function getProviderId() { return PROVIDER_ID; }
export function getProviderName() { return PROVIDER_NAME; }
