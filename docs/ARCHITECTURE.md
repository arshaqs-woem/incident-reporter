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
   - Deduplication check (advisory lock + 3-minute window)
   - INSERT incident row
   - Parallel: SMS to HR + (optional) SMS to manager + escalation row + follow-up row + tool_call log + intent log
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

**All side effects run before response**
Vercel kills execution after `res.json()`. SMS, DB writes, escalations, and follow-ups all run in parallel via `Promise.all()` and are awaited before responding.

**Deduplication via advisory lock**
If Ultravox retries the tool call (e.g. due to slow response), a PostgreSQL advisory lock prevents two concurrent inserts for the same call/incident-type pair within a 3-minute window.

**Caller anonymization**
`caller_number` is always stored as `null`. The agent never asks for the caller's identity unless they volunteer it.
