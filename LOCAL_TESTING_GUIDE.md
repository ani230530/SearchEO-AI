# Local Testing Guide for N8N Webhook Integration

## Quick Start

### 1. Start Your Backend
```bash
cd domainanalyzerBackend
npm run dev
# Backend should be running on http://localhost:3002
```

### 2. Expose Backend to Internet (for n8n to call back)

#### Using ngrok (Recommended)

**Install ngrok:**
```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

**Start tunnel:**
```bash
ngrok http 3002
```

**Copy the HTTPS URL:**
```
Forwarding: https://abc123.ngrok.io -> http://localhost:3002
```

**Set environment variable (optional):**
```bash
export CALLBACK_BASE_URL=https://abc123.ngrok.io
```

#### Using localtunnel (Alternative)
```bash
npm install -g localtunnel
lt --port 3002
```

### 3. Test the Webhook Endpoint

#### Option A: Use the Test Script
```bash
# Basic test
./test-webhook-local.sh

# With custom job_id
./test-webhook-local.sh http://localhost:3002 job_11_1234567890 "expert witness"

# With ngrok URL
./test-webhook-local.sh https://abc123.ngrok.io job_11_1234567890 "expert witness"
```

#### Option B: Use curl
```bash
curl -X POST http://localhost:3002/api/campaigns/generation-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_11_test_123",
    "pages": [
      {
        "Primary Keyword": "test keyword",
        "Html Content": "<p>Test content</p>",
        "Title": "Test Title",
        "Meta Description": "Test description",
        "slug": "test-slug"
      }
    ]
  }'
```

#### Option C: Use Postman/Insomnia
1. Create POST request to: `http://localhost:3002/api/campaigns/generation-webhook`
2. Set header: `Content-Type: application/json`
3. Use payload from section 3 of N8N_API_DOCUMENTATION.md

### 4. Test Full Flow with n8n

1. **Update n8n workflow:**
   - In the HTTP Request node that calls back, set URL to:
     ```
     https://abc123.ngrok.io/api/campaigns/generation-webhook
     ```
   - Or use the `callback_url` from the original request payload

2. **Trigger from frontend:**
   - Open frontend app
   - Go to Campaign tab
   - Click "Generate Content" on a topic
   - Fill drawer and submit

3. **Monitor backend logs:**
   ```bash
   # You should see:
   [n8n request] Request sent for job job_11_xxx...
   [generation-webhook] Received X pages for job_id: job_11_xxx
   [generation-webhook] Matched draft by job_id...
   ```

4. **Check frontend:**
   - Frontend polls every 15 seconds
   - Status should update to "completed"
   - "View Page" buttons should appear

### 5. Simulate n8n Response (Without Waiting for n8n)

If you want to test without waiting for n8n to complete:

1. **First, trigger generation from frontend** (this creates drafts with job_id)

2. **Get the job_id from backend logs:**
   ```
   [n8n request] Request sent for job job_11_1765126226932...
   ```

3. **Get the primary keyword** from the topic you're testing

4. **Simulate the callback:**
   ```bash
   curl -X POST http://localhost:3002/api/campaigns/generation-webhook \
     -H "Content-Type: application/json" \
     -d '{
       "job_id": "job_11_1765126226932",
       "pages": [
         {
           "Primary Keyword": "expert witness",
           "Html Content": "<h1>Expert Witness</h1><p>Test content...</p>",
           "Title": "Expert Witness | Test",
           "Meta Description": "Test description",
           "slug": "expert-witness-test",
           "Featured Image": "{\"wp_id\":\"http://example.com/image.png\"}"
         }
       ]
     }'
   ```

### 6. Verify Results

#### Check Backend Logs
```bash
# Look for:
[generation-webhook] Received X pages for job_id: job_11_xxx
[generation-webhook] Matched draft by job_id...
[generation-webhook] Updated draft X for keyword "..."
```

#### Check Database
```sql
-- Find drafts with a specific job_id
SELECT id, "primaryKeyword", title, status, 
       response->>'jobId' as job_id,
       response->>'htmlContent' as has_content
FROM "WordpressPublishLog"
WHERE response->>'jobId' = 'job_11_1765126226932';

-- Check if HTML content was saved
SELECT id, "primaryKeyword", 
       LENGTH(response->>'htmlContent') as content_length
FROM "WordpressPublishLog"
WHERE response->>'htmlContent' IS NOT NULL
  AND response->>'htmlContent' != '';
```

#### Check Frontend
- Status should change from "Generating..." to "Completed"
- "View Page" button should appear
- Clicking "View Page" should show the HTML content

## Troubleshooting

### Issue: ngrok URL changes on restart
**Solution:** 
- Use ngrok with a static domain (paid plan), OR
- Update n8n workflow URL each time, OR
- Set `CALLBACK_BASE_URL` environment variable

### Issue: "Connection refused"
**Solution:**
- Make sure backend is running: `npm run dev`
- Check port: Backend should be on port 3002
- Verify ngrok is forwarding: `ngrok http 3002`

### Issue: "404 Not Found"
**Solution:**
- Check route: Should be `/api/campaigns/generation-webhook`
- Verify backend routes are loaded
- Check backend logs for route registration

### Issue: "No drafts found with job_id"
**Solution:**
- Make sure you triggered generation from frontend first
- Check that drafts exist: `SELECT * FROM "WordpressPublishLog" WHERE status = 'generating'`
- Verify job_id matches: Check `response->>'jobId'` in database

### Issue: Frontend not updating
**Solution:**
- Check if polling is running (check browser console)
- Verify status endpoint: `GET /api/campaigns/generation-status/:jobId`
- Check if drafts have `htmlContent` in response field
- Verify frontend is checking for `htmlContent` correctly

## Environment Variables

For local testing, you can set:

```bash
# Override callback URL (useful with ngrok)
export CALLBACK_BASE_URL=https://abc123.ngrok.io

# n8n API key
export N8N_API_KEY=1234
export N8N_API_KEY_HEADER=key

# n8n webhook URL
export N8N_PILLAR_WEBHOOK_URL=https://n8n.srv891599.hstgr.cloud/webhook/d235dd55-3392-4093-b3dd-095baf5c337b
```

## Quick Test Checklist

- [ ] Backend is running on port 3002
- [ ] ngrok tunnel is active and forwarding to port 3002
- [ ] Test webhook endpoint with curl/script (should return 200)
- [ ] Trigger generation from frontend (creates drafts)
- [ ] Check backend logs for job_id
- [ ] Simulate n8n callback with correct job_id
- [ ] Verify drafts updated in database
- [ ] Check frontend shows "completed" status
- [ ] "View Page" button appears and works

## Next Steps

Once local testing works:
1. Update n8n workflow to use your ngrok URL (or production URL)
2. Test full flow: Frontend → Backend → n8n → Webhook → Frontend
3. Monitor logs for any issues
4. Deploy to production with production callback URL







