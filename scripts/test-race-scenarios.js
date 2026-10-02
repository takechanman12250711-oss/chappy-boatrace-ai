"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");

const aiCore = global.ChappyAICore;

function boat(
  boatNo,
  {
    total = 65,
    st = 60,
    exhibition = 60,
    raceFlow = 65,
    local = 60,
    attack = 60,
    flow = 60,
    hold = 60,
    pickup = 60,
    road = 60
  } = {}
) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      total,
      st,
      exhibition,
      raceFlow,
      local
    },
    roleScores: {
      attack,
      flow,
      hold,
      pickup,
      road
    }
  };
}

const analyses = [
  boat(1, { total: 72, st: 58, exhibition: 58, hold: 86 }),
  boat(2, { total: 69, st: 60, exhibition: 60, hold: 81 }),
  boat(3, {
    total: 86,
    st: 88,
    exhibition: 86,
    raceFlow: 89,
    attack: 92,
    flow: 88,
    hold: 63,
    pickup: 74,
    road: 72
  }),
  boat(4, {
    total: 67,
    st: 62,
    exhibition: 61,
    attack: 68,
    flow: 66,
    hold: 67,
    pickup: 70,
    road: 69
  }),
  boat(5, {
    total: 66,
    st: 64,
    exhibition: 65,
    local: 82,
    attack: 66,
    flow: 84,
    hold: 58,
    pickup: 88,
    road: 80
  }),
  boat(6, {
    total: 62,
    st: 63,
    exhibition: 63,
    local: 76,
    attack: 61,
    flow: 74,
    hold: 55,
    pickup: 83,
    road: 86
  })
];

const data = {
  stadiumCode: "12",
  raceNo: 8,
  historyContext: {
    venueRace: {
      trend: {
        frameMovement: {
          "1": {
            samples: 180,
            reliability: "high",
            riseRate: 0,
            stayRate: 72.2,
            sinkRate: 27.8,
            label: "沈下",
            hasBaseline: true,
            baselineRiseRate: 0,
            baselineStayRate: 55.2,
            baselineSinkRate: 44.8,
            movementDelta: 34
          },
          "3": {
            samples: 180,
            reliability: "high",
            riseRate: 25,
            stayRate: 18,
            sinkRate: 57,
            label: "沈下",
            hasBaseline: true,
            baselineRiseRate: 34.6,
            baselineStayRate: 20.1,
            baselineSinkRate: 45.3,
            movementDelta: -21.3
          },
          "4": {
            samples: 180,
            reliability: "high",
            riseRate: 48,
            stayRate: 19,
            sinkRate: 33,
            label: "浮上",
            hasBaseline: true,
            baselineRiseRate: 46.8,
            baselineStayRate: 19.3,
            baselineSinkRate: 34,
            movementDelta: 2.2
          },
          "5": {
            samples: 178,
            reliability: "high",
            riseRate: 38.2,
            stayRate: 25.3,
            sinkRate: 36.5,
            label: "浮上"
          }
        }
      }
    }
  },
  entries: analyses.map((analysis) => ({
    boat: analysis.boatNo,
    racerName: analysis.playerName,
    avgSt: 0.15,
    exhibitionTime: 6.8
  }))
};

const result = aiCore.buildRaceScenarios(analyses, data);

assert.deepEqual(
  result.scenarios.map((scenario) => scenario.type).sort(),
  ["escape", "fourAttack", "sashi", "threeAttack"]
);

assert.equal(result.mainScenario.type, "threeAttack");
assert.equal(result.attacker, 3);
assert.equal(result.wallBoat, 2);
assert.deepEqual(result.blockedBoats, [4]);
assert.equal(result.confidence, result.mainScenario.score);

assert.deepEqual(
  result.remainers,
  [1, 2],
  "3攻めでは4号艇を残し候補へ強制追加しない"
);
assert.ok(!result.followers.includes(result.attacker));
assert.equal(result.followers[0], 5);
assert.equal(result.pickupCandidates[0], 5);
assert.equal(result.roadRaceBoats[0], 6);
assert.deepEqual(result.localExperts, [5, 6]);
assert.equal(result.frameMovement.length, 6);
assert.equal(result.frameMovement[0].samples, 180);
assert.equal(result.frameMovement[0].appliedToScore, true);
assert.equal(result.frameMovement[0].scoreAdjustment, 5);
assert.equal(result.frameMovement[2].scoreAdjustment, -5);
assert.equal(result.frameMovement[3].scoreAdjustment, 0);
assert.equal(result.frameMovement[4].appliedToScore, false);
assert.equal(
  result.scenarios.find(
    scenario => scenario.type === "escape"
  ).frameMovementAdjustment,
  5
);
assert.equal(
  result.scenarios.find(
    scenario => scenario.type === "threeAttack"
  ).frameMovementAdjustment,
  -5
);
assert.equal(result.frameMovement[4].label, "浮上");
assert.equal(result.frameMovement[1].label, "判定保留");

assert.equal(result.evidence.scenario, "3コース攻め");
assert.equal(result.evidence.score, result.confidence);
assert.ok(result.evidence.mainGap >= 0);
assert.ok(result.evidence.firstCandidates.includes(3));
assert.equal(result.evidence.frameMovement.length, 4);
assert.equal(result.dataStatus.hasSt, true);
assert.equal(result.dataStatus.hasExhibition, true);

const noSashiComparisonData = {
  ...data,
  entries: data.entries.map((entry) => {
    if (![1, 2].includes(Number(entry.boat))) return { ...entry };
    const cloned = { ...entry };
    delete cloned.avgSt;
    delete cloned.avgST;
    delete cloned.averageSt;
    delete cloned.averageST;
    return cloned;
  })
};
const withSashiComparison = aiCore.buildRaceScenarios(analyses, data);
const withoutSashiComparison = aiCore.buildRaceScenarios(
  analyses,
  noSashiComparisonData
);
const withSashiScore = withSashiComparison.scenarios.find(
  scenario => scenario.type === "sashi"
).score;
const withoutSashiScore = withoutSashiComparison.scenarios.find(
  scenario => scenario.type === "sashi"
).score;
assert.ok(
  Math.abs(
    (withSashiScore - withoutSashiScore) - 15
  ) < 1e-9,
  "1・2号艇の平均ST比較が無い場合だけ2差し頭の成立度を15点抑える"
);
assert.ok(
  withoutSashiComparison.scenarios
    .find(scenario => scenario.type === "sashi")
    .outcome.secondCandidates
    .some(row => row.boatNo === 2),
  "比較根拠不足でも2号艇の2着差し残り候補は維持する"
);

function officialCourseEntries() {
  return Array.from({ length: 6 }, (_, index) => {
    const boatNo = index + 1;
    return {
      boat: boatNo,
      racerName: `${boatNo}号艇`,
      avgSt: 0.15,
      exhibitionTime: 6.8,
      // 旧値が枠なりでも、完全な公式start写像を正本にする。
      exhibitionCourse: boatNo
    };
  });
}

function officialStartRows(courseByBoat, isOfficial = true) {
  return Array.from({ length: 6 }, (_, index) => {
    const boatNo = index + 1;
    return {
      boat: boatNo,
      course: courseByBoat[boatNo] ?? boatNo,
      st: 0.12 + boatNo * 0.01,
      isOfficialCourse: isOfficial,
      mappingSource:
        isOfficial ? "official-start-image" : "unverified"
    };
  });
}

function moveProfiles(source, mapping) {
  return source.map((analysis) => {
    const nextBoatNo = mapping[analysis.boatNo] ?? analysis.boatNo;
    return {
      ...JSON.parse(JSON.stringify(analysis)),
      boatNo: nextBoatNo,
      playerName: `${nextBoatNo}号艇`
    };
  });
}

function scoreVector(result) {
  return Object.fromEntries(
    result.scenarios
      .map((scenario) => [scenario.type, scenario.score])
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

const identityCourseData = {
  stadiumCode: "12",
  raceNo: 9,
  entries: officialCourseEntries(),
  startExhibition: officialStartRows({})
};
const identityCourseResult =
  aiCore.buildRaceScenarios(analyses, identityCourseData);
const swappedCourseAnalyses = moveProfiles(
  analyses,
  { 3: 6, 6: 3 }
);
const swappedCourseData = {
  ...identityCourseData,
  entries: officialCourseEntries(),
  startExhibition: officialStartRows({ 3: 6, 6: 3 })
};
const swappedCourseResult =
  aiCore.buildRaceScenarios(
    swappedCourseAnalyses,
    swappedCourseData
  );

assert.deepEqual(
  scoreVector(swappedCourseResult),
  scoreVector(identityCourseResult),
  "同じコース能力配置なら艇番が入れ替わっても展開点を変えない"
);
assert.deepEqual(
  swappedCourseResult.relations,
  identityCourseResult.relations,
  "隣接艇比較もコース占有艇同士で維持する"
);
assert.equal(swappedCourseResult.mainScenario.type, "threeAttack");
assert.equal(swappedCourseResult.mainScenario.attacker, 3);
assert.equal(swappedCourseResult.mainScenario.attackerCourse, 3);
assert.equal(swappedCourseResult.mainScenario.attackerBoatNo, 6);
assert.equal(swappedCourseResult.mainScenario.headBoatNo, 6);
assert.equal(swappedCourseResult.attackerCourse, 3);
assert.equal(swappedCourseResult.attacker, 6);

const identityThreeOutcome = identityCourseResult.scenarios
  .find((scenario) => scenario.type === "threeAttack")
  .outcome.boats;
const swappedThreeOutcome = swappedCourseResult.scenarios
  .find((scenario) => scenario.type === "threeAttack")
  .outcome.boats;
const outcomeScores = (rows, boatNo) => {
  const row = rows.find((item) => item.boatNo === boatNo);
  return {
    firstScore: row.firstScore,
    secondScore: row.secondScore,
    thirdScore: row.thirdScore,
    reasons: row.reasons
  };
};
assert.deepEqual(
  outcomeScores(swappedThreeOutcome, 6),
  outcomeScores(identityThreeOutcome, 3),
  "3コース役割点を実際の6号艇へ移す"
);
assert.deepEqual(
  outcomeScores(swappedThreeOutcome, 3),
  outcomeScores(identityThreeOutcome, 6),
  "6コースへ回った3号艇へ外の拾い役割を移す"
);

const nonOfficialSwapResult = aiCore.buildRaceScenarios(
  analyses,
  {
    ...identityCourseData,
    entries: officialCourseEntries(),
    startExhibition: officialStartRows(
      { 3: 6, 6: 3 },
      false
    )
  }
);
assert.deepEqual(
  scoreVector(nonOfficialSwapResult),
  scoreVector(identityCourseResult),
  "非公式の進入値は部分適用せず枠なりへ戻す"
);
assert.equal(nonOfficialSwapResult.attacker, 3);

const duplicateOfficialResult = aiCore.buildRaceScenarios(
  analyses,
  {
    ...identityCourseData,
    entries: officialCourseEntries(),
    startExhibition: officialStartRows({ 6: 5 })
  }
);
assert.deepEqual(
  scoreVector(duplicateOfficialResult),
  scoreVector(identityCourseResult),
  "公式でもコース重複なら6艇すべて枠なりへ戻す"
);
assert.equal(duplicateOfficialResult.attacker, 3);

const swapThreeFourResult = aiCore.buildRaceScenarios(
  moveProfiles(analyses, { 3: 4, 4: 3 }),
  {
    ...identityCourseData,
    entries: officialCourseEntries(),
    startExhibition: officialStartRows({ 3: 4, 4: 3 })
  }
);
assert.equal(swapThreeFourResult.mainScenario.type, "threeAttack");
assert.equal(swapThreeFourResult.attacker, 4);
assert.deepEqual(
  swapThreeFourResult.blockedBoats,
  [3],
  "3攻めで狭くなる4コース占有艇を物理艇番のまま保持する"
);
assert.ok(!swapThreeFourResult.blockedBoats.includes(4));

const frameMappedResult = aiCore.buildRaceScenarios(
  swappedCourseAnalyses,
  {
    ...swappedCourseData,
    historyContext: {
      venueRace: {
        trend: {
          frameMovement: {
            "3": {
              samples: 180,
              hasBaseline: true,
              movementDelta: -20,
              label: "沈下"
            },
            "6": {
              samples: 180,
              hasBaseline: true,
              movementDelta: 20,
              label: "浮上"
            }
          }
        }
      }
    }
  }
);
assert.equal(
  frameMappedResult.scenarios.find(
    (scenario) => scenario.type === "threeAttack"
  ).frameMovementAdjustment,
  5,
  "3コースの物理艇6に実際に適用した枠別補正を参照する"
);

console.log("展開シナリオエンジン専用テスト: 合格");
console.log("- 4展開: 1逃げ・2差し・3攻め・4カド");
console.log("- 役割: 攻め・壁・残し・展開・拾い・道中・当地");
console.log("- このテスト範囲: 展開と役割出力");
