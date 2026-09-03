"use strict";

const assert = require("node:assert/strict");
const { isDeepStrictEqual } = require("node:util");

global.window = global;
require("../js/evaluated-scenario-candidates");
require("../js/ai-core");
const theoryInput = require("../js/theory-input");
require("../js/prediction");
const predictionConditions =
  require("../js/prediction-conditions");
const practicalSelection =
  require("../js/practical-selection");
const aiCore = global.ChappyAICore;

const officialEntriesWithEquipmentNumbers = Array.from(
  { length: 6 },
  (_, index) => ({
    boat: index + 1,
    // 公式APIのboatNoは枠番ではなくボート機材番号。
    // 1〜6の値でもboat（枠番）を上書きしてはならない。
    boatNo: [65, 46, 3, 2, 62, 10][index],
    racerName: `${index + 1}号艇`,
    className: "A1",
    avgSt: 0.15,
    nationalWinRate: 6,
    localWinRate: 6,
    motor2Rate: 35,
    exhibition: { displayTime: 6.8 + index * 0.01 }
  })
);

const officialEntryEvaluation = aiCore.buildRaceTrendEvaluation({
  stadiumCode: "15",
  raceNo: 12,
  entries: officialEntriesWithEquipmentNumbers
});

assert.equal(officialEntryEvaluation.dataStatus.entryCount, 6);

function boat(boatNo, total, raceFlow, attack, hold, pickup, road = 65) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: { total, raceFlow, attack, turn: road, local: 60 },
    roleScores: { attack, hold, pickup, road }
  };
}

const unclear = [
  boat(1, 68, 58, 55, 70, 55),
  boat(2, 67, 60, 58, 69, 58),
  boat(3, 66, 70, 68, 58, 62),
  boat(4, 65, 69, 67, 61, 65),
  boat(5, 62, 64, 63, 55, 69),
  boat(6, 60, 62, 60, 52, 70)
];

const unclearFormation = aiCore.buildFormations(unclear);
assert.equal(unclearFormation.mainEstablished, false);
assert.deepEqual(unclearFormation.main, []);
assert.deepEqual(unclearFormation.flow, []);
assert.deepEqual(unclearFormation.flowFormations, []);

const established = [
  boat(1, 82, 76, 62, 86, 68),
  boat(2, 78, 73, 67, 82, 70),
  boat(3, 73, 80, 76, 62, 72),
  boat(4, 70, 72, 70, 74, 71),
  boat(5, 68, 70, 68, 59, 78),
  boat(6, 64, 68, 64, 56, 73)
];

const establishedFormation = aiCore.buildFormations(established);
assert.equal(establishedFormation.mainEstablished, true);
assert.equal(establishedFormation.evidence.oneEscape, true);
assert.equal(establishedFormation.evidence.twoSashi, true);
assert.equal(establishedFormation.evidence.flow, true);
assert.ok(establishedFormation.main.length >= 3);
assert.ok(establishedFormation.safety.length >= 2);
assert.ok(establishedFormation.flow.length >= 1);

function assertCompleteFlowFormation(
  formation,
  expectedHead
) {
  assert.equal(
    formation.flowFormations.length,
    1,
    "正式主展開につき表示用流しを1件返す"
  );

  const flowFormation =
    formation.flowFormations[0];

  assert.equal(flowFormation.headBoatNo, expectedHead);
  assert.ok(
    flowFormation.secondBoatNos.length >= 1 &&
      flowFormation.secondBoatNos.length <= 3,
    "2着候補は1〜3艇に限定する"
  );
  assert.equal(
    new Set(flowFormation.secondBoatNos).size,
    flowFormation.secondBoatNos.length,
    "2着候補を重複させない"
  );
  assert.ok(
    !flowFormation.secondBoatNos.includes(expectedHead),
    "1着頭を2着候補へ混ぜない"
  );
  assert.deepEqual(
    flowFormation.secondBoatNos,
    [...flowFormation.secondBoatNos].sort(
      (a, b) => a - b
    ),
    "表示用の2着グループは艇番順に並べる"
  );
  assert.deepEqual(
    new Set(
      flowFormation.secondPriorityBoatNos
    ),
    new Set(flowFormation.secondBoatNos),
    "予想上の2着優先順も別に保持する"
  );
  assert.equal(flowFormation.thirdMode, "all");
  assert.ok(flowFormation.scenarioType);
  assert.ok(flowFormation.label);
  assert.match(flowFormation.reason, /3着は残り全艇/);
  assert.equal(
    flowFormation.notation,
    `${expectedHead}-${flowFormation.secondBoatNos.join("")}-全`
  );
  assert.ok(
    [4, 8, 12].includes(flowFormation.pointCount),
    "流しは2着候補数に応じて4・8・12点にする"
  );
  assert.equal(
    flowFormation.pointCount,
    flowFormation.secondBoatNos.length * 4
  );
  assert.equal(
    flowFormation.ticketCount,
    flowFormation.pointCount
  );
  assert.deepEqual(
    flowFormation.expandedTickets,
    flowFormation.tickets
  );
  assert.deepEqual(
    formation.flow,
    flowFormation.expandedTickets,
    "formation.flowへ流しの全買い目を欠落なく保持する"
  );

  for (const secondBoatNo of flowFormation.secondBoatNos) {
    const ticketsForSecond =
      flowFormation.expandedTickets.filter(
        (ticket) =>
          ticket.startsWith(
            `${expectedHead}-${secondBoatNo}-`
          )
      );

    assert.equal(
      ticketsForSecond.length,
      4,
      "各2着候補から残り全4艇へ流す"
    );
    assert.deepEqual(
      new Set(
        ticketsForSecond.map(
          (ticket) => Number(ticket.split("-")[2])
        )
      ),
      new Set(
        [1, 2, 3, 4, 5, 6].filter(
          (boatNo) =>
            boatNo !== expectedHead &&
            boatNo !== secondBoatNo
        )
      )
    );
  }
}

assertCompleteFlowFormation(
  establishedFormation,
  establishedFormation.axis.honmei
);
assert.equal(
  establishedFormation
    .flowFormations[0]
    .pointCount,
  12,
  "2着3艇は12点の全流しにする"
);

for (const ticket of [
  ...establishedFormation.main,
  ...establishedFormation.safety,
  ...establishedFormation.flow,
  ...establishedFormation.longshot
]) {
  assert.match(ticket, /^[1-6]-[1-6]-[1-6]$/);
  assert.equal(new Set(ticket.split("-")).size, 3);
}

function assertScenarioHead(analyses, expectedHead, evidenceKey) {
  const formation = aiCore.buildFormations(analyses);

  assert.equal(formation.mainEstablished, true);
  assert.equal(formation.evidence[evidenceKey], true);
  assert.ok(formation.main.length >= 3);
  assert.ok(
    formation.main.every(ticket => ticket.startsWith(`${expectedHead}-`))
  );
}

assertScenarioHead([
  boat(1, 68, 60, 55, 74, 58),
  boat(2, 80, 74, 68, 82, 72),
  boat(3, 68, 70, 66, 60, 66),
  boat(4, 66, 69, 67, 64, 68),
  boat(5, 63, 65, 62, 56, 70),
  boat(6, 61, 64, 61, 54, 71)
], 2, "twoSashi");

assertScenarioHead([
  boat(1, 68, 60, 56, 74, 58),
  boat(2, 69, 63, 61, 72, 62),
  boat(3, 82, 82, 80, 63, 74),
  boat(4, 68, 71, 69, 67, 70),
  boat(5, 66, 69, 66, 58, 73),
  boat(6, 62, 66, 63, 55, 72)
], 3, "threeAttack");

assertScenarioHead([
  boat(1, 68, 60, 56, 74, 58),
  boat(2, 69, 63, 61, 72, 62),
  boat(3, 69, 72, 68, 63, 70),
  boat(4, 82, 82, 80, 70, 76),
  boat(5, 68, 73, 70, 60, 76),
  boat(6, 63, 67, 64, 56, 73)
], 4, "fourAttack");

function entry(
  boatNo,
  overrides = {}
) {
  const avgSt =
    overrides.avgSt ?? 0.18;

  return {
    boat: boatNo,
    racerName: `${boatNo}号艇`,
    className: overrides.className || "A2",
    avgSt,
    nationalWinRate:
      overrides.nationalWinRate ?? 5,
    localWinRate:
      overrides.localWinRate ?? 5,
    motor2Rate:
      overrides.motor2Rate ?? 33,
    exhibition: {
      displayTime:
        overrides.displayTime ?? 6.95
    },
    currentRace: {
      stList: [avgSt]
    }
  };
}

function raceData(type, odds = {}) {
  const isThreeAttack =
    type === "threeAttack";
  const entries = Array.from(
    { length: 6 },
    (_, index) =>
      entry(index + 1)
  );

  if (isThreeAttack) {
    entries[2] = entry(3, {
      avgSt: 0.10,
      nationalWinRate: 7.5,
      localWinRate: 7,
      motor2Rate: 48,
      displayTime: 6.68,
      className: "A1"
    });
  } else {
    entries[0] = entry(1, {
      avgSt: 0.12,
      nationalWinRate: 7.5,
      localWinRate: 7,
      motor2Rate: 45,
      displayTime: 6.72,
      className: "A1"
    });
  }

  return {
    stadiumCode: "23",
    raceNo:
      isThreeAttack ? 8 : 10,
    date: "20260803",
    entries,
    startExhibition:
      (
        isThreeAttack
          ? [0.13, 0.15, 0.03, 0.14, 0.18, 0.24]
          : [0.05, 0.12, 0.15, 0.10, 0.18, 0.24]
      ).map((st, index) => ({
        boat: index + 1,
        course: index + 1,
        st,
        isOfficialCourse: true
      })),
    weather: {
      windSpeed: 2,
      waveHeight: 2,
      windDirection: "向かい風"
    },
    odds: { byTicket: odds }
  };
}

function legacyPrediction(
  oldHead,
  staleTicket = ""
) {
  const evaluations = Array.from(
    { length: 6 },
    (_, index) => ({
      boatNo: index + 1,
      course: index + 1,
      score: 79 - index,
      total: 79 - index,
      attack:
        index + 1 === oldHead
          ? 90
          : 60,
      tenkai:
        index + 1 === oldHead
          ? 88
          : 65,
      michu: 65,
      expected: 65,
      hold: 70,
      pickup: 70,
      comment: `${index + 1}号艇評価`
    })
  );
  const mark = (boatNo) =>
    evaluations[boatNo - 1];
  const main =
    oldHead === 4
      ? ["4-2-3", "4-2-1", "4-3-2"]
      : ["1-2-3", "1-2-4", "1-3-2"];
  const cover =
    oldHead === 4
      ? ["2-1-3", "2-1-4"]
      : ["2-1-3", "2-1-4"];

  return {
    raceFlow: {
      title:
        `${oldHead}号艇攻め警戒`,
      summary: "旧印の警戒展開",
      attackBoats: [{
        boatNo: oldHead,
        course: oldHead,
        score: 90,
        reason: "旧印の攻め評価"
      }],
      phases: {
        firstMark: {
          mainAttack: {
            boatNo: oldHead,
            score: 90,
            reason: "旧印の攻め評価"
          }
        }
      }
    },
    boatEvaluation: {
      honmei: mark(oldHead),
      taikou: mark(2),
      ana: mark(3),
      osae: mark(1),
      evaluations
    },
    mainSheet: {
      honmei: mark(oldHead),
      taikou: mark(2),
      ana: mark(3),
      osae: mark(1),
      evaluations,
      tickets: main,
      coverTickets: cover,
      flowTickets: []
    },
    formation: {
      main,
      cover,
      nagashi: [],
      hole: []
    },
    aiTicketList:
      staleTicket
        ? [{
            ticket: staleTicket,
            odds: 9.9
          }]
        : []
  };
}

const escapeData =
  raceData("escape");
const escapeFormal =
  aiCore.buildPredictionData(
    escapeData
  );
assert.ok(
  escapeFormal.lightManshuScenario,
  "正式主展開では既存の先頭穴候補へ軽い万舟筋を付ける"
);
assert.equal(
  escapeFormal.lightManshuScenario.ticket,
  escapeFormal.formations.longshot[0]
);
assert.equal(
  escapeFormal.lightManshuScenario.changesTicket,
  false
);
assert.equal(
  escapeFormal.lightManshuScenario.usesOdds,
  false
);
assert.equal(
  Object.hasOwn(
    escapeFormal.formations,
    "lightManshuScenario"
  ),
  false,
  "A/B入力であるformations内へ表示説明を混ぜない"
);
const escapeFormationBeforeStoryReplay =
  cloneJson(escapeFormal.formations);
aiCore.buildLightManshuScenario({
  formations: escapeFormal.formations,
  raceScenarios: escapeFormal.raceScenarios,
  entries: escapeData.entries,
  analyses: escapeFormal.analyses,
  roadTheory: escapeFormal.roadTheory,
  racerSkillTheory:
    escapeFormal.racerSkillTheory
});
assert.deepEqual(
  escapeFormal.formations,
  escapeFormationBeforeStoryReplay,
  "説明生成は既存買い目・順番・候補プールを変更しない"
);
const escapeTicket =
  escapeFormal.formations.main[0];
escapeData.odds.byTicket[
  escapeTicket
] = 7;
escapeData.odds.byTicket[
  "4-2-3"
] = 226.6;
const escapeMerged =
  aiCore.mergeWithPrediction(
    legacyPrediction(4),
    escapeData
  );
const escapeLightManshu =
  escapeMerged.lightManshuScenario;
const escapeLightManshuRow =
  escapeMerged.ticketSheets.hole.find(
    row =>
      row.ticket === escapeLightManshu.ticket
  );

assert.ok(escapeLightManshu);
assert.equal(
  escapeMerged.aiCore.lightManshuScenario.ticket,
  escapeLightManshu.ticket,
  "最終AIコアへ同じ説明対象を保持する"
);
assert.equal(
  escapeMerged.manshuSheet.lightManshuScenario.ticket,
  escapeLightManshu.ticket,
  "万舟シートへ同じ説明対象を保持する"
);
assert.ok(escapeLightManshuRow);
assert.equal(
  escapeLightManshuRow,
  escapeMerged.manshuSheet.tickets.find(
    row => row.ticket === escapeLightManshu.ticket
  )
);
assert.equal(
  escapeLightManshuRow.scenarioType,
  "取れたらいいな"
);
assert.equal(
  escapeLightManshuRow.scenarioSummary,
  escapeLightManshu.scenarioSummary
);
assert.deepEqual(
  escapeLightManshuRow.roleChain,
  escapeLightManshu.roleChain
);
assert.equal(
  escapeLightManshuRow.presentationByGroup
    .hole.scenarioSummary,
  escapeLightManshu.scenarioSummary,
  "実戦選択のpresentation経由でも説明が元へ戻らない"
);
assert.ok(
  escapeMerged.formation.possibilityCandidates.every(
    row =>
      !Object.hasOwn(row, "lightManshuScenario") &&
      !Object.hasOwn(row, "roleChain") &&
      !Object.hasOwn(row, "selectionScope")
  ),
  "展開候補プールへ空の説明フィールドを追加しない"
);
const legacyFirstHolePrediction =
  legacyPrediction(4);
legacyFirstHolePrediction.manshuSheet = {
  tickets: [{
    ticket: "6-4-2",
    category: "穴候補",
    scenarioSummary: "旧形式の穴候補"
  }]
};
const legacyFirstHoleMerged =
  aiCore.mergeWithPrediction(
    legacyFirstHolePrediction,
    escapeData
  );

assert.equal(
  legacyFirstHoleMerged.ticketSheets.hole[0].ticket,
  "6-4-2"
);
assert.equal(
  legacyFirstHoleMerged.lightManshuScenario.ticket,
  "6-4-2",
  "最終的に表示される先頭穴候補へ説明を再整合する"
);
assert.equal(
  legacyFirstHoleMerged.ticketSheets.hole[0]
    .scenarioType,
  "取れたらいいな"
);
const escapeMergedTwice =
  aiCore.mergeWithPrediction(
    escapeMerged,
    escapeData
  );

assert.ok(
  escapeMergedTwice.formation.possibilityCandidates.every(
    row =>
      !Object.hasOwn(row, "lightManshuScenario") &&
      !Object.hasOwn(row, "roleChain") &&
      !Object.hasOwn(row, "selectionScope") &&
      !Object.hasOwn(row, "storyType")
  ),
  "再統合しても展開候補プールへ説明フィールドを漏らさない"
);
const possibilitySelectionDigest = rows =>
  rows.map(row => ({
    ticket: row.ticket,
    category: row.category,
    priorityScore: row.priorityScore,
    evidenceQualified: row.evidenceQualified,
    expansionEligible: row.expansionEligible,
    branchIds: [...(row.branchIds || [])]
  }));
assert.deepEqual(
  possibilitySelectionDigest(
    escapeMergedTwice.formation.possibilityCandidates
  ),
  possibilitySelectionDigest(
    escapeMerged.formation.possibilityCandidates
  ),
  "再統合しても候補の順番・選定属性・枝IDを変更しない"
);
assert.deepEqual(
  [
    ...escapeMergedTwice.formation.main,
    ...escapeMergedTwice.formation.cover,
    ...escapeMergedTwice.formation.flow,
    ...escapeMergedTwice.formation.longshot
  ],
  [
    ...escapeMerged.formation.main,
    ...escapeMerged.formation.cover,
    ...escapeMerged.formation.flow,
    ...escapeMerged.formation.longshot
  ],
  "再統合しても買い目・分類内順序を変更しない"
);
assert.equal(
  escapeMergedTwice.lightManshuScenario.ticket,
  escapeMerged.lightManshuScenario.ticket
);

assert.equal(
  escapeFormal.raceScenarios
    .mainScenario.attacker,
  1,
  "唐津10R型では正式主展開を1逃げと判定する"
);
assert.equal(
  escapeMerged.mainSheet.honmei.boatNo,
  1,
  "旧4号艇警戒より正式1逃げを最終本命にする"
);
assert.equal(
  escapeMerged.aiCore.raceScenarios
    .mainScenario.headBoatNo,
  1,
  "表示用主展開の頭も正式1逃げと一致させる"
);
assert.ok(
  escapeMerged.formation.main.every(
    ticket => ticket.startsWith("1-")
  ),
  "本線全点の1着を正式主展開頭へそろえる"
);
assert.equal(
  escapeMerged.formation.mainEstablished,
  true,
  "正式本線3点・押さえ2点がある時だけ成立する"
);
assert.ok(
  escapeMerged.formation.hole.includes(
    "4-2-3"
  ),
  "正式主展開でない旧本命候補は穴側に保持する"
);
assert.equal(
  escapeMerged.formation.cover.includes(
    "4-2-3"
  ),
  false,
  "旧本命候補を押さえへ混ぜて役割を逆転させない"
);
assertCompleteFlowFormation(
  escapeMerged.formation,
  1
);
assert.deepEqual(
  escapeMerged.mainSheet.flowFormations,
  escapeMerged.formation.flowFormations,
  "最終本命シートにも同じ流しformationを保持する"
);
assert.deepEqual(
  escapeMerged.aiCore.formations.flowFormations,
  escapeMerged.formation.flowFormations,
  "AIコアのcanonical formationにも同じ流しを保持する"
);
const escapePractical =
  practicalSelection.select(
    escapeMerged
  );
const escapeGroundedFlow =
  escapePractical.tickets.filter(
    row => row.category === "流し"
  );
assert.equal(
  escapeGroundedFlow.length,
  2,
  "AIコアの正式枝から根拠付きフォーメーション2券を選べる"
);
assert.equal(
  new Set(
    escapeGroundedFlow.map(
      row => row.flowAnchor
    )
  ).size,
  1,
  "AIコア接続後もフォーメーション2券は同一1着・2着軸を共有する"
);
assert.ok(
  escapeGroundedFlow.every(
    row =>
      row.flowThirdScore >= 65 &&
      row.scenarioSummary.includes(
        "3着"
      )
  ),
  "AIコア接続後の各exact券へ正式な3着根拠を残す"
);
assert.ok(
  !escapePractical.tickets.some(
    row => row.category === "万舟・穴"
  ),
  "根拠付きフォーメーション2券成立時は通常穴を併用しない"
);

const attackData =
  raceData("threeAttack");
const attackFormal =
  aiCore.buildPredictionData(
    attackData
  );
const attackTicket =
  attackFormal.formations.main[0];
for (let first = 1; first <= 6; first += 1) {
  for (let second = 1; second <= 6; second += 1) {
    for (let third = 1; third <= 6; third += 1) {
      if (new Set([first, second, third]).size !== 3) continue;
      attackData.odds.byTicket[`${first}-${second}-${third}`] = 3.1;
    }
  }
}
attackData.odds.byTicket[
  attackTicket
] = 420;
const attackMerged =
  aiCore.mergeWithPrediction(
    legacyPrediction(
      1,
      attackTicket
    ),
    attackData
  );

assert.equal(
  attackMerged.mainSheet.honmei.boatNo,
  3,
  "高オッズでも正式rank1の3攻めを本線に維持する"
);
assert.ok(
  attackMerged.formation.main.every(
    ticket => ticket.startsWith("3-")
  ),
  "オッズで正式3攻めの券・分類を動かさない"
);
assert.equal(
  attackMerged.mainSheet.tickets.find(
    row => row.ticket === attackTicket
  ).odds,
  420,
  "stale行オッズより現在の公式オッズを優先する"
);
const mergedAttackCoverTicket =
  attackMerged.formation.cover[0];
assert.ok(
  mergedAttackCoverTicket,
  "正式押さえを1券以上生成する"
);
assert.equal(
  attackMerged.mainSheet.coverTickets.find(
    row => row.ticket === mergedAttackCoverTicket
  ).odds,
  3.1,
  "押さえが低オッズでも公式値をそのまま表示する"
);
assert.ok(
  attackMerged.formation.main.includes(
    attackTicket
  ) &&
    attackMerged.formation.cover.includes(
      mergedAttackCoverTicket
    ),
  "本線420倍・押さえ3.1倍でも展開分類をオッズで逆転させない"
);

const missingOfficialTicket =
  attackFormal.formations.main[1];
const missingOfficialMerged =
  aiCore.mergeWithPrediction(
    legacyPrediction(
      1,
      missingOfficialTicket
    ),
    raceData(
      "threeAttack",
      { [attackTicket]: 420 }
    )
  );
assert.equal(
  missingOfficialMerged.mainSheet.tickets.find(
    row => row.ticket === missingOfficialTicket
  ).odds,
  null,
  "最新の公式表にない買い目へ古いオッズを残さない"
);

const changedOddsMerged =
  aiCore.mergeWithPrediction(
    legacyPrediction(1),
    raceData(
      "threeAttack",
      { [attackTicket]: 3.1 }
    )
  );
assert.deepEqual(
  changedOddsMerged.formation.main,
  attackMerged.formation.main,
  "オッズが変わっても本線の券・順番は変えない"
);
assert.deepEqual(
  changedOddsMerged.formation.flowFormations,
  attackMerged.formation.flowFormations,
  "オッズが変わっても流しformationを変えない"
);
assert.deepEqual(
  changedOddsMerged.formation.longshot,
  attackMerged.formation.longshot,
  "オッズが変わっても穴候補の券・順番を変えない"
);
assert.deepEqual(
  changedOddsMerged.lightManshuScenario,
  attackMerged.lightManshuScenario,
  "オッズが変わっても「取れたらいいな」の筋を変えない"
);

/*
  公式展示進入で6号艇が3コースへ入り、3号艇が6コースへ
  回ったケース。強い3コース艇の能力はそのまま物理艇6へ移し、
  シナリオ・印・本線の頭が一貫して6号艇になることを確認する。
*/
const swappedAttackData = raceData("threeAttack");
const strongCourseThree = {
  ...swappedAttackData.entries[2],
  boat: 6,
  racerName: "6号艇",
  // 古いfieldが枠なりを示しても、公式startExhibitionを正本にする。
  exhibitionCourse: 6
};
const weakCourseSix = {
  ...swappedAttackData.entries[5],
  boat: 3,
  racerName: "3号艇",
  exhibitionCourse: 3
};
swappedAttackData.entries[2] = weakCourseSix;
swappedAttackData.entries[5] = strongCourseThree;
swappedAttackData.startExhibition =
  swappedAttackData.startExhibition.map((row) => {
    const boatNo = Number(row.boat);
    if (boatNo === 3) {
      return { ...row, course: 6, st: 0.24 };
    }
    if (boatNo === 6) {
      return { ...row, course: 3, st: 0.03 };
    }
    return row;
  });

const swappedAttackFormal =
  aiCore.buildPredictionData(swappedAttackData);
assert.equal(
  swappedAttackFormal.raceScenarios.mainScenario.type,
  "threeAttack"
);
assert.equal(swappedAttackFormal.raceScenarios.attackerCourse, 3);
assert.equal(swappedAttackFormal.raceScenarios.attacker, 6);
assert.equal(
  swappedAttackFormal.raceScenarios.mainScenario.attacker,
  3,
  "analysisのlegacy attackerはコース番号を維持する"
);
assert.equal(
  swappedAttackFormal.raceScenarios.mainScenario.attackerBoatNo,
  6
);
assert.equal(
  swappedAttackFormal.raceScenarios.mainScenario.headBoatNo,
  6
);
assert.equal(swappedAttackFormal.formations.mainEstablished, true);
assert.ok(
  swappedAttackFormal.formations.main.length >= 3 &&
  swappedAttackFormal.formations.main.every(
    ticket => ticket.startsWith("6-")
  ),
  "旧mark gateを含めて3コースの6号艇を本線頭へ接続する"
);
assert.ok(
  !swappedAttackFormal.raceScenarios.blockedBoats.includes(6),
  "物理艇のblockedBoatsを再度コース変換して攻め艇を除外しない"
);

const swappedAttackMerged =
  aiCore.mergeWithPrediction(
    legacyPrediction(1),
    swappedAttackData
  );
assert.equal(swappedAttackMerged.mainSheet.honmei.boatNo, 6);
assert.equal(
  swappedAttackMerged.aiCore.analysisRaceScenarios
    .mainScenario.attackerCourse,
  3
);
assert.equal(
  swappedAttackMerged.aiCore.analysisRaceScenarios
    .mainScenario.attackerBoatNo,
  6
);
assert.equal(
  swappedAttackMerged.aiCore.raceScenarios
    .mainScenario.headBoatNo,
  6
);
assert.ok(
  swappedAttackMerged.formation.main.every(
    ticket => ticket.startsWith("6-")
  ),
  "最終統合でlegacy course aliasを艇番として読み戻さない"
);

/*
  公式展示進入の物理艇IDだけを入れ替えても、コース上の能力配置が
  同じなら予想から実戦選択まで同型でなければならない。6艇から2艇を
  選ぶ全15通りを通し、艇番をコース規則として誤用する回帰を止める。
*/
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function transposeBoatNo(value, left, right) {
  const boatNo = Number(value || 0);
  if (boatNo === left) return right;
  if (boatNo === right) return left;
  return boatNo;
}

function transposeTicket(ticket, left, right) {
  return String(ticket || "")
    .split("-")
    .map(Number)
    .map(boatNo =>
      transposeBoatNo(boatNo, left, right)
    )
    .join("-");
}

function permutedLiveRace(base, left, right) {
  const race = cloneJson(base);
  race.source = "boatrace-official";
  race.fetchedAt = "2026-08-13T00:00:00.000Z";
  race.entries = race.entries
    .map(entry => {
      const physicalBoatNo = transposeBoatNo(
        entry.boat,
        left,
        right
      );

      return {
        ...entry,
        boat: physicalBoatNo,
        racerName: `${physicalBoatNo}号艇`
      };
    })
    .sort((a, b) => Number(a.boat) - Number(b.boat));
  race.startExhibition = race.startExhibition
    .map(row => ({
      ...row,
      boat: transposeBoatNo(
        row.boat,
        left,
        right
      ),
      isOfficialCourse: true,
      mappingSource: "official-start-image"
    }))
    .sort((a, b) => Number(a.boat) - Number(b.boat));

  return race;
}

function runProductionPrediction(race) {
  const prepared = theoryInput.prepare(
    cloneJson(race),
    aiCore
  );
  const prediction = global.createPrediction(prepared);

  return {
    prediction,
    selection:
      practicalSelection.select(prediction)
  };
}

function normalizedTicketList(
  values,
  left,
  right,
  sort = false
) {
  const tickets = (Array.isArray(values) ? values : [])
    .map(value =>
      transposeTicket(
        typeof value === "string"
          ? value
          : value?.ticket,
        left,
        right
      )
    )
    .filter(Boolean);

  return sort ? tickets.sort() : tickets;
}

function normalizedRunDigest(run, left = 0, right = 0) {
  const prediction = run.prediction;
  const core = prediction.aiCore || {};
  const scenarios =
    core.analysisRaceScenarios ||
    core.raceScenarios ||
    {};
  const normalizeBoat = value =>
    transposeBoatNo(value, left, right);
  const formationGroups = [
    "main",
    "cover",
    "safety",
    "flow",
    "nagashi",
    "hole",
    "longshot"
  ];

  return {
    analyses: (core.analyses || [])
      .map(analysis => ({
        boatNo: normalizeBoat(analysis.boatNo),
        course:
          Number(
            analysis?.courseStructureTheory?.course ??
            analysis?.attackTheory?.course ??
            0
          ) || null,
        indexes: analysis.indexes,
        roleScores: analysis.roleScores
      }))
      .sort((a, b) => a.boatNo - b.boatNo),
    legacyEvaluations:
      (prediction.boatEvaluation?.evaluations || [])
        .map(evaluation => ({
          boatNo: normalizeBoat(evaluation.boatNo),
          course: Number(evaluation.course || 0) || null,
          score: evaluation.score,
          total: evaluation.total,
          attack: evaluation.attack,
          tenkai: evaluation.tenkai,
          michu: evaluation.michu,
          local: evaluation.local,
          expected: evaluation.expected,
          role: evaluation.role
        }))
        .sort((a, b) => a.boatNo - b.boatNo),
    manshuEvaluations:
      (prediction.manshuSheet?.evaluations || [])
        .map(evaluation => ({
          boatNo: normalizeBoat(evaluation.boatNo),
          course: Number(evaluation.course || 0) || null,
          manshuScore: Number(evaluation.manshuScore || 0),
          holdScore: Number(evaluation.holdScore || 0),
          pickupScore: Number(evaluation.pickupScore || 0)
        }))
        .sort((a, b) => a.boatNo - b.boatNo),
    scenarios: (scenarios.scenarios || []).map(
      scenario => ({
        type: scenario.type,
        score: scenario.score,
        attackerCourse:
          Number(
            scenario.attackerCourse ??
            scenario.attacker ??
            0
          ) || null,
        attackerBoatNo: normalizeBoat(
          scenario.attackerBoatNo ??
          scenario.headBoatNo ??
          scenario.attacker
        ),
        outcome: (scenario.outcome?.boats || [])
          .map(row => ({
            boatNo: normalizeBoat(row.boatNo),
            firstScore: row.firstScore,
            secondScore: row.secondScore,
            thirdScore: row.thirdScore
          }))
          .sort((a, b) => a.boatNo - b.boatNo)
      })
    ),
    marks: Object.fromEntries(
      ["honmei", "taikou", "ana", "osae"]
        .map(key => [
          key,
          normalizeBoat(
            prediction.boatEvaluation?.[key]?.boatNo
          )
        ])
    ),
    formations: Object.fromEntries(
      formationGroups.map(key => [
        key,
        normalizedTicketList(
          prediction.formation?.[key],
          left,
          right,
          true
        )
      ])
    ),
    mainEstablished:
      prediction.formation?.mainEstablished === true,
    selection: {
      status: run.selection.status,
      tickets: (run.selection.tickets || []).map(row => ({
        ticket: transposeTicket(
          row.ticket,
          left,
          right
        ),
        category: row.category,
        displayCategory: row.displayCategory,
        selectionTier: row.selectionTier || "",
        priorityScore: Number(row.priorityScore || 0),
        amount: Number(row.amount || 0),
        source: row.source || ""
      })),
      ticketCount: (run.selection.tickets || []).length,
      totalAmount: (run.selection.tickets || [])
        .reduce(
          (sum, row) => sum + Number(row.amount || 0),
          0
        )
    },
    buyTickets: normalizedTicketList(
      prediction.buyTickets,
      left,
      right,
      true
    )
  };
}

function replayRaceFromSnapshot(snapshot, template) {
  const boats = snapshot.boats || [];
  const formalCourseMapping =
    boats.length === 6 &&
    boats.every(boat =>
      boat.courseOfficial === true &&
      Number(boat.boatNo) >= 1 &&
      Number(boat.boatNo) <= 6 &&
      Number(boat.course) >= 1 &&
      Number(boat.course) <= 6
    ) &&
    new Set(boats.map(boat => Number(boat.boatNo))).size === 6 &&
    new Set(boats.map(boat => Number(boat.course))).size === 6;
  const entries = boats.map(boat => ({
    boat: boat.boatNo,
    registerNo: boat.registerNo,
    racerName: boat.racerName,
    className: boat.className,
    avgSt: boat.avgST,
    nationalWinRate: boat.nationalWinRate,
    national2Rate: boat.national2Rate,
    national3Rate: boat.national3Rate,
    localWinRate: boat.localWinRate,
    localStarts: boat.localStarts,
    motor2Rate: boat.motor2Rate,
    motor3Rate: boat.motor3Rate,
    boat2Rate: boat.boat2Rate,
    exhibitionSt: boat.exhibitionST,
    exhibitionTime: boat.exhibitionTime,
    lapTime: boat.lapTime,
    currentRace: {
      stList:
        boat.currentST === null ||
        boat.currentST === undefined
          ? []
          : [boat.currentST]
    }
  }));

  return {
    source: snapshot.source,
    fetchedAt: snapshot.sourceFetchedAt,
    stadiumCode: template.stadiumCode,
    stadiumName: template.stadiumName,
    raceNo: template.raceNo,
    date: template.date,
    entries,
    startExhibition:
      formalCourseMapping
        ? boats.map(boat => ({
            boat: boat.boatNo,
            course: boat.course,
            st: boat.exhibitionST,
            isOfficialCourse: true,
            mappingSource:
              boat.courseMappingSource ||
              "official-start-image"
          }))
        : [],
    weather: snapshot.weather,
    odds: { byTicket: {} }
  };
}

const identitySourceRace = raceData("threeAttack");
const uniqueLocalRateByCourse = {
  1: 5.6,
  2: 5.4,
  3: 7,
  4: 5.2,
  5: 5,
  6: 4.8
};
identitySourceRace.entries =
  identitySourceRace.entries.map(entry => ({
    ...entry,
    // 同率時の既存艇番tie-breakではなく、進入写像だけを比較する。
    localWinRate:
      uniqueLocalRateByCourse[Number(entry.boat)]
  }));
const identityLiveRace = permutedLiveRace(
  identitySourceRace,
  0,
  0
);
const identityRun = runProductionPrediction(identityLiveRace);
const identityDigest = normalizedRunDigest(identityRun);
const twoBoatTranspositions = [];
const permutationMismatches = [];

for (let left = 1; left <= 6; left += 1) {
  for (let right = left + 1; right <= 6; right += 1) {
    twoBoatTranspositions.push([left, right]);
  }
}

assert.equal(
  twoBoatTranspositions.length,
  15,
  "6艇から2艇を選ぶ全15通りを検証する"
);

twoBoatTranspositions.forEach(([left, right]) => {
  const label = `${left}↔${right}`;
  const liveRace = permutedLiveRace(
    identityLiveRace,
    left,
    right
  );
  const liveRun = runProductionPrediction(liveRace);
  const normalizedLiveDigest =
    normalizedRunDigest(liveRun, left, right);

  if (!isDeepStrictEqual(normalizedLiveDigest, identityDigest)) {
    permutationMismatches.push({
      label,
      actual: normalizedLiveDigest
    });
  }

  const snapshot = predictionConditions.capture(
    liveRace,
    liveRun.prediction
  );
  assert.equal(snapshot.sourceTiming, "pre_deadline");
  assert.equal(snapshot.officialResultUsed, false);
  assert.equal(snapshot.dataAvailability.officialCourses, 6);
  assert.equal(
    Object.hasOwn(snapshot, "officialResult"),
    false,
    `${label}: 保存条件へ結果を混ぜない`
  );
  assert.deepEqual(
    snapshot.boats.map(boat => [
      boat.boatNo,
      boat.course,
      boat.courseOfficial,
      boat.courseMappingSource
    ]),
    liveRace.startExhibition.map(row => [
      row.boat,
      row.course,
      true,
      "official-start-image"
    ]),
    `${label}: liveの正式boat→course写像を保存する`
  );

  const snapshotEntries = aiCore.getRaceEntries(snapshot);
  const snapshotCourseMapping =
    aiCore.buildOfficialCourseMapping(snapshotEntries);
  const liveBoatAtCourse = course =>
    Number(
      liveRace.startExhibition.find(
        row => Number(row.course) === course
      )?.boat || 0
    );
  const liveCourseOfBoat = boatNo =>
    Number(
      liveRace.startExhibition.find(
        row => Number(row.boat) === boatNo
      )?.course || 0
    );

  assert.equal(
    snapshotCourseMapping.formal,
    true,
    `${label}: schema4 snapshotを正式6艇写像として直接復元する`
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(course =>
      snapshotCourseMapping.boatAtCourse(course)
    ),
    [1, 2, 3, 4, 5, 6].map(liveBoatAtCourse),
    `${label}: snapshotのcourse→boatをliveと一致させる`
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(boatNo =>
      snapshotCourseMapping.courseOfBoat(boatNo)
    ),
    [1, 2, 3, 4, 5, 6].map(liveCourseOfBoat),
    `${label}: snapshotのboat→courseをliveと一致させる`
  );

  const replayRun = runProductionPrediction(
    replayRaceFromSnapshot(snapshot, liveRace)
  );
  assert.deepEqual(
    normalizedRunDigest(replayRun),
    normalizedRunDigest(liveRun),
    `${label}: live→preRaceConditions.capture→core replayで予想・買い目・金額を変えない`
  );
});

function legacyEvaluationAtCourse(run, course) {
  return run.prediction.boatEvaluation.evaluations.find(
    row => Number(row.course) === Number(course)
  );
}

function legacyExpectedByBoat(run) {
  return run.prediction.boatEvaluation.evaluations
    .map(row => [
      Number(row.boatNo),
      Number(row.course),
      Number(row.expected)
    ])
    .sort((a, b) => a[0] - b[0]);
}

assert.deepEqual(
  legacyExpectedByBoat(identityRun),
  [
    [1, 1, 48],
    [2, 2, 56],
    [3, 3, 80],
    [4, 4, 66],
    [5, 5, 69],
    [6, 6, 73]
  ],
  "枠なり時のlegacy期待値指数を変えない"
);

const officialOneFourSwapRace = permutedLiveRace(
  identityLiveRace,
  1,
  4
);
const officialOneFourSwapRun = runProductionPrediction(
  officialOneFourSwapRace
);

[1, 4].forEach(course => {
  assert.equal(
    legacyEvaluationAtCourse(
      officialOneFourSwapRun,
      course
    )?.expected,
    legacyEvaluationAtCourse(
      identityRun,
      course
    )?.expected,
    `完全な公式1↔4入替では${course}コース能力のexpectedOuterを物理艇番で変えない`
  );
});

const incompleteOneFourSwapRace = cloneJson(
  officialOneFourSwapRace
);
incompleteOneFourSwapRace.startExhibition =
  incompleteOneFourSwapRace.startExhibition.slice(0, 5);
const incompleteOneFourSwapRun = runProductionPrediction(
  incompleteOneFourSwapRace
);

assert.deepEqual(
  legacyExpectedByBoat(incompleteOneFourSwapRun),
  [
    [1, 1, 44],
    [2, 2, 56],
    [3, 3, 80],
    [4, 4, 70],
    [5, 5, 69],
    [6, 6, 73]
  ],
  "不完全な進入写像ではcourse基礎点とexpectedOuterを艇番基準へ戻す"
);

const incompleteIdentityCourseRace = cloneJson(
  incompleteOneFourSwapRace
);
incompleteIdentityCourseRace.startExhibition =
  incompleteIdentityCourseRace.startExhibition.map(row => ({
    ...row,
    course: Number(row.boat)
  }));

assert.deepEqual(
  normalizedRunDigest(incompleteOneFourSwapRun),
  normalizedRunDigest(
    runProductionPrediction(incompleteIdentityCourseRace)
  ),
  "5艇だけのcourse値は旧評価・印・編成・実戦買い目へ混ぜない"
);

const nonOfficialOneFourSwapRace = cloneJson(
  officialOneFourSwapRace
);
nonOfficialOneFourSwapRace.startExhibition =
  nonOfficialOneFourSwapRace.startExhibition.map(row => ({
    ...row,
    isOfficialCourse: false,
    mappingSource: ""
  }));

assert.deepEqual(
  legacyExpectedByBoat(
    runProductionPrediction(
      nonOfficialOneFourSwapRace
    )
  ),
  legacyExpectedByBoat(incompleteOneFourSwapRun),
  "非公式の6艇写像でもexpectedOuterを実コース基準へ切り替えない"
);

const nonOfficialIdentityCourseRace = cloneJson(
  nonOfficialOneFourSwapRace
);
nonOfficialIdentityCourseRace.startExhibition =
  nonOfficialIdentityCourseRace.startExhibition.map(row => ({
    ...row,
    course: Number(row.boat)
  }));

assert.deepEqual(
  normalizedRunDigest(
    runProductionPrediction(nonOfficialOneFourSwapRace)
  ),
  normalizedRunDigest(
    runProductionPrediction(nonOfficialIdentityCourseRace)
  ),
  "非公式6艇のcourse値は旧評価・印・編成・実戦買い目へ混ぜない"
);

const duplicateOfficialCourseRace = cloneJson(
  officialOneFourSwapRace
);
duplicateOfficialCourseRace.startExhibition[0].course =
  duplicateOfficialCourseRace.startExhibition[1].course;

assert.deepEqual(
  normalizedRunDigest(
    runProductionPrediction(duplicateOfficialCourseRace)
  ),
  normalizedRunDigest(
    runProductionPrediction(nonOfficialIdentityCourseRace)
  ),
  "重複courseを含む公式6艇写像も全艇まとめて艇番基準へ戻す"
);

/*
  保存済み・不完全な入力に course らしき値が残っていても、正式な
  6艇写像でなければ実戦選択の頭コース判定へ使わない。物理1・4号艇の
  course 表示だけを入れ替え、選抜・除外理由を含む結果が不変と確認する。
*/
const failClosedPracticalBaseline = cloneJson(
  identityRun.prediction
);
failClosedPracticalBaseline.aiCore.courseMapping = {
  formal: false,
  byBoat: {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6
  }
};
const failClosedPracticalMisleading = cloneJson(
  failClosedPracticalBaseline
);
failClosedPracticalMisleading.aiCore.courseMapping.byBoat = {
  1: 4,
  2: 2,
  3: 3,
  4: 1,
  5: 5,
  6: 6
};
failClosedPracticalMisleading.boatEvaluation.evaluations =
  failClosedPracticalMisleading.boatEvaluation.evaluations.map(
    row => ({
      ...row,
      course:
        Number(row.boatNo) === 1
          ? 4
          : Number(row.boatNo) === 4
            ? 1
            : Number(row.boatNo)
    })
  );

function practicalGateDigest(selection) {
  return {
    status: selection.status,
    reason: selection.reason,
    tickets: (selection.tickets || []).map(row => ({
      ticket: row.ticket,
      category: row.category,
      selectionTier: row.selectionTier || "",
      priorityScore: Number(row.priorityScore || 0),
      amount: Number(row.amount || 0)
    })),
    candidateDecisions: (selection.candidateDecisions || [])
      .map(row => ({
        ticket: row.ticket,
        selected: row.selected === true,
        reasonCode: row.reasonCode,
        reason: row.reason
      }))
      .sort((a, b) => a.ticket.localeCompare(b.ticket)),
    strongEscapeTrim:
      selection.strongEscapeTrim || null,
    priorityGateReplacement:
      selection.priorityGateReplacement || null,
    expansionSummary:
      selection.expansionSummary || null
  };
}

assert.deepEqual(
  practicalGateDigest(
    practicalSelection.select(
      failClosedPracticalMisleading
    )
  ),
  practicalGateDigest(
    practicalSelection.select(
      failClosedPracticalBaseline
    )
  ),
  "正式でない部分写像は実戦選択のtrim・候補補完・順位ゲートへ影響させない"
);

const resultNoiseRace = {
  ...cloneJson(identityLiveRace),
  officialResult: {
    finishOrder: [6, 5, 4],
    winningTicket: "6-5-4",
    payout: 999999
  },
  result: {
    settled: true,
    ticket: "6-5-4"
  },
  payout: 999999,
  settled: true
};
const resultNoiseRun = runProductionPrediction(resultNoiseRace);
assert.deepEqual(
  normalizedRunDigest(resultNoiseRun),
  identityDigest,
  "結果・払戻をlive入力へ混ぜても予想・買い目・金額は参照しない"
);
assert.equal(
  predictionConditions.capture(
    resultNoiseRace,
    resultNoiseRun.prediction
  ).officialResultUsed,
  false,
  "保存条件は結果利用なしを明示する"
);
if (permutationMismatches.length) {
  const firstMismatch = permutationMismatches[0];
  assert.deepEqual(
    firstMismatch.actual,
    identityDigest,
    `${permutationMismatches.map(row => row.label).join(", ")}: 公式進入の物理艇IDだけを入れ替えても予想・買い目・金額を変えない`
  );
}

console.log("AIコア買い目接続テスト: 合格");
console.log("- 本線不成立: 本線買い目0点");
console.log("- 本線成立: AIコアから本線・押さえを生成");
console.log("- フォーメーション候補: 正式主展開の全候補から根拠付き同一軸2券を厳選");
console.log("- 2差し・3攻め・4カド: 各展開艇を本線頭に固定");
console.log("- 公式進入の全15通りの2艇入替: AIコア→実戦選択→保存再生が同型");
