// Writes a theme's colours and fonts into a .pptx written by pptxgenjs (which cannot set
// theme colours itself), so scheme colours such as accent1 resolve to our palette.
const fs = require("fs");
const path = require("path");
const JSZip = require(require.resolve("jszip", { paths: [path.join(__dirname, "build")] }));

const SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function applyTheme(file, theme) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/theme\/theme\d+\.xml$/.test(n))) {
    let xml = await zip.file(name).async("string");
    for (const slot of SLOTS) {
      // each slot holds one colour element (srgbClr or sysClr); replace it with our hex
      const re = new RegExp(`<a:${slot}>[\\s\\S]*?</a:${slot}>`);
      xml = xml.replace(re, `<a:${slot}><a:srgbClr val="${theme.colors[slot]}"/></a:${slot}>`);
    }
    xml = xml.replace(/<a:clrScheme name="[^"]*"/, `<a:clrScheme name="${esc(theme.name)}"`);
    xml = xml.replace(/(<a:majorFont>\s*<a:latin typeface=")[^"]*/, `$1${esc(theme.headFontFace)}`);
    xml = xml.replace(/(<a:minorFont>\s*<a:latin typeface=")[^"]*/, `$1${esc(theme.bodyFontFace)}`);
    zip.file(name, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

module.exports = { applyTheme };
