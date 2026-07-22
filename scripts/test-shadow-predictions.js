"use strict";

const assert = require("node:assert/strict");
const {
  MIN_SCORE,
  buildCollectionHealth,
  buildRecoveryPlan,
  insufficientReasons,
  compactStoredVerification,
  upsertByRaceKey
} = require("./collect-predictions");

assert.equal(MIN_SCORE, 70);

const collectionHealth = buildCollectionHealth(
  "20260722",
  [
    { jcd: "08", place: "常滑", raceNo: 1, deadlineAt: "2026-07-22T10:00:00+09:00" },
    { jcd: "19", place: "下関", raceNo: 2, deadlineAt: "2026-07-22T10:05:00+09:00" },
    { jcd: "24", place: "大村", raceNo: 3, deadlineAt: "2026-07-22T10:10:00+09:00" }
  ],
  [
    { jcd: "08", raceNo: 1, status: "evaluated", error: "" },
    { jcd: "19", raceNo: 2, status: "insufficient_data", error: "データ不足" },
    { jcd: "24", raceNo: 3, status: "fetch_failed", error: "HTTP 500" }
  ],
  [{ raceKey: "20260722-08-1" }]
);

assert.equal(collectionHealth.targetCount, 3);
assert.equal(collectionHealth.savedCount, 1);
assert.equal(collectionHealth.insufficientDataCount, 1);
assert.equal(collectionHealth.failedCount, 1);
assert.equal(collectionHealth.complete, false);
assert.equal(collectionHealth.targets[0].status, "saved");
assert.equal(collectionHealth.targets[1].status, "insufficient_data");
assert.equal(collectionHealth.targets[2].status, "fetch_failed");

assert.deepEqual(insufficientReasons({
  ready: false,
  honmei: { reasons: ["出走データ5/6艇", "STデータ3/6艇"] },
  manshu: { reasons: ["STデータ3/6艇"] }
}), ["出走データ5/6艇", "STデータ3/6艇"]);

const recoveryPlan = buildRecoveryPlan(
  "20260722",
  [{ jcd: "24", place: "大村", raceNo: 7, deadlineAt: "2026-07-22T20:25:00+09:00" }],
  {
    runs: [{
      checkedAt: "2026-07-22T10:00:00.000Z",
      collectionHealth: {
        targets: [
          {
            raceKey: "20260722-15-11",
            jcd: "15",
            place: "丸亀",
            raceNo: 11,
            deadlineAt: "2026-07-22T20:06:00+09:00",
            status: "insufficient_data",
            missingReasons: ["STデータ3/6艇"],
            attemptCount: 1
          },
          {
            raceKey: "20260722-19-10",
            jcd: "19",
            place: "下関",
            raceNo: 10,
            deadlineAt: "2026-07-22T19:45:00+09:00",
            status: "fetch_failed",
            attemptCount: 2
          }
        ]
      }
    }]
  },
  new Date("2026-07-22T11:00:00.000Z")
);

assert.equal(recoveryPlan.targets.length, 2);
assert.equal(recoveryPlan.targets.find(item => item.jcd === "15").recoveryAttempt, true);
assert.equal(recoveryPlan.finalizedTargets.length, 1);
assert.equal(recoveryPlan.finalizedTargets[0].status, "final_uncollected");

const recoveredHealth = buildCollectionHealth(
  "20260722",
  recoveryPlan.targets,
  [
    { jcd: "15", raceNo: 11, status: "evaluated" },
    { jcd: "24", raceNo: 7, status: "evaluated" }
  ],
  [
    { raceKey: "20260722-15-11" },
    { raceKey: "20260722-24-7" }
  ],
  recoveryPlan.finalizedTargets,
  "2026-07-22T11:01:00.000Z"
);
assert.equal(recoveredHealth.recoveredCount, 1);
assert.equal(recoveredHealth.finalUncollectedCount, 1);
assert.equal(recoveredHealth.targets.find(item => item.jcd === "15").attemptCount, 2);
assert.deepEqual(
  recoveredHealth.targets.find(item => item.jcd === "15").missingReasons,
  ["STデータ3/6艇"]
);

const records = upsertByRaceKey(
  [
    { raceKey: "20260722-08-1", selectedAt: "old", scoreBand: "under_70" },
    { raceKey: "20260722-12-1", selectedAt: "kept", scoreBand: "under_70" }
  ],
  [
    { raceKey: "20260722-08-1", selectedAt: "new", scoreBand: "70_plus" },
    { raceKey: "20260722-19-1", selectedAt: "added", scoreBand: "under_70" }
  ]
);

assert.equal(records.length, 3);
assert.equal(records.find(item => item.raceKey === "20260722-08-1").selectedAt, "new");
assert.equal(records.find(item => item.raceKey === "20260722-12-1").selectedAt, "kept");
assert.equal(records.find(item => item.raceKey === "20260722-19-1").scoreBand, "under_70");

const compacted = compactStoredVerification({
  raceKey: "20260722-19-1",
  result: { settled: true },
  prediction: {
    version: "test",
    predictionMode: "server_pre_deadline_shadow",
    raceFlow: { title: "1逃げ本線", summary: "要約", oversized: "削除" },
    mainSheet: {
      honmei: { boatNo: 1, name: "本命", buffs: ["大きな分析"] },
      taikou: { boatNo: 2, name: "対抗" },
      tickets: Array.from({ length: 30 }, () => ({ ticket: "1-2-3" }))
    },
    manshuSheet: { oversized: true },
    ticketRanks: Array.from({ length: 30 }, () => ({ ticket: "1-2-3" })),
    practicalTickets: [{ ticket: "1-2-3", category: "本線" }],
    preRaceConditions: { weather: { windSpeed: 3 } },
    verificationEvidence: {
      sourceCommit: "abc123",
      aiCoreVersion: "ai-core-test",
      mainScenario: {
        type: "threeAttack",
        label: "3コース攻め",
        score: 88,
        frameMovementAdjustment: -2,
        attacker: 3,
        blockedBoats: [4]
      },
      roles: {
        attacker: 3,
        wallBoat: 2,
        remainers: [1, 2],
        followers: [5],
        pickupCandidates: [5, 6],
        roadRaceBoats: [6],
        localExperts: [],
        blockedBoats: [4]
      }
    }
  }
});

assert.equal(compacted.result.settled, true);
assert.equal(compacted.prediction.raceFlow.title, "1逃げ本線");
assert.equal(compacted.prediction.mainSheet.honmei.boatNo, 1);
assert.equal(compacted.prediction.practicalTickets.length, 1);
assert.equal(compacted.prediction.preRaceConditions.weather.windSpeed, 3);
assert.equal(
  compacted.prediction.verificationEvidence.mainScenario.type,
  "threeAttack"
);
assert.equal(
  compacted.prediction.verificationEvidence.roles.attacker,
  3
);
assert.equal(compacted.prediction.manshuSheet, undefined);
assert.equal(compacted.prediction.ticketRanks, undefined);
assert.equal(compacted.prediction.mainSheet.tickets, undefined);

const generatedEvidence = compactStoredVerification({
  raceKey: "20260723-24-1",
  prediction: {
    version: "prediction-test",
    aiCore: {
      version: "ai-core-v3.1.0-unified-bets",
      raceScenarios: {
        mainScenario: {
          type: "fourAttack",
          label: "4カド攻め",
          score: 91,
          frameMovementAdjustment: 3,
          attacker: 4,
          blockedBoats: []
        },
        subScenario: {
          type: "escape",
          label: "1号艇逃げ",
          score: 86,
          frameMovementAdjustment: -1,
          attacker: 1,
          blockedBoats: []
        },
        scenarios: [],
        attacker: 4,
        wallBoat: 3,
        remainers: [1, 2],
        followers: [5],
        pickupCandidates: [5, 6],
        roadRaceBoats: [6],
        localExperts: [1],
        blockedBoats: [],
        evidence: {
          relations: { fourVsThree: 9 },
          frameMovement: [{ boatNo: 4, scoreAdjustment: 3 }]
        }
      },
      marks: {
        honmei: { boatNo: 4, playerName: "4号艇" },
        taikou: { boatNo: 1, playerName: "1号艇" },
        ana: { boatNo: 5, playerName: "5号艇" },
        osae: { boatNo: 2, playerName: "2号艇" }
      },
      formations: {
        mainEstablished: true,
        axis: { honmei: 4, taikou: 1, ana: 5, osae: 2 },
        evidence: { scenarioType: "fourAttack" }
      }
    }
  }
});

assert.equal(
  generatedEvidence.prediction.verificationEvidence.aiCoreVersion,
  "ai-core-v3.1.0-unified-bets"
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.mainScenario.type,
  "fourAttack"
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.mainScenario
    .frameMovementAdjustment,
  3
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.marks.honmei.boatNo,
  4
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.formation.scenarioType,
  "fourAttack"
);

console.log("シャドー予想保存テスト: 合格");
