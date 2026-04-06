# Changelog

All notable changes to the **Copilot Brain** Home Assistant add-on are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

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
