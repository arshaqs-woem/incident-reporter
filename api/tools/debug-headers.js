const db = require('../../lib/db');

module.exports = async (req, res) => {
  const headers = JSON.stringify(req.headers);
  console.log('[DEBUG HEADERS]', headers);
  // Store headers in DB so we can inspect them
  await db.query(
    `INSERT INTO incidents (call_id, what, when_it_happened, where_it_happened, injured, consent_manager, severity, incident_type)
     VALUES ('debug', $1, 'debug', 'debug', 'debug', false, 'low', 'maintenance')`,
    [headers]
  );
  return res.json({ ok: true, headers: req.headers });
};
