// Builds report/Week6-IR-Report-Simple.docx: the short report, in APA 7 student-paper format
// (Times New Roman 12 pt, double spacing, 1-inch margins, page number top right, no footer,
// APA headings, tables and figures, hanging-indent reference list).
// Run from the project root:  node report/build_simple_report.js
const fs = require("fs");
const path = require("path");
const docx = require(require.resolve("docx", { paths: [path.join(__dirname, "build")] }));
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow,
  TableCell, WidthType, BorderStyle, LevelFormat, PageBreak, Header, PageNumber, ExternalHyperlink,
} = docx;

const ROOT = path.join(__dirname, "..");
const IMG = path.join(__dirname, "images");
const evalReport = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "evaluation.json"), "utf8"));
const stats = JSON.parse(fs.readFileSync(path.join(__dirname, "build", "stats.json"), "utf8"));

const GITHUB = "https://github.com/Prijesh77/pgs-ir-assignment";
// Times New Roman everywhere. It has no Devanagari letters, so Nepali words fall back to
// Nirmala UI (the complex-script font); otherwise they would show as empty boxes.
const FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "Times New Roman", cs: "Nirmala UI" };
const SIZE = 24; // 12 pt
const DOUBLE = 480;
const CONTENT_DXA = 9026; // A4 width 11906 - 2 x 1440 (1-inch margins)
const MAX_IMG_PX = 590;

let figureNo = 0;
let tableNo = 0;

// ---- helpers --------------------------------------------------------------------------

// **bold**, *italic*, `code` (code is shown as plain text in APA style)
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("*")) out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

// APA body paragraph: first line indented 0.5 in, double spaced, no space between paragraphs.
const p = (text, opts = {}) => new Paragraph({
  children: runs(text), indent: { firstLine: 720 }, spacing: { line: DOUBLE, before: 0, after: 0 }, ...opts,
});
// APA level 1: centred, bold, title case.  Level 2: flush left, bold, title case.
const h1 = (text, opts = {}) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], ...opts });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const bullet = (text) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(text), spacing: { line: DOUBLE } });
const numbered = (text) => new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: runs(text), spacing: { line: DOUBLE } });
const centred = (text, opts = {}) => new Paragraph({ children: runs(text, opts.run), alignment: AlignmentType.CENTER, spacing: { line: DOUBLE }, ...opts.para });
const formula = (text) => new Paragraph({
  children: [new TextRun({ text, italics: true })], alignment: AlignmentType.CENTER, spacing: { line: DOUBLE },
});

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), data: buf };
}

// APA figure: "Figure N" (bold), the title (italic, title case) on the next line, then the image.
function figure(name, title, maxHeight = 760) {
  figureNo += 1;
  const { w, h, data } = pngSize(path.join(IMG, `${name}.png`));
  let width = Math.min(MAX_IMG_PX, w);
  let height = Math.round((h * width) / w);
  if (height > maxHeight) { height = maxHeight; width = Math.round((w * height) / h); }
  return [
    new Paragraph({ children: [new TextRun({ text: `Figure ${figureNo}`, bold: true })], spacing: { line: DOUBLE, before: 240 }, keepNext: true }),
    new Paragraph({ children: [new TextRun({ text: title, italics: true })], spacing: { line: DOUBLE }, keepNext: true }),
    new Paragraph({
      children: [new ImageRun({ type: "png", data, transformation: { width, height },
        altText: { title, description: title, name } })],
      alignment: AlignmentType.CENTER, spacing: { after: 240 },
    }),
  ];
}

// APA table: "Table N" (bold), italic title, horizontal rules only (top, under the header, bottom).
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const RULE = { style: BorderStyle.SINGLE, size: 8, color: "000000" };
function table(header, rows, widths, title, opts = {}) {
  tableNo += 1;
  const total = widths.reduce((a, b) => a + b, 0);
  const scaled = widths.map((w) => Math.round((w * CONTENT_DXA) / total));
  scaled[scaled.length - 1] += CONTENT_DXA - scaled.reduce((a, b) => a + b, 0);
  const lastRow = rows.length - 1;
  const cell = (text, i, rowIdx) => new TableCell({
    width: { size: scaled[i], type: WidthType.DXA },
    borders: {
      left: NONE, right: NONE,
      top: rowIdx === -1 ? RULE : NONE,
      bottom: rowIdx === -1 || rowIdx === lastRow ? RULE : NONE,
    },
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({
      keepNext: true,
      alignment: i > 0 && opts.numeric ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: runs(String(text), { bold: rowIdx === -1 ? false : (opts.bold || []).includes(`${rowIdx},${i}`) }),
    })],
  });
  return [
    new Paragraph({ children: [new TextRun({ text: `Table ${tableNo}`, bold: true })], spacing: { line: DOUBLE, before: 240 }, keepNext: true }),
    new Paragraph({ children: [new TextRun({ text: title, italics: true })], spacing: { line: DOUBLE }, keepNext: true }),
    new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      columnWidths: scaled,
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
      rows: [
        new TableRow({ tableHeader: true, children: header.map((t, i) => cell(t, i, -1)) }),
        ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, ri)) })),
      ],
    }),
    ...(opts.note ? [new Paragraph({ children: [new TextRun({ text: "Note. ", italics: true }), ...runs(opts.note)], spacing: { line: DOUBLE, before: 60 } })] : []),
    new Paragraph({ children: [], spacing: { line: DOUBLE } }),
  ];
}

// APA reference: hanging indent 0.5 in; parts is a list of [text, italic?].
const reference = (parts) => new Paragraph({
  children: parts.map(([text, italics]) => new TextRun({ text, italics: !!italics })),
  indent: { left: 720, hanging: 720 }, spacing: { line: DOUBLE },
});

const f3 = (x) => x.toFixed(3);
const S = (run, group, m) => f3(evalReport.runs[run].scores[group][m]);
const BEST = "Hybrid RRF + expansion";
const PAPER_TITLE = "A Basic Information Retrieval System for Nepal’s Places and Websites";

// ---- title page (APA 7 student paper) --------------------------------------------------

const titlePage = [
  ...[1, 2, 3].map(() => new Paragraph({ children: [], spacing: { line: DOUBLE } })),
  centred(`**${PAPER_TITLE}**`),
  new Paragraph({ children: [], spacing: { line: DOUBLE } }),
  centred("Prijesh"),
  centred("[Department name], [University name]"),
  centred("[Course number]: [Course name], Week 6 Assignment"),
  centred("[Instructor name]"),
  centred("October 12, 2026"),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---- body --------------------------------------------------------------------------------

const intro = [
  // APA: the paper title is repeated at the top of the first page instead of an "Introduction" heading.
  h1(PAPER_TITLE),
  p("Information retrieval (IR) is the task of finding the documents in a large collection that best match a user’s query (Manning et al., 2008). In our team project, the PGS Search Engine, we are building a search engine for Nepal’s public web that works in English and Nepali and lets people search by province, district and municipality (tekraj, 2026)."),
  p("For this assignment I built a small IR system, PGS Mini Search, that follows the same design as the PGS search engine but is simple enough to explain step by step. It is written in Python and uses the methods covered in the lectures. The objectives were to:"),
  bullet("use a publicly available dataset about Nepal’s places and websites;"),
  bullet("design the system: preprocessing, indexing, retrieval model and query processing;"),
  bullet("implement and compare the Boolean, TF-IDF and BM25 models; and"),
  bullet("evaluate the results with standard measures (precision, MAP, MRR and nDCG)."),
];

const dataset = [
  h1("Dataset"),
  p("The dataset comes from the PGS project’s seed data (folder database/data in the project repository), which is built from public sources. It has two files. The first, nepal_geography.json, lists all 7 provinces, 77 districts and 753 local governments of Nepal with their English and Nepali names (sagautam5, n.d.). The second, domains.json, lists the 9,761 Nepali websites that PGS crawls, each with a category such as news, government, education or NGO."),
  p(`From these files I created ${stats.documents.toLocaleString("en")} documents, summarised in Table 1. Each document has three fields: the title (the name), the place (district and province) and the body (web address, type and category). When ranking, the title counts three times, the place twice and the body once.`),
  ...table(["Document type", "Count", "Example"], [
    ["Province", stats.documents_by_kind.province, "Gandaki Province (गण्डकी प्रदेश)"],
    ["District", stats.documents_by_kind.district, "Kaski District (कास्की जिल्ला)"],
    ["Local government", stats.documents_by_kind.local_government, "Pokhara Metropolitan City (पोखरा महानगरपालिका)"],
    ["Website", stats.documents_by_kind.website.toLocaleString("en"), "pokharanews.com (news)"],
    ["Total", stats.documents.toLocaleString("en"), ""],
  ], [2.5, 1.2, 5.3], "Documents in the Collection"),
];

const design = [
  h1("System Design"),
  p("The system has three parts: indexing, which is done once; searching, which is done for every query; and evaluation. Figure 1 shows the architecture."),
  ...figure("architecture", "System Architecture"),
  h2("Preprocessing"),
  p("The same steps are applied to the documents and to the queries, so that a word in a query becomes the same index term as in a document:"),
  numbered("Normalisation: convert to lowercase, normalise Unicode and remove punctuation."),
  numbered("Tokenisation: split the text into words, in both the Latin and the Devanagari script."),
  numbered("Word segmentation: split joined words in web addresses, for example pokharanews into pokhara and news."),
  numbered("Stop-word removal: remove common words such as “the”, “of”, “को” and “मा”."),
  numbered("Stemming: the Porter (1980) stemmer for English (municipalities becomes municip) and suffix removal for Nepali (काठमाडौंको becomes काठमाडौं)."),
  h2("Indexing"),
  p(`An inverted index maps every term to the documents that contain it, together with the number of times it appears in each field (Manning et al., 2008). For example, the term pokhara points to document 412, where it appears once in the title, and to document 538, where it appears once in the place field. The index has ${stats.vocabulary_size.toLocaleString("en")} distinct terms and ${stats.postings.toLocaleString("en")} postings, takes under a second to build and is saved as a JSON file.`),
  h2("Retrieval Models"),
  p("Four models were implemented so that they could be compared on the same index:"),
  bullet("Boolean model: returns the documents that contain all query words (AND), any of them (OR), or not a word (NOT). It does not rank the results."),
  bullet("TF-IDF vector space model: ranks documents by the cosine similarity between the query and document vectors, where each word is weighted by its term frequency multiplied by its inverse document frequency."),
  bullet("BM25, the main model: the probabilistic model used by OpenSearch and by the PGS project (Robertson & Zaragoza, 2009). It limits the effect of repeated words and adjusts for document length:"),
  formula("score(q, d) = Σ idf(t) · tf(t, d) · (k1 + 1) / (tf(t, d) + k1 · (1 − b + b · |d| / avgdl))"),
  bullet("Hybrid model: combines the BM25 and TF-IDF rankings with Reciprocal Rank Fusion (Cormack et al., 2009), the same method that PGS uses."),
  p("BM25 was chosen as the main model because it is the standard in modern search engines and works well with fields and with documents of different lengths."),
  h2("Query Processing"),
  p("Before searching, each query is processed in five steps:"),
  bullet("Validation: the query must be 1 to 512 characters long."),
  bullet("Filters: the user can limit results with district:kaski, province:gandaki or category:news."),
  bullet("Language detection: English, Nepali or mixed, decided from the script."),
  bullet("Translation: place names and common words are translated (pokhara ↔ पोखरा, news ↔ समाचार), so an English query also finds Nepali text and the other way round."),
  bullet("Spelling correction: unknown words are matched to similar words in the index (pokhra becomes pokhara)."),
];

const impl = [
  h1("Implementation"),
  p("The system is written in Python 3 without external libraries. The code is organised into the small modules listed in Table 2."),
  ...table(["File", "Purpose"], [
    ["corpus.py", "Creates the documents from the dataset"],
    ["preprocess.py, porter.py", "Preprocessing and the Porter stemmer"],
    ["index.py", "Builds, saves and loads the inverted index"],
    ["models.py", "Boolean, TF-IDF, BM25 and hybrid models"],
    ["query.py", "Query processing, translation and spelling correction"],
    ["evaluate.py", "Test queries and evaluation measures"],
    ["__main__.py", "Command-line interface"],
  ], [3, 6], "Project Files"),
  p("The index is built with one command, python -m pgs_ir build (Figure 2). The preprocessing function in Figure 3 is used for both documents and queries, and Figure 4 shows how the BM25 model scores each document that contains a query term."),
  ...figure("run_build", "Building the Index"),
  ...figure("code_analyse", "Preprocessing Code"),
  ...figure("code_bm25", "BM25 Ranking Code"),
];

const results = [
  h1("Results"),
  h2("Example Searches"),
  p("Figure 5 shows an English query, “pokhara news”. Pokhara Metropolitan City is ranked first, followed by news websites from Pokhara. Figure 6 shows a Nepali query, “कास्कीको स्थानीय तह” (local governments of Kaski), which returns the local governments of Kaski district. Figure 7 shows that a misspelt query, “pokhra”, is corrected automatically."),
  ...figure("run_pokhara_news", "Results for an English Query"),
  ...figure("run_nepali", "Results for a Nepali Query"),
  ...figure("run_typo", "Automatic Spelling Correction"),
  h2("Evaluation"),
  p(`The models were tested on ${evalReport.topics} test queries in English and Nepali, including place names, names with typing mistakes and website names. The correct answers were taken from the dataset itself; for example, for “local governments in Kaski district”, the correct answers are all local governments in Kaski. Results were measured with precision at 10 (P@10), mean average precision (MAP), mean reciprocal rank (MRR) and normalised discounted cumulative gain (nDCG@10; Järvelin & Kekäläinen, 2002). Table 3 and Figure 8 show the results.`),
  ...table(["Model", "P@10", "MAP", "MRR", "nDCG@10"],
    ["Boolean (AND)", "TF-IDF", "BM25F", "BM25F + expansion", BEST].map((r) => [
      r.replace("BM25F", "BM25").replace(" + expansion", " + translation and spelling"),
      S(r, "ALL", "P@10"), S(r, "ALL", "MAP"), S(r, "ALL", "MRR"), S(r, "ALL", "nDCG@10")]),
    [3.8, 1, 1, 1, 1.2], "Evaluation Results",
    { numeric: true, bold: ["4,2", "4,3", "4,4"], note: "Higher values are better. The best value in each measure is shown in bold." }),
  ...figure("chart_overall", "Comparison of the Models"),
];

const discussion = [
  h1("Discussion"),
  p(`Translation and spelling correction helped the most: they raised the MAP of BM25 from ${S("BM25F", "ALL", "MAP")} to ${S("BM25F + expansion", "ALL", "MAP")}. The hybrid model gave the best overall results (MAP ${S(BEST, "ALL", "MAP")}, MRR ${S(BEST, "ALL", "MRR")}), because BM25 and TF-IDF make different mistakes and combining their rankings corrects some of them.`),
  p("The Boolean model was very precise when the query words matched the documents exactly, but it found nothing when a word was misspelt and it could not rank its results. Word segmentation was essential for finding websites by name, such as “online khabar” for onlinekhabar.com."),
  p("The system has two main limitations. The documents are short (names and addresses rather than full web pages), and the test queries were generated from the data, so real user queries may give different results."),
];

const conclusion = [
  h1("Conclusion"),
  p(`I designed and implemented a basic bilingual information retrieval system using a public dataset from our PGS project. It includes preprocessing, an inverted index, the Boolean, TF-IDF and BM25 retrieval models, and query processing with translation and spelling correction. The hybrid model with query expansion performed best, with a MAP of ${S(BEST, "ALL", "MAP")}. In the future, the system could index the full text of the crawled web pages and add meaning-based (semantic) search, as the PGS project does.`),
  h2("Source Code"),
  new Paragraph({
    indent: { firstLine: 720 }, spacing: { line: DOUBLE },
    children: [new TextRun("The source code is available on GitHub at "),
      new ExternalHyperlink({ link: GITHUB, children: [new TextRun({ text: GITHUB, style: "Hyperlink", highlight: "yellow" })] }),
      new TextRun(". The index is built with python -m pgs_ir build, a search is run with python -m pgs_ir search followed by the query, and the evaluation is run with python -m pgs_ir evaluate.")],
  }),
];

const references = [
  h1("References", { pageBreakBefore: true }),
  reference([["Cormack, G. V., Clarke, C. L. A., & Büttcher, S. (2009). Reciprocal rank fusion outperforms Condorcet and individual rank learning methods. In "], ["Proceedings of the 32nd International ACM SIGIR Conference on Research and Development in Information Retrieval", true], [" (pp. 758–759). ACM. https://doi.org/10.1145/1571941.1572114"]]),
  reference([["Järvelin, K., & Kekäläinen, J. (2002). Cumulated gain-based evaluation of IR techniques. "], ["ACM Transactions on Information Systems, 20", true], ["(4), 422–446. https://doi.org/10.1145/582415.582418"]]),
  reference([["Manning, C. D., Raghavan, P., & Schütze, H. (2008). "], ["Introduction to information retrieval", true], [". Cambridge University Press."]]),
  reference([["Porter, M. F. (1980). An algorithm for suffix stripping. "], ["Program, 14", true], ["(3), 130–137. https://doi.org/10.1108/eb046814"]]),
  reference([["Robertson, S., & Zaragoza, H. (2009). The probabilistic relevance framework: BM25 and beyond. "], ["Foundations and Trends in Information Retrieval, 3", true], ["(4), 333–389. https://doi.org/10.1561/1500000019"]]),
  reference([["sagautam5. (n.d.). "], ["local-states-nepal", true], [" [Data set]. GitHub. https://github.com/sagautam5/local-states-nepal"]]),
  reference([["tekraj. (2026). "], ["pgs-search-engine", true], [" [Computer software]. GitHub. https://github.com/tekraj/pgs-search-engine"]]),
];

// ---- document ----------------------------------------------------------------------------

const heading = (id, name, alignment, level) => ({
  id, name, basedOn: "Normal", next: "Normal", quickFormat: true,
  run: { font: FONT, size: SIZE, bold: true, color: "000000" },
  paragraph: { alignment, spacing: { line: DOUBLE, before: 0, after: 0 }, outlineLevel: level, keepNext: true },
});

const doc = new Document({
  creator: "Prijesh",
  title: PAPER_TITLE,
  styles: {
    default: { document: { run: { font: FONT, size: SIZE }, paragraph: { spacing: { line: DOUBLE } } } },
    paragraphStyles: [
      heading("Heading1", "Heading 1", AlignmentType.CENTER, 0),
      heading("Heading2", "Heading 2", AlignmentType.LEFT, 1),
    ],
    characterStyles: [{ id: "Hyperlink", name: "Hyperlink", run: { color: "0563C1", underline: {} } }],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720 } } },
    // APA 7 student paper: page number in the top right corner of every page, no footer.
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
    children: [...titlePage, ...intro, ...dataset, ...design, ...impl, ...results, ...discussion, ...conclusion, ...references],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "Week6-IR-Report-Simple.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes,", figureNo, "figures,", tableNo, "tables");
});
