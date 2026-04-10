# Home Assistant GitHub Copilot Add-on Repository

> **Version:** `0.4.6`
>
> **Status:** experimental / in progress — safe to explore, not ready to call “done”.

This repository contains `Copilot Brain`, a Home Assistant add-on that exposes a GitHub-powered assistant with a Home Assistant-aware chat panel, guarded tool execution, MCP connectivity, and an operator-style UI.

## What is in here

- `copilot_brain/` — the main Home Assistant add-on
- `repository.yaml` — metadata required by Home Assistant custom add-on repositories
- `SECURITY.md` — repository publishing and secret-handling rules
- `.env.example` — safe local-development placeholder configuration

## Install from a Home Assistant custom repository

1. Open **Settings → Add-ons → Add-on Store** in Home Assistant.
2. Open the **Repositories** dialog.
3. Add the repository URL:
	- `https://github.com/ussdeveloper/ha-github-copilot`
4. Refresh the store and install **Copilot Brain**.
5. Start the add-on and open its **Web UI** — all configuration is done from there.

The add-on is intentionally configured to build **from repository source** instead of pulling a prebuilt registry image. That makes iteration easier while the project is still experimental.

## Current focus

- **Zero config.yaml** — no add-on options; everything is configured from the built-in UI
- **GitHub OAuth Device Flow** — authorize GitHub from the UI (File → Settings → Authorize)
- Ingress UI with **chat on top** and **Home Assistant terminal at the bottom**
- GitHub App authentication and GitHub Models access
- Approval queue plus audit log for mutating actions
- MCP endpoint for GitHub Copilot and future integrations
- Predefined commands system for quick AI-powered actions

## Secret hygiene — seriously, no gremlins in git

Do **not** commit any of the following to the repository:

- real `.env` files
- GitHub App private keys / PEM files
- access tokens or bearer tokens
- Home Assistant runtime data from `/data/` or `copilot_brain/.data/`
- exported certificates, key stores, or local secret snapshots

Use `.env.example` as the template for local development and read `SECURITY.md` before publishing changes.

## Local development

1. Copy `.env.example` to `.env`.
2. Fill in placeholder values locally only.
3. Open the workspace in VS Code.
4. If you use the included container workflow, reopen in the dev container.
5. Build the backend from `copilot_brain/app` and start the service.

## Status

This repository is intentionally marked **experimental** and **work in progress**. Features, layout, supported commands, and configuration may still evolve between iterations.
