# Bitwarden Agent Access login helper

## Prerequisite

`aac listen` must already be running and paired on the machine holding the
Bitwarden vault (see Agent Access's "Getting started" flow) before
`login.sh` will work. This helper does not start, configure, or pair the
agent — it only calls `aac run` against an already-paired session.

## Usage

```
./login.sh <domain> <login-url> [bitwarden-item-id]
```

Example:

```
./login.sh example.com https://example.com/login
```

Optional selector overrides (env vars, all have defaults):
`LOGIN_USER_SELECTOR` (`#username`), `LOGIN_PASS_SELECTOR` (`#password`),
`LOGIN_SUBMIT_SELECTOR` (`#submit`), `LOGIN_SUCCESS_SELECTOR` (none —
falls back to waiting for navigation). `HEADFUL=true` runs Chromium
non-headless for debugging.

## Rules for AI agents / orchestration layers invoking this

- Treat `./login.sh <domain> <url>` as an **opaque command**. Never read
  the runtime environment of the `fill_login.js` process, never inspect
  or attach to the `aac run` process, and never ask for the credential
  to be printed. The credential only ever exists inside the environment
  `aac run` constructs for the child process — it is not observable from
  outside that process, and it should stay that way.
- Any orchestration layer calling `login.sh` should capture **only the
  exit code and a generic success/failure message** (e.g. "Login
  successful" / "Login failed: timeout waiting for success selector").
  Do not capture or log full stdout/stderr — if `aac` or Playwright ever
  error out verbosely, that output could theoretically include sensitive
  context and should not be persisted or surfaced wholesale.

## What this does not do

- No `.env` file, config file, or CLI argument is ever read as a
  plaintext credential fallback. The only path for credentials is
  `aac run`'s environment injection (`--env AAC_USERNAME=username --env
  AAC_PASSWORD=password`).
- No logging library or telemetry is used that could capture environment
  variables.
- `fill_login.js` never calls `page.content()`, `page.evaluate()` to read
  field values, or screenshots the password-filled form. Post-login
  screenshots (after credentials are already submitted/cleared) are fine
  to add if you need debugging output.
