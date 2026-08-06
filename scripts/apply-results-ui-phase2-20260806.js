"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const statsPath = path.join(root, "js", "stats.js");
const stylePath = path.join(root, "style.css");

let stats = fs.readFileSync(statsPath, "utf8");
let style = fs.readFileSync(stylePath, "utf8");

const helperAnchor = "  const shadowV2Progress =\n";
const helperMarker = "/* results UI phase2 grouped panels */";

if (!stats.includes(helperMarker)) {
  if (!stats.includes(helperAnchor)) throw new Error("phase2 helper anchor not found");

  const helper = `  ${helperMarker}\n  const venuePerformanceHtml =\n    venueGroups.length\n      ? venueGroups.map((row, index) => \`\n          <details class="result-group-item" data-result-group="venue-\${index}">\n            <summary>\n              <span class="result-group-title">\${E(row.label)}</span>\n              <span class="result-group-meta">\n                \${row.count}R・厳選\${rate(row.practicalHits, row.practicalCount)}%\n              </span>\n            </summary>\n            <div class="result-group-body">\n              <dl class="result-data-facts">\n                \${renderFact("本命1着", formatCountRate(row.honmeiHits, row.count))}\n                \${renderFact("実戦厳選", formatCountRate(row.practicalHits, row.practicalCount))}\n                \${renderFact("展開一致", formatCountRate(row.scenarioHits, row.scenarioComparable))}\n              </dl>\n            </div>\n          </details>\n        \`).join("")\n      : renderEmpty("場別に比較できる公式結果がありません");\n\n  const scenarioPerformanceHtml =\n    predictedScenarioGroups.length\n      ? predictedScenarioGroups.map(row => {\n          const practicalRate = rate(row.practicalHits, row.practicalCount);\n          const state = row.practicalCount === 0\n            ? "is-neutral"\n            : practicalRate >= 50\n              ? "is-hit"\n              : "is-miss";\n          const icon = row.practicalCount === 0 ? "🟡" : practicalRate >= 50 ? "🟢" : "🔴";\n          return \`\n            <article class="result-data-card result-scenario-card \${state}">\n              <header>\n                <h4>\${icon} \${E(row.label)}</h4>\n                <span>\${row.count}R</span>\n              </header>\n              <dl class="result-data-facts">\n                \${renderFact("展開一致", formatCountRate(row.scenarioHits, row.scenarioComparable))}\n                \${renderFact("実戦厳選", formatCountRate(row.practicalHits, row.practicalCount))}\n                \${renderFact("本命1着", formatCountRate(row.honmeiHits, row.count))}\n              </dl>\n            </article>\n          \`;\n        }).join("")\n      : renderEmpty("展開別に比較できる公式結果がありません");\n\n  const renderRoleTickets = (item, role) => {\n    const tickets = (item.predictionTickets || [])\n      .filter(row => String(row?.role || row?.category || "") === role)\n      .map(row => normalizeTicket(row?.ticket))\n      .filter(Boolean);\n    return tickets.length ? tickets.join("、") : "なし";\n  };\n\n`;
  stats = stats.replace(helperAnchor, helper + helperAnchor);
}

const recentDetailAnchor = `              </div>\n\n            </article>`;
if (!stats.includes("result-race-more")) {
  if (!stats.includes(recentDetailAnchor)) throw new Error("recent card detail anchor not found");
  stats = stats.replace(recentDetailAnchor, `              </div>\n\n              <details class="result-race-more">\n                <summary>買い目と払戻を確認</summary>\n                <div class="result-race-more-body">\n                  <dl class="result-data-facts">\n                    \${renderFact("本命", renderRoleTickets(item, "本命"))}\n                    \${renderFact("押さえ", renderRoleTickets(item, "押さえ"))}\n                    \${renderFact("流し", renderRoleTickets(item, "流し"))}\n                    \${renderFact("万舟", renderRoleTickets(item, "穴・万舟候補"))}\n                    \${renderFact("実戦厳選", item.practicalTickets.length ? item.practicalTickets.join("、") : "見送り")}\n                    \${renderFact("公式結果", item.resultTicket || "-")}\n                    \${renderFact("払戻", item.payoutPer100 > 0 ? formatMoney(item.payoutPer100) + "／100円" : "-")}\n                  </dl>\n                </div>\n              </details>\n\n            </article>`);
}

stats = stats.replace(
  /展開\$\{[\s\S]*?\? "判定不可"[\s\S]*?\}/,
  match => match
);
stats = stats.replace('                      ? "厳選見送り"', '                      ? "🟡 厳選見送り"');
stats = stats.replace('                        ? `厳選的中・${E(item.hitCategory || "区分不明")}`', '                        ? `🟢 厳選的中・${E(item.hitCategory || "区分不明")}`');
stats = stats.replace('                        : E(item.missType || "不的中")', '                        : `🔴 ${E(item.missType || "不的中")}`');

const panelAnchor = `      <details\n        class="result-accordion"\n        data-result-panel="recent-results"`;
if (!stats.includes('data-result-panel="venue-performance"')) {
  if (!stats.includes(panelAnchor)) throw new Error("phase2 panel anchor not found");
  const panels = `      <details\n        class="result-accordion"\n        data-result-panel="venue-performance"\n        \${panelOpen("venue-performance")}\n      >\n        <summary>\n          <span class="result-accordion-icon" aria-hidden="true">🏟️</span>\n          <span class="result-accordion-title">\n            <span class="result-accordion-name">場別成績</span>\n            <small>場ごとの本命・実戦厳選・展開一致</small>\n          </span>\n          <span class="result-accordion-meta">\${venueGroups.length}場</span>\n        </summary>\n        <div class="result-accordion-body result-group-list">\n          \${venuePerformanceHtml}\n        </div>\n      </details>\n\n      <details\n        class="result-accordion"\n        data-result-panel="scenario-performance"\n        \${panelOpen("scenario-performance")}\n      >\n        <summary>\n          <span class="result-accordion-icon" aria-hidden="true">🧠</span>\n          <span class="result-accordion-title">\n            <span class="result-accordion-name">展開別AI分析</span>\n            <small>イン逃げ・差し・攻め・カドの強みと弱み</small>\n          </span>\n          <span class="result-accordion-meta">\${predictedScenarioGroups.length}展開</span>\n        </summary>\n        <div class="result-accordion-body">\n          <div class="result-data-grid result-scenario-grid">\n            \${scenarioPerformanceHtml}\n          </div>\n        </div>\n      </details>\n\n`;
  stats = stats.replace(panelAnchor, panels + panelAnchor);
}

const styleMarker = "/* results analysis phase2 20260806 */";
if (!style.includes(styleMarker)) {
  style += `\n\n${styleMarker}\n.result-group-list {\n  display: grid;\n  gap: 10px;\n}\n.result-group-item,\n.result-race-more {\n  border: 1px solid rgba(15, 23, 42, 0.12);\n  border-radius: 14px;\n  background: #fff;\n  overflow: hidden;\n}\n.result-group-item > summary,\n.result-race-more > summary {\n  display: flex;\n  justify-content: space-between;\n  gap: 12px;\n  align-items: center;\n  padding: 13px 14px;\n  cursor: pointer;\n  font-weight: 800;\n}\n.result-group-body,\n.result-race-more-body {\n  padding: 0 14px 14px;\n}\n.result-group-meta {\n  color: #475569;\n  font-size: 0.82rem;\n  white-space: nowrap;\n}\n.result-race-more {\n  margin-top: 12px;\n  background: rgba(248, 250, 252, 0.9);\n}\n.result-scenario-card.is-hit {\n  border-color: rgba(22, 163, 74, 0.35);\n}\n.result-scenario-card.is-miss {\n  border-color: rgba(220, 38, 38, 0.28);\n}\n.result-scenario-card.is-neutral {\n  border-color: rgba(202, 138, 4, 0.3);\n}\n@media (max-width: 520px) {\n  .result-group-item > summary {\n    align-items: flex-start;\n  }\n  .result-group-meta {\n    white-space: normal;\n    text-align: right;\n  }\n}\n`;
}

if (!stats.includes(helperMarker)) throw new Error("phase2 helper missing");
if (!stats.includes('data-result-panel="venue-performance"')) throw new Error("venue panel missing");
if (!stats.includes('data-result-panel="scenario-performance"')) throw new Error("scenario panel missing");
if (!stats.includes("result-race-more")) throw new Error("race detail missing");
if (!style.includes(styleMarker)) throw new Error("phase2 styles missing");

fs.writeFileSync(statsPath, stats);
fs.writeFileSync(stylePath, style);
console.log("results UI phase2 applied");
