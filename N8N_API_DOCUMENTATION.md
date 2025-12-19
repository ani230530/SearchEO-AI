# N8N Integration API Documentation

## Overview
This document describes the API integration between the backend and n8n for topic-level content generation.

---

## 1. What We Send TO N8N

### Endpoint
```
POST https://n8n.srv891599.hstgr.cloud/webhook/d235dd55-3392-4093-b3dd-095baf5c337b
```

### Headers
```
Content-Type: application/json
key: 1234  (or your N8N_API_KEY from environment)
```

### Payload Structure
```json
{
  "user_id": "user_123",
  "campaign_name": "Expert Witness Cluster",
  "job_id": "job_11_1765126226932",
  "callback_url": "http://your-backend-url/api/campaigns/generation-webhook",
  "pillar_page": {
    "primary_keyword": "expert witness",
    "longtail_keywords": ["analysis expert witness"],
    "options": {
      "image": 2,
      "word_count": 800,
      "featured_image": "yes"
    }
  },
  "sub_pillar_pages": [
    {
      "primary_keyword": "analyst expert witness",
      "longtail_keywords": ["analysis expert witness"],
      "options": {
        "image": 2,
        "word_count": 800,
        "featured_image": "yes"
      }
    },
    {
      "primary_keyword": "seo expert witness",
      "longtail_keywords": ["search engine marketing expert witness"],
      "options": {
        "image": 2,
        "word_count": 800,
        "featured_image": "yes"
      }
    }
  ],
  "brand": {
    "brand_name": "github.com",
    "brand_description": "Comprehensive Domain Analysis for GitHub.com..."
  },
  "wordpress": {
    "username": "admin",
    "password": "decrypted_password",
    "url": "https://legalexperts.ai/"
  }
}
```

### Key Fields
- **`job_id`** (REQUIRED): Unique identifier like `job_11_1765126226932`. n8n MUST return this in the callback.
- **`callback_url`**: The URL n8n should call when generation is complete.
- **`pillar_page`**: Configuration for the main pillar page (1 page).
- **`sub_pillar_pages`**: Array of sub-page configurations (N pages).
- **`brand`**: Brand name and description for content personalization.
- **`wordpress`**: WordPress credentials for saving drafts.

---

## 2. API Endpoint for N8N Callback

### Endpoint
```
POST /api/campaigns/generation-webhook
```

### Full URL
```
http://your-backend-url/api/campaigns/generation-webhook
```

### Authentication
**NONE** - This endpoint is public (n8n calls it directly)

### Headers
```
Content-Type: application/json
```

---

## 3. What N8N Should Send BACK

### Format Option 1: Object with Pages Array (Recommended)

```json
{
  "job_id": "job_11_1765126226932",
  "pages": [
    {
      "Primary Keyword": "expert witness",
      "Html Content": "<p>Expert witnesses hold a pivotal function...</p>",
      "Title": "Expert Witness | Definition, Types, and Qualifications Explained",
      "Meta Description": "Learn what an expert witness is, the types, qualifications required...",
      "slug": "expert-witness-services",
      "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/danlupck0/image/upload/v1764835720/rg9auvey9r0nwysgxskm.png\"}"
    },
    {
      "Primary Keyword": "analyst expert witness",
      "Html Content": "<p>Analyst expert witnesses are critical...</p>",
      "Title": "Analyst Expert Witness | Definitive Guide to Roles and Selection",
      "Meta Description": "Discover the essential role of an analyst expert witness...",
      "slug": "analyst-expert-witness-guide",
      "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/danlupck0/image/upload/v1764835878/c9fkfvpzs6ntg29dq3mv.png\"}"
    },
    {
      "Primary Keyword": "seo expert witness",
      "Html Content": "<p>A search engine optimization (SEO) expert witness...</p>",
      "Title": "SEO Expert Witness Guide | Roles, Qualifications, and Legal Impact",
      "Meta Description": "Explore the essential role, qualifications, and legal benefits...",
      "slug": "seo-expert-witness-guide",
      "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/danlupck0/image/upload/v1764835995/pbyugauwy2xw4avz7okf.png\"}"
    }
  ]
}
```

### Format Option 2: Direct Array (Alternative)

```json
[
  {
    "Job Id": "job_11_1765126226932",
    "Primary Keyword": "expert witness",
    "Html Content": "<p>Expert witnesses hold...</p>",
    "Title": "Expert Witness | Definition...",
    "Meta Description": "Learn what an expert witness is...",
    "slug": "expert-witness-services",
    "Featured Image": "{\"wp_id\":\"http://...\"}"
  },
  {
    "Primary Keyword": "analyst expert witness",
    "Html Content": "<p>Analyst expert witnesses...</p>",
    "Title": "Analyst Expert Witness | Definitive Guide...",
    "Meta Description": "Discover the essential role...",
    "slug": "analyst-expert-witness-guide",
    "Featured Image": "{\"wp_id\":\"http://...\"}"
  },
  {
    "Primary Keyword": "seo expert witness",
    "Html Content": "<p>A search engine optimization...</p>",
    "Title": "SEO Expert Witness Guide | Roles...",
    "Meta Description": "Explore the essential role...",
    "slug": "seo-expert-witness-guide",
    "Featured Image": "{\"wp_id\":\"http://...\"}"
  }
]
```

### Required Fields for Each Page

| Field | Required | Description |
|-------|----------|-------------|
| `job_id` / `Job Id` | ✅ Yes | Must match the `job_id` sent in the original request |
| `Primary Keyword` | ✅ Yes | Used to match the page to the correct draft |
| `Html Content` | ✅ Yes | The generated HTML content |
| `Title` | ⚠️ Recommended | Page title |
| `Meta Description` | ⚠️ Recommended | SEO meta description |
| `slug` | ⚠️ Recommended | URL slug |
| `Featured Image` | ⚠️ Optional | Featured image URL/JSON |

---

## 4. Response from Webhook

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Processed 3 pages"
}
```

### Error Response (400/500)
```json
{
  "success": false,
  "error": "Error message description"
}
```

---

## 5. How Matching Works

1. **Extract `job_id`** from the callback payload
2. **Find all drafts** in the database with matching `job_id` (stored in `response.jobId`)
3. **Match each page** to a draft using:
   - `job_id` + `Primary Keyword` (most reliable)
   - Fallback: `Primary Keyword` only (if `job_id` missing)
4. **Update the draft** with the HTML content and mark as completed

---

## 6. n8n Workflow Configuration

### Step 1: Receive Webhook
- Configure webhook to receive the payload from backend
- Extract `job_id` and `callback_url` from the payload

### Step 2: Process Generation
- Generate content for pillar page (1 page)
- Generate content for each sub-pillar page (N pages)
- This takes ~3 minutes per page

### Step 3: Call Backend Webhook
After all pages are generated, add an **HTTP Request** node:

**Configuration:**
- **Method:** POST
- **URL:** Use `callback_url` from the original request (or hardcode: `http://your-backend-url/api/campaigns/generation-webhook`)
- **Headers:**
  ```
  Content-Type: application/json
  ```
- **Body (JSON):**
  ```json
  {
    "job_id": "{{ $json.job_id }}",
    "pages": [
      {
        "Primary Keyword": "{{ $json.pillar_page.primary_keyword }}",
        "Html Content": "{{ $json.pillar_html_content }}",
        "Title": "{{ $json.pillar_title }}",
        "Meta Description": "{{ $json.pillar_meta_description }}",
        "slug": "{{ $json.pillar_slug }}",
        "Featured Image": "{{ $json.pillar_featured_image }}"
      },
      {
        "Primary Keyword": "{{ $json.sub_page_1.primary_keyword }}",
        "Html Content": "{{ $json.sub_page_1_html_content }}",
        "Title": "{{ $json.sub_page_1_title }}",
        "Meta Description": "{{ $json.sub_page_1_meta_description }}",
        "slug": "{{ $json.sub_page_1_slug }}",
        "Featured Image": "{{ $json.sub_page_1_featured_image }}"
      }
      // ... repeat for each sub-page
    ]
  }
  ```

---

## 7. Local Testing Guide

### Prerequisites
1. Backend running on `http://localhost:3002`
2. ngrok installed (or similar tunneling service)
3. Access to n8n workflow

### Step 1: Expose Local Backend to Internet

Since n8n needs to call your local backend, you need to expose it using a tunneling service.

#### Option A: Using ngrok (Recommended)

1. **Install ngrok:**
   ```bash
   # macOS
   brew install ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **Start ngrok tunnel:**
   ```bash
   ngrok http 3002
   ```

3. **Copy the HTTPS URL:**
   ```
   Forwarding: https://abc123.ngrok.io -> http://localhost:3002
   ```
   Use this URL: `https://abc123.ngrok.io`

#### Option B: Using localtunnel (Alternative)

```bash
# Install
npm install -g localtunnel

# Start tunnel
lt --port 3002
```

### Step 2: Update Backend Callback URL

The backend automatically generates the callback URL, but for local testing, you may want to override it.

**Option 1: Set environment variable**
```bash
export CALLBACK_BASE_URL=https://abc123.ngrok.io
```

**Option 2: Manually update in n8n workflow**
- In your n8n workflow, hardcode the ngrok URL in the HTTP Request node that calls back

### Step 3: Test the Webhook Endpoint Directly

Test if the webhook endpoint is accessible:

```bash
# Test with curl
curl -X POST https://abc123.ngrok.io/api/campaigns/generation-webhook \
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

**Expected Response:**
```json
{
  "success": true,
  "message": "Processed 1 pages"
}
```

### Step 4: Test Full Flow

1. **Start your backend:**
   ```bash
   cd domainanalyzerBackend
   npm run dev
   # Backend should be running on http://localhost:3002
   ```

2. **Start ngrok:**
   ```bash
   ngrok http 3002
   # Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
   ```

3. **Update n8n workflow:**
   - In the HTTP Request node that calls back, set URL to:
     ```
     https://abc123.ngrok.io/api/campaigns/generation-webhook
     ```

4. **Trigger generation from frontend:**
   - Open your frontend app
   - Go to Campaign tab
   - Click "Generate Content" on a topic
   - Fill the drawer and submit

5. **Monitor logs:**
   ```bash
   # Backend logs will show:
   [n8n request] Request sent for job job_11_xxx...
   [generation-webhook] Received X pages for job_id: job_11_xxx
   [generation-webhook] Matched draft by job_id...
   ```

6. **Check frontend:**
   - Frontend should poll every 15 seconds
   - When n8n calls back, status should update to "completed"
   - "View Page" buttons should appear

### Step 5: Debugging Tips

#### Check if webhook is receiving requests:
```bash
# Watch backend logs
tail -f domainanalyzerBackend/logs/*.log

# Or check console output
```

#### Test with Postman/Insomnia:
1. Create a POST request to: `https://abc123.ngrok.io/api/campaigns/generation-webhook`
2. Use the payload format from section 3
3. Check response

#### Common Issues:

**Issue: ngrok URL changes on restart**
- **Solution:** Use ngrok with a static domain (requires paid plan) or update n8n workflow each time

**Issue: "Connection refused"**
- **Solution:** Make sure backend is running on port 3002 and ngrok is forwarding to it

**Issue: "404 Not Found"**
- **Solution:** Check that the route is `/api/campaigns/generation-webhook` (not `/generation-webhook`)

**Issue: "No drafts found with job_id"**
- **Solution:** Make sure you triggered generation from frontend first, so drafts exist with that job_id

### Step 6: Simulate n8n Response (Without n8n)

If you want to test without waiting for n8n, you can simulate the callback:

```bash
# First, trigger generation from frontend to create drafts
# Then simulate n8n callback:

curl -X POST http://localhost:3002/api/campaigns/generation-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_11_YOUR_ACTUAL_JOB_ID",
    "pages": [
      {
        "Primary Keyword": "YOUR_PRIMARY_KEYWORD",
        "Html Content": "<h1>Test Content</h1><p>This is a test page generated for testing purposes.</p>",
        "Title": "Test Page Title",
        "Meta Description": "This is a test meta description",
        "slug": "test-page-slug",
        "Featured Image": "{\"wp_id\":\"http://example.com/image.png\"}"
      }
    ]
  }'
```

**To find your actual job_id:**
1. Check backend logs when you trigger generation
2. Or check the database: `SELECT * FROM WordpressPublishLog WHERE status = 'generating'`
3. Look at the `response` JSON field for `jobId`

### Step 7: Verify in Database

Check if drafts were updated:

```sql
-- Check drafts with job_id
SELECT id, "primaryKeyword", title, status, response->>'jobId' as job_id
FROM "WordpressPublishLog"
WHERE response->>'jobId' = 'job_11_YOUR_JOB_ID';

-- Check if HTML content was saved
SELECT id, "primaryKeyword", response->>'htmlContent' as html_content
FROM "WordpressPublishLog"
WHERE response->>'htmlContent' IS NOT NULL;
```

### Quick Test Script

Create a test script `test-webhook.sh`:

```bash
#!/bin/bash

# Configuration
NGROK_URL="https://abc123.ngrok.io"  # Update this
JOB_ID="job_11_test_$(date +%s)"
PRIMARY_KEYWORD="test keyword"

echo "Testing webhook with job_id: $JOB_ID"

curl -X POST "$NGROK_URL/api/campaigns/generation-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"job_id\": \"$JOB_ID\",
    \"pages\": [
      {
        \"Primary Keyword\": \"$PRIMARY_KEYWORD\",
        \"Html Content\": \"<h1>Test Page</h1><p>Generated at $(date)</p>\",
        \"Title\": \"Test Page Title\",
        \"Meta Description\": \"Test description\",
        \"slug\": \"test-page\"
      }
    ]
  }"

echo -e "\n\nResponse received!"
```

Make it executable and run:
```bash
chmod +x test-webhook.sh
./test-webhook.sh
```

---

## Summary

1. **Backend sends to n8n:** Payload with `job_id`, pillar page config, sub-pages config, brand, WordPress credentials
2. **n8n processes:** Generates content for all pages (~3 min per page)
3. **n8n calls back:** POST to `/api/campaigns/generation-webhook` with `job_id` and array of generated pages
4. **Backend matches:** Uses `job_id` + `Primary Keyword` to match pages to drafts
5. **Backend updates:** Saves HTML content to drafts and marks as completed
6. **Frontend polls:** Detects completed status and shows "View Page" buttons

