const PROVIDER_ID = 'groq';
const PROVIDER_NAME = 'Groq';

export function scan(db, options = {}) {
  const verbose = options.verbose !== false;
  if (verbose) console.log(`  [groq] Groq usage available via import`);
  return { new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
}

export function getProviderName() { return PROVIDER_NAME; }
