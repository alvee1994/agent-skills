---
name: flesch-kincaid
description: Simplify prose to a target Flesch-Kincaid grade level using an exact local scorer, not an LLM estimate. Trigger with `/flesch-kincaid <grade>` (e.g. `/flesch-kincaid 6-8`) before finalizing client-facing or public-facing copy — proposals, SOPs, homepage/site copy, playbooks. Also use whenever asked to "make this simpler" or "make this more readable" without a slash command.
---

# Flesch-Kincaid grade targeting

Reading level is a number, not a feeling. Score it with `fk_score.py` in this skill directory — don't estimate it by eye. LLMs are unreliable at judging their own sentence complexity. The script instead computes the real Flesch-Kincaid Grade Level and Flesch Reading Ease, from actual sentence, word, and syllable counts.

## Target grade

Parse the target from the invocation. `/flesch-kincaid 6` targets grade 6 exactly. `/flesch-kincaid 6-8` targets a range — treat the top of the range as the ceiling to hit. No grade given? Default to 6-8, the common bar for client-facing and public-facing writing.

## Loop

1. Score the current draft: `python3 fk_score.py <file>` or pipe the text in via stdin.
2. If `grade` is at or under the target ceiling, stop — done.
3. If over target, revise using the two levers that actually move this metric: shorter sentences (the words-per-sentence term dominates the formula), and shorter, more common words (fewer syllables per word). Cut subordinate clauses. Split compound sentences. Swap Latinate words for plain ones.
4. Re-score the revision. Repeat from step 2.
5. Cap it at 3 revision passes. Still over target after that? Report the current grade, plus the specific sentences still dragging it up. The script doesn't flag individual sentences — spot them by eye instead: the longest ones, or the ones with the most multi-syllable words. Don't keep grinding past 3 passes.

## Reading the output

`fk_score.py` prints one line: `grade=<float> ease=<float> words=<int> sentences=<int> syllables=<int>`.

- `grade` is the target metric — the US school grade level needed to read the text on first pass.
- `ease` (Flesch Reading Ease, 0-100, higher = easier) is a useful cross-check. Grade and ease should move in opposite directions on a revision. If they don't, the edit changed something the formula weights oddly (e.g. very short but jargon-dense sentences) instead of genuinely simplifying — reread the revision.
- `words`, `sentences`, and `syllables` are the raw counts the formula is built from. Check them if a grade number looks implausible for the text.

## Known limitation

The syllable counter is a vowel-group heuristic — it counts runs of `aeiouy` and drops a trailing silent `e`. It's not a dictionary lookup. That makes it accurate for ordinary English prose, but it can miscount unusual words: acronyms, made-up product names, foreign loanwords. Sanity-check the `syllables` count against the visible text if a grade result looks surprising for a short, plain-looking passage.
