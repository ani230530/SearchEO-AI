# N8n Error API Integration Guide

This API endpoint allows n8n workflows to immediately report critical failures to the Backend, which then updates the database properties and notifies the Frontend user in real-time.

## 1. Endpoint Configuration

- **URL**: `POST /api/webhooks/n8n/error`
- **Authentication**: None (Internal Webhook)
- **Headers**: `Content-Type: application/json`

### JSON Payload

| Field     | Type   | Required | Description                                                                 |
|-----------|--------|----------|-----------------------------------------------------------------------------|
| `jobId`   | String | Yes      | The unique Job ID passed to the n8n workflow (e.g., `job_11_1765126...`)    |
| `error`   | String | Yes      | Short, human-readable error message (e.g., "OpenAI Rate Limit Exceeded")    |
| `details` | Mixed  | No       | Full error stack trace or object from n8n `Execution Error`                 |
| `userId`  | Number | No       | The User ID (optional, helps optimize lookup if available in workflow context)|

#### Example Payload

```json
{
  "jobId": "job_11_1765126226932",
  "error": "Failed to scrape competitor data",
  "details": {
    "message": "403 Forbidden",
    "stack": "Error: Request failed with status code 403..."
  },
  "userId": 123
}
```

---

## 2. Integration with n8n

To use this in your n8n workflows:

1.  **Add an "Error Trigger" Node** (or use a Catch node attached to your main graph).
2.  **Add an "HTTP Request" Node** connected to the Error/Catch trigger.
3.  **Configure the HTTP Request**:
    *   **Method**: `POST`
    *   **URL**: `https://[YOUR_BACKEND_URL]/api/webhooks/n8n/error`
    *   **Authentication**: None
    *   **Body Content**: JSON
    *   **JSON Body**:
        ```json
        {
          "jobId": "={{ $json.job_id }}",
          "error": "Workflow Execution Failed",
          "details": "={{ $json.execution.error }}",
          "userId": "={{ $json.user_id }}"
        }
        ```
        *(Note: Ensure `job_id` and `user_id` are available in your workflow's input data or context)*

---

## 3. System Behavior

When this endpoint is hit:

1.  **Database Update**:
    *   Finds all `WordpressPublishLog` drafts associated with the `jobId`.
    *   Updates them to `status: 'failed'` (in JSON response) and `status: 'draft'` (top level).
    *   Updates `GenerationJob` and `GenerationJobPage` records to `failed`.
2.  **User Notification**:
    *   Sends a real-time **Server-Sent Event (SSE)** to the user.
    *   **Frontend**: `SidebarDashboard.tsx` listens for `type: 'n8n_error'` and displays a red Toast notification with the error message.
