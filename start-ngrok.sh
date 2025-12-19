#!/bin/bash
echo "Starting ngrok on port 3002..."
echo "After ngrok starts, copy the HTTPS URL and test with:"
echo "./test-with-ngrok.sh https://YOUR_NGROK_URL.ngrok-free.dev"
echo ""
ngrok http 3002
