---
name: checkpointed-delegation
description: Structure long delegated work (especially to a weaker/less-steerable model, e.g. an OpenRouter model run as a subagent) so drift is caught mid-run instead of discovered only after it finishes. Use whenever dispatching a task expected to run many tool calls or minutes unattended.
---

# Checkpointed delegation

A model working alone for many tool calls tends to lose the task frame and drift onto a plausible-looking adjacent goal, without self-correcting. This is worse for weaker or less-steerable models (e.g. cheaper OpenRouter models used as subagents) than for the orchestrating model itself. Make drift cheap to detect.

## The core rule: deliverable-boxed chunks

Break the task into chunks that each produce one **inspectable artifact on disk**: a file, a diff, a numbered section of a report. Size a chunk to the artifact you can name before it starts — that's the boundary, not a time or tool-call budget.

Have the delegated agent append one line per chunk to a fixed progress file, in a fixed format:

```
CHUNK <n> | <artifact path> | <one-sentence what I did> | NEXT: <one-sentence next step>
```

Give it the numbered plan up front so `NEXT` has something concrete to name.

## Detecting drift mechanically

Check the progress file, not the subagent's reasoning:

1. **Artifact exists and is non-empty.** The single most common tell of drift or fabrication.
2. **`NEXT` matches the plan.** Diff it against the numbered plan you handed the agent — a name that isn't on that list is drift, in the agent's own words.
3. **Stall or repetition.** No new `CHUNK` line in the expected window, or two near-identical lines, means it's looping.

Reserve full-output reading for when one of these three trips — that's the expensive path.

## Where the authority lives

Put enforcement in the orchestrator, not just discipline in the prompt. A drifted model also tends to stop honoring its own reporting contract — a progress file gone silent is itself a signal. Poll the progress file (Claude Code: the `Monitor` tool streams a background process's stdout live and can wait-until-condition), apply the three checks above, and on a trip, kill and restart from the **last good artifact**.

## On Pi

**Prerequisites:**
- `pi` on PATH: `which pi` resolves.
- Logged in: `pi -p "reply with exactly: pi-ok" --no-session` returns `pi-ok`. An error or auth prompt means fix login first.
- Subagent dispatch needs `pi-subagents` installed (`pi list` shows it under Extensions). Absent → use the fallback path below instead of the `subagent` tool.
- Launch `pi -p ...` backgrounded, always: `nohup pi -p ... > out.log 2>&1 & disown`, then poll the progress file. A real multi-tool-call run can outrun a short foreground timeout.

Format and mechanics have been checked end to end against a real `pi -p` dispatch (multi-chunk task, `progress.log` written in the format above): both artifacts landed and the progress lines matched the format exactly.

**Non-interactive invocation:** `pi --provider <provider> --model <model> -p "<prompt>" --no-session`. Boolean flags are switches: `--no-tools` on its own. `--no-tools=false` errors with `Unknown option` before the model starts. Run `pi --list-models <search>` to confirm a model id/provider pairing exists before dispatching to it.

**Picking a model for chunked work:** wall-clock time on a throwaway task conflates two different things — a congested provider and a model that burns tokens overthinking a trivial task look identical from timing alone. Use `--mode json` for the probe run instead: it streams one JSON event per step, and each `message_end` event carries a `usage` object (`input`, `output`, `reasoning`, `totalTokens`, per-field `cost`) plus a `timestamp`. Output/reasoning token count on a task that should need near-zero tokens is the real overthinking signal; wall-clock is mostly provider latency. Reach for this once, before committing an unfamiliar model to real chunked delegation — it's a diagnostic, separate from the per-chunk checkpoint loop.

Pi core ships no standard subagent tool and no equivalent of Claude Code's `Monitor`. Dispatch via `subagent` from the `pi-subagents` package when installed (single-agent, chain, parallel, async, forked-context, resume/status workflows). Otherwise run the chunks sequentially in the current session, or tell the user the subagent capability is missing — never fabricate a `Task`-style call.

With no built-in live-stream tool, the progress-file check carries the full weight of visibility on Pi. Poll it directly between chunks — re-read the file itself, not raw stdout.

Task tracking (marking chunks done, tracking the plan) has no standard Pi tool either. Use an installed todo/task extension if present; otherwise a plan file or a repo-local `TODO.md` — the same file the progress-file convention above can double as, one line per chunk.

## Anti-patterns

- "Report your progress" with no fixed line format produces prose that needs another LLM to parse — defeats the mechanical check.
- Restarting from scratch after drift instead of resuming from the last verified-good chunk.
- Trusting the delegated agent's own "done" claim in place of checking the artifact.
- Piping raw subagent stdout into your own context by default — mostly reasoning noise; pull it only after a mechanical check trips.
- Chunks with no artifact (e.g. "analyze the codebase" as one chunk) are unverifiable by construction — drift stays invisible until something downstream breaks.
