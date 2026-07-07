#!/bin/bash
# Sanity check for the three public services. Run this ON the Pi, after
# docker compose up -d, from anywhere (uses localhost, not the tunnel).
#
# Usage: ./check.sh

set -u

check() {
    local name="$1"
    local url="$2"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url")
    if [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then
        echo "OK    $name ($url) -> HTTP $code"
    else
        echo "FAIL  $name ($url) -> HTTP $code"
    fi
}

check "web (portfolio)"   "http://localhost:8641/"
check "rag (streamlit)"   "http://localhost:8501/_stcore/health"
check "metabase"          "http://localhost:3000/api/health"
