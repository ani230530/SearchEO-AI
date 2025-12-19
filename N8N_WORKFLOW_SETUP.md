# N8N Workflow Setup Guide

## Quick Reference

**Backend URL:** `https://seo-gpt-efl0.onrender.com`  
**Webhook Endpoint:** `https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook`  
**Local Testing (ngrok):** `https://unhazarding-elfrieda-decadally.ngrok-free.dev/api/campaigns/generation-webhook`

**Required Changes:**
1. Extract `job_id` and `callback_url` from input payload
2. After generating all pages, add HTTP Request node to call webhook
3. Send `job_id` + array of `pages` with `Primary Keyword` and `Html Content`

---

## Overview
This document explains the changes required in your n8n workflow to support topic-level content generation for campaigns. The workflow needs to call back to our backend when generation is complete.

---

## Current Workflow Behavior

Your workflow currently:
1. Receives a webhook request with campaign/page configuration
2. Generates content for multiple pages (pillar + sub-pages)
3. Takes ~3 minutes per page (e.g., 9 minutes for 3 pages)
4. Returns the response in the original HTTP request

---

## Required Changes

### Change 1: Extract `job_id` and `callback_url` from Input

The backend now sends additional fields in the payload:
- `job_id`: Unique identifier (e.g., `job_11_1765126226932`)
- `callback_url`: URL to call back when done (e.g., `https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook`)

**Action:** Store these values in n8n variables/nodes for later use.

---

### Change 2: Add HTTP Request Node to Call Back

After all pages are generated, add an **HTTP Request** node that calls the backend webhook.

#### Node Configuration:

**Node Type:** HTTP Request

**Method:** `POST`

**URL:** 
```
{{ $json.callback_url }}
```
OR hardcode:
```
https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook
```

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
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
      "Primary Keyword": "{{ $json.sub_pillar_pages[0].primary_keyword }}",
      "Html Content": "{{ $json.sub_page_1_html_content }}",
      "Title": "{{ $json.sub_page_1_title }}",
      "Meta Description": "{{ $json.sub_page_1_meta_description }}",
      "slug": "{{ $json.sub_page_1_slug }}",
      "Featured Image": "{{ $json.sub_page_1_featured_image }}"
    },
    {
      "Primary Keyword": "{{ $json.sub_pillar_pages[1].primary_keyword }}",
      "Html Content": "{{ $json.sub_page_2_html_content }}",
      "Title": "{{ $json.sub_page_2_title }}",
      "Meta Description": "{{ $json.sub_page_2_meta_description }}",
      "slug": "{{ $json.sub_page_2_slug }}",
      "Featured Image": "{{ $json.sub_page_2_featured_image }}"
    }
  ]
}
```

**Note:** Adjust the array based on how many sub-pages you're generating. The `pages` array should include:
- 1 pillar page (first item)
- N sub-pages (remaining items)

---

## Input Payload Structure

Your workflow will receive this payload from the backend:

```json
{
  "user_id": "user_123",
  "campaign_name": "Expert Witness Cluster",
  "job_id": "job_11_1765126226932",
  "callback_url": "https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook",
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
    "brand_description": "Comprehensive Domain Analysis..."
  },
  "wordpress": {
    "username": "admin",
    "password": "decrypted_password",
    "url": "https://legalexperts.ai/"
  }
}
```

---

## Output Payload Structure (What to Send Back)

After generating all pages, send this to the callback URL:

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
      "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/...\"}"
    },
    {
      "Primary Keyword": "analyst expert witness",
      "Html Content": "<p>Analyst expert witnesses are critical...</p>",
      "Title": "Analyst Expert Witness | Definitive Guide to Roles and Selection",
      "Meta Description": "Discover the essential role of an analyst expert witness...",
      "slug": "analyst-expert-witness-guide",
      "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/...\"}"
    },
    {
      "Primary Keyword": "seo expert witness",
      "Html Content": "<p>A search engine optimization (SEO) expert witness...</p>",
      "Title": "SEO Expert Witness Guide | Roles, Qualifications, and Legal Impact",
      "Meta Description": "Explore the essential role, qualifications, and legal benefits...",
      "slug": "seo-expert-witness-guide",
      "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/...\"}"
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

---

## Required Fields

### For Each Page (REQUIRED):

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `job_id` / `Job Id` | ✅ Yes | Must match the `job_id` from input | `job_11_1765126226932` |
| `Primary Keyword` | ✅ Yes | Used to match page to draft | `"expert witness"` |
| `Html Content` | ✅ Yes | Generated HTML content | `"<p>Content...</p>"` |
| `Title` | ⚠️ Recommended | Page title | `"Expert Witness | Definition..."` |
| `Meta Description` | ⚠️ Recommended | SEO meta description | `"Learn what an expert witness is..."` |
| `slug` | ⚠️ Recommended | URL slug | `"expert-witness-services"` |
| `Featured Image` | ⚠️ Optional | Featured image JSON/URL | `"{\"wp_id\":\"http://...\"}"` |

**Important:**
- `job_id` must be included (in the object or first page)
- `Primary Keyword` must match exactly what was sent in the input
- `Html Content` is required for the page to be marked as completed

---

## Workflow Steps

### Current Workflow:
```
1. Webhook Trigger (receives payload)
2. Generate Pillar Page Content
3. Generate Sub-Page 1 Content
4. Generate Sub-Page 2 Content
5. ... (more sub-pages)
6. Return Response (THIS NEEDS TO CHANGE)
```

### Updated Workflow:
```
1. Webhook Trigger (receives payload)
   └─ Extract: job_id, callback_url
   
2. Generate Pillar Page Content
   └─ Store: Primary Keyword, Html Content, Title, etc.
   
3. Generate Sub-Page 1 Content
   └─ Store: Primary Keyword, Html Content, Title, etc.
   
4. Generate Sub-Page 2 Content
   └─ Store: Primary Keyword, Html Content, Title, etc.
   
5. ... (more sub-pages)
   
6. Aggregate All Pages
   └─ Combine pillar + all sub-pages into array
   
7. HTTP Request - Call Backend Webhook (NEW)
   └─ POST to callback_url
   └─ Send: { job_id, pages: [...] }
   
8. Return Success Response (Optional)
   └─ Can return immediately after calling webhook
```

---

## Backend URLs

### Production Backend:
```
https://seo-gpt-efl0.onrender.com
```

### Webhook Endpoint:
```
https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook
```

### Local Development (ngrok):
```
https://unhazarding-elfrieda-decadally.ngrok-free.dev/api/campaigns/generation-webhook
```

**Note:** Use the production URL for the final workflow. The ngrok URL is only for local testing.

---

## Example n8n Node Configuration

### HTTP Request Node (Call Back)

**Settings:**
- **Method:** POST
- **URL:** `https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook`
- **Authentication:** None
- **Send Headers:** Yes
  - `Content-Type: application/json`
- **Send Body:** Yes
- **Body Content Type:** JSON

**Body (JSON):**
```json
{
  "job_id": "{{ $('Set Variables').item.json.job_id }}",
  "pages": [
    {
      "Primary Keyword": "{{ $('Generate Pillar').item.json.primary_keyword }}",
      "Html Content": "{{ $('Generate Pillar').item.json.html_content }}",
      "Title": "{{ $('Generate Pillar').item.json.title }}",
      "Meta Description": "{{ $('Generate Pillar').item.json.meta_description }}",
      "slug": "{{ $('Generate Pillar').item.json.slug }}",
      "Featured Image": "{{ $('Generate Pillar').item.json.featured_image }}"
    },
    {
      "Primary Keyword": "{{ $('Generate Sub-Page 1').item.json.primary_keyword }}",
      "Html Content": "{{ $('Generate Sub-Page 1').item.json.html_content }}",
      "Title": "{{ $('Generate Sub-Page 1').item.json.title }}",
      "Meta Description": "{{ $('Generate Sub-Page 1').item.json.meta_description }}",
      "slug": "{{ $('Generate Sub-Page 1').item.json.slug }}",
      "Featured Image": "{{ $('Generate Sub-Page 1').item.json.featured_image }}"
    }
  ]
}
```

**Note:** Adjust node names and field names based on your actual n8n workflow structure.

---

## Testing

### Test the Webhook Endpoint:

```bash
curl -X POST https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook \
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

---

## Important Notes

1. **Don't wait for the original request to complete** - The backend times out after 60 seconds, but n8n takes ~9 minutes. This is expected.

2. **Call the webhook asynchronously** - After generating all pages, call the webhook endpoint. You don't need to wait for a response.

3. **Order matters** - The first page in the `pages` array should be the pillar page, followed by sub-pages in order.

4. **Primary Keyword must match** - The `Primary Keyword` in the output must exactly match what was sent in the input for proper draft matching.

5. **job_id is critical** - Without `job_id`, the backend will try to match by Primary Keyword only, which is less reliable.

---

## Troubleshooting

### Issue: Webhook returns 400 error
**Solution:** Check that:
- `job_id` is included in the payload
- `pages` is an array (not a single object)
- Each page has `Primary Keyword` and `Html Content`

### Issue: Backend can't match pages to drafts
**Solution:** 
- Verify `job_id` matches the original request
- Verify `Primary Keyword` matches exactly (case-sensitive)
- Check backend logs for matching attempts

### Issue: Frontend shows "Generating" forever
**Solution:**
- Verify webhook was called successfully (check backend logs)
- Verify drafts were updated with `htmlContent` in the database
- Check that `job_id` in webhook matches the `job_id` from the original request

---

## Summary

**What Changed:**
- Backend now sends `job_id` and `callback_url` in the payload
- Backend expects n8n to call back via webhook (not return in original request)
- Webhook endpoint: `https://seo-gpt-efl0.onrender.com/api/campaigns/generation-webhook`

**What You Need to Do:**
1. Extract `job_id` and `callback_url` from input
2. After generating all pages, call the webhook endpoint
3. Send `job_id` and array of `pages` with required fields
4. Each page must include `Primary Keyword` and `Html Content`

**Result:**
- Backend will match pages to drafts using `job_id` + `Primary Keyword`
- Frontend will automatically detect completed pages via polling
- Users will see "View Page" buttons when generation completes

