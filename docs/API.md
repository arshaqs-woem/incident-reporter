# API Reference

Base URL: `https://incident-reporter-xi.vercel.app`

---

## Webhooks

### POST /api/webhook/answer
Plivo answer webhook. Called when an inbound call connects.

Creates an Ultravox session and returns Plivo XML to stream audio.

**Response:** Plivo XML with `<Stream>` and `<Hangup/>`

---

### POST /api/webhook/events
Plivo event webhook. Called on call hangup.

Records call end time, fetches transcript from Ultravox API, generates call summary, and marks the call as `abandoned` if no incident was logged during the call.

**Response:** `{ ok: true }`

---

## Tools (called by Ultravox)

### POST /api/tools/report-incident
Main tool. Logs the incident and sends SMS notifications in one step.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `what` | string | yes | Description of what happened |
| `when_it_happened` | string | yes | Date/time of incident |
| `where_it_happened` | string | yes | Location |
| `injured` | string | yes | Injury details or "none" |
| `witnesses` | string | no | Witness names if any |
| `consent_manager` | boolean | yes | Whether caller consents to manager being notified |
| `notify_manager` | boolean | yes | Whether to send SMS to manager |
| `severity` | string | yes | `low`, `medium`, `high`, `critical` |
| `incident_type` | string | yes | `maintenance`, `safety`, `interpersonal`, `security` |
| `anonymous` | boolean | yes | Whether the caller chose to remain anonymous |
| `reporter_name` | string | no | Caller name, only if they volunteered it |

**Response:** `{ incident_id: number, status: "logged" | "already_logged" }`

---

### POST /api/tools/check-previous-incidents
Looks up prior incidents at the same location or of the same type in the past 30 days.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `location` | string | no | Location to search |
| `incident_type` | string | no | Type to filter by |

**Response:** `{ count: number, repeated: boolean, recent_incidents: [...] }`

---

## Calls

### GET /api/calls
List all calls, paginated.

**Query params:** `limit` (default 20), `offset` (default 0)

**Response:** `{ calls: [...], total: number }`

---

### GET /api/calls/:id
Get details for a specific call.

**Response:** Call log object with linked incident, transcript rows, and tool-call history if present.

---

### GET /api/calls/:id/summary
Get the call summary.

**Response:** Call summary object.

---

## Incidents

### GET /api/incidents
List all incidents joined with follow-ups and escalations.

**Response:** Array of incident objects.

---

## Follow-ups

### GET /api/follow-ups
List follow-ups with optional status filter.

**Query params:** `status` (`open`, `closed`)

**Response:** Array of follow-up objects sorted by `due_by`.

---

## Analytics

### GET /api/analytics
Basic call and incident analytics.

**Response:**
```json
{
  "totalCalls": 12,
  "avgDurationSeconds": 87.4,
  "callsByStatus": [...],
  "topIncidentTypes": [...]
}
```

---

## Health

### GET /api/health
Health check.

**Response:** `{ status: "ok", timestamp: "..." }`
