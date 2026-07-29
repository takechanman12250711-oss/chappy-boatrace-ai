"use strict";

const assert = require("node:assert/strict");

const listeners = new Map();
const resultArea = {
  innerHTML: ""
};
const raceInfoArea = {
  innerHTML: ""
};
const calibrationElements = [];
const calibrationInputs = [];
let practicalMode = "selected";
let practicalSelectCalls = 0;

global.window = global;
global.window.addEventListener = (
  name,
  listener
) => {
  listeners.set(name, listener);
};
global.document = {
  body: resultArea,
  getElementById(id) {
    if (id === "resultArea") {
      return resultArea;
    }
    if (id === "raceInfoArea") {
      return raceInfoArea;
    }
    return null;
  },
  querySelectorAll() {
    return calibrationElements;
  }
};
global.ChappyPredictionCalibration = {
  generationKey() {
    return "generation-v1";
  },
  displayFor(input) {
    calibrationInputs.push(input);
    if (
      input.isRetrospective ===
        true ||
      input.predictionMode ===
        "retrospective_reference"
    ) {
      return {
        status: "unavailable",
        sampleSize: 0,
        rate: null,
        interval: null,
        message:
          "振り返り予想のため校正対象外です。"
      };
    }
    return {
      status: "collecting",
      sampleSize: 0,
      rate: null,
      interval: null,
      message:
        "同一世代・80〜89点の確定結果を収集中です（0/30件）。"
    };
  }
};
global.ChappyPracticalSelection = {
  select() {
    practicalSelectCalls += 1;
    const selectedResult = {
      status: "selected",
      maximumCount: 10,
      evidence: {
        evaluatedTargets: [{
          id: "mark-4",
          evaluation: {
            score: 76
          }
        }]
      },
      tickets: [{
        ticket: "3-4-1",
        category: "独立展開",
        selectionTier: "展開追加",
        priorityScore: 72,
        roleLabels: [{
          boatNo: 3,
          position: 1,
          role: "head",
          label: "1着軸",
          structured: true
        }, {
          boatNo: 4,
          position: 2,
          role: "hold",
          label: "2着残し",
          structured: true
        }]
      }],
      targetDecisions: [{
        evaluationId: "mark-4",
        boatNo: 4,
        symbol: "△",
        candidateDecisions: [{
          ticket: "3-4-1",
          ticketSelected: true,
          relation: "structured",
          reason:
            "4号艇の2着残しが構造化展開と一致",
          roleLabels: [{
            boatNo: 4,
            position: 2,
            role: "hold",
            label: "2着残し",
            structured: true
          }]
        }, {
          ticket: "4-3-1",
          ticketSelected: false,
          relation: "physical-only",
          reason:
            "4号艇頭の構造化根拠がなく比較で非採用",
          roleLabels: [{
            boatNo: 4,
            position: 1,
            role: "position",
            label: "1着候補",
            structured: false
          }]
        }]
      }],
      expansionSummary: {
        normalCount: 7,
        addedCount: 1,
        finalCount: 8,
        hasIndependentAdditions: true,
        exceededNormalMaximum: true,
        reason:
          "時系列と艇・着順・役割が一致した独立展開だけを追加。",
        addedTickets: [{
          ticket: "3-4-1",
          priorityScore: 72
        }]
      },
      verificationEvidence: {
        generation: {
          logicFingerprint:
            "evaluated-scenarios-v1",
          confidenceDefinitionVersion:
            "internal-score-v1",
          ticketPolicyVersion:
            "practical-5-7-10-v1"
        }
      }
    };

    if (practicalMode === "selected") {
      return selectedResult;
    }

    return {
      status: "skipped",
      reason:
        "主軸となる展開が定まらないため見送り。",
      maximumCount: 10,
      evidence:
        selectedResult.evidence,
      tickets: [],
      targetDecisions: [{
        evaluationId: "mark-4",
        boatNo: 4,
        symbol: "△",
        candidateCount: 1,
        selectedCandidateCount: 0,
        excludedCandidateCount: 1,
        hiddenCandidateCount: 0,
        candidateDecisions: [{
          ticket: "3-4-1",
          ticketSelected: false,
          relation: "structured",
          reasonCode: "RACE_SKIPPED",
          reason:
            "主軸となる展開が定まらないため見送り。",
          roleLabels: [{
            boatNo: 4,
            position: 2,
            role: "hold",
            label: "2着残し",
            structured: true
          }]
        }]
      }]
    };
  }
};

require("../js/render");

global.renderAll({
  simpleEvaluation: {
    mode: "main",
    label: "本線信頼度",
    level: "高",
    score: 82,
    mainComment:
      "展開とコースを中心に比較"
  }
});

const html = resultArea.innerHTML;
const meterCount =
  (
    html.match(
      /class="v3-ai-meter"/g
    ) || []
  ).length;

assert.equal(
  meterCount,
  1,
  "AI総合は内部評価を1種類だけ表示する"
);
assert.match(
  html,
  /本線信頼度（内部指数）/
);
assert.match(html, /82点/);
assert.doesNotMatch(
  html,
  /万舟期待度/
);
assert.match(
  html,
  /内部指数は予想同士を比較する評価点で、的中確率ではありません/
);
assert.match(
  html,
  /8〜10点へ拡張/
);
assert.match(
  html,
  /通常7点[\s\S]*＋独立1点[\s\S]*＝8点/
);
assert.match(
  html,
  /採用優先度 72（内部比較値）/
);
assert.doesNotMatch(
  html,
  /3-4-1・72点/,
  "候補選定の優先度を確率やAI総合指数のように表示しない"
);
assert.match(
  html,
  /買い目採用判定/
);
assert.match(
  html,
  /評価根拠で採用/
);
assert.match(
  html,
  /候補保持・非採用/
);
assert.match(
  html,
  /2着残し/
);
assert.match(
  html,
  /別根拠/
);
assert.equal(
  calibrationInputs[0].mode,
  "main",
  "校正表示へ本線・波乱の評価modeを渡す"
);
assert.deepEqual(
  calibrationInputs[0]
    .generation,
  {
    logicFingerprint:
      "evaluated-scenarios-v1",
    confidenceDefinitionVersion:
      "internal-score-v1",
    ticketPolicyVersion:
      "practical-5-7-10-v1"
  },
  "事前注入なしでも選定結果の世代IDを校正表示へ渡す"
);
assert.equal(
  practicalSelectCalls,
  1,
  "同じ描画内で実戦選定を再計算しない"
);
assert.match(
  html,
  /data-calibration-mode="main"/
);
assert.match(
  html,
  /data-calibration-retrospective="false"/
);

assert.equal(
  typeof listeners.get(
    "chappy:prediction-calibration-loaded"
  ),
  "function",
  "校正JSONの遅延読込後に表示を更新できる"
);
assert.equal(
  typeof listeners.get(
    "chappy:prediction-calibration-unavailable"
  ),
  "function",
  "校正JSONの取得失敗後にunavailable表示へ更新できる"
);
assert.equal(
  typeof listeners.get(
    "chappy:prediction-runtime-optional-unavailable"
  ),
  "function",
  "任意校正モジュールの取得失敗後にunavailable表示へ更新できる"
);

const calibrationApi =
  global
    .ChappyPredictionCalibration;
delete global
  .ChappyPredictionCalibration;
const unavailableMessage = {
  textContent:
    "新方式データを蓄積中"
};
const unavailableClasses =
  new Set([
    "is-collecting"
  ]);
const unavailableElement = {
  dataset: {
    calibrationScore: "82",
    calibrationMode: "main",
    calibrationGeneration:
      "generation-v1",
    calibrationRetrospective:
      "false",
    calibrationPredictionMode:
      "server_pre_deadline"
  },
  classList: {
    remove(...names) {
      names.forEach(name =>
        unavailableClasses.delete(
          name
        )
      );
    },
    add(name) {
      unavailableClasses.add(name);
    }
  },
  querySelector(selector) {
    return selector === "strong"
      ? unavailableMessage
      : null;
  }
};
calibrationElements.push(
  unavailableElement
);
listeners.get(
  "chappy:prediction-runtime-optional-unavailable"
)();
assert.equal(
  unavailableElement.dataset
    .calibrationStatus,
  "unavailable"
);
assert.equal(
  unavailableMessage.textContent,
  "実績校正データを取得できません。予想はそのまま確認できます。"
);
assert.ok(
  unavailableClasses.has(
    "is-unavailable"
  )
);
calibrationElements.length = 0;
global.renderAll({
  simpleEvaluation: {
    mode: "main",
    label: "本線信頼度",
    level: "高",
    score: 82,
    mainComment:
      "展開とコースを中心に比較"
  }
});
assert.match(
  resultArea.innerHTML,
  /実績校正データを取得できません/
);
assert.doesNotMatch(
  resultArea.innerHTML,
  /新方式データを蓄積中（0\/30R）/
);
global
  .ChappyPredictionCalibration =
  calibrationApi;

global.renderAll({
  isRetrospective: true,
  predictionMode:
    "retrospective_reference",
  simpleEvaluation: {
    mode: "main",
    label: "本線信頼度",
    level: "高",
    score: 82,
    mainComment:
      "振り返り確認"
  }
});
assert.equal(
  calibrationInputs.at(-1)
    .isRetrospective,
  true
);
assert.equal(
  calibrationInputs.at(-1)
    .predictionMode,
  "retrospective_reference"
);
assert.match(
  resultArea.innerHTML,
  /振り返り予想のため校正対象外/
);
assert.match(
  resultArea.innerHTML,
  /data-calibration-retrospective="true"/
);

practicalMode = "skipped";
global.renderAll({
  simpleEvaluation: {
    mode: "chaos",
    label: "波乱入口",
    level: "高",
    score: 79,
    mainComment:
      "波乱展開を比較"
  }
});
const skippedHtml =
  resultArea.innerHTML;

assert.match(
  skippedHtml,
  /主軸となる展開が定まらないため見送り/
);
assert.match(
  skippedHtml,
  /購入は見送りますが、艇ごとの候補と非採用理由は下に残します/
);
assert.match(
  skippedHtml,
  /買い目採用判定/
);
assert.match(
  skippedHtml,
  /候補保持・非採用/
);
assert.equal(
  calibrationInputs.at(-1).mode,
  "chaos",
  "波乱入口の校正を本線信頼度へ混ぜない"
);

console.log(
  "予想透明性UIテスト: 合格"
);
