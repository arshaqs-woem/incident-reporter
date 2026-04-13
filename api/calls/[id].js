const db = require('../../lib/db');

module.exports = async (req, res) => {
  const { id } = req.query;
  const isSummary = req.url?.includes('/summary');

  try {
    if (isSummary) {
      const summary = await db.getCallSummary(id);
      if (!summary) return res.status(404).json({ error: 'Summary not found' });
      return res.json(summary);
    }

    const [call, transcripts] = await Promise.all([
      db.getCallLog(id),
      db.getTranscripts(id)
    ]);

    if (!call) return res.status(404).json({ error: 'Call not found' });
    return res.json({ ...call, transcripts });
  } catch (err) {
    console.error('[API] get call error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
