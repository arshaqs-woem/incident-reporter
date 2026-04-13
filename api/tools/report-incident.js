const db = require('../../lib/db');
const { sendSms } = require('../../lib/plivo');
const { buildHrMessage, buildManagerMessage } = require('../../lib/messages');

const ASSIGNED_TO = {
  maintenance:   'Facilities Team',
  safety:        'Safety Officer',
  interpersonal: 'HR',
  security:      'Security / IT'
};

const ESCALATION_REASON = {
  safety:        'Physical injury or hazard reported — requires immediate safety review',
  interpersonal: 'Workplace conflict or harassment — requires confidential HR review',
  security:      'Security breach or unauthorised access — requires urgent investigation'
};

module.exports = async function(req, res) {
  const recentCall = await db.query(
    `SELECT call_id FROM call_logs WHERE call_status = 'in_progress' OR call_end_time > NOW() - INTERVAL '5 minutes' ORDER BY created_at DESC LIMIT 1`
  );
  const callId = recentCall.rows[0]?.call_id || 'unknown';
  const { what, when_it_happened, where_it_happened, injured, witnesses, consent_manager, severity, incident_type, notify_manager } = req.body;

  const type = (incident_type || 'maintenance').toLowerCase();
  const severityLabel = (severity || 'unknown').toUpperCase();
  const inc = { what, when_it_happened, where_it_happened, injured, witnesses, incident_type };

  try {
    const incidentType = incident_type || 'maintenance';
    const { incidentId, isDuplicate } = await db.withTransaction(async (client) => {
      // Serialize concurrent tool calls for the same call/type pair.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`incident:${callId}:${incidentType}`]
      );

      const existing = await client.query(
        `SELECT id
           FROM incidents
          WHERE call_id = $1
            AND incident_type = $2
            AND created_at > NOW() - INTERVAL '3 minutes'
          ORDER BY id DESC
          LIMIT 1`,
        [callId, incidentType]
      );

      if (existing.rows[0]) {
        return { incidentId: existing.rows[0].id, isDuplicate: true };
      }

      const inserted = await client.query(
        `INSERT INTO incidents (call_id, what, when_it_happened, where_it_happened, injured, witnesses, consent_manager, severity, incident_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [callId, what, when_it_happened, where_it_happened, injured, witnesses || null, consent_manager, severity, incidentType]
      );

      return { incidentId: inserted.rows[0].id, isDuplicate: false };
    });

    if (isDuplicate) {
      console.log(`[TOOL] report_incident → duplicate suppressed, returning #${incidentId}`);
      return res.json({ incident_id: incidentId, status: 'already_logged' });
    }

    console.log(`[TOOL] report_incident → #${incidentId}`);

    const hrMsg = buildHrMessage(incidentId, severityLabel, type, inc, notify_manager);
    const mgrMsg = buildManagerMessage(incidentId, severityLabel, type, inc);

    // Run SMS, escalation, follow-up all in parallel — await everything before responding
    const tasks = [
      sendSms(process.env.HR_PHONE, hrMsg)
        .then(() => db.logNotification({ incidentId, callId, recipientType: 'hr', phoneNumber: process.env.HR_PHONE, message: hrMsg }))
        .catch(e => console.error('[SMS] HR failed:', e.message))
    ];

    if (notify_manager && mgrMsg) {
      tasks.push(
        sendSms(process.env.MANAGER_PHONE, mgrMsg)
          .then(() => db.logNotification({ incidentId, callId, recipientType: 'manager', phoneNumber: process.env.MANAGER_PHONE, message: mgrMsg }))
          .catch(e => console.error('[SMS] Manager failed:', e.message))
      );
    }

    if (severity === 'high' || severity === 'critical') {
      const escalatedTo = notify_manager ? 'HR + Manager' : 'HR';
      tasks.push(db.createEscalation({ incidentId, callId, severity, escalatedTo, reason: ESCALATION_REASON[type] || 'High severity incident' }).catch(() => {}));
    }

    if (!(type === 'maintenance' && severity === 'low')) {
      tasks.push(db.createFollowUp({ incidentId, callId, incidentType: type, severity, assignedTo: ASSIGNED_TO[type] || 'HR' }).catch(() => {}));
    }

    await Promise.all(tasks);

    return res.json({ incident_id: incidentId, status: 'logged' });

  } catch (err) {
    console.error('[TOOL] report_incident error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
