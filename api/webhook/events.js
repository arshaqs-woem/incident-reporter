const axios = require('axios');
const db = require('../../lib/db');

async function fetchAndStoreTranscript(callId, uvCallId) {
  if (!uvCallId || uvCallId === 'unknown') return;
  const keys = [process.env.ULTRAVOX_API_KEY, process.env.ULTRAVOX_API_KEY_BACKUP].filter(Boolean).map(k => k.trim());
  let messages = null;
  for (const apiKey of keys) {
    try {
      const res = await axios.get(
        `https://api.ultravox.ai/api/calls/${uvCallId}/messages`,
        { headers: { 'X-API-Key': apiKey } }
      );
      messages = res.data?.results || res.data || [];
      break;
    } catch (e) {
      if (e.response?.status === 404 || e.response?.status === 401) continue;
      console.error('[TRANSCRIPT] fetch failed:', e.message);
      return;
    }
  }
  if (!messages) { console.error('[TRANSCRIPT] not found on any key'); return; }
  for (const msg of messages) {
    const speaker = msg.role === 'MESSAGE_ROLE_AGENT' || msg.role === 'agent' ? 'agent' : 'user';
    const text = msg.text || msg.content || '';
    if (text) await db.saveTranscript({ callId, speaker, message: text });
  }
  console.log(`[TRANSCRIPT] ${callId} — ${messages.length} messages stored`);
}

async function generateAndStoreSummary(callId) {
  try {
    const incidentRes = await db.query(
      `SELECT * FROM incidents WHERE call_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [callId]
    );
    const inc = incidentRes.rows[0];
    if (!inc) {
      await db.saveCallSummary({ callId, summary: 'Call ended without an incident being reported.', primaryIntent: 'no_incident', resolutionStatus: 'no_action', followUpRequired: false });
      return;
    }
    const followUpRequired = !!inc.assigned_to;
    const summary = `${inc.incident_type.charAt(0).toUpperCase() + inc.incident_type.slice(1)} incident (${inc.severity}) reported at ${inc.where_it_happened}. ${inc.what}${inc.injured && inc.injured.toLowerCase() !== 'none' ? ` Injury: ${inc.injured}.` : ''}`;
    await db.saveCallSummary({ callId, summary, primaryIntent: `incident_report_${inc.incident_type}`, resolutionStatus: 'logged', followUpRequired });
    console.log(`[SUMMARY] ${callId} — summary stored`);
  } catch (e) {
    console.error('[SUMMARY] failed:', e.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;
  const callId = event?.CallUUID || event?.call_id || event?.callId || 'unknown';

  try {
    const type = event?.Event || event?.type || event?.event_type || '';

    if (type === 'Hangup' || type === 'call_ended' || type === 'hangup') {
      const duration = parseInt(event?.Duration || event?.duration_seconds || event?.duration || 0);

      // Check if an incident was logged for this call to determine status
      const incidentCheck = await db.query(`SELECT id FROM incidents WHERE call_id = $1 LIMIT 1`, [callId]);
      const status = incidentCheck.rows.length > 0 ? 'completed' : 'abandoned';

      await db.endCallLog({ callId, durationSeconds: duration, status });
      console.log(`[CALL END] ${callId} — ${duration}s — ${status}`);

      // Fetch UV call ID to pull transcript from Ultravox API
      const callLog = await db.getCallLog(callId);
      const uvCallId = callLog?.uv_call_id;

      // Await both before responding — caller is gone so no UX cost, and Vercel
      // kills fire-and-forget tasks the moment res.json() is called
      await Promise.all([
        fetchAndStoreTranscript(callId, uvCallId),
        generateAndStoreSummary(callId)
      ]).catch(() => {});
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[WEBHOOK] events error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
