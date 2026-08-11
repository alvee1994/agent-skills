---
name: zmail-cli
description: Read Zoho Mail via the local zmail-cli.jar (e.g. to fetch a 2FA/verification code from a recent email). Interactive-shell tool — needs a real pty and the user's local encryption password, so a human must unlock it once per session before an agent can drive it.
---

# Zoho Mail CLI (zmail-cli)

A local Java CLI/interactive-shell tool for Ahmed's Zoho Mail account. It's not part of this repo — it's a standalone jar at `~/Downloads/zmail-cli.jar` on this machine, a local dependency, not something to copy in here.

```
java -jar ~/Downloads/zmail-cli.jar
```

Already set up on this machine. Config lives at `~/.zmail-cli/` (`config.json`, `alias.json`, `settings.json`, `history`). Never read or dump the contents of that directory. `config.json` holds the encrypted OAuth refresh token — treat it like any credential store, the same principle as the `aac`/Bitwarden Agent Access skill this replaced.

## The pty problem (read before invoking)

Running the jar with no args drops straight into an **interactive shell** built on `jline`, and on launch it always prompts:

```
? Enter your encryption password (****)
```

That decrypts the locally-stored OAuth token. It is **not** the Zoho account password. Neither the agent nor any script should ever ask the user to type it into a chat message or an env var — it only gets typed at that live prompt, by the human, in a real terminal.

Running the jar through a tool without a real tty (e.g. Claude Code's Bash tool directly) **crashes** it:

```
WARNING: Unable to create a system terminal, creating a dumb terminal
? Enter your encryption password (****) Cannot invoke "...AbstractPrompt$InputValuePrompt$Operation.ordinal()" because "op" is null
```

Verified fix: allocate a real pty with `tmux` first, then the prompt renders cleanly and waits for input instead of crashing.

**Session naming: never use a predictable name like `zmail`.** A predictable name makes it easy for anything else on the machine to find and drive an open session. Generate a random 4-5 character alphanumeric name each time instead. Short enough for the human to type back when attaching. Random enough not to guess:

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

They type the password, press Enter, then detach with **`Ctrl-b` then `d`** — two separate keypresses: Ctrl+b together, release, then d alone. Detaching leaves the process running. Typing `exit` or closing the terminal instead kills it, and the session has to be recreated from the password prompt again.

Verify it actually unlocked before trusting it. The password prompt succeeding just means decryption didn't crash. It does **not** mean there's a valid Zoho login behind it:

```bash
tmux send-keys -t "$SESSION" 'auth current-user' Enter
sleep 2
tmux capture-pane -t "$SESSION" -p | tail -5
```

A real session shows `Zuid: <a real numeric id>, DC: zoho.eu` (or whichever dc). Sometimes `auth list` comes back with an empty table, and `account list`/`show-last-error` says `Login not found for user -1`. That means the encryption password worked, but there's no OAuth login yet. Fix it by running `login --dc zoho.eu` inside the shell (this account is on `zoho.eu` — use `zoho.com` if the account lives there instead). That prints an OAuth URL for the human to open and consent to in a browser themselves. Same rule as the password: the agent triggers `login`, but never touches the OAuth consent step.

From there an agent can drive simple, single-flag commands without ever seeing the password:

```bash
tmux send-keys -t "$SESSION" 'message search --search-key=newMails --limit=5' Enter
sleep 2
tmux capture-pane -t "$SESSION" -p
```

**`--attachments` is not JSON despite what `help` says.** The help text for `message send` claims `--attachments=<attachments> Use json for this field`. That's wrong. Passing an actual JSON array (`--attachments=[{"storeName":"...","attachmentName":"...","attachmentPath":"..."}]`) makes the shell hang in a stuck multi-line continuation prompt (`>`) that swallows Enter and never sends. This is reproduced consistently and has nothing to do with `tmux` quoting — the user got the same hang typing the JSON form directly at the prompt in their own terminal. The real, verified-working format is a `::`-delimited string, one attachment per value, no brackets or quotes:

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

Only bare `java -jar ~/Downloads/zmail-cli.jar` (no args) hits the password gate. To explore what the tool *can* do, use `help`, never a real invocation, until the human has unlocked a tmux session.

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
- `message search --search-key=<key> [--limit=1-200] [--start=N] [--received-time=<unix-ms>] [--account=<id>] [--incude-to] [-f=TABLE|JSON]` — the main lookup tool. `--search-key` uses Zoho's search-syntax (e.g. `newMails`, or sender/subject search terms per Zoho's search syntax docs). It defaults to mail received before 2 minutes ago, unless `--received-time` is set. For "grab a code that just arrived," that default is usually enough on its own.
- `message list --folder=<id> [--status=read|unread] [--limit=...] [--sort-by=...] [--sort-order] [-f=...]` — list within a specific folder, filterable by read/unread/flagged/labeled/threaded/attachments.
- `message inspect --message=<id>` — metadata only (sender, subject, date, flags) — **prefer this over `retrieve-content` when only the subject/sender is needed**, since it never touches the body.
- `message retrieve-content --message=<id> --folder=<id> [--include-block-content]` — full body content. This is the one that can return an OTP/verification code. See the narrow-use rule below.
- `message retrieve-header`, `retrieve-eml`, `list-attachment`, `retrieve-attachment` — headers / raw MIME / attachments.
- Mutating ones (avoid unless explicitly asked): `send`, `reply`, `delete`, `move`, `archive`, `unarchive`, `spam`, `unspam`, `flag`, `apply-label`, `remove-label`, `remove-all-label`, `read`, `unread`, `upload-attachment`.
  - `message send --account=<id> --from-address=<addr> --to-address=<addr> --subject=<s> --content=<body> --mail-format=plaintext -f=JSON` — verified working. Flag values don't need spaces, but if they do, quote the whole command correctly when driving it via `tmux send-keys` (itself finicky — see the quirk above). Success looks like `{"status":{"code":200,"description":"success"}}`.
  - `message upload-attachment --account=<id> --upload-type=multipart --attach=<local file path> --file-name-q=<name> -f=JSON` — verified working, but **both flags are load-bearing and undocumented as such**. `--upload-type=multipart` is required, or the file uploads as 0 bytes even though the API accepts the call. `--file-name-q` (not `--file-name`) is the one that actually sets the name — `--file-name` alone errors with `fileName is null`. Success returns `{"status":{"code":200,...},"data":[{"storeName":"...","attachmentName":"...","attachmentPath":"...","url":null}]}`. Feed those three fields into `send --attachments=name::path::storeName` (see the `--attachments` syntax note above — it is not JSON despite the help text).

## Composing a message with spaces in the subject/content (verified working)

The interactive shell's argument tokenizer is not a real shell. It does not merge an unquoted prefix with a following quoted chunk into one token. This breaks the intuitive form:

```
--subject="Some Subject With Spaces"
```

That gets tokenized as **two** separate tokens — `--subject=` (empty value) and `Some Subject With Spaces` (a stray unmatched positional) — and the command fails with `Unmatched arguments from index N: ...`. Quote style (single vs double) does not matter; the split happens right at the `=`.

**Fix: put the opening quote before the `--flag`, not after the `=`**, so the whole `--flag=value` is one token:

```
'--subject=Some Subject With Spaces'
'--content=Some content with spaces and punctuation.'
```

Also avoid apostrophes/contractions inside any single-quoted value ("I'm", "don't") — the tokenizer treats a bare `'` as a quote-open/close character even mid-word, which silently corrupts everything after it. Write "I am" instead of "I'm", etc. If double-quoting instead, the same risk applies to stray `"` characters.

For a body with paragraph breaks, don't rely on literal newlines in the content string — sending a real newline through `tmux send-keys` submits the line early, same failure mode as the JSON-attachments quirk above. Use `--mail-format=html` and join paragraphs with `<br><br>` instead of `\n\n`.

## Saving a draft instead of sending (verified working)

`message send`'s `--mode` flag is undocumented in `help` (it just says "Use json for this field," which is wrong — same doc-generation bug as `--attachments`). In practice it accepts `draft` as a value, and the message is saved to the account's Drafts folder instead of being sent:

```
message send --account=<account-id> --from-address=<addr> --to-address=<addr> '--subject=<subject>' '--content=<body>' --mail-format=html --mode=draft --attachments=<name>::<path>::<storeName> -f=JSON
```

A `{"status":{"code":200,...}}` response only confirms the API call succeeded — it does not by itself prove the message landed in Drafts rather than Sent/Outbox. **Verify by finding the account's actual Drafts folder and listing its contents**, rather than assuming a folder ID:

```
folders list --account=<account-id> -f=JSON
```

Find the object where `"path":"/Drafts"` and read its `"folderId"` from that same object — folder IDs are account-specific and not stable across accounts or Zoho instances, so look it up fresh each time rather than hardcoding one. Then:

```
message list --folder=<drafts-folder-id> --limit=5 -f=JSON
```

Confirm the new message appears with the right `subject`, `toAddress`, and `hasAttachment`. If there's any doubt about `--mode=draft` actually being safe before trying it against a real recipient, send the same command first with `--to-address` set to the human's own inbox, verify it lands in Drafts (not their inbox), then redo it with the real recipient.

Deleting a draft afterwards uses the same Drafts folder ID:

```
message delete --account=<account-id> --folder=<drafts-folder-id> --message=<message-id> -f=JSON
```

This has been observed to intermittently fail with a generic "An error occurred while doing the operation" — if it does, don't retry blindly; tell the human and let them delete it from the web UI.

## Scheduling a send (verified working)

`message send` has no way to schedule an existing draft by message ID — there is no `--message`/draft-reference flag on it. Scheduling means resubmitting the full message content through `send` itself, with `--schedule` and `--schedule-type=6` (custom date/time):

```
message send --account=<account-id> --from-address=<addr> --to-address=<addr> '--subject=<s>' '--content=<body>' --mail-format=html --schedule --schedule-type=6 '--schedule-time=MM/DD/YYYY HH:MM:SS' --time-zone=Europe/Amsterdam -f=JSON
```

Because it is a fresh submission, not a draft conversion, always re-pull the draft's current content first if the human may have edited it directly in the Zoho web UI since it was last drafted — don't resend stale content from earlier in the conversation.

Default scheduling windows this user favors, absent other instructions: 9:45am or 1:30am-3am, Europe/Amsterdam. Pick same-day if that window hasn't passed yet at request time, otherwise the next day. Check the current time first (`TZ=Europe/Amsterdam date`) before choosing.

### `account`
- `account list`, `account inspect` — read-only account details.
- The rest (`update-*`, `add-sendmaildetails*`, `resend-replyto-verification*`) are mutating account-settings changes — never run these without the human explicitly asking for that specific change.

### Shell-session helpers (only relevant once inside the unlocked interactive shell)
`head` / `tail` (paginate the previous result), `next` / `previous` (page through a list result), `display` (re-show the previous result), `download` (save the previous result), `set` / `get` (session variables), `csv` (export previous result), `settings` (shell prompt/colors/syntax highlighting), `clear`, `exit`.

## Rules for using this to fetch something like an OTP code

Modeled on the same principle as the Bitwarden Agent Access skill this replaced: treat mailbox content as sensitive by default, even though it's the user's own inbox.

- **Narrow the query first.** Use `message search` with a tight `--search-key` (sender + recent `--received-time` window, or a subject keyword) and a small `--limit` (1-5), not a broad `message list` over a whole folder.
- **Prefer `inspect` over `retrieve-content`** whenever subject/sender/date is enough to confirm you found the right email before pulling the body.
- **Surface only what was asked for.** If the task is "get me the verification code from that email," extract just the code, plus maybe the sender/subject as confirmation. Don't paste the full email body into chat output, logs, or any committed file.
- **Never persist full inbox contents or full message bodies** into files in this repo or elsewhere. Command output used for documentation (like the help text above) is fine. Real message content is not.
- **Never pass `--decrypt` on `auth list`**, and never read `~/.zmail-cli/config.json` directly. Both would expose the OAuth token itself, not just mail content.
- **Mutating commands** (`send`, `delete`, `move`, `spam`, label/flag changes, any `account update-*`) need explicit human instruction each time. Don't run them as a side effect of a read task.
