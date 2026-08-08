---
name: flesch-kincaid
description: Simplify prose to a target Flesch-Kincaid grade level using an exact local scorer, not an LLM estimate. Trigger with `/flesch-kincaid <grade>` (e.g. `/flesch-kincaid 6-8`) before finalizing client-facing or public-facing copy — proposals, SOPs, homepage/site copy, playbooks. Also use whenever asked to "make this simpler" or "make this more readable" without a slash command.
---

# Flesch-Kincaid grade targeting

Reading level is a number, not a feeling — score it with `fk_score.py` in this skill directory, don't estimate it by eye. LLMs are unreliable at judging their own sentence complexity; the script computes the real Flesch-Kincaid Grade Level and Flesch Reading Ease from actual sentence/word/syllable counts.

## Target grade

Parse the target from the invocation: `/flesch-kincaid 6` targets grade 6 exactly; `/flesch-kincaid 6-8` targets a range, treat the top of the range as the ceiling to hit. No grade given → default to 6-8, the common bar for client-facing and public-facing writing.

## Loop

1. Score the current draft: `python3 fk_score.py <file>` or pipe the text in via stdin.
2. If `grade` is at or under the target ceiling, stop — done.
3. If over target, revise for the two levers that actually move this metric: shorter sentences (the words-per-sentence term dominates the formula) and shorter/more common words (fewer syllables per word). Cut subordinate clauses, split compound sentences, swap Latinate words for plain ones.
4. Re-score the revision. Repeat from step 2.
5. Cap at 3 revision passes. If still over target after 3 passes, report the current grade and the specific sentences still dragging it up (the script doesn't flag individual sentences — spot them by eye: the longest ones, or the ones with the most multi-syllable words) rather than continuing to grind.

## Reading the output

`fk_score.py` prints one line: `grade=<float> ease=<float> words=<int> sentences=<int> syllables=<int>`.

- `grade` is the target metric — US school grade level needed to read the text on first pass.
- `ease` (Flesch Reading Ease, 0-100, higher = easier) is a useful cross-check: grade and ease should move in opposite directions on a revision. If they don't, the edit changed something the formula weights oddly (e.g. very short but jargon-dense sentences) rather than genuinely simplifying — reread the revision.
- `words`/`sentences`/`syllables` are the raw counts the formula is built from — check them if a grade number looks implausible for the text.

## Known limitation

The syllable counter is a vowel-group heuristic (counts runs of `aeiouy`, drops a trailing silent `e`), not a dictionary lookup — it's accurate for ordinary English prose but can miscount unusual words (acronyms, made-up product names, foreign loanwords). Sanity-check the `syllables` count against the visible text if the grade result looks surprising for a short, plain-looking passage.
