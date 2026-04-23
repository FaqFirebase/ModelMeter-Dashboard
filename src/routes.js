import { Router } from 'express';
import { resolve } from 'path';
import { homedir } from 'os';
import { getDb, initDb, registerProvider } from './db.js';
import { scanProvider, scanAllProviders, getRegisteredProviders } from './providers/index.js';
import { importFile } from './providers/generic.js';
import { importXlsx } from './providers/xlsx.js';
import { getAllPricing, getResolvedCost } from './pricing.js';

const HOME_DIR = homedir();
const ALLOWED_EXTENSIONS = new Set(['.jsonl', '.json', '.xlsx', '.xls']);

/**
 * Resolves and validates a user-supplied import path.
 * - Must resolve to within the user's home directory.
 * - Must have an allowed file extension.
 * Throws if either constraint is violated.
 */
function resolveImportPath(filepath) {
  if (!filepath || typeof filepath !== 'string') {
    throw new Error('filepath must be a non-empty string');
  }
  const abs = resolve(filepath);
  if (!abs.startsWith(HOME_DIR + '/') && abs !== HOME_DIR) {
    throw new Error('filepath must be within your home directory');
  }
  const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
  }
  return abs;
}

export function createRouter(db) {
  const router = Router();
  const isOwner = !db;
  if (!db) {
    db = getDb();
    initDb(db);
    for (const p of getRegisteredProviders()) {
      registerProvider(db, p.id, p.name, p);
    }
  }

  // GET /api/data - Dashboard data
  router.get('/data', async (req, res) => {
    try {
      const data = getDashboardData(db);
      res.json(data);
    } catch (err) {
      console.error('[data]', err.message);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  });

  // GET /api/providers - List registered providers
  router.get('/providers', (req, res) => {
    try {
      const providers = getRegisteredProviders(db);
      const dbProviders = db.prepare('SELECT * FROM providers').all();
      res.json({ registered: providers, db: dbProviders });
    } catch (err) {
      console.error('[providers]', err.message);
      res.status(500).json({ error: 'Failed to fetch providers' });
    }
  });

  // POST /api/scan - Scan all providers
  router.post('/scan', async (req, res) => {
    try {
      const result = await scanAllProviders(db, { verbose: false });
      res.json(result);
    } catch (err) {
      console.error(`[scan] ${err.message}`);
      res.status(500).json({ error: 'Scan failed' });
    }
  });

  // POST /api/scan/:provider - Scan specific provider
  router.post('/scan/:provider', async (req, res) => {
    try {
      const result = await scanProvider(db, req.params.provider, { verbose: false });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/import - Import a file
  router.post('/import', async (req, res) => {
    let safePath;
    try {
      const { filepath, providerId } = req.body;
      safePath = resolveImportPath(filepath);

      const isXlsx = safePath.endsWith('.xlsx') || safePath.endsWith('.xls');
      let result;

      if (isXlsx) {
        result = await importXlsx(db, safePath, providerId || 'xiaomi', { verbose: false });
      } else {
        result = await importFile(db, safePath, providerId || 'import', { verbose: false });
      }

      res.json(result);
    } catch (err) {
      console.error(`[import] Error for path ${safePath ?? req.body?.filepath}: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/export/csv/:type - Export data as CSV
  router.get('/export/csv/:type', (req, res) => {
    try {
      const { type } = req.params;
      let csv;

      if (type === 'sessions') {
        csv = exportSessionsCsv(db);
      } else if (type === 'models') {
        csv = exportModelsCsv(db);
      } else if (type === 'projects') {
        csv = exportProjectsCsv(db);
      } else {
        return res.status(400).json({ error: 'Invalid export type. Use: sessions, models, projects' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_${csvTimestamp()}.csv"`);
      res.send(csv);
    } catch (err) {
      console.error(`[export] ${err.message}`);
      res.status(500).json({ error: 'Export failed' });
    }
  });

  // GET /api/pricing - Get all model pricing
  router.get('/pricing', (req, res) => {
    res.json(getAllPricing());
  });

  return { router, db };
}

function getDashboardData(db) {
  const hasTurnReportedCost = tableHasColumn(db, 'turns', 'reported_cost_usd');
  const hasTurnReportedTotalTokens = tableHasColumn(db, 'turns', 'reported_total_tokens');
  const hasSessionReportedCost = tableHasColumn(db, 'sessions', 'total_reported_cost_usd');
  const hasSessionReportedTotalTokens = tableHasColumn(db, 'sessions', 'total_reported_total_tokens');

  const models = db.prepare(`
    SELECT COALESCE(model, 'unknown') as model, provider_id
    FROM turns
    GROUP BY model, provider_id
    ORDER BY SUM(${hasTurnReportedTotalTokens ? 'COALESCE(reported_total_tokens, input_tokens + output_tokens)' : '(input_tokens + output_tokens)'}) DESC
  `).all();

  const allModels = models.map(r => r.model);

  const dailyRows = db.prepare(`
    SELECT
      substr(timestamp, 1, 10) as day,
      COALESCE(model, 'unknown') as model,
      provider_id,
      SUM(input_tokens) as input,
      SUM(output_tokens) as output,
      SUM(cache_read_tokens) as cache_read,
      SUM(cache_creation_tokens) as cache_creation,
      ${hasTurnReportedTotalTokens ? 'SUM(reported_total_tokens)' : '0'} as reported_total_tokens,
      ${hasTurnReportedCost ? 'SUM(reported_cost_usd)' : '0'} as reported_cost,
      SUM(reasoning_tokens) as reasoning,
      COUNT(*) as turns
    FROM turns
    GROUP BY day, model, provider_id
    ORDER BY day, model
  `).all();

  const dailyByModel = dailyRows.map(r => ({
    day: r.day,
    model: r.model,
    provider_id: r.provider_id,
    input: r.input || 0,
    output: r.output || 0,
    cache_read: r.cache_read || 0,
    cache_creation: r.cache_creation || 0,
    reported_total_tokens: r.reported_total_tokens ?? null,
    reported_cost: r.reported_cost ?? null,
    reasoning: r.reasoning || 0,
    turns: r.turns || 0,
  }));

  const sessionRows = db.prepare(`
    SELECT
      session_id, provider_id, project_name, first_timestamp, last_timestamp,
      total_input_tokens, total_output_tokens,
      total_cache_read, total_cache_creation, total_reasoning_tokens,
      ${hasSessionReportedTotalTokens ? 'total_reported_total_tokens' : '0'} as total_reported_total_tokens,
      ${hasSessionReportedCost ? 'total_reported_cost_usd' : '0'} as total_reported_cost_usd,
      model, turn_count
    FROM sessions
    ORDER BY last_timestamp DESC
  `).all();

  const sessionsAll = sessionRows.map(r => {
    let durationMin = 0;
    try {
      const t1 = new Date(r.first_timestamp);
      const t2 = new Date(r.last_timestamp);
      durationMin = Math.round((t2 - t1) / 60000 * 10) / 10;
    } catch { /* skip */ }

    return {
      session_id: (r.session_id || '').slice(0, 8),
      provider_id: r.provider_id,
      project: r.project_name || 'unknown',
      last: (r.last_timestamp || '').slice(0, 16).replace('T', ' '),
      last_date: (r.last_timestamp || '').slice(0, 10),
      duration_min: durationMin,
      model: r.model || 'unknown',
      turns: r.turn_count || 0,
      input: r.total_input_tokens || 0,
      output: r.total_output_tokens || 0,
      cache_read: r.total_cache_read || 0,
      cache_creation: r.total_cache_creation || 0,
      reported_total_tokens: r.total_reported_total_tokens ?? null,
      reported_cost: r.total_reported_cost_usd ?? null,
      reasoning: r.total_reasoning_tokens || 0,
    };
  });

  // Provider summary
  const providerRows = db.prepare(`
    SELECT
      provider_id,
      COUNT(DISTINCT session_id) as sessions,
      SUM(turn_count) as turns,
      SUM(total_input_tokens) as input,
      SUM(total_output_tokens) as output,
      ${hasSessionReportedTotalTokens ? 'SUM(total_reported_total_tokens)' : '0'} as reported_total_tokens,
      ${hasSessionReportedCost ? 'SUM(total_reported_cost_usd)' : '0'} as reported_cost
    FROM sessions
    GROUP BY provider_id
    ORDER BY COALESCE(reported_total_tokens, input + output) DESC
  `).all();

  return {
    all_models: allModels,
    daily_by_model: dailyByModel,
    sessions_all: sessionsAll,
    providers: providerRows,
    generated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
}

function exportSessionsCsv(db) {
  const hasSessionReportedCost = tableHasColumn(db, 'sessions', 'total_reported_cost_usd');
  const hasSessionReportedTotalTokens = tableHasColumn(db, 'sessions', 'total_reported_total_tokens');
  const rows = db.prepare(`
    SELECT session_id, provider_id, project_name, first_timestamp, last_timestamp,
           model, total_input_tokens, total_output_tokens,
           total_cache_read, total_cache_creation, total_reasoning_tokens,
           ${hasSessionReportedTotalTokens ? 'total_reported_total_tokens' : '0'} as total_reported_total_tokens,
           ${hasSessionReportedCost ? 'total_reported_cost_usd' : '0'} as total_reported_cost_usd,
           turn_count
    FROM sessions ORDER BY last_timestamp DESC
  `).all();

  const header = ['Session', 'Provider', 'Project', 'Last Active', 'Model', 'Turns', 'Input', 'Output', 'Total Tokens', 'Cache Read', 'Cache Creation', 'Reasoning', 'Est. Cost'];
  const lines = [header.join(',')];

  for (const r of rows) {
    const cost = getResolvedCost({
      model: r.model,
      input: r.total_input_tokens,
      output: r.total_output_tokens,
      cache_read: r.total_cache_read,
      cache_creation: r.total_cache_creation,
      reasoning: r.total_reasoning_tokens,
      reported_cost: r.total_reported_cost_usd,
    });
    lines.push([
      csvField(r.session_id?.slice(0, 8)), csvField(r.provider_id), csvField(r.project_name),
      csvField(r.last_timestamp?.slice(0, 16)), csvField(r.model), r.turn_count,
      r.total_input_tokens, r.total_output_tokens, r.total_reported_total_tokens || '',
      r.total_cache_read,
      r.total_cache_creation, r.total_reasoning_tokens, cost.toFixed(4),
    ].join(','));
  }

  return lines.join('\n');
}

function exportModelsCsv(db) {
  const hasTurnReportedCost = tableHasColumn(db, 'turns', 'reported_cost_usd');
  const hasTurnReportedTotalTokens = tableHasColumn(db, 'turns', 'reported_total_tokens');
  const rows = db.prepare(`
    SELECT
      COALESCE(model, 'unknown') as model, provider_id,
      SUM(input_tokens) as input, SUM(output_tokens) as output,
      SUM(cache_read_tokens) as cache_read, SUM(cache_creation_tokens) as cache_creation,
      SUM(reasoning_tokens) as reasoning,
      ${hasTurnReportedTotalTokens ? 'SUM(reported_total_tokens)' : '0'} as reported_total_tokens,
      ${hasTurnReportedCost ? 'SUM(reported_cost_usd)' : '0'} as reported_cost, COUNT(*) as turns,
      COUNT(DISTINCT session_id) as sessions
    FROM turns GROUP BY model, provider_id ORDER BY COALESCE(reported_total_tokens, input + output) DESC
  `).all();

  const header = ['Model', 'Provider', 'Sessions', 'Turns', 'Input', 'Output', 'Total Tokens', 'Cache Read', 'Cache Creation', 'Reasoning', 'Est. Cost'];
  const lines = [header.join(',')];

  for (const r of rows) {
    const cost = getResolvedCost({
      model: r.model,
      input: r.input,
      output: r.output,
      cache_read: r.cache_read,
      cache_creation: r.cache_creation,
      reasoning: r.reasoning,
      reported_cost: r.reported_cost,
    });
    lines.push([
      csvField(r.model), csvField(r.provider_id), r.sessions, r.turns,
      r.input, r.output, r.reported_total_tokens || '', r.cache_read, r.cache_creation, r.reasoning, cost.toFixed(4),
    ].join(','));
  }

  return lines.join('\n');
}

function exportProjectsCsv(db) {
  const hasTurnReportedCost = tableHasColumn(db, 'turns', 'reported_cost_usd');
  const hasTurnReportedTotalTokens = tableHasColumn(db, 'turns', 'reported_total_tokens');
  const rows = db.prepare(`
    SELECT
      COALESCE(s.project_name, 'unknown') as project,
      s.provider_id,
      COUNT(DISTINCT t.session_id) as sessions,
      COUNT(*) as turns,
      SUM(t.input_tokens) as input,
      SUM(t.output_tokens) as output,
      SUM(t.cache_read_tokens) as cache_read,
      SUM(t.cache_creation_tokens) as cache_creation,
      SUM(t.reasoning_tokens) as reasoning,
      ${hasTurnReportedTotalTokens ? 'SUM(t.reported_total_tokens)' : '0'} as reported_total_tokens,
      ${hasTurnReportedCost ? 'SUM(t.reported_cost_usd)' : '0'} as reported_cost,
      COALESCE(MIN(t.model), 'unknown') as model
    FROM turns t LEFT JOIN sessions s ON t.session_id = s.session_id
    GROUP BY s.project_name, s.provider_id
    ORDER BY COALESCE(reported_total_tokens, input + output) DESC
  `).all();

  const header = ['Project', 'Provider', 'Sessions', 'Turns', 'Input', 'Output', 'Total Tokens', 'Cache Read', 'Cache Creation', 'Reasoning', 'Est. Cost'];
  const lines = [header.join(',')];

  for (const r of rows) {
    const cost = getResolvedCost({
      model: r.model,
      input: r.input,
      output: r.output,
      cache_read: r.cache_read,
      cache_creation: r.cache_creation,
      reasoning: r.reasoning,
      reported_cost: r.reported_cost,
    });
    lines.push([
      csvField(r.project), csvField(r.provider_id), r.sessions, r.turns,
      r.input, r.output, r.reported_total_tokens || '', r.cache_read, r.cache_creation, r.reasoning, cost.toFixed(4),
    ].join(','));
  }

  return lines.join('\n');
}

function csvField(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvTimestamp() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + '_' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0');
}

const KNOWN_QUERY_TABLES = new Set(['turns', 'sessions', 'providers', 'processed_files']);

function tableHasColumn(db, tableName, columnName) {
  if (!KNOWN_QUERY_TABLES.has(tableName)) {
    throw new Error(`Unknown table: ${tableName}`);
  }
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some(column => column.name === columnName);
}
