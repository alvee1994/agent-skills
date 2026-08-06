#!/usr/bin/env bash
#
# Usage:
#   ./login.sh <domain> <login-url>
#   ./login.sh <domain> <login-url> <bitwarden-item-id>
#
# Fetches credentials via Bitwarden Agent Access (`aac run`) and injects them
# directly into fill_login.js's environment as AAC_USERNAME / AAC_PASSWORD.
# This script never echoes, logs, or exports the fetched credential values.

set -euo pipefail

DOMAIN="${1:-}"
LOGIN_URL="${2:-}"
ITEM_ID="${3:-}"

if [[ -z "$DOMAIN" || -z "$LOGIN_URL" ]]; then
  echo "Usage: $0 <domain> <login-url> [bitwarden-item-id]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "$ITEM_ID" ]]; then
  exec aac run --id "$ITEM_ID" --env AAC_USERNAME=username --env AAC_PASSWORD=password -- \
    env LOGIN_URL="$LOGIN_URL" node "$SCRIPT_DIR/fill_login.js"
else
  exec aac run --domain "$DOMAIN" --env AAC_USERNAME=username --env AAC_PASSWORD=password -- \
    env LOGIN_URL="$LOGIN_URL" node "$SCRIPT_DIR/fill_login.js"
fi
