# Security and secret handling

`Copilot Brain` is currently an **experimental** Home Assistant add-on. Treat this repository as public-by-default and keep secrets out of git.

## Never commit

- `.env` files with real values
- GitHub App private keys
- installation tokens, bearer tokens, or API keys
- Home Assistant Supervisor tokens
- runtime files under `/data/` or `copilot_brain/.data/`
- certificate and key artifacts such as `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.crt`

## Safe workflows

- Use `.env.example` as a placeholder template for local development.
- Configure production secrets through the built-in Copilot Brain UI and/or Home Assistant secret facilities, not in tracked files.
- Review diffs before every commit.
- Rotate any secret immediately if it was accidentally written to a tracked file or pushed to a remote.

## Repository publishing rules

- Keep the repository marked as **experimental / in progress** until the add-on is production-ready.
- Do not publish prefilled credentials, example private keys, or copied runtime snapshots.
- Treat approval and audit data as runtime artifacts, not repository content.

If a secret ever lands in git history, assume compromise and rotate it. Git has a long memory and a very dry sense of humor.