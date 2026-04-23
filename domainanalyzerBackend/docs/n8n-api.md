# N8n Webhook API Documentation

Simple API for sending audit data to n8n and receiving results back.

## Endpoints

### 1. Send Audit to N8n

**POST** `/api/audit/n8n/send`

Send the latest audit data to n8n webhook.

**Webhook URL configuration:**

The backend sends to the first configured value in this order:

1. `N8N_ANALYTICS_REPORTING_WEBHOOK_URL`
2. `N8N_AUDIT_WEBHOOK_URL`
3. Hardcoded fallback: `https://n8n.srv891599.hstgr.cloud/webhook/analytics-reporting`

Set one of the environment variables above in `.env` to avoid accidentally sending report payloads to the wrong n8n workflow.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reportMonth": "2026-04-01",
  "analyticsProperty": "sc-domain:example.com",
  "orgName": "Example Inc",
  "name": "Example SEO Report"
}
```

Required fields:

- `reportMonth`
- `analyticsProperty`

Optional fields:

- `orgName`
- `name`

**Response:**
```json
{
  "success": true,
  "message": "Data sent to n8n successfully",
  "requestId": "uuid-here",
  "response": {}
}
```

**What it sends to n8n:**
```json
{
  "id": "unique-uuid",
  "callbackUrl": "https://your-backend.com/api/audit/n8n/callback",
  "name": "example.com",
  "Report Month": "January 2026",
  "proposal template": "1queNsZi99R15QaCalavH8TqqvaeGPp1wC8Tqwn7AkhI",
  "analytics property": "example.com",
  "sheets template": "1qucJJTUMUCHN0k1yQDTBr6HKF7u0HPMC4NkVJy6kIT0",
  "URL": "example.com",
  "Org Name": "example.com"
}
```

---

### 2. Receive N8n Callback

**POST** `/api/audit/n8n/callback`

N8n calls this endpoint when processing is complete.

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "the-uuid-we-sent",
  "googleSheetsUrl": "https://docs.google.com/spreadsheets/...",
  "googleSlidesUrl": "https://docs.google.com/presentation/..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Callback received successfully"
}
```

---

## Flow

1. Frontend clicks "Send to N8n" button
2. Backend calls `/api/audit/n8n/send`
3. Backend generates unique ID and sends to n8n webhook
4. N8n processes the data
5. N8n calls back to `/api/audit/n8n/callback` with generated URLs
6. Backend updates database with the URLs

## Database

Each request is tracked in the `N8nRequest` table:
- `requestId` - Unique UUID for tracking
- `status` - pending → processing → completed/failed
- `requestPayload` - Data sent to n8n
- `responseData` - URLs received from n8n
