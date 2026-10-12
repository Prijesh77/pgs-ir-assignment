// Builds report/Week7-Evaluation-Report.docx (APA 7, Times New Roman, no footer) from
// results/week7/week7_results.json and the figures made by report/make_week7_figures.py.
// Run from the project root:  node report/build_week7_report.js
const fs = require("fs");
const path = require("path");
const {
  Packer, Paragraph, TextRun, PageBreak, ExternalHyperlink, DOUBLE,
  p, h1, h2, bullet, numbered, centred, formula, figure, table, reference, apaDocument,
} = require("./apa");

const ROOT = path.join(__dirname, "..");
const R = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "week7", "week7_results.json"), "utf8"));
const GITHUB = "https://github.com/Prijesh77/pgs-ir-assignment";
const TITLE = "Evaluating the Retrieval Models of a Bilingual Search System for Nepal";

const f3 = (x) => x.toFixed(3);
const S = (run, m, group = "ALL") => f3(R.runs[run][group][m]);
const runs = Object.keys(R.runs);
const T = R.tuning;
const sig = (run, m) => R.significance[run][m];
const pfmt = (p) => (p < 0.001 ? "< .001" : `= ${p.toFixed(3).replace(/^0/, "")}`);

// bold the best value in each numeric column
function bestCells(rows, firstNumCol = 1) {
  const out = [];
  for (let c = firstNumCol; c < rows[0].length; c += 1) {
    let best = 0;
    rows.forEach((r, i) => { if (parseFloat(r[c]) > parseFloat(rows[best][c])) best = i; });
    out.push(`${best},${c}`);
  }
  return out;
}

const titlePage = [
  ...[1, 2, 3].map(() => new Paragraph({ children: [], spacing: { line: DOUBLE } })),
  centred(`**${TITLE}**`),
  new Paragraph({ children: [], spacing: { line: DOUBLE } }),
  centred("Prijesh"),
  centred("[Department name], [University name]"),
  centred("[Course number]: [Course name], Week 7 Assignment"),
  centred("[Instructor name]"),
  centred("October 12, 2026"),
  new Paragraph({ children: [new PageBreak()] }),
];

const intro = [
  h1(TITLE),
  p("In Week 6 I built PGS Mini Search, a bilingual (English and Nepali) information retrieval system based on our team project, the PGS Search Engine (tekraj, 2026). It searches 9,842 documents about Nepal’s places and websites with four models: Boolean, TF-IDF, BM25F and a hybrid of the last two. This report evaluates those models with a wider set of measures (precision, recall, F1, R-Precision, MAP, MRR and nDCG), tests whether the differences are statistically significant, tunes BM25 and analyses where the models fail."),
];

const method = [
  h1("Method"),
  h2("Test Collection and Runs"),
  p(`The test collection has ${R.topics} queries in six groups: local governments by district in English (77) and in Nepali (77), districts by province (7), local governments by name (100), the same names with a typing mistake (100) and websites by name (100). The relevance judgments come from the dataset’s metadata and are graded: grade 2 means relevant (for “local governments in Kaski district”, every local government in Kaski) and grade 1 means partially relevant (the Kaski District page, which lists them). There are ${R.judgments.relevant.toLocaleString("en")} relevant and ${R.judgments.partial} partially relevant judgments. Eight runs were compared: the six Week 6 runs, BM25F + expansion without word segmentation (an ablation) and BM25F + expansion with tuned parameters.`),
  h2("Measures and Experiments"),
  ...table(["Measure", "Meaning"], [
    ["P@k, R@k, F1@10", "Share of the top k that is relevant; share of all relevant documents found in the top k; their harmonic mean"],
    ["R-Precision", "Precision at rank R, where R is the number of relevant documents"],
    ["MAP", "Mean of average precision: precision at the rank of each relevant document"],
    ["MRR, S@1", "Mean of 1 / rank of the first relevant document; share of queries answered at rank 1"],
    ["nDCG@k", "Discounted cumulative gain with graded relevance (gain 2^grade − 1), normalised to 1"],
  ], [2.2, 6.8], "Evaluation Measures"),
  p("Set and rank measures use binary relevance (grade 2 only), as in Week 6 (Manning et al., 2008); nDCG uses both grades (Järvelin & Kekäläinen, 2002). Five experiments were run with python -m pgs_ir week7: (E1) all runs on all measures; (E2) precision-recall curves; (E3) a two-sided paired randomisation test of each run against BM25F with 10,000 permutations (Smucker et al., 2007); (E4) tuning of BM25’s k1 and b on half of the queries (232, the development set), reported on the other half (229, the test set) so that the result is not biased; and (E6) a failure analysis."),
];

const impl = [
  h1("Implementation"),
  p("The evaluation adds two Python modules to the Week 6 code, with no external libraries. pgs_ir/metrics.py has one function per measure; pgs_ir/week7.py builds the graded judgments, runs the experiments and saves the results to results/week7 as JSON, Markdown and a per-query CSV file. Each function has a docstring and inline comments explaining its formula, and seven unit tests check the measures against hand-worked examples (all 28 tests of the project pass)."),
  p("Figure 1 shows average precision and reciprocal rank. Average precision adds the precision at each relevant document’s rank and divides by the number of relevant documents, so relevant documents that are never retrieved lower the score."),
  ...figure("w7_code_rank_measures", "Average Precision and Reciprocal Rank"),
  p("Figure 2 shows nDCG with graded relevance: each result’s gain is discounted by log2(rank + 1) and divided by the gain of the ideal ranking."),
  ...figure("w7_code_ndcg", "Discounted Cumulative Gain and nDCG"),
  p("Figure 3 shows the significance test. It randomly swaps the two systems’ scores on each query 10,000 times and counts how often the mean difference is as large as the observed one; that share is the p-value."),
  ...figure("w7_code_significance", "Paired Randomisation Test"),
];

const results = [
  h1("Results"),
  h2("Effectiveness of the Models"),
  ...figure("w7_run_e1", "All Measures for Each Run (Program Output)"),
  p(`Figure 4 gives every measure for every run. Query expansion (translation and spelling correction) gives the largest gain: MAP rose from ${S("BM25F", "MAP")} to ${S("BM25F + expansion", "MAP")} and R@100 from ${S("BM25F", "R@100")} to ${S("BM25F + expansion", "R@100")}, because translated and corrected words find documents the original words cannot. The hybrid run puts the right answer first most often among the untuned runs (S@1 ${S("Hybrid RRF + expansion", "S@1")}), and the tuned BM25F run is best overall (MAP ${S("BM25F + expansion, tuned", "MAP")}, nDCG@10 ${S("BM25F + expansion, tuned", "nDCG@10")}). Precision@10 is low for all runs (at most ${S("BM25F + expansion, tuned", "P@10")}) only because 300 queries have just one or two correct answers, so even a perfect ranking scores 0.1 to 0.2; MAP, MRR and nDCG are better guides. The Boolean model has high precision but a low S@1, because it cannot rank its results.`),
  p(`The query groups differ. Spelling correction makes misspelt names findable (MAP ${S("BM25F", "MAP", "T5 name with a typo")} → ${S("BM25F + expansion", "MAP", "T5 name with a typo")}), but expansion slightly hurts website names (${S("BM25F", "MAP", "T6 website by name")} → ${S("BM25F + expansion", "MAP", "T6 website by name")}), and without word segmentation website names are almost never found (MAP ${S("BM25F + expansion, no segmentation", "MAP", "T6 website by name")}).`),
  ...figure("w7_chart_pr", "Interpolated Precision-Recall Curves"),
  p("The precision-recall curves (Figure 5) are almost flat: relevant documents are usually grouped at the top, so precision barely falls as recall rises. The level of each curve is set mainly by the share of queries that fail completely. Runs with expansion are about 0.15 higher at every recall level."),
  h2("Statistical Significance"),
  ...figure("w7_run_e3", "Randomisation Tests Against BM25F (Program Output)"),
  p(`All runs with expansion are significantly better than BM25F (p < .001 for MAP and nDCG@10). The difference between TF-IDF and BM25F (ΔMAP ${f3(sig("TF-IDF", "MAP").diff)}, p ${pfmt(sig("TF-IDF", "MAP").p)}) is not significant, so the two models should be treated as equal here, correcting the impression from Week 6. Removing segmentation is not significant on average (p ${pfmt(sig("BM25F + expansion, no segmentation", "MAP").p)}) because ${sig("BM25F + expansion, no segmentation", "MAP").wins} queries improve and ${sig("BM25F + expansion, no segmentation", "MAP").losses} get worse, which shows why win/tie/loss counts should be read alongside the mean.`),
  h2("Tuning BM25"),
  ...figure("w7_run_e4", "BM25 Parameter Grid and Held-Out Test Result (Program Output)"),
  p(`Lower values of both parameters work better on this collection (Figure 7). The best setting on the development queries was k1 = ${T.best_k1} and b = ${T.best_b} (MAP ${f3(T.best_dev_map)} against ${f3(T.default_dev_map)} for the defaults k1 = 1.2, b = 0.75). On the unseen test queries MAP rose from ${f3(T.test_map_default)} to ${f3(T.test_map_tuned)} and nDCG@10 from ${f3(T.test_ndcg_default)} to ${f3(T.test_ndcg_tuned)}, better on ${T.test_significance.MAP.wins} queries and worse on ${T.test_significance.MAP.losses} (p ${pfmt(T.test_significance.MAP.p)}). The documents are short and words rarely repeat, so a low k1 loses little; a low b stops penalising the longer local-government documents, which had been ranked below short websites named after the same district.`),
  h2("Failure Analysis"),
  ...figure("w7_run_e6", "The Worst Queries of the Best Run (Program Output)"),
  p(`All ${R.zero_ap["BM25F + expansion, tuned"]} complete failures of the best run are very short misspelt names, such as “Baru” for Barju or “Bei” for Beni (Figure 8). Dropping one letter from a four- to six-letter word changes most of its character trigrams, so no spelling correction is found. Among the other queries, the worst are website names containing “news”, such as “lumbini news”: the word list translates news into samachar and khabar, so lumbinisamachar.com is ranked above lumbininews.com. All queries take under 17 ms (median under 2 ms), so speed is not a concern.`),
];

const discussion = [
  h1("Discussion"),
  p("Using many measures gave a fuller picture than one number: precision alone favours the Boolean model, while MRR and S@1 show it is weak at ranking; MAP and nDCG agree on the order of the runs; and R@100 shows that with expansion about 95% of relevant documents are found, so the remaining problem is ranking, not finding. Significance testing showed which differences are real. The main limitations are that the judgments come from metadata and the queries follow templates, which favours exact-match models such as Boolean, and that the documents are short. I recommend using k1 ≈ 0.5 and b ≈ 0.25, adding an edit-distance fallback for short misspelt words, weakening expansion for queries that look like website names, and confirming the results with real user queries."),
];

const conclusion = [
  h1("Conclusion"),
  p(`The evaluation showed that query expansion is the most valuable component (+${f3(sig("BM25F + expansion", "MAP").diff)} MAP over BM25F, p < .001) and that tuning BM25 adds a further, significant gain on unseen queries (MAP ${f3(T.test_map_default)} → ${f3(T.test_map_tuned)}). The tuned BM25F run with expansion is the best model overall, with MAP ${S("BM25F + expansion, tuned", "MAP")} and nDCG@10 ${S("BM25F + expansion, tuned", "nDCG@10")}.`),
  new Paragraph({
    indent: { firstLine: 720 }, spacing: { line: DOUBLE },
    children: [new TextRun("The code is available at "),
      new ExternalHyperlink({ link: GITHUB, children: [new TextRun({ text: GITHUB, style: "Hyperlink" })] }),
      new TextRun(". The Week 7 code is in pgs_ir/metrics.py and pgs_ir/week7.py and is run with python -m pgs_ir week7.")],
  }),
];

const references = [
  h1("References", { pageBreakBefore: true }),
  reference([["Järvelin, K., & Kekäläinen, J. (2002). Cumulated gain-based evaluation of IR techniques. "], ["ACM Transactions on Information Systems, 20", true], ["(4), 422–446. https://doi.org/10.1145/582415.582418"]]),
  reference([["Manning, C. D., Raghavan, P., & Schütze, H. (2008). "], ["Introduction to information retrieval", true], [". Cambridge University Press."]]),
  reference([["Smucker, M. D., Allan, J., & Carterette, B. (2007). A comparison of statistical significance tests for information retrieval evaluation. In "], ["Proceedings of the Sixteenth ACM Conference on Information and Knowledge Management", true], [" (pp. 623–632). ACM. https://doi.org/10.1145/1321440.1321528"]]),
  reference([["tekraj. (2026). "], ["pgs-search-engine", true], [" [Computer software]. GitHub. https://github.com/tekraj/pgs-search-engine"]]),
];

const doc = apaDocument(TITLE, [...titlePage, ...intro, ...method, ...impl, ...results, ...discussion, ...conclusion, ...references]);
Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "Week7-Evaluation-Report.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes");
});
