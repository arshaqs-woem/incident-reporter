const db = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;
  const callId = event?.CallUUID || event?.call_id || event?.callId || 'unknown';

  try {
    const type = event?.Event || event?.type || event?.event_type || '';

    if (type === 'Hangup' || type === 'call_ended' || type === 'hangup') {
      const duration = parseInt(event?.Duration || event?.duration_seconds || event?.duration || 0);
      await db.endCallLog({ callId, durationSeconds: duration, status: 'completed' });
      console.log(`[CALL END] ${callId} — ${duration}s`);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[WEBHOOK] events error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
