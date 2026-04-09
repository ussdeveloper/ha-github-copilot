# Copilot Brain workspace instructions

## Documentation-first for GitHub and Copilot SDK

When work involves **GitHub OAuth**, **Copilot SDK**, **GitHub auth**, **tokens**, **model access**, or **login flows**:

- First fetch and read the latest official documentation from GitHub Docs before proposing or implementing changes.
- Start with: `https://docs.github.com/en/copilot/how-tos/copilot-sdk/set-up-copilot-sdk/github-oauth`
- Follow relevant linked official docs/repository docs when needed, especially for token flow, callback URLs, supported token types, backend services, and SDK setup.
- Treat the latest official docs as the source of truth because Copilot SDK is preview/public preview and behavior can change.
- If current code or prior assumptions conflict with official docs, update the plan and implementation to match the docs.

## Current GitHub OAuth constraints to remember

- Email is **not** a valid GitHub OAuth credential.
- Standard GitHub OAuth web flow requires a registered **GitHub App** or **OAuth App**, a valid **callback URL**, a **Client ID**, and **server-side token exchange** with **Client Secret**.
- GitHub **Device Flow** requires a valid **Client ID** and enabled device flow in the app settings.
- For Copilot SDK, supported token types should follow current docs; documented compatible examples include `gho_`, `ghu_`, and `github_pat_`.
- Token storage, refresh, and expiration handling are the application's responsibility, not the SDK's.

## Behavior expectation

Before coding GitHub/Copilot authentication changes, summarize the current documentation constraints in the task context and then implement accordingly.
