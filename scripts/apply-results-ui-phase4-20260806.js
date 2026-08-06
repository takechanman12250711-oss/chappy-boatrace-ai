"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const statsPath = path.join(root, "js", "stats.js");
const stylePath = path.join(root, "style.css");
const appRuntimePath = path.join(root, "js", "app-runtime-loader.js");
const statsRuntimePath = path.join(root, "js", "stats-runtime-loader.js");
const indexPath = path.join(root, "index.html");
let stats = fs.readFileSync(statsPath, "utf8");
let style = fs.readFileSync(stylePath, "utf8");
let appRuntime = fs.readFileSync(appRuntimePath, "utf8");
let statsRuntime = fs.readFileSync(statsRuntimePath, "utf8");
let index = fs.readFileSync(indexPath, "utf8");
const marker = "results-ui-phase4-20260806";

if (!stats.includes(marker)) {
  const oldScenario = `  const scenarioPerformanceHtml =\n    predictedScenarioGroups.length\n      ? predictedScenarioGroups.map(row => {\n          const practicalRate = rate(row.practicalHits, row.practicalCount);\n          const state = row.practicalCount === 0\n            ? "is-neutral"\n            : practicalRate >= 50\n              ? "is-hit"\n              : "is-miss";\n          const icon = row.practicalCount === 0 ? "🟡" : practicalRate >= 50 ? "🟢" : "🔴";`;
  const newScenario = `  const scenarioPerformanceHtml =\n    predictedScenarioGroups.length\n      ? predictedScenarioGroups.map(row => {\n          const practicalRate = rate(row.practicalHits, row.practicalCount);\n          const state = row.practicalCount === 0\n            ? "is-neutral"\n            : practicalRate >= 30\n              ? "is-hit"\n              : practicalRate >= 15\n                ? "is-neutral"\n                : "is-miss";\n          const icon = state === "is-hit" ? "🟢" : state === "is-miss" ? "🔴" : "🟡";\n          const strengthLabel = row.practicalCount < 5\n            ? "蓄積中"\n            : practicalRate >= 30\n              ? "得意"\n              : practicalRate >= 15\n                ? "標準"\n                : "改善対象";`;
  if (!stats.includes(oldScenario)) throw new Error("scenario block not found");
  stats = stats.replace(oldScenario, newScenario);
  stats = stats.replace(
    '<span>${row.count}R</span>\n              </header>',
    '<span class="result-strength-badge ${state}">${strengthLabel}</span>\n              </header>'
  );

  const oldRoleFacts = `                  <dl class="result-data-facts">\n                    \${renderFact("本命", renderRoleTickets(item, "本命"))}\n                    \${renderFact("押さえ", renderRoleTickets(item, "押さえ"))}\n                    \${renderFact("流し", renderRoleTickets(item, "流し"))}\n                    \${renderFact("万舟", renderRoleTickets(item, "穴・万舟候補"))}\n                    \${renderFact("実戦厳選", item.practicalTickets.length ? item.practicalTickets.join("、") : "見送り")}\n                    \${renderFact("公式結果", item.resultTicket || "-")}\n                    \${renderFact("払戻", item.payoutPer100 > 0 ? formatMoney(item.payoutPer100) + "／100円" : "-")}\n                  </dl>`;
  const newRoleFacts = `                  <div class="result-ticket-details">\n                    \${[\n                      ["本命", renderRoleTickets(item, "本命")],\n                      ["押さえ", renderRoleTickets(item, "押さえ")],\n                      ["流し", renderRoleTickets(item, "流し")],\n                      ["万舟", renderRoleTickets(item, "穴・万舟候補")],\n                      ["実戦厳選", item.practicalTickets.length ? item.practicalTickets.join("、") : "見送り"]\n                    ].map(([label, value]) => \`\n                      <details class="result-ticket-detail">\n                        <summary><span>\${label}</span><small>開く</small></summary>\n                        <p>\${E(value)}</p>\n                      </details>\n                    \`).join("")}\n                  </div>\n                  <dl class="result-data-facts result-official-facts">\n                    \${renderFact("公式結果", item.resultTicket || "-")}\n                    \${renderFact("払戻", item.payoutPer100 > 0 ? formatMoney(item.payoutPer100) + "／100円" : "-")}\n                  </dl>`;
  if (!stats.includes(oldRoleFacts)) throw new Error("recent role facts not found");
  stats = stats.replace(oldRoleFacts, newRoleFacts);

  const insertPoint = `  const renderRoleTickets = (item, role) => {`;
  const improvement = `  const comparableScenarioRows = predictedScenarioGroups\n    .filter(row => row.practicalCount >= 5)\n    .map(row => ({ ...row, practicalRate: rate(row.practicalHits, row.practicalCount) }))\n    .sort((a, b) => b.practicalRate - a.practicalRate);\n  const strongestScenario = comparableScenarioRows[0] || null;\n  const weakestScenario = comparableScenarioRows[comparableScenarioRows.length - 1] || null;\n  const scenarioInsightHtml = comparableScenarioRows.length\n    ? \`<div class="result-ai-insight">\n        <strong>AI改善メモ</strong>\n        <p>好調：\${E(strongestScenario.label)}（厳選\${strongestScenario.practicalRate}%）</p>\n        \${weakestScenario && weakestScenario !== strongestScenario\n          ? \`<p>改善対象：\${E(weakestScenario.label)}（厳選\${weakestScenario.practicalRate}%）</p>\`\n          : ""}\n      </div>\`\n    : \`<div class="result-ai-insight"><strong>AI改善メモ</strong><p>各展開5R以上になるまで蓄積中です。</p></div>\`;\n  const RESULTS_UI_PHASE4 = "${marker}";\n\n`;
  if (!stats.includes(insertPoint)) throw new Error("role helper point not found");
  stats = stats.replace(insertPoint, improvement + insertPoint);
  stats = stats.replace(
    '<div class="result-accordion-body">\n          <div class="result-data-grid result-scenario-grid">',
    '<div class="result-accordion-body">\n          ${scenarioInsightHtml}\n          <div class="result-data-grid result-scenario-grid">'
  );
}

const cssMarker = "/* results analysis phase4 20260806 */";
if (!style.includes(cssMarker)) {
  style += `\n\n${cssMarker}\n.result-strength-badge{font-size:.72rem;font-weight:800;padding:4px 9px;border-radius:999px}.result-strength-badge.is-hit{background:#e7f8ed;color:#18733b}.result-strength-badge.is-neutral{background:#fff6d8;color:#8b6400}.result-strength-badge.is-miss{background:#ffe8e8;color:#a72a2a}.result-ai-insight{margin-bottom:12px;padding:12px 14px;border-radius:14px;background:#f4f8ff;border:1px solid #dce8f8}.result-ai-insight strong{display:block;margin-bottom:5px;color:#173b68}.result-ai-insight p{margin:3px 0;font-size:.86rem;color:#52657c}.result-ticket-details{display:grid;gap:8px}.result-ticket-detail{border:1px solid #e1e8f0;border-radius:12px;background:#fff;overflow:hidden}.result-ticket-detail>summary{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;font-weight:800;cursor:pointer;list-style:none}.result-ticket-detail>summary::-webkit-details-marker{display:none}.result-ticket-detail>summary small{font-size:.72rem;color:#6f7f92}.result-ticket-detail[open]>summary small{font-size:0}.result-ticket-detail[open]>summary small::after{content:'閉じる';font-size:.72rem}.result-ticket-detail p{margin:0;padding:0 12px 12px;line-height:1.65;color:#33465c;word-break:break-word}.result-official-facts{margin-top:10px}\n`;
}

appRuntime = appRuntime.replace('const VERSION = "20260806-venue24-1";', 'const VERSION = "20260806-results-ui-phase4-1";');
statsRuntime = statsRuntime.replace(/const VERSION = "[^"]+";/, 'const VERSION = "20260806-results-ui-phase4-1";');
index = index.replace('style.css?v=20260806-venue24-hotfix2', 'style.css?v=20260806-results-ui-phase4-1');
index = index.replace('js/app-runtime-loader.js?v=20260806-venue24-hotfix2', 'js/app-runtime-loader.js?v=20260806-results-ui-phase4-1');

if (!stats.includes(marker)) throw new Error("phase4 marker missing");
if (!stats.includes("AI改善メモ")) throw new Error("AI insight missing");
if (!stats.includes("result-ticket-detail")) throw new Error("ticket detail missing");
if (!style.includes(cssMarker)) throw new Error("phase4 css missing");
if (!index.includes("20260806-results-ui-phase4-1")) throw new Error("index cache version missing");
fs.writeFileSync(statsPath, stats);
fs.writeFileSync(stylePath, style);
fs.writeFileSync(appRuntimePath, appRuntime);
fs.writeFileSync(statsRuntimePath, statsRuntime);
fs.writeFileSync(indexPath, index);
console.log("results UI phase4 applied");
