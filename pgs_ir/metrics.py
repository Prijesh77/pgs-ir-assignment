"""Evaluation measures for ranked retrieval (Week 7).

Every function takes
    ranked    the document ids a system returned, best first
    relevant  the ids judged relevant (binary measures), or
    grades    {doc id: grade} with 2 = relevant, 1 = partially relevant (graded measures)

and returns a number between 0 and 1 (higher is better) for ONE query. A run's score is
the mean over all queries ("macro-average"), which is how TREC reports results.

References: Manning, Raghavan & Schütze (2008), ch. 8; Järvelin & Kekäläinen (2002) for nDCG.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

# ---- set-based measures at a cut-off k --------------------------------------------------


def precision_at(ranked: Sequence[str], relevant: set[str], k: int) -> float:
    """Precision@k: what share of the top k results is relevant.
    Divides by k even when fewer than k results came back (missing results count as wrong)."""
    hits = sum(1 for doc in ranked[:k] if doc in relevant)
    return hits / k


def recall_at(ranked: Sequence[str], relevant: set[str], k: int) -> float:
    """Recall@k: what share of ALL relevant documents is in the top k."""
    if not relevant:
        return 0.0
    hits = sum(1 for doc in ranked[:k] if doc in relevant)
    return hits / len(relevant)


def f1_at(ranked: Sequence[str], relevant: set[str], k: int) -> float:
    """F1@k: harmonic mean of Precision@k and Recall@k (0 when both are 0)."""
    p = precision_at(ranked, relevant, k)
    r = recall_at(ranked, relevant, k)
    return 2 * p * r / (p + r) if p + r else 0.0


def r_precision(ranked: Sequence[str], relevant: set[str]) -> float:
    """R-Precision: precision at rank R, where R = the number of relevant documents.
    At that cut-off precision and recall are equal, so one number describes both."""
    r = len(relevant)
    return precision_at(ranked, relevant, r) if r else 0.0


def success_at(ranked: Sequence[str], relevant: set[str], k: int) -> float:
    """Success@k: 1 if at least one relevant document is in the top k, else 0."""
    return 1.0 if any(doc in relevant for doc in ranked[:k]) else 0.0


# ---- rank-based measures ---------------------------------------------------------------


def average_precision(ranked: Sequence[str], relevant: set[str]) -> float:
    """Average Precision: the mean of Precision@i over the ranks i where a relevant document
    appears. Relevant documents that were never retrieved add 0, so AP also rewards recall.
    MAP = the mean of AP over all queries."""
    if not relevant:
        return 0.0
    hits = 0
    total = 0.0
    for i, doc in enumerate(ranked, start=1):
        if doc in relevant:
            hits += 1
            total += hits / i  # precision at this relevant document's rank
    return total / len(relevant)


def reciprocal_rank(ranked: Sequence[str], relevant: set[str]) -> float:
    """Reciprocal Rank: 1 / rank of the first relevant document (0 if none was found).
    MRR = its mean over queries; it suits known-item searches with one right answer."""
    for i, doc in enumerate(ranked, start=1):
        if doc in relevant:
            return 1.0 / i
    return 0.0


def dcg_at(gains: Sequence[float], k: int) -> float:
    """Discounted Cumulative Gain: each result's gain is discounted by log2(rank + 1),
    so a relevant document at rank 1 counts fully and one at rank 10 counts ~29%."""
    return sum(g / math.log2(i + 1) for i, g in enumerate(gains[:k], start=1))


def ndcg_at(ranked: Sequence[str], grades: dict[str, int], k: int) -> float:
    """normalised DCG@k with graded relevance.

    gain(grade) = 2^grade - 1, so a relevant document (grade 2, gain 3) is worth three times
    a partially relevant one (grade 1, gain 1). DCG is divided by the ideal DCG (all judged
    documents sorted by grade), giving 1.0 for a perfect ranking."""
    gains = [2 ** grades.get(doc, 0) - 1 for doc in ranked[:k]]
    ideal = sorted((2 ** g - 1 for g in grades.values() if g > 0), reverse=True)
    ideal_dcg = dcg_at(ideal, k)
    return dcg_at(gains, k) / ideal_dcg if ideal_dcg else 0.0


# ---- precision-recall curve ------------------------------------------------------------

RECALL_LEVELS = [i / 10 for i in range(11)]  # 0.0, 0.1, ..., 1.0


def interpolated_precision(ranked: Sequence[str], relevant: set[str]) -> list[float]:
    """11-point interpolated precision (TREC): for each recall level r, the highest precision
    reached at any rank whose recall is >= r. Averaging these over queries gives the
    precision-recall curve of a run."""
    if not relevant:
        return [0.0] * len(RECALL_LEVELS)
    points: list[tuple[float, float]] = []  # (recall, precision) after each relevant hit
    hits = 0
    for i, doc in enumerate(ranked, start=1):
        if doc in relevant:
            hits += 1
            points.append((hits / len(relevant), hits / i))
    return [max((p for r, p in points if r >= level), default=0.0) for level in RECALL_LEVELS]


# ---- all measures used in the Week 7 report ----------------------------------------------

def binary(grades: dict[str, int]) -> set[str]:
    """Binary relevance for the set-based measures: only grade 2 counts as relevant."""
    return {doc for doc, g in grades.items() if g >= 2}


MEASURES = {
    # name: function(ranked, grades) -> float
    "P@5": lambda r, g: precision_at(r, binary(g), 5),
    "P@10": lambda r, g: precision_at(r, binary(g), 10),
    "R@10": lambda r, g: recall_at(r, binary(g), 10),
    "R@100": lambda r, g: recall_at(r, binary(g), 100),
    "F1@10": lambda r, g: f1_at(r, binary(g), 10),
    "R-Prec": lambda r, g: r_precision(r, binary(g)),
    "MAP": lambda r, g: average_precision(r, binary(g)),
    "MRR": lambda r, g: reciprocal_rank(r, binary(g)),
    "S@1": lambda r, g: success_at(r, binary(g), 1),
    "nDCG@5": lambda r, g: ndcg_at(r, g, 5),
    "nDCG@10": lambda r, g: ndcg_at(r, g, 10),
}
