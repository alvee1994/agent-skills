---
name: checkpointed-delegation
description: Offload the execution half of a Claude Code task to a cheap OpenRouter model run through Pi, so only planning burns Claude subscription quota — Opus or Fable 5 plans and reviews, Pi/OpenRouter grinds through the tool calls at a fraction of the cost. Structures that offloaded work into checkpointed chunks so drift from the weaker executor model is caught mid-run, not discovered only after it finishes. Use whenever a task has real planning depth but mechanical execution, and cost/quota matters.
---

# Checkpointed delegation

Claude subscription quota is the expensive resource; Pi dispatching to an OpenRouter model is comparatively cheap. Split a task along that line: keep planning, judgment calls, and final review inside Claude Code, where Opus or Fable 5's planning strength is worth paying for — and hand the mechanical execution (the actual file edits, the boilerplate, the many-tool-call grind) to a cheaper model dispatched through Pi. Claude Code plans the chunks and verifies them; it never has to burn its own quota running them.

The catch: a cheaper, less-steerable model working alone for many tool calls tends to lose the task frame and drift onto a plausible-looking adjacent goal, without self-correcting. The fix isn't picking a smarter (and pricier) executor — it's making that drift cheap to catch, so the arbitrage still pays off even when the executor needs correcting mid-run.

## Division of labor

- **Claude Code (Opus/Fable 5) plans.** Break the task into a numbered plan of chunks before dispatching anything. This is the step worth spending quota on — a good chunk breakdown is what makes cheap mechanical checks downstream possible at all.
- **Pi + OpenRouter model executes.** Dispatch the numbered plan to a cheap model via `pi -p`, backgrounded. This is where the cost savings come from — it runs outside the Claude subscription entirely.
- **Claude Code verifies.** Poll the results mechanically (see below), not by re-reading the executor's reasoning. Verification should cost a sliver of what execution would have cost if run natively.

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

Reserve full-output reading for when one of these three trips — that's the expensive path, and the one most likely to erode the cost savings if used routinely.

## Where the authority lives

Put enforcement in the orchestrator (Claude Code), not just discipline in the executor's prompt. A drifted model also tends to stop honoring its own reporting contract — a progress file gone silent is itself a signal. Poll the progress file (Claude Code: the `Monitor` tool streams a background process's stdout live and can wait-until-condition), apply the three checks above, and on a trip, kill and restart from the **last good artifact**. Claude Code stays the one making judgment calls; the OpenRouter model stays the one burning tool calls.

## Keeping the checkpoint loop itself cheap

The supervision loop runs inside Claude Code, so it costs real subscription quota — a checkpoint pattern that re-reads a growing log on every poll eats into the exact savings this whole approach exists to capture.

- Launch backgrounded and default to **one check at the end**, triggered by the process-exit notification (Claude Code: `Bash run_in_background`, or `Monitor` with a wait-until-condition rather than a fixed interval). This costs one tool call for the whole delegation.
- When interval polling is warranted (a run long enough that catching drift mid-way beats waiting), poll on chunk-duration scale, and read with `tail`, never a full-file `Read`: `wc -l progress.log; tail -n 1 progress.log` gives chunk count and current `NEXT` in a fixed handful of tokens regardless of log size. Track the last-seen byte offset (`stat -c %s`) in your own transcript and resume from there — `tail -c +$((OFFSET+1))` — on the next poll.
- Check artifact existence and size with `stat` or `find`, never with `Read`. Content only gets pulled in on the escalation path, after a check trips.
- Compare `stat -c '%s %Y'` (size + mtime) before tailing — identical to last poll means skip the tail call entirely.

## On Pi

**Prerequisites:**
- `pi` on PATH: `which pi` resolves.
- Logged in: `pi -p "reply with exactly: pi-ok" --no-session` returns `pi-ok`. An error or auth prompt means fix login first.
- OpenRouter provider configured (this is the piece that keeps execution off the Claude subscription — `pi --list-models <search>` should return `openrouter` rows).
- Subagent dispatch needs `pi-subagents` installed (`pi list` shows it under Extensions). Absent → use the fallback path below instead of the `subagent` tool.
- Launch `pi -p ...` backgrounded, always: `nohup pi -p ... > out.log 2>&1 & disown`, then poll the progress file. A real multi-tool-call run can outrun a short foreground timeout.

Format and mechanics have been checked end to end against a real `pi -p` dispatch (multi-chunk task, `progress.log` written in the format above): both artifacts landed and the progress lines matched the format exactly.

**Non-interactive invocation:** `pi --provider openrouter --model <model> -p "<prompt>" --no-session`. Boolean flags are switches: `--no-tools` on its own. `--no-tools=false` errors with `Unknown option` before the model starts. Run `pi --list-models <search>` to confirm a model id/provider pairing exists before dispatching to it.

**Picking a model for chunked work:** cheaper isn't automatically cheaper — a model that burns tokens overthinking a trivial task can cost more in OpenRouter usage than a pricier-per-token model that finishes fast, and wall-clock time alone can't tell the two apart from provider latency. Use `--mode json` for a throwaway probe task instead of `-p`: it streams one JSON event per step, and each `message_end` event carries a `usage` object (`input`, `output`, `reasoning`, `totalTokens`, per-field `cost`) plus a `timestamp`. The `cost.total` field on a task that should need near-zero tokens is the real signal for whether this model is actually the cheap option once its overthinking tax is counted. Reach for this once per unfamiliar model, before committing it to real chunked delegation — it's a diagnostic, separate from the per-chunk checkpoint loop.

Pi core ships no standard subagent tool and no equivalent of Claude Code's `Monitor`. Dispatch via `subagent` from the `pi-subagents` package when installed (single-agent, chain, parallel, async, forked-context, resume/status workflows). Otherwise run the chunks sequentially in the current session, or tell the user the subagent capability is missing — never fabricate a `Task`-style call.

With no built-in live-stream tool, the progress-file check carries the full weight of visibility on Pi. Poll it with the same `tail`/offset approach above, between chunks — not raw stdout.

Task tracking (marking chunks done, tracking the plan) has no standard Pi tool either. Use an installed todo/task extension if present; otherwise a plan file or a repo-local `TODO.md` — the same file the progress-file convention above can double as, one line per chunk.

## Anti-patterns

- Delegating the planning step itself to the cheap model — that's the part Opus/Fable 5's quota is worth spending on; delegate only mechanical execution.
- "Report your progress" with no fixed line format produces prose that needs another LLM to parse — defeats the mechanical check.
- Restarting from scratch after drift instead of resuming from the last verified-good chunk.
- Trusting the delegated agent's own "done" claim in place of checking the artifact.
- Piping raw subagent stdout into your own context by default — mostly reasoning noise; pull it only after a mechanical check trips, and each pull costs Claude subscription quota.
- Chunks with no artifact (e.g. "analyze the codebase" as one chunk) are unverifiable by construction — drift stays invisible until something downstream breaks.
- Polling `progress.log` with `Read` instead of `tail` — cost grows with every poll as the file grows, compounding across the run.
- Reading artifact contents on a routine checkpoint "just to sanity-check quality" — that's a full review at every checkpoint, exactly what the chunked design exists to defer.
- Fixed-interval polling that mostly returns "no change" — each poll is a permanent context entry. Prefer end-of-run or chunk-duration cadence over a timer.
- Letting the subagent write anything other than the fixed `CHUNK` line into `progress.log` — prose inflates every tail read and breaks `tail -n 1`.
- Picking the cheapest-listed OpenRouter model without probing its token cost on a trivial task first — an overthinking model can erase the arbitrage entirely.
