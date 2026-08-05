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

if (!render.includes('class="v3-boat-tabs"')) {
  const start = render.indexOf("    const boatBody =");
  const end = render.indexOf("\n    const ticketBody =", start);
  if (start < 0 || end < 0) throw new Error("boatBody block not found");

  const replacement = `    const boatTabItems = boatItems
      .slice()
      .sort((a, b) =>
        safeNum(a?.no, 99) -
        safeNum(b?.no, 99)
      );

    const boatBody =
      boatTabItems.length
        ? \`
          <div class="v3-boat-tabs">
            <div class="v3-boat-tab-buttons" role="tablist" aria-label="艇評価を選択">
              \${boatTabItems
                .map((item, index) => {
                  const boatNo = safeNum(item?.no, index + 1);
                  return \`
                    <input class="v3-boat-tab-radio" type="radio"
                      name="chappy-boat-evaluation-tab"
                      id="chappy-boat-tab-\${escapeHtml(boatNo)}"
                      \${index === 0 ? "checked" : ""}>
                    <label class="v3-boat-tab-button v3-boat-tab-button-\${escapeHtml(boatNo)}"
                      for="chappy-boat-tab-\${escapeHtml(boatNo)}" role="tab">
                      <span>\${escapeHtml(boatNo)}</span><small>号艇</small>
                    </label>
                  \`;
                })
                .join("")}
            </div>
            <div class="v3-boat-tab-panels">
              \${boatTabItems
                .map((item, index) => {
                  const boatNo = safeNum(item?.no, index + 1);
                  return \`
                    <div class="v3-boat-tab-panel v3-boat-tab-panel-\${escapeHtml(boatNo)}"
                      data-boat-tab-panel="\${escapeHtml(boatNo)}">
                      \${renderNewspaperCard(item)}
                    </div>
                  \`;
                })
                .join("")}
            </div>
          </div>
        \`
        : emptyBox("艇評価データがありません");
`;

  render = render.slice(0, start) + replacement + render.slice(end);
}

render = render.replace(
  'const RENDER_VERSION = "render-ui-v3.4.0-boat-accordion";',
  'const RENDER_VERSION = "render-ui-v3.5.0-boat-tab-buttons";'
);

const marker = "/* boat evaluation tab buttons v1 */";
if (!style.includes(marker)) {
  style += `\n\n${marker}
.v3-boat-tabs { width: 100%; }
.v3-boat-tab-buttons {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}
.v3-boat-tab-radio { position: absolute; opacity: 0; pointer-events: none; }
.v3-boat-tab-button {
  min-width: 0;
  min-height: 54px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: 2px solid #d8e0ea;
  border-radius: 12px;
  background: #fff;
  color: #334155;
  font-weight: 800;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 2px 6px rgba(15, 23, 42, .06);
}
.v3-boat-tab-button span { font-size: 20px; line-height: 1; }
.v3-boat-tab-button small { font-size: 10px; line-height: 1.1; }
.v3-boat-tab-button:active { transform: translateY(1px); }
.v3-boat-tab-panel { display: none; }
.v3-boat-tab-buttons:has(#chappy-boat-tab-1:checked) ~ .v3-boat-tab-panels .v3-boat-tab-panel-1,
.v3-boat-tab-buttons:has(#chappy-boat-tab-2:checked) ~ .v3-boat-tab-panels .v3-boat-tab-panel-2,
.v3-boat-tab-buttons:has(#chappy-boat-tab-3:checked) ~ .v3-boat-tab-panels .v3-boat-tab-panel-3,
.v3-boat-tab-buttons:has(#chappy-boat-tab-4:checked) ~ .v3-boat-tab-panels .v3-boat-tab-panel-4,
.v3-boat-tab-buttons:has(#chappy-boat-tab-5:checked) ~ .v3-boat-tab-panels .v3-boat-tab-panel-5,
.v3-boat-tab-buttons:has(#chappy-boat-tab-6:checked) ~ .v3-boat-tab-panels .v3-boat-tab-panel-6 { display: block; }
#chappy-boat-tab-1:checked + .v3-boat-tab-button-1,
#chappy-boat-tab-2:checked + .v3-boat-tab-button-2,
#chappy-boat-tab-3:checked + .v3-boat-tab-button-3,
#chappy-boat-tab-4:checked + .v3-boat-tab-button-4,
#chappy-boat-tab-5:checked + .v3-boat-tab-button-5,
#chappy-boat-tab-6:checked + .v3-boat-tab-button-6 {
  border-color: #0878f9;
  background: #eaf4ff;
  color: #075fbf;
  box-shadow: 0 0 0 2px rgba(8, 120, 249, .12);
}
@media (max-width: 380px) {
  .v3-boat-tab-buttons { gap: 4px; }
  .v3-boat-tab-button { min-height: 50px; border-radius: 10px; }
  .v3-boat-tab-button span { font-size: 18px; }
}
`;
}

loader = loader.replace(
  'const VERSION = "20260805-boat-evaluation-accordion1";',
  'const VERSION = "20260805-boat-tab-buttons1";'
);
index = index.replaceAll(
  "20260805-boat-evaluation-accordion1",
  "20260805-boat-tab-buttons1"
);

fs.writeFileSync(renderPath, render);
fs.writeFileSync(stylePath, style);
fs.writeFileSync(loaderPath, loader);
fs.writeFileSync(indexPath, index);
console.log("boat evaluation tab buttons applied");
