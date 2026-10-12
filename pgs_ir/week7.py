"""Week 7: a full evaluation of the retrieval models built in Week 6.

    python -m pgs_ir week7

Experiments (all on the same 461 test queries as Week 6, results in results/week7/):

  E1  every model x 11 measures (P@5, P@10, R@10, R@100, F1@10, R-Prec, MAP, MRR, S@1,
      nDCG@5, nDCG@10), overall and per query group
  E2  11-point interpolated precision-recall curves
  E3  statistical significance: paired randomisation test of each model against BM25F
  E4  BM25 parameter tuning (k1, b) on half of the queries, tested on the other half
  E5  cut-off analysis: Precision@k and Recall@k for k = 1..20
  E6  per-query analysis: the distribution of AP and the queries that fail
  E7  efficiency: query latency (mean, median, 95th percentile)

Relevance is graded (Week 6 used only "relevant"): 2 = relevant, as in Week 6;
1 = partially relevant, e.g. the district's own page for "local governments in Kaski".
Binary measures count only grade 2, so they match Week 6; nDCG uses both grades.
"""

from __future__ import annotations

import json
import random
import statistics
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from pgs_ir.engine import SearchEngine
from pgs_ir.evaluate import DEPTH, build_topics
from pgs_ir.index import InvertedIndex
from pgs_ir.metrics import MEASURES, RECALL_LEVELS, binary, interpolated_precision, precision_at, recall_at
from pgs_ir.models import BM25FModel

OUT_DIR = Path(__file__).resolve().parent.parent / "results" / "week7"
BASELINE = "BM25F"
PERMUTATIONS = 10_000
SEED = 7

# (run name, engine, model, expand) - the same runs as Week 6
RUNS = [
    ("Boolean (AND)", "main", "boolean", False),
    ("TF-IDF", "main", "tfidf", False),
    ("BM25F", "main", "bm25", False),
    ("TF-IDF + expansion", "main", "tfidf", True),
    ("BM25F + expansion", "main", "bm25", True),
    ("Hybrid RRF + expansion", "main", "hybrid", True),
    ("BM25F + expansion, no segmentation", "no_seg", "bm25", True),
]
K1_GRID = [0.5, 0.9, 1.2, 1.6, 2.0]
B_GRID = [0.0, 0.25, 0.5, 0.75, 1.0]


@dataclass
class GradedTopic:
    topic_id: str
    group: str
    query: str
    grades: dict[str, int]  # doc id -> 2 (relevant) or 1 (partially relevant)


@dataclass
class RunResult:
    name: str
    ranked: dict[str, list[str]]  # topic id -> ranked doc ids (top DEPTH)
    latency_ms: list[float]


# ---- relevance judgments ----------------------------------------------------------------

def graded_topics(engine: SearchEngine) -> list[GradedTopic]:
    """Week 6's topics, with partially relevant documents added (grade 1)."""
    docs = engine.index.docs
    district_doc = {d.district: d.doc_id for d in docs if d.kind == "district"}
    province_doc = {d.province: d.doc_id for d in docs if d.kind == "province"}
    sites_of_body: dict[str, list[str]] = defaultdict(list)
    for d in docs:
        if d.kind == "website" and d.local_body:
            sites_of_body[d.local_body].append(d.doc_id)

    out = []
    for t in build_topics(engine):
        grades = {doc: 2 for doc in t.relevant}
        code = t.topic_id.split("-", 1)[1]
        if t.topic_id[:2] in ("T1", "T2"):
            grades.setdefault(district_doc[code], 1)  # the district's page lists them
        elif t.topic_id[:2] == "T3":
            grades.setdefault(province_doc[code], 1)  # the province's page lists them
        elif t.topic_id[:2] in ("T4", "T5"):
            for body in t.relevant:  # websites about that place, e.g. pokharanews.com
                for site in sites_of_body.get(body, []):
                    grades.setdefault(site, 1)
        out.append(GradedTopic(t.topic_id, t.group, t.query, grades))
    return out


# ---- running the models -----------------------------------------------------------------

def run(engine: SearchEngine, name: str, model: str, expand: bool,
        topics: list[GradedTopic]) -> RunResult:
    ranked, latency = {}, []
    for t in topics:
        started = time.perf_counter()
        response = engine.search(t.query, model=model, k=DEPTH, expand=expand)
        latency.append((time.perf_counter() - started) * 1000)
        ranked[t.topic_id] = [r.doc.doc_id for r in response.results]
    return RunResult(name, ranked, latency)


def per_query_scores(result: RunResult, topics: list[GradedTopic]) -> dict[str, dict[str, float]]:
    """measure -> {topic id -> score}"""
    return {m: {t.topic_id: fn(result.ranked[t.topic_id], t.grades) for t in topics}
            for m, fn in MEASURES.items()}


def mean(values) -> float:
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def summarise(scores: dict[str, dict[str, float]], topics: list[GradedTopic]) -> dict:
    groups = sorted({t.group for t in topics})
    out = {"ALL": {m: mean(s.values()) for m, s in scores.items()}}
    for g in groups:
        ids = [t.topic_id for t in topics if t.group == g]
        out[g] = {m: mean(s[i] for i in ids) for m, s in scores.items()}
    return out


# ---- E3: significance ---------------------------------------------------------------------

def randomisation_test(a: list[float], b: list[float], n: int = PERMUTATIONS,
                       seed: int = SEED) -> float:
    """Two-sided paired randomisation (permutation) test (Smucker et al., 2007).

    If the two systems were equally good, swapping their scores on any query would not
    matter. So we flip the sign of each per-query difference at random n times and count how
    often the mean difference is at least as large as the one observed. That share is p."""
    rng = random.Random(seed)
    diffs = [x - y for x, y in zip(a, b)]
    observed = abs(mean(diffs))
    extreme = 0
    for _ in range(n):
        total = sum(d if rng.random() < 0.5 else -d for d in diffs)
        if abs(total / len(diffs)) >= observed - 1e-12:
            extreme += 1
    return (extreme + 1) / (n + 1)


def compare(a: dict[str, float], b: dict[str, float]) -> dict:
    ids = sorted(a)
    xs, ys = [a[i] for i in ids], [b[i] for i in ids]
    wins = sum(1 for x, y in zip(xs, ys) if x > y + 1e-9)
    losses = sum(1 for x, y in zip(xs, ys) if y > x + 1e-9)
    return {"diff": mean(xs) - mean(ys), "p": randomisation_test(xs, ys),
            "wins": wins, "losses": losses, "ties": len(ids) - wins - losses}


# ---- E4: BM25 tuning ---------------------------------------------------------------------

def split_dev_test(topics: list[GradedTopic]) -> tuple[list[GradedTopic], list[GradedTopic]]:
    """Every other query of each group goes to dev (tuning), the rest to test, so both halves
    have the same mix of query types and the test half is never used for tuning."""
    dev, test = [], []
    counters: dict[str, int] = defaultdict(int)
    for t in topics:
        (dev if counters[t.group] % 2 == 0 else test).append(t)
        counters[t.group] += 1
    return dev, test


def tune_bm25(engine: SearchEngine, dev: list[GradedTopic]) -> dict:
    default = engine.bm25
    grid = {}
    for k1 in K1_GRID:
        for b in B_GRID:
            engine.bm25 = BM25FModel(engine.index, k1=k1, b=b)
            r = run(engine, f"k1={k1} b={b}", "bm25", True, dev)
            grid[f"{k1},{b}"] = mean(per_query_scores(r, dev)["MAP"].values())
    engine.bm25 = default
    best = max(grid, key=grid.get)
    k1, b = (float(x) for x in best.split(","))
    return {"grid": grid, "best_k1": k1, "best_b": b, "best_dev_map": grid[best],
            "default_dev_map": grid["1.2,0.75"]}


# ---- E5 / E6 -------------------------------------------------------------------------------

def cutoff_curve(result: RunResult, topics: list[GradedTopic], max_k: int = 20) -> dict:
    out = {"P": [], "R": []}
    for k in range(1, max_k + 1):
        out["P"].append(mean(precision_at(result.ranked[t.topic_id], binary(t.grades), k) for t in topics))
        out["R"].append(mean(recall_at(result.ranked[t.topic_id], binary(t.grades), k) for t in topics))
    return out


def pr_curve(result: RunResult, topics: list[GradedTopic]) -> list[float]:
    curves = [interpolated_precision(result.ranked[t.topic_id], binary(t.grades)) for t in topics]
    return [mean(c[i] for c in curves) for i in range(len(RECALL_LEVELS))]


def failures(result: RunResult, scores: dict[str, float], topics: list[GradedTopic],
             engine: SearchEngine, n: int = 10) -> list[dict]:
    """The n queries with the lowest AP, with what came back instead."""
    by_id = {t.topic_id: t for t in topics}
    worst = sorted(scores, key=lambda i: (scores[i], i))[:n]
    out = []
    for topic_id in worst:
        t = by_id[topic_id]
        top = result.ranked[topic_id][:3]
        first_rel = next((i for i, d in enumerate(result.ranked[topic_id], 1) if d in binary(t.grades)), None)
        out.append({"topic": topic_id, "group": t.group, "query": t.query, "AP": scores[topic_id],
                    "first_relevant_rank": first_rel,
                    "top3": [engine.index.docs[engine.index.doc_index[d]].title for d in top]})
    return out


def latency_stats(values: list[float]) -> dict:
    ordered = sorted(values)
    return {"mean": mean(ordered), "median": statistics.median(ordered),
            "p95": ordered[int(0.95 * (len(ordered) - 1))]}


# ---- everything ----------------------------------------------------------------------------

def run_week7(log=print) -> dict:
    started = time.perf_counter()
    index, _ = InvertedIndex.build()
    engines = {"main": SearchEngine(index)}
    index_no_seg, _ = InvertedIndex.build(use_segmentation=False)
    engines["no_seg"] = SearchEngine(index_no_seg, use_segmentation=False)
    topics = graded_topics(engines["main"])
    partial = sum(1 for t in topics for g in t.grades.values() if g == 1)
    log(f"{len(topics)} test queries, {sum(len(binary(t.grades)) for t in topics)} relevant "
        f"and {partial} partially relevant judgments")

    results: dict[str, RunResult] = {}
    scores: dict[str, dict] = {}
    for name, engine_name, model, expand in RUNS:
        results[name] = run(engines[engine_name], name, model, expand, topics)
        scores[name] = per_query_scores(results[name], topics)
        log(f"  ran {name}")

    # E4 first, so the tuned run can be compared like the others.
    dev, test = split_dev_test(topics)
    tuning = tune_bm25(engines["main"], dev)
    engine = engines["main"]
    engine.bm25 = BM25FModel(index, k1=tuning["best_k1"], b=tuning["best_b"])
    tuned_name = "BM25F + expansion, tuned"
    results[tuned_name] = run(engine, tuned_name, "bm25", True, topics)
    scores[tuned_name] = per_query_scores(results[tuned_name], topics)
    engine.bm25 = BM25FModel(index)
    test_ids = {t.topic_id for t in test}
    tuning["test_map_default"] = mean(v for k, v in scores["BM25F + expansion"]["MAP"].items() if k in test_ids)
    tuning["test_map_tuned"] = mean(v for k, v in scores[tuned_name]["MAP"].items() if k in test_ids)
    tuning["test_ndcg_default"] = mean(v for k, v in scores["BM25F + expansion"]["nDCG@10"].items() if k in test_ids)
    tuning["test_ndcg_tuned"] = mean(v for k, v in scores[tuned_name]["nDCG@10"].items() if k in test_ids)
    tuning["dev_queries"], tuning["test_queries"] = len(dev), len(test)
    # The fair comparison: only on the test half, which tuning never saw.
    tuning["test_significance"] = {
        m: compare({k: v for k, v in scores[tuned_name][m].items() if k in test_ids},
                   {k: v for k, v in scores["BM25F + expansion"][m].items() if k in test_ids})
        for m in ("MAP", "nDCG@10")}
    log(f"  tuned BM25: k1={tuning['best_k1']} b={tuning['best_b']}")

    report = {
        "topics": len(topics),
        "groups": {g: sum(1 for t in topics if t.group == g) for g in sorted({t.group for t in topics})},
        "judgments": {"relevant": sum(len(binary(t.grades)) for t in topics), "partial": partial},
        "measures": list(MEASURES),
        "runs": {name: summarise(s, topics) for name, s in scores.items()},
        "significance": {},
        "pr_curves": {name: pr_curve(r, topics) for name, r in results.items() if name != "Boolean (AND)"},
        "cutoff": {name: cutoff_curve(results[name], topics)
                   for name in ("BM25F", "BM25F + expansion", "Hybrid RRF + expansion")},
        "tuning": tuning,
        "latency": {name: latency_stats(r.latency_ms) for name, r in results.items()},
        "ap_distribution": {name: sorted(s["MAP"].values()) for name, s in scores.items()},
    }
    for name in scores:
        if name != BASELINE:
            report["significance"][name] = {m: compare(scores[name][m], scores[BASELINE][m])
                                            for m in ("MAP", "nDCG@10")}
    best = max(report["runs"], key=lambda n: report["runs"][n]["ALL"]["MAP"])
    report["best_run"] = best
    report["failures"] = failures(results[best], scores[best]["MAP"], topics, engines["main"])
    # Typos dominate the list above, so also show the worst of the other query types.
    no_typo = [t for t in topics if not t.topic_id.startswith("T5")]
    report["failures_other"] = failures(results[best], {t.topic_id: scores[best]["MAP"][t.topic_id] for t in no_typo},
                                        no_typo, engines["main"])
    report["zero_ap"] = {name: sum(1 for v in s["MAP"].values() if v == 0) for name, s in scores.items()}
    report["seconds"] = round(time.perf_counter() - started, 1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "week7_results.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    (OUT_DIR / "week7_results.md").write_text(format_markdown(report), encoding="utf-8")
    with (OUT_DIR / "per_query.csv").open("w", encoding="utf-8") as f:
        f.write("run,topic,group,query," + ",".join(MEASURES) + "\n")
        by_id = {t.topic_id: t for t in topics}
        for name, s in scores.items():
            for topic_id in sorted(by_id):
                t = by_id[topic_id]
                q = t.query.replace('"', "'")
                f.write(f'"{name}",{topic_id},"{t.group}","{q}",'
                        + ",".join(f"{s[m][topic_id]:.4f}" for m in MEASURES) + "\n")
    return report


# ---- printing ------------------------------------------------------------------------------

def table(header: list[str], rows: list[list[str]]) -> str:
    widths = [max(len(str(r[i])) for r in [header] + rows) for i in range(len(header))]
    line = lambda r: "  ".join(str(c).ljust(widths[0]) if i == 0 else str(c).rjust(widths[i])
                               for i, c in enumerate(r))
    return "\n".join([line(header), "  ".join("-" * w for w in widths)] + [line(r) for r in rows])


def format_text(report: dict, section: str = "all") -> str:
    out = []
    ms = report["measures"]
    if section in ("all", "E1"):
        out.append(f"E1  Effectiveness on {report['topics']} queries (mean over queries)\n")
        out.append(table(["Run"] + ms, [[n] + [f"{r['ALL'][m]:.3f}" for m in ms] for n, r in report["runs"].items()]))
    if section in ("all", "E3"):
        out.append(f"\nE3  Paired randomisation test against {BASELINE} ({PERMUTATIONS:,} permutations)\n")
        rows = []
        for n, s in report["significance"].items():
            for m in ("MAP", "nDCG@10"):
                c = s[m]
                star = "*" if c["p"] < 0.05 else ""
                rows.append([n, m, f"{c['diff']:+.3f}", f"{c['p']:.4f}{star}", f"{c['wins']}/{c['ties']}/{c['losses']}"])
        out.append(table(["Run", "Measure", "Diff", "p", "Win/Tie/Loss"], rows))
        out.append("* = significant at p < 0.05")
    if section in ("all", "E4"):
        t = report["tuning"]
        out.append(f"\nE4  BM25 tuning on {t['dev_queries']} dev queries, tested on {t['test_queries']} other queries\n")
        rows = [[f"k1={k1}"] + [f"{t['grid'][f'{k1},{b}']:.3f}" for b in B_GRID] for k1 in K1_GRID]
        out.append(table(["dev MAP"] + [f"b={b}" for b in B_GRID], rows))
        out.append(f"\nbest: k1={t['best_k1']} b={t['best_b']}  (dev MAP {t['best_dev_map']:.3f} vs default {t['default_dev_map']:.3f})")
        out.append(f"test MAP  default {t['test_map_default']:.3f} -> tuned {t['test_map_tuned']:.3f}")
        out.append(f"test nDCG@10  default {t['test_ndcg_default']:.3f} -> tuned {t['test_ndcg_tuned']:.3f}")
        for m, c in t["test_significance"].items():
            out.append(f"test {m}: diff {c['diff']:+.3f}, p = {c['p']:.4f}, win/tie/loss {c['wins']}/{c['ties']}/{c['losses']}")
    if section in ("all", "E7"):
        out.append("\nE7  Query latency (ms)\n")
        out.append(table(["Run", "mean", "median", "p95", "AP = 0"],
                         [[n, f"{l['mean']:.2f}", f"{l['median']:.2f}", f"{l['p95']:.2f}", str(report["zero_ap"][n])]
                          for n, l in report["latency"].items()]))
    if section in ("all", "E6"):
        out.append(f"\nE6  Worst queries for the best run ({report['best_run']})\n")
        rows = lambda fs: [[f["query"][:34], f["group"][:2], f"{f['AP']:.2f}", str(f["first_relevant_rank"] or "-"),
                            f["top3"][0][:30] if f["top3"] else "-"] for f in fs]
        out.append(table(["Query", "Group", "AP", "1st rel.", "Top result"], rows(report["failures"])))
        out.append("\nWorst queries of the other types (T1-T4, T6)\n")
        out.append(table(["Query", "Group", "AP", "1st rel.", "Top result"], rows(report["failures_other"])))
    return "\n".join(out)


def format_markdown(report: dict) -> str:
    ms = report["measures"]
    lines = [f"# Week 7 evaluation ({report['topics']} queries)", "",
             f"Judgments: {report['judgments']['relevant']} relevant, {report['judgments']['partial']} partially relevant.", ""]
    for group in ["ALL"] + list(report["groups"]):
        lines += [f"## {group}", "", "| Run | " + " | ".join(ms) + " |", "|---|" + "---:|" * len(ms)]
        for n, r in report["runs"].items():
            lines.append(f"| {n} | " + " | ".join(f"{r[group][m]:.3f}" for m in ms) + " |")
        lines.append("")
    lines += ["## Significance vs " + BASELINE, "", "| Run | Measure | Diff | p | W/T/L |", "|---|---|---:|---:|---:|"]
    for n, s in report["significance"].items():
        for m, c in s.items():
            lines.append(f"| {n} | {m} | {c['diff']:+.3f} | {c['p']:.4f} | {c['wins']}/{c['ties']}/{c['losses']} |")
    t = report["tuning"]
    lines += ["", f"## BM25 tuning: best k1={t['best_k1']}, b={t['best_b']}; test MAP "
              f"{t['test_map_default']:.3f} -> {t['test_map_tuned']:.3f}", ""]
    return "\n".join(lines) + "\n"
