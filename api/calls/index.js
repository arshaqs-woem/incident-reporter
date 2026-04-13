const db = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const limit  = parseInt(req.query.limit)  || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const result = await db.listCalls({ limit, offset });
    return res.json(result);
  } catch (err) {
    console.error('[API] list calls error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
