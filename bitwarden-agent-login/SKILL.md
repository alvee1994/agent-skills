---
name: bitwarden-agent-login
description: Log into a website using Bitwarden Agent Access (aac) so credentials are injected straight into a child process and never seen by the calling agent, printed to stdout, or written to disk. Use when asked to log in / fill a login form for a site using Bitwarden-stored credentials.
---

# Bitwarden Agent Access login

Use `login.sh` as an opaque command to log into a site with credentials
stored in Bitwarden, via Agent Access (`aac`).

```
./login.sh <domain-or-vault-domain> <login-url> [bitwarden-item-id]
```

Requires `aac listen` already running/paired on the vault machine.

Full rules for how an agent must (and must not) interact with this — never
inspect the child process's environment, never request the credential be
printed, capture only exit code + generic message — are in `README-login.md`.
Read that before invoking `login.sh`.

Files:
- `fill_login.js` — Playwright script; reads `LOGIN_URL`, `AAC_USERNAME`,
  `AAC_PASSWORD` from env only, never logs/writes credential values.
- `login.sh` — wraps `aac run ... -- env LOGIN_URL=... node fill_login.js`.
- `README-login.md` — operational + security rules for agents.
- `package.json` — declares the `playwright` dependency.
