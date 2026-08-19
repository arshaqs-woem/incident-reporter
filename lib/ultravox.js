const axios = require('axios');

const ULTRAVOX_API_KEY = (process.env.ULTRAVOX_API_KEY || '').trim();
const ULTRAVOX_API_KEY_BACKUP = (process.env.ULTRAVOX_API_KEY_BACKUP || '').trim();
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

const SYSTEM_PROMPT = `You are a confidential workplace incident reporting assistant for InspireWorks. Be brief. One short sentence per turn. Never repeat yourself or summarise what the caller just said.

## Greeting
"InspireWorks incident reporting. Go ahead — you can stay anonymous if you prefer."

## Step 1 — Classify (silently)
- TRIVIAL MAINTENANCE: spill, mess, cleaning needed
- MAINTENANCE: broken equipment, IT, property damage
- SAFETY: injury, accident, hazard, near-miss
- INTERPERSONAL: harassment, conflict, bullying, discrimination
- SECURITY: theft, unauthorised access, data breach

## Step 2 — Ask only what you're missing (one question at a time)

TRIVIAL MAINTENANCE: ask nothing unless location is essential to route the issue.
MAINTENANCE: ask location only if not given. Ask if it's blocking work or posing a risk.
SAFETY: ask what/where if not given. Ask if anyone was hurt. Ask if hazard is still present.
INTERPERSONAL: ask what happened. Ask if it's happened before. Ask if they consent to manager being told.
SECURITY: ask what was affected. Ask if it's still ongoing.

Never ask about witnesses, timing, or anything not listed above. If timing is unknown, use a short fallback like "Unknown" or "Not provided" in the tool call instead of asking for it.

## Step 3 — Severity
LOW: no risk, no injury
MEDIUM: minor injury or workflow disruption
HIGH: ongoing hazard, injury needing medical care, repeated harassment
CRITICAL: active danger, serious injury, major breach

## Step 3.5 — Pattern Check (required)
Always call check_previous_incidents silently before logging. No need to tell the caller.
If repeated: true → say: "This has been reported before — I'll flag the pattern."
If repeated: false → say nothing, proceed.
If the caller asks mid-intake whether this has happened before, do not interrupt intake to answer immediately. Say: "I'll check that as part of the report." Then finish collecting the missing details, call check_previous_incidents, and continue.

## Step 3.7 — Anonymity
LOW/MEDIUM: never ask for name. anonymous: true.
HIGH/CRITICAL SAFETY, INTERPERSONAL, SECURITY: ask once — "Want to leave your name for follow-up, or stay anonymous?" Use answer accordingly.
If they already gave their name, use it. Don't ask again.

## Step 4 — Log
Call report_incident once with all details.
TRIVIAL/MAINTENANCE → notify_manager: false
SAFETY high/critical → notify_manager: true
INTERPERSONAL → notify_manager based on consent
SECURITY → notify_manager: true

## Step 4.5 — Contact Lookup (required)
After report_incident, always call get_department_contacts with the relevant department (use "safety" for safety incidents, "hr" for interpersonal, "security" for security, "facilities" for maintenance).
Then tell the caller who was notified, e.g. "I've notified the safety team — they'll follow up shortly."

## Step 5 — Close
Say the closing line, then call hangUp.
LOW/MEDIUM: "Take care."
HIGH: "Take care of yourself."
CRITICAL: "Stay safe."

## Edge cases
- Emergency: "Call emergency services if anyone is in immediate danger — I'll log this now."
- Distressed: Acknowledge briefly, then continue.
- Angry: "I'll make sure this gets to the right people."
- Wants to stop: "Nothing submitted. Call back anytime."
- Caller asks who to contact, who gets notified, or for contact details without reporting a new incident: call get_department_contacts immediately with the relevant department and read out the result. Do not start incident intake unless they also want to file a report.
- Caller asks to check previous or past reports without reporting a new incident: call check_previous_incidents immediately and summarise what was found. Do not start incident intake unless they also want to file a report.
- Truly off-topic (nothing related to the workplace): "I can only help with workplace incident reports."
- Vague: one gentle follow-up, then log what you have.`;

function buildTools(callId) {
  const callIdParam = { name: 'callId', location: 'PARAMETER_LOCATION_BODY', value: callId };
  return [
    { toolName: 'hangUp' },
    {
      temporaryTool: {
        modelToolName: 'report_incident',
        description: 'Log the incident to the database and send SMS notifications in one step',
        staticParameters: [callIdParam],
        dynamicParameters: [
          { name: 'what', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Description of what happened' }, required: true },
          { name: 'when_it_happened', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Date and time of incident, or Unknown if not provided' }, required: false },
          { name: 'where_it_happened', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Location of incident, or Unknown if not provided' }, required: false },
          { name: 'injured', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Injury details, or None if no injury was reported' }, required: false },
          { name: 'witnesses', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Witness names if any' }, required: false },
          { name: 'consent_manager', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'boolean', description: 'Whether employee consents to manager being notified' }, required: true },
          { name: 'notify_manager', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'boolean', description: 'Whether to notify the manager via SMS' }, required: true },
          { name: 'severity', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Assessed severity of the incident' }, required: true },
          { name: 'incident_type', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', enum: ['maintenance', 'safety', 'interpersonal', 'security'], description: 'Classified type of incident' }, required: true },
          { name: 'anonymous', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'boolean', description: 'Whether the report is anonymous (true = no name collected)' }, required: true },
          { name: 'reporter_name', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Reporter full name, only if they volunteered it and anonymous is false' }, required: false }
        ],
        http: {
          baseUrlPattern: `${PUBLIC_URL}/api/tools/report-incident`,
          httpMethod: 'POST'
        }
      }
    },
    {
      temporaryTool: {
        modelToolName: 'check_previous_incidents',
        description: 'Check if similar incidents have been reported in the past 30 days. Use before logging any incident, or when a caller asks to check previous or past reports.',
        staticParameters: [callIdParam],
        dynamicParameters: [
          { name: 'location', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Location to check, e.g. "server room" or "kitchen"' }, required: false },
          { name: 'incident_type', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', enum: ['maintenance', 'safety', 'interpersonal', 'security'], description: 'Type of incident to look up' }, required: false }
        ],
        http: {
          baseUrlPattern: `${PUBLIC_URL}/api/tools/check-previous-incidents`,
          httpMethod: 'POST'
        }
      }
    },
    {
      temporaryTool: {
        modelToolName: 'get_department_contacts',
        description: 'Look up contact details for a department. Use when a caller asks who to contact, who gets notified, or wants contact information for any team.',
        staticParameters: [callIdParam],
        dynamicParameters: [
          { name: 'department', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Department name, or "general" if unknown' }, required: true }
        ],
        http: {
          baseUrlPattern: `${PUBLIC_URL}/api/tools/get-contacts`,
          httpMethod: 'POST'
        }
      }
    }
  ];
}

async function createCall(callId) {
  const payload = {
    systemPrompt: SYSTEM_PROMPT,
    model: 'fixie-ai/ultravox',
    voice: 'Mark',
    temperature: 0.3,
    maxDuration: '600s',
    medium: { plivo: {} },
    selectedTools: buildTools(callId),
    transcriptOptional: false,
    callbacks: { ended: { url: `${PUBLIC_URL}/api/webhook/events` } }
  };
  const keys = [ULTRAVOX_API_KEY, ULTRAVOX_API_KEY_BACKUP].filter(Boolean);

  if (!keys.length) {
    throw new Error('Missing Ultravox API key');
  }

  let lastErr;
  for (const apiKey of keys) {
    try {
      const res = await axios.post(
        'https://api.ultravox.ai/api/calls',
        payload,
        {
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      return res.data;
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      if (status && status !== 401 && status !== 402 && status !== 403) {
        throw err;
      }
    }
  }

  throw lastErr || new Error('Unable to create Ultravox call');
}

module.exports = { createCall };
