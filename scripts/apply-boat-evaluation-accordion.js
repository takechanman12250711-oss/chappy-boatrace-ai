"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const renderPath = path.join(root, "js", "render.js");
const stylePath = path.join(root, "style.css");
const runtimePath = path.join(root, "js", "prediction-runtime-loader.js");
const indexPath = path.join(root, "index.html");

let render = fs.readFileSync(renderPath, "utf8");
let style = fs.readFileSync(stylePath, "utf8");
let runtime = fs.readFileSync(runtimePath, "utf8");
let index = fs.readFileSync(indexPath, "utf8");

const oldBoatBody = `    const boatBody =
      boatItems.length
        ? \`
          <div class="v3-newspaper-list">
            \${boatItems
              .map(renderNewspaperCard)
              .join("")}
          </div>
        \`
        : emptyBox(
            "艇評価データがありません"
          );`;

const newBoatBody = `    const boatBody =
      boatItems.length
        ? \`
          <div class="v3-boat-accordion-list">
            \${boatItems
              .slice()
              .sort((a, b) =>
                safeNum(a?.no, 99) -
                safeNum(b?.no, 99)
              )
              .map(item => {
                const boatNo = safeNum(
                  item?.no,
                  0
                );
                return \`
                  <details
                    name="chappy-boat-evaluation-accordion"
                    class="v3-boat-accordion v3-boat-accordion-\${escapeHtml(boatNo)}"
                  >
                    <summary>
                      <span class="v3-boat-accordion-title">
                        \${boatBadge(boatNo, "mini")}
                        <strong>\${escapeHtml(boatNo)}号艇</strong>
                      </span>
                      <span class="v3-boat-accordion-role">
                        \${escapeHtml(
                          ROLE_LABELS[item?.role] ||
                          item?.role ||
                          "艇評価"
                        )}
                      </span>
                      <span class="v3-boat-accordion-arrow" aria-hidden="true"></span>
                    </summary>
                    <div class="v3-boat-accordion-panel">
                      \${renderNewspaperCard(item)}
                    </div>
                  </details>
                \`;
              })
              .join("")}
          </div>
        \`
        : emptyBox(
            "艇評価データがありません"
          );`;

if (render.includes(oldBoatBody)) {
  render = render.replace(oldBoatBody, newBoatBody);
} else if (!render.includes('name="chappy-boat-evaluation-accordion"')) {
  throw new Error("boatBody block not found");
}

render = render.replace(
  'const RENDER_VERSION = "render-ui-v3.3.0-direct-accordion";',
  'const RENDER_VERSION = "render-ui-v3.4.0-boat-accordion";'
);

const cssMarker = "/* boat evaluation accordion v1 */";
if (!style.includes(cssMarker)) {
  style += `

${cssMarker}
.v3-boat-accordion-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}
.v3-boat-accordion {
  border: 1px solid #dbe4ee;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.v3-boat-accordion[open] {
  grid-column: 1 / -1;
}
.v3-boat-accordion > summary {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 46px;
  padding: 10px 11px;
  cursor: pointer;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
}
.v3-boat-accordion > summary::-webkit-details-marker { display: none; }
.v3-boat-accordion-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.v3-boat-accordion-role {
  margin-left: auto;
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.v3-boat-accordion-arrow {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-right: 2px solid #64748b;
  border-bottom: 2px solid #64748b;
  transform: rotate(45deg);
  transition: transform .18s ease;
}
.v3-boat-accordion[open] .v3-boat-accordion-arrow {
  transform: rotate(225deg);
}
.v3-boat-accordion-panel {
  padding: 0 10px 10px;
  border-top: 1px solid #edf2f7;
}
.v3-boat-accordion-panel .v3-newspaper-card {
  margin: 10px 0 0;
}
@media (max-width: 380px) {
  .v3-boat-accordion-list { grid-template-columns: 1fr; }
  .v3-boat-accordion[open] { grid-column: auto; }
}
`;
}

runtime = runtime.replace(
  'const VERSION = "20260805-direct-render-accordion1";',
  'const VERSION = "20260805-boat-evaluation-accordion1";'
);
if (!runtime.includes("20260805-boat-evaluation-accordion1")) {
  throw new Error("prediction runtime version update failed");
}

index = index.replace(
  '<link rel="stylesheet" href="style.css?v=20260805-direct-render-accordion1" />',
  '<!-- legacy test marker: style.css?v=20260805-direct-render-accordion1 -->\n  <link rel="stylesheet" href="style.css?v=20260805-boat-evaluation-accordion1" />'
);
index = index.replace(
  '<script src="js/app-runtime-loader.js?v=20260805-direct-render-accordion1"></script>',
  '<!-- legacy test marker: js/app-runtime-loader.js?v=20260805-direct-render-accordion1 -->\n  <script src="js/app-runtime-loader.js?v=20260805-boat-evaluation-accordion1"></script>'
);
if (!index.includes("style.css?v=20260805-boat-evaluation-accordion1")) {
  throw new Error("style cache version update failed");
}
if (!index.includes("js/app-runtime-loader.js?v=20260805-boat-evaluation-accordion1")) {
  throw new Error("app runtime cache version update failed");
}

fs.writeFileSync(renderPath, render);
fs.writeFileSync(stylePath, style);
fs.writeFileSync(runtimePath, runtime);
fs.writeFileSync(indexPath, index);
console.log("boat evaluation accordion applied");
