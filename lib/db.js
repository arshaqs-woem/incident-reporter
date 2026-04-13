const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  return res;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Call Logs ──────────────────────────────────────────────────────────────

async function createCallLog({ callId, callerNumber, calledNumber, uvCallId }) {
  await query(
    `INSERT INTO call_logs (call_id, caller_number, called_number, call_status, uv_call_id)
     VALUES ($1, $2, $3, 'in_progress', $4)
     ON CONFLICT (call_id) DO NOTHING`,
    [callId, callerNumber, calledNumber, uvCallId || null]
  );
}

async function getCallIdByUvCallId(uvCallId) {
  const res = await query(`SELECT call_id FROM call_logs WHERE uv_call_id = $1`, [uvCallId]);
  return res.rows[0]?.call_id || null;
}

async function endCallLog({ callId, durationSeconds, status = 'completed' }) {
  await query(
    `INSERT INTO call_logs (call_id, call_end_time, call_duration_seconds, call_status)
     VALUES ($1, NOW(), $2, $3)
     ON CONFLICT (call_id) DO UPDATE
     SET call_end_time = NOW(),
         call_duration_seconds = $2,
         call_status = $3`,
    [callId, durationSeconds, status]
  );
}

async function getCallLog(callId) {
  const res = await query(`SELECT * FROM call_logs WHERE call_id = $1`, [callId]);
  return res.rows[0];
}

async function listCalls({ limit = 20, offset = 0 }) {
  const res = await query(
    `SELECT * FROM call_logs ORDER BY call_start_time DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const count = await query(`SELECT COUNT(*) FROM call_logs`);
  return { calls: res.rows, total: parseInt(count.rows[0].count) };
}

// ── Analytics ─────────────────────────────────────────────────────────────

async function getAnalytics() {
  const [total, avg, statuses, topTypes] = await Promise.all([
    query(`SELECT COUNT(*) FROM call_logs`),
    query(`SELECT AVG(call_duration_seconds) FROM call_logs WHERE call_duration_seconds IS NOT NULL`),
    query(`SELECT call_status, COUNT(*) FROM call_logs GROUP BY call_status`),
    query(`SELECT incident_type, COUNT(*) FROM incidents GROUP BY incident_type ORDER BY count DESC`)
  ]);
  return {
    totalCalls: parseInt(total.rows[0].count),
    avgDurationSeconds: parseFloat(avg.rows[0].avg) || 0,
    callsByStatus: statuses.rows,
    topIncidentTypes: topTypes.rows
  };
}

// ── Notifications ──────────────────────────────────────────────────────────

async function logNotification({ incidentId, callId, recipientType, phoneNumber, message }) {
  await query(
    `INSERT INTO notifications (incident_id, call_id, recipient_type, phone_number, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [incidentId, callId, recipientType, phoneNumber, message]
  );
}

// ── Escalations ────────────────────────────────────────────────────────────

async function createEscalation({ incidentId, callId, severity, escalatedTo, reason }) {
  await query(
    `INSERT INTO escalations (incident_id, call_id, severity, escalated_to, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [incidentId, callId, severity, escalatedTo, reason]
  );
}

// ── Follow-ups ─────────────────────────────────────────────────────────────

const DUE_BY = {
  critical: `NOW() + INTERVAL '2 hours'`,
  high:     `NOW() + INTERVAL '24 hours'`,
  medium:   `NOW() + INTERVAL '72 hours'`,
  low:      `NOW() + INTERVAL '120 hours'`
};

async function createFollowUp({ incidentId, callId, incidentType, severity, assignedTo }) {
  const dueExpr = DUE_BY[severity] || DUE_BY.medium;
  await query(
    `INSERT INTO follow_ups (incident_id, call_id, incident_type, severity, assigned_to, due_by)
     VALUES ($1, $2, $3, $4, $5, ${dueExpr})`,
    [incidentId, callId, incidentType, severity, assignedTo]
  );
}

module.exports = {
  query, withTransaction,
  createCallLog, endCallLog, getCallLog, listCalls, getCallIdByUvCallId,
  getAnalytics,
  logNotification,
  createEscalation,
  createFollowUp
};
