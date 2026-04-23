export {
  PRICING,
  normalizeModelName,
  getPricing,
  getProviderFromModel,
  calcCost,
  getAllPricing,
  getResolvedCost,
} from '../../shared/pricing.js';

export function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function fmtCost(c) {
  return '$' + c.toFixed(4);
}

export function fmtCostBig(c) {
  return '$' + c.toFixed(2);
}

export function getProviderColor(providerId) {
  const colors = {
    anthropic:  { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.2)' },
    openai:     { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.2)' },
    google:     { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.2)' },
    codex:      { bg: 'rgba(20, 184, 166, 0.15)', text: '#2dd4bf', border: 'rgba(20, 184, 166, 0.2)' },
    kilo:       { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.2)' },
    minimax:    { bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c', border: 'rgba(249, 115, 22, 0.2)' },
    xiaomi:     { bg: 'rgba(234, 179, 8, 0.15)',  text: '#facc15', border: 'rgba(234, 179, 8, 0.2)' },
    groq:       { bg: 'rgba(239, 68, 68, 0.15)',  text: '#f87171', border: 'rgba(239, 68, 68, 0.2)' },
    ollama:     { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.2)' },
    import:     { bg: 'rgba(139, 92, 246, 0.15)', text: '#a78bfa', border: 'rgba(139, 92, 246, 0.2)' },
    unknown:    { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.2)' },
  };
  return colors[providerId] || colors.unknown;
}
