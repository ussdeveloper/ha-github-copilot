# Changelog

All notable changes to the **Copilot Brain** Home Assistant add-on are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [0.4.4] — 2026-04-09

### Changed
- Added a direct **GitHub access token** field in the UI, so GitHub Models can be configured without needing a Client ID or Device Flow.
- Added clear inline help explaining what **GitHub Client ID** is and where to find it in GitHub settings.

### Fixed
- `github_oauth_token` is now accepted by the settings API and saved from the UI correctly.
- Device Flow guidance now clearly tells the user to use a direct token if they do not have a GitHub App / OAuth App Client ID.

## [0.4.3] — 2026-04-09

### Fixed
- Replaced raw browser `Failed to fetch` errors with a clear message that Copilot Brain is temporarily unreachable or restarting.
- Network-related chat, terminal, settings, OAuth, and status refresh errors now show user-friendly diagnostics instead of generic fetch failures.

## [0.4.2] — 2026-04-09

### Fixed
- **Menu File/View now works correctly** — fixed click propagation and repaired malformed settings modal HTML that was breaking DOM interaction.
- **Terminal input is interactive again** — improved focus behavior and added command history navigation with Arrow Up / Arrow Down.
- **GitHub OAuth flow works from the UI** — the File → Authorize action now opens the OAuth section and starts the correct device flow instead of incorrectly running GitHub App auth test.
- **OAuth is now treated as a real auth mode** in `/api/github/status` and `/api/github/test-auth`, so the UI can validate GitHub access after device authorization.
- **Model selection from available models** — the settings UI now loads GitHub Models into a selectable list instead of requiring manual typing.

## [0.4.1] — 2026-04-09

### Fixed
- **Startup crash after zero-config migration** — the add-on no longer reads removed HA config keys via `bashio::config`, which previously produced `APPROVAL_MODE="null"` and crashed Zod validation.
- Legacy `null`, `"null"`, and invalid values in `/data/options.json` are now sanitized and safely ignored.
- Docker image metadata/version labels updated to `0.4.1` so Home Assistant can detect and rebuild the latest release correctly.

## [0.4.0] — 2026-04-09

### Changed
- **Zero config.yaml** — removed ALL `options:` and `schema:` from config.yaml. The add-on has no HA configuration page.
- All settings (GitHub credentials, OAuth, model, allowlists, MCP token, etc.) are configured entirely from the built-in UI (File → Settings).
- Default service allowlist (29 services) baked into the application code — works out of the box without any configuration.
- Translations simplified — no more configuration field descriptions.

### Removed
- All option fields from `config.yaml` (`github_app_id`, `github_app_installation_id`, `github_app_private_key`, `github_client_id`, `github_model`, `mcp_auth_token`, `approval_mode`, `system_prompt_template`, `entity_allowlist`, `service_allowlist`, `addon_allowlist`).
- HA add-on configuration schema — add-on settings page in HA will be empty by design.

## [0.3.3] — 2026-04-06

### Added
- **GitHub OAuth Device Flow** — authorize with GitHub from the UI. Enter Client ID, click Authorize, enter code at github.com/login/device. Token saved automatically.
- `github_client_id` configuration field for OAuth Device Flow.
- OAuth token as fallback for GitHub Models API (when GitHub App credentials are not configured).

### Fixed
- **Ingress CSS/JS loading** — all resource and API paths changed from absolute (`/styles.css`, `/api/...`) to relative for HA ingress proxy compatibility.
- All `fetch()` calls use computed API base URL to work behind ingress.

### Changed
- Settings modal reorganized: OAuth section on top, manual GitHub App credentials below.
- "Authorize SDK in GitHub" renamed to "Authorize GitHub (OAuth)" in menu.

## [0.3.2] — 2026-04-06

### Changed
- Wyłączenie trybu chronionego: dodano `hassio_role: manager`, `auth_api: true`, `host_network: true` — pełny dostęp do Supervisor API i sieci hosta.

## [0.3.1] — 2026-04-06

### Fixed
- Chat orchestrator null safety — tool lookup now returns proper error instead of crashing.
- MCP server fallback version updated from 0.2.1 to 0.3.0.

### Changed
- Default `service_allowlist` widened to include climate, cover, fan, media_player, automation, and input_boolean services.
- DOCS.md fully rewritten for v0.3.0 layout — documents terminal tabs, resize handle, predefined commands, all system commands.

### Added
- `icon.png` and `logo.png` for Home Assistant add-on store display.

## [0.3.0] — 2026-04-06

### Added
- **VS Code–style layout** matching UI.drawio: top menu → chat → resize handle → log panel with tabs → status bar.
- **Draggable resize bar** between chat and log panel (mouse drag to adjust proportions).
- **Panel tabs** in log area: Terminal and Output — switch via tabs or View menu.
- **Status bar** at the bottom with HA status, GitHub connection, selected model, and version.
- **View menu** with Terminal / Output tab switching.
- **Predefined Commands** system (File → Predefined Commands) — define custom prompt templates, execute them with one click, results returned to chat and output panel.
- **Supervisor API terminal commands**: `system`, `host`, `network`, `hardware`, `logs core|supervisor|<addon>`, `stats <addon>`.
- **CHANGELOG.md** for HA add-on repository version tracking.
- **GitHub custom agent** file (`.github/agents/ha-brain.agent.md`) enhanced with project governance rules.
- Ctrl+Enter to send chat messages.
- 30-second auto-refresh interval for status data.
- Output panel tab for command result logging.

### Changed
- Removed titlebar section — health info moved to menubar-right and status bar.
- Chat panel no longer has its own header — maximizes space per drawio spec.
- Terminal form simplified with icon buttons instead of text buttons.
- Status indicators moved from pills in menubar to status bar items.
- Help command now shows categorized command list with descriptions.
- Terminal history limit increased to 300 entries.

### Removed
- Quick command icon buttons from terminal header (replaced by tab actions and help command).
- Titlebar with version chip (version now in status bar).

## [0.2.1] — 2026-04-05

### Changed
- Minimal VS Code–style UI: sidebar removed, flat dark theme, MDI-only icons.
- Top menu bar with File (Settings, Authorize SDK in GitHub), disabled Edit/View/Run placeholders.
- Split layout: chat on top, terminal on bottom.

## [0.2.0] — 2026-04-05

### Added
- Initial release of Copilot Brain add-on.
- Express.js backend with GitHub Models API integration.
- Home Assistant Supervisor API client with entity/service/addon management.
- Chat panel with AI-powered responses.
- Guarded HA terminal with approval queue and audit log.
- MCP endpoint with bearer token authentication.
- GitHub App authentication flow.
- Docker containerization for HA add-on ecosystem.
- Multi-language translations (en, pl).
