const db = require('../db');
const { sendSms } = require('../plivo');

function buildHrMessage(id, severity, type, inc, notifyManager) {
  // Trivial maintenance — just a one-liner, no details needed
  if (type === 'maintenance' && severity === 'LOW') {
    return `[InspireWorks] Maintenance needed #${id}: ${inc.what} at ${inc.where_it_happened}. Please action.`;
  }

  // Safety incidents — full detail, injury front and centre
  if (type === 'safety') {
    let msg = `[InspireWorks] SAFETY INCIDENT #${id} (${severity})\nWhat: ${inc.what}\nWhere: ${inc.where_it_happened}`;
    if (inc.when_it_happened) msg += `\nWhen: ${inc.when_it_happened}`;
    if (inc.injured && inc.injured.toLowerCase() !== 'none') msg += `\nInjured: ${inc.injured}`;
    if (inc.witnesses) msg += `\nWitnesses: ${inc.witnesses}`;
    msg += `\nManager notified: ${notifyManager ? 'Yes' : 'No'}`;
    return msg;
  }

  // Interpersonal — sensitive, include involved parties and consent
  if (type === 'interpersonal') {
    let msg = `[InspireWorks] INTERPERSONAL REPORT #${id} (${severity})\nDetails: ${inc.what}\nLocation: ${inc.where_it_happened}`;
    if (inc.when_it_happened) msg += `\nWhen: ${inc.when_it_happened}`;
    if (inc.witnesses) msg += `\nInvolved/Witnesses: ${inc.witnesses}`;
    msg += `\nManager notified: ${notifyManager ? 'Yes' : 'No'}`;
    msg += `\nHandle with confidentiality.`;
    return msg;
  }

  // Security — urgency, what was affected
  if (type === 'security') {
    let msg = `[InspireWorks] SECURITY INCIDENT #${id} (${severity})\nWhat: ${inc.what}\nWhere: ${inc.where_it_happened}`;
    if (inc.when_it_happened) msg += `\nDetected: ${inc.when_it_happened}`;
    msg += `\nManager notified: ${notifyManager ? 'Yes' : 'No'}`;
    msg += `\nReview immediately.`;
    return msg;
  }

  // Default maintenance (medium+)
  let msg = `[InspireWorks] Maintenance Issue #${id} (${severity})\nWhat: ${inc.what}\nWhere: ${inc.where_it_happened}`;
  if (inc.when_it_happened) msg += `\nWhen: ${inc.when_it_happened}`;
  return msg;
}

function buildManagerMessage(id, severity, type, inc) {
  if (type === 'maintenance' && severity === 'LOW') return null; // manager not notified for trivial

  if (type === 'safety') {
    let msg = `[InspireWorks] Action required — Safety Incident #${id} (${severity})\n${inc.what} at ${inc.where_it_happened}`;
    if (inc.injured && inc.injured.toLowerCase() !== 'none') msg += `\nInjury reported: ${inc.injured}`;
    return msg;
  }

  if (type === 'interpersonal') {
    return `[InspireWorks] Interpersonal matter #${id} reported in your team. Please contact HR before taking any action. Details shared with HR.`;
  }

  if (type === 'security') {
    return `[InspireWorks] Security incident #${id} (${severity}) — ${inc.what} at ${inc.where_it_happened}. Coordinate with HR immediately.`;
  }

  return `[InspireWorks] Incident #${id} (${severity}) needs attention: ${inc.what} at ${inc.where_it_happened}.`;
}

async function sendNotification(req, res) {
  const start = Date.now();
  const uvCallId = req.headers['x-ultravox-call-id'] || 'unknown';
  const callId = uvCallId;

  const { incident_id, notify_manager, severity } = req.body;

  const notified = [];

  try {
    // Fetch incident details
    const incident = await db.query(`SELECT * FROM incidents WHERE id = $1`, [incident_id]);
    if (!incident.rows[0]) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    const inc = incident.rows[0];

    const severityLabel = (severity || 'unknown').toUpperCase();
    const type = (inc.incident_type || 'maintenance').toLowerCase();

    const hrMsg = buildHrMessage(incident_id, severityLabel, type, inc, notify_manager);
    const mgrMsg = buildManagerMessage(incident_id, severityLabel, type, inc);

    // Fire SMS without awaiting — don't block the tool response
    notified.push('HR');
    sendSms(process.env.HR_PHONE, hrMsg)
      .then(() => console.log(`[TOOL] send_notification → HR notified (incident #${incident_id})`))
      .catch(e => console.error('[SMS] HR failed:', e.message));

    if (notify_manager) {
      notified.push('Manager');
      sendSms(process.env.MANAGER_PHONE, mgrMsg)
        .then(() => console.log(`[TOOL] send_notification → Manager notified (incident #${incident_id})`))
        .catch(e => console.error('[SMS] Manager failed:', e.message));
    }

    db.saveToolCall({
      callId,
      toolName: 'send_notification',
      inputParams: req.body,
      outputResult: { notified },
      executionTimeMs: Date.now() - start,
      success: true
    }).catch(() => {});

    return res.json({ notified, status: 'sent' });
  } catch (err) {
    await db.saveToolCall({
      callId,
      toolName: 'send_notification',
      inputParams: req.body,
      outputResult: { error: err.message },
      executionTimeMs: Date.now() - start,
      success: false
    });
    console.error('[TOOL] send_notification error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { sendNotification, buildHrMessage, buildManagerMessage };
