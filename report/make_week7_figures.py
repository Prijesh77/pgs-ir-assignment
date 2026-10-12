"""Figures for the Week 7 report (report/images/w7_*.png).

Needs results/week7/week7_results.json (python -m pgs_ir week7).
Run from the project root:  python report/make_week7_figures.py
"""

from __future__ import annotations

import html
import json
import os
import subprocess
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # for pgs_ir
import make_figures as mf  # noqa: E402  (reuses the Edge renderer and the code-snapshot helper)

ROOT = mf.ROOT
IMAGES = mf.IMAGES
R = json.loads((ROOT / "results" / "week7" / "week7_results.json").read_text(encoding="utf-8"))

SHORT = {
    "Boolean (AND)": "Boolean",
    "TF-IDF": "TF-IDF",
    "BM25F": "BM25F",
    "TF-IDF + expansion": "TF-IDF+exp",
    "BM25F + expansion": "BM25F+exp",
    "Hybrid RRF + expansion": "Hybrid+exp",
    "BM25F + expansion, no segmentation": "BM25F+exp\n(no seg.)",
    "BM25F + expansion, tuned": "BM25F+exp\n(tuned)",
}
COLORS = {
    "Boolean (AND)": "#9ca3af", "TF-IDF": "#f59e0b", "BM25F": "#38bdf8", "TF-IDF + expansion": "#d97706",
    "BM25F + expansion": "#2563eb", "Hybrid RRF + expansion": "#7c3aed",
    "BM25F + expansion, no segmentation": "#94a3b8", "BM25F + expansion, tuned": "#059669",
}


def style(ax, title, ylabel=None):
    ax.set_title(title, fontsize=11)
    if ylabel:
        ax.set_ylabel(ylabel)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.25)


def chart_measures():
    measures = ["P@10", "R@10", "MAP", "MRR", "nDCG@10"]
    runs = list(R["runs"])
    fig, ax = plt.subplots(figsize=(11, 4.8), dpi=200)
    width = 0.8 / len(measures)
    palette = ["#0ea5e9", "#a3a3a3", "#2563eb", "#7c3aed", "#059669"]
    for i, m in enumerate(measures):
        xs = [x + (i - (len(measures) - 1) / 2) * width for x in range(len(runs))]
        ax.bar(xs, [R["runs"][r]["ALL"][m] for r in runs], width, label=m, color=palette[i])
    ax.set_xticks(range(len(runs)))
    ax.set_xticklabels([SHORT[r] for r in runs], fontsize=8.5)
    ax.set_ylim(0, 1.12)
    ax.legend(ncol=5, fontsize=8.5, frameon=False, loc="upper left")
    style(ax, f"Effectiveness of each run ({R['topics']} queries)", "score")
    fig.tight_layout()
    fig.savefig(IMAGES / "w7_chart_measures.png")
    plt.close(fig)


def chart_pr():
    fig, ax = plt.subplots(figsize=(7.5, 5), dpi=200)
    levels = [i / 10 for i in range(11)]
    for name, curve in R["pr_curves"].items():
        if "no segmentation" in name:
            continue
        ax.plot(levels, curve, marker="o", ms=3.5, lw=1.8, color=COLORS[name], label=name)
    ax.set_xlabel("recall")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.02)
    ax.legend(fontsize=8, frameon=False, loc="lower left")
    style(ax, "11-point interpolated precision-recall curves", "interpolated precision")
    fig.tight_layout()
    fig.savefig(IMAGES / "w7_chart_pr.png")
    plt.close(fig)


def chart_cutoff():
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), dpi=200)
    ks = list(range(1, 21))
    for name, c in R["cutoff"].items():
        axes[0].plot(ks, c["P"], marker="o", ms=3, color=COLORS[name], label=name)
        axes[1].plot(ks, c["R"], marker="o", ms=3, color=COLORS[name], label=name)
    for ax, t, y in ((axes[0], "Precision@k", "precision"), (axes[1], "Recall@k", "recall")):
        ax.set_xlabel("k (number of results looked at)")
        ax.set_xticks([1, 5, 10, 15, 20])
        ax.set_ylim(0, 1.02)
        style(ax, t, y)
    axes[1].legend(fontsize=8, frameon=False, loc="lower right")
    fig.tight_layout()
    fig.savefig(IMAGES / "w7_chart_cutoff.png")
    plt.close(fig)


def chart_tuning():
    from pgs_ir.week7 import B_GRID, K1_GRID

    grid = R["tuning"]["grid"]
    data = [[grid[f"{k1},{b}"] for b in B_GRID] for k1 in K1_GRID]
    fig, ax = plt.subplots(figsize=(6.5, 4.6), dpi=200)
    im = ax.imshow(data, cmap="Blues", vmin=min(map(min, data)) - 0.02, vmax=max(map(max, data)))
    ax.set_xticks(range(len(B_GRID)))
    ax.set_xticklabels([str(b) for b in B_GRID])
    ax.set_yticks(range(len(K1_GRID)))
    ax.set_yticklabels([str(k) for k in K1_GRID])
    ax.set_xlabel("b (length normalisation)")
    ax.set_ylabel("k1 (term-frequency saturation)")
    for i, row in enumerate(data):
        for j, v in enumerate(row):
            best = K1_GRID[i] == R["tuning"]["best_k1"] and B_GRID[j] == R["tuning"]["best_b"]
            default = K1_GRID[i] == 1.2 and B_GRID[j] == 0.75
            label = f"{v:.3f}" + ("\nbest" if best else "\ndefault" if default else "")
            ax.text(j, i, label, ha="center", va="center", fontsize=8,
                    color="white" if v > (min(map(min, data)) + max(map(max, data))) / 2 else "#0f172a",
                    fontweight="bold" if best or default else "normal")
    fig.colorbar(im, ax=ax, label="MAP on the dev queries")
    ax.set_title("BM25 parameter grid (BM25F + expansion)", fontsize=11)
    fig.tight_layout()
    fig.savefig(IMAGES / "w7_chart_tuning.png")
    plt.close(fig)


def chart_ap_distribution():
    runs = [r for r in R["ap_distribution"] if "no segmentation" not in r]
    fig, ax = plt.subplots(figsize=(11, 4.4), dpi=200)
    parts = ax.boxplot([R["ap_distribution"][r] for r in runs], patch_artist=True, widths=0.55,
                       medianprops={"color": "black"}, showmeans=True,
                       meanprops={"marker": "D", "markerfacecolor": "white", "markeredgecolor": "black", "markersize": 5})
    for patch, r in zip(parts["boxes"], runs):
        patch.set_facecolor(COLORS[r])
        patch.set_alpha(0.75)
    ax.set_xticks(range(1, len(runs) + 1))
    ax.set_xticklabels([SHORT[r] for r in runs], fontsize=8.5)
    ax.set_ylim(-0.03, 1.03)
    style(ax, "Distribution of average precision over the queries (◇ = mean = MAP)", "AP per query")
    fig.tight_layout()
    fig.savefig(IMAGES / "w7_chart_ap_box.png")
    plt.close(fig)


def chart_groups():
    groups = list(R["groups"])
    runs = ["BM25F", "BM25F + expansion", "Hybrid RRF + expansion", "BM25F + expansion, tuned"]
    fig, ax = plt.subplots(figsize=(11, 4.4), dpi=200)
    width = 0.8 / len(runs)
    for i, r in enumerate(runs):
        xs = [x + (i - (len(runs) - 1) / 2) * width for x in range(len(groups))]
        ax.bar(xs, [R["runs"][r][g]["nDCG@10"] for g in groups], width, label=r, color=COLORS[r])
    ax.set_xticks(range(len(groups)))
    ax.set_xticklabels([g.split(" ", 1)[0] + "\n" + g.split(" ", 1)[1] for g in groups], fontsize=8)
    ax.set_ylim(0, 1.15)
    ax.legend(ncol=4, fontsize=8, frameon=False, loc="upper left")
    style(ax, "nDCG@10 by query group", "nDCG@10")
    fig.tight_layout()
    fig.savefig(IMAGES / "w7_chart_groups.png")
    plt.close(fig)


TERMINAL_CSS = """
    .term{background:#1e1e2e;border-radius:10px;overflow:hidden;font:14px/1.5 Consolas,'Nirmala UI',monospace;color:#d9e0ee}
    .bar{background:#313244;padding:7px 12px;display:flex;gap:7px}
    .dot{width:12px;height:12px;border-radius:50%}
    pre{margin:0;padding:12px 16px;white-space:pre;font:inherit}
    .prompt{color:#a6e3a1}.cmd{color:#f9e2af}"""


def terminal(name: str, args: list[str], shown: str, max_lines: int | None = None):
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    proc = subprocess.run([sys.executable, *args], cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8")
    output = (proc.stdout + proc.stderr).rstrip()
    if max_lines:
        output = "\n".join(output.splitlines()[-max_lines:])
    body = ('<div class="term"><div class="bar"><span class="dot" style="background:#f38ba8"></span>'
            '<span class="dot" style="background:#f9e2af"></span><span class="dot" style="background:#a6e3a1"></span></div>'
            f'<pre><span class="prompt">PS pgs-ir-assignment&gt;</span> <span class="cmd">{html.escape(shown)}</span>\n'
            f"{html.escape(output)}</pre></div>")
    # Size the picture to the longest line, so the text is as large as possible in the report.
    longest = max(len(line) for line in [shown + "PS pgs-ir-assignment> "] + output.splitlines())
    width = min(mf.WIDTH, max(700, int(longest * 7.75) + 80))
    mf.render(name, mf.page(body, TERMINAL_CSS, width=width), int((output.count("\n") + 2) * 21 + 60), width=width)
    print("term", name)


if __name__ == "__main__":
    for chart in (chart_measures, chart_pr, chart_cutoff, chart_tuning, chart_ap_distribution, chart_groups):
        chart()
        print("chart", chart.__name__)

    mf.CODE_SNIPPETS = [
        ("w7_code_set_measures", "pgs_ir/metrics.py", ["precision_at", "recall_at", "f1_at", "r_precision"]),
        ("w7_code_rank_measures", "pgs_ir/metrics.py", ["average_precision", "reciprocal_rank"]),
        ("w7_code_ndcg", "pgs_ir/metrics.py", ["dcg_at", "ndcg_at"]),
        ("w7_code_pr", "pgs_ir/metrics.py", ["interpolated_precision"]),
        ("w7_code_graded", "pgs_ir/week7.py", ["graded_topics"]),
        ("w7_code_significance", "pgs_ir/week7.py", ["randomisation_test", "compare"]),
        ("w7_code_tuning", "pgs_ir/week7.py", ["split_dev_test", "tune_bm25"]),
    ]
    mf.code_figures()

    terminal("w7_run_e1", ["-m", "pgs_ir", "week7", "--show", "E1"], "python -m pgs_ir week7 --show E1")
    terminal("w7_run_e3", ["-m", "pgs_ir", "week7", "--show", "E3"], "python -m pgs_ir week7 --show E3")
    terminal("w7_run_e4", ["-m", "pgs_ir", "week7", "--show", "E4"], "python -m pgs_ir week7 --show E4")
    terminal("w7_run_e6", ["-m", "pgs_ir", "week7", "--show", "E6"], "python -m pgs_ir week7 --show E6")
    terminal("w7_run_e7", ["-m", "pgs_ir", "week7", "--show", "E7"], "python -m pgs_ir week7 --show E7")
    terminal("w7_run_tests", ["-m", "pytest", "tests/test_metrics.py", "-v", "-p", "no:asyncio", "-p", "no:cacheprovider"],
             "python -m pytest tests/test_metrics.py -v", max_lines=12)
