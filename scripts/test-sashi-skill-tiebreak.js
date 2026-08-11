"use strict";

const assert = require("node:assert/strict");
global.window = global;
require("../js/ai-core");
const core = global.ChappyAICore;

function boat(no, overrides = {}) {
  return {
    boatNo: no,
    playerName: `${no}号艇`,
    indexes: {
      total: 68,
      st: 62,
      exhibition: 62,
      raceFlow: 66,
      local: 60,
      national: 60,
      ...(overrides.indexes || {})
    },
    roleScores: {
      attack: 62,
      flow: 66,
      hold: 68,
      pickup: 62,
      road: 62,
      ...(overrides.roleScores || {})
    },
    attackTheory: overrides.attackTheory || null
  };
}

function dataFor(analyses) {
  return {
    stadiumCode: "12",
    raceNo: 8,
    entries: analyses.map((a) => ({
      boat: a.boatNo,
      racerName: a.playerName,
      avgSt: 0.15,
      exhibitionTime: 6.80
    }))
  };
}

function scenarioMap(rs) {
  return Object.fromEntries(rs.scenarios.map((s) => [s.type, s]));
}

let calibrated = null;
for (let flow2 = 66; flow2 <= 96; flow2 += 0.5) {
  const analyses = [
    boat(1, {
      indexes: { total: 72, st: 66, raceFlow: 70, national: 60 },
      roleScores: { flow: 70, hold: 74, attack: 58, road: 62 }
    }),
    boat(2, {
      indexes: { total: 71, st: 66, raceFlow: flow2, national: 60 },
      roleScores: { flow: flow2, hold: 74, attack: 70, road: 66 }
    }),
    boat(3), boat(4), boat(5), boat(6)
  ];
  const rs = core.buildRaceScenarios(analyses, dataFor(analyses));
  const by = scenarioMap(rs);
  const gap = Number(by.escape.score) - Number(by.sashi.score);
  if (rs.mainScenario?.type === "escape" && gap >= 0 && gap <= 2.5) {
    calibrated = { analyses, gap, escape: by.escape.score, sashi: by.sashi.score };
    break;
  }
}

assert.ok(calibrated, "1逃げと2差しが2.5点以内になる基準ケースを作れる");

const almost = calibrated.analyses.map((a) => JSON.parse(JSON.stringify(a)));
almost[1].indexes.national = almost[0].indexes.national + 9;
const almostRs = core.buildRaceScenarios(almost, dataFor(almost));
assert.equal(almostRs.mainScenario.type, "escape", "技量差9では1逃げを維持する");

const eligible = calibrated.analyses.map((a) => JSON.parse(JSON.stringify(a)));
eligible[1].indexes.national = eligible[0].indexes.national + 10;
const eligibleRs = core.buildRaceScenarios(eligible, dataFor(eligible));
const eligibleBy = scenarioMap(eligibleRs);
assert.equal(eligibleRs.mainScenario.type, "sashi", "接戦かつ技量差10以上なら2差しを最終採用する");
assert.equal(eligibleBy.escape.score, calibrated.escape, "1逃げの生スコアは変更しない");
assert.equal(eligibleBy.sashi.score, calibrated.sashi, "2差しの生スコアは加点しない");
assert.equal(eligibleRs.evidence?.sashiSkillTiebreak?.applied, true, "タイブレーク適用根拠を evidence に残す");
assert.ok(eligibleRs.evidence.sashiSkillTiebreak.scoreGap <= 2.5);
assert.ok(eligibleRs.evidence.sashiSkillTiebreak.nationalSkillGap >= 10);

console.log("2差し技量タイブレーク回帰テスト: 合格");
