// Pricing per million tokens (USD).
// Sources verified 2026-04-10:
//   Anthropic: https://platform.claude.com/docs/en/docs/about-claude/pricing
//   OpenAI:    https://developers.openai.com/api/docs/pricing
//   Google:    https://ai.google.dev/gemini-api/docs/pricing

export const PRICING = {
  // Anthropic — current generation
  'claude-opus-4-6':      { input: 5.00,  output: 25.00, cacheWrite: 6.25,  cacheRead: 0.50  },
  'claude-opus-4-5':      { input: 5.00,  output: 25.00, cacheWrite: 6.25,  cacheRead: 0.50  },
  'claude-opus-4-1':      { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50  },
  'claude-opus-4-0':      { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50  },
  'claude-sonnet-4-6':    { input: 3.00,  output: 15.00, cacheWrite: 3.75,  cacheRead: 0.30  },
  'claude-sonnet-4-5':    { input: 3.00,  output: 15.00, cacheWrite: 3.75,  cacheRead: 0.30  },
  'claude-sonnet-4-0':    { input: 3.00,  output: 15.00, cacheWrite: 3.75,  cacheRead: 0.30  },
  'claude-haiku-4-5':     { input: 1.00,  output: 5.00,  cacheWrite: 1.25,  cacheRead: 0.10  },

  // Anthropic — legacy
  'claude-haiku-3-5':     { input: 0.80,  output: 4.00,  cacheWrite: 1.00,  cacheRead: 0.08  },
  'claude-3-opus':        { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50  },
  'claude-3-haiku':       { input: 0.25,  output: 1.25,  cacheWrite: 0.30,  cacheRead: 0.03  },

  // OpenAI — GPT-4 family
  'gpt-4o':               { input: 2.50,  output: 10.00, cacheWrite: 2.50,  cacheRead: 1.25  },
  'gpt-4o-mini':          { input: 0.15,  output: 0.60,  cacheWrite: 0.15,  cacheRead: 0.075 },
  'gpt-4.1-nano':         { input: 0.10,  output: 0.40,  cacheWrite: 0.10,  cacheRead: 0.025 },
  'gpt-4-turbo':          { input: 10.00, output: 30.00, cacheWrite: 10.00, cacheRead: 5.00  },
  'gpt-4':                { input: 30.00, output: 60.00, cacheWrite: 30.00, cacheRead: 15.00 },
  'gpt-3.5-turbo':        { input: 0.50,  output: 1.50,  cacheWrite: 0.50,  cacheRead: 0.25  },

  // OpenAI — o-series reasoning
  'o1':                   { input: 15.00, output: 60.00, cacheWrite: 15.00, cacheRead: 7.50  },
  'o1-mini':              { input: 0.55,  output: 2.20,  cacheWrite: 0.55,  cacheRead: 0.55  },
  'o1-pro':               { input: 150.00,output: 600.00,cacheWrite: 150.00,cacheRead: 75.00 },
  'o3':                   { input: 2.00,  output: 8.00,  cacheWrite: 2.00,  cacheRead: 0.50  },
  'o3-mini':              { input: 0.55,  output: 2.20,  cacheWrite: 0.55,  cacheRead: 0.55  },
  'o4-mini':              { input: 0.55,  output: 2.20,  cacheWrite: 0.55,  cacheRead: 0.55  },

  // OpenAI — GPT-5 family
  'gpt-5':                { input: 0.625, output: 5.00,  cacheWrite: 0.625, cacheRead: 0.125 },
  'gpt-5.1':              { input: 0.625, output: 5.00,  cacheWrite: 0.625, cacheRead: 0.125 },
  'gpt-5-mini':           { input: 0.25,  output: 2.00,  cacheWrite: 0.25,  cacheRead: 0.025 },
  'gpt-5.3':              { input: 1.75,  output: 14.00, cacheWrite: 1.75,  cacheRead: 0.175 },
  'gpt-5.4':              { input: 2.50,  output: 15.00, cacheWrite: 2.50,  cacheRead: 0.25  },
  'gpt-5.4-mini':         { input: 0.75,  output: 4.50,  cacheWrite: 0.75,  cacheRead: 0.075 },
  'gpt-5.4-nano':         { input: 0.20,  output: 1.25,  cacheWrite: 0.20,  cacheRead: 0.02  },
  'gpt-5.4-pro':          { input: 30.00, output: 180.00,cacheWrite: 30.00, cacheRead: 0.25  },

  // OpenAI — Codex / Codex-mini
  'gpt-5-codex':          { input: 0.625, output: 5.00,  cacheWrite: 0.625, cacheRead: 0.125 },
  'gpt-5.1-codex':        { input: 0.625, output: 5.00,  cacheWrite: 0.625, cacheRead: 0.125 },
  'gpt-5.2-codex':        { input: 1.75,  output: 14.00, cacheWrite: 1.75,  cacheRead: 0.175 },
  'gpt-5.3-codex':        { input: 1.75,  output: 14.00, cacheWrite: 1.75,  cacheRead: 0.175 },
  'codex-mini-latest':    { input: 0.25,  output: 2.00,  cacheWrite: 0.25,  cacheRead: 0.025 },

  // Google — Gemini 2.x
  'gemini-1.5-pro':       { input: 1.25,  output: 5.00,  cacheWrite: 1.25,  cacheRead: 0.3125 },
  'gemini-1.5-flash':     { input: 0.075, output: 0.30,  cacheWrite: 0.075, cacheRead: 0.01875 },
  'gemini-2.0-flash':     { input: 0.10,  output: 0.40,  cacheWrite: 0.10,  cacheRead: 0.025 },
  'gemini-2.5-pro':       { input: 1.25,  output: 10.00, cacheWrite: 1.25,  cacheRead: 0.3125 },
  'gemini-2.5-flash':     { input: 0.30,  output: 2.50,  cacheWrite: 0.30,  cacheRead: 0.075 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40,  cacheWrite: 0.10,  cacheRead: 0.025 },

  // Mistral
  'mistral-large':        { input: 2.00,  output: 6.00,  cacheWrite: 2.00,  cacheRead: 0.50  },
  'mistral-medium':       { input: 0.40,  output: 2.00,  cacheWrite: 0.40,  cacheRead: 0.10  },
  'mistral-small':        { input: 0.10,  output: 0.30,  cacheWrite: 0.10,  cacheRead: 0.025 },
  'codestral':            { input: 0.30,  output: 0.90,  cacheWrite: 0.30,  cacheRead: 0.075 },
  'mistral-nemo':         { input: 0.15,  output: 0.15,  cacheWrite: 0.15,  cacheRead: 0.04  },

  // Cohere
  'command-r-plus':       { input: 2.50,  output: 10.00, cacheWrite: 2.50,  cacheRead: 0.625 },
  'command-r':            { input: 0.15,  output: 0.60,  cacheWrite: 0.15,  cacheRead: 0.0375 },

  // DeepSeek
  'deepseek-v3':          { input: 0.27,  output: 1.10,  cacheWrite: 0.27,  cacheRead: 0.07  },
  'deepseek-r1':          { input: 0.55,  output: 2.19,  cacheWrite: 0.55,  cacheRead: 0.14  },

  // xAI
  'grok-2':               { input: 2.00,  output: 10.00, cacheWrite: 2.00,  cacheRead: 0.50  },
  'grok-3':               { input: 3.00,  output: 15.00, cacheWrite: 3.00,  cacheRead: 0.75  },
  'grok-3-mini':          { input: 0.30,  output: 0.50,  cacheWrite: 0.30,  cacheRead: 0.075 },

  // MiniMax
  'minimax-text-01':      { input: 0.15,  output: 0.50,  cacheWrite: 0.15,  cacheRead: 0.04  },
  'minimax-m1':           { input: 0.50,  output: 2.00,  cacheWrite: 0.50,  cacheRead: 0.125 },

  // Groq
  'llama-3.3-70b':        { input: 0.59,  output: 0.79,  cacheWrite: 0.59,  cacheRead: 0.15  },
  'llama-3.1-8b':         { input: 0.05,  output: 0.08,  cacheWrite: 0.05,  cacheRead: 0.013 },
  'mixtral-8x7b':         { input: 0.24,  output: 0.24,  cacheWrite: 0.24,  cacheRead: 0.06  },
  'groq-llama':           { input: 0.59,  output: 0.79,  cacheWrite: 0.59,  cacheRead: 0.15  },

  // Together AI
  'together-llama-3.3-70b': { input: 0.88, output: 0.88, cacheWrite: 0.88,  cacheRead: 0.22  },
  'together-mixtral-8x7b':  { input: 0.60, output: 0.60, cacheWrite: 0.60,  cacheRead: 0.15  },

  // Fireworks AI
  'fireworks-llama-3.3-70b': { input: 0.90, output: 0.90, cacheWrite: 0.90, cacheRead: 0.225 },
  'fireworks-mixtral-8x7b':  { input: 0.50, output: 0.50, cacheWrite: 0.50, cacheRead: 0.125 },

  // Perplexity
  'sonar-pro':            { input: 3.00,  output: 15.00, cacheWrite: 3.00,  cacheRead: 0.75  },
  'sonar':                { input: 1.00,  output: 1.00,  cacheWrite: 1.00,  cacheRead: 0.25  },

  // Xiaomi MIMO
  'mimo-v2-pro':          { input: 1.00,  output: 3.00,  cacheWrite: 1.00,  cacheRead: 0.25  },
  'mimo-v2-flash':        { input: 0.10,  output: 0.30,  cacheWrite: 0.10,  cacheRead: 0.025 },
  'mimo-v2-omni':         { input: 0.40,  output: 2.00,  cacheWrite: 0.40,  cacheRead: 0.10  },
  'mimo-v2.5':            { input: 0.40,  output: 2.00,  cacheWrite: 0.40,  cacheRead: 0.10  },
  'mimo-v2.5-pro':        { input: 1.00,  output: 3.00,  cacheWrite: 1.00,  cacheRead: 0.25  },

  // Ollama (local, free)
  'llama-3.1-local':      { input: 0,     output: 0,     cacheWrite: 0,     cacheRead: 0     },
  'llama-3.3-local':      { input: 0,     output: 0,     cacheWrite: 0,     cacheRead: 0     },
  'mistral-local':        { input: 0,     output: 0,     cacheWrite: 0,     cacheRead: 0     },
  'qwen-2.5-local':       { input: 0,     output: 0,     cacheWrite: 0,     cacheRead: 0     },
  'deepseek-local':       { input: 0,     output: 0,     cacheWrite: 0,     cacheRead: 0     },
};

export const PROVIDER_PATTERNS = {
  claude:        { keywords: ['claude'],                        provider: 'anthropic' },
  opus:          { keywords: ['opus'],                          provider: 'anthropic' },
  sonnet:        { keywords: ['sonnet'],                        provider: 'anthropic' },
  haiku:         { keywords: ['haiku'],                         provider: 'anthropic' },
  gpt:           { keywords: ['gpt'],                           provider: 'openai' },
  codex:         { keywords: ['codex'],                         provider: 'openai' },
  o1:            { keywords: ['o1-'],                           provider: 'openai' },
  o3:            { keywords: ['o3-'],                           provider: 'openai' },
  o4:            { keywords: ['o4-'],                           provider: 'openai' },
  gemini:        { keywords: ['gemini'],                        provider: 'google' },
  mistral:       { keywords: ['mistral', 'codestral', 'nemo'],  provider: 'mistral' },
  command:       { keywords: ['command-'],                      provider: 'cohere' },
  deepseek:      { keywords: ['deepseek'],                      provider: 'deepseek' },
  grok:          { keywords: ['grok'],                          provider: 'xai' },
  minimax:       { keywords: ['minimax'],                       provider: 'minimax' },
  groq:          { keywords: ['groq'],                          provider: 'groq' },
  together:      { keywords: ['together'],                      provider: 'together' },
  fireworks:     { keywords: ['fireworks'],                     provider: 'fireworks' },
  sonar:         { keywords: ['sonar'],                         provider: 'perplexity' },
  ollama:        { keywords: ['local'],                         provider: 'ollama' },
  xiaomi:        { keywords: ['mimo', 'xiaomi'],                provider: 'xiaomi' },
};

const MEGATOKEN = 1_000_000;
const CACHE_READ_FALLBACK_MULTIPLIER = 0.1;
const CACHE_WRITE_FALLBACK_MULTIPLIER = 1.25;

export function normalizeModelName(model) {
  if (!model) return null;
  let normalized = model.toLowerCase().trim();
  normalized = normalized.replace(/[-_]\d{8}$/, '');
  normalized = normalized.replace(/[-_]\d{6}$/, '');
  return normalized;
}

export function getPricing(model) {
  if (!model) return null;
  const normalized = normalizeModelName(model);

  if (PRICING[normalized]) return PRICING[normalized];

  for (const key of Object.keys(PRICING)) {
    if (normalized.startsWith(key)) return PRICING[key];
  }

  for (const [key, pattern] of Object.entries(PROVIDER_PATTERNS)) {
    for (const kw of pattern.keywords) {
      if (normalized.includes(kw)) {
        for (const [modelKey, price] of Object.entries(PRICING)) {
          if (modelKey.includes(key)) return price;
        }
      }
    }
  }

  return null;
}

export function getProviderFromModel(model) {
  if (!model) return 'unknown';
  const normalized = normalizeModelName(model);

  for (const [, pattern] of Object.entries(PROVIDER_PATTERNS)) {
    for (const kw of pattern.keywords) {
      if (normalized.includes(kw)) return pattern.provider;
    }
  }
  return 'unknown';
}

export function calcCost(model, input, output, cacheRead = 0, cacheCreation = 0, reasoning = 0) {
  const p = getPricing(model);
  if (!p) return 0;

  return (
    input         * p.input      / MEGATOKEN +
    output        * p.output     / MEGATOKEN +
    cacheRead     * (p.cacheRead  || p.input * CACHE_READ_FALLBACK_MULTIPLIER)  / MEGATOKEN +
    cacheCreation * (p.cacheWrite || p.input * CACHE_WRITE_FALLBACK_MULTIPLIER) / MEGATOKEN +
    reasoning     * p.output     / MEGATOKEN
  );
}

export function getAllPricing() {
  return { ...PRICING };
}

export function getResolvedCost({ model, input = 0, output = 0, cache_read = 0, cache_creation = 0, reasoning = 0, reported_cost = null }) {
  if (typeof reported_cost === 'number' && Number.isFinite(reported_cost) && reported_cost > 0) {
    return reported_cost;
  }
  return calcCost(model, input, output, cache_read, cache_creation, reasoning);
}
