"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const renderPath = path.join(root, "js", "render.js");
const stylePath = path.join(root, "style.css");
const loaderPath = path.join(root, "js", "prediction-runtime-loader.js");
const indexPath = path.join(root, "index.html");

let render = fs.readFileSync(renderPath, "utf8");
let style = fs.readFileSync(stylePath, "utf8");
let loader = fs.readFileSync(loaderPath, "utf8");
let index = fs.readFileSync(indexPath, "utf8");

const version = "render-ui-v3.6.0-ai-ticket-accordion";
const marker = "v3-ai-ticket-accordion";

if (!render.includes(marker)) {
  const oldBlock = `      return \`\n        <div class="v3-ticket-group">\n          <div\n            class="v3-ticket-group-title"\n          >\n            \${escapeHtml(title)}\n          </div>\n\n          \${rows`;

  const start = render.indexOf(oldBlock);
  if (start < 0) throw new Error("AI ticket group block start not found");

  const endNeedle = `        </div>\n      \`;\n    };\n\n    const body = [`;
  const end = render.indexOf(endNeedle, start);
  if (end < 0) throw new Error("AI ticket group block end not found");

  const original = render.slice(start, end + `        </div>\n      \`;`.length);
  const innerStart = original.indexOf("          ${rows");
  if (innerStart < 0) throw new Error("AI ticket rows body not found");
  const rowsHtml = original.slice(innerStart, original.lastIndexOf("        </div>"));

  const replacement = `      return \`\n        <details\n          name="chappy-ai-ticket-accordion"\n          class="v3-ai-ticket-accordion v3-ai-ticket-accordion-\${escapeHtml(type)}"\n        >\n          <summary>\n            <span class="v3-ai-ticket-accordion-title">\n              \${escapeHtml(title)}\n            </span>\n            <span class="v3-ai-ticket-accordion-count">\n              \${escapeHtml(rows.length)}点\n            </span>\n            <span class="v3-ai-ticket-accordion-arrow" aria-hidden="true"></span>\n          </summary>\n          <div class="v3-ai-ticket-accordion-panel">\n${rowsHtml}\n          </div>\n        </details>\n      \`;`;

  render = render.slice(0, start) + replacement + render.slice(end + `        </div>\n      \`;`.length);
}

render = render.replace(
  /const RENDER_VERSION = "[^"]+";/,
  `const RENDER_VERSION = "${version}";`
);

const cssMarker = "/* AI ticket list accordion v1 */";
if (!style.includes(cssMarker)) {
  style += `\n\n${cssMarker}\n.v3-ticket-section .v3-section-body { display: grid; gap: 8px; }\n.v3-ai-ticket-accordion { border: 1px solid #dbe3ee; border-radius: 14px; background: #fff; overflow: hidden; }\n.v3-ai-ticket-accordion > summary { min-height: 58px; display: grid; grid-template-columns: 1fr auto 22px; align-items: center; gap: 10px; padding: 0 16px; cursor: pointer; list-style: none; font-weight: 800; -webkit-tap-highlight-color: transparent; }\n.v3-ai-ticket-accordion > summary::-webkit-details-marker { display: none; }\n.v3-ai-ticket-accordion-title { font-size: 17px; color: #1e293b; }\n.v3-ai-ticket-accordion-count { min-width: 48px; padding: 5px 10px; border-radius: 999px; background: #eef4ff; color: #2563eb; text-align: center; font-size: 13px; }\n.v3-ai-ticket-accordion-arrow::before { content: "▶"; display: block; color: #64748b; transition: transform .18s ease; }\n.v3-ai-ticket-accordion[open] .v3-ai-ticket-accordion-arrow::before { transform: rotate(90deg); }\n.v3-ai-ticket-accordion-panel { padding: 0 12px 12px; border-top: 1px solid #edf1f6; }\n.v3-ai-ticket-accordion-main .v3-ai-ticket-accordion-count { background: #fff1f2; color: #e11d48; }\n.v3-ai-ticket-accordion-safety .v3-ai-ticket-accordion-count { background: #eff6ff; color: #2563eb; }\n.v3-ai-ticket-accordion-flow .v3-ai-ticket-accordion-count { background: #ecfdf5; color: #059669; }\n.v3-ai-ticket-accordion-manshu .v3-ai-ticket-accordion-count { background: #f5f3ff; color: #7c3aed; }\n@media (max-width: 420px) {\n  .v3-ai-ticket-accordion > summary { min-height: 56px; padding: 0 13px; }\n  .v3-ai-ticket-accordion-title { font-size: 16px; }\n}\n`;
}

loader = loader.replace(
  /const VERSION = "[^"]+";/,
  'const VERSION = "20260806-ai-ticket-accordion1";'
);
index = index.replace(
  /<link rel="stylesheet" href="style\.css\?v=[^"]+" \/>/,
  '<link rel="stylesheet" href="style.css?v=20260806-ai-ticket-accordion1" />'
);
index = index.replace(
  /<script src="js\/app-runtime-loader\.js\?v=[^"]+"><\/script>/,
  '<script src="js/app-runtime-loader.js?v=20260806-ai-ticket-accordion1"></script>'
);

fs.writeFileSync(renderPath, render);
fs.writeFileSync(stylePath, style);
fs.writeFileSync(loaderPath, loader);
fs.writeFileSync(indexPath, index);
console.log("AI ticket list accordion applied");
