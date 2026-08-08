#!/usr/bin/env python3
"""Flesch-Kincaid Grade Level and Flesch Reading Ease for a text file or stdin.

Usage: fk_score.py [file]
No file argument reads stdin.

Output (one line, machine-parseable):
grade=<float> ease=<float> words=<int> sentences=<int> syllables=<int>
"""
import re
import sys


def count_syllables(word: str) -> int:
    word = word.lower()
    word = re.sub(r"[^a-z]", "", word)
    if not word:
        return 0
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups)
    if word.endswith("e") and not word.endswith("le") and count > 1:
        count -= 1
    return max(count, 1)


def score(text: str):
    sentences = re.split(r"[.!?]+(?:\s|$)", text)
    sentences = [s for s in sentences if s.strip()]
    words = re.findall(r"[A-Za-z']+", text)

    n_sentences = max(len(sentences), 1)
    n_words = max(len(words), 1)
    n_syllables = sum(count_syllables(w) for w in words)

    words_per_sentence = n_words / n_sentences
    syllables_per_word = n_syllables / n_words

    grade = 0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59
    ease = 206.835 - 1.015 * words_per_sentence - 84.6 * syllables_per_word

    return grade, ease, n_words, n_sentences, n_syllables


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    if not re.findall(r"[A-Za-z']+", text):
        print("error: no words found in input", file=sys.stderr)
        sys.exit(1)

    grade, ease, n_words, n_sentences, n_syllables = score(text)
    print(
        f"grade={grade:.1f} ease={ease:.1f} words={n_words} "
        f"sentences={n_sentences} syllables={n_syllables}"
    )


if __name__ == "__main__":
    main()
