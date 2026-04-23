import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';
const AUTO_REFRESH_INTERVAL_MS = 30000;

export function useDashboardData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/data`);
      const json = await resp.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const rescan = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/scan`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  }, [fetchData]);

  return { data, loading, error, rescan, refetch: fetchData };
}

export function useFilters(data) {
  const [selectedModels, setSelectedModels] = useState(new Set());
  const [selectedProviders, setSelectedProviders] = useState(new Set());
  const [range, setRange] = useState('30d');

  useEffect(() => {
    if (data?.all_models && selectedModels.size === 0) {
      setSelectedModels(new Set(data.all_models));
    }
    if (data?.providers && selectedProviders.size === 0) {
      setSelectedProviders(new Set(data.providers.map(p => p.provider_id)));
    }
  }, [data]);

  const toggleModel = useCallback((model) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }, []);

  const toggleProvider = useCallback((providerId) => {
    setSelectedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }, []);

  const selectAllModels = useCallback(() => {
    if (data?.all_models) setSelectedModels(new Set(data.all_models));
  }, [data]);

  const clearAllModels = useCallback(() => setSelectedModels(new Set()), []);

  const selectAllProviders = useCallback(() => {
    if (data?.providers) setSelectedProviders(new Set(data.providers.map(p => p.provider_id)));
  }, [data]);

  const clearAllProviders = useCallback(() => setSelectedProviders(new Set()), []);

  const getRangeCutoff = useCallback(() => {
    if (range === 'all') return null;
    const days = range === '1d' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [range]);

  const filterDaily = useCallback((daily) => {
    const cutoff = getRangeCutoff();
    return daily.filter(r =>
      selectedModels.has(r.model) &&
      selectedProviders.has(r.provider_id) &&
      (!cutoff || r.day >= cutoff)
    );
  }, [selectedModels, selectedProviders, getRangeCutoff]);

  const filterSessions = useCallback((sessions) => {
    const cutoff = getRangeCutoff();
    return sessions.filter(s =>
      selectedModels.has(s.model) &&
      selectedProviders.has(s.provider_id) &&
      (!cutoff || s.last_date >= cutoff)
    );
  }, [selectedModels, selectedProviders, getRangeCutoff]);

  return {
    selectedModels, selectedProviders, range,
    setRange, toggleModel, toggleProvider,
    selectAllModels, clearAllModels,
    selectAllProviders, clearAllProviders,
    filterDaily, filterSessions,
  };
}
