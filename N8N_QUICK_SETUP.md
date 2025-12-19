# N8N Workflow - Quick Setup Guide

## What You Need to Do

After generating all pages, add an **HTTP Request** node to call back to our backend.

---

## Backend URLs

**Production:** `https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook`  
**Local Testing:** `https://unhazarding-elfrieda-decadally.ngrok-free.dev/api/campaigns/generation-webhook`

---

## Input (What You Receive)

Your workflow receives:
```json
{
  "job_id": "job_11_1765126226932",  // ← IMPORTANT: Save this!
  "callback_url": "https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook",
  "pillar_page": { "primary_keyword": "...", ... },
  "sub_pillar_pages": [ { "primary_keyword": "...", ... }, ... ],
  ...
}
```

**Extract and save:** `job_id` and `callback_url`

---

## Output (What to Send Back)

After generating all pages, POST to the callback URL:

```json
{
  "job_id": "job_11_1765126226932",  // ← Must match input
  "pages": [
    {
      "Primary Keyword": "expert witness",  // ← Must match input
      "Html Content": "<p>Generated content...</p>",  // ← REQUIRED
      "Title": "Expert Witness | Definition...",
      "Meta Description": "Learn what an expert witness is...",
      "slug": "expert-witness-services",
      "Featured Image": "{\"wp_id\":\"http://...\"}"
    },
    {
      "Primary Keyword": "analyst expert witness",
      "Html Content": "<p>Generated content...</p>",
      "Title": "Analyst Expert Witness | Guide...",
      "Meta Description": "...",
      "slug": "analyst-expert-witness-guide",
      "Featured Image": "..."
    }
    // ... more sub-pages
  ]
}
```

**Order:** First page = pillar page, rest = sub-pages

---

## HTTP Request Node Configuration

**Method:** `POST`  
**URL:** `https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook`  
**Headers:** `Content-Type: application/json`  
**Body:** JSON (see Output format above)

---

## Required Fields Per Page

| Field | Required | Notes |
|-------|----------|-------|
| `job_id` | ✅ Yes | Include in root object |
| `Primary Keyword` | ✅ Yes | Must match input exactly |
| `Html Content` | ✅ Yes | The generated HTML |
| `Title` | ⚠️ Recommended | Page title |
| `Meta Description` | ⚠️ Recommended | SEO description |
| `slug` | ⚠️ Recommended | URL slug |
| `Featured Image` | ⚠️ Optional | Image JSON/URL |

---

## Workflow Structure

```
1. Webhook Trigger
   └─ Extract: job_id, callback_url
   
2. Generate Pillar Page
   └─ Store: Primary Keyword, Html Content, Title, etc.
   
3. Generate Sub-Page 1
   └─ Store: Primary Keyword, Html Content, Title, etc.
   
4. Generate Sub-Page 2
   └─ Store: Primary Keyword, Html Content, Title, etc.
   
5. Aggregate All Pages
   └─ Combine into: { job_id, pages: [...] }
   
6. HTTP Request - Call Webhook ⭐ NEW
   └─ POST to callback_url
   └─ Send aggregated pages
```

---

## Example n8n Expression

**Body (JSON):**
```json
{
  "job_id": "{{ $json.job_id }}",
  "pages": [
    {
      "Primary Keyword": "{{ $('Generate Pillar').item.json.primary_keyword }}",
      "Html Content": "{{ $('Generate Pillar').item.json.html_content }}",
      "Title": "{{ $('Generate Pillar').item.json.title }}",
      "Meta Description": "{{ $('Generate Pillar').item.json.meta_description }}",
      "slug": "{{ $('Generate Pillar').item.json.slug }}",
      "Featured Image": "{{ $('Generate Pillar').item.json.featured_image }}"
    }
    // Add sub-pages similarly
  ]
}
```

---

## Testing

Test the webhook:
```bash
curl -X POST https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_11_test",
    "pages": [{
      "Primary Keyword": "test",
      "Html Content": "<p>Test</p>",
      "Title": "Test",
      "Meta Description": "Test",
      "slug": "test"
    }]
  }'
```

**Expected:** `{"success":true,"message":"Processed 1 pages"}`

---

## Key Points

✅ **Must include `job_id`** - Backend uses it to match pages to drafts  
✅ **Primary Keyword must match** - Exact match required (case-sensitive)  
✅ **Html Content is required** - Without it, page won't be marked complete  
✅ **Call webhook after ALL pages generated** - Not per page, all at once  
✅ **Order matters** - First = pillar, rest = sub-pages

---

## That's It!

Add the HTTP Request node after generation completes, send the payload, and you're done. The backend handles the rest.

