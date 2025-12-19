#!/bin/bash

# Local Webhook Testing Script
# This script helps you test the generation webhook endpoint locally

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== N8N Webhook Local Testing ===${NC}\n"

# Configuration
BACKEND_URL="${1:-http://localhost:3002}"
JOB_ID="${2:-job_11_test_$(date +%s)}"
PRIMARY_KEYWORD="${3:-test keyword}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Backend URL: $BACKEND_URL"
echo "  Job ID: $JOB_ID"
echo "  Primary Keyword: $PRIMARY_KEYWORD"
echo ""

# Test payload
PAYLOAD=$(cat <<EOF
{
  "job_id": "$JOB_ID",
  "pages": [
    {
      "Primary Keyword": "$PRIMARY_KEYWORD",
      "Html Content": "<h1>Test Page</h1><p>This is a test page generated at $(date).</p><h2>Test Section</h2><p>This content is for testing the webhook endpoint.</p>",
      "Title": "Test Page Title - $(date +%H:%M:%S)",
      "Meta Description": "This is a test meta description for webhook testing",
      "slug": "test-page-$(date +%s)",
      "Featured Image": "{\"wp_id\":\"http://example.com/test-image.png\"}"
    }
  ]
}
EOF
)

echo -e "${YELLOW}Sending test request...${NC}\n"

# Send request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/campaigns/generation-webhook" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Split response and status code
HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)

echo -e "${YELLOW}Response Status:${NC} $HTTP_STATUS"
echo -e "${YELLOW}Response Body:${NC}"
echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"
echo ""

# Check result
if [ "$HTTP_STATUS" -eq 200 ]; then
  echo -e "${GREEN}✅ Webhook test successful!${NC}"
  echo -e "${GREEN}Check your database for the updated draft with job_id: $JOB_ID${NC}"
else
  echo -e "${RED}❌ Webhook test failed with status: $HTTP_STATUS${NC}"
  echo -e "${YELLOW}Make sure:${NC}"
  echo "  1. Backend is running on $BACKEND_URL"
  echo "  2. The endpoint /api/campaigns/generation-webhook exists"
  echo "  3. A draft exists with job_id: $JOB_ID (or it will match by keyword)"
fi

echo ""
echo -e "${YELLOW}Usage:${NC}"
echo "  ./test-webhook-local.sh [backend_url] [job_id] [primary_keyword]"
echo ""
echo -e "${YELLOW}Examples:${NC}"
echo "  ./test-webhook-local.sh"
echo "  ./test-webhook-local.sh http://localhost:3002"
echo "  ./test-webhook-local.sh https://abc123.ngrok.io job_11_1234567890 'expert witness'"







