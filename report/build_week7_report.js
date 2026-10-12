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
  p("In the Week 6 assignment I built PGS Mini Search, a small bilingual (English and Nepali) information retrieval system based on our team project, the PGS Search Engine (tekraj, 2026). It searches 9,842 documents about Nepal’s provinces, districts, local governments and websites, and it offers four retrieval models: a Boolean model, a TF-IDF vector space model, BM25F and a hybrid that fuses BM25F and TF-IDF with Reciprocal Rank Fusion (Cormack et al., 2009)."),
  p("This report evaluates those models in depth. Week 6 reported five measures; this week the evaluation was extended to eleven measures, graded relevance judgments, precision-recall curves, statistical significance tests, tuning of the BM25 parameters on held-out queries, a per-query failure analysis and an efficiency analysis. The aim was to find out not only which model is best, but how sure we can be about it and where each model fails."),
  p(`The main findings are that query expansion (English–Nepali translation and spelling correction) gives the largest and a statistically significant improvement, that tuning BM25’s parameters raises MAP on unseen queries from ${f3(T.test_map_default)} to ${f3(T.test_map_tuned)}, and that the remaining errors come mainly from very short misspelt names and from over-expansion of the word “news”.`),
];

const method = [
  h1("Method"),
  h2("Systems Evaluated"),
  p("Eight runs were compared (Table 1). Six are the Week 6 runs; one is an ablation without word segmentation of web addresses; and one is BM25F with parameters tuned in this assignment."),
  ...table(["Run", "Description"], [
    ["Boolean (AND)", "Documents containing every query word, unranked"],
    ["TF-IDF", "Vector space model, cosine similarity"],
    ["BM25F", "BM25 over the title, place and body fields (k1 = 1.2, b = 0.75); the baseline"],
    ["TF-IDF + expansion", "TF-IDF with translation and spelling correction of the query"],
    ["BM25F + expansion", "BM25F with translation and spelling correction"],
    ["Hybrid RRF + expansion", "Reciprocal Rank Fusion of the two runs above"],
    ["BM25F + expansion, no segmentation", "Ablation: web addresses are not split into words"],
    ["BM25F + expansion, tuned", `BM25F + expansion with k1 = ${T.best_k1} and b = ${T.best_b} (tuned on the dev queries)`],
  ], [3.2, 5.8], "Runs Compared"),
  h2("Test Collection"),
  p(`The test collection has ${R.topics} queries in six groups (Table 2). Because nobody had labelled the documents by hand, the relevance judgments were derived from the metadata of the dataset, which makes them objective and repeatable. This week the judgments were made graded: a document is relevant (grade 2) when it is exactly what the query asks for, and partially relevant (grade 1) when it is closely related but not the answer. For example, for “local governments in Kaski district” every local government in Kaski is relevant and the page about Kaski District, which lists them, is partially relevant. In total there are ${R.judgments.relevant.toLocaleString("en")} relevant and ${R.judgments.partial} partially relevant judgments.`),
  ...table(["Group", "Queries", "Example", "Relevant (grade 2)", "Partially relevant (grade 1)"], [
    ["T1 Local governments by district (English)", R.groups["T1 locals by district (EN)"], "local governments in Kaski district", "Local governments in the district", "The district’s page"],
    ["T2 Local governments by district (Nepali)", R.groups["T2 locals by district (NE)"], "कास्की जिल्लाका स्थानीय तह", "Same as T1", "Same as T1"],
    ["T3 Districts by province", R.groups["T3 districts by province"], "districts of Gandaki province", "Districts in the province", "The province’s page"],
    ["T4 Local government by name", R.groups["T4 local government by name"], "Bhumlu", "That local government", "Websites about that place"],
    ["T5 Name with a typo", R.groups["T5 name with a typo"], "Bhulu", "Same as T4", "Same as T4"],
    ["T6 Website by name", R.groups["T6 website by name"], "rastriya sandesh", "That website", "None"],
  ], [2.8, 1, 2.2, 1.9, 1.9], "Test Query Groups and Relevance Grades"),
  h2("Evaluation Measures"),
  p("Eleven measures were used (Table 3), following Manning et al. (2008) and Järvelin and Kekäläinen (2002). Each is computed for one query and then averaged over all queries. The set-based and rank-based measures use binary relevance (only grade 2 counts), so they are directly comparable with Week 6; nDCG uses both grades, with a gain of 2^grade − 1, so a relevant document is worth three times a partially relevant one."),
  ...table(["Measure", "What it measures", "Best for"], [
    ["P@5, P@10", "Share of the top 5 or top 10 results that are relevant", "What a user sees on the first page"],
    ["R@10, R@100", "Share of all relevant documents found in the top 10 or top 100", "Completeness"],
    ["F1@10", "Harmonic mean of P@10 and R@10", "Balance of precision and recall"],
    ["R-Precision", "Precision at rank R, where R is the number of relevant documents", "Queries with many answers"],
    ["MAP", "Mean of average precision: precision at each relevant document’s rank", "Overall ranking quality"],
    ["MRR", "Mean of 1 / rank of the first relevant document", "Known-item search"],
    ["S@1", "Share of queries whose first result is relevant", "“I’m feeling lucky” search"],
    ["nDCG@5, nDCG@10", "Discounted cumulative gain with graded relevance, normalised to 1", "Graded relevance, top ranks"],
  ], [2, 4.7, 2.3], "Evaluation Measures"),
  p("The main formulas are:"),
  formula("AP(q) = (1 / |Rel|) · Σ_k P@k · rel(k)          MAP = mean of AP(q) over all queries"),
  formula("DCG@k = Σ_i (2^grade(i) − 1) / log2(i + 1)          nDCG@k = DCG@k / ideal DCG@k"),
  h2("Experimental Design"),
  p("Seven experiments were run with one command, python -m pgs_ir week7:"),
  numbered("E1: all runs on all eleven measures, overall and for each query group."),
  numbered("E2: 11-point interpolated precision-recall curves."),
  numbered("E3: statistical significance of each run against the BM25F baseline, with a two-sided paired randomisation test (10,000 permutations) on per-query AP and nDCG@10 (Smucker et al., 2007)."),
  numbered("E4: tuning of BM25’s k1 and b on a 5 × 5 grid. To avoid tuning on the test data, the queries were split into a development half (every other query of each group, 232 queries) used to choose the parameters and a test half (229 queries) used only to report the result."),
  numbered("E5: Precision@k and Recall@k for k = 1 to 20."),
  numbered("E6: the distribution of AP over queries and the queries where the best run fails."),
  numbered("E7: query latency."),
];

const impl = [
  h1("Implementation"),
  p("The evaluation is written in Python 3 with no external libraries and adds two modules to the Week 6 code. pgs_ir/metrics.py contains one function per measure; pgs_ir/week7.py builds the graded judgments, runs the experiments and saves the results to results/week7 (JSON, Markdown and a per-query CSV file). Every function has a docstring and inline comments that explain the formula it implements."),
  p("Figure 1 shows the set-based measures. Precision divides by k even when fewer than k results are returned, so missing results count as errors; recall divides by the total number of relevant documents."),
  ...figure("w7_code_set_measures", "Set-Based Measures: Precision, Recall, F1 and R-Precision"),
  p("Figure 2 shows average precision and reciprocal rank. Average precision adds the precision at the rank of each relevant document and divides by the number of relevant documents, so relevant documents that were never retrieved lower the score."),
  ...figure("w7_code_rank_measures", "Average Precision and Reciprocal Rank"),
  p("Figure 3 shows nDCG with graded relevance. The ideal DCG is computed from all judged documents sorted by grade, so a ranking that puts a partially relevant page above a relevant one loses points."),
  ...figure("w7_code_ndcg", "Discounted Cumulative Gain and nDCG"),
  ...figure("w7_code_pr", "11-Point Interpolated Precision"),
  p("Figure 5 shows how the graded judgments are built from the Week 6 topics, and Figure 6 the significance test. The randomisation test asks how often a random swap of the two systems’ scores on each query would give a difference at least as large as the one observed; if that happens in fewer than 5% of 10,000 random swaps, the difference is called significant."),
  ...figure("w7_code_graded", "Building Graded Relevance Judgments"),
  ...figure("w7_code_significance", "Paired Randomisation Test"),
  p("Figure 7 shows the development/test split and the parameter grid search. Splitting within each group keeps the same mix of query types in both halves."),
  ...figure("w7_code_tuning", "Development/Test Split and BM25 Parameter Tuning"),
  p("The measure functions were checked against hand-worked examples with seven unit tests (Figure 8); with the Week 6 tests, all 28 tests pass."),
  ...figure("w7_run_tests", "Unit Tests for the Measures"),
];

const e1Rows = runs.map((r) => [r, ...["P@10", "R@10", "R-Prec", "MAP", "MRR", "S@1", "nDCG@10"].map((m) => S(r, m))]);
const groupRows = Object.keys(R.groups).map((g) => [g.replace("locals", "local gov.").replace(" (EN)", ", EN").replace(" (NE)", ", NE"),
  ...["Boolean (AND)", "BM25F", "BM25F + expansion", "Hybrid RRF + expansion", "BM25F + expansion, tuned"].map((r) => S(r, "MAP", g))]);
const sigRows = runs.filter((r) => r !== "BM25F").map((r) => {
  const a = sig(r, "MAP"); const b = sig(r, "nDCG@10");
  return [r, `${a.diff >= 0 ? "+" : ""}${f3(a.diff)}`, pfmt(a.p).replace("= ", "") + (a.p < 0.05 ? "*" : ""),
    `${b.diff >= 0 ? "+" : ""}${f3(b.diff)}`, pfmt(b.p).replace("= ", "") + (b.p < 0.05 ? "*" : ""), `${a.wins}/${a.ties}/${a.losses}`];
});

const results = [
  h1("Results"),
  h2("Overall Effectiveness (E1)"),
  p("Table 4 and Figure 9 give the main measures for every run; Figure 10 is the program’s own output with all eleven measures."),
  ...table(["Run", "P@10", "R@10", "R-Prec", "MAP", "MRR", "S@1", "nDCG@10"], e1Rows,
    [3.6, 0.9, 0.9, 0.95, 0.9, 0.9, 0.9, 1.05], "Effectiveness of Each Run",
    { numeric: true, bold: bestCells(e1Rows), note: `${R.topics} queries. The best value in each column is in bold.` }),
  ...figure("w7_chart_measures", "Main Measures for Each Run"),
  ...figure("w7_run_e1", "All Eleven Measures (Program Output)"),
  p(`Precision@10 is low for every run (at most ${S("BM25F + expansion, tuned", "P@10")}). This is not a weakness of the models: 300 of the ${R.topics} queries are known-item searches with one or two correct answers, so even a perfect ranking scores only 0.1 or 0.2 on P@10. MAP, MRR and nDCG are better guides here. Query expansion raised recall the most: R@10 rose from ${S("BM25F", "R@10")} to ${S("BM25F + expansion", "R@10")} and R@100 from ${S("BM25F", "R@100")} to ${S("BM25F + expansion", "R@100")}, because translated and corrected query words find documents that the original words could not.`),
  p(`The hybrid run has the best MRR among the untuned runs (${S("Hybrid RRF + expansion", "MRR")}) and the highest share of queries answered at rank 1 (S@1 ${S("Hybrid RRF + expansion", "S@1")}), so fusing two rankers helps most at the very top of the list. The tuned BM25F run is best on almost every measure, with MAP ${S("BM25F + expansion, tuned", "MAP")} and nDCG@10 ${S("BM25F + expansion, tuned", "nDCG@10")}. The Boolean model has the highest P@5 and P@10 of the untuned runs because it returns only documents that contain every query word, but its MRR and S@1 are low because it cannot rank them.`),
  h2("Results by Query Group"),
  ...table(["Group", "Boolean", "BM25F", "BM25F + exp.", "Hybrid + exp.", "Tuned"], groupRows, [3.6, 1.1, 1.1, 1.2, 1.2, 1.1],
    "MAP by Query Group", { numeric: true }),
  ...figure("w7_chart_groups", "nDCG@10 by Query Group"),
  p(`The groups behave very differently. Spelling correction is what makes misspelt names (T5) findable at all: MAP rose from ${S("BM25F", "MAP", "T5 name with a typo")} to ${S("BM25F + expansion", "MAP", "T5 name with a typo")}. On the other hand, expansion slightly hurt website names (T6: ${S("BM25F", "MAP", "T6 website by name")} without expansion, ${S("BM25F + expansion", "MAP", "T6 website by name")} with it). Tuning helped most on the queries that ask for many documents: Nepali district queries (T2) rose from ${S("BM25F + expansion", "MAP", "T2 locals by district (NE)")} to ${S("BM25F + expansion, tuned", "MAP", "T2 locals by district (NE)")} and province queries (T3) from ${S("BM25F + expansion", "MAP", "T3 districts by province")} to ${S("BM25F + expansion, tuned", "MAP", "T3 districts by province")}.`),
  h2("Precision-Recall and Cut-off Analysis (E2, E5)"),
  ...figure("w7_chart_pr", "Interpolated Precision-Recall Curves"),
  p("The precision-recall curves (Figure 12) are almost flat. Most queries have their relevant documents together near the top, so precision hardly falls as recall rises; the level of each curve mostly reflects how many queries fail completely, which pull the average down at every recall level. The expansion runs are about 0.15 higher than the runs without expansion at every recall level, and the tuned run is highest everywhere."),
  ...figure("w7_chart_cutoff", "Precision and Recall at Cut-off k"),
  p("Figure 13 shows the usual trade-off: as more results are examined, recall rises and precision falls. With expansion, about 72% of all relevant documents are already in the top 5 (against 58% for BM25F without expansion), and recall keeps rising slowly up to rank 20 for the queries with many relevant documents."),
  h2("Statistical Significance (E3)"),
  ...table(["Run vs. BM25F", "ΔMAP", "p", "ΔnDCG@10", "p", "W/T/L (MAP)"], sigRows, [3.4, 1, 1, 1.2, 1, 1.4],
    "Paired Randomisation Test Against BM25F",
    { note: "Δ = difference in the mean. W/T/L = queries where the run was better, equal or worse. * p < .05 (two-sided, 10,000 permutations)." }),
  ...figure("w7_run_e3", "Significance Tests (Program Output)"),
  p(`All runs with query expansion are significantly better than the baseline (p < .001 for both MAP and nDCG@10). The differences between TF-IDF and BM25F without expansion (ΔMAP ${f3(sig("TF-IDF", "MAP").diff)}, p ${pfmt(sig("TF-IDF", "MAP").p)}) and the effect of removing segmentation on MAP (p ${pfmt(sig("BM25F + expansion, no segmentation", "MAP").p)}) are not significant: they could be due to chance. The win/tie/loss counts show why averages can hide detail: removing segmentation makes ${sig("BM25F + expansion, no segmentation", "MAP").wins} queries better and ${sig("BM25F + expansion, no segmentation", "MAP").losses} worse, which cancel out on average, but it destroys the website-name queries (T6 MAP ${S("BM25F + expansion, no segmentation", "MAP", "T6 website by name")}).`),
  h2("Tuning BM25 (E4)"),
  ...figure("w7_chart_tuning", "MAP on the Development Queries for Each k1 and b"),
  ...figure("w7_run_e4", "Tuning Result on the Held-Out Test Queries (Program Output)"),
  p(`The grid (Figure 15) shows that lower values of both parameters are better for this collection. The best setting, k1 = ${T.best_k1} and b = ${T.best_b}, gave a development MAP of ${f3(T.best_dev_map)} against ${f3(T.default_dev_map)} for the usual defaults (k1 = 1.2, b = 0.75). On the 229 test queries, which were not used for tuning, MAP rose from ${f3(T.test_map_default)} to ${f3(T.test_map_tuned)} and nDCG@10 from ${f3(T.test_ndcg_default)} to ${f3(T.test_ndcg_tuned)}; the tuned run was better on ${T.test_significance.MAP.wins} test queries and worse on only ${T.test_significance.MAP.losses} (p ${pfmt(T.test_significance.MAP.p)}). So the gain is real and not the result of tuning on the test data.`),
  p("The reason is the shape of the documents. They are short, and a word such as a district name rarely appears more than once in a field, so a low k1 (fast saturation) loses little. A low b reduces the penalty for longer fields. With b = 0.75, the long body field of a local government’s document (type, wards, web address) was penalised, and short websites named after a district, such as kaskinews.com, were ranked above the local governments the user asked for. With b = 0.25 this bias largely disappears."),
  h2("Per-Query Analysis and Failures (E6)"),
  ...figure("w7_chart_ap_box", "Distribution of Average Precision per Query"),
  p(`The box plots (Figure 17) show that the results are bimodal: most queries have AP close to 1 and a minority have AP of 0, with little in between. MAP is therefore mostly decided by how many queries fail completely. Without expansion, BM25F fails on ${R.zero_ap["BM25F"]} queries; with expansion the number drops to ${R.zero_ap["BM25F + expansion"]}; without segmentation it rises to ${R.zero_ap["BM25F + expansion, no segmentation"]}.`),
  ...figure("w7_run_e6", "The Worst Queries of the Best Run (Program Output)"),
  p(`Two causes explain most remaining failures (Figure 18). First, all ${R.zero_ap["BM25F + expansion, tuned"]} complete failures of the best run are misspelt names, and they are all very short (for example “Baru” for Barju, “Bei” for Beni and “Sirha” for Siraha, all names of four to six letters). Removing one letter from a short word changes most of its character trigrams, so the trigram similarity falls below the 0.4 threshold and no correction is found. An edit-distance check for short words would fix many of these. Second, among the other queries the worst are website names that contain “news”, such as “lumbini news”: the word list translates news into samachar and khabar, so lumbinisamachar.com is ranked above lumbininews.com. Expansion should be weaker, or switched off, when the query looks like a website name.`),
  h2("Efficiency (E7)"),
  ...figure("w7_run_e7", "Query Latency in Milliseconds (Program Output)"),
  p(`All models are fast enough for interactive use on this collection. The median query takes under 2 ms; the slowest run, the hybrid, has a 95th percentile of ${R.latency["Hybrid RRF + expansion"].p95.toFixed(1)} ms because it runs two models. Expansion roughly doubles the cost of a query because it adds terms, and the Boolean model is fastest (${R.latency["Boolean (AND)"].mean.toFixed(2)} ms) because it only intersects posting lists. The whole Week 7 evaluation, including the 25-setting grid search, runs in about ${Math.round(R.seconds)} seconds.`),
];

const discussion = [
  h1("Discussion"),
  p("Using several measures gave a much more complete picture than any single number. Precision@10 alone would suggest that the Boolean model is the best of the untuned runs, while MRR and S@1 show that it is the worst at putting the right answer first. MAP and nDCG@10 agree on the ranking of the runs, but nDCG also rewards placing partially relevant pages, such as the district’s own page, above unrelated documents. R@100 shows that once expansion is on, about 95% of relevant documents are retrieved somewhere in the top 100, so the remaining work is ranking rather than finding."),
  p("The significance tests changed some conclusions from Week 6. Week 6 reported that TF-IDF had a slightly higher MAP than BM25F; this difference is not significant, so the two models should be considered equal on this collection. The effect of query expansion and of tuning, on the other hand, is large and highly significant."),
  p("The evaluation has limitations. The relevance judgments come from the metadata and the queries follow templates, which favours models that match the template words exactly; this is why the Boolean model scores almost perfectly on T1 and T2. The parameters were tuned and tested on queries of the same kinds, so the tuned values may not carry over to real user queries. Finally, the documents are short, so these results describe name and place search more than full-text search of web pages."),
  p("Based on the analysis, four improvements are recommended: use k1 ≈ 0.5 and b ≈ 0.25 for BM25 on this collection; add an edit-distance fallback for short misspelt words; reduce expansion weights for queries that look like website names; and collect real queries with human relevance judgments, ideally from the PGS search logs, to confirm these results."),
];

const conclusion = [
  h1("Conclusion"),
  p(`I evaluated the retrieval models of PGS Mini Search with eleven measures, graded relevance judgments, precision-recall curves, significance tests, held-out parameter tuning, a failure analysis and an efficiency analysis. Query expansion was the most important component, improving MAP by ${f3(sig("BM25F + expansion", "MAP").diff)} over the baseline (p < .001). Tuning BM25 to k1 = ${T.best_k1} and b = ${T.best_b} further improved MAP on unseen queries from ${f3(T.test_map_default)} to ${f3(T.test_map_tuned)}, making the tuned BM25F run with expansion the best overall (MAP ${S("BM25F + expansion, tuned", "MAP")}, nDCG@10 ${S("BM25F + expansion, tuned", "nDCG@10")}). The remaining errors are well understood and point to clear next steps.`),
  h2("Source Code"),
  new Paragraph({
    indent: { firstLine: 720 }, spacing: { line: DOUBLE },
    children: [new TextRun("The code is available on GitHub at "),
      new ExternalHyperlink({ link: GITHUB, children: [new TextRun({ text: GITHUB, style: "Hyperlink" })] }),
      new TextRun(". The Week 7 code is in pgs_ir/metrics.py and pgs_ir/week7.py, the results in results/week7, and the evaluation is run with python -m pgs_ir week7.")],
  }),
];

const references = [
  h1("References", { pageBreakBefore: true }),
  reference([["Cormack, G. V., Clarke, C. L. A., & Büttcher, S. (2009). Reciprocal rank fusion outperforms Condorcet and individual rank learning methods. In "], ["Proceedings of the 32nd International ACM SIGIR Conference on Research and Development in Information Retrieval", true], [" (pp. 758–759). ACM. https://doi.org/10.1145/1571941.1572114"]]),
  reference([["Järvelin, K., & Kekäläinen, J. (2002). Cumulated gain-based evaluation of IR techniques. "], ["ACM Transactions on Information Systems, 20", true], ["(4), 422–446. https://doi.org/10.1145/582415.582418"]]),
  reference([["Manning, C. D., Raghavan, P., & Schütze, H. (2008). "], ["Introduction to information retrieval", true], [". Cambridge University Press."]]),
  reference([["Robertson, S., & Zaragoza, H. (2009). The probabilistic relevance framework: BM25 and beyond. "], ["Foundations and Trends in Information Retrieval, 3", true], ["(4), 333–389. https://doi.org/10.1561/1500000019"]]),
  reference([["Smucker, M. D., Allan, J., & Carterette, B. (2007). A comparison of statistical significance tests for information retrieval evaluation. In "], ["Proceedings of the Sixteenth ACM Conference on Information and Knowledge Management", true], [" (pp. 623–632). ACM. https://doi.org/10.1145/1321440.1321528"]]),
  reference([["tekraj. (2026). "], ["pgs-search-engine", true], [" [Computer software]. GitHub. https://github.com/tekraj/pgs-search-engine"]]),
];

const doc = apaDocument(TITLE, [...titlePage, ...intro, ...method, ...impl, ...results, ...discussion, ...conclusion, ...references]);
Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "Week7-Evaluation-Report.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes");
});
