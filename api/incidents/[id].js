const db = require('../../lib/db');

const ALLOWED_STATUSES = ['open', 'in_progress', 'resolved'];

module.exports = async (req, res) => {
  if (req.method !== 'PATCH') return res.status(405).end();

  const id = parseInt(req.query.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid incident id' });
  }

  const { followup_status } = req.body || {};
  if (!ALLOWED_STATUSES.includes(followup_status)) {
    return res.status(400).json({ error: `followup_status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
  }

  try {
    const result = await db.query(
      `UPDATE incidents SET followup_status = $1 WHERE id = $2 RETURNING *`,
      [followup_status, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Incident not found' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] update incident error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
