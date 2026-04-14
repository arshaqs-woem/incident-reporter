const { createCall } = require('../../lib/ultravox');
const db = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).end();
  }

  const calledNumber = req.body?.To || req.query?.To || process.env.PLIVO_NUMBER;
  const plivoCallId  = req.body?.CallUUID || req.query?.CallUUID || `plivo-${Date.now()}`;

  console.log(`[CALL] Inbound → ${calledNumber} (${plivoCallId})`);

  let uvCall;
  try {
    uvCall = await createCall();
  } catch (err) {
    console.error('[ULTRAVOX] createCall failed:', err.message, err.response?.data);
    const xml = `<?xml version="1.0" encoding="utf-8"?><Response><Speak>Sorry, we are experiencing technical difficulties. Please call back later.</Speak></Response>`;
    res.setHeader('Content-Type', 'text/xml');
    return res.send(xml);
  }

  const joinUrl = uvCall.joinUrl;
  const uvCallId = uvCall.callId || uvCall.call_id;
  console.log(`[ULTRAVOX] Session created: ${uvCallId} joinUrl: ${joinUrl} raw:`, JSON.stringify(uvCall).slice(0, 200));

  // Await this — Vercel kills the function after res.send so fire-and-forget doesn't work
  await db.createCallLog({ callId: plivoCallId, calledNumber, uvCallId }).catch(e =>
    console.error('[DB] createCallLog failed:', e.message)
  );

  const xml = `<?xml version="1.0" encoding="utf-8"?><Response><Stream bidirectional="true" contentType="audio/x-mulaw;rate=8000" keepCallAlive="true">${joinUrl}</Stream><Hangup/></Response>`;
  res.setHeader('Content-Type', 'text/xml');
  return res.send(xml);
};
