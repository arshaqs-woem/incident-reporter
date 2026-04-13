const db = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const status = req.query.status; // optional filter: open, in_progress, resolved

  let queryText = `
    SELECT f.*, i.what, i.where_it_happened, i.severity AS incident_severity
    FROM follow_ups f
    JOIN incidents i ON i.id = f.incident_id
  `;
  const params = [];

  if (status) {
    queryText += ` WHERE f.status = $1`;
    params.push(status);
  }

  queryText += ` ORDER BY f.due_by ASC`;

  const result = await db.query(queryText, params);
  return res.json({ follow_ups: result.rows, total: result.rows.length });
};
