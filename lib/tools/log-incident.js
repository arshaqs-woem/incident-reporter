const db = require('../db');

// Active call context: callId keyed by Ultravox call ID
const callContext = {};

function setCallContext(uvCallId, plivoCallId) {
  callContext[uvCallId] = plivoCallId;
}

function getCallContext(uvCallId) {
  return callContext[uvCallId] || uvCallId;
}

async function logIncident(req, res) {
  const start = Date.now();
  const uvCallId = req.headers['x-ultravox-call-id'] || 'unknown';
  const callId = getCallContext(uvCallId) || uvCallId;

  const { what, when_it_happened, where_it_happened, injured, witnesses, consent_manager, severity, incident_type } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO incidents (call_id, what, when_it_happened, where_it_happened, injured, witnesses, consent_manager, severity, incident_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [callId, what, when_it_happened, where_it_happened, injured, witnesses || null, consent_manager, severity, incident_type || null]
    );

    const incidentId = result.rows[0].id;

    await db.saveIntent({ callId, intent: 'incident_report', confidence: 1.0, entities: { severity, injured: injured !== 'none' } });
    await db.saveToolCall({
      callId,
      toolName: 'log_incident',
      inputParams: req.body,
      outputResult: { incident_id: incidentId },
      executionTimeMs: Date.now() - start,
      success: true
    });

    console.log(`[TOOL] log_incident → incident #${incidentId} (call=${callId})`);
    return res.json({ incident_id: incidentId, status: 'logged' });
  } catch (err) {
    await db.saveToolCall({
      callId,
      toolName: 'log_incident',
      inputParams: req.body,
      outputResult: { error: err.message },
      executionTimeMs: Date.now() - start,
      success: false
    });
    console.error('[TOOL] log_incident error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { logIncident, setCallContext, getCallContext };
