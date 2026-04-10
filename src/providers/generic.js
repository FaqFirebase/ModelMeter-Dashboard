import { readFile } from 'fs/promises';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { aggregateSessions, upsertSessions, insertTurns, recomputeSessionTotals } from './db-helpers.js';

const PROVIDER_ID = 'import';
const PROVIDER_NAME = 'Generic Import';
const DEFAULT_PROJECT_NAME = 'imported';

async function parseImportFile(filepath, providerId) {
  const turns = [];
  const sessionMeta = new Map();
  let lineCount = 0;

  const isJsonl = filepath.endsWith('.jsonl');

  if (isJsonl) {
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

      processRecord(record, sessionMeta, turns, providerId, filepath);
    }
  } else {
    const content = await readFile(filepath, 'utf-8');
    lineCount = 1;
    try {
      const data = JSON.parse(content);
      const records = Array.isArray(data) ? data : [data];
      for (const record of records) {
        processRecord(record, sessionMeta, turns, providerId, filepath);
      }
    } catch {
      // Invalid JSON
    }
  }

  return {
    sessions: Array.from(sessionMeta.values()),
    turns,
    lineCount,
  };
}

function processRecord(record, sessionMeta, turns, providerId, filepath) {
  const sessionId = record.session_id || record.conversation_id || record.id || filepath;
  const timestamp = String(record.timestamp || record.created_at || record.date || '');
  const model = record.model || '';

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheCreation = 0;
  let reasoningTokens = 0;

  // Support multiple token field naming conventions
  const usage = record.usage || record.tokens || record;
  inputTokens = usage.input_tokens || usage.prompt_tokens || usage.inputTokens || usage.promptTokens || 0;
  outputTokens = usage.output_tokens || usage.completion_tokens || usage.outputTokens || usage.completionTokens || 0;
  cacheRead = usage.cache_read_input_tokens || usage.cache_read_tokens || usage.cachedTokens || 0;
  cacheCreation = usage.cache_creation_input_tokens || usage.cache_creation_tokens || 0;
  reasoningTokens = usage.reasoning_tokens || usage.reasoningTokens || 0;

  if (inputTokens + outputTokens + cacheRead + cacheCreation + reasoningTokens === 0) return;

  const messageId = record.message_id || record.id || '';

  if (!sessionMeta.has(sessionId)) {
    sessionMeta.set(sessionId, {
      session_id: sessionId,
      project_name: record.project || record.project_name || DEFAULT_PROJECT_NAME,
      first_timestamp: timestamp,
      last_timestamp: timestamp,
      model,
    });
  } else {
    const meta = sessionMeta.get(sessionId);
    if (timestamp && (!meta.last_timestamp || timestamp > meta.last_timestamp)) {
      meta.last_timestamp = timestamp;
    }
    if (model) meta.model = model;
  }

  turns.push({
    session_id: sessionId,
    provider_id: providerId,
    timestamp,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheRead,
    cache_creation_tokens: cacheCreation,
    reasoning_tokens: reasoningTokens,
    tool_name: record.tool_name || null,
    message_id: messageId,
  });
}

export async function importFile(db, filepath, providerId = PROVIDER_ID, options = {}) {
  const verbose = options.verbose !== false;

  try {
    await stat(filepath);
  } catch {
    throw new Error(`File not found: ${filepath}`);
  }

  if (verbose) console.log(`  [import] Processing ${filepath} as ${providerId} ...`);

  const { sessions, turns, lineCount } = await parseImportFile(filepath, providerId);

  if (turns.length > 0) {
    const aggregated = aggregateSessions(sessions, turns, providerId);
    upsertSessions(db, aggregated);
    insertTurns(db, turns);
  }

  const s = await stat(filepath);
  db.prepare(
    'INSERT OR REPLACE INTO processed_files (path, mtime, lines) VALUES (?, ?, ?)'
  ).run(filepath, s.mtimeMs, lineCount);

  if (providerId !== PROVIDER_ID) {
    recomputeSessionTotals(db, providerId);
  }

  const result = { turns: turns.length, sessions: new Set(sessions.map(s => s.session_id)).size, lines: lineCount };
  if (verbose) {
    console.log(`  [import] Done: ${result.sessions} sessions, ${result.turns} turns from ${result.lines} lines`);
  }
  return result;
}

export function getProviderId() { return PROVIDER_ID; }
export function getProviderName() { return PROVIDER_NAME; }
