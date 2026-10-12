"""Text preprocessing, used the same way for documents and for queries.

    raw text
      -> normalise   Unicode NFC, lowercase, Devanagari digits -> 0-9, punctuation -> space
      -> tokenise    runs of Latin letters/digits, or runs of Devanagari
      -> segment     split joined-up words in web addresses ("pokharanews" -> pokhara + news)
      -> stop words  drop very common English and Nepali words
      -> stem        English: Porter stemmer;  Nepali: strip postpositions (को, मा, ले, हरू ...)

PGS does the same steps in search-engine/src/pgs_search/query/normalizer.py (NFC,
lowercase, language detection, Porter stem / Nepali lemma).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from functools import lru_cache

from pgs_ir.porter import stem as porter_stem

_DEVANAGARI_CHAR = re.compile(r"[ऀ-ॿ]")
# A token is a run of Latin letters/digits or a run of Devanagari characters
# (Devanagari vowel signs and the virama are inside the same block, so a word stays whole).
_TOKEN = re.compile(r"[a-z0-9]+|[ऀ-ॣ०-ॿ]+")
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

ENGLISH_STOPWORDS = frozenset(
    """a about above after again against all am an and any are as at be because been
    before being below between both but by can could did do does doing down during each
    few for from further had has have having he her here hers him his how i if in into is
    it its itself just me more most my no nor not now of off on once only or other our out
    over own same she should so some such than that the their them then there these they
    this those through to too under until up very was we were what when where which while
    who whom why will with you your www http https html com org net np""".split()
)

# Common Nepali function words (postpositions, auxiliaries, pronouns, conjunctions).
NEPALI_STOPWORDS = frozenset(
    """र तथा वा पनि नै भने कि को का की ले लाई मा बाट देखि सम्म सँग संग द्वारा छ छन् हो हुन्
    थियो थिए भएको भएका गरेको गर्न गर्ने यो त्यो यी ती उनी उनको यस त्यस एक जुन के कुन""".split()
)

STOPWORDS = ENGLISH_STOPWORDS | NEPALI_STOPWORDS

# Nepali postpositions are written joined to the word ("काठमाडौंको" = "of Kathmandu").
# Longest first, so "हरूको" goes before "को".
_NEPALI_SUFFIXES = sorted(
    ["हरूको", "हरूका", "हरूमा", "हरूले", "हरूलाई", "हरू", "हरु", "लाई", "बाट", "देखि",
     "सम्म", "सँग", "द्वारा", "को", "का", "की", "मा", "ले"],
    key=len,
    reverse=True,
)


def normalise(text: str) -> str:
    """NFC, lowercase, Devanagari digits to ASCII, and the Nepali full stop removed."""
    text = unicodedata.normalize("NFC", text).lower()
    text = text.translate(_DEVANAGARI_DIGITS).replace("।", " ")
    return text


def tokenise(text: str) -> list[str]:
    return _TOKEN.findall(normalise(text))


def is_nepali(token: str) -> bool:
    return bool(_DEVANAGARI_CHAR.search(token))


def detect_language(text: str) -> str:
    """'ne', 'en', 'mixed' or 'unknown', from the scripts used (as PGS does)."""
    tokens = tokenise(text)
    has_ne = any(is_nepali(t) for t in tokens)
    has_en = any(not is_nepali(t) and t.isalpha() for t in tokens)
    if has_ne and has_en:
        return "mixed"
    if has_ne:
        return "ne"
    if has_en:
        return "en"
    return "unknown"


# Words that must not be stemmed even though they end like a postposition:
# "कास्की" (Kaski) is a name, not "कास्" + "की". Filled with the Nepali place names.
PROTECTED_WORDS: set[str] = set()


def protect_words(words: Iterable[str]) -> None:
    PROTECTED_WORDS.update(words)


def nepali_stem(token: str) -> str:
    """Strip joined postpositions (at most two, e.g. 'हरू' + 'को'), keeping at least two
    characters of the word. 'काठमाडौंको' -> 'काठमाडौं', 'कास्कीको' -> 'कास्की',
    'नगरपालिकाहरू' -> 'नगरपालिका'; protected words such as 'कास्की' stay whole."""
    for _ in range(2):
        if token in PROTECTED_WORDS:
            return token
        for suffix in _NEPALI_SUFFIXES:
            if token.endswith(suffix) and len(token) - len(suffix) >= 2:
                token = token[: -len(suffix)]
                break
        else:
            return token
    return token


def stem(token: str) -> str:
    return nepali_stem(token) if is_nepali(token) else porter_stem(token)


class Segmenter:
    """Splits joined-up words such as web addresses: 'pokharanews' -> ['pokhara', 'news'].

    Dynamic programming over the token (like word segmentation for languages written
    without spaces): each known word of 3+ letters costs 1, each unknown letter costs 2,
    so the split with the fewest pieces that covers the most letters wins.
    Only the known pieces are returned; the caller keeps the whole token as well.
    """

    def __init__(self, vocabulary: Iterable[str]):
        self.words = {w for w in vocabulary if len(w) >= 3 and w.isascii() and w.isalpha()}
        self.max_len = max((len(w) for w in self.words), default=0)

    @lru_cache(maxsize=50_000)  # noqa: B019 - one segmenter per process
    def split(self, token: str) -> tuple[str, ...]:
        if len(token) < 6 or not token.isalpha() or not token.isascii():
            return ()
        n = len(token)
        best_cost = [0.0] + [float("inf")] * n
        back: list[tuple[int, bool]] = [(0, False)] * (n + 1)
        for end in range(1, n + 1):
            # an unknown letter
            if best_cost[end - 1] + 2 < best_cost[end]:
                best_cost[end] = best_cost[end - 1] + 2
                back[end] = (end - 1, False)
            # a known word ending here
            for start in range(max(0, end - self.max_len), end - 2):
                if token[start:end] in self.words and best_cost[start] + 1 < best_cost[end]:
                    best_cost[end] = best_cost[start] + 1
                    back[end] = (start, True)
        pieces: list[str] = []
        end = n
        while end > 0:
            start, known = back[end]
            if known:
                pieces.append(token[start:end])
            end = start
        pieces.reverse()
        # One piece equal to the whole token means it was not split.
        if len(pieces) < 2:
            return ()
        return tuple(pieces)


def analyse(text: str, segmenter: Segmenter | None = None, *, use_stemming: bool = True,
            use_stopwords: bool = True) -> list[str]:
    """The full pipeline: text -> list of index terms (the same for documents and queries)."""
    terms: list[str] = []
    for token in tokenise(text):
        pieces = [token]
        if segmenter is not None:
            pieces.extend(segmenter.split(token))
        for piece in pieces:
            if use_stopwords and piece in STOPWORDS:
                continue
            terms.append(stem(piece) if use_stemming else piece)
    return terms
