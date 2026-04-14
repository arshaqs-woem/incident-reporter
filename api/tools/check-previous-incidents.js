const db = require('../../lib/db');

module.exports = async function(req, res) {
  const start = Date.now();
  const { location, incident_type } = req.body;

  try {
    const recentCall = await db.query(
      `SELECT call_id FROM call_logs WHERE call_status = 'in_progress' ORDER BY call_start_time DESC LIMIT 1`
    );
    const callId = recentCall.rows[0]?.call_id || 'unknown';

    // Look up prior incidents at the same location or of the same type in last 30 days
    const params = [];
    let where = `created_at > NOW() - INTERVAL '30 days'`;

    if (location) {
      params.push(`%${location.toLowerCase()}%`);
      where += ` AND LOWER(where_it_happened) LIKE $${params.length}`;
    }
    if (incident_type) {
      params.push(incident_type.toLowerCase());
      where += ` AND incident_type = $${params.length}`;
    }

    const result = await db.query(
      `SELECT id, incident_type, severity, where_it_happened, created_at
         FROM incidents
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT 5`,
      params
    );

    const output = {
      count: result.rows.length,
      recent_incidents: result.rows.map(r => ({
        id: r.id,
        type: r.incident_type,
        severity: r.severity,
        location: r.where_it_happened,
        date: r.created_at
      })),
      repeated: result.rows.length > 0
    };

    db.saveToolCall({ callId, toolName: 'check_previous_incidents', inputParams: req.body, outputResult: output, executionTimeMs: Date.now() - start, success: true }).catch(() => {});

    console.log(`[TOOL] check_previous_incidents → ${result.rows.length} prior incidents found`);
    return res.json(output);

  } catch (err) {
    console.error('[TOOL] check_previous_incidents error:', err.message);
    return res.json({ count: 0, recent_incidents: [], repeated: false, error: err.message });
  }
};
