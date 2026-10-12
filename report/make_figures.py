"""Makes the report's figures in report/images/:

* code snapshots     (functions from pgs_ir/, highlighted with Pygments)
* terminal snapshots (real output of the commands, run now)
* the architecture diagram and the evaluation chart

Pages are rendered to PNG with Microsoft Edge in headless mode.
Run from the project root:  python report/make_figures.py
"""

from __future__ import annotations

import ast
import html
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import PythonLexer

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "report" / "images"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
WIDTH = 1300

CODE_SNIPPETS = [
    ("code_analyse", "pgs_ir/preprocess.py", ["nepali_stem", "analyse"]),
    ("code_segmenter", "pgs_ir/preprocess.py", ["Segmenter.split"]),
    ("code_index_build", "pgs_ir/index.py", ["InvertedIndex.build"]),
    ("code_bm25", "pgs_ir/models.py", ["BM25FModel._pseudo_tf", "BM25FModel.search"]),
    ("code_tfidf_rrf", "pgs_ir/models.py", ["TfIdfModel.search", "reciprocal_rank_fusion"]),
    ("code_boolean", "pgs_ir/models.py", ["boolean_search"]),
    ("code_query", "pgs_ir/query.py", ["QueryProcessor.process"]),
    ("code_metrics", "pgs_ir/evaluate.py", ["average_precision", "reciprocal_rank", "ndcg_at"]),
]

COMMANDS = [
    ("run_build", ["build"]),
    ("run_pokhara_news", ["search", "pokhara news"]),
    ("run_nepali", ["search", "कास्कीको स्थानीय तह", "-k", "6"]),
    ("run_typo", ["search", "pokhra", "-k", "6"]),
    ("run_filter_hybrid", ["search", "news district:kaski", "-m", "hybrid", "-k", "6"]),
    ("run_boolean", ["search", "khabar AND kathmandu NOT post", "-m", "boolean", "-k", "6"]),
    ("run_tfidf", ["search", "districts of Gandaki province", "-m", "tfidf", "-k", "6"]),
    ("run_bm25_same", ["search", "districts of Gandaki province", "-m", "bm25", "-k", "6"]),
    ("run_invalid", ["search", "news district:atlantis"]),
]


def function_source(path: Path, qualname: str) -> tuple[int, str]:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    parts = qualname.split(".")
    nodes = tree.body
    node = None
    for part in parts:
        node = next(n for n in nodes if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name == part)
        nodes = node.body
    start = (node.decorator_list[0].lineno if node.decorator_list else node.lineno)
    lines = source.splitlines()[start - 1:node.end_lineno]
    indent = min(len(l) - len(l.lstrip()) for l in lines if l.strip())
    return start, "\n".join(l[indent:] for l in lines)


def page(body: str, css: str = "", bg: str = "#ffffff") -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{{margin:0;background:{bg};}}
    #root{{display:inline-block;padding:0;width:{WIDTH - 40}px}}
    {css}</style></head><body><div id="root">{body}</div></body></html>"""


def render(name: str, html_text: str, height: int) -> Path:
    IMAGES.mkdir(parents=True, exist_ok=True)
    out = IMAGES / f"{name}.png"
    with tempfile.TemporaryDirectory(dir=ROOT / "report" / "build") as tmp:
        src = Path(tmp) / f"{name}.html"
        src.write_text(html_text, encoding="utf-8")
        subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        f"--user-data-dir={Path(tmp) / 'profile'}", "--force-device-scale-factor=2",
                        f"--window-size={WIDTH - 40},{height}", f"--screenshot={out}", src.as_uri()],
                       check=True, capture_output=True, timeout=120)
    return out


def code_figures() -> None:
    formatter = HtmlFormatter(style="friendly", linenos="table", nowrap=False)
    css = formatter.get_style_defs(".highlight") + """
    body{font-family:'Segoe UI',sans-serif}
    .box{border:1px solid #d0d7de;border-radius:8px;overflow:hidden;margin:0 0 14px}
    .file{background:#f6f8fa;border-bottom:1px solid #d0d7de;padding:8px 14px;font:600 15px 'Segoe UI';color:#24292f}
    .highlight pre,.linenos pre{font:15px/1.45 Consolas,'Nirmala UI',monospace;margin:0;padding:10px 12px}
    .highlight{background:#fff}.linenos{background:#f6f8fa;color:#8c959f;text-align:right;user-select:none}
    table.highlighttable{border-collapse:collapse;width:100%} td.code{width:100%}"""
    for name, file, qualnames in CODE_SNIPPETS:
        boxes = []
        total_lines = 0
        for q in qualnames:
            start, code = function_source(ROOT / file, q)
            fmt = HtmlFormatter(style="friendly", linenos="table", linenostart=start)
            boxes.append(f'<div class="box"><div class="file">{file} &nbsp;·&nbsp; {q}</div>'
                         f"{highlight(code, PythonLexer(), fmt)}</div>")
            total_lines += code.count("\n") + 1
        height = int(total_lines * 21.8 + len(qualnames) * 70 + 10)
        render(name, page("".join(boxes), css), height)
        print("code", name, height)


def terminal_figures() -> None:
    css = """
    .term{background:#1e1e2e;border-radius:10px;overflow:hidden;font:14.5px/1.5 Consolas,'Nirmala UI',monospace;color:#d9e0ee}
    .bar{background:#313244;padding:7px 12px;display:flex;gap:7px}
    .dot{width:12px;height:12px;border-radius:50%}
    pre{margin:0;padding:12px 16px;white-space:pre;font:inherit}
    .prompt{color:#a6e3a1}.cmd{color:#f9e2af}"""
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    for name, args in COMMANDS:
        proc = subprocess.run([sys.executable, "-m", "pgs_ir", *args], cwd=ROOT, env=env,
                              capture_output=True, text=True, encoding="utf-8")
        output = (proc.stdout + proc.stderr).rstrip()
        shown = " ".join(f'"{a}"' if " " in a or not a.isascii() else a for a in args)
        body = (f'<div class="term"><div class="bar"><span class="dot" style="background:#f38ba8"></span>'
                f'<span class="dot" style="background:#f9e2af"></span><span class="dot" style="background:#a6e3a1"></span></div>'
                f'<pre><span class="prompt">PS pgs-ir-assignment&gt;</span> <span class="cmd">python -m pgs_ir {html.escape(shown)}</span>\n'
                f"{html.escape(output)}</pre></div>")
        lines = output.count("\n") + 2
        height = int(lines * 21.75 + 60)
        render(name, page(body, css), height)
        print("term", name, height)

    proc = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:asyncio",
                           "-p", "no:cacheprovider"], cwd=ROOT, env=env, capture_output=True,
                          text=True, encoding="utf-8")
    output = proc.stdout.rstrip()
    body = (f'<div class="term"><div class="bar"><span class="dot" style="background:#f38ba8"></span>'
            f'<span class="dot" style="background:#f9e2af"></span><span class="dot" style="background:#a6e3a1"></span></div>'
            f'<pre><span class="prompt">PS pgs-ir-assignment&gt;</span> <span class="cmd">python -m pytest -q</span>\n'
            f"{html.escape(output)}</pre></div>")
    render("run_tests", page(body, css), int((output.count("\n") + 2) * 21.75 + 60))


def evaluation_figures() -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    report = json.loads((ROOT / "results" / "evaluation.json").read_text(encoding="utf-8"))
    runs = [r for r in report["runs"] if "no segmentation" not in r]
    measures = ["MAP", "MRR", "nDCG@10", "R@10"]
    colors = ["#2563eb", "#0ea5e9", "#14b8a6", "#a3a3a3"]
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=200)
    width = 0.2
    for i, m in enumerate(measures):
        values = [report["runs"][r]["scores"]["ALL"][m] for r in runs]
        xs = [x + (i - 1.5) * width for x in range(len(runs))]
        bars = ax.bar(xs, values, width, label=m, color=colors[i])
        for b, v in zip(bars, values):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.01, f"{v:.2f}", ha="center", fontsize=6.5)
    ax.set_xticks(range(len(runs)))
    ax.set_xticklabels([r.replace(" + ", "\n+ ") for r in runs], fontsize=8.5)
    ax.set_ylim(0, 1.22)
    ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
    ax.set_ylabel("score (higher is better)")
    ax.set_title(f"Retrieval quality on {report['topics']} test queries", fontsize=11)
    ax.legend(ncol=4, fontsize=8.5, loc="upper left", frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(IMAGES / "chart_overall.png")
    plt.close(fig)

    groups = list(report["groups"])
    chosen = ["Boolean (AND)", "TF-IDF", "BM25F", "BM25F + expansion", "Hybrid RRF + expansion"]
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=200)
    width = 0.16
    palette = ["#a3a3a3", "#f59e0b", "#0ea5e9", "#2563eb", "#7c3aed"]
    for i, r in enumerate(chosen):
        values = [report["runs"][r]["scores"][g]["MAP"] for g in groups]
        xs = [x + (i - 2) * width for x in range(len(groups))]
        ax.bar(xs, values, width, label=r, color=palette[i])
    ax.set_xticks(range(len(groups)))
    ax.set_xticklabels([g.split(" ", 1)[0] + "\n" + g.split(" ", 1)[1] for g in groups], fontsize=8)
    ax.set_ylim(0, 1.22)
    ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
    ax.set_ylabel("MAP")
    ax.set_title("Mean average precision by query group", fontsize=11)
    ax.legend(ncol=3, fontsize=8, loc="upper left", frameon=False, bbox_to_anchor=(0, 1.0))
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(IMAGES / "chart_groups.png")
    plt.close(fig)
    print("charts done")


def architecture_figure() -> None:
    css = """
    body{font-family:'Segoe UI','Nirmala UI',sans-serif;color:#0f172a}
    .wrap{padding:18px 10px}
    h3{margin:0 0 8px;font-size:17px;color:#1e3a8a;letter-spacing:.02em;text-transform:uppercase}
    .row{display:flex;align-items:stretch;gap:0;margin-bottom:26px}
    .box{flex:1;border:2px solid #93c5fd;background:#eff6ff;border-radius:10px;padding:10px 12px;font-size:14.5px;line-height:1.4}
    .box b{display:block;font-size:16px;color:#1d4ed8;margin-bottom:3px}
    .box.store{background:#fefce8;border-color:#facc15}.box.store b{color:#a16207}
    .box.model{background:#f5f3ff;border-color:#c4b5fd}.box.model b{color:#6d28d9}
    .arrow{width:34px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:26px}
    .lane{border:1.5px dashed #cbd5e1;border-radius:14px;padding:12px 12px 0;margin-bottom:16px}"""
    body = """<div class="wrap">
    <div class="lane"><h3>1 · Indexing (offline, once)</h3><div class="row">
      <div class="box store"><b>Seed data</b>nepal_geography.json<br>domains.json<br>(from PGS database/data)</div><div class="arrow">→</div>
      <div class="box"><b>Documents</b>9,842 docs<br>fields: title · place · body<br>geo-tag websites by address</div><div class="arrow">→</div>
      <div class="box"><b>Preprocessing</b>NFC · lowercase · tokenise<br>segment joined words<br>stop words · stem (EN / NE)</div><div class="arrow">→</div>
      <div class="box store"><b>Inverted index</b>term → {doc: [tf per field]}<br>field lengths · 11k terms<br>saved as JSON</div>
    </div></div>
    <div class="lane"><h3>2 · Searching (online, per query)</h3><div class="row">
      <div class="box"><b>Query</b>“pokhra news district:kaski”<br>validate 1–512 chars</div><div class="arrow">→</div>
      <div class="box"><b>Query processing</b>filters · AND/OR/NOT<br>language: en / ne / mixed<br>same preprocessing</div><div class="arrow">→</div>
      <div class="box"><b>Expansion</b>spelling: pokhra → pokhara<br>place: pokhara ↔ पोखरा<br>words: news ↔ समाचार</div><div class="arrow">→</div>
      <div class="box model"><b>Retrieval model</b>Boolean · TF-IDF cosine<br>BM25F (default)<br>Hybrid = RRF(BM25F, TF-IDF)</div><div class="arrow">→</div>
      <div class="box"><b>Results</b>filter by place / category<br>top-k with score,<br>title, place, URL</div>
    </div></div>
    <div class="lane"><h3>3 · Evaluation</h3><div class="row">
      <div class="box"><b>461 test queries</b>6 groups: EN, NE, typo,<br>known-item, website names</div><div class="arrow">→</div>
      <div class="box"><b>Answers from the data</b>relevant = docs whose<br>metadata match the query</div><div class="arrow">→</div>
      <div class="box model"><b>Measures</b>P@10 · R@10 · MAP<br>MRR · nDCG@10</div><div class="arrow">→</div>
      <div class="box store"><b>results/</b>evaluation.md / .json<br>topics.json</div>
    </div></div></div>"""
    render("architecture", page(body, css), 560)
    print("architecture done")


if __name__ == "__main__":
    (ROOT / "report" / "build").mkdir(parents=True, exist_ok=True)
    if not (ROOT / "index" / "pgs_index.json").exists():
        subprocess.run([sys.executable, "-m", "pgs_ir", "build"], cwd=ROOT, check=True)
    architecture_figure()
    code_figures()
    terminal_figures()
    evaluation_figures()
