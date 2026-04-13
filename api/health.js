const db = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    await db.query('SELECT 1');
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '1.0.0'
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: err.message
    });
  }
};
