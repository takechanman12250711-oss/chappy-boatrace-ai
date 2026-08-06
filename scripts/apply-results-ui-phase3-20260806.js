"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const statsPath = path.join(root, "js", "stats.js");
const stylePath = path.join(root, "style.css");
let stats = fs.readFileSync(statsPath, "utf8");
let style = fs.readFileSync(stylePath, "utf8");

const marker = "results-ui-phase3-20260806";
if (!stats.includes(marker)) {
  const oldHeader = `                <div>\n                  <p>\${formatDate(item.date)}</p>\n                  <h4>\n                    \${E(item.place || item.jcd || "-")}\n                    \${item.raceNo || "-"}R\n                  </h4>\n                </div>`;
  const newHeader = `                <div>\n                  <h4>\n                    \${E(item.place || item.jcd || "-")}\n                    \${item.raceNo || "-"}R\n                  </h4>\n                  <p>\${formatDate(item.date)}</p>\n                </div>`;
  if (!stats.includes(oldHeader)) throw new Error("recent header block not found");
  stats = stats.replace(oldHeader, newHeader);

  stats = stats.replace(
    '<summary>買い目と払戻を確認</summary>',
    '<summary><span>詳細を見る</span><small>買い目・公式結果・払戻</small></summary>'
  );

  const oldNewMethodBody = `        <div class="result-accordion-body">\n          \${newMethodDetailsHtml}\n        </div>`;
  const newNewMethodBody = `        <div class="result-accordion-body result-compact-analysis-body">\n          <div class="result-compact-progress">\n            <strong>\${newMethodCount}/\${NEW_METHOD_MINIMUM_COUNT}件</strong>\n            <span>\${newMethodReady ? "参考確認段階" : "データ蓄積中"}</span>\n          </div>\n          <details class="result-inner-details">\n            <summary>詳しい説明を見る</summary>\n            <div class="result-inner-details-body">\n              \${newMethodDetailsHtml}\n            </div>\n          </details>\n        </div>`;
  if (!stats.includes(oldNewMethodBody)) throw new Error("new method body not found");
  stats = stats.replace(oldNewMethodBody, newNewMethodBody);

  const oldAccuracyBody = `        <div class="result-accordion-body">\n          \${improvementReviewHtml}\n        </div>`;
  const newAccuracyBody = `        <div class="result-accordion-body result-compact-analysis-body">\n          <div class="result-compact-progress">\n            <strong>\${reviewCurrentCount}/\${reviewTarget}R</strong>\n            <span>データ蓄積中</span>\n          </div>\n          <details class="result-inner-details">\n            <summary>詳しい説明を見る</summary>\n            <div class="result-inner-details-body">\n              \${improvementReviewHtml}\n            </div>\n          </details>\n        </div>`;
  if (!stats.includes(oldAccuracyBody)) throw new Error("accuracy body not found");
  stats = stats.replace(oldAccuracyBody, newAccuracyBody);

  stats = stats.replace(
    'const STATS_REQUEST_TIMEOUT_MS = 30000;',
    'const STATS_REQUEST_TIMEOUT_MS = 30000;\n  const RESULTS_UI_PHASE3 = "results-ui-phase3-20260806";'
  );
}

const cssMarker = "/* results analysis phase3 20260806 */";
if (!style.includes(cssMarker)) {
  style += `\n\n${cssMarker}\n@media (max-width: 759px) {\n  .result-kpi-grid-five { gap: 8px; }\n  .result-kpi-grid-five .result-metric-card { padding: 10px; min-height: 0; }\n  .result-kpi-grid-five .result-metric-value { font-size: clamp(1.25rem, 6vw, 1.7rem); }\n  .result-kpi-grid-five .result-metric-detail { font-size: .72rem; }\n}\n.result-compact-analysis-body { display: grid; gap: 10px; }\n.result-compact-progress { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: 14px; background: rgba(239, 246, 255, .9); }\n.result-compact-progress strong { font-size: 1.05rem; color: #173b68; }\n.result-compact-progress span { font-size: .8rem; font-weight: 700; color: #52657c; }\n.result-inner-details { border: 1px solid #dfe7f0; border-radius: 14px; background: #fff; overflow: hidden; }\n.result-inner-details > summary { cursor: pointer; padding: 12px 14px; font-weight: 800; color: #2865b8; list-style: none; }\n.result-inner-details > summary::-webkit-details-marker { display: none; }\n.result-inner-details > summary::after { content: '⌄'; float: right; transition: transform .2s ease; }\n.result-inner-details[open] > summary::after { transform: rotate(180deg); }\n.result-inner-details-body { padding: 0 12px 12px; }\n.result-race-more > summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; }\n.result-race-more > summary small { color: #6d7d90; font-size: .72rem; font-weight: 600; }\n.result-race-head h4 { margin-bottom: 2px; }\n.result-race-head p { margin: 0; font-size: .75rem; color: #728096; }\n`;
}

if (!stats.includes(marker)) throw new Error("phase3 marker missing");
if (!stats.includes("詳しい説明を見る")) throw new Error("compact details missing");
if (!stats.includes("詳細を見る")) throw new Error("race detail label missing");
if (!style.includes(cssMarker)) throw new Error("phase3 css missing");

fs.writeFileSync(statsPath, stats);
fs.writeFileSync(stylePath, style);
console.log("results UI phase3 applied");
