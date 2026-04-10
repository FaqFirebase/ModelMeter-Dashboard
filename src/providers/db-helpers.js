const DEFAULT_STATS = {
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_cache_read: 0,
  total_cache_creation: 0,
  total_reasoning_tokens: 0,
  total_reported_total_tokens: 0,
  total_reported_cost_usd: 0,
  turn_count: 0,
  model: null,
};

export function aggregateSessions(sessions, turns, providerId) {
  const statsMap = new Map();

  for (const t of turns) {
    if (!statsMap.has(t.session_id)) {
      statsMap.set(t.session_id, { ...DEFAULT_STATS });
    }
    const s = statsMap.get(t.session_id);
    s.total_input_tokens += t.input_tokens;
    s.total_output_tokens += t.output_tokens;
    s.total_cache_read += t.cache_read_tokens;
    s.total_cache_creation += t.cache_creation_tokens;
    s.total_reasoning_tokens += t.reasoning_tokens;
    s.total_reported_total_tokens += t.reported_total_tokens || 0;
    s.total_reported_cost_usd += t.reported_cost_usd || 0;
    s.turn_count += 1;
    if (t.model) s.model = t.model;
  }

  return sessions.map(meta => ({
    ...meta,
    provider_id: meta.provider_id || providerId,
    ...(statsMap.get(meta.session_id) || { ...DEFAULT_STATS }),
  }));
}

export function upsertSessions(db, sessions) {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO sessions
      (session_id, provider_id, project_name, first_timestamp, last_timestamp,
       model, total_input_tokens, total_output_tokens,
       total_cache_read, total_cache_creation, total_reasoning_tokens, total_reported_total_tokens, total_reported_cost_usd, turn_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE sessions SET
      last_timestamp = MAX(last_timestamp, ?),
      total_input_tokens = total_input_tokens + ?,
      total_output_tokens = total_output_tokens + ?,
      total_cache_read = total_cache_read + ?,
      total_cache_creation = total_cache_creation + ?,
      total_reasoning_tokens = total_reasoning_tokens + ?,
      total_reported_total_tokens = COALESCE(total_reported_total_tokens, 0) + ?,
      total_reported_cost_usd = COALESCE(total_reported_cost_usd, 0) + ?,
      turn_count = turn_count + ?,
      model = COALESCE(?, model)
    WHERE session_id = ?
  `);

  for (const s of sessions) {
    const existing = db.prepare(
      'SELECT session_id FROM sessions WHERE session_id = ?'
    ).get(s.session_id);

    if (!existing) {
      insertStmt.run(
        s.session_id, s.provider_id, s.project_name,
        s.first_timestamp, s.last_timestamp, s.model,
        s.total_input_tokens, s.total_output_tokens,
        s.total_cache_read, s.total_cache_creation,
        s.total_reasoning_tokens, s.total_reported_total_tokens, s.total_reported_cost_usd, s.turn_count
      );
    } else {
      updateStmt.run(
        s.last_timestamp,
        s.total_input_tokens, s.total_output_tokens,
        s.total_cache_read, s.total_cache_creation,
        s.total_reasoning_tokens, s.total_reported_total_tokens, s.total_reported_cost_usd, s.turn_count,
        s.model, s.session_id
      );
    }
  }
}

export function insertTurns(db, turns) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO turns
      (session_id, provider_id, timestamp, model, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, reasoning_tokens, reported_total_tokens, reported_cost_usd, tool_name, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((turnList) => {
    for (const t of turnList) {
      stmt.run(
        t.session_id, t.provider_id, t.timestamp, t.model,
        t.input_tokens, t.output_tokens,
        t.cache_read_tokens, t.cache_creation_tokens,
        t.reasoning_tokens, t.reported_total_tokens || null, t.reported_cost_usd || null, t.tool_name, t.message_id
      );
    }
  });

  insertMany(turns);
}

export function recomputeSessionTotals(db, providerId) {
  db.exec(`
    UPDATE sessions SET
      total_input_tokens = COALESCE((SELECT SUM(input_tokens) FROM turns WHERE turns.session_id = sessions.session_id AND turns.provider_id = '${providerId}'), 0),
      total_output_tokens = COALESCE((SELECT SUM(output_tokens) FROM turns WHERE turns.session_id = sessions.session_id AND turns.provider_id = '${providerId}'), 0),
      total_cache_read = COALESCE((SELECT SUM(cache_read_tokens) FROM turns WHERE turns.session_id = sessions.session_id AND turns.provider_id = '${providerId}'), 0),
      total_cache_creation = COALESCE((SELECT SUM(cache_creation_tokens) FROM turns WHERE turns.session_id = sessions.session_id AND turns.provider_id = '${providerId}'), 0),
      total_reasoning_tokens = COALESCE((SELECT SUM(reasoning_tokens) FROM turns WHERE turns.session_id = sessions.session_id AND turns.provider_id = '${providerId}'), 0),
      total_reported_total_tokens = COALESCE((SELECT SUM(reported_total_tokens) FROM turns WHERE turns.session_id = sessions.session_id AND turns.provider_id = '${providerId}'), 0),
      total_reported_cost_usd = COALESCE((SELECT SUM(reported_cost_usd) FROM turns WHERE turns.session_id = sessions.session_id AND turns.provider_id = '${providerId}'), 0),
      turn_count = COALESCE((SELECT COUNT(*) FROM turns WHERE turns.session_id = sessions.session_id AND turns.provider_id = '${providerId}'), 0)
    WHERE provider_id = '${providerId}'
  `);
}
