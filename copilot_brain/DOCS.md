# Copilot Brain

> Version `0.3.0`  
> Stage: **experimental / in progress**

Copilot Brain adds a GitHub-backed operator console to Home Assistant. In this iteration it provides:

- an Ingress UI with **chat on top**,
- a **Home Assistant terminal** panel at the bottom,
- a left-hand feature menu for future modules,
- configurable GitHub App credentials and GitHub Models selection,
- guarded Home Assistant actions with approval flow,
- an MCP endpoint for GitHub Copilot integrations.

## Installing from the repository

1. Add `https://github.com/ussdeveloper/ha-github-copilot` as a custom add-on repository in Home Assistant.
2. Install **Copilot Brain** from the add-on store.
3. Start the add-on and open the Ingress UI.
4. Configure GitHub App settings and safety allowlists.

The add-on builds from repository source, which is intentional while the project is still experimental.

## Configuration

### GitHub App settings

- `github_app_id` — GitHub App identifier
- `github_app_installation_id` — installation identifier for the target owner
- `github_app_private_key` — PEM private key or base64-encoded PEM value
- `github_model` — model id such as `openai/gpt-4.1`

### Safety controls

- `approval_mode` — `explicit` or `read-only`
- `entity_allowlist` — entities the assistant may operate on
- `service_allowlist` — services the assistant may call
- `addon_allowlist` — add-ons the assistant may inspect/use
- `system_prompt_template` — system prompt template injected into GitHub Models chat

### MCP

- `mcp_auth_token` — bearer token required for `/mcp`

## Home Assistant terminal

The terminal is a **safe command console**, not a raw shell. Supported commands include:

- `help`
- `status`
- `entities [limit]`
- `entity <entity_id>`
- `addons`
- `nodered`
- `service <domain.service> <entity_id> {json}`
- `approvals`
- `approve <approval_id>`
- `reject <approval_id>`
- `audit [limit]`
- `models`
- `github`
- `clear`

Mutating service calls still respect allowlists and approval mode.

## Secret handling

Do **not** commit real secrets to the repository. In particular, keep the following out of git:

- GitHub App private keys
- `.env` files with real values
- Home Assistant runtime data under `/data` or `.data`
- generated audit / approval snapshots

See the repository-level `SECURITY.md` for publishing rules.

## Notes

This project is intentionally marked **experimental**. Authentication, model access, and Home Assistant integrations are working, but production hardening and richer automations are still being iterated.
