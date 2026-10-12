// Builds report/PGS-IR-Report.docx from the figures in report/images and the numbers in
// results/evaluation.json and report/build/stats.json.
// Run from the project root:  node report/build_report.js
const fs = require("fs");
const path = require("path");
const docx = require(require.resolve("docx", { paths: [path.join(__dirname, "build")] }));
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow,
  TableCell, WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, Footer, PageNumber,
  TableOfContents, ExternalHyperlink,
} = docx;

const ROOT = path.join(__dirname, "..");
const IMG = path.join(__dirname, "images");
const evalReport = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "evaluation.json"), "utf8"));
const stats = JSON.parse(fs.readFileSync(path.join(__dirname, "build", "stats.json"), "utf8"));

const GITHUB = "https://github.com/Prijesh77/pgs-ir-assignment";
const FONT = { ascii: "Calibri", hAnsi: "Calibri", cs: "Nirmala UI", eastAsia: "Calibri" };
const MONO = { ascii: "Consolas", hAnsi: "Consolas", cs: "Nirmala UI", eastAsia: "Consolas" };
const CONTENT_DXA = 9026; // A4 width 11906 - 2 x 1440 margins
const MAX_IMG_PX = 600;

let figureNo = 0;
let tableNo = 0;

// ---- helpers --------------------------------------------------------------------------

function runs(text, base = {}) {
  // **bold** and `code` inside a string
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: MONO, size: 20, color: "1F3A8A", ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const p = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120, line: 276 }, ...opts });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], pageBreakBefore: true });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
const bullet = (text, level = 0) => new Paragraph({ numbering: { reference: "bullets", level }, children: runs(text), spacing: { after: 60 } });
const numbered = (text, instance = 1) => new Paragraph({ numbering: { reference: "numbers", level: 0, instance }, children: runs(text), spacing: { after: 60 } });
const formula = (text) => new Paragraph({
  children: [new TextRun({ text, font: { ascii: "Cambria Math", hAnsi: "Cambria Math", cs: "Nirmala UI" }, size: 22, italics: true })],
  alignment: AlignmentType.CENTER, spacing: { before: 60, after: 120 },
});
const code = (lines) => lines.map((line, i) => new Paragraph({
  children: [new TextRun({ text: line || " ", font: MONO, size: 18 })],
  shading: { type: ShadingType.CLEAR, fill: "F3F4F6", color: "auto" },
  spacing: { after: 0, before: i === 0 ? 60 : 0 },
  indent: { left: 200, right: 200 },
})).concat([new Paragraph({ children: [], spacing: { after: 80 } })]);

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), data: buf };
}

function figure(name, caption, maxWidth = MAX_IMG_PX, maxHeight = 820) {
  figureNo += 1;
  const { w, h, data } = pngSize(path.join(IMG, `${name}.png`));
  let width = Math.min(maxWidth, w);
  let height = Math.round((h * width) / w);
  if (height > maxHeight) { height = maxHeight; width = Math.round((w * height) / h); }
  return [
    new Paragraph({
      children: [new ImageRun({ type: "png", data, transformation: { width, height },
        altText: { title: caption, description: caption, name } })],
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Figure ${figureNo}. `, bold: true, size: 19, color: "374151" }),
        ...runs(caption, { size: 19, color: "374151" })],
      alignment: AlignmentType.CENTER, spacing: { after: 220 },
    }),
  ];
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "C7CDD6" };
const borders = { top: border, bottom: border, left: border, right: border };

function table(header, rows, widths, caption, opts = {}) {
  tableNo += 1;
  const total = widths.reduce((a, b) => a + b, 0);
  const scaled = widths.map((w) => Math.round((w * CONTENT_DXA) / total));
  scaled[scaled.length - 1] += CONTENT_DXA - scaled.reduce((a, b) => a + b, 0);
  const cell = (text, i, isHeader, bold) => new TableCell({
    borders,
    width: { size: scaled[i], type: WidthType.DXA },
    shading: isHeader ? { fill: "1E3A8A", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: i > 0 && opts.numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: runs(String(text), { size: 19, bold: isHeader || bold, color: isHeader ? "FFFFFF" : undefined }),
    })],
  });
  const best = opts.best || {};
  return [
    new Paragraph({
      children: [new TextRun({ text: `Table ${tableNo}. `, bold: true, size: 19, color: "374151" }),
        ...runs(caption, { size: 19, color: "374151" })],
      spacing: { before: 160, after: 80 }, keepNext: true,
    }),
    new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      columnWidths: scaled,
      rows: [
        new TableRow({ tableHeader: true, children: header.map((t, i) => cell(t, i, true)) }),
        ...rows.map((r, ri) => new TableRow({
          children: r.map((t, i) => cell(t, i, false, best[i] !== undefined && best[i] === ri)),
        })),
      ],
    }),
    new Paragraph({ children: [], spacing: { after: 160 } }),
  ];
}

// ---- evaluation tables ------------------------------------------------------------------

const MEASURES = ["P@10", "R@10", "MAP", "MRR", "nDCG@10"];
const runNames = Object.keys(evalReport.runs);
const f3 = (x) => x.toFixed(3);

function bestIndexes(rowsValues) {
  const best = {};
  MEASURES.forEach((_, mi) => {
    let bi = 0;
    rowsValues.forEach((vals, ri) => { if (vals[mi] > rowsValues[bi][mi]) bi = ri; });
    best[mi + 1] = bi;
  });
  return best;
}

function evalTable(group, caption, runs_ = runNames.filter((r) => !r.includes("no segmentation"))) {
  const values = runs_.map((r) => MEASURES.map((m) => evalReport.runs[r].scores[group][m]));
  const rows = runs_.map((r, i) => [r, ...values[i].map(f3)]);
  if (group === "ALL") runs_.forEach((r, i) => rows[i].push(evalReport.runs[r].mean_ms.toFixed(1)));
  const header = ["Run", ...MEASURES, ...(group === "ALL" ? ["ms / query"] : [])];
  const widths = [3.2, 1, 1, 1, 1, 1.2, ...(group === "ALL" ? [1.2] : [])];
  return table(header, rows, widths, caption, { numeric: true, best: bestIndexes(values) });
}
const S = (run, group, m) => f3(evalReport.runs[run].scores[group][m]);

// ---- content ----------------------------------------------------------------------------

const title = [
  new Paragraph({ children: [], spacing: { before: 1800 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Week 6 Assignment", size: 28, color: "475569" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: "PGS Mini Search", size: 60, bold: true, color: "1D4ED8" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
    children: [new TextRun({ text: "A basic bilingual information retrieval system for Nepal’s public web, built on the PGS Search Engine project’s data", size: 28, color: "1E293B" })] }),
  ...[
    ["Student", "Prijesh"],
    ["Student ID", "[add your student ID]"],
    ["Course / module", "[add the course or module name]"],
    ["Project", "PGS Search Engine (team project), github.com/tekraj/pgs-search-engine"],
    ["Code", GITHUB],
    ["Date", "12 October 2026"],
  ].map(([k, v]) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: `${k}: `, bold: true, size: 23 }),
      new TextRun({ text: v, size: 23, highlight: v.startsWith("[") || v.includes("<your") ? "yellow" : undefined })] })),
  new Paragraph({ children: [new PageBreak()] }),
  // Not a heading style, so "Contents" doesn't list itself.
  new Paragraph({ children: [new TextRun({ text: "Contents", size: 34, bold: true, color: "1E3A8A" })], spacing: { after: 200 } }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
];

const ws = stats.website_categories;
const intro = [
  h1("1. Introduction"),
  p("Our team project, **PGS Search Engine**, is a search engine for Nepal’s public web. It crawls about ten thousand Nepali websites (news, government, schools, NGOs) and lets people search them in English or Nepali and browse the results by province, district and municipality on a map. The production system is large: a Go crawler, a Spark ETL pipeline, PostgreSQL, OpenSearch, sentence-embedding models and a Next.js website."),
  p("For this assignment I built **PGS Mini Search**, a small information retrieval (IR) system that follows the same design as PGS’s search core, but where every step is written out by hand in Python so it can be explained and tested: text preprocessing, an inverted index, four retrieval models (Boolean, TF-IDF, BM25F and a hybrid), query processing with English–Nepali expansion, and an evaluation with standard IR measures."),
  h2("1.1 Goals"),
  bullet("Use a **publicly available dataset**: the PGS project’s own seed data about Nepal’s places and websites."),
  bullet("Design the full pipeline: **preprocessing → indexing → retrieval model → query processing**."),
  bullet("Implement the methods from the lectures (Boolean model, vector space model with TF-IDF, probabilistic BM25, stemming, stop words, inverted index, evaluation measures)."),
  bullet("Support the two things that make Nepal search different: **two languages and scripts** (English in Latin script, Nepali in Devanagari), and **place-based search**."),
  bullet("Measure which model works best, with test queries that have known correct answers."),
  h2("1.2 Summary of results"),
  p(`On ${evalReport.topics} test queries, query expansion (translating place names and common words between English and Nepali, and correcting spelling) gave the largest improvement: MAP rose from ${S("BM25F", "ALL", "MAP")} to ${S("BM25F + expansion", "ALL", "MAP")} for BM25F. The best overall run was the **hybrid model** (Reciprocal Rank Fusion of BM25F and TF-IDF, the same fusion method PGS uses) with MAP ${S("Hybrid RRF + expansion", "ALL", "MAP")}, MRR ${S("Hybrid RRF + expansion", "ALL", "MRR")} and nDCG@10 ${S("Hybrid RRF + expansion", "ALL", "nDCG@10")}. A search takes a few milliseconds.`),
];

const dataset = [
  h1("2. Dataset"),
  p("The collection is built from two JSON files that are part of the PGS repository (folder `database/data/`), where they are used to seed the database. Both come from public sources:"),
  ...table(["File", "What it contains", "Source"], [
    ["nepal_geography.json", "7 provinces, 77 districts, 753 local governments, each with an English and a Nepali name; local governments also have a type, number of wards and official website", "sagautam5/local-states-nepal on GitHub (public)"],
    ["domains.json", "9,761 Nepali websites, each with a category; local-government websites are linked to their local government", "PGS crawler seed list + the official local-government websites"],
  ], [2, 4.5, 2.5], "The two source files."),
  p("I turned these into **9,842 documents** of four kinds. A local government’s own website is merged into its local-government document, so each municipality appears once (like a knowledge-panel entry); the other 9,005 websites are documents of their own."),
  ...table(["Document kind", "Count", "What is in it"], [
    ["Province", stats.documents_by_kind.province, "name in English and Nepali, its districts"],
    ["District", stats.documents_by_kind.district, "name, province, its local governments"],
    ["Local government", stats.documents_by_kind.local_government, "name, type (6 metropolitan cities, 11 sub-metropolitan cities, 276 municipalities, 460 rural municipalities), district, province, wards, website address"],
    ["Website", stats.documents_by_kind.website, `web address and category: news ${ws.NEWS}, NGO ${ws.NGO}, education ${ws.EDUCATION}, government ${ws.GOVERNMENT}, other ${ws.OTHER}, commercial ${ws.COMMERCIAL}, finance ${ws.FINANCE}`],
    ["Total", stats.documents, ""],
  ], [2, 1, 6], "Documents in the collection."),
  h2("2.1 Document structure"),
  p("Each document has three text fields. The field weights copy PGS’s OpenSearch query, which boosts the title three times and the description twice:"),
  ...table(["Field", "Weight", "Contents"], [
    ["title", "3", "the name, in English and Nepali"],
    ["place", "2", "where it is: district and province names, in both languages"],
    ["body", "1", "everything else: web address, type, category labels, lists of places"],
  ], [1.5, 1, 6.5], "Document fields."),
  p("Example: the document for Pokhara Metropolitan City (id `MUN414`):"),
  ...code([
    `title : ${stats.example_doc.title}`,
    `place : ${stats.example_doc.place}`,
    `body  : ${stats.example_doc.body}`,
  ]),
  p("And a website, `pokharanews.com`. Its address names Pokhara, so it is **geo-tagged** with Pokhara, Kaski and Gandaki (PGS’s ETL geo-tags crawled pages in the same spirit):"),
  ...code([
    `title : ${stats.example_web.title}`,
    `place : ${stats.example_web.place}`,
    `body  : ${stats.example_web.body}`,
  ]),
  h2("2.2 Why this dataset"),
  bullet("It is the real data of our project, so the system searches what PGS searches: Nepal’s places and the websites PGS crawls."),
  bullet("It is **bilingual**: every place has an English and a Nepali name, so cross-language search can be tested."),
  bullet("Its metadata (category, district, province) gives **objective correct answers** for test queries, so the models can be evaluated without labelling by hand (section 6)."),
  bullet("Limitation: the documents are short (names and addresses, not full web pages). The full text of the crawled pages lives in the team’s database and was not available offline. The same code would work on full pages."),
];

const design = [
  h1("3. System design"),
  p("The system has two phases, like every search engine: **indexing** runs once and builds the inverted index; **searching** runs for each query. A third part evaluates the results."),
  ...figure("architecture", "System architecture: indexing, searching and evaluation."),
  h2("3.1 Preprocessing"),
  p("The same pipeline is applied to documents and to queries, so that a word in a query becomes exactly the same index term as in a document."),
  ...table(["Step", "What it does", "Example"], [
    ["1. Normalise", "Unicode NFC, lowercase, Devanagari digits to 0-9, punctuation to spaces", "`Pokhara-News.com` → `pokhara news com`"],
    ["2. Tokenise", "split into runs of Latin letters/digits or runs of Devanagari", "`काठमाडौंको समाचार` → 2 tokens"],
    ["3. Segment", "split words joined together in web addresses, by dynamic programming over a vocabulary of place names and common web words", "`pokharanews` → `pokhara` + `news`"],
    ["4. Stop words", "remove 120 very common English words and 40 Nepali function words", "`the`, `of`, `र`, `को`, `मा`"],
    ["5. Stem (English)", "Porter stemmer (implemented in porter.py)", "`municipalities` → `municip`"],
    ["6. Stem (Nepali)", "strip postpositions written joined to the word (को, का, मा, ले, हरू…); place names are protected", "`काठमाडौंको` → `काठमाडौं`"],
  ], [1.6, 4.2, 3.2], "Preprocessing steps."),
  p("Language detection is by script: a query with only Devanagari is Nepali (`ne`), only Latin letters is English (`en`), both is `mixed`. Examples of the whole pipeline:"),
  ...table(["Input", "Index terms"], stats.example_analyse.map(([a, b]) => [a, b.join("  ·  ")]), [4, 5], "Preprocessing examples (output of analyse())."),
  p("**Why segmentation?** Nepali news sites usually write their name as one word in the address (`onlinekhabar.com`, `kathmandupost.com`). Without splitting, a search for “online khabar” or “Kathmandu” cannot find them. The segmenter gives each known word a cost of 1 and each unknown letter a cost of 2 and picks the cheapest split, which is the standard dynamic-programming approach to word segmentation."),
  p("**Why protect place names from the Nepali stemmer?** Some names end like a postposition: `कास्की` (Kaski) ends in `की`, which is also a postposition. Stripping it would give `कास्`. The 837 Nepali place names and the local-government type words (`नगरपालिका`, `गाउँपालिका`…) are kept whole."),
  h2("3.2 Indexing"),
  p("The index is an **inverted index**: for each term, the documents that contain it and how often it appears in each field:"),
  ...code([
    '"pokhara" -> { 412: [1, 0, 0],    document 412 has it once in the title',
    '               538: [0, 1, 0],    document 538 once in the place field',
    "               ... }",
  ]),
  p("The index also keeps every document’s field lengths (needed by BM25), the document table, and a character-trigram index of the vocabulary used for spelling correction. It is saved as one JSON file, so it is built once and loaded for each search."),
  ...table(["Statistic", "Value"], [
    ["Documents", stats.documents.toLocaleString("en")],
    ["Vocabulary (distinct terms)", stats.vocabulary_size.toLocaleString("en")],
    ["Postings (term-document pairs)", stats.postings.toLocaleString("en")],
    ["Average field length (terms)", `title ${stats.avg_field_length.title}, place ${stats.avg_field_length.place}, body ${stats.avg_field_length.body}`],
    ["Websites geo-tagged from their address", stats.geo_tagged_websites],
    ["Build time", `${stats.build_seconds} s`],
    ["Index file size", `${(stats.index_bytes / 1e6).toFixed(1)} MB`],
  ], [4, 5], "Index statistics."),
  h2("3.3 Retrieval models"),
  p("Four models were implemented so they can be compared on the same index."),
  h3("Boolean model"),
  p("Exact set logic over the postings lists: `AND` (default) intersects them, `OR` unites them, `NOT` subtracts. Intersection starts from the rarest term because that is the cheapest order. Every match scores 1, so the results are not ranked."),
  h3("Vector space model (TF-IDF, cosine similarity)"),
  p("Documents and queries are vectors of term weights; the score is the cosine of the angle between them:"),
  formula("w(t, d) = (1 + log tf′(t, d)) × idf(t),    idf(t) = log(N / df(t))"),
  formula("score(q, d) = Σ w(t, q) · w(t, d) / ( |q| · |d| )"),
  p("where tf′ is the field-weighted term frequency (3 × title + 2 × place + 1 × body) and N the number of documents. Document vector lengths |d| are computed once at start-up."),
  h3("BM25F (probabilistic model, the default)"),
  p("Okapi BM25 is the ranking function of Lucene, Elasticsearch and OpenSearch, and therefore of PGS. BM25F is its version for documents with fields: each field’s term frequency is normalised by that field’s length before the fields are combined:"),
  formula("tf~(t, d) = Σ_f  w_f · tf_f(t, d) / (1 − b + b · len_f(d) / avglen_f)"),
  formula("score(q, d) = Σ_t  q_t · idf(t) · tf~(t, d) · (k1 + 1) / (k1 + tf~(t, d))"),
  formula("idf(t) = log(1 + (N − df(t) + 0.5) / (df(t) + 0.5))"),
  p("with k1 = 1.2 and b = 0.75 (the usual values), field weights w = 3, 2, 1, and q_t the weight of the query term (1 for the user’s words, less for expansions). Compared with TF-IDF, BM25 **saturates** term frequency (the tenth occurrence of a word adds little) and normalises length gently instead of dividing by the full vector length."),
  h3("Hybrid: Reciprocal Rank Fusion (RRF)"),
  p("PGS combines two different retrievers, BM25 on OpenSearch and LaBSE sentence vectors, with Reciprocal Rank Fusion. RRF uses the ranks, not the scores, so the two lists do not need comparable score scales:"),
  formula("RRF(d) = Σ over lists  1 / (k + rank(d)),    k = 60"),
  p("Here the second list comes from TF-IDF instead of a neural model, which keeps the system small but shows the same fusion step."),
  h3("Why these models"),
  bullet("**Boolean**: the baseline from the first lectures; good for exact, precise queries; no ranking."),
  bullet("**TF-IDF**: the classic ranked model; shows the effect of idf and length normalisation."),
  bullet("**BM25F**: the model actually used by PGS (through OpenSearch) and the standard in practice; handles fields and long documents better."),
  bullet("**Hybrid RRF**: mirrors PGS’s final ranking step and tests whether two rankers together beat one."),
  h2("3.4 Query processing"),
  p("A query goes through these steps (`pgs_ir/query.py`):"),
  numbered("**Validate**: 1 to 512 characters (the same limit as PGS)."),
  numbered("**Filters**: `district:kaski`, `province:gandaki`, `category:news`, `kind:website` are taken out of the text and applied to the results (PGS’s map uses the same kind of province/district filters). District and province names can be typed in English or Nepali."),
  numbered("**Boolean operators**: `AND`, `OR`, `NOT word` in capitals, for the Boolean model."),
  numbered("**Analyse**: the same preprocessing as the documents, and language detection."),
  numbered("**Spelling correction**: a word the index has never seen is probably misspelt; the closest vocabulary words by character-trigram similarity (Jaccard ≥ 0.4) are added, like OpenSearch’s fuzziness in PGS. `pokhra` → `pokhara`."),
  numbered("**Translation**: phrases of one to three words are looked up in an English ↔ Nepali table built from the 837 place names (`Pokhara ↔ पोखरा`) and a small word list (`news ↔ समाचार`, `khabar → news`, `municipality ↔ नगरपालिका`). PGS uses a place-name map and the NLLB-200 translation model for this; the word list stands in for the translation model."),
  numbered("**Weights**: the user’s own words weigh 1.0, spelling corrections 0.9, translations 0.7, so the original words still count most."),
];

const impl = [
  h1("4. Implementation"),
  p("The system is written in **Python 3** using only the standard library, so it runs anywhere with `python -m pgs_ir`. Pytest is used for the unit tests and Matplotlib and Pygments for the report figures."),
  ...table(["File", "Lines", "Purpose"], [
    ["pgs_ir/corpus.py", "", "builds the 9,842 documents from the JSON files"],
    ["pgs_ir/preprocess.py", "", "normalise, tokenise, segment, stop words, stemming, language detection"],
    ["pgs_ir/porter.py", "", "the Porter stemming algorithm"],
    ["pgs_ir/index.py", "", "inverted index, geo-tagging, trigram spelling lookup, save/load"],
    ["pgs_ir/query.py", "", "validation, filters, operators, expansion"],
    ["pgs_ir/models.py", "", "Boolean, TF-IDF, BM25F, Reciprocal Rank Fusion"],
    ["pgs_ir/engine.py", "", "query → model → filters → top-k results"],
    ["pgs_ir/evaluate.py", "", "test queries, correct answers, P@10, R@10, MAP, MRR, nDCG"],
    ["pgs_ir/__main__.py", "", "command line: build, stats, search, interactive, evaluate"],
    ["tests/test_pgs_ir.py", "", "21 unit tests"],
  ].map((r) => { r[1] = String(fs.readFileSync(path.join(ROOT, r[0]), "utf8").split("\n").length); return r; }),
  [2.6, 0.8, 5.6], "Project files."),
  h2("4.1 Building the index"),
  p("`python -m pgs_ir build` loads the data, creates the documents, runs the preprocessing on every field and saves the index. It takes well under a second."),
  ...figure("run_build", "Building the index."),
  ...figure("code_index_build", "Index construction: every field of every document is analysed and its term counts are added to the postings."),
  h2("4.2 Preprocessing code"),
  p("`analyse()` is the single function used for both documents and queries. `nepali_stem()` strips at most two joined postpositions and never touches protected words."),
  ...figure("code_analyse", "Nepali stemming and the analysis pipeline."),
  p("The segmenter is a dynamic program: `best_cost[i]` is the cheapest way to cover the first i letters, either by an unknown letter (cost 2) or by a known word of 3+ letters ending at i (cost 1). Walking back through `back` recovers the words."),
  ...figure("code_segmenter", "Word segmentation of web addresses by dynamic programming."),
  h2("4.3 Retrieval models code"),
  ...figure("code_boolean", "Boolean retrieval: intersect from the shortest postings list, then subtract NOT terms."),
  ...figure("code_tfidf_rrf", "TF-IDF cosine scoring and Reciprocal Rank Fusion."),
  ...figure("code_bm25", "BM25F: field-weighted, length-normalised term frequency, then BM25 saturation."),
  h2("4.4 Query processing code"),
  ...figure("code_query", "Query processing: validation, filters, Boolean operators, spelling correction and translation.", MAX_IMG_PX, 860),
];

const results = [
  h1("5. Results: example searches"),
  p("The screenshots below are real output of `python -m pgs_ir search`. Each shows how the query was processed (terms, expansions, filters), the model, the number of matching documents, the time, and the top results."),
  h2("5.1 An English query"),
  p("“pokhara news” finds Pokhara Metropolitan City first and then Pokhara’s news websites. Note how `news` was expanded to the Nepali `समाचार` and the romanised `khabar`/`samachar`, and `pokhara` to `पोखरा`."),
  ...figure("run_pokhara_news", "BM25F results for “pokhara news”."),
  h2("5.2 A Nepali query"),
  p("“कास्कीको स्थानीय तह” means “local governments of Kaski”. The stemmer removes `को` (of), the word list translates `स्थानीय तह` (local level) to English, and the results are Kaski’s local governments."),
  ...figure("run_nepali", "A Nepali query returns Kaski’s local governments."),
  h2("5.3 A misspelt query"),
  p("“pokhra” is not in the vocabulary, so the trigram lookup corrects it to `pokhara`, and the corrected name is then also translated to Nepali."),
  ...figure("run_typo", "Spelling correction: pokhra → pokhara → पोखरा."),
  h2("5.4 A place filter and the hybrid model"),
  p("“news district:kaski” keeps only documents in Kaski; the hybrid model fuses the BM25F and TF-IDF rankings."),
  ...figure("run_filter_hybrid", "District filter with the hybrid (RRF) model."),
  h2("5.5 Boolean operators"),
  ...figure("run_boolean", "Boolean model: news websites (khabar) about Kathmandu, without “post”."),
  h2("5.6 The same query with two models"),
  p("“districts of Gandaki province” shows the difference between the models. TF-IDF divides by the document’s full vector length, so **short documents** such as `gandaki.gov.np` win. BM25F’s gentler length normalisation and field weights put the Gandaki Province document and a Gandaki district near the top."),
  ...figure("run_tfidf", "TF-IDF: short documents with “gandaki” in the address win."),
  ...figure("run_bm25_same", "BM25F: the province and its districts rank higher."),
  h2("5.7 Invalid input"),
  ...figure("run_invalid", "Unknown places in filters are rejected with a clear message."),
];

const evaluation = [
  h1("6. Evaluation"),
  h2("6.1 Method"),
  p(`An IR system is evaluated with **test queries** whose correct answers (relevance judgments, “qrels”) are known. Labelling thousands of documents by hand was not possible, so the correct answers were taken from the data’s metadata, which is objective. ${evalReport.topics} queries in six groups were generated (with a fixed random seed, so the evaluation is repeatable):`),
  ...table(["Group", "Queries", "Example query", "Correct answers"], [
    ["T1 locals by district (EN)", evalReport.groups["T1 locals by district (EN)"], "local governments in Kaski district", "every local government in that district"],
    ["T2 locals by district (NE)", evalReport.groups["T2 locals by district (NE)"], "कास्की जिल्लाका स्थानीय तह", "the same, asked in Nepali"],
    ["T3 districts by province", evalReport.groups["T3 districts by province"], "districts of Gandaki province", "every district in that province"],
    ["T4 local government by name", evalReport.groups["T4 local government by name"], "Bhumlu", "that local government (all of them if several share the name)"],
    ["T5 name with a typo", evalReport.groups["T5 name with a typo"], "Bhulu", "the same, one letter dropped"],
    ["T6 website by name", evalReport.groups["T6 website by name"], "rastriya sandesh", "that website (its address with the words joined)"],
  ], [2.6, 0.9, 2.8, 2.7], "Test query groups."),
  p("Each run returns the top 100 documents per query, and five standard measures are computed:"),
  bullet("**P@10** (precision at 10): the share of the top 10 that is relevant."),
  bullet("**R@10** (recall at 10): the share of all relevant documents found in the top 10."),
  bullet("**MAP** (mean average precision): average of the precision at each relevant document’s rank, averaged over queries; rewards finding all relevant documents high up."),
  bullet("**MRR** (mean reciprocal rank): 1 / rank of the first relevant document; the key measure for known-item queries (T4–T6)."),
  bullet("**nDCG@10**: discounted cumulative gain, normalised by the best possible ranking; relevant documents count less the lower they are."),
  ...figure("code_metrics", "Implementation of the measures."),
  h2("6.2 Overall results"),
  ...evalTable("ALL", `All ${evalReport.topics} queries (best value in each column in bold). “+ expansion” = spelling correction and English–Nepali translation turned on.`),
  ...figure("chart_overall", "Overall scores of each run."),
  h2("6.3 Results by query group"),
  ...figure("chart_groups", "MAP of each run in each query group."),
  ...evalTable("T1 locals by district (EN)", "T1: local governments by district, English."),
  ...evalTable("T2 locals by district (NE)", "T2: local governments by district, Nepali."),
  ...evalTable("T5 name with a typo", "T5: local-government names with one letter missing."),
  ...evalTable("T6 website by name", "T6: websites by their name."),
  p("The tables for T3 and T4 are in `results/evaluation.md` in the repository."),
  h2("6.4 Ablation: word segmentation"),
  p("To measure what the web-address segmenter contributes, the index was also built without it (and without geo-tagging, which depends on it):"),
  ...table(["Run", "T6 MRR (websites by name)", "All queries MAP"], [
    ["BM25F + expansion", S("BM25F + expansion", "T6 website by name", "MRR"), S("BM25F + expansion", "ALL", "MAP")],
    ["BM25F + expansion, no segmentation", S("BM25F + expansion, no segmentation", "T6 website by name", "MRR"), S("BM25F + expansion, no segmentation", "ALL", "MAP")],
  ], [4, 2.5, 2.5], "Effect of word segmentation.", { numeric: true }),
  p(`Without segmentation a search for “online khabar” cannot find onlinekhabar.com: T6 MRR collapses from ${S("BM25F + expansion", "T6 website by name", "MRR")} to ${S("BM25F + expansion, no segmentation", "T6 website by name", "MRR")}. Segmentation is the single most important preprocessing step for searching web addresses.`),
];

const discussion = [
  h1("7. Discussion"),
  h2("7.1 Findings"),
  numbered(`**Query expansion matters most.** Translation and spelling correction raised MAP by about ${(evalReport.runs["BM25F + expansion"].scores.ALL.MAP - evalReport.runs["BM25F"].scores.ALL.MAP).toFixed(2)} for BM25F. For misspelt names (T5) MRR went from ${S("BM25F", "T5 name with a typo", "MRR")} to ${S("BM25F + expansion", "T5 name with a typo", "MRR")}: without correction, a typo finds nothing.`, 2),
  numbered(`**The hybrid model is the best overall** (MAP ${S("Hybrid RRF + expansion", "ALL", "MAP")}, MRR ${S("Hybrid RRF + expansion", "ALL", "MRR")}). BM25F and TF-IDF make different mistakes, and fusing their ranks keeps documents that both rank well. This supports PGS’s design of fusing two retrievers.`, 2),
  numbered(`**Boolean retrieval wins on precise, template-like queries** (T1/T2 MAP ≈ 1.0) because only local-government documents contain all of “local”, “government” and the district name. It fails completely on typos (T5 = 0) and ranks nothing, so it is not usable as the main model, but it shows that exact matching is valuable when the query words are exactly right.`, 2),
  numbered(`**BM25F beats TF-IDF on structured queries** like “districts of Gandaki province” (T3 MAP ${S("BM25F", "T3 districts by province", "MAP")} vs ${S("TF-IDF", "T3 districts by province", "MAP")}) because cosine normalisation favours very short documents, while BM25’s field weights and saturation do not.`, 2),
  numbered(`**Expansion can hurt exact lookups.** For website names (T6) plain BM25F (MRR ${S("BM25F", "T6 website by name", "MRR")}) beats BM25F with expansion (${S("BM25F + expansion", "T6 website by name", "MRR")}): expanding “khabar” to “news” brings in hundreds of other news sites. A real system could expand less when the query looks like a name.`, 2),
  numbered("**Name matches dominate topic words.** In T1 the BM25F models put news websites named after the district (kaskinews.com) above some local governments, because the district name in the title gets weight 3 and a high idf. Lower title weights or a learned reranker (PGS has a LightGBM reranker for this) would balance it.", 2),
  numbered("**It is fast.** A query takes 1–7 ms on 9,842 documents with a pure-Python index.", 2),
  h2("7.2 Limitations"),
  bullet("Documents are short (names, addresses, categories), not full web pages, so the results say more about name and place search than about full-text search."),
  bullet("The correct answers come from metadata and the queries follow templates. This makes the evaluation objective and repeatable, but it favours models that match the template words exactly (that is why Boolean scores so high on T1/T2). Real user queries are more varied."),
  bullet("Geo-tagging from the address can be wrong when a common word is also a place name (for example “aadarsha” is also a rural municipality)."),
  bullet("The Nepali stemmer only strips postpositions; it does not handle verb forms. PGS uses a trained Nepali lemmatiser instead."),
  bullet("The word list is a small stand-in for a real translation model."),
  h2("7.3 Possible improvements"),
  bullet("Index the full text of crawled pages from the PGS database."),
  bullet("Add dense retrieval with multilingual sentence embeddings (LaBSE, as in PGS) as the second list in the fusion."),
  bullet("Learn the field weights and the expansion weights from click data, or train a reranker."),
  bullet("Collect real queries and human relevance judgments."),
];

const pgs = [
  h1("8. Relation to the PGS Search Engine"),
  ...table(["Step", "PGS Search Engine (production)", "PGS Mini Search (this assignment)"], [
    ["Data", "full text of crawled Nepali web pages (PostgreSQL)", "the project’s seed data: places and websites"],
    ["Index", "OpenSearch (Lucene inverted index) + pgvector", "own inverted index in Python, saved as JSON"],
    ["Preprocessing", "NFC, lowercase, language detection, NLTK Porter, Nepali HMM lemmatiser", "NFC, lowercase, language detection, own Porter, Nepali postposition stripping, address segmentation"],
    ["Lexical ranking", "BM25, title^3 description^2 keywords^2 text", "BM25F, title ×3 place ×2 body ×1"],
    ["Second retriever", "LaBSE sentence vectors (dense)", "TF-IDF cosine"],
    ["Fusion", "Reciprocal Rank Fusion, k = 60", "Reciprocal Rank Fusion, k = 60"],
    ["Reranking", "LightGBM LambdaRank (9 features)", "none"],
    ["Query expansion", "EN↔NE place map, NLLB-200 translation, fuzziness", "EN↔NE place map, word list, trigram spelling correction"],
    ["Filters", "province, district, local body, category", "province, district, category, kind"],
    ["Interface", "gRPC service → FastAPI → Next.js website", "command line"],
  ], [1.8, 3.6, 3.6], "PGS Search Engine compared with this assignment."),
  p("Building the small version made the design decisions of the real system clear: why PGS boosts titles, why it needs fuzzy matching and translation for a bilingual audience, and why it fuses two rankers instead of trusting one."),
];

const conclusion = [
  h1("9. Conclusion"),
  p(`I designed and built a working bilingual information retrieval system on the PGS project’s public data. It covers the whole pipeline from the lectures: preprocessing (normalisation, tokenisation, stop words, Porter and Nepali stemming, plus word segmentation for web addresses), an inverted index with fields, four retrieval models (Boolean, TF-IDF, BM25F, hybrid RRF) and query processing with filters, Boolean operators, spelling correction and English–Nepali translation. On ${evalReport.topics} test queries the hybrid model with query expansion performed best (MAP ${S("Hybrid RRF + expansion", "ALL", "MAP")}, nDCG@10 ${S("Hybrid RRF + expansion", "ALL", "nDCG@10")}), and query expansion was the most valuable single component.`),
  h2("9.1 Code and how to run it"),
  new Paragraph({ children: [new TextRun({ text: "GitHub: ", bold: true }),
    new ExternalHyperlink({ link: GITHUB, children: [new TextRun({ text: GITHUB, style: "Hyperlink", highlight: "yellow" })] })], spacing: { after: 160 } }),
  ...code([
    "python -m pgs_ir build                     # build the index",
    'python -m pgs_ir search "pokhara news"     # search (BM25F)',
    'python -m pgs_ir search "pokhra" -m hybrid # other models: boolean, tfidf, bm25, hybrid',
    "python -m pgs_ir interactive               # type queries one after another",
    "python -m pgs_ir evaluate                  # run the evaluation",
    "python -m pytest -q                        # unit tests",
  ]),
  ...figure("run_tests", "All 21 unit tests pass."),
  h3("References"),
  numbered("Manning, C. D., Raghavan, P. and Schütze, H. (2008) Introduction to Information Retrieval. Cambridge University Press. (Boolean retrieval, TF-IDF, evaluation measures.)", 3),
  numbered("Porter, M. F. (1980) ‘An algorithm for suffix stripping’, Program, 14(3), pp. 130–137.", 3),
  numbered("Robertson, S. and Zaragoza, H. (2009) ‘The probabilistic relevance framework: BM25 and beyond’, Foundations and Trends in Information Retrieval, 3(4), pp. 333–389.", 3),
  numbered("Cormack, G. V., Clarke, C. L. A. and Büttcher, S. (2009) ‘Reciprocal rank fusion outperforms Condorcet and individual rank learning methods’, SIGIR 2009.", 3),
  numbered("Järvelin, K. and Kekäläinen, J. (2002) ‘Cumulated gain-based evaluation of IR techniques’, ACM TOIS, 20(4). (nDCG.)", 3),
  numbered("PGS Search Engine project, github.com/tekraj/pgs-search-engine (search-engine/README.md).", 3),
  numbered("Gautam, S. local-states-nepal dataset, github.com/sagautam5/local-states-nepal.", 3),
];

const doc = new Document({
  creator: "Prijesh",
  title: "PGS Mini Search: a basic information retrieval system",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, color: "1E3A8A", font: FONT }, paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 27, bold: true, color: "1D4ED8", font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, color: "334155", font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    ],
  },
  features: { updateFields: true },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "PGS Mini Search  ·  page ", size: 18, color: "64748B" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "64748B" })] })] }) },
    children: [...title, ...intro, ...dataset, ...design, ...impl, ...results, ...evaluation, ...discussion, ...pgs, ...conclusion],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "PGS-IR-Report.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes,", figureNo, "figures,", tableNo, "tables");
});
