import { join } from 'path';
import { homedir } from 'os';
import { aggregateSessions, upsertSessions, insertTurns, recomputeSessionTotals } from './db-helpers.js';

const PROVIDER_ID = 'xiaomi';
const PROVIDER_NAME = 'Xiaomi MIMO';

const OPENAI_COMPATIBLE_URL = 'https://token-plan-sgp.xiaomimimo.com/v1';
const ANTHROPIC_COMPATIBLE_URL = 'https://token-plan-sgp.xiaomimimo.com/anthropic';

export function scan(db, options = {}) {
  const verbose = options.verbose !== false;

  if (verbose) {
    console.log(`  [xiaomi] Xiaomi MIMO usage tracking`);
    console.log(`  [xiaomi] Import from console export or via CodexBar`);
    console.log(`  [xiaomi] Console: https://platform.xiaomimimo.com/#/console/usage`);
    console.log(`  [xiaomi] API: POST /api/import with {"filepath": "path/to/export.jsonl", "providerId": "xiaomi"}`);
  }

  return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
}

export function getProviderName() { return PROVIDER_NAME; }
