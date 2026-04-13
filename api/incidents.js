const db = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const [incidents, count] = await Promise.all([
    db.query(
      `SELECT i.*, f.status AS follow_up_status, f.due_by, f.assigned_to,
              e.escalated_to, e.acknowledged
       FROM incidents i
       LEFT JOIN follow_ups f ON f.incident_id = i.id
       LEFT JOIN escalations e ON e.incident_id = i.id
       ORDER BY i.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    db.query(`SELECT COUNT(*) FROM incidents`)
  ]);

  return res.json({ incidents: incidents.rows, total: parseInt(count.rows[0].count) });
};
