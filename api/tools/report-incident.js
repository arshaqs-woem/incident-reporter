const db = require('../../lib/db');
const { sendSms } = require('../../lib/plivo');
const { buildHrMessage, buildManagerMessage } = require('../../lib/messages');

module.exports = async function(req, res) {
  const start = Date.now();
  const recentCall = await db.query(
    `SELECT call_id FROM call_logs WHERE call_status = 'in_progress' ORDER BY call_start_time DESC LIMIT 1`
  );
  const callId = recentCall.rows[0]?.call_id || 'unknown';
  const { what, when_it_happened, where_it_happened, injured, witnesses, consent_manager, severity, incident_type, notify_manager, anonymous, reporter_name } = req.body;

  const type = (incident_type || 'maintenance').toLowerCase();
  const normalizedSeverity = (severity || 'medium').toLowerCase();
  const severityLabel = (severity || 'unknown').toUpperCase();
  const inc = { what, when_it_happened, where_it_happened, injured, witnesses, incident_type };

  try {
    const incidentType = incident_type || 'maintenance';
    const { incidentId, isDuplicate } = await db.withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id FROM incidents
          WHERE call_id = $1 AND incident_type = $2 AND created_at > NOW() - INTERVAL '3 minutes'
          ORDER BY id DESC LIMIT 1`,
        [callId, incidentType]
      );

      if (existing.rows[0]) {
        return { incidentId: existing.rows[0].id, isDuplicate: true };
      }

      const inserted = await client.query(
        `INSERT INTO incidents (call_id, what, when_it_happened, where_it_happened, injured, witnesses, consent_manager, severity, incident_type, anonymous, reporter_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [callId, what, when_it_happened, where_it_happened, injured, witnesses || null, consent_manager, normalizedSeverity, incidentType, anonymous !== false, reporter_name || null]
      );
      const incidentId = inserted.rows[0].id;

      // Follow-up — guaranteed inside transaction
      const DUE_BY = { critical: `NOW() + INTERVAL '2 hours'`, high: `NOW() + INTERVAL '24 hours'`, medium: `NOW() + INTERVAL '72 hours'`, low: `NOW() + INTERVAL '120 hours'` };
      const ASSIGNED_TO = { maintenance: 'Facilities Team', safety: 'Safety Officer', interpersonal: 'HR', security: 'Security / IT' };
      if (!(incidentType === 'maintenance' && normalizedSeverity === 'low')) {
        const dueExpr = DUE_BY[normalizedSeverity] || DUE_BY.medium;
        const assignedTo = ASSIGNED_TO[incidentType] || 'HR';
        await client.query(`UPDATE incidents SET assigned_to = $1, followup_status = 'open', due_by = ${dueExpr} WHERE id = $2`, [assignedTo, incidentId]);
      }

      // Escalation — guaranteed inside transaction
      if (normalizedSeverity === 'high' || normalizedSeverity === 'critical') {
        const escalatedTo = notify_manager ? 'HR + Manager' : 'HR';
        const REASON = { safety: 'Physical injury or hazard reported — requires immediate safety review', interpersonal: 'Workplace conflict or harassment — requires confidential HR review', security: 'Security breach or unauthorised access — requires urgent investigation' };
        const reason = REASON[incidentType] || 'High severity incident';
        await client.query(`UPDATE incidents SET escalated = true, escalated_to = $1, escalation_reason = $2 WHERE id = $3`, [escalatedTo, reason, incidentId]);
      }

      return { incidentId, isDuplicate: false };
    });

    if (isDuplicate) {
      console.log(`[TOOL] report_incident → duplicate suppressed, returning #${incidentId}`);
      return res.json({ incident_id: incidentId, status: 'already_logged' });
    }

    console.log(`[TOOL] report_incident → #${incidentId}`);

    const hrMsg = buildHrMessage(incidentId, severityLabel, type, inc, notify_manager);
    const mgrMsg = buildManagerMessage(incidentId, severityLabel, type, inc);

    const output = { incident_id: incidentId, status: 'logged' };

    // Respond to Ultravox immediately — keep tool execution fast to avoid timeout
    res.json(output);

    const tasks = [
      db.saveIntent({ callId, intent: `incident_report_${type}`, confidence: 1.0, entities: { severity: normalizedSeverity, type, injured_reported: injured !== 'none' && injured !== 'None' } }).catch(() => {}),
      db.saveToolCall({ callId, toolName: 'report_incident', inputParams: req.body, outputResult: output, executionTimeMs: Date.now() - start, success: true }).catch(() => {}),
      sendSms(process.env.HR_PHONE, hrMsg)
        .then(() => db.updateIncidentNotification({ incidentId, recipientType: 'hr' }))
        .catch(e => console.error('[SMS] HR failed:', e.message))
    ];

    if (notify_manager && mgrMsg) {
      tasks.push(
        sendSms(process.env.MANAGER_PHONE, mgrMsg)
          .then(() => db.updateIncidentNotification({ incidentId, recipientType: 'manager' }))
          .catch(e => console.error('[SMS] Manager failed:', e.message))
      );
    }
    Promise.all(tasks).catch(() => {});
    return;

  } catch (err) {
    console.error('[TOOL] report_incident error:', err.message);
    db.saveToolCall({ callId, toolName: 'report_incident', inputParams: req.body, outputResult: { error: err.message }, executionTimeMs: Date.now() - start, success: false }).catch(() => {});
    return res.json({ status: 'error', error: err.message });
  }
};
