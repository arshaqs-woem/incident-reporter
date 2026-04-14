const db = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const status = req.query.status; // optional filter: open, in_progress, resolved

  let queryText = `SELECT * FROM incidents WHERE assigned_to IS NOT NULL`;
  const params = [];

  if (status) {
    queryText += ` AND followup_status = $1`;
    params.push(status);
  }

  queryText += ` ORDER BY due_by ASC`;

  const result = await db.query(queryText, params);
  return res.json({ follow_ups: result.rows, total: result.rows.length });
};
