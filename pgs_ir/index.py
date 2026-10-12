"""The inverted index: term -> the documents that contain it, with a count per field.

    "pokhara" -> { 412: [1, 0, 0],      document 412 has it once in the title,
                   538: [0, 1, 0],      document 538 once in the place field,
                   ... }

The index also keeps each document's field lengths (for BM25's length normalisation),
the document table, and a character-trigram index of the vocabulary (for fuzzy matching
of misspelt query words). It is saved as one JSON file, so `build` runs once and
`search` just loads it.
"""

from __future__ import annotations

import json
import math
import time
from collections import Counter, defaultdict
from dataclasses import asdict
from pathlib import Path

from pgs_ir.corpus import (
    DATA_DIR,
    FIELD_WEIGHTS,
    LOCAL_BODY_TYPES,
    WEB_WORDS,
    Document,
    Geography,
    build_documents,
    load_domains,
    load_geography,
)
from pgs_ir.preprocess import Segmenter, analyse, protect_words, tokenise

FIELDS = list(FIELD_WEIGHTS)  # ["title", "place", "body"]
INDEX_FILE = Path(__file__).resolve().parent.parent / "index" / "pgs_index.json"


def make_segmenter(geo: Geography) -> Segmenter:
    """Vocabulary = common web-address words + every English place name.
    (Also protects the Nepali place names from the Nepali stemmer.)"""
    protect_nepali_names(geo)
    vocab = set(WEB_WORDS)
    for _, _, name in geo.place_names():
        vocab.update(tokenise(name))
        vocab.add("".join(tokenise(name)))  # "Sudur Pashchim" -> "sudurpashchim"
    return Segmenter(vocab)


def protect_nepali_names(geo: Geography) -> None:
    for group in (geo.provinces, geo.districts, geo.local_bodies):
        for place in group.values():
            protect_words(tokenise(place["name_ne"]))
    # "नगरपालिका" ends like the postposition "का" but is one word.
    protect_words(ne for _, ne in LOCAL_BODY_TYPES.values())
    protect_words(["जिल्ला", "प्रदेश"])


def make_geotagger(geo: Geography, segmenter: Segmenter):
    """Tags a website with a place when its address names one ('pokharanews.com' -> Pokhara).

    A name shared by a district and its headquarters ('kathmandu') tags the district,
    a province name the province; a local-government name only when no other place has
    it ('kalika' is seven local governments, so it tags nothing). Names under 4 letters
    are ignored.
    """
    by_name: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for kind, code, name in geo.place_names():
        key = "".join(tokenise(name))
        if len(key) >= 4:
            by_name[key].add((kind, code))
    unique: dict[str, tuple[str, str]] = {}
    for name, places in by_name.items():
        for preferred in ("district", "province"):
            matches = [p for p in places if p[0] == preferred]
            if len(matches) == 1:
                unique[name] = matches[0]
                break
        else:
            if len(places) == 1:
                unique[name] = next(iter(places))

    def tag(domain: str) -> tuple[str | None, str | None, str | None]:
        pieces: list[str] = []
        for token in tokenise(domain.replace(".", " ")):
            pieces.append(token)
            split = segmenter.split(token)
            # Only trust a split that explains every letter: 'pokharanews' = pokhara+news,
            # but 'rupantarankhabar' is not 'rupa' + unknown letters + 'khabar'.
            if "".join(split) == token:
                pieces.extend(split)
        for piece in pieces:
            hit = unique.get(piece)
            if not hit:
                continue
            kind, code = hit
            if kind == "district":
                return code, geo.districts[code]["province_code"], None
            if kind == "province":
                return None, code, None
            body = geo.local_bodies[code]
            district = body["district_code"]
            return district, geo.districts[district]["province_code"], code
        return None, None, None

    return tag


def trigrams(term: str) -> set[str]:
    padded = f"#{term}#"
    return {padded[i:i + 3] for i in range(len(padded) - 2)}


class InvertedIndex:
    def __init__(self, docs: list[Document], postings: dict[str, dict[int, list[int]]],
                 field_lengths: list[list[int]], build_seconds: float = 0.0):
        self.docs = docs
        self.postings = postings
        self.field_lengths = field_lengths
        self.build_seconds = build_seconds
        n = max(len(docs), 1)
        self.avg_field_length = [sum(fl[i] for fl in field_lengths) / n for i in range(len(FIELDS))]
        self.doc_index = {d.doc_id: i for i, d in enumerate(docs)}
        self._trigram_index: dict[str, set[str]] | None = None

    # ---- building -------------------------------------------------------------------

    @classmethod
    def build(cls, data_dir: Path = DATA_DIR, *, use_segmentation: bool = True,
              use_stemming: bool = True) -> tuple["InvertedIndex", Segmenter | None]:
        started = time.perf_counter()
        geo = load_geography(data_dir)
        segmenter = make_segmenter(geo) if use_segmentation else None
        geotagger = make_geotagger(geo, segmenter) if segmenter else None
        docs = build_documents(geo, load_domains(data_dir), geotagger)

        postings: dict[str, dict[int, list[int]]] = defaultdict(dict)
        field_lengths: list[list[int]] = []
        for doc_idx, doc in enumerate(docs):
            lengths = []
            for f_idx, name in enumerate(FIELDS):
                terms = analyse(doc.fields.get(name, ""), segmenter, use_stemming=use_stemming)
                lengths.append(len(terms))
                for term, count in Counter(terms).items():
                    entry = postings[term].setdefault(doc_idx, [0] * len(FIELDS))
                    entry[f_idx] += count
            field_lengths.append(lengths)
        return cls(docs, dict(postings), field_lengths, time.perf_counter() - started), segmenter

    # ---- saving / loading -----------------------------------------------------------

    def save(self, path: Path = INDEX_FILE) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "docs": [asdict(d) for d in self.docs],
            "field_lengths": self.field_lengths,
            "postings": {t: {str(k): v for k, v in p.items()} for t, p in self.postings.items()},
            "build_seconds": self.build_seconds,
        }
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def load(cls, path: Path = INDEX_FILE) -> "InvertedIndex":
        with path.open(encoding="utf-8") as f:
            payload = json.load(f)
        docs = [Document(**d) for d in payload["docs"]]
        postings = {t: {int(k): v for k, v in p.items()} for t, p in payload["postings"].items()}
        return cls(docs, postings, payload["field_lengths"], payload.get("build_seconds", 0.0))

    # ---- statistics used by the ranking models --------------------------------------

    @property
    def num_docs(self) -> int:
        return len(self.docs)

    def df(self, term: str) -> int:
        return len(self.postings.get(term, ()))

    def idf(self, term: str) -> float:
        """BM25 idf (the Lucene/OpenSearch form, never negative)."""
        df = self.df(term)
        return math.log(1 + (self.num_docs - df + 0.5) / (df + 0.5))

    def weighted_tf(self, entry: list[int]) -> float:
        """Field counts combined with the field weights (title 3, place 2, body 1)."""
        return sum(FIELD_WEIGHTS[name] * entry[i] for i, name in enumerate(FIELDS))

    # ---- fuzzy matching -------------------------------------------------------------

    def similar_terms(self, term: str, min_similarity: float = 0.4,
                      limit: int = 2) -> list[tuple[str, float]]:
        """Vocabulary terms that look like `term` (Jaccard similarity of character
        trigrams), for misspelt query words: 'pokara' -> 'pokhara'."""
        if self._trigram_index is None:
            index: dict[str, set[str]] = defaultdict(set)
            for vocab_term in self.postings:
                for gram in trigrams(vocab_term):
                    index[gram].add(vocab_term)
            self._trigram_index = dict(index)
        grams = trigrams(term)
        candidates: Counter[str] = Counter()
        for gram in grams:
            for vocab_term in self._trigram_index.get(gram, ()):
                candidates[vocab_term] += 1
        scored = []
        for vocab_term, shared in candidates.items():
            union = len(grams) + len(trigrams(vocab_term)) - shared
            sim = shared / union
            if sim >= min_similarity and vocab_term != term:
                scored.append((vocab_term, sim))
        # ties broken by document frequency, then alphabetically, so results are repeatable
        scored.sort(key=lambda x: (-x[1], -self.df(x[0]), x[0]))
        return scored[:limit]

    def stats(self) -> dict:
        kinds = Counter(d.kind for d in self.docs)
        num_postings = sum(len(p) for p in self.postings.values())
        return {
            "documents": self.num_docs,
            "documents_by_kind": dict(kinds),
            "vocabulary_size": len(self.postings),
            "postings": num_postings,
            "avg_field_length": dict(zip(FIELDS, (round(x, 2) for x in self.avg_field_length))),
            "geo_tagged_websites": sum(1 for d in self.docs if d.kind == "website" and d.district),
            "build_seconds": round(self.build_seconds, 2),
        }
