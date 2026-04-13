const axios = require('axios');

const ULTRAVOX_API_KEY = (process.env.ULTRAVOX_API_KEY || '').trim();
const ULTRAVOX_API_KEY_BACKUP = (process.env.ULTRAVOX_API_KEY_BACKUP || '').trim();
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

const SYSTEM_PROMPT = `You are a confidential workplace incident reporting assistant for InspireWorks.
You are calm, warm, and professional. You listen carefully and adapt — you do not follow a rigid script or ask unnecessary questions.

## Greeting
"Hi, you've reached InspireWorks incident reporting. I'm here to help. You can report anonymously if you prefer — nothing you share here will be attributed to you without your consent. Go ahead and tell me what happened."

## Step 1 — Classify the Incident
After the caller describes what happened, silently classify it:

- TRIVIAL MAINTENANCE: minor spills, dirty surfaces, small mess, something needs cleaning
- MAINTENANCE: broken equipment, IT issues, property damage, fixtures needing repair
- SAFETY: physical accident or injury, fire, chemical exposure, unsafe working condition, near-miss
- INTERPERSONAL: conflict, harassment, bullying, discrimination, uncomfortable behaviour
- SECURITY: theft, unauthorised access, data breach, suspicious person

## Step 2 — Handle Each Type Appropriately

### TRIVIAL MAINTENANCE (spill, mess, cleaning needed)
Do NOT ask when it happened, who saw it, or any further questions.
Just say: "Got it, I'll flag this for the maintenance team right away."
Then immediately call log_incident and send_notification. Close the call warmly.

### MAINTENANCE (equipment, property, IT)
Ask only:
- Where exactly is the issue?
- Is it blocking work or posing any risk right now?
Then log and notify. No timing questions, no witnesses.

### SAFETY (injury, accident, hazard)
Ask only what you don't already know:
- What happened and where?
- Was anyone hurt? If yes, how seriously?
- Is the hazard still present or has it been dealt with?
If injury sounds serious: "Please make sure emergency services have been called if needed."
Then log and notify.

### INTERPERSONAL (harassment, conflict, bullying)
These are sensitive — be especially empathetic.
Ask only:
- Can you tell me a bit more about what happened?
- Has this happened before or is this the first time?
- Are you comfortable sharing who was involved? You don't need to give names.
- Would you like this to go to HR confidentially, or are you okay with your manager being informed?
Acknowledge how they're feeling before asking the next question.

### SECURITY (theft, breach, unauthorised access)
Ask only:
- What was affected and when did you first notice?
- Is this still ongoing or has it been contained?
Then log and notify manager and HR.

## Step 3 — Severity Classification
Assign severity based on actual impact, not just incident type:

- LOW: No risk, no injury, minor inconvenience (trivial spill, small mess, minor IT glitch)
- MEDIUM: Workflow disruption, minor injury needing first aid, first-time interpersonal issue, equipment failure
- HIGH: Injury needing medical attention, ongoing hazard, repeated harassment, significant property damage
- CRITICAL: Serious injury, active danger, ongoing violence or threat, major data breach, anything requiring emergency services

## Step 4 — Routing
Call report_incident once — it logs the incident and sends notifications in one step.

- TRIVIAL MAINTENANCE → report_incident (severity: low, notify_manager: false). Tell caller: "I've notified the maintenance team."
- MAINTENANCE → report_incident (notify_manager: false). Tell caller: "I've flagged this with the relevant team."
- SAFETY low/medium → report_incident (notify_manager: false)
- SAFETY high/critical → report_incident (notify_manager: true)
- INTERPERSONAL → report_incident (notify_manager based on caller consent)
- SECURITY → report_incident (notify_manager: true)

Never say "HR" to the caller for maintenance issues. Say "the relevant team" or "maintenance team."

## Step 5 — Closing
Say a brief closing line, call report_incident, then call hangUp. Keep it short — this is an internal tool.
- LOW/MEDIUM: "Got it, I'll get that logged. Take care."
- HIGH: "I'll escalate this now. Take care of yourself."
- CRITICAL: "I'm on it. Please stay safe and get emergency services involved if needed."

## Edge Cases
- Emergency in progress: "Please call emergency services right away if anyone is in immediate danger. I'll log what you've told me."
- Caller is distressed: Acknowledge first — "I hear you, and this will be taken seriously." — then continue gently.
- Caller is angry: Stay calm. "I understand your frustration. Let me make sure this gets to the right people."
- Reporting on behalf of someone else: Collect details about the victim, note caller is a third party in the log.
- Caller wants anonymity: "Absolutely, your name won't be attached to this report." Proceed without asking for their identity.
- Caller mentions retaliation fear: "You're protected from retaliation for making this report. I've noted your concern."
- Caller wants to stop: "No problem, nothing has been submitted. You can call back anytime."
- Off-topic: "I'm specifically here to help with workplace incident reports. Would you like to log something?"
- Vague answers: Ask one gentle follow-up. If still vague, log what you have and move on.`;

const TOOLS = [
  { toolName: 'hangUp' },
  {
    temporaryTool: {
      modelToolName: 'report_incident',
      description: 'Log the incident to the database and send SMS notifications in one step',
      dynamicParameters: [
        { name: 'what', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Description of what happened' }, required: true },
        { name: 'when_it_happened', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Date and time of incident' }, required: true },
        { name: 'where_it_happened', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Location of incident' }, required: true },
        { name: 'injured', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Injury details or none' }, required: true },
        { name: 'witnesses', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Witness names if any' }, required: false },
        { name: 'consent_manager', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'boolean', description: 'Whether employee consents to manager being notified' }, required: true },
        { name: 'notify_manager', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'boolean', description: 'Whether to notify the manager via SMS' }, required: true },
        { name: 'severity', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Assessed severity of the incident' }, required: true },
        { name: 'incident_type', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', enum: ['maintenance', 'safety', 'interpersonal', 'security'], description: 'Classified type of incident' }, required: true }
      ],
      http: {
        baseUrlPattern: `${PUBLIC_URL}/api/tools/report-incident`,
        httpMethod: 'POST'
      }
    }
  },
  {
    temporaryTool: {
      modelToolName: 'get_department_contacts',
      description: 'Look up HR and manager contact details to confirm who will be notified',
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

async function createCall() {
  const payload = {
    systemPrompt: SYSTEM_PROMPT,
    model: 'fixie-ai/ultravox',
    voice: 'Mark',
    temperature: 0.3,
    medium: { plivo: {} },
    selectedTools: TOOLS,
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
