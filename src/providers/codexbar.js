import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { aggregateSessions, upsertSessions, insertTurns, recomputeSessionTotals } from './db-helpers.js';

const PROVIDER_ID = 'codexbar';
const PROVIDER_NAME = 'CodexBar CLI';
const PROVIDER_ALIAS = {
  claude: 'anthropic',
};

export function findCodexbar() {
  const isWindows = process.platform === 'win32';

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

export function parseProviderData(data, providerMap) {
  const providerId = PROVIDER_ALIAS[data.provider] || data.provider || 'unknown';
  const daily = data.daily || [];

  if (!providerMap.has(providerId)) {
    providerMap.set(providerId, {
      sessions: new Map(),
      turns: [],
    });
  }

  const providerData = providerMap.get(providerId);

  for (const day of daily) {
    const date = day.date || '';
    if (!date) continue;

    const models = day.modelBreakdowns || [];
    const sessionId = `${providerId}-${date}`;
    const timestamp = `${date}T12:00:00Z`;
    const hasTotals = (day.totalTokens || 0) > 0 || (day.totalCost || 0) > 0;

    if (!providerData.sessions.has(sessionId)) {
      providerData.sessions.set(sessionId, {
        session_id: sessionId,
        provider_id: providerId,
        project_name: 'codexbar-import',
        first_timestamp: timestamp,
        last_timestamp: timestamp,
        model: models.length === 1 ? (models[0].modelName || 'unknown') : (models.length > 1 ? 'mixed-models' : 'unknown'),
      });
    }

    if (models.length === 1) {
      const model = models[0];
      providerData.turns.push({
        session_id: sessionId,
        provider_id: providerId,
        timestamp,
        model: model.modelName || 'unknown',
        input_tokens: day.inputTokens || 0,
        output_tokens: day.outputTokens || 0,
        cache_read_tokens: day.cacheReadTokens || 0,
        cache_creation_tokens: day.cacheCreationTokens || 0,
        reasoning_tokens: 0,
        reported_total_tokens: model.totalTokens ?? day.totalTokens ?? null,
        reported_cost_usd: model.cost ?? day.totalCost ?? null,
        tool_name: null,
        message_id: `${providerId}-${date}-${model.modelName || 'unknown'}`,
      });
      continue;
    }

    if (models.length > 1) {
      const knownModelCost = models.reduce((sum, model) => sum + (model.cost || 0), 0);
      const knownModelTokens = models.reduce((sum, model) => sum + (model.totalTokens || 0), 0);
      const residualCost = Math.max(0, (day.totalCost || 0) - knownModelCost);
      const residualTokens = Math.max(0, (day.totalTokens || 0) - knownModelTokens);

      if (hasTotals) {
        providerData.turns.push({
          session_id: sessionId,
          provider_id: providerId,
          timestamp,
          model: 'mixed-models',
          input_tokens: day.inputTokens || 0,
          output_tokens: day.outputTokens || 0,
          cache_read_tokens: day.cacheReadTokens || 0,
          cache_creation_tokens: day.cacheCreationTokens || 0,
          reasoning_tokens: 0,
          reported_total_tokens: residualTokens > 0 ? residualTokens : null,
          reported_cost_usd: residualCost > 0 ? residualCost : null,
          tool_name: null,
          message_id: `${providerId}-${date}-totals`,
        });
      }

      for (const model of models) {
        providerData.turns.push({
          session_id: sessionId,
          provider_id: providerId,
          timestamp,
          model: model.modelName || 'unknown',
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          reasoning_tokens: 0,
          reported_total_tokens: model.totalTokens ?? null,
          reported_cost_usd: model.cost ?? null,
          tool_name: null,
          message_id: `${providerId}-${date}-${model.modelName || 'unknown'}`,
        });
      }
      continue;
    }

    if (hasTotals) {
      providerData.turns.push({
        session_id: sessionId,
        provider_id: providerId,
        timestamp,
        model: 'unknown',
        input_tokens: day.inputTokens || 0,
        output_tokens: day.outputTokens || 0,
        cache_read_tokens: day.cacheReadTokens || 0,
        cache_creation_tokens: day.cacheCreationTokens || 0,
        reasoning_tokens: 0,
        reported_total_tokens: day.totalTokens ?? null,
        reported_cost_usd: day.totalCost ?? null,
        tool_name: null,
        message_id: `${providerId}-${date}`,
      });
    }
  }
}

export function scan(db, options = {}) {
  const verbose = options.verbose !== false;
  const codexbar = findCodexbar();

  if (!codexbar) {
    if (verbose) console.log(`  [codexbar] CLI not found. Install: brew install steipete/tap/codexbar (macOS/Linux) or github.com/Finesssee/Win-CodexBar (Windows)`);
    return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
  }

  if (verbose) console.log(`  [codexbar] Running ${codexbar} cost --provider all --format json ...`);

  let jsonStr;
  try {
    jsonStr = execSync(`${codexbar} cost --provider all --format json --pretty`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (verbose) console.log(`  [codexbar] Error: ${err.message}`);
    return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
  }

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    if (verbose) console.log(`  [codexbar] Failed to parse JSON output`);
    return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
  }

  if (!Array.isArray(data)) {
    data = [data];
  }

  const providerMap = new Map();

  for (const entry of data) {
    parseProviderData(entry, providerMap);
  }

  let totalTurns = 0;
  let totalSessions = 0;

  for (const [providerId, { sessions, turns }] of providerMap) {
    if (turns.length === 0) continue;

    const sessionIds = Array.from(sessions.keys());
    const deleteTurnStmt = db.prepare('DELETE FROM turns WHERE provider_id = ? AND session_id = ?');
    const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE provider_id = ? AND session_id = ? AND project_name = ?');
    const deleteExisting = db.transaction((ids) => {
      for (const sessionId of ids) {
        deleteTurnStmt.run(providerId, sessionId);
        deleteSessionStmt.run(providerId, sessionId, 'codexbar-import');
      }
    });
    deleteExisting(sessionIds);

    const sessionList = Array.from(sessions.values());
    const aggregated = aggregateSessions(sessionList, turns, providerId);
    upsertSessions(db, aggregated);
    insertTurns(db, turns);
    recomputeSessionTotals(db, providerId);

    totalTurns += turns.length;
    totalSessions += sessions.size;
  }

  if (verbose) {
    console.log(`  [codexbar] Done: ${providerMap.size} providers, ${totalSessions} sessions, ${totalTurns} turns`);
  }

  return { new: providerMap.size, updated: 0, skipped: 0, turns: totalTurns, sessions: totalSessions };
}

export function getProviderName() { return PROVIDER_NAME; }
