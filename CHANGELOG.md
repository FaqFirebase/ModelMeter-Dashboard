# Changelog

All notable changes to ModelMeter Dashboard are documented here.

---

## [Unreleased]

---

## [1.0.3] — 2026-04-10

### Fixed
- **Pricing: o3** — corrected from $10.00/$40.00 to $2.00/$8.00 per MTok (repriced ~5x cheaper by OpenAI)
- **Pricing: o3-mini** — corrected from $1.10/$4.40 to $0.55/$2.20 per MTok
- **Pricing: o4-mini** — corrected from $1.10/$4.40 to $0.55/$2.20 per MTok
- **Pricing: o1-mini** — corrected from $3.00/$12.00 to $0.55/$2.20 per MTok
- **Pricing: gpt-5 / gpt-5.1** — corrected from $1.25/$10.00 to $0.625/$5.00 per MTok
- **Pricing: gpt-5-codex / gpt-5.1-codex** — same correction as gpt-5 family
- **Pricing: codex-mini-latest** — corrected from $1.50/$6.00 to $0.25/$2.00 per MTok
- **Pricing: gemini-2.5-flash** — corrected from $0.15/$0.60 to $0.30/$2.50 per MTok; cache read $0.0375 → $0.075
- **Pricing: claude-haiku-4-6 removed** — this model does not exist; Haiku generation tops at 4.5

### Added
- **Pricing: claude-opus-4-1** — $15.00/$75.00 per MTok (legacy model)
- **Pricing: claude-opus-4-0** — $15.00/$75.00 per MTok (legacy model)
- **Pricing: claude-sonnet-4-0** — $3.00/$15.00 per MTok (legacy model)
- **Pricing: claude-haiku-3-5** — $0.80/$4.00 per MTok
- **Pricing: claude-3-opus** — $15.00/$75.00 per MTok (deprecated)
- **Pricing: claude-3-haiku** — $0.25/$1.25 per MTok (deprecated)
- **Pricing: gpt-5.3 / gpt-5.3-codex** — $1.75/$14.00 per MTok
- **Pricing: gpt-5.4-pro** — $30.00/$180.00 per MTok
- **Pricing: gpt-4.1-nano** — $0.10/$0.40 per MTok
- **Pricing: gemini-2.5-flash-lite** — $0.10/$0.40 per MTok

All prices verified against official provider pricing pages on 2026-04-10.

---

## [1.0.2] — 2026-04-10

### Fixed
- **Google provider: session totals double-counted on file update** — `recomputeSessionTotals` was never called after scanning Google log files; added it to match behavior of all other providers
- **Provider detection: Ollama llama models misidentified as Groq** — removed `'llama'` from Groq's keyword pattern; Groq-specific llama models already match by exact name in the pricing table, so no coverage was lost

---

## [1.0.1] — 2026-04-10

### Fixed
- **Security: CORS wildcard** — replaced `app.use(cors())` with an explicit allowlist of `localhost` and `127.0.0.1` origins; cross-origin requests from any other host are now rejected
- **Security: path traversal in `/api/import`** — added `resolveImportPath()` which resolves the user-supplied path to absolute, then rejects anything outside the user's home directory or with a disallowed file extension (`.jsonl`, `.json`, `.xlsx`, `.xls` only)
- **Security: SQL injection pattern in `tableHasColumn` / `ensureColumn`** — replaced raw string interpolation into `PRAGMA` and `ALTER TABLE` statements with `Set`-based allowlists for table names, column names, and column type definitions
- **Security: internal error details leaked to API clients** — server-side errors are now logged internally and a generic message is returned to the caller; stack traces and DB error messages no longer reach the response body
- **Windows compatibility: cross-platform path handling in `db.js`** — replaced `dbPath.substring(0, dbPath.lastIndexOf('/'))` with `dirname(dbPath)` from Node's `path` module so the data directory is resolved correctly on Windows

### Changed
- **README: added Windows usage section** — documents that `npm start` works natively on Windows and that `npm run` scripts work without Git Bash; notes that the `./modelmeter` bash script requires Git Bash or WSL
- **README: added dashboard screenshot**

---

## [1.0.0] — 2026-04-10

### Added
- Initial release
- Multi-provider token usage and cost tracking: Anthropic, OpenAI, Google, Codex, Kilo, MiniMax, Groq, Ollama, Xiaomi MIMO, CodexBar CLI
- Auto-scan from local files: `~/.claude/projects/` JSONL, `~/.codex/logs_2.sqlite`, `~/.local/share/kilo/kilo.db`, `~/.minimax/logs/`, `~/.openai/logs/`, `~/.google/gemini/logs/`
- XLSX import for Xiaomi MIMO
- Generic JSONL/JSON import for any provider
- CodexBar CLI integration as fallback and aggregate source
- REST API: `/api/data`, `/api/providers`, `/api/scan`, `/api/scan/:id`, `/api/import`, `/api/export/csv/:type`, `/api/pricing`
- CSV export for sessions, models, and projects
- React + Vite frontend with glassmorphism dark theme
- Interactive charts: daily token usage (stacked bar), provider/model breakdowns (doughnut)
- Cost by model table with reported-cost support
- Recent sessions table
- Auto-refresh every 30 seconds
- Background process support via `./modelmeter` script and npm run scripts
- SQLite database at `~/.modelmeter/usage.db`
- Prompt caching token tracking (cache read / cache creation)
- Reasoning token tracking
- Reported cost passthrough (uses provider-reported cost when available, falls back to calculated)
