# ModelMeter Dashboard

Multi-provider AI model usage and cost tracking. Tracks token usage across Anthropic, OpenAI, Google, Codex, Kilo, and more.

## Quick Start

```bash
npm install
npm start          # Run in foreground (Ctrl+C to stop)
```

Open http://localhost:5173

## Start / Stop

**Foreground (simple):**

```bash
npm start          # Start in foreground, Ctrl+C to stop
```

**Background (persistent):**

```bash
./modelmeter start     # Start in background
./modelmeter status    # Check if running
./modelmeter stop      # Stop server
./modelmeter restart   # Restart server
./modelmeter logs      Tail live logs
```

Or via npm:

```bash
npm run start:bg   # Start in background
npm run stop        # Stop server
npm run status      # Check status
npm run restart     # Restart server
npm run logs        # Tail logs
```

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start in foreground (Ctrl+C to stop) |
| `npm run start:bg` | Start in background |
| `npm run stop` | Stop background server |
| `npm run status` | Check if server is running |
| `npm run restart` | Restart background server |
| `npm run logs` | Tail live logs |
| `npm run build` | Production build |
| `npm test` | Run tests |

## Supported Providers

| Provider | Source | Auto-scan |
|----------|--------|-----------|
| Anthropic (Claude) | `~/.claude/projects/` JSONL files | Yes |
| OpenAI (GPT) | Local JSONL logs | Yes |
| Google (Gemini) | Local JSONL logs | Yes |
| Codex | `~/.codex/logs_2.sqlite` | Yes |
| Kilo | `~/.local/share/kilo/kilo.db` SQLite | Yes |
| CodexBar CLI | `codexbar --format json` fallback | Yes |
| Minimax | `~/.minimax/logs/` JSONL | Yes |
| Xiaomi (MIMO) | XLSX import / CodexBar fallback | Import only |
| Groq | JSONL import / CodexBar fallback | Import only |
| Ollama | JSONL import / CodexBar fallback | Import only |

### Kilo Details

The Kilo provider reads directly from `~/.local/share/kilo/kilo.db` and parses assistant messages for modelID, providerID, token counts, cache usage, reasoning tokens, and cost. It tracks both VS Code extension and CLI-core activity. Falls back to `codexbar --provider kilo` only if the local database is unavailable.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/data` | GET | Dashboard data |
| `/api/providers` | GET | List registered providers |
| `/api/scan` | POST | Scan all providers |
| `/api/scan/:id` | POST | Scan specific provider |
| `/api/import` | POST | Import JSONL/JSON/XLSX file |
| `/api/export/csv/:type` | GET | Export CSV (sessions, models, projects) |
| `/api/pricing` | GET | Model pricing table |

## Import External Data

Import usage from any provider via JSONL file:

```bash
curl -X POST http://localhost:3456/api/import \
  -H "Content-Type: application/json" \
  -d '{"filepath": "/path/to/usage.jsonl", "providerId": "openai"}'
```

JSONL format (one object per line):

```json
{"session_id": "abc123", "model": "gpt-4o", "timestamp": "2026-04-10T12:00:00Z", "usage": {"input_tokens": 1000, "output_tokens": 500}}
```

### Xiaomi MIMO XLSX Import

Export your usage from the Xiaomi MIMO console as XLSX, then import:

```bash
curl -X POST http://localhost:3456/api/import \
  -H "Content-Type: application/json" \
  -d '{"filepath": "/path/to/usage.xlsx", "providerId": "xiaomi"}'
```

## CodexBar Integration

CodexBar is an optional external CLI that pulls usage from multiple providers at once.

### macOS / Linux

```bash
brew install steipete/tap/codexbar
```

### Windows

Download from [Win-CodexBar Releases](https://github.com/Finesssee/Win-CodexBar/releases) and add `codexbar.exe` to your PATH, or install to `C:\Program Files\codexbar\`.

### Verify it works

```bash
codexbar cost --provider all --format json
```

Both macOS and Windows versions use the same CLI syntax (`--provider` / `-p` are interchangeable).

Once installed, the auto-scan will detect and use it automatically. Without CodexBar, each provider is read directly from local files.

## UI Features

- Glassmorphism dark theme with smooth animations
- Collapsible MODELS filter section (click to expand/collapse)
- Real-time auto-refresh every 30 seconds
- Manual rescan button for immediate updates
- Interactive charts: daily token usage (stacked bar), provider/model breakdowns (doughnut)
- Cost by model table with reported cost support
- Recent sessions table with CSV export
- Responsive layout adapts to screen size

## Project Structure

```
src/
  server.js           Express server entry
  db.js               SQLite database setup
  pricing.js          Token pricing tables
  routes.js           API routes
  providers/          Provider scanners
    anthropic.js      Claude Code JSONL reader
    openai.js         OpenAI log reader
    google.js         Gemini log reader
    codex.js          Codex SQLite reader
    kilo.js           Kilo SQLite reader (codexbar fallback)
    codexbar.js       CodexBar CLI integration
    minimax.js        Minimax provider
    groq.js           Groq provider (import only)
    ollama.js         Ollama provider (import only)
    xiaomi.js         Xiaomi MIMO provider (import only)
    generic.js        Generic JSONL import
    xlsx.js           XLSX import for Xiaomi
    db-helpers.js     Shared database operations
    index.js          Provider registry
  ui/                 React frontend
    main.jsx          Entry point
    App.jsx           Router
    index.css         TailwindCSS styles
    components/
      CollapsibleSection.jsx   Accessible collapsible container
    pages/Dashboard.jsx
    hooks/useData.js
    utils/pricing.js
tests/
  api.test.js         Backend tests
```

## Configuration

Data is stored at `~/.modelmeter/usage.db`.

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3456 | API server port |
| `HOST` | localhost | API server host |
| `SCAN_INTERVAL` | 300000 | Auto-scan interval in ms (default 5 min) |

## Testing

```bash
npm test
```

## License

MIT
