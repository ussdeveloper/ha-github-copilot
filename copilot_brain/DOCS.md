# Copilot Brain

> Version `0.4.5`  
> Stage: **experimental / in progress**

Copilot Brain adds a GitHub-backed operator console to Home Assistant. It provides:

- a **top menu bar** (File menu with Settings),
- a **chat panel** powered by GitHub Models (AI assistant),
- a **draggable resize handle** between panels,
- a **log panel** with Terminal and Output tabs at the bottom,
- a **predefined commands** menu for quick HA operations,
- a **status bar** showing connection/version info,
- **GitHub OAuth Device Flow** authorization from the UI,
- configurable GitHub App credentials and GitHub Models selection,
- guarded Home Assistant actions with approval flow,
- an MCP endpoint for GitHub Copilot integrations.

## Installing from the repository

1. Add `https://github.com/ussdeveloper/ha-github-copilot` as a custom add-on repository in Home Assistant.
2. Install **Copilot Brain** from the add-on store.
3. Start the add-on and open the Ingress UI.
4. All configuration is done from the UI: **File → Settings**.

The add-on builds from repository source, which is intentional while the project is still experimental.

> **Note:** There are no configuration options on the HA add-on settings page. Everything is managed from the built-in web UI.

## UI layout

The interface follows a VS Code–inspired dark theme:

| Area | Description |
|------|-------------|
| **Menu bar** | File menu with Settings dialog |
| **Chat panel** | AI chat powered by GitHub Models; supports slash commands |
| **Resize handle** | Drag to adjust chat / log panel split |
| **Log panel** | Tabs: **Terminal** (HA command console) and **Output** (system logs) |
| **Status bar** | Version, stage, connection indicators |

### Predefined commands

Click the **⌘ Commands** button above the terminal to access quick-fire commands grouped by category:

- **System** — `system`, `host`, `network`, `hardware`
- **Logs** — `logs core`, `logs supervisor`
- **Home Assistant** — `entities`, `addons`, `nodered`, `context`
- **Tools** — `approvals`, `audit`, `models`, `github`, `config`, `status`

## Configuration

All settings are managed from **File → Settings** in the Copilot Brain UI. There are no HA add-on configuration options.

### GitHub authorization

Two methods are available:

1. **OAuth Device Flow** (recommended) — enter your GitHub Client ID, click Authorize, and enter the code at `github.com/login/device`. The token is saved automatically.
2. **Manual GitHub App** — provide `App ID`, `Installation ID`, and `Private Key (PEM/base64)` in the settings form.

### AI model

- `Model` — model id such as `openai/gpt-4.1` (default)

### Safety controls

- `Approval mode` — `explicit` (requires approval for mutations) or `read-only`
- `Entity allowlist` — entities the assistant may operate on
- `Service allowlist` — services the assistant may call (29 defaults included: light, switch, script, scene, climate, cover, fan, media_player, automation, input_boolean)
- `Addon allowlist` — add-ons the assistant may inspect/use
- `System prompt` — system prompt template injected into GitHub Models chat

### MCP

- `MCP token` — bearer token required for the `/mcp` endpoint

## Home Assistant terminal

The terminal is a **safe command console**, not a raw shell. Supported commands:

### Basic
- `help` — show available commands
- `status` — service & connection status
- `clear` — clear terminal output

### Home Assistant
- `entities [limit]` — list entities
- `entity <entity_id>` — inspect single entity
- `context` — entities & addons summary
- `addons` — list installed add-ons
- `nodered` — Node-RED addon status
- `service <domain.service> <entity_id> {json}` — call a service

### System
- `system` — Supervisor info
- `host` — Host/OS details
- `network` — network interfaces
- `hardware` — hardware info
- `logs core [lines]` — HA Core logs
- `logs supervisor [lines]` — Supervisor logs
- `logs <addon_slug> [lines]` — add-on logs
- `stats <addon_slug>` — add-on resource stats

### Tools
- `approvals` — list pending approvals
- `approve <id>` — approve pending action
- `reject <id>` — reject pending action
- `audit [limit]` — show audit log
- `models` — available AI models
- `github` — GitHub connection info
- `config` — current config (redacted)

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
