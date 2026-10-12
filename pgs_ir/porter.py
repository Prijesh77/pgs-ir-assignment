"""Porter stemmer (M. F. Porter, 1980, "An algorithm for suffix stripping").

Written out here instead of importing NLTK so the project has no dependencies.
PGS itself uses NLTK's PorterStemmer for English query terms
(search-engine/src/pgs_search/query/normalizer.py); this gives the same stems for
ordinary words.
"""

from __future__ import annotations

from functools import lru_cache

_VOWELS = set("aeiou")


def _is_consonant(word: str, i: int) -> bool:
    ch = word[i]
    if ch in _VOWELS:
        return False
    if ch == "y":
        # 'y' is a consonant at the start or after a vowel, a vowel after a consonant.
        return i == 0 or not _is_consonant(word, i - 1)
    return True


def _measure(stem: str) -> int:
    """m in [C](VC)^m[V]: the number of vowel-consonant sequences."""
    m = 0
    i = 0
    n = len(stem)
    while i < n and _is_consonant(stem, i):
        i += 1
    while i < n:
        while i < n and not _is_consonant(stem, i):
            i += 1
        if i >= n:
            break
        while i < n and _is_consonant(stem, i):
            i += 1
        m += 1
    return m


def _has_vowel(stem: str) -> bool:
    return any(not _is_consonant(stem, i) for i in range(len(stem)))


def _ends_double_consonant(word: str) -> bool:
    return len(word) >= 2 and word[-1] == word[-2] and _is_consonant(word, len(word) - 1)


def _cvc(word: str) -> bool:
    """consonant-vowel-consonant ending, where the last consonant is not w, x or y."""
    if len(word) < 3:
        return False
    return (
        _is_consonant(word, len(word) - 3)
        and not _is_consonant(word, len(word) - 2)
        and _is_consonant(word, len(word) - 1)
        and word[-1] not in "wxy"
    )


def _replace(word: str, suffix: str, replacement: str, min_measure: int) -> str | None:
    """If word ends with suffix and the stem's measure > min_measure, swap the suffix.
    Returns None when the suffix doesn't match (so the caller tries the next rule)."""
    if not word.endswith(suffix):
        return None
    stem = word[: len(word) - len(suffix)]
    if _measure(stem) > min_measure:
        return stem + replacement
    return word


def _step1a(w: str) -> str:
    if w.endswith("sses"):
        return w[:-2]
    if w.endswith("ies"):
        return w[:-2]
    if w.endswith("ss"):
        return w
    if w.endswith("s"):
        return w[:-1]
    return w


def _step1b(w: str) -> str:
    if w.endswith("eed"):
        stem = w[:-3]
        return w[:-1] if _measure(stem) > 0 else w
    for suffix in ("ed", "ing"):
        if w.endswith(suffix):
            stem = w[: -len(suffix)]
            if not _has_vowel(stem):
                return w
            w = stem
            if w.endswith(("at", "bl", "iz")):
                return w + "e"
            if _ends_double_consonant(w) and w[-1] not in "lsz":
                return w[:-1]
            if _measure(w) == 1 and _cvc(w):
                return w + "e"
            return w
    return w


def _step1c(w: str) -> str:
    if w.endswith("y") and _has_vowel(w[:-1]):
        return w[:-1] + "i"
    return w


_STEP2 = [
    ("ational", "ate"), ("tional", "tion"), ("enci", "ence"), ("anci", "ance"),
    ("izer", "ize"), ("abli", "able"), ("alli", "al"), ("entli", "ent"), ("eli", "e"),
    ("ousli", "ous"), ("ization", "ize"), ("ation", "ate"), ("ator", "ate"),
    ("alism", "al"), ("iveness", "ive"), ("fulness", "ful"), ("ousness", "ous"),
    ("aliti", "al"), ("iviti", "ive"), ("biliti", "ble"),
]
_STEP3 = [
    ("icate", "ic"), ("ative", ""), ("alize", "al"), ("iciti", "ic"), ("ical", "ic"),
    ("ful", ""), ("ness", ""),
]
_STEP4 = [
    "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement", "ment", "ent",
    "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
]


def _step2(w: str) -> str:
    for suffix, repl in _STEP2:
        out = _replace(w, suffix, repl, 0)
        if out is not None:
            return out
    return w


def _step3(w: str) -> str:
    for suffix, repl in _STEP3:
        out = _replace(w, suffix, repl, 0)
        if out is not None:
            return out
    return w


def _step4(w: str) -> str:
    for suffix in _STEP4:
        if w.endswith(suffix):
            stem = w[: -len(suffix)]
            if _measure(stem) > 1:
                if suffix == "ion" and not stem.endswith(("s", "t")):
                    return w
                return stem
            return w
    return w


def _step5(w: str) -> str:
    if w.endswith("e"):
        stem = w[:-1]
        m = _measure(stem)
        if m > 1 or (m == 1 and not _cvc(stem)):
            w = stem
    if _measure(w) > 1 and _ends_double_consonant(w) and w.endswith("l"):
        w = w[:-1]
    return w


@lru_cache(maxsize=100_000)
def stem(word: str) -> str:
    """Porter stem of a lowercase English word ('municipalities' -> 'municip')."""
    if len(word) <= 2 or not word.isalpha() or not word.isascii():
        return word
    for step in (_step1a, _step1b, _step1c, _step2, _step3, _step4, _step5):
        word = step(word)
    return word
