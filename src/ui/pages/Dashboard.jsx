import { useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { useDashboardData, useFilters } from '../hooks/useData';
import CollapsibleSection from '../components/CollapsibleSection';
import { fmt, fmtCost, fmtCostBig, getProviderColor, getResolvedCost } from '../utils/pricing';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const RANGE_LABELS = { '1d': 'Last 24 Hours', '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last 90 Days', 'all': 'All Time' };
const CHART_COLORS = [
  'rgba(139, 92, 246, 0.8)',
  'rgba(6, 182, 212, 0.8)',
  'rgba(244, 63, 94, 0.8)',
  'rgba(16, 185, 129, 0.8)',
  'rgba(245, 158, 11, 0.8)',
  'rgba(59, 130, 246, 0.8)',
  'rgba(236, 72, 153, 0.8)',
  'rgba(168, 85, 247, 0.8)',
];
const TOKEN_COLORS = {
  input: 'rgba(139, 92, 246, 0.8)',
  output: 'rgba(6, 182, 212, 0.8)',
  cache_read: 'rgba(16, 185, 129, 0.6)',
  cache_creation: 'rgba(245, 158, 11, 0.6)',
  reasoning: 'rgba(244, 63, 94, 0.6)',
};

function GlassCard({ children, className = '', wide = false }) {
  return (
    <div className={`glass rounded-2xl p-6 animate-fade-in ${wide ? 'col-span-full' : ''} ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="glass rounded-xl p-5 animate-fade-in hover:bg-white/[0.08] transition-colors duration-200">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">{label}</div>
      <div className="text-2xl font-bold tracking-tight" style={color ? { color } : {}}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function ProviderBadge({ providerId }) {
  const colors = getProviderColor(providerId);
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      {providerId}
    </span>
  );
}

function FilterBar({ filters, data }) {
  const { selectedModels, selectedProviders, range, setRange, toggleModel, toggleProvider,
          selectAllModels, clearAllModels, selectAllProviders, clearAllProviders } = filters;

  if (!data) return null;

  return (
    <div className="glass-subtle border-b border-white/[0.06] px-6 py-3 flex items-center gap-4 flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">Providers</span>
      <div className="flex flex-wrap gap-1.5">
        {(data.providers || []).map(p => {
          const active = selectedProviders.has(p.provider_id);
          const colors = getProviderColor(p.provider_id);
          return (
            <button
              key={p.provider_id}
              onClick={() => toggleProvider(p.provider_id)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer capitalize"
              style={{
                background: active ? colors.bg : 'transparent',
                color: active ? colors.text : '#64748b',
                border: `1px solid ${active ? colors.border : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {p.provider_id}
            </button>
          );
        })}
        <button onClick={selectAllProviders} className="text-[10px] text-slate-500 hover:text-slate-300 px-2 transition-colors">All</button>
        <button onClick={clearAllProviders} className="text-[10px] text-slate-500 hover:text-slate-300 px-2 transition-colors">None</button>
      </div>

      <div className="w-px h-5 bg-white/10 shrink-0" />

      <CollapsibleSection
        title="Models"
        defaultOpen={false}
        className="flex flex-col gap-2"
        contentClass="flex flex-wrap gap-1.5 pt-2"
        badge={selectedModels.size > 0 ? <span className="text-violet-400 font-semibold ml-1">({selectedModels.size})</span> : null}
      >
        {data.all_models.map(m => {
          const active = selectedModels.has(m);
          return (
            <button
              key={m}
              onClick={() => toggleModel(m)}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all duration-150 cursor-pointer"
              style={{
                background: active ? 'rgba(139,92,246,0.12)' : 'transparent',
                color: active ? '#e2e8f0' : '#64748b',
                border: `1px solid ${active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {m}
            </button>
          );
        })}
        <button onClick={selectAllModels} className="text-[10px] text-slate-500 hover:text-slate-300 px-2 transition-colors">All</button>
        <button onClick={clearAllModels} className="text-[10px] text-slate-500 hover:text-slate-300 px-2 transition-colors">None</button>
      </CollapsibleSection>

      <div className="w-px h-5 bg-white/10 shrink-0" />

      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">Range</span>
      <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
        {['1d', '7d', '30d', '90d', 'all'].map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="px-3 py-1 text-xs transition-all duration-150 cursor-pointer"
            style={{
              background: range === r ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: range === r ? '#a78bfa' : '#64748b',
              borderRight: r !== 'all' ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}
          >
            {r === 'all' ? 'All' : r}
          </button>
        ))}
      </div>
    </div>
  );
}

function DailyChart({ daily, range }) {
  const dailyMap = {};
  for (const r of daily) {
    if (!dailyMap[r.day]) dailyMap[r.day] = { input: 0, output: 0, cache_read: 0, cache_creation: 0, reasoning: 0 };
    dailyMap[r.day].input += r.input;
    dailyMap[r.day].output += r.output;
    dailyMap[r.day].cache_read += r.cache_read;
    dailyMap[r.day].cache_creation += r.cache_creation;
    dailyMap[r.day].reasoning += r.reasoning;
  }
  const sorted = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b));

  const chartData = {
    labels: sorted.map(([d]) => d.slice(5)),
    datasets: [
      { label: 'Input', data: sorted.map(([, v]) => v.input), backgroundColor: TOKEN_COLORS.input, stack: 'tokens', borderRadius: 2 },
      { label: 'Output', data: sorted.map(([, v]) => v.output), backgroundColor: TOKEN_COLORS.output, stack: 'tokens', borderRadius: 2 },
      { label: 'Cache Read', data: sorted.map(([, v]) => v.cache_read), backgroundColor: TOKEN_COLORS.cache_read, stack: 'tokens', borderRadius: 2 },
      { label: 'Cache Write', data: sorted.map(([, v]) => v.cache_creation), backgroundColor: TOKEN_COLORS.cache_creation, stack: 'tokens', borderRadius: 2 },
      { label: 'Reasoning', data: sorted.map(([, v]) => v.reasoning), backgroundColor: TOKEN_COLORS.reasoning, stack: 'tokens', borderRadius: 2 },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 10, font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#64748b', maxTicksLimit: 15, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#64748b', callback: v => fmt(v), font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  };

  return (
    <GlassCard wide>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">
        Daily Token Usage — {RANGE_LABELS[range]}
      </h2>
      <div className="h-[280px]">
        <Bar data={chartData} options={options} />
      </div>
    </GlassCard>
  );
}

function ModelDonut({ filteredDaily }) {
  const modelMap = {};
  for (const r of filteredDaily) {
    if (!modelMap[r.model]) modelMap[r.model] = 0;
    modelMap[r.model] += r.reported_total_tokens || (r.input + r.output);
  }
  const sorted = Object.entries(modelMap).sort(([, a], [, b]) => b - a);

  const chartData = {
    labels: sorted.map(([m]) => m),
    datasets: [{
      data: sorted.map(([, v]) => v),
      backgroundColor: CHART_COLORS.slice(0, sorted.length),
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.06)',
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 }, padding: 12 } },
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} tokens` } },
    },
  };

  return (
    <GlassCard>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">By Model</h2>
      <div className="h-[220px]">
        {sorted.length > 0 ? <Doughnut data={chartData} options={options} /> : <EmptyState text="No data" />}
      </div>
    </GlassCard>
  );
}

function ProviderDonut({ filteredDaily }) {
  const providerMap = {};
  for (const r of filteredDaily) {
    if (!providerMap[r.provider_id]) providerMap[r.provider_id] = 0;
    providerMap[r.provider_id] += r.reported_total_tokens || (r.input + r.output);
  }
  const sorted = Object.entries(providerMap).sort(([, a], [, b]) => b - a);

  const chartData = {
    labels: sorted.map(([p]) => p),
    datasets: [{
      data: sorted.map(([, v]) => v),
      backgroundColor: sorted.map(([p]) => getProviderColor(p).text),
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.06)',
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 }, padding: 12, generateLabels: (chart) => {
        return chart.data.labels.map((label, i) => ({
          text: label,
          fillStyle: chart.data.datasets[0].backgroundColor[i],
          strokeStyle: chart.data.datasets[0].backgroundColor[i],
          index: i,
        }));
      }}},
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} tokens` } },
    },
  };

  return (
    <GlassCard>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">By Provider</h2>
      <div className="h-[220px]">
        {sorted.length > 0 ? <Doughnut data={chartData} options={options} /> : <EmptyState text="No data" />}
      </div>
    </GlassCard>
  );
}

function CostTable({ filteredDaily }) {
  const modelMap = {};
  for (const r of filteredDaily) {
    if (!modelMap[r.model]) modelMap[r.model] = { model: r.model, provider_id: r.provider_id, input: 0, output: 0, total_tokens: 0, cache_read: 0, cache_creation: 0, reasoning: 0, reported_cost: 0, turns: 0 };
    const m = modelMap[r.model];
    m.input += r.input; m.output += r.output; m.cache_read += r.cache_read;
    m.total_tokens += r.reported_total_tokens || (r.input + r.output);
    m.cache_creation += r.cache_creation; m.reasoning += r.reasoning; m.reported_cost += r.reported_cost || 0; m.turns += r.turns;
  }
  const sorted = Object.values(modelMap).sort((a, b) => b.total_tokens - a.total_tokens);

  return (
    <GlassCard wide>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Cost by Model</h2>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Model</th>
              <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Provider</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Turns</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Input</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Output</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Total</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Cache R</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Cache W</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Reasoning</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => {
              const cost = getResolvedCost(m);
              return (
                <tr key={m.model} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-3 text-xs text-slate-300 font-mono">{m.model}</td>
                  <td className="py-2.5 px-3"><ProviderBadge providerId={m.provider_id} /></td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(m.turns)}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(m.input)}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(m.output)}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(m.total_tokens)}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(m.cache_read)}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(m.cache_creation)}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(m.reasoning)}</td>
                  <td className="py-2.5 px-3 text-xs text-right font-mono" style={{ color: cost > 0 ? '#10b981' : '#64748b' }}>
                    {cost > 0 ? fmtCost(cost) : 'n/a'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function SessionsTable({ filteredSessions }) {
  const sorted = [...filteredSessions].sort((a, b) => (a.last || '').localeCompare(b.last || '')).slice(0, 25);

  return (
    <GlassCard wide>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Recent Sessions</h2>
        <a href="/api/export/csv/sessions" className="text-[10px] text-slate-500 hover:text-violet-400 transition-colors border border-white/[0.08] px-2.5 py-1 rounded-md">
          CSV
        </a>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Session</th>
              <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Provider</th>
              <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Project</th>
              <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Last Active</th>
              <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Duration</th>
              <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Model</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Turns</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Input</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Output</th>
              <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const cost = getResolvedCost(s);
              return (
                <tr key={`${s.session_id}-${i}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{s.session_id}...</td>
                  <td className="py-2.5 px-3"><ProviderBadge providerId={s.provider_id} /></td>
                  <td className="py-2.5 px-3 text-xs text-slate-300 truncate max-w-[200px]">{s.project}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-500">{s.last}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-500">{s.duration_min}m</td>
                  <td className="py-2.5 px-3">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-300 font-mono">{s.model}</span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{s.turns}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(s.input)}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 text-right font-mono">{fmt(s.output)}</td>
                  <td className="py-2.5 px-3 text-xs text-right font-mono" style={{ color: cost > 0 ? '#10b981' : '#64748b' }}>
                    {cost > 0 ? fmtCost(cost) : 'n/a'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex items-center justify-center h-full text-slate-600 text-sm">
      {text}
    </div>
  );
}

function Header({ data, rescan }) {
  return (
    <header className="glass-strong border-b border-white/[0.08] px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-bold gradient-text tracking-tight">ModelMeter Dashboard</h1>
        <p className="text-[11px] text-slate-500 mt-0.5">AI model usage & cost tracking</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[11px] text-slate-500">
          {data ? `Updated: ${data.generated_at} · Auto-refresh in 30s` : 'Loading...'}
        </span>
        <button
          onClick={rescan}
          className="glass px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-violet-400 hover:border-violet-500/20 transition-all duration-200 cursor-pointer"
        >
          Rescan
        </button>
      </div>
    </header>
  );
}

export default function Dashboard() {
  const { data, loading, error, rescan } = useDashboardData();
  const filters = useFilters(data);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="glass rounded-2xl p-8 text-center max-w-md">
          <div className="text-4xl mb-4">!</div>
          <p className="text-rose-400 text-sm mb-4">{error}</p>
          <p className="text-slate-500 text-xs">Make sure the backend server is running on port 3456</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filteredDaily = filters.filterDaily(data.daily_by_model);
  const filteredSessions = filters.filterSessions(data.sessions_all);

  const totals = filteredDaily.reduce((acc, r) => ({
    sessions: acc.sessions + 0,
    turns: acc.turns + r.turns,
    input: acc.input + r.input,
    output: acc.output + r.output,
    cache_read: acc.cache_read + r.cache_read,
    cache_creation: acc.cache_creation + r.cache_creation,
    reasoning: acc.reasoning + r.reasoning,
    cost: acc.cost + getResolvedCost(r),
  }), { sessions: 0, turns: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, reasoning: 0, cost: 0 });
  totals.sessions = filteredSessions.length;

  const rangeLabel = RANGE_LABELS[filters.range].toLowerCase();

  return (
    <div className="min-h-screen">
      <Header data={data} rescan={rescan} />
      <FilterBar filters={filters} data={data} />

      <div className="max-w-[1500px] mx-auto p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
          <StatCard label="Sessions" value={totals.sessions.toLocaleString()} sub={rangeLabel} />
          <StatCard label="Turns" value={fmt(totals.turns)} sub={rangeLabel} />
          <StatCard label="Input Tokens" value={fmt(totals.input)} sub={rangeLabel} />
          <StatCard label="Output Tokens" value={fmt(totals.output)} sub={rangeLabel} />
          <StatCard label="Cache Read" value={fmt(totals.cache_read)} sub="from cache" />
          <StatCard label="Cache Write" value={fmt(totals.cache_creation)} sub="to cache" />
          <StatCard label="Est. Cost" value={fmtCostBig(totals.cost)} sub="API pricing" color="#10b981" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <DailyChart daily={filteredDaily} range={filters.range} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 mb-4">
          <ModelDonut filteredDaily={filteredDaily} />
          <ProviderDonut filteredDaily={filteredDaily} />
        </div>

        <CostTable filteredDaily={filteredDaily} />
        <div className="h-4" />
        <SessionsTable filteredSessions={filteredSessions} />
      </div>
    </div>
  );
}
