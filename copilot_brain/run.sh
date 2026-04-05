#!/usr/bin/with-contenv bashio
set -euo pipefail

export PORT=8099
export MCP_PORT=8099
export HA_SUPERVISOR_URL="http://supervisor"
export HA_CORE_URL="http://supervisor/core/api"
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN:-}"

export GITHUB_APP_ID="$(bashio::config 'github_app_id')"
export GITHUB_APP_INSTALLATION_ID="$(bashio::config 'github_app_installation_id')"
export GITHUB_APP_PRIVATE_KEY_BASE64="$(bashio::config 'github_app_private_key')"
export GITHUB_MODELS_DEFAULT_MODEL="$(bashio::config 'github_model')"
export MCP_AUTH_TOKEN="$(bashio::config 'mcp_auth_token')"
export APPROVAL_MODE="$(bashio::config 'approval_mode')"
export SYSTEM_PROMPT_TEMPLATE="$(bashio::config 'system_prompt_template')"

cd /opt/copilot-brain/app
exec node dist/server.js
