import * as anthropic from './anthropic.js';
import * as openai from './openai.js';
import * as google from './google.js';
import * as codex from './codex.js';
import * as kilo from './kilo.js';
import * as minimax from './minimax.js';
import * as groq from './groq.js';
import * as ollama from './ollama.js';
import * as codexbar from './codexbar.js';
import * as xiaomi from './xiaomi.js';

const PROVIDERS = {
  anthropic,
  openai,
  google,
  codex,
  kilo,
  minimax,
  groq,
  ollama,
  codexbar,
  xiaomi,
};

export function getRegisteredProviders() {
  return Object.entries(PROVIDERS).map(([id, provider]) => ({
    id,
    name: provider.getProviderName(),
  }));
}

export async function scanProvider(db, providerId, options = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return provider.scan(db, options);
}

export async function scanAll(db, options = {}) {
  const results = {};
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    try {
      results[id] = await provider.scan(db, options);
    } catch (err) {
      results[id] = { error: err.message, new: 0, updated: 0, skipped: 0, turns: 0, sessions: 0 };
    }
  }
  return results;
}
