// Builds report/Week8-PGS-Mini-Search.pptx: the Week 8 presentation summarising Weeks 6 and 7.
// Numbers come from results/week7/week7_results.json, sample output from report/build/samples.json.
// Run from the project root:  node report/build_week8_deck.js
const fs = require("fs");
const path = require("path");
const req = (m) => require(require.resolve(m, { paths: [path.join(__dirname, "build")] }));
const pptxgen = req("pptxgenjs");
const React = req("react");
const ReactDOMServer = req("react-dom/server");
const sharp = req("sharp");
const fa = req("react-icons/fa");
const { applyTheme } = require("./pptx_theme");

const ROOT = path.join(__dirname, "..");
const R = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "week7", "week7_results.json"), "utf8"));
const SAMPLES = JSON.parse(fs.readFileSync(path.join(__dirname, "build", "samples.json"), "utf8"));
const OUT = path.join(__dirname, "Week8-PGS-Mini-Search.pptx");
const GITHUB = "github.com/Prijesh77/pgs-ir-assignment";

// Nepal's flag colours: deep blue dominates, crimson is the accent.
const THEME = {
  name: "PGS Nepal",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0B1F3A", lt1: "FFFFFF", dk2: "334155", lt2: "EEF2F7",
    accent1: "C8102E", accent2: "1F5FA8", accent3: "0F8B7D", accent4: "E0A100",
    accent5: "64748B", accent6: "7A1F3D", hlink: "1F5FA8", folHlink: "7A1F3D",
  },
};
const HEX = THEME.colors;
const f3 = (x) => x.toFixed(3);
const S = (run, m, g = "ALL") => R.runs[run][g][m];
const T = R.tuning;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.author = "Prijesh";
pres.title = "PGS Mini Search: Week 8 presentation";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ---- layouts ----------------------------------------------------------------------------
pres.defineSlideMaster({
  title: "DARK",
  background: { color: C.text1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.55, w: 8.8, h: 1.3, fontSize: 40, bold: true,
      color: C.background1, align: "left", valign: "bottom", margin: 0 }, text: "Title" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 3.0, w: 8.8, h: 0.9, fontSize: 18,
      color: C.background2, valign: "top", margin: 0 }, text: "Subtitle" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9, h: 0.75, fontSize: 30, bold: true,
      color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "Title" } },
  ],
});

// ---- helpers ----------------------------------------------------------------------------
async function icon(Component, hex, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Component, { color: `#${hex}`, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}
// The motif: a white icon in a filled circle.
async function iconCircle(slide, Component, x, y, d, fill, name) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, objectName: `${name} circle` });
  const pad = d * 0.25;
  slide.addImage({ data: await icon(Component, "FFFFFF"), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, objectName: `${name} icon` });
}
const card = (slide, x, y, w, h, name, fill = C.background2) =>
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { type: "none" }, objectName: name });
const text = (slide, t, opts) => slide.addText(t, { isTextBox: true, margin: 0, valign: "top", ...opts });
const content = (section, title) => {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  return s;
};

async function build() {
  // 1 ---- title ------------------------------------------------------------------------
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "DARK", sectionTitle: "Introduction" });
  s.addText("PGS Mini Search", { placeholder: "title" });
  s.addText("A bilingual information retrieval system for Nepal’s public web: findings from Weeks 6 and 7", { placeholder: "body" });
  await iconCircle(s, fa.FaSearchLocation, 0.6, 0.55, 0.8, C.accent1, "Logo");
  text(s, `Prijesh  ·  Week 8 Assignment  ·  ${GITHUB}`, { x: 0.6, y: 4.75, w: 8.8, h: 0.35, fontSize: 12, color: C.background2, objectName: "Byline" });
  s.addNotes("Introduce the project: a small version of our team's PGS Search Engine, built in Week 6 and evaluated in Week 7. This talk covers the problem, the data, the method, the evaluation, the findings and what I would do next.");

  // 2 ---- problem statement --------------------------------------------------------------
  s = content("Introduction", "Problem statement");
  text(s, "Searching Nepal’s web by place is hard for a standard search engine", { x: 0.5, y: 1.1, w: 9, h: 0.4, fontSize: 16, italic: true, color: C.text2, objectName: "Lead" });
  const problems = [
    [fa.FaLanguage, "Two languages", "Content and queries mix English and Nepali (Devanagari), e.g. Pokhara and पोखरा."],
    [fa.FaMapMarkedAlt, "Place-based needs", "People search by province, district and municipality, not just keywords."],
    [fa.FaLink, "Joined web addresses", "Site names are written as one word: onlinekhabar.com, pokharanews.com."],
    [fa.FaSpellCheck, "Spelling variants", "Romanised names are spelt many ways: Pokhara, Pokhra, Pokara."],
  ];
  for (let i = 0; i < problems.length; i += 1) {
    const [Ic, head, body] = problems[i];
    const x = 0.5 + (i % 2) * 4.6;
    const y = 1.75 + Math.floor(i / 2) * 1.75;
    card(s, x, y, 4.4, 1.5, `Problem ${i + 1} card`);
    await iconCircle(s, Ic, x + 0.25, y + 0.3, 0.75, C.accent1, `Problem ${i + 1}`);
    text(s, head, { x: x + 1.2, y: y + 0.22, w: 3.0, h: 0.4, fontSize: 17, bold: true, color: C.text1, objectName: `Problem ${i + 1} title` });
    text(s, body, { x: x + 1.2, y: y + 0.62, w: 3.0, h: 0.8, fontSize: 13, color: C.text2, objectName: `Problem ${i + 1} text` });
  }
  s.addNotes("Goal: build and evaluate a retrieval system that handles both languages, place-based queries, website names written as one word, and spelling variants of romanised Nepali names.");

  // 3 ---- dataset ------------------------------------------------------------------------
  pres.addSection({ title: "Data and method" });
  s = content("Data and method", "Dataset: the PGS project’s public seed data");
  const stats = [["9,842", "documents"], ["9,005", "websites"], ["753", "local governments"], ["77 + 7", "districts + provinces"]];
  stats.forEach(([n, label], i) => {
    const x = 0.5 + i * 2.3;
    card(s, x, 1.25, 2.1, 1.45, `Stat ${i + 1} card`);
    text(s, n, { x, y: 1.4, w: 2.1, h: 0.75, fontSize: 34, bold: true, color: i === 0 ? C.accent1 : C.accent2, align: "center", fontFace: THEME.headFontFace, objectName: `Stat ${i + 1} value` });
    text(s, label, { x, y: 2.15, w: 2.1, h: 0.4, fontSize: 13, color: C.text2, align: "center", objectName: `Stat ${i + 1} label` });
  });
  text(s, [
    { text: "Sources: ", options: { bold: true } },
    { text: "nepal_geography.json (all places, English + Nepali names) and domains.json (the 9,761 sites PGS crawls, with a category), from the PGS repository.", options: { breakLine: true } },
    { text: "Fields: ", options: { bold: true } },
    { text: "title (weight 3), place (weight 2), body (weight 1), as in PGS’s OpenSearch query.", options: { breakLine: true } },
    { text: "Test set: ", options: { bold: true } },
    { text: `${R.topics} queries in 6 groups with ${R.judgments.relevant.toLocaleString("en")} relevant and ${R.judgments.partial} partially relevant answers, taken from the metadata.` },
  ], { x: 0.5, y: 3.0, w: 9, h: 2.2, fontSize: 14, color: C.text1, paraSpaceAfter: 8, objectName: "Dataset details" });
  s.addNotes("The data is public: the place list comes from the local-states-nepal dataset and the website list is the crawl list of PGS. Each website, local government, district and province is one document. The correct answers for testing come from the data itself, so they are objective.");

  // 4 ---- methodology ---------------------------------------------------------------------
  s = content("Data and method", "Methodology: the retrieval pipeline");
  const steps = [
    [fa.FaBroom, "Preprocess", "Normalise, tokenise, split joined words, stop words, stem (EN / NE)"],
    [fa.FaDatabase, "Index", "Inverted index with per-field term counts: 11,352 terms"],
    [fa.FaSlidersH, "Process query", "Filters, language, spelling fix, EN↔NE translation"],
    [fa.FaSortAmountDown, "Rank", "Boolean, TF-IDF, BM25F or Hybrid (RRF)"],
  ];
  for (let i = 0; i < steps.length; i += 1) {
    const [Ic, head, body] = steps[i];
    const x = 0.5 + i * 2.33;
    card(s, x, 1.3, 2.0, 2.55, `Step ${i + 1} card`);
    await iconCircle(s, Ic, x + 0.6, 1.5, 0.8, C.accent2, `Step ${i + 1}`);
    text(s, `${i + 1}. ${head}`, { x: x + 0.12, y: 2.45, w: 1.76, h: 0.4, fontSize: 16, bold: true, color: C.text1, align: "center", objectName: `Step ${i + 1} title` });
    text(s, body, { x: x + 0.12, y: 2.9, w: 1.76, h: 0.9, fontSize: 12.5, color: C.text2, align: "center", objectName: `Step ${i + 1} text` });
    if (i < steps.length - 1) {
      s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 2.045, y: 2.4, w: 0.24, h: 0.3, fill: { color: C.accent5 }, line: { type: "none" }, objectName: `Arrow ${i + 1}` });
    }
  }
  text(s, [
    { text: "Example: ", options: { bold: true } },
    { text: "pokharanews.com → pokhara + news;  काठमाडौंको → काठमाडौं;  pokhra → pokhara → पोखरा" },
  ], { x: 0.5, y: 4.2, w: 9, h: 0.5, fontSize: 14, color: C.text1, objectName: "Pipeline example" });
  text(s, "Pure Python, no external libraries; mirrors the design of the PGS search engine.", { x: 0.5, y: 4.75, w: 9, h: 0.4, fontSize: 13, italic: true, color: C.text2, objectName: "Pipeline note" });
  s.addNotes("The same preprocessing runs on documents and queries. Word segmentation splits website names. The Nepali stemmer strips postpositions such as ko and ma. Query processing corrects spelling with character trigrams and translates place names and common words between English and Nepali.");

  // 5 ---- models --------------------------------------------------------------------------
  s = content("Data and method", "Four retrieval models compared");
  const models = [
    ["Boolean", "AND / OR / NOT over posting lists. Exact, but no ranking.", C.accent5],
    ["TF-IDF", "Vector space model, cosine similarity of tf × idf weights.", C.accent4],
    ["BM25F", "Probabilistic model over fields, as used by OpenSearch and PGS (k1, b).", C.accent2],
    ["Hybrid RRF", "Reciprocal Rank Fusion of BM25F and TF-IDF, the method PGS uses.", C.accent6],
  ];
  models.forEach(([name, desc, color], i) => {
    const y = 1.2 + i * 0.95;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y, w: 1.9, h: 0.75, rectRadius: 0.08, fill: { color }, line: { type: "none" }, objectName: `Model ${i + 1} tag` });
    text(s, name, { x: 0.5, y, w: 1.9, h: 0.75, fontSize: 17, bold: true, color: C.background1, align: "center", valign: "middle", objectName: `Model ${i + 1} name` });
    text(s, desc, { x: 2.65, y, w: 4.0, h: 0.75, fontSize: 14, color: C.text1, valign: "middle", objectName: `Model ${i + 1} text` });
  });
  card(s, 6.95, 1.2, 2.55, 3.6, "Expansion card", C.background2);
  await iconCircle(s, fa.FaPlusCircle, 7.8, 1.4, 0.8, C.accent1, "Expansion");
  text(s, "+ Query expansion", { x: 7.1, y: 2.35, w: 2.25, h: 0.4, fontSize: 16, bold: true, color: C.text1, align: "center", objectName: "Expansion title" });
  text(s, "Each ranked model was run with and without spelling correction and English–Nepali translation of the query.",
    { x: 7.15, y: 2.85, w: 2.15, h: 1.8, fontSize: 13, color: C.text2, objectName: "Expansion text" });
  s.addNotes("Boolean is the exact-match baseline. TF-IDF and BM25F are the ranked models from the lectures. The hybrid fuses BM25F and TF-IDF by rank. Each ranked model was tested with and without query expansion, giving eight runs in total with the tuned and no-segmentation variants.");

  // 6 ---- evaluation setup ------------------------------------------------------------------
  pres.addSection({ title: "Evaluation" });
  s = content("Evaluation", "Evaluation design");
  const evalBlocks = [
    [fa.FaListOl, "461 test queries", "English and Nepali district queries, provinces, names, typos, website names"],
    [fa.FaRulerCombined, "11 measures", "Precision, recall, F1, R-Precision, MAP, MRR, Success@1 and graded nDCG"],
    [fa.FaBalanceScale, "Significance", "Paired randomisation test against BM25F, 10,000 permutations"],
    [fa.FaFlask, "Fair tuning", "BM25 k1 and b chosen on 232 dev queries, reported on 229 unseen test queries"],
  ];
  for (let i = 0; i < evalBlocks.length; i += 1) {
    const [Ic, head, body] = evalBlocks[i];
    const y = 1.2 + i * 0.97;
    await iconCircle(s, Ic, 0.5, y + 0.05, 0.65, C.accent2, `Eval ${i + 1}`);
    text(s, head, { x: 1.35, y, w: 3.4, h: 0.35, fontSize: 16, bold: true, color: C.text1, objectName: `Eval ${i + 1} title` });
    text(s, body, { x: 1.35, y: y + 0.36, w: 3.6, h: 0.55, fontSize: 12.5, color: C.text2, objectName: `Eval ${i + 1} text` });
  }
  card(s, 5.4, 1.2, 4.1, 3.75, "Grades card");
  text(s, "Graded relevance", { x: 5.65, y: 1.35, w: 3.6, h: 0.4, fontSize: 16, bold: true, color: C.text1, objectName: "Grades title" });
  text(s, [
    { text: "Query: ", options: { bold: true } },
    { text: "local governments in Kaski district", options: { italic: true, breakLine: true } },
    { text: "Grade 2 (relevant): ", options: { bold: true, color: C.accent3 } },
    { text: "Pokhara Metropolitan City, Rupa Rural Municipality …", options: { breakLine: true } },
    { text: "Grade 1 (partial): ", options: { bold: true, color: C.accent4 } },
    { text: "the Kaski District page, which lists them", options: { breakLine: true } },
    { text: "Grade 0: ", options: { bold: true, color: C.accent5 } },
    { text: "everything else" },
  ], { x: 5.65, y: 1.85, w: 3.6, h: 2.9, fontSize: 14, color: C.text1, paraSpaceAfter: 9, objectName: "Grades text" });
  s.addNotes("The answers come from the data's metadata, so no manual labelling was needed. nDCG uses the grades; the other measures count only grade 2. The significance test checks that differences are not chance. Tuning on one half and testing on the other avoids overfitting to the test queries.");

  // 7 ---- results chart ------------------------------------------------------------------------
  s = content("Evaluation", "Results: expansion and tuning lift every score");
  const runs = ["Boolean (AND)", "TF-IDF", "BM25F", "TF-IDF + expansion", "BM25F + expansion", "Hybrid RRF + expansion", "BM25F + expansion, tuned"];
  const labels = ["Boolean", "TF-IDF", "BM25F", "TF-IDF +exp", "BM25F +exp", "Hybrid +exp", "BM25F +exp tuned"];
  s.addChart(pres.charts.BAR, [
    { name: "MAP", labels, values: runs.map((r) => +S(r, "MAP").toFixed(3)) },
    { name: "nDCG@10", labels, values: runs.map((r) => +S(r, "nDCG@10").toFixed(3)) },
  ], {
    x: 0.4, y: 1.1, w: 6.3, h: 4.2, barDir: "col", barGapWidthPct: 60,
    chartColors: [HEX.accent2, HEX.accent1], showLegend: true, legendPos: "t", legendFontSize: 11, legendFontFace: "+mn-lt",
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 8, dataLabelFormatCode: "0.00", dataLabelFontFace: "+mn-lt",
    catAxisLabelFontSize: 9, catAxisLabelFontFace: "+mn-lt", catAxisLabelColor: HEX.dk2,
    valAxisMinVal: 0, valAxisMaxVal: 1, valAxisLabelFontSize: 9, valAxisLabelFontFace: "+mn-lt", valAxisLabelColor: HEX.accent5,
    valGridLine: { color: "E2E8F0", size: 0.5 }, catGridLine: { style: "none" }, objectName: "Results chart",
  });
  card(s, 6.95, 1.2, 2.55, 3.95, "Best run card");
  text(s, "Best run", { x: 7.15, y: 1.35, w: 2.15, h: 0.35, fontSize: 14, color: C.text2, objectName: "Best run label" });
  text(s, "BM25F + expansion, tuned", { x: 7.15, y: 1.7, w: 2.15, h: 0.65, fontSize: 15, bold: true, color: C.text1, objectName: "Best run name" });
  [["MAP", S("BM25F + expansion, tuned", "MAP")], ["nDCG@10", S("BM25F + expansion, tuned", "nDCG@10")], ["MRR", S("BM25F + expansion, tuned", "MRR")]].forEach(([m, v], i) => {
    text(s, f3(v), { x: 7.15, y: 2.45 + i * 0.85, w: 2.15, h: 0.5, fontSize: 28, bold: true, color: C.accent1, fontFace: THEME.headFontFace, objectName: `Best ${m} value` });
    text(s, m, { x: 7.15, y: 2.93 + i * 0.85, w: 2.15, h: 0.3, fontSize: 12, color: C.text2, objectName: `Best ${m} label` });
  });
  s.addNotes(`Expansion raises MAP from ${f3(S("BM25F", "MAP"))} to ${f3(S("BM25F + expansion", "MAP"))}. The tuned run is best on almost every measure. Precision at 10 is low for all runs only because most queries have one or two correct answers.`);

  // 8 ---- major findings ---------------------------------------------------------------------
  pres.addSection({ title: "Findings" });
  s = content("Findings", "Major findings");
  const sigExp = R.significance["BM25F + expansion"].MAP;
  const sigTfidf = R.significance["TF-IDF"].MAP;
  const findings = [
    [`+${f3(sigExp.diff)}`, "MAP from query expansion", "Translation and spelling correction; significant, p < .001", C.accent1],
    [`${f3(T.test_map_default)} → ${f3(T.test_map_tuned)}`, "MAP after tuning BM25", `k1 = ${T.best_k1}, b = ${T.best_b}, on 229 unseen queries (p < .001)`, C.accent2],
    [f3(S("Hybrid RRF + expansion", "S@1")), "queries answered at rank 1", "Hybrid RRF puts the right answer first most often (untuned runs)", C.accent3],
    [`p = ${sigTfidf.p.toFixed(2)}`, "TF-IDF vs BM25F", "No significant difference: the Week 6 gap was chance", C.accent5],
  ];
  findings.forEach(([big, label, detail, color], i) => {
    const x = 0.5 + (i % 2) * 4.6;
    const y = 1.2 + Math.floor(i / 2) * 1.95;
    card(s, x, y, 4.4, 1.75, `Finding ${i + 1} card`);
    text(s, big, { x: x + 0.3, y: y + 0.18, w: 3.9, h: 0.65, fontSize: 30, bold: true, color, fontFace: THEME.headFontFace, objectName: `Finding ${i + 1} value` });
    text(s, label, { x: x + 0.3, y: y + 0.85, w: 3.9, h: 0.35, fontSize: 15, bold: true, color: C.text1, objectName: `Finding ${i + 1} label` });
    text(s, detail, { x: x + 0.3, y: y + 1.2, w: 3.9, h: 0.45, fontSize: 12.5, color: C.text2, objectName: `Finding ${i + 1} detail` });
  });
  s.addNotes("Four takeaways. Expansion is the most valuable component. Tuning BM25 gives a further real gain on queries it never saw. Fusion helps at the very top of the list. And the small TF-IDF versus BM25F difference from Week 6 is not significant.");

  // 9 ---- sample output ----------------------------------------------------------------------
  s = content("Findings", "Sample output");
  const head = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text1 } } });
  SAMPLES.forEach((sample, i) => {
    const x = 0.5 + i * 4.6;
    text(s, [
      { text: "Query: ", options: { bold: true } },
      { text: sample.query, options: { color: C.accent1, bold: true } },
    ], { x, y: 1.15, w: 4.4, h: 0.4, fontSize: 15, color: C.text1, objectName: `Sample ${i + 1} query` });
    const exp = sample.expansions.slice(0, 2).map(([a, b]) => `${a} → ${b}`).join(";  ");
    text(s, `Expanded: ${exp}`, { x, y: 1.55, w: 4.4, h: 0.35, fontSize: 11.5, italic: true, color: C.text2, objectName: `Sample ${i + 1} expansion` });
    const rows = [[head("#"), head("Result"), head("Place")]].concat(sample.results.map((r) =>
      [String(r.rank), r.title.replace(" Rural Municipality", " Rural Mun."), r.place]));
    s.addTable(rows, {
      x, y: 2.0, w: 4.4, colW: [0.35, 2.75, 1.3], fontSize: 12, color: C.text1, fontFace: THEME.bodyFontFace,
      border: { type: "solid", pt: 0.5, color: "CBD5E1" }, rowH: 0.36, valign: "middle", objectName: `Sample ${i + 1} table`,
    });
  });
  text(s, `BM25F + expansion (tuned), top 5 of ${SAMPLES[0].hits.toLocaleString("en")} and ${SAMPLES[1].hits.toLocaleString("en")} matches. The typo is corrected and the Nepali query returns Kaski’s local governments.`,
    { x: 0.5, y: 4.4, w: 9, h: 0.6, fontSize: 13, color: C.text2, objectName: "Sample caption" });
  s.addNotes("Left: an English query with a typo. Pokhra is corrected to Pokhara, news is expanded to samachar and khabar, and Pokhara's news sites come first. Right: a Nepali query meaning local governments of Kaski; it returns Kaski's municipalities.");

  // 10 ---- critical analysis -----------------------------------------------------------------
  s = content("Findings", "Critical analysis");
  card(s, 0.5, 1.2, 4.4, 3.95, "Strengths card");
  await iconCircle(s, fa.FaCheck, 0.75, 1.4, 0.6, C.accent3, "Strengths");
  text(s, "What works", { x: 1.5, y: 1.48, w: 3.2, h: 0.45, fontSize: 18, bold: true, color: C.text1, objectName: "Strengths title" });
  text(s, [
    { text: "95% of relevant documents found in the top 100 (R@100)", options: { bullet: true, breakLine: true } },
    { text: "Bilingual queries work in both directions", options: { bullet: true, breakLine: true } },
    { text: "Segmentation makes website names findable", options: { bullet: true, breakLine: true } },
    { text: "Fast: median query under 2 ms", options: { bullet: true } },
  ], { x: 0.75, y: 2.2, w: 3.95, h: 2.8, fontSize: 14, color: C.text1, paraSpaceAfter: 8, objectName: "Strengths list" });
  card(s, 5.1, 1.2, 4.4, 3.95, "Limits card");
  await iconCircle(s, fa.FaExclamation, 5.35, 1.4, 0.6, C.accent1, "Limits");
  text(s, "Where it falls short", { x: 6.1, y: 1.48, w: 3.2, h: 0.45, fontSize: 18, bold: true, color: C.text1, objectName: "Limits title" });
  text(s, [
    { text: `All ${R.zero_ap["BM25F + expansion, tuned"]} total failures are short typos (“Bei” for Beni)`, options: { bullet: true, breakLine: true } },
    { text: "“lumbini news” → lumbinisamachar.com: over-expansion", options: { bullet: true, breakLine: true } },
    { text: "Answers come from metadata; queries follow templates", options: { bullet: true, breakLine: true } },
    { text: "Short documents: names and addresses, not full pages", options: { bullet: true } },
  ], { x: 5.35, y: 2.2, w: 3.95, h: 2.8, fontSize: 14, color: C.text1, paraSpaceAfter: 8, objectName: "Limits list" });
  s.addNotes("The remaining problem is ranking, not finding. Failures have clear causes: dropping a letter from a short name breaks trigram matching, and translating news into samachar pulls in the wrong sites. The template queries favour exact matching, so real user queries may give lower scores.");

  // 11 ---- recommendations ---------------------------------------------------------------------
  pres.addSection({ title: "Conclusion" });
  s = content("Conclusion", "Recommendations");
  const recs = [
    [fa.FaSlidersH, `Use k1 ≈ ${T.best_k1} and b ≈ ${T.best_b}`, "Short documents need little term-frequency saturation and length normalisation."],
    [fa.FaSpellCheck, "Edit-distance fallback for short words", "Catches the typos that trigram similarity misses."],
    [fa.FaCompressAlt, "Lighter expansion for website names", "Stop “news” turning into samachar and khabar when the query is a site name."],
    [fa.FaUsers, "Evaluate with real queries", "Use PGS search logs and human judgments, and index full page text."],
  ];
  for (let i = 0; i < recs.length; i += 1) {
    const [Ic, head, body] = recs[i];
    const x = 0.5 + (i % 2) * 4.6;
    const y = 1.25 + Math.floor(i / 2) * 1.9;
    await iconCircle(s, Ic, x, y, 0.75, C.accent2, `Rec ${i + 1}`);
    text(s, head, { x: x + 0.95, y: y - 0.02, w: 3.4, h: 0.65, fontSize: 16, bold: true, color: C.text1, objectName: `Rec ${i + 1} title` });
    text(s, body, { x: x + 0.95, y: y + 0.65, w: 3.4, h: 0.85, fontSize: 13, color: C.text2, objectName: `Rec ${i + 1} text` });
  }
  s.addNotes("Each recommendation answers a finding: the tuning result, the two failure causes, and the limitation of template queries.");

  // 12 ---- conclusion ------------------------------------------------------------------------
  s = pres.addSlide({ masterName: "DARK", sectionTitle: "Conclusion" });
  s.addText("Expansion and tuning make the difference", { placeholder: "title" });
  s.addText(`Best model: BM25F + expansion, tuned — MAP ${f3(S("BM25F + expansion, tuned", "MAP"))}, nDCG@10 ${f3(S("BM25F + expansion, tuned", "nDCG@10"))}`, { placeholder: "body" });
  await iconCircle(s, fa.FaGithub, 0.6, 4.15, 0.6, C.accent1, "GitHub");
  text(s, [{ text: GITHUB, options: { hyperlink: { url: `https://${GITHUB}` }, color: C.background1 } }],
    { x: 1.35, y: 4.27, w: 7, h: 0.4, fontSize: 15, color: C.background1, objectName: "GitHub link" });
  text(s, "Thank you  ·  Questions?", { x: 0.6, y: 0.6, w: 8.8, h: 0.5, fontSize: 16, color: C.background2, objectName: "Thanks" });
  s.addNotes("Summary: a bilingual IR system on the PGS project's data, evaluated with 11 measures and significance tests. Query expansion and BM25 tuning are the key results. The code and both reports are on GitHub.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
}

build().catch((e) => { console.error(e); process.exit(1); });
