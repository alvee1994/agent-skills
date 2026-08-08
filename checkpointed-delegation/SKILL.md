---
name: checkpointed-delegation
description: Structure long delegated work (especially to a weaker/less-steerable model, e.g. an OpenRouter model run as a subagent) so drift is caught mid-run instead of discovered only after it finishes. Use whenever dispatching a task expected to run many tool calls or minutes unattended.
---

# Checkpointed delegation

A model working alone for many tool calls tends to lose the task frame and drift onto a plausible-looking adjacent goal, without self-correcting. This is worse for weaker or less-steerable models (e.g. cheaper OpenRouter models used as subagents) than for the orchestrating model itself. Visibility into a run's live output helps but doesn't fix this on its own — a 40-minute log nobody is watching is functionally the same as no log. The fix is to make drift cheap to detect, not to make the model immune to it.

## The core rule: deliverable-boxed chunks, not time-boxed

Don't tell a delegated agent "check in every 10 minutes" or "report progress periodically" — time and tool-call counts aren't enforceable from outside, and prose progress reports need another model to parse. Instead, break the task into chunks that each produce one **inspectable artifact on disk**: a file, a diff, a numbered section of a report. A chunk is too big if you can't name the file it will write before it starts.

Have the delegated agent append one line per chunk to a fixed progress file, in a fixed format:

```
CHUNK <n> | <artifact path> | <one-sentence what I did> | NEXT: <one-sentence next step>
```

Give it the numbered plan up front so `NEXT` has something concrete to name.

## Detecting drift without a second LLM judge

Check the progress file mechanically, not by reading the subagent's reasoning:

1. **Artifact exists and is non-empty.** A claimed-but-absent file is the single most common tell of drift or fabrication.
2. **`NEXT` matches the plan.** Diff it against the numbered plan you handed the agent. If it names something not on that list, that's drift, in the agent's own words.
3. **Stall or repetition.** No new `CHUNK` line in the expected window, or two chunks with near-identical text, means it's looping rather than progressing.

Only read full output/reasoning when one of these three trips — that's the expensive path, reserve it.

## Where the authority lives

Put the *enforcement* in the orchestrator, not just discipline in the prompt. A model that has drifted also tends to stop honoring its own reporting contract — a progress file that goes silent is itself a signal, not just a missing log. The orchestrator should poll the progress file (Claude Code: the `Monitor` tool streams a background process's stdout live and can wait-until-condition; don't just fire-and-forget with `Bash run_in_background` and wait for the completion notification on a long run), apply the three checks above, and kill + restart from the **last good artifact** — never from scratch — when drift trips.

## On Pi

Pi core ships no standard subagent tool and no equivalent of Claude Code's `Monitor`. If a subagent tool is installed — e.g. `subagent` from the `pi-subagents` package (single-agent, chain, parallel, async, forked-context, resume/status workflows) — use it to dispatch the chunked work. If none is installed, don't invent a `Task`-style call: either run the chunks sequentially in the current session, or tell the user the subagent capability isn't installed.

Since there's no built-in live-stream tool, the progress-file check above carries even more weight on Pi than on Claude Code — it's the only cheap way to know a dispatched chunk is still on track. Poll the progress file yourself between chunks (re-read it, don't tail raw stdout).

Task tracking (marking chunks done, tracking the plan) has no standard Pi tool either. Use an installed todo/task extension if present; otherwise a plan file or a repo-local `TODO.md` — the same file the progress-file convention above can double as, one line per chunk.

## Anti-patterns

- "Report your progress" with no fixed line format — you'll get prose you then need an LLM to parse, defeating the point of a mechanical check.
- Restarting the whole task from scratch after drift, instead of resuming from the last verified-good chunk.
- Trusting the delegated agent's own "done" claim instead of checking the artifact exists and looks right.
- Piping raw subagent stdout into your own context by default — mostly reasoning noise; pull it only after a mechanical check trips.
- Chunks with no artifact (e.g. "analyze the codebase" as one chunk) — unverifiable by construction, so drift in it is invisible until something downstream breaks.
