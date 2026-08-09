"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/evaluated-scenario-candidates");
require("../js/ai-core");
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
  "AIコアの正式枝から根拠付きexact流し2券を選べる"
);
assert.equal(
  new Set(
    escapeGroundedFlow.map(
      row => row.flowAnchor
    )
  ).size,
  1,
  "AIコア接続後も流し2券は同一1着・2着軸を共有する"
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
  "根拠付き流し2券成立時は通常穴を併用しない"
);

const attackData =
  raceData("threeAttack");
const attackFormal =
  aiCore.buildPredictionData(
    attackData
  );
const attackTicket =
  attackFormal.formations.main[0];
const attackCoverTicket =
  attackFormal.formations.safety[0];
attackData.odds.byTicket[
  attackTicket
] = 420;
attackData.odds.byTicket[
  attackCoverTicket
] = 3.1;
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
assert.equal(
  attackMerged.mainSheet.coverTickets.find(
    row => row.ticket === attackCoverTicket
  ).odds,
  3.1,
  "押さえが低オッズでも公式値をそのまま表示する"
);
assert.ok(
  attackMerged.formation.main.includes(
    attackTicket
  ) &&
    attackMerged.formation.cover.includes(
      attackCoverTicket
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

console.log("AIコア買い目接続テスト: 合格");
console.log("- 本線不成立: 本線買い目0点");
console.log("- 本線成立: AIコアから本線・押さえを生成");
console.log("- 流し候補: 正式主展開の全候補から根拠付き同一軸2券を厳選");
console.log("- 2差し・3攻め・4カド: 各展開艇を本線頭に固定");
