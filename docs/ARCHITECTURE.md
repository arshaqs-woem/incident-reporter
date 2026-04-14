# Architecture

## Overview

```
Caller → Plivo (PSTN) → /api/webhook/answer → Ultravox (Voice AI)
                                                      ↓
                                           /api/tools/report-incident
                                                      ↓
                                          Neon PostgreSQL + Plivo SMS
                                                      ↓
                                         Ultravox hangUp → Plivo Hangup
                                                      ↓
                                          /api/webhook/events → transcript + summary
```

## Components

### Plivo
Handles PSTN connectivity. Receives the inbound call, streams bidirectional audio to Ultravox via WebSocket, and sends SMS notifications to HR and manager.

### Ultravox
Speech-native voice AI. Receives raw audio in, outputs raw audio out — no STT/TTS pipeline. Runs the system prompt, classifies the incident, collects details, and calls HTTP tools when ready to log.

### Vercel (Serverless)
Hosts all API endpoints as Node.js serverless functions. Functions must complete all async work before returning a response — Vercel kills execution immediately after `res.json()`.

### Neon PostgreSQL
Hosted Postgres. Stores call logs, incidents, notifications, escalations, follow-ups, transcripts, detected intents, tool calls, and call summaries.

## Call Flow

1. Employee calls the Plivo number
2. Plivo POSTs to `/api/webhook/answer`
3. `answer.js` creates an Ultravox session via API, awaits `createCallLog()`, returns XML:
   ```xml
   <Response>
     <Stream bidirectional="true" contentType="audio/x-mulaw;rate=8000">
       {ultravox_join_url}
     </Stream>
     <Hangup/>
   </Response>
   ```
4. Plivo streams audio to Ultravox; agent greets caller
5. Agent collects incident details, optionally calls `check_previous_incidents`
6. Agent calls `report_incident` tool → POST to `/api/tools/report-incident`
7. `report-incident.js`:
   - Looks up the most recent in-progress call
   - Deduplication check (3-minute window by `call_id + incident_type`)
   - INSERT incident row inside a transaction
   - Writes follow-up and escalation fields inside the same transaction
   - Responds quickly to Ultravox, then sends SMS and lower-priority logs
   - Returns `{ incident_id, status }`
8. Agent says closing line, calls built-in `hangUp` tool
9. Plivo POSTs hangup event to `/api/webhook/events`
10. `events.js` calls `endCallLog()`, fetches transcript from Ultravox API, generates call summary

## Database Schema

| Table | Purpose |
|-------|---------|
| `call_logs` | One row per call — start/end time, duration, status, Ultravox session ID |
| `incidents` | Core incident data — type, severity, what/where/when/injured/witnesses |
| `notifications` | Every SMS sent — recipient, message, timestamp |
| `escalations` | High/critical incidents flagged for urgent review |
| `follow_ups` | Action items assigned to relevant team with due dates |
| `transcripts` | Full conversation turn-by-turn, fetched from Ultravox after hangup |
| `detected_intents` | Incident type logged as intent with confidence score |
| `tool_calls` | Every tool invocation — inputs, outputs, execution time, success flag |
| `call_summaries` | Plain-text summary generated after each call |

## Key Design Decisions

**Ultravox does not send call ID in tool headers**
Ultravox HTTP tools send `x-ultravox-tool-invocation-id` (per-invocation), not the Plivo call ID. `report-incident.js` works around this by querying the most recent in-progress call from `call_logs`. Works correctly for sequential calls.

**Critical writes happen before the tool exits**
The incident row, follow-up fields, and escalation fields are written before the tool returns. This keeps the core record intact even if non-critical background work is delayed.

**Deduplication via recent-call + 3-minute window**
If Ultravox retries the tool call, the tool checks for an existing incident with the same `call_id` and `incident_type` created within the last 3 minutes and returns the existing incident instead of inserting a second one.

**Caller anonymization**
`caller_number` is always stored as `null`. The agent never asks for the caller's identity unless they volunteer it.

**Transcript storage**
Transcripts are stored turn-by-turn rather than as one stitched blob. This makes the raw data better for debugging and analytics, while the summary endpoint provides the cleaner call-level view.
