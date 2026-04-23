import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { aggregateSessions, upsertSessions, insertTurns, recomputeSessionTotals } from './db-helpers.js';

const PROVIDER_ID = 'anthropic';
const PROVIDER_NAME = 'Anthropic Claude';
const MTIME_TOLERANCE_MS = 0.01;

const CLAUDE_PROJECTS_DIRS = [
  join(homedir(), '.claude', 'projects'),
  join(homedir(), 'Library', 'Developer', 'Xcode', 'CodingAssistant', 'ClaudeAgentConfig', 'projects'),
];

function projectNameFromCwd(cwd) {
  if (!cwd) return 'unknown';
  const parts = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  if (parts.length >= 2) return parts.slice(-2).join('/');
  return parts[parts.length - 1] || 'unknown';
}

async function findJsonlFiles(dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findJsonlFiles(fullPath)));
      } else if (entry.name.endsWith('.jsonl')) {
        const s = await stat(fullPath);
        results.push({ path: fullPath, mtime: s.mtimeMs, size: s.size });
      }
    }
  } catch {
    // Directory doesn't exist or not accessible
  }
  return results;
}

async function parseJsonlFile(filepath) {
  const seenMessages = new Map();
  const turnsNoId = [];
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

    const rtype = record.type;
    if (rtype !== 'assistant' && rtype !== 'user') continue;

    const sessionId = record.sessionId;
    if (!sessionId) continue;

    const timestamp = record.timestamp || '';
    const cwd = record.cwd || '';
    const gitBranch = record.gitBranch || '';

    if (!sessionMeta.has(sessionId)) {
      sessionMeta.set(sessionId, {
        session_id: sessionId,
        project_name: projectNameFromCwd(cwd),
        first_timestamp: timestamp,
        last_timestamp: timestamp,
        git_branch: gitBranch,
        model: null,
      });
    } else {
      const meta = sessionMeta.get(sessionId);
      if (timestamp && (!meta.first_timestamp || timestamp < meta.first_timestamp)) {
        meta.first_timestamp = timestamp;
      }
      if (timestamp && (!meta.last_timestamp || timestamp > meta.last_timestamp)) {
        meta.last_timestamp = timestamp;
      }
      if (gitBranch && !meta.git_branch) meta.git_branch = gitBranch;
    }

    if (rtype === 'assistant') {
      const msg = record.message || {};
      const usage = msg.usage || {};
      const model = msg.model || '';
      const messageId = msg.id || '';

      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheCreation = usage.cache_creation_input_tokens || 0;

      if (inputTokens + outputTokens + cacheRead + cacheCreation === 0) continue;

      let toolName = null;
      if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item && item.type === 'tool_use') {
            toolName = item.name;
            break;
          }
        }
      }

      if (model) {
        const meta = sessionMeta.get(sessionId);
        if (meta) meta.model = model;
      }

      const turn = {
        session_id: sessionId,
        provider_id: PROVIDER_ID,
        timestamp,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheRead,
        cache_creation_tokens: cacheCreation,
        reasoning_tokens: 0,
        tool_name: toolName,
        message_id: messageId,
      };

      if (messageId) {
        seenMessages.set(messageId, turn);
      } else {
        turnsNoId.push(turn);
      }
    }
  }

  const turns = [...turnsNoId, ...seenMessages.values()];
  return {
    sessions: Array.from(sessionMeta.values()),
    turns,
    lineCount,
  };
}

export async function scan(db, options = {}) {
  const dirsToScan = options.dirs || CLAUDE_PROJECTS_DIRS;
  const verbose = options.verbose !== false;

  let newFiles = 0;
  let updatedFiles = 0;
  let skippedFiles = 0;
  let totalTurns = 0;
  const totalSessions = new Set();

  for (const dir of dirsToScan) {
    const files = await findJsonlFiles(dir);
    if (files.length === 0) continue;

    if (verbose) console.log(`  [anthropic] Scanning ${dir} ...`);

    for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
      const row = db.prepare(
        'SELECT mtime, lines FROM processed_files WHERE path = ?'
      ).get(file.path);

      if (row && Math.abs(row.mtime - file.mtime) < MTIME_TOLERANCE_MS) {
        skippedFiles++;
        continue;
      }

      const isNew = !row;
      if (verbose) {
        const status = isNew ? 'NEW' : 'UPD';
        console.log(`    [${status}] ${file.path}`);
      }

      const { sessions, turns, lineCount } = await parseJsonlFile(file.path);

      if (turns.length > 0 || sessions.length > 0) {
        const aggregated = aggregateSessions(sessions, turns, PROVIDER_ID);
        upsertSessions(db, aggregated);
        insertTurns(db, turns);
        for (const s of aggregated) totalSessions.add(s.session_id);
        totalTurns += turns.length;
        if (!isNew) updatedFiles++;
      }
      if (isNew) newFiles++;

      db.prepare(
        'INSERT OR REPLACE INTO processed_files (path, mtime, lines) VALUES (?, ?, ?)'
      ).run(file.path, file.mtime, lineCount);
    }
  }

  if (newFiles > 0 || updatedFiles > 0) {
    recomputeSessionTotals(db, PROVIDER_ID);
  }

  const result = { new: newFiles, updated: updatedFiles, skipped: skippedFiles, turns: totalTurns, sessions: totalSessions.size };
  if (verbose) {
    console.log(`  [anthropic] Done: ${result.new} new, ${result.updated} updated, ${result.skipped} skipped, ${result.turns} turns`);
  }
  return result;
}

export function getProviderName() { return PROVIDER_NAME; }
