#!/bin/bash
# Houdt het Supabase-project actief (voorkomt automatische pauzering op het gratis plan).
DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$DIR/.env"; set +a
code=$(curl -s -o /dev/null -w '%{http_code}' \
  "$VITE_SUPABASE_URL/rest/v1/game_sessions?select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY")
echo "$(date '+%F %T') HTTP $code"
