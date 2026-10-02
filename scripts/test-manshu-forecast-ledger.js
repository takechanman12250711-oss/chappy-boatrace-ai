"use strict";

const assert = require("node:assert/strict");

const ledgerApi = require(
  "../js/manshu-forecast-ledger"
);

function detail(ticket, roles = []) {
  return {
    ticket,
    roles,
    summary: `${ticket}の展開根拠`
  };
}

function line({
  rank,
  kind,
  notation,
  tickets,
  attacker,
  units,
  roles
}) {
  return {
    rank,
    kind,
    title: `${notation}の筋`,
    reason:
      `${attacker}号艇の動きから` +
      `${notation}を想定`,
    trigger: {
      scenarioType:
        kind === "START_UPSET"
          ? "fourAttack"
          : "threeAttack",
      scenarioLabel:
        `${attacker}号艇攻め`,
      scenarioScore: 78,
      attackerBoatNo: attacker,
      attackerCourse: attacker,
      isMainScenario: rank === 1
    },
    headEvidence: {
      boatNo: Number(notation[0]),
      reason: "展開・道中の事前根拠"
    },
    formation: {
      notation,
      headBoatNos: [
        Number(notation[0])
      ],
      secondBoatNos: [1, 2],
      thirdBoatNos: [1, 2, 3],
      expandedTickets: tickets,
      pointCount: tickets.length
    },
    ticketDetails:
      tickets.map(ticket =>
        detail(ticket, roles)
      ),
    allocation: {
      unitYen: 100,
      unitsPerTicket: units,
      yenPerTicket: units * 100,
      totalUnits:
        tickets.length * units,
      totalYen:
        tickets.length * units * 100,
      label:
        `1点あたり${units}枚` +
        `（${units * 100}円）`
    }
  };
}

function samplePrediction() {
  return {
    version: "sample",
    race: {
      date: "20260903",
      stadiumCode: "20",
      raceNo: 6,
      stadiumName: "若松",
      deadlineAt:
        "2026-09-03T10:00:00+09:00"
    },
    mainSheet: {
      tickets: ["1-2-3"]
    },
    manshuSheet: {
      tickets: ["4-1-6"]
    },
    lightManshuTicketBoard: {
      title: "取れたらいいな舟券",
      lines: [
        line({
          rank: 1,
          kind: "START_UPSET",
          notation: "4-12-16",
          tickets: [
            "4-1-6",
            "4-2-1"
          ],
          attacker: 4,
          units: 3,
          roles: [
            {
              boatNo: 1,
              position: 2,
              role: "INSIDE_SURVIVOR",
              label: "内残し"
            },
            {
              boatNo: 6,
              position: 3,
              role: "FLOW_PICKUP",
              label: "展開拾い"
            }
          ]
        }),
        line({
          rank: 2,
          kind: "ROAD_PICKUP",
          notation: "6-13-12",
          tickets: [
            "6-1-2",
            "6-3-1"
          ],
          attacker: 3,
          units: 2,
          roles: [
            {
              boatNo: 1,
              position: 2,
              role: "SURVIVOR",
              label: "残し"
            },
            {
              boatNo: 6,
              position: 1,
              role: "PICKUP",
              label: "道中浮上"
            }
          ]
        }),
        line({
          rank: 3,
          kind: "OUTER_FOLLOW",
          notation: "5-14-16",
          tickets: [
            "5-1-6",
            "5-4-1"
          ],
          attacker: 4,
          units: 1,
          roles: [
            {
              boatNo: 5,
              position: 1,
              role: "FOLLOWER",
              label: "攻め連動"
            },
            {
              boatNo: 6,
              position: 3,
              role: "PICKUP",
              label: "拾い"
            }
          ]
        })
      ]
    }
  };
}

const prediction = samplePrediction();
const ledger = ledgerApi.build(prediction);

global.createPrediction =
  function basePredictionFactory() {
    return samplePrediction();
  };
const wrappedPrediction =
  global.createPrediction({
    date: "20260903",
    jcd: "20",
    raceNo: 6
  });
assert.ok(
  wrappedPrediction
    .manshuForecastLedger,
  "createPredictionの戻り値へ台帳を自動付与する"
);

global.ChappyNoteGenerator = {
  generateArticle(value) {
    return {
      ok: true,
      paidText: "通常の有料予想",
      fullText:
        "無料部分\n\n" +
        "通常の有料予想\n\n" +
        "注意書き",
      prediction: value
    };
  }
};
const wrappedArticle =
  global.ChappyNoteGenerator
    .generateArticle(
      samplePrediction()
    );
assert.match(
  wrappedArticle.paidText,
  /【本命とは別会計の参考予想】/
);
assert.match(
  wrappedArticle.fullText,
  /【参考・道中変化予想】/
);
assert.ok(
  wrappedArticle
    .manshuForecastLedger,
  "note生成結果へ使用した台帳を残す"
);

assert.ok(
  ledger,
  "複数筋から台帳を生成できる"
);
assert.equal(
  ledger.raceKey,
  "20260903-20-6"
);
assert.equal(
  ledger.totalForecastCount,
  3
);
assert.equal(
  ledger.totalTicketCount,
  6
);
assert.equal(
  ledger.totalReferenceStakeYen,
  1200
);
assert.deepEqual(
  ledger.forecasts.map(
    item => item.forecastType
  ),
  [
    "upset",
    "road-change",
    "manshu"
  ]
);
assert.ok(
  ledger.forecasts.every(item =>
    item.noteEligible === true &&
    item.saveEligible === true &&
    item.resultCheckEligible === true &&
    item.purchaseEligible === false &&
    item.affectsNormalTickets === false &&
    item.usesOdds === false &&
    item.usesOfficialResult === false
  ),
  "通常買い目へ混ぜず、note・保存・結果照合だけを有効にする"
);
assert.deepEqual(
  prediction.mainSheet.tickets,
  ["1-2-3"],
  "通常本線を変更しない"
);
assert.deepEqual(
  prediction.manshuSheet.tickets,
  ["4-1-6"],
  "通常万舟を変更しない"
);

const secondLedger =
  ledgerApi.build(
    samplePrediction()
  );
assert.deepEqual(
  secondLedger.forecasts.map(
    item => item.forecastId
  ),
  ledger.forecasts.map(
    item => item.forecastId
  ),
  "同じレース前入力なら予想IDが固定される"
);

const noteText =
  ledgerApi.formatNoteSection(
    ledger
  );
assert.match(
  noteText,
  /【参考・波乱予想】/
);
assert.match(
  noteText,
  /【参考・道中変化予想】/
);
assert.match(
  noteText,
  /【参考・万舟予想】/
);
assert.match(
  noteText,
  /通常予想・実戦厳選・購入保存には自動追加しません/
);
assert.match(noteText, /4-12-16/);
assert.match(noteText, /6-13-12/);

const result = {
  raceKey: "20260903-20-6",
  resultAvailable: true,
  trifecta: {
    combination: "6-3-1",
    payout: 15780
  }
};
const evaluation =
  ledgerApi.evaluateResult(
    ledger,
    result
  );
assert.equal(evaluation.hit, true);
assert.equal(
  evaluation.hitForecastCount,
  1
);
assert.equal(
  evaluation.stakeYen,
  1200
);
assert.equal(
  evaluation.returnYen,
  31560
);
assert.equal(
  evaluation.profitYen,
  30360
);
assert.equal(evaluation.roi, 2630);
assert.equal(
  evaluation.forecasts.find(item =>
    item.forecastType ===
      "road-change"
  ).hit,
  true
);

const summary = ledgerApi.summarize(
  [{
    raceKey: ledger.raceKey,
    manshuForecastLedger: ledger
  }],
  [{
    ...result,
    manshuForecastEvaluation:
      evaluation
  }]
);
assert.equal(
  summary.separateAccounting,
  true
);
assert.equal(
  summary.overall.raceCount,
  1
);
assert.equal(
  summary.overall.hitRaceCount,
  1
);
assert.equal(
  summary.overall.hitRate,
  100
);
assert.equal(
  summary.overall.roi,
  2630
);
assert.equal(
  summary.byType["road-change"]
    .hitRaceCount,
  1
);
assert.equal(
  summary.byType.upset
    .hitRaceCount,
  0
);

const pendingSummary =
  ledgerApi.summarize(
    [{
      raceKey: ledger.raceKey,
      manshuForecastLedger: ledger
    }],
    []
  );
assert.equal(
  pendingSummary.pendingRaceCount,
  1
);
assert.equal(
  pendingSummary.overall.raceCount,
  0
);

const enriched =
  ledgerApi.attachPrediction(
    samplePrediction()
  );
assert.ok(
  enriched.manshuForecastLedger
);
assert.equal(
  enriched.manshuSheet
    .forecastLedger,
  enriched.manshuForecastLedger
);

let savedPrediction = null;
let savedResult = null;
global.ChappyStorage = {
  buildRaceKey:
    ledgerApi.buildRaceKey,
  upsertPrediction(value) {
    savedPrediction = value;
    return value;
  },
  upsertResult(value) {
    savedResult = value;
    return value;
  },
  findPredictionByRaceKey() {
    return savedPrediction;
  },
  loadPredictionHistory() {
    return savedPrediction
      ? [savedPrediction]
      : [];
  },
  loadResults() {
    return savedResult
      ? [savedResult]
      : [];
  }
};

const storage = global.ChappyStorage;
storage.upsertPrediction({
  raceKey: "20260903-20-6",
  date: "20260903",
  jcd: "20",
  raceNo: 6,
  savedAt:
    "2026-09-03T09:30:00+09:00"
});
assert.ok(
  savedPrediction
    .manshuForecastLedger,
  "コンパクト保存にも台帳を差し込む"
);
assert.equal(
  savedPrediction
    .manshuForecastLedger
    .generatedAt,
  "2026-09-03T09:30:00+09:00"
);

storage.upsertResult({
  raceKey: "20260903-20-6",
  date: "20260903",
  jcd: "20",
  raceNo: 6,
  result: "6-3-1",
  officialPayoutPer100: 15780
});
assert.ok(
  savedResult
    .manshuForecastEvaluation,
  "公式結果保存時に別会計評価を付与する"
);
assert.equal(
  storage
    .loadManshuForecastPerformance()
    .overall.hitRaceCount,
  1
);

console.log(
  "manshu forecast ledger tests passed"
);
