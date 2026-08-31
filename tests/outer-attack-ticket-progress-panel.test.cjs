"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const panel = require("../js/outer-attack-ticket-progress-panel.js");

const rootDir = path.resolve(__dirname, "..");

function variant(status, sampleCount, nextMilestone, remainingToNextMilestone, metrics = {}) {
  return {
    status,
    sampleCount,
    nextMilestone,
    remainingToNextMilestone,
    metrics: {
      hitCountDelta: 0,
      hitRatePointDelta: 0,
      roiPointDelta: 0,
      profitDeltaYen: 0,
      sameStakeCoveragePercent: sampleCount ? 100 : 0,
      ...metrics
    }
  };
}

function report(overrides = {}) {
  return {
    gateId: "outer-attack-ticket-decision-gate-v1",
    prospectiveStartAt: "2026-08-31T02:00:00.000Z",
    primaryCohort: "prediction-before-result",
    automaticApplication: false,
    recommendedVariant: null,
    diagnostics: {
      prospectiveForwardCount: 0,
      sourceSettlementCount: 0
    },
    variants: {
      cover: variant("collecting-to-100", 0, 100, 100),
      flow: variant("collecting-to-100", 0, 100, 100),
      hole: variant("collecting-to-100", 0, 100, 100)
    },
    ...overrides
  };
}

assert.equal(panel.VERSION, "outer-attack-ticket-progress-panel-v1");
assert.equal(panel.GATE_ID, "outer-attack-ticket-decision-gate-v1");
assert.equal(panel.AREA_ID, "outerAttackTicketProgressArea");
assert.deepEqual(
  panel.VARIANTS.map(row => [row.key, row.label]),
  [
    ["cover", "押さえB"],
    ["flow", "フォーメーションB"],
    ["hole", "万舟B"]
  ],
  "flowを流しではなくフォーメーションとして表示する"
);
assert.equal(panel.signed(3, 0, "R"), "+3R");
assert.equal(panel.signed(-2, 0, "R"), "−2R");
assert.equal(panel.signed(0, 1, "pt"), "0.0pt");
assert.equal(panel.signedYen(1234), "+1,234円");
assert.equal(panel.signedYen(-980), "−980円");
assert.equal(panel.jstLabel("2026-08-31T02:00:00.000Z"), "2026年8月31日 11:00 JST");

const emptyReport = report();
const emptyBefore = JSON.stringify(emptyReport);
const emptyView = panel.buildViewModel(emptyReport);
assert.equal(JSON.stringify(emptyReport), emptyBefore, "判定レポートを変更しない");
assert.equal(emptyView.available, true);
assert.equal(emptyView.prospectiveForwardCount, 0);
assert.equal(emptyView.overallStatusLabel, "前向きデータ収集中");
assert.deepEqual(
  emptyView.variants.map(row => [row.sampleCount, row.nextMilestone, row.remaining, row.progressPercent]),
  [[0, 100, 100, 0], [0, 100, 100, 0]] .concat([[0, 100, 100, 0]])
);
assert.equal(emptyView.variants[0].hitDeltaLabel, "—");
assert.equal(emptyView.variants[0].sameStakeLabel, "—");

const activeReport = report({
  recommendedVariant: "hole",
  diagnostics: {
    prospectiveForwardCount: 500,
    sourceSettlementCount: 520
  },
  variants: {
    cover: variant("collecting-to-250", 120, 250, 130, {
      hitCountDelta: 3,
      hitRatePointDelta: 2.5,
      roiPointDelta: 6.4,
      profitDeltaYen: 1500,
      sameStakeCoveragePercent: 100
    }),
    flow: variant("interim-candidate-hold-to-500", 250, 500, 250, {
      hitCountDelta: 4,
      hitRatePointDelta: 1.6,
      roiPointDelta: 5.5,
      profitDeltaYen: 8200,
      sameStakeCoveragePercent: 100
    }),
    hole: variant("approval-candidate-human-review", 500, 500, 0, {
      hitCountDelta: 8,
      hitRatePointDelta: 1.6,
      roiPointDelta: 7.2,
      profitDeltaYen: 23600,
      sameStakeCoveragePercent: 100
    })
  }
});
const activeView = panel.buildViewModel(activeReport);
assert.equal(activeView.overallStatusLabel, "承認候補あり・未採用");
assert.equal(activeView.overallTone, "success");
assert.equal(activeView.recommendedVariantLabel, "万舟B");
assert.equal(activeView.variants[0].progressPercent, 48);
assert.equal(activeView.variants[0].milestoneText, "250Rまで残り130R");
assert.equal(activeView.variants[0].hitDeltaLabel, "+3R");
assert.equal(activeView.variants[0].hitRateDeltaLabel, "+2.5pt");
assert.equal(activeView.variants[0].roiDeltaLabel, "+6.4pt");
assert.equal(activeView.variants[0].profitDeltaLabel, "+1,500円");
assert.equal(activeView.variants[2].progressPercent, 100);
assert.equal(activeView.variants[2].milestoneText, "500R到達・人の確認待ち");
assert.equal(activeView.variants[2].isRecommended, true);

const markup = panel.renderMarkup(activeView);
assert.match(markup, /外攻め買い目の検証進捗/);
assert.match(markup, /前向き確定 <strong>500R<\/strong>/);
assert.match(markup, /フォーメーションB/);
assert.match(markup, /確認候補：万舟B/);
assert.match(markup, /500R到達・人の確認待ち/);
assert.equal(markup.includes("流しB"), false, "誤った流し表示を出さない");
assert.match(markup, /自動採用はしません/);

const harmReport = report({
  variants: {
    cover: variant("harm-review", 100, 250, 150, {
      hitCountDelta: -4,
      hitRatePointDelta: -4,
      roiPointDelta: -12.5,
      profitDeltaYen: -9800,
      sameStakeCoveragePercent: 100
    }),
    flow: variant("collecting-to-250", 100, 250, 150),
    hole: variant("collecting-to-250", 100, 250, 150)
  }
});
const harmView = panel.buildViewModel(harmReport);
assert.equal(harmView.overallStatusLabel, "害の確認が必要");
assert.equal(harmView.overallTone, "danger");
assert.equal(harmView.variants[0].statusLabel, "害の確認が必要");
assert.equal(harmView.variants[0].profitDeltaLabel, "−9,800円");

const unavailable = panel.buildViewModel({ gateId: "other-gate" });
assert.equal(unavailable.available, false);
assert.equal(panel.renderMarkup(unavailable), "");

function fakeElement(tagName) {
  return {
    tagName: String(tagName || "").toUpperCase(),
    id: "",
    className: "",
    hidden: false,
    innerHTML: "",
    textContent: "",
    attributes: {},
    parentElement: null,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}

const nodes = new Map();
const listeners = new Map();
const inserted = [];
const statsArea = fakeElement("div");
statsArea.id = "statsArea";
const shell = fakeElement("article");
statsArea.parentElement = shell;
shell.insertBefore = (node, before) => {
  assert.equal(before, statsArea, "進捗表示を既存statsAreaの直前に置く");
  node.parentElement = shell;
  inserted.push(node);
  nodes.set(node.id, node);
};
nodes.set("statsArea", statsArea);

let currentReport = activeReport;
const fakeRoot = {
  document: {
    readyState: "complete",
    head: {
      appendChild(node) {
        nodes.set(node.id, node);
      }
    },
    createElement: fakeElement,
    getElementById(id) {
      return nodes.get(id) || null;
    },
    addEventListener() {}
  },
  ChappyOuterAttackTicketDecisionGate: {
    refresh() {
      return currentReport;
    }
  },
  addEventListener(name, callback) {
    listeners.set(name, callback);
  }
};

assert.equal(panel.install(fakeRoot), true);
assert.equal(panel.install(fakeRoot), false, "表示イベントを二重装着しない");
assert.equal(inserted.length, 1);
const area = nodes.get(panel.AREA_ID);
assert.ok(area, "進捗表示領域を生成する");
assert.equal(area.hidden, false);
assert.match(area.innerHTML, /確認候補：万舟B/);
assert.ok(nodes.get(panel.STYLE_ID), "専用styleを一度だけ生成する");
assert.equal(typeof listeners.get("chappy:stats-requested"), "function");
assert.equal(typeof listeners.get("storage"), "function");

currentReport = harmReport;
listeners.get("storage")({ key: "chappy_outer_attack_ticket_decision_gate_v1" });
assert.match(area.innerHTML, /害の確認が必要/);
assert.equal(inserted.length, 1, "更新時も表示領域を増やさない");

const statsLoader = fs.readFileSync(path.join(rootDir, "js", "stats-runtime-loader.js"), "utf8");
const appLoader = fs.readFileSync(path.join(rootDir, "js", "app-runtime-loader.js"), "utf8");
const shadowIndex = statsLoader.indexOf('"js/outer-attack-ticket-shadow.js"');
const settlementIndex = statsLoader.indexOf('"js/outer-attack-ticket-settlement.js"');
const gateIndex = statsLoader.indexOf('"js/outer-attack-ticket-decision-gate.js"');
const panelIndex = statsLoader.indexOf('"js/outer-attack-ticket-progress-panel.js"');
assert.ok(
  shadowIndex >= 0 && shadowIndex < settlementIndex && settlementIndex < gateIndex && gateIndex < panelIndex,
  "結果分析の任意読込をshadow→settlement→gate→progressの順に固定する"
);
assert.equal(
  appLoader.includes("outer-attack-ticket-progress-panel.js"),
  false,
  "進捗表示を予想開始の必須経路へ入れない"
);

console.log("outer attack ticket progress panel tests passed");
