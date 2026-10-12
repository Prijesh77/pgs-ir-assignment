"""Retrieval models. Each takes a processed query and returns (doc_idx, score) pairs, best first.

* Boolean      exact set logic (AND by default, OR / NOT operators); no ranking.
* TF-IDF       vector space model, cosine similarity of (1 + log tf) * idf vectors.
* BM25F        Okapi BM25 over fields (title x3, place x2, body x1), k1 = 1.2, b = 0.75.
               PGS ranks with BM25 on OpenSearch using the same field boosts.
* RRF          Reciprocal Rank Fusion: combines two ranked lists by rank, not by score
               (PGS fuses its BM25 list and its LaBSE vector list this way, k = 60).
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Sequence

from pgs_ir.corpus import FIELD_WEIGHTS
from pgs_ir.index import FIELDS, InvertedIndex

K1 = 1.2
B = 0.75
RRF_K = 60


def boolean_search(index: InvertedIndex, terms: Sequence[str], operator: str = "AND",
                   exclude: Sequence[str] = ()) -> list[tuple[int, float]]:
    """Documents containing all (AND) or any (OR) of the terms, minus any NOT terms.
    Postings are intersected starting from the rarest term (the cheapest order)."""
    term_sets = [set(index.postings.get(t, {})) for t in dict.fromkeys(terms)]
    if not term_sets:
        return []
    if operator == "OR":
        result = set().union(*term_sets)
    else:
        term_sets.sort(key=len)
        result = term_sets[0].copy()
        for postings in term_sets[1:]:
            result &= postings
            if not result:
                break
    for t in exclude:
        result -= set(index.postings.get(t, {}))
    # Boolean retrieval has no notion of "better": every match scores 1, in index order.
    return [(doc_idx, 1.0) for doc_idx in sorted(result)]


class TfIdfModel:
    """Vector space model. Document vectors are precomputed once (their lengths)."""

    def __init__(self, index: InvertedIndex):
        self.index = index
        self.idf = {t: math.log(index.num_docs / len(p)) for t, p in index.postings.items()}
        norms = [0.0] * index.num_docs
        for term, postings in index.postings.items():
            idf = self.idf[term]
            for doc_idx, entry in postings.items():
                w = (1 + math.log(index.weighted_tf(entry))) * idf
                norms[doc_idx] += w * w
        self.doc_norm = [math.sqrt(n) or 1.0 for n in norms]

    def search(self, query_weights: dict[str, float]) -> list[tuple[int, float]]:
        scores: dict[int, float] = defaultdict(float)
        q_norm = 0.0
        for term, q_weight in query_weights.items():
            postings = self.index.postings.get(term)
            if not postings:
                continue
            idf = self.idf[term]
            q_w = q_weight * idf
            q_norm += q_w * q_w
            for doc_idx, entry in postings.items():
                d_w = (1 + math.log(self.index.weighted_tf(entry))) * idf
                scores[doc_idx] += q_w * d_w
        if not scores:
            return []
        q_norm = math.sqrt(q_norm)
        ranked = [(d, s / (self.doc_norm[d] * q_norm)) for d, s in scores.items()]
        ranked.sort(key=lambda x: (-x[1], x[0]))
        return ranked


class BM25FModel:
    """BM25 with per-field length normalisation (BM25F, Robertson & Zaragoza 2009):

        tf~ = sum over fields f of  w_f * tf_f / (1 - b + b * len_f / avglen_f)
        score(q, d) = sum over query terms t of  q_t * idf(t) * tf~ * (k1 + 1) / (k1 + tf~)
    """

    def __init__(self, index: InvertedIndex, k1: float = K1, b: float = B):
        self.index = index
        self.k1 = k1
        self.b = b
        self.weights = [FIELD_WEIGHTS[name] for name in FIELDS]

    def _pseudo_tf(self, doc_idx: int, entry: list[int]) -> float:
        lengths = self.index.field_lengths[doc_idx]
        total = 0.0
        for i, tf in enumerate(entry):
            if tf:
                avg = self.index.avg_field_length[i] or 1.0
                total += self.weights[i] * tf / (1 - self.b + self.b * lengths[i] / avg)
        return total

    def search(self, query_weights: dict[str, float]) -> list[tuple[int, float]]:
        scores: dict[int, float] = defaultdict(float)
        for term, q_weight in query_weights.items():
            postings = self.index.postings.get(term)
            if not postings:
                continue
            idf = self.index.idf(term)
            for doc_idx, entry in postings.items():
                tf = self._pseudo_tf(doc_idx, entry)
                scores[doc_idx] += q_weight * idf * tf * (self.k1 + 1) / (self.k1 + tf)
        ranked = list(scores.items())
        ranked.sort(key=lambda x: (-x[1], x[0]))
        return ranked


def reciprocal_rank_fusion(*ranked_lists: Sequence[tuple[int, float]], k: int = RRF_K,
                           depth: int = 100) -> list[tuple[int, float]]:
    """score(d) = sum over lists of 1 / (k + rank of d in that list)."""
    scores: dict[int, float] = defaultdict(float)
    for ranked in ranked_lists:
        for rank, (doc_idx, _) in enumerate(ranked[:depth], start=1):
            scores[doc_idx] += 1.0 / (k + rank)
    fused = list(scores.items())
    fused.sort(key=lambda x: (-x[1], x[0]))
    return fused
