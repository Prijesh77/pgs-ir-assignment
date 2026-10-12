"""Command line:  python -m pgs_ir <command>

    build                          build the inverted index and save it to index/
    stats                          numbers about the collection and the index
    search "pokhara news" [-m bm25] [-k 10] [--no-expand]
    interactive                    type queries one after another
    evaluate                       run every model on the test queries (results/)
    week7 [--show E1|E3|E4|E6|E7]  Week 7 evaluation: all measures, significance, tuning
                                   (--show prints a saved section without re-running)
"""

from __future__ import annotations

import argparse
import sys

from pgs_ir.engine import MODELS, SearchEngine, SearchResponse
from pgs_ir.index import INDEX_FILE, InvertedIndex
from pgs_ir.query import QueryError


def _engine() -> SearchEngine:
    if not INDEX_FILE.exists():
        print("No index yet - building it first (python -m pgs_ir build).")
        index, _ = InvertedIndex.build()
        index.save()
        return SearchEngine(index)
    return SearchEngine.from_disk()


def print_response(response: SearchResponse, explain: bool = True) -> None:
    q = response.query
    if explain:
        print(f"Query      : {q.text!r}   (language: {q.language})")
        print(f"Terms      : {' '.join(q.terms) or '-'}")
        if q.filters:
            print(f"Filters    : {', '.join(f'{k}={v}' for k, v in q.filters.items())}")
        if q.operator != "AND" or q.exclude:
            print(f"Boolean    : {q.operator}" + (f", NOT {' '.join(q.exclude)}" if q.exclude else ""))
        if q.expansions and response.model != "boolean":
            print("Expansions : " + ", ".join(f"{a} -> {b} [{why}]" for a, b, why in q.expansions))
        print(f"Model      : {response.model}   hits: {response.total_hits}   "
              f"time: {response.took_ms:.1f} ms")
        print()
    if not response.results:
        print("No results.")
        return
    print(f"{'#':>3}  {'score':>7}  {'type':<17} {'title':<38} {'place':<24} url")
    for r in response.results:
        d = r.doc
        place = d.fields.get("place", "").split(" district")[0] if d.kind != "district" else ""
        place = " ".join(w for w in place.split() if w.isascii())[:24]
        print(f"{r.rank:>3}  {r.score:>7.3f}  {d.kind:<17} {d.title[:38]:<38} {place:<24} {d.url}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pgs_ir", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("build", help="build and save the index")
    sub.add_parser("stats", help="collection and index statistics")
    s = sub.add_parser("search", help="run one query")
    s.add_argument("query")
    s.add_argument("-m", "--model", choices=MODELS, default="bm25")
    s.add_argument("-k", type=int, default=10, help="number of results (default 10)")
    s.add_argument("--no-expand", action="store_true", help="no translation / spelling expansion")
    i = sub.add_parser("interactive", help="type queries one after another")
    i.add_argument("-m", "--model", choices=MODELS, default="bm25")
    sub.add_parser("evaluate", help="evaluate every model on the test queries")
    w = sub.add_parser("week7", help="Week 7 evaluation (results/week7/)")
    w.add_argument("--show", choices=["E1", "E3", "E4", "E6", "E7"],
                   help="print one section of the saved results instead of re-running")
    args = parser.parse_args(argv)

    if args.command == "build":
        index, _ = InvertedIndex.build()
        index.save()
        print(f"Index saved to {INDEX_FILE}")
        for key, value in index.stats().items():
            print(f"  {key:<20} {value}")
    elif args.command == "stats":
        for key, value in _engine().index.stats().items():
            print(f"  {key:<20} {value}")
    elif args.command == "search":
        try:
            response = _engine().search(args.query, model=args.model, k=args.k,
                                        expand=not args.no_expand)
        except QueryError as err:
            print(f"Invalid query: {err}")
            return 2
        print_response(response)
    elif args.command == "interactive":
        engine = _engine()
        print(f"PGS mini search ({args.model}). Filters: district:kaski province:gandaki "
              "category:news kind:website. Empty line to quit.")
        while True:
            try:
                text = input("\nsearch> ").strip()
            except EOFError:
                break
            if not text:
                break
            try:
                print_response(engine.search(text, model=args.model))
            except QueryError as err:
                print(f"Invalid query: {err}")
    elif args.command == "evaluate":
        from pgs_ir.evaluate import RESULTS_DIR, format_report, run_evaluation

        print(format_report(run_evaluation()))
        print(f"Saved to {RESULTS_DIR}")
    elif args.command == "week7":
        import json

        from pgs_ir.week7 import OUT_DIR, format_text, run_week7

        if args.show:
            report = json.loads((OUT_DIR / "week7_results.json").read_text(encoding="utf-8"))
            print(format_text(report, args.show))
        else:
            report = run_week7()
            print()
            print(format_text(report))
            print()
            print(f"Saved to {OUT_DIR} ({report['seconds']} s)")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Nepali text on Windows consoles
    sys.exit(main())
