# PROJECT.md — Reference

Read this file before making changes to the codebase.

## What This Is

ModelMeter Dashboard — multi-provider AI model usage and cost tracking. Reads usage data from local files/databases maintained by CLI tools (Claude Code, OpenAI Codex, Kilo, etc.) and presents it in a glassmorphism web UI.

**Stack:** Express + SQLite (backend), React 19 + TailwindCSS 4 + Chart.js (frontend), Vite (build).

## Key Files

```
src/
  server.js                  Express entry point. Auto-scans every 5 min. Handles SIGINT/SIGTERM.
  db.js                      SQLite schema (sessions, turns, daily_by_model, provider_status, pricing, processed_files).
  routes.js                  All /api/* endpoints.
  pricing.js                 Re-exports from src/shared/pricing.js.
  shared/pricing.js          PRICING table, normalizeModelName(), calcCost(), getResolvedCost().
  providers/
    index.js                 Provider registry. Calls scan(db, options) on each.
    db-helpers.js             aggregateSessions(), upsertSessions(), insertTurns(), recomputeSessionTotals().
    <provider>.js             One file per provider. Exports: scan(), getProviderName().
  ui/
    pages/Dashboard.jsx      Main page. FilterBar + charts + tables.
    components/CollapsibleSection.jsx  Reusable accessible collapsible container.
    hooks/useData.js          useDashboardData(), useFilters() hooks.
    utils/pricing.js          Frontend pricing helpers (duplicate of shared/pricing.js for browser).
```

## Provider Contract

Every provider file must export:

```js
export function scan(db, options = {}) { /* returns { new, updated, skipped, turns, sessions } */ }
export function getProviderName() { return 'Human Name'; }
```

Register new providers in `src/providers/index.js` — add import and add to PROVIDERS object.

## Adding a New Provider

1. Create `src/providers/<name>.js` with the three exports above.
2. Add import + entry in `src/providers/index.js` PROVIDERS object.
3. Add model pricing in `src/shared/pricing.js` PRICING table.
4. Add tests in `tests/api.test.js`.
5. Update README.md and this file.

## Database

SQLite at `~/.llm-usage/usage.db`. Key tables:

- **sessions** — one row per session. Columns: session_id, provider_id, project_name, first_timestamp, last_timestamp, model, total_input, total_output, total_cost.
- **turns** — one row per message/turn. Columns: session_id, provider_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens, reported_total_tokens, reported_cost_usd, tool_name, message_id.
- **daily_by_model** — pre-aggregated daily view. Used by frontend charts.
- **provider_status** — last scan time per provider.
- **processed_files** — tracks which files have been scanned (mtime-based incremental).

## Frontend Conventions

- Components are functional. No class components.
- Use TailwindCSS utility classes. Custom glassmorphism classes in index.css: `.glass`, `.glass-strong`, `.glass-subtle`.
- CSS theme variables in `@theme` block of index.css.
- `CollapsibleSection` is used for collapsible UI sections. Supports controlled/uncontrolled mode.
- Charts use react-chartjs-2 wrappers.
- `useFilters()` hook manages model/provider/range selection state.

## Running the Project

```bash
npm install
npm start                    # foreground, Ctrl+C to stop
./modelmeter start           # background, ./modelmeter stop to stop
./modelmeter status          # check if running
./modelmeter logs            # tail logs
```

Frontend: http://localhost:5173
API: http://localhost:3456

## Testing

```bash
npm test
```

Tests use Node's built-in test runner (`node --test`). Located in `tests/`. Use in-memory SQLite for isolation.

## Conventions

- ESM throughout (`"type": "module"` in package.json).
- No magic numbers. Define constants at top of file.
- Provider scan functions must be idempotent. Use `processed_files` table for incremental scanning.
- Error handling: providers catch their own errors and return zero-result objects. Never throw from scan().
- Naming: provider files lowercase, e.g. `anthropic.js`, `codexbar.js`, `xiaomi.js`.

## Common Tasks

**Add a model to pricing:** Edit `src/shared/pricing.js` PRICING object. Format: `'model-name': { input: 3.0, output: 15.0 }` (per million tokens).

**Add a new API endpoint:** Edit `src/routes.js`. Routes are mounted at `/api`.

**Change scan interval:** Set `SCAN_INTERVAL` env var (default 300000ms = 5 min).

**Change ports:** Set `PORT` (API, default 3456) or `VITE_PORT` (frontend, default 5173) env vars.

## Architecture Decisions

- Providers read from local files, never make API calls to fetch usage. This is a local-first tool.
- SQLite stores everything. No external database.
- Frontend auto-refreshes every 30s by polling `/api/data`.
- CodexBar is an optional fallback for providers that lack local log files.
