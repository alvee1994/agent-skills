---
name: checkpointed-delegation
description: Offload the execution half of a Claude Code task to a cheap OpenRouter model run through Pi, so only planning burns Claude subscription quota — Opus or Fable 5 plans and reviews, Pi/OpenRouter grinds through the tool calls at a fraction of the cost. Structures that offloaded work into checkpointed chunks so drift from the weaker executor model is caught mid-run, not discovered only after it finishes. Use whenever a task has real planning depth but mechanical execution, and cost/quota matters.
---

# Checkpointed delegation

Claude subscription quota is the expensive resource. Pi dispatching to an OpenRouter model is cheap. Split a task along that line. Keep planning, judgment calls, and final review inside Claude Code, where Opus or Fable 5's planning strength earns its cost. Hand the mechanical execution — file edits, boilerplate, the many-tool-call grind — to a cheaper model dispatched through Pi. Claude Code plans the chunks and checks them. It never burns its own quota running them.

The catch: a cheaper, less-steerable model working alone for many tool calls tends to lose the task frame. It drifts onto a plausible-looking adjacent goal and doesn't self-correct. The fix isn't a smarter, pricier executor. It's making that drift cheap to catch, so the savings still hold even when the executor needs correcting mid-run.

## Division of labor

- **Claude Code (Opus/Fable 5) plans.** Break the task into a numbered plan of chunks before dispatching anything. This step is worth the quota — a good chunk breakdown is what makes cheap mechanical checks possible later.
- **Pi + OpenRouter model executes.** Dispatch the numbered plan to a cheap model via `pi -p`, backgrounded. This is where the savings come from — it runs outside the Claude subscription entirely.
- **Claude Code verifies.** Poll the results mechanically (see below). Don't re-read the executor's reasoning. Verification should cost a sliver of what native execution would have cost.

## The core rule: deliverable-boxed chunks

Break the task into chunks. Each chunk produces one **inspectable artifact on disk**: a file, a diff, a numbered section of a report. Size a chunk to the artifact you can name before it starts — that's the boundary, not a time or tool-call budget.

Have the delegated agent append one line per chunk to a fixed progress file, in a fixed format:

```
CHUNK <n> | <artifact path> | <one-sentence what I did> | NEXT: <one-sentence next step>
```

Give it the numbered plan up front, so `NEXT` has something concrete to name.

## Detecting drift mechanically

Check the progress file, not the subagent's reasoning:

1. **Artifact exists and is non-empty.** This is the single most common tell of drift or fabrication.
2. **`NEXT` matches the plan.** Diff it against the numbered plan you handed the agent. A name that isn't on that list is drift, in the agent's own words.
3. **Stall or repetition.** No new `CHUNK` line in the expected window, or two near-identical lines, means it's looping.

Save full-output reading for when one of these three trips. That's the expensive path, and the one most likely to eat into the savings if used routinely.

## Where the authority lives

Put enforcement in the orchestrator (Claude Code), not just discipline in the executor's prompt. A drifted model often stops following its own report format too — a silent progress file is itself a warning sign. Poll the progress file. (Claude Code: the `Monitor` tool streams a background process's stdout live and can wait on a condition.) Apply the three checks above. On a trip, kill the run and restart from the **last good artifact**. Claude Code stays the one making judgment calls. The OpenRouter model stays the one burning tool calls.

## Keeping the checkpoint loop itself cheap

The supervision loop runs inside Claude Code, so it costs real subscription quota. A checkpoint pattern that re-reads a growing log on every poll eats into the exact savings this approach exists to capture.

- Launch backgrounded. Default to **one check at the end**, triggered by the process-exit notification. (Claude Code: `Bash run_in_background`, or `Monitor` with a wait-until-condition, rather than a fixed interval.) This costs one tool call for the whole delegation.
- Interval polling earns its keep on a long run, where catching drift mid-way beats waiting. Poll on chunk-duration scale. Read with `tail`, never a full-file `Read`. `wc -l progress.log; tail -n 1 progress.log` gives chunk count and the current `NEXT`, in a fixed handful of tokens, no matter how big the log is. Track the last-seen byte offset (`stat -c %s`) in your own transcript. Resume from there next time — `tail -c +$((OFFSET+1))`.
- Check artifact existence and size with `stat` or `find`, never with `Read`. Content only gets pulled in on the escalation path, after a check trips.
- Compare `stat -c '%s %Y'` (size + mtime) before tailing. Identical to last poll means skip the tail call entirely.

## On Pi

**Prerequisites:**
- `pi` on PATH: `which pi` resolves.
- Logged in: `pi -p "reply with exactly: pi-ok" --no-session` returns `pi-ok`. An error or auth prompt means fix login first.
- OpenRouter provider configured. This is the piece that keeps execution off the Claude subscription — `pi --list-models <search>` should return `openrouter` rows.
- Subagent dispatch needs `pi-subagents` installed (`pi list` shows it under Extensions). Absent → use the fallback path below instead of the `subagent` tool.
- Launch `pi -p ...` backgrounded, always: `nohup pi -p ... > out.log 2>&1 & disown`, then poll the progress file. A real multi-tool-call run can outrun a short foreground timeout.

Format and mechanics have been checked end to end against a real `pi -p` dispatch (multi-chunk task, `progress.log` written in the format above). Both artifacts landed and the progress lines matched the format exactly.

**Non-interactive invocation:** `pi --provider openrouter --model <model> -p "<prompt>" --no-session`. Boolean flags are switches: `--no-tools` on its own. `--no-tools=false` errors with `Unknown option` before the model starts. Run `pi --list-models <search>` first, to confirm a model id/provider pairing exists before dispatching to it.

**Picking a model for chunked work:** cheaper isn't automatically cheaper. A model that overthinks a trivial task can burn more tokens than a pricier model that finishes fast. Wall-clock time alone won't show this — it can't tell overthinking apart from plain provider lag. Instead, run a throwaway probe task with `--mode json` in place of `-p`. It streams one JSON event per step. Each `message_end` event carries a `usage` object (`input`, `output`, `reasoning`, `totalTokens`, per-field `cost`) plus a `timestamp`. Check the `cost.total` field on a task that should need near-zero tokens. That's the real signal for whether a model is actually cheap once its overthinking tax is counted. Run this probe once per unfamiliar model, before committing it to real chunked delegation. It's a one-off diagnostic, separate from the per-chunk checkpoint loop.

Pi core ships no standard subagent tool, and no equivalent of Claude Code's `Monitor`. Dispatch via `subagent` from the `pi-subagents` package when installed (single-agent, chain, parallel, async, forked-context, resume/status workflows). Otherwise run the chunks sequentially in the current session, or tell the user the subagent capability is missing. Never fabricate a `Task`-style call.

With no built-in live-stream tool, the progress-file check carries the full weight of visibility on Pi. Poll it with the same `tail`/offset approach above, between chunks — not raw stdout.

Task tracking (marking chunks done, tracking the plan) has no standard Pi tool either. Use an installed todo/task extension if present. Otherwise, use a plan file or a repo-local `TODO.md` — the same file the progress-file convention above can double as, one line per chunk.

## Anti-patterns

- Delegating the planning step itself to the cheap model. That's the part Opus/Fable 5's quota is worth spending on — delegate only mechanical execution.
- "Report your progress" with no fixed line format produces prose that needs another LLM to parse. This defeats the mechanical check.
- Restarting from scratch after drift, instead of resuming from the last verified-good chunk.
- Trusting the delegated agent's own "done" claim in place of checking the artifact.
- Piping raw subagent stdout into your own context by default. This is mostly reasoning noise; pull it only after a mechanical check trips, and each pull costs Claude subscription quota.
- Chunks with no artifact (e.g. "analyze the codebase" as one chunk) are unverifiable by construction. Drift stays invisible until something downstream breaks.
- Polling `progress.log` with `Read` instead of `tail`. Cost grows with every poll as the file grows, compounding across the run.
- Reading artifact contents on a routine checkpoint "just to sanity-check quality." That's a full review at every checkpoint — exactly what the chunked design exists to defer.
- Fixed-interval polling that mostly returns "no change." Each poll is a permanent context entry. Prefer end-of-run or chunk-duration cadence over a timer.
- Letting the subagent write anything other than the fixed `CHUNK` line into `progress.log`. Prose inflates every tail read and breaks `tail -n 1`.
- Picking the cheapest-listed OpenRouter model without probing its token cost on a trivial task first. An overthinking model can erase the savings entirely.
