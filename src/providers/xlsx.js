import { stat } from 'fs/promises';
import XLSX from 'xlsx';
import { aggregateSessions, upsertSessions, insertTurns, recomputeSessionTotals } from './db-helpers.js';

function findColumn(row, names) {
  // Exact match first
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (key === name) {
        return row[key];
      }
    }
  }
  // Then partial match
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().includes(name.toLowerCase())) {
        return row[key];
      }
    }
  }
  return null;
}

function processRow(row, providerId, sessionMap, turns) {
  const date = findColumn(row, ['Date']);
  const model = findColumn(row, ['Model']) || 'unknown';

  // Token columns - exact match first, then fallback to generic names
  const inputHitTokens = Number(findColumn(row, ['Input Hit Tokens']) || 0);
  const inputMissTokens = Number(findColumn(row, ['Input Miss Tokens']) || 0);
  const outputTokens = Number(findColumn(row, ['Output Tokens']) || 0);
  const totalTokens = Number(findColumn(row, ['Total Tokens']) || 0);
  const cost = findColumn(row, ['Consumed Amount']) || 0;

  // Generic fallbacks
  const fallbackInput = Number(findColumn(row, ['input_tokens', 'input_token', 'prompt_tokens']) || 0);
  const fallbackOutput = Number(findColumn(row, ['output_tokens', 'output_token', 'completion_tokens']) || 0);

  // Calculate actual token counts
  const actualInput = (inputHitTokens + inputMissTokens) || fallbackInput;
  const actualOutput = outputTokens || fallbackOutput;

  if (actualInput === 0 && actualOutput === 0 && totalTokens === 0) return;

  const dateStr = date ? String(date).replace(/[^0-9-]/g, '').slice(0, 10) : new Date().toISOString().slice(0, 10);
  const sessionId = `${providerId}-${dateStr}`;
  const timestamp = `${dateStr}T12:00:00Z`;

  if (!sessionMap.has(sessionId)) {
    sessionMap.set(sessionId, {
      session_id: sessionId,
      provider_id: providerId,
      project_name: 'xiaomi-import',
      first_timestamp: timestamp,
      last_timestamp: timestamp,
      model,
    });
  }

  turns.push({
    session_id: sessionId,
    provider_id: providerId,
    timestamp,
    model,
    input_tokens: actualInput,
    output_tokens: actualOutput,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    reasoning_tokens: 0,
    tool_name: null,
    message_id: `${providerId}-${dateStr}-${model}`,
  });
}

export async function importXlsx(db, filepath, providerId = 'xiaomi', options = {}) {
  const verbose = options.verbose !== false;

  try {
    await stat(filepath);
  } catch {
    throw new Error(`File not found: ${filepath}`);
  }

  if (verbose) console.log(`  [xlsx] Importing ${filepath} as ${providerId} ...`);

  const workbook = XLSX.readFile(filepath);
  const sessionMap = new Map();
  const turns = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    for (const row of rows) {
      processRow(row, providerId, sessionMap, turns);
    }
  }

  if (turns.length > 0) {
    const sessionList = Array.from(sessionMap.values());
    const aggregated = aggregateSessions(sessionList, turns, providerId);
    upsertSessions(db, aggregated);
    insertTurns(db, turns);
    recomputeSessionTotals(db, providerId);
  }

  const result = {
    turns: turns.length,
    sessions: sessionMap.size,
    sheets: workbook.SheetNames.length,
  };

  if (verbose) {
    console.log(`  [xlsx] Done: ${result.sessions} sessions, ${result.turns} turns from ${result.sheets} sheets`);
  }

  return result;
}
