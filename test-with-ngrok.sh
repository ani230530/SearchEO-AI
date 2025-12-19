#!/bin/bash
# Test webhook with ngrok URL

if [ -z "$1" ]; then
  echo "Usage: ./test-with-ngrok.sh <ngrok-url>"
  echo "Example: ./test-with-ngrok.sh https://abc123.ngrok.io"
  exit 1
fi

NGROK_URL="$1"
JOB_ID="job_11_test_$(date +%s)"

echo "Testing webhook at: $NGROK_URL/api/campaigns/generation-webhook"
echo "Job ID: $JOB_ID"
echo ""

curl -X POST "$NGROK_URL/api/campaigns/generation-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"job_id\": \"$JOB_ID\",
    \"pages\": [
      {
        \"Primary Keyword\": \"test keyword\",
        \"Html Content\": \"<h1>Test Page</h1><p>Generated via ngrok at $(date)</p>\",
        \"Title\": \"Test Page Title\",
        \"Meta Description\": \"Test description\",
        \"slug\": \"test-page\"
      }
    ]
  }" \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "✅ If you see HTTP Status: 200, the webhook is accessible via ngrok!"
