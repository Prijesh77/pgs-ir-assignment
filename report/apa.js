// APA 7 helpers shared by the Week 7 report builder (Times New Roman 12 pt, double spacing,
// APA headings, tables with horizontal rules only, figures with bold number and italic title).
const fs = require("fs");
const path = require("path");
const docx = require(require.resolve("docx", { paths: [path.join(__dirname, "build")] }));
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow,
  TableCell, WidthType, BorderStyle, LevelFormat, PageBreak, Header, PageNumber, ExternalHyperlink,
} = docx;
const IMG = path.join(__dirname, "images");

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


// The document skeleton: A4, 1-inch margins, page number top right, no footer.
function apaDocument(title, children) {
  const heading = (id, name, alignment, level) => ({
    id, name, basedOn: "Normal", next: "Normal", quickFormat: true,
    run: { font: FONT, size: SIZE, bold: true, color: "000000" },
    paragraph: { alignment, spacing: { line: DOUBLE, before: 0, after: 0 }, outlineLevel: level, keepNext: true },
  });
  return new Document({
    creator: "Prijesh",
    title,
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
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
      children,
    }],
  });
}

module.exports = {
  docx, Packer, Paragraph, TextRun, AlignmentType, PageBreak, ExternalHyperlink, DOUBLE,
  p, h1, h2, bullet, numbered, centred, formula, figure, table, reference, apaDocument,
};
