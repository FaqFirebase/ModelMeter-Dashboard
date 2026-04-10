import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDb, initDb, registerProvider } from '../src/db.js';
import { getPricing, calcCost, getProviderFromModel, getResolvedCost } from '../src/pricing.js';
import { parseProviderData } from '../src/providers/codexbar.js';
import { parseKiloUsage } from '../src/providers/kilo.js';

describe('Database', () => {
  let dbPath;
  let db;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-test-'));
    dbPath = join(dir, 'test.db');
    db = getDb(dbPath);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dbPath, { recursive: true, force: true });
  });

  it('creates all required tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const names = tables.map(t => t.name);
    assert.ok(names.includes('providers'));
    assert.ok(names.includes('sessions'));
    assert.ok(names.includes('turns'));
    assert.ok(names.includes('processed_files'));
  });

  it('adds reported cost columns', () => {
    const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all().map(column => column.name);
    const turnColumns = db.prepare("PRAGMA table_info(turns)").all().map(column => column.name);
    assert.ok(sessionColumns.includes('total_reported_cost_usd'));
    assert.ok(sessionColumns.includes('total_reported_total_tokens'));
    assert.ok(turnColumns.includes('reported_cost_usd'));
    assert.ok(turnColumns.includes('reported_total_tokens'));
  });

  it('is idempotent', () => {
    initDb(db);
    initDb(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    assert.ok(tables.length >= 4);
  });

  it('registers providers', () => {
    registerProvider(db, 'anthropic', 'Anthropic Claude');
    registerProvider(db, 'openai', 'OpenAI');

    const providers = db.prepare('SELECT * FROM providers ORDER BY id').all();
    assert.equal(providers.length, 2);
    assert.equal(providers[0].id, 'anthropic');
    assert.equal(providers[1].id, 'openai');
  });

  it('inserts and queries sessions', () => {
    registerProvider(db, 'anthropic', 'Anthropic');

    db.prepare(`
      INSERT INTO sessions (session_id, provider_id, project_name, model,
        total_input_tokens, total_output_tokens, turn_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('sess-1', 'anthropic', 'test-project', 'claude-sonnet-4-6', 1000, 500, 5);

    const session = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get('sess-1');
    assert.equal(session.total_input_tokens, 1000);
    assert.equal(session.model, 'claude-sonnet-4-6');
  });

  it('inserts and queries turns', () => {
    registerProvider(db, 'anthropic', 'Anthropic');

    db.prepare(`
      INSERT INTO sessions (session_id, provider_id) VALUES (?, ?)
    `).run('sess-1', 'anthropic');

    db.prepare(`
      INSERT INTO turns (session_id, provider_id, model, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?)
    `).run('sess-1', 'anthropic', 'claude-sonnet-4-6', 100, 50);

    const turns = db.prepare('SELECT * FROM turns WHERE session_id = ?').all('sess-1');
    assert.equal(turns.length, 1);
    assert.equal(turns[0].input_tokens, 100);
  });
});

describe('Pricing', () => {
  it('returns pricing for known models', () => {
    const p = getPricing('claude-opus-4-6');
    assert.ok(p);
    assert.equal(p.input, 5.00);
    assert.equal(p.output, 25.00);
  });

  it('returns pricing for OpenAI models', () => {
    const p = getPricing('gpt-4o');
    assert.ok(p);
    assert.equal(p.input, 2.50);
  });

  it('returns current pricing for Codex models', () => {
    const p = getPricing('gpt-5.4');
    assert.ok(p);
    assert.equal(p.input, 2.50);
    assert.equal(p.output, 15.00);
  });

  it('matches codex alias pricing', () => {
    const p = getPricing('gpt-5.2-codex');
    assert.ok(p);
    assert.equal(p.input, 1.75);
    assert.equal(p.output, 14.00);
  });

  it('returns pricing for Google models', () => {
    const p = getPricing('gemini-2.0-flash');
    assert.ok(p);
    assert.equal(p.input, 0.10);
  });

  it('returns null for unknown models', () => {
    assert.equal(getPricing('unknown-model'), null);
    assert.equal(getPricing(null), null);
    assert.equal(getPricing(''), null);
  });

  it('handles prefix matching', () => {
    const p = getPricing('claude-sonnet-4-6-20260401');
    assert.ok(p);
    assert.equal(p.input, 3.00);
  });

  it('handles substring matching', () => {
    const p = getPricing('custom-opus-variant');
    assert.ok(p);
    assert.equal(p.input, 5.00);
  });
});

describe('Cost Calculation', () => {
  it('calculates cost for known model', () => {
    const cost = calcCost('claude-sonnet-4-6', 1_000_000, 0, 0, 0);
    assert.ok(Math.abs(cost - 3.00) < 0.01);
  });

  it('calculates output cost', () => {
    const cost = calcCost('claude-sonnet-4-6', 0, 1_000_000, 0, 0);
    assert.ok(Math.abs(cost - 15.00) < 0.01);
  });

  it('returns zero for unknown model', () => {
    const cost = calcCost('unknown-model', 1_000_000, 500_000, 0, 0);
    assert.equal(cost, 0);
  });

  it('returns zero for zero tokens', () => {
    const cost = calcCost('claude-opus-4-6', 0, 0, 0, 0);
    assert.equal(cost, 0);
  });

  it('prefers reported cost when available', () => {
    const cost = getResolvedCost({
      model: 'gpt-5.4',
      input: 1_000_000,
      output: 1_000_000,
      reported_cost: 12.34,
    });
    assert.equal(cost, 12.34);
  });
});

describe('Provider Detection', () => {
  it('detects Anthropic', () => {
    assert.equal(getProviderFromModel('claude-sonnet-4-6'), 'anthropic');
    assert.equal(getProviderFromModel('claude-opus-4-6'), 'anthropic');
  });

  it('detects OpenAI', () => {
    assert.equal(getProviderFromModel('gpt-4o'), 'openai');
    assert.equal(getProviderFromModel('o1-mini'), 'openai');
  });

  it('detects Google', () => {
    assert.equal(getProviderFromModel('gemini-2.0-flash'), 'google');
  });

  it('returns unknown for unrecognized', () => {
    assert.equal(getProviderFromModel('my-custom-model'), 'unknown');
    assert.equal(getProviderFromModel(null), 'unknown');
  });
});

describe('Anthropic Scanner', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'llm-scan-'));
    const dbPath = join(tmpDir, 'test.db');
    db = getDb(dbPath);
    initDb(db);
    registerProvider(db, 'anthropic', 'Anthropic');
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scans JSONL files and populates database', async () => {
    const projectDir = join(tmpDir, 'projects', 'user', 'myproject');
    mkdirSync(projectDir, { recursive: true });

    const lines = [
      JSON.stringify({ type: 'user', sessionId: 'sess-1', timestamp: '2026-04-08T09:00:00Z', cwd: '/home/user/myproject' }),
      JSON.stringify({ type: 'assistant', sessionId: 'sess-1', timestamp: '2026-04-08T09:01:00Z', cwd: '/home/user/myproject', message: { model: 'claude-sonnet-4-6', id: 'msg-1', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 }, content: [] } }),
      JSON.stringify({ type: 'assistant', sessionId: 'sess-1', timestamp: '2026-04-08T09:02:00Z', cwd: '/home/user/myproject', message: { model: 'claude-sonnet-4-6', id: 'msg-2', usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 }, content: [] } }),
    ];

    writeFileSync(join(projectDir, 'sess-1.jsonl'), lines.join('\n'));

    const { scan } = await import('../src/providers/anthropic.js');
    const result = await scan(db, { dirs: [join(tmpDir, 'projects')], verbose: false });

    assert.equal(result.new, 1);
    assert.equal(result.turns, 2);
    assert.equal(result.sessions, 1);

    const session = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get('sess-1');
    assert.ok(session);
    assert.equal(session.total_input_tokens, 300);
    assert.equal(session.total_output_tokens, 150);
    assert.equal(session.model, 'claude-sonnet-4-6');
  });

  it('is incremental on re-scan', async () => {
    const projectDir = join(tmpDir, 'projects', 'user', 'proj');
    mkdirSync(projectDir, { recursive: true });

    const lines = [
      JSON.stringify({ type: 'assistant', sessionId: 's1', timestamp: '2026-04-08T10:00:00Z', cwd: '/tmp', message: { model: 'claude-sonnet-4-6', id: 'msg-1', usage: { input_tokens: 100, output_tokens: 50 }, content: [] } }),
    ];

    writeFileSync(join(projectDir, 's1.jsonl'), lines.join('\n'));

    const { scan } = await import('../src/providers/anthropic.js');
    const r1 = await scan(db, { dirs: [join(tmpDir, 'projects')], verbose: false });
    assert.equal(r1.new, 1);

    const r2 = await scan(db, { dirs: [join(tmpDir, 'projects')], verbose: false });
    assert.equal(r2.skipped, 1);
  });
});

describe('CodexBar Parser', () => {
  it('does not duplicate day totals across model breakdowns', () => {
    const providerMap = new Map();

    parseProviderData({
      provider: 'codex',
      daily: [{
        date: '2026-04-09',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 100,
        cacheCreationTokens: 50,
        totalTokens: 1650,
        totalCost: 1.75,
        modelBreakdowns: [
          { modelName: 'gpt-5.4', cost: 1.25, totalTokens: 900 },
          { modelName: 'gpt-5.4-mini', cost: 0.50, totalTokens: 750 },
        ],
      }],
    }, providerMap);

    const parsed = providerMap.get('codex');
    assert.ok(parsed);
    assert.equal(parsed.turns.length, 3);

    const totalsTurn = parsed.turns.find(turn => turn.model === 'mixed-models');
    assert.ok(totalsTurn);
    assert.equal(totalsTurn.input_tokens, 1000);
    assert.equal(totalsTurn.reported_cost_usd, null);

    const modelTurns = parsed.turns.filter(turn => turn.model !== 'mixed-models');
    assert.equal(modelTurns.length, 2);
    assert.equal(modelTurns[0].input_tokens, 0);
    assert.equal(modelTurns[1].output_tokens, 0);
    assert.deepEqual(modelTurns.map(turn => turn.reported_total_tokens).sort((a, b) => a - b), [750, 900]);
    assert.deepEqual(modelTurns.map(turn => turn.reported_cost_usd).sort((a, b) => a - b), [0.5, 1.25]);
  });
});

describe('Kilo Parser', () => {
  it('parses live kilo usage from codexbar output', () => {
    const { session, turn } = parseKiloUsage({
      provider: 'kilo',
      source: 'cli',
      usage: {
        loginMethod: 'Auto top-up: off',
        primary: {
          resetDescription: '0.04/2.50 credits',
          usedPercent: 1.5839599999999974,
        },
        updatedAt: '2026-04-10T13:16:21Z',
      },
    });

    assert.equal(session.session_id, 'kilo-live');
    assert.equal(session.model, 'kilo-cli');
    assert.match(session.project_name, /0\.04 \/ 2\.50 credits/);
    assert.match(session.project_name, /1\.58% used/);
    assert.equal(turn.tool_name, 'Auto top-up: off');
    assert.equal(turn.input_tokens, 0);
    assert.equal(turn.output_tokens, 0);
  });
});

describe('Generic Import', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'llm-import-'));
    const dbPath = join(tmpDir, 'test.db');
    db = getDb(dbPath);
    initDb(db);
    registerProvider(db, 'openai', 'OpenAI');
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports standard JSONL format', async () => {
    const filePath = join(tmpDir, 'usage.jsonl');
    const lines = [
      JSON.stringify({ session_id: 'sess-1', timestamp: '2026-04-08T10:00:00Z', model: 'gpt-4o', usage: { input_tokens: 100, output_tokens: 50 } }),
      JSON.stringify({ session_id: 'sess-1', timestamp: '2026-04-08T10:01:00Z', model: 'gpt-4o', usage: { input_tokens: 200, output_tokens: 100 } }),
    ];
    writeFileSync(filePath, lines.join('\n'));

    const { importFile } = await import('../src/providers/generic.js');
    const result = await importFile(db, filePath, 'openai', { verbose: false });

    assert.equal(result.turns, 2);
    assert.equal(result.sessions, 1);

    const session = db.prepare('SELECT * FROM sessions').get();
    assert.equal(session.total_input_tokens, 300);
    assert.equal(session.provider_id, 'openai');
  });

  it('handles multiple token field names', async () => {
    const filePath = join(tmpDir, 'alt-format.jsonl');
    const lines = [
      JSON.stringify({ session_id: 's1', model: 'gpt-4o', prompt_tokens: 100, completion_tokens: 50 }),
    ];
    writeFileSync(filePath, lines.join('\n'));

    const { importFile } = await import('../src/providers/generic.js');
    const result = await importFile(db, filePath, 'openai', { verbose: false });

    assert.equal(result.turns, 1);
  });

  it('skips records with zero tokens', async () => {
    const filePath = join(tmpDir, 'empty.jsonl');
    const lines = [
      JSON.stringify({ session_id: 's1', model: 'gpt-4o' }),
      JSON.stringify({ session_id: 's1', model: 'gpt-4o', usage: { input_tokens: 0, output_tokens: 0 } }),
    ];
    writeFileSync(filePath, lines.join('\n'));

    const { importFile } = await import('../src/providers/generic.js');
    const result = await importFile(db, filePath, 'openai', { verbose: false });

    assert.equal(result.turns, 0);
  });
});

describe('API Routes', () => {
  it('GET /api/data returns dashboard data', async () => {
    const { createRouter } = await import('../src/routes.js');
    const { router, db } = createRouter();

    try {
      const data = await invokeJsonRoute(router, '/data');

      assert.ok(data.all_models !== undefined);
      assert.ok(data.daily_by_model !== undefined);
      assert.ok(data.sessions_all !== undefined);
      assert.ok(data.providers !== undefined);
      assert.ok(data.generated_at !== undefined);
    } finally {
      db.close();
    }
  });

  it('GET /api/providers lists providers', async () => {
    const { createRouter } = await import('../src/routes.js');
    const { router, db } = createRouter();

    try {
      const data = await invokeJsonRoute(router, '/providers');

      assert.ok(data.registered.length >= 3);
      assert.ok(data.registered.some(p => p.id === 'anthropic'));
      assert.ok(data.registered.some(p => p.id === 'openai'));
      assert.ok(data.registered.some(p => p.id === 'google'));
    } finally {
      db.close();
    }
  });
});

function invokeJsonRoute(router, path, method = 'get') {
  const layer = router.stack.find(entry => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  return new Promise((resolve, reject) => {
    const req = { method: method.toUpperCase(), params: {}, query: {}, body: {} };
    const res = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      json(payload) {
        resolve(payload);
        return this;
      },
      send(payload) {
        resolve(payload);
        return this;
      },
    };

    try {
      layer.route.stack[0].handle(req, res, reject);
    } catch (error) {
      reject(error);
    }
  });
}
