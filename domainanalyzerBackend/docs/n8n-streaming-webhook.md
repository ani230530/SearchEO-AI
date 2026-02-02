# N8N Streaming Webhook - Progress Updates

## Overview

When generating campaign pages, you now receive a `streaming_url` in the payload. Use this URL to send real-time progress updates during generation, which will be displayed to users in real-time.

## When to Use

Call the streaming webhook **during** the generation process to provide progress updates. This is separate from the final `callback_url` which is called when generation is complete.

## How to Call

**Endpoint:** Use the `streaming_url` from the incoming payload  
**Method:** `POST`  
**Headers:**
```
Content-Type: application/json
```

## Payload Format

Send a minimal payload with only two required fields:

```json
{
  "job_id": "job_11_1765126226932",
  "message": "Generating pillar page content..."
}
```

### Required Fields

- **`job_id`** (string): Must match the `job_id` received in the original request
- **`message`** (string): Progress message to display to the user

### Example Messages

```json
{ "job_id": "job_11_1765126226932", "message": "Starting content generation..." }
{ "job_id": "job_11_1765126226932", "message": "Generating pillar page: Expert Witness" }
{ "job_id": "job_11_1765126226932", "message": "Pillar page complete. Generating sub-pages..." }
{ "job_id": "job_11_1765126226932", "message": "Sub-page 1 of 3 complete" }
{ "job_id": "job_11_1765126226932", "message": "Finalizing content..." }
```

## Response

**Success (200):**
```json
{
  "success": true,
  "message": "Progress update broadcasted"
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "Invalid payload: job_id is required"
}
```

## Implementation in N8N

1. **Extract `streaming_url`** from the incoming webhook payload
2. **Extract `job_id`** from the incoming webhook payload
3. **During generation**, use an HTTP Request node to POST to `streaming_url` with progress updates
4. **Continue** with your normal generation workflow
5. **Finally**, call the `callback_url` when generation is complete (as before)

### Example N8N Workflow

```
Webhook (receive request)
  ↓
Extract: streaming_url, job_id
  ↓
HTTP Request → streaming_url (progress: "Starting...")
  ↓
[Your generation logic]
  ↓
HTTP Request → streaming_url (progress: "50% complete...")
  ↓
[More generation logic]
  ↓
HTTP Request → streaming_url (progress: "Finalizing...")
  ↓
HTTP Request → callback_url (final results)
```

## Notes

- You can call the streaming webhook **multiple times** during generation
- Each call will broadcast the message to connected users in real-time
- If `job_id` is not found, you'll receive a 200 response but the update won't be broadcasted
- Always include both `job_id` and `message` in every request
- The streaming webhook is **optional** - your workflow will work without it, but users won't see progress updates

## Quick Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_id` | string | ✅ Yes | Must match the job_id from original request |
| `message` | string | ✅ Yes | Progress message to display |



