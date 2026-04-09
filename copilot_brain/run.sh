#!/usr/bin/with-contenv bashio
set -euo pipefail

export PORT=8099
export MCP_PORT=8099
export HA_SUPERVISOR_URL="http://supervisor"
export HA_CORE_URL="http://supervisor/core/api"
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN:-}"

unset GITHUB_APP_ID
unset GITHUB_APP_INSTALLATION_ID
unset GITHUB_APP_PRIVATE_KEY_BASE64
unset GITHUB_CLIENT_ID
unset GITHUB_OAUTH_TOKEN
unset GITHUB_MODELS_DEFAULT_MODEL
unset MCP_AUTH_TOKEN
unset APPROVAL_MODE
unset SYSTEM_PROMPT_TEMPLATE

cd /opt/copilot-brain/app
exec node dist/server.js
