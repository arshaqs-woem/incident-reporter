const db = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const analytics = await db.getAnalytics();
    return res.json(analytics);
  } catch (err) {
    console.error('[API] analytics error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
