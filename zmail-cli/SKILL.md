---
name: zmail-cli
description: Read Zoho Mail via the local zmail-cli.jar (e.g. to fetch a 2FA/verification code from a recent email). Interactive-shell tool — needs a real pty and the user's local encryption password, so a human must unlock it once per session before an agent can drive it.
---

# Zoho Mail CLI (zmail-cli)

A local Java CLI/interactive-shell tool for Ahmed's Zoho Mail account. Not part of this repo — it's a standalone jar at `~/Downloads/zmail-cli.jar` on this machine, a local dependency, not something to copy in here.

```
java -jar ~/Downloads/zmail-cli.jar
```

Already set up on this machine — config lives at `~/.zmail-cli/` (`config.json`, `alias.json`, `settings.json`, `history`). Never read or dump the contents of that directory; `config.json` holds the encrypted OAuth refresh token. Treat it like any credential store — same principle as the `aac`/Bitwarden Agent Access skill this replaced.

## The pty problem (read before invoking)

Running the jar with no args drops straight into an **interactive shell** built on `jline`, and on launch it always prompts:

```
? Enter your encryption password (****)
```

That decrypts the locally-stored OAuth token — it is **not** the Zoho account password, and neither the agent nor any script should ever ask the user to type it into a chat message or an env var. It only exists to be typed at that live prompt, by the human, in a real terminal.

Running the jar through a tool without a real tty (e.g. Claude Code's Bash tool directly) **crashes** it:

```
WARNING: Unable to create a system terminal, creating a dumb terminal
? Enter your encryption password (****) Cannot invoke "...AbstractPrompt$InputValuePrompt$Operation.ordinal()" because "op" is null
```

Verified fix: allocate a real pty with `tmux` first, then the prompt renders cleanly and waits for input instead of crashing.

**Session naming: never use a predictable name like `zmail`.** If a session is ever left open, a predictable name makes it trivial for anything else on the machine to find and drive it. Generate a random 4-5 character alphanumeric name each time instead — short enough for the human to type back when attaching, random enough not to guess:

```bash
SESSION=$(tr -dc 'a-z0-9' < /dev/urandom | head -c5)
echo "$SESSION"   # tell the human this name
tmux new-session -d -s "$SESSION" "java -jar ~/Downloads/zmail-cli.jar"
tmux capture-pane -t "$SESSION" -p   # confirm the password prompt is showing
```

At that point **stop and ask the human to attach and type the password themselves**:

```bash
tmux attach -t "$SESSION"
```

They type the password, press Enter, then detach with **`Ctrl-b` then `d`** (two separate keypresses — Ctrl+b together, release, then d alone). Detaching leaves the process running; typing `exit` or closing the terminal instead kills it, and the session has to be recreated from the password prompt again.

Verify it actually unlocked before trusting it — the password prompt succeeding just means decryption didn't crash, it does **not** mean there's a valid Zoho login behind it:

```bash
tmux send-keys -t "$SESSION" 'auth current-user' Enter
sleep 2
tmux capture-pane -t "$SESSION" -p | tail -5
```

A real session shows `Zuid: <a real numeric id>, DC: zoho.eu` (or whichever dc). If `auth list` comes back with an empty table and `account list`/`show-last-error` says `Login not found for user -1`, the encryption password worked but there's no actual OAuth login yet — that needs `login --dc zoho.eu` run inside the shell (or `zoho.com`, whichever dc the account lives on — this account is on `zoho.eu`), which prints an OAuth URL for the human to open and consent to in a browser themselves. Same rule as the password: the agent triggers `login`, but never touches the OAuth consent step.

From there an agent can drive simple, single-flag commands without ever seeing the password:

```bash
tmux send-keys -t "$SESSION" 'message search --search-key=newMails --limit=5' Enter
sleep 2
tmux capture-pane -t "$SESSION" -p
```

**`--attachments` is not JSON despite what `help` says.** The help text for `message send` claims `--attachments=<attachments> Use json for this field`, which is wrong/misleading. Passing an actual JSON array (`--attachments=[{"storeName":"...","attachmentName":"...","attachmentPath":"..."}]`) makes the shell hang in a stuck multi-line continuation prompt (`>`) that swallows Enter and never sends — reproduced consistently, independent of `tmux` quoting (confirmed by the user typing the same JSON form directly at the prompt in their own terminal). The real, verified-working format is a `::`-delimited string, one attachment per value, no brackets or quotes:

```
--attachments=<attachmentName>::<attachmentPath>::<storeName>
```

using the three fields straight from `upload-attachment`'s response. Example, full send with attachment:

```
message send --account=<account-id> --from-address=<from> --to-address=<to> --subject=<s> --content=<body> --mail-format=plaintext --attachments=zmail_test_attachment.txt::/Mail/<attachment-path>::<store-id> -f=JSON
```

Confirmed working both via `tmux send-keys` and typed directly.

Kill the session when done: `tmux kill-session -t "$SESSION"`.

## Non-interactive help (no password needed)

Passing `help` (and drilling in via `<command> help <subcommand>`) works without unlocking anything — this is how the full command reference below was generated, with no live email access:

```bash
java -jar ~/Downloads/zmail-cli.jar help
java -jar ~/Downloads/zmail-cli.jar help message
java -jar ~/Downloads/zmail-cli.jar message help search
```

Only bare `java -jar ~/Downloads/zmail-cli.jar` (no args) hits the password gate. Any exploration of what the tool *can* do should use `help`, never a real invocation, until the human has unlocked a tmux session.

## Command reference (verified via `help`, not run against real data)

Top-level commands: `signature`, `account`, `folders`, `message`, `alias`, `auth`, `head`, `set`, `get`, `tail`, `next`, `previous`, `filter`, `csv`, `help`, `display`, `settings`, `clear`, `login`, `download`, `echo`, `exit`, plus admin-only groups (`groupManagement`, `userManagement`, `domainManagement`, `auditLogs`, `orgManagement`, `policyManagement`, `spamControl*`), `threads`, `labels`, `vacation`, `logs`.

Everything supports `-f=TABLE` or `-f=JSON` for output format — use `JSON` when another agent needs to parse the result.

### `auth` — session info
- `auth current-user` — shows which Zoho user is authenticated.
- `auth list [--decrypt] [--format=...]` — lists stored dc auth details. **Never pass `--decrypt`** unless the human explicitly asks to see a raw token; that's the one flag that would surface the actual secret.

### `folders`
- `folders list [--account=<id>] [-f=TABLE|JSON]` — list folders (needed to get a folder ID for `message list`/`search`).
- `folders inspect`, `create`, `rename`, `move`, `delete`, `empty`, `read`, `enable-imap-view`, `disable-imap-view`.

### `message` — the one used for "find me a code in a recent email"
- `message search --search-key=<key> [--limit=1-200] [--start=N] [--received-time=<unix-ms>] [--account=<id>] [--incude-to] [-f=TABLE|JSON]` — the main lookup tool. `--search-key` uses Zoho's search-syntax (e.g. `newMails`, or sender/subject search terms per Zoho's search syntax docs). Defaults to mail received before 2 minutes ago unless `--received-time` is set — for "grab a code that just arrived," this is usually enough on its own.
- `message list --folder=<id> [--status=read|unread] [--limit=...] [--sort-by=...] [--sort-order] [-f=...]` — list within a specific folder, filterable by read/unread/flagged/labeled/threaded/attachments.
- `message inspect --message=<id>` — metadata only (sender, subject, date, flags) — **prefer this over `retrieve-content` when only the subject/sender is needed**, since it never touches the body.
- `message retrieve-content --message=<id> --folder=<id> [--include-block-content]` — full body content. This is the one that can return an OTP/verification code. See the narrow-use rule below.
- `message retrieve-header`, `retrieve-eml`, `list-attachment`, `retrieve-attachment` — headers / raw MIME / attachments.
- Mutating ones (avoid unless explicitly asked): `send`, `reply`, `delete`, `move`, `archive`, `unarchive`, `spam`, `unspam`, `flag`, `apply-label`, `remove-label`, `remove-all-label`, `read`, `unread`, `upload-attachment`.
  - `message send --account=<id> --from-address=<addr> --to-address=<addr> --subject=<s> --content=<body> --mail-format=plaintext -f=JSON` — verified working, no spaces in flag values needed (or the whole command has to be quoted correctly when driven via `tmux send-keys`, which is itself finicky — see the quirk above). Success looks like `{"status":{"code":200,"description":"success"}}`.
  - `message upload-attachment --account=<id> --upload-type=multipart --attach=<local file path> --file-name-q=<name> -f=JSON` — verified working, but **both flags are load-bearing and undocumented as such**: `--upload-type=multipart` is required or the file uploads as 0 bytes even though the API accepts the call; `--file-name-q` (not `--file-name`) is the one that actually sets the name — `--file-name` alone errors with `fileName is null`. Success returns `{"status":{"code":200,...},"data":[{"storeName":"...","attachmentName":"...","attachmentPath":"...","url":null}]}` — feed those three fields into `send --attachments=name::path::storeName` (see the `--attachments` syntax note above — it is not JSON despite the help text).

### `account`
- `account list`, `account inspect` — read-only account details.
- The rest (`update-*`, `add-sendmaildetails*`, `resend-replyto-verification*`) are mutating account-settings changes — never run these without the human explicitly asking for that specific change.

### Shell-session helpers (only relevant once inside the unlocked interactive shell)
`head` / `tail` (paginate the previous result), `next` / `previous` (page through a list result), `display` (re-show the previous result), `download` (save the previous result), `set` / `get` (session variables), `csv` (export previous result), `settings` (shell prompt/colors/syntax highlighting), `clear`, `exit`.

## Rules for using this to fetch something like an OTP code

Modeled on the same principle as the Bitwarden Agent Access skill this replaced: treat mailbox content as sensitive by default, even though it's the user's own inbox.

- **Narrow the query first.** Use `message search` with a tight `--search-key` (sender + recent `--received-time` window, or a subject keyword) and a small `--limit` (1-5), not a broad `message list` over a whole folder.
- **Prefer `inspect` over `retrieve-content`** whenever subject/sender/date is enough to confirm you found the right email before pulling the body.
- **Surface only what was asked for.** If the task is "get me the verification code from that email," extract and report just the code (and maybe the sender/subject as confirmation) — don't paste the full email body into chat output, logs, or any committed file.
- **Never persist full inbox contents or full message bodies** into files in this repo or elsewhere. Command output used for documentation (like the help text above) is fine; real message content is not.
- **Never pass `--decrypt` on `auth list`**, and never read `~/.zmail-cli/config.json` directly — both would expose the OAuth token itself, not just mail content.
- **Mutating commands** (`send`, `delete`, `move`, `spam`, label/flag changes, any `account update-*`) need explicit human instruction each time — don't run them as a side effect of a read task.
