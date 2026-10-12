"""Evaluation: test queries with known correct answers, and the standard IR measures.

The correct answers (relevance judgments, "qrels") come from the data itself, so they
are objective and need no manual labelling:

  T1  "local governments in Kaski district"  -> every local government in Kaski   (77 queries)
  T2  "कास्की जिल्लाका स्थानीय तह"             -> the same, asked in Nepali          (77)
  T3  "districts of Gandaki province"         -> every district in Gandaki          (7)
  T4  "Pokhara"                               -> that local government (known item) (100)
  T5  "Pokhra"  (one letter missing)          -> the same, with a typo              (100)
  T6  "online khabar"                         -> that website (onlinekhabar.com)    (100)

Measures (Manning, Raghavan & Schütze, ch. 8): Precision@10, Recall@10, MAP (mean
average precision), MRR (mean reciprocal rank) and nDCG@10.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path

from pgs_ir.engine import SearchEngine
from pgs_ir.index import InvertedIndex
from pgs_ir.preprocess import tokenise

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
DEPTH = 100  # how many results each run returns per query
SEED = 2026


@dataclass
class Topic:
    topic_id: str
    group: str
    query: str
    relevant: set[str]


def build_topics(engine: SearchEngine) -> list[Topic]:
    geo = engine.geo
    docs = engine.index.docs
    rng = random.Random(SEED)
    topics: list[Topic] = []

    locals_by_district: dict[str, set[str]] = {}
    for d in docs:
        if d.kind == "local_government":
            locals_by_district.setdefault(d.district, set()).add(d.doc_id)
    for code, dist in geo.districts.items():
        rel = locals_by_district.get(code, set())
        topics.append(Topic(f"T1-{code}", "T1 locals by district (EN)",
                            f"local governments in {dist['name_en']} district", rel))
        topics.append(Topic(f"T2-{code}", "T2 locals by district (NE)",
                            f"{dist['name_ne']} जिल्लाका स्थानीय तह", rel))

    for code, prov in geo.provinces.items():
        rel = {d.doc_id for d in docs if d.kind == "district" and d.province == code}
        topics.append(Topic(f"T3-{code}", "T3 districts by province",
                            f"districts of {prov['name_en']} province", rel))

    bodies = sorted(geo.local_bodies.values(), key=lambda b: b["code"])
    by_name: dict[str, set[str]] = {}
    for b in bodies:
        by_name.setdefault(b["name_en"].lower(), set()).add(b["code"])
    for b in rng.sample(bodies, 100):
        rel = by_name[b["name_en"].lower()]  # names several places share: all are right
        topics.append(Topic(f"T4-{b['code']}", "T4 local government by name",
                            b["name_en"], rel))
        name = b["name_en"]
        cut = rng.randrange(1, len(name) - 1)  # drop one letter, never the first or last
        topics.append(Topic(f"T5-{b['code']}", "T5 name with a typo",
                            name[:cut] + name[cut + 1:], rel))

    segmenter = engine.segmenter
    websites = [d for d in docs if d.kind == "website"]
    splittable = []
    for d in websites:
        first = tokenise(d.doc_id.replace(".", " "))[0]
        pieces = segmenter.split(first) if segmenter else ()
        if len(pieces) >= 2 and "".join(pieces) == first:
            splittable.append((d, pieces))
    for d, pieces in rng.sample(splittable, 100):
        topics.append(Topic(f"T6-{d.doc_id}", "T6 website by name",
                            " ".join(pieces), {d.doc_id}))
    return topics


# ---- measures ----------------------------------------------------------------------

def precision_at(ranked: list[str], relevant: set[str], k: int) -> float:
    return sum(1 for d in ranked[:k] if d in relevant) / k


def recall_at(ranked: list[str], relevant: set[str], k: int) -> float:
    return sum(1 for d in ranked[:k] if d in relevant) / len(relevant) if relevant else 0.0


def average_precision(ranked: list[str], relevant: set[str]) -> float:
    hits = 0
    total = 0.0
    for i, d in enumerate(ranked, start=1):
        if d in relevant:
            hits += 1
            total += hits / i
    return total / len(relevant) if relevant else 0.0


def reciprocal_rank(ranked: list[str], relevant: set[str]) -> float:
    for i, d in enumerate(ranked, start=1):
        if d in relevant:
            return 1.0 / i
    return 0.0


def ndcg_at(ranked: list[str], relevant: set[str], k: int) -> float:
    dcg = sum(1.0 / math.log2(i + 1) for i, d in enumerate(ranked[:k], start=1) if d in relevant)
    ideal = sum(1.0 / math.log2(i + 1) for i in range(1, min(len(relevant), k) + 1))
    return dcg / ideal if ideal else 0.0


MEASURES = {
    "P@10": lambda r, rel: precision_at(r, rel, 10),
    "R@10": lambda r, rel: recall_at(r, rel, 10),
    "MAP": average_precision,
    "MRR": reciprocal_rank,
    "nDCG@10": lambda r, rel: ndcg_at(r, rel, 10),
}

# (run name, engine to use, model, expand)
RUNS = [
    ("Boolean (AND)", "main", "boolean", False),
    ("TF-IDF", "main", "tfidf", False),
    ("BM25F", "main", "bm25", False),
    ("TF-IDF + expansion", "main", "tfidf", True),
    ("BM25F + expansion", "main", "bm25", True),
    ("Hybrid RRF + expansion", "main", "hybrid", True),
    ("BM25F + expansion, no segmentation", "no_seg", "bm25", True),
]


def run_evaluation(write: bool = True) -> dict:
    index, _ = InvertedIndex.build()
    engines = {"main": SearchEngine(index)}
    index_no_seg, _ = InvertedIndex.build(use_segmentation=False)
    engines["no_seg"] = SearchEngine(index_no_seg, use_segmentation=False)

    topics = build_topics(engines["main"])
    groups = sorted({t.group for t in topics})
    report: dict = {"topics": len(topics), "groups": {g: sum(1 for t in topics if t.group == g)
                                                       for g in groups}, "runs": {}}

    for run_name, engine_name, model, expand in RUNS:
        engine = engines[engine_name]
        by_group: dict[str, dict[str, list[float]]] = {g: {m: [] for m in MEASURES} for g in groups}
        took = []
        for topic in topics:
            response = engine.search(topic.query, model=model, k=DEPTH, expand=expand)
            took.append(response.took_ms)
            ranked = [r.doc.doc_id for r in response.results]
            for m, fn in MEASURES.items():
                value = fn(ranked, topic.relevant)
                by_group[topic.group][m].append(value)
        summary = {g: {m: round(sum(v) / len(v), 4) for m, v in ms.items()}
                   for g, ms in by_group.items()}
        summary["ALL"] = {m: round(sum(sum(by_group[g][m]) for g in groups) / len(topics), 4)
                          for m in MEASURES}
        report["runs"][run_name] = {"model": model, "expand": expand, "engine": engine_name,
                                    "mean_ms": round(sum(took) / len(took), 2), "scores": summary}

    if write:
        RESULTS_DIR.mkdir(exist_ok=True)
        (RESULTS_DIR / "evaluation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        (RESULTS_DIR / "topics.json").write_text(json.dumps(
            [{"id": t.topic_id, "group": t.group, "query": t.query, "relevant": sorted(t.relevant)}
             for t in topics], ensure_ascii=False, indent=1), encoding="utf-8")
        (RESULTS_DIR / "evaluation.md").write_text(format_report(report), encoding="utf-8")
    return report


def format_report(report: dict) -> str:
    lines = [f"# Evaluation ({report['topics']} test queries)", ""]
    header = "| Run | " + " | ".join(MEASURES) + " | ms/query |"
    sep = "|---|" + "---:|" * (len(MEASURES) + 1)
    lines += ["## All queries", "", header, sep]
    for name, run in report["runs"].items():
        s = run["scores"]["ALL"]
        lines.append(f"| {name} | " + " | ".join(f"{s[m]:.3f}" for m in MEASURES)
                     + f" | {run['mean_ms']:.1f} |")
    for group, count in report["groups"].items():
        lines += ["", f"## {group} ({count} queries)", "", "| Run | " + " | ".join(MEASURES) + " |",
                  "|---|" + "---:|" * len(MEASURES)]
        for name, run in report["runs"].items():
            s = run["scores"][group]
            lines.append(f"| {name} | " + " | ".join(f"{s[m]:.3f}" for m in MEASURES) + " |")
    return "\n".join(lines) + "\n"
