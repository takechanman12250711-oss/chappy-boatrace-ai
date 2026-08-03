"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");
const theoryInput = require("../js/theory-input");
require("../js/prediction");
const practicalSelector = require("../js/practical-selection");
const scenarioCandidates =
  require("../js/evaluated-scenario-candidates");
require("../js/note-generator");

const archive =
  require("../data/predictions/20260728.json");
const savedRace =
  archive.verificationPredictions.find(
    (item) =>
      item.raceKey === "20260728-03-1"
  );

assert.ok(
  savedRace,
  "2026年7月28日 江戸川1Rの保存値を読み込む"
);

function boatNo(mark) {
  return Number(
    mark?.boatNo ??
    mark?.number ??
    mark?.waku ??
    0
  );
}

function createRaceData(record) {
  const snapshot =
    record.prediction.preRaceConditions;
  const entries = snapshot.boats.map((boat) => ({
    boat: boat.boatNo,
    course: boat.course,
    courseOfficial:
      boat.courseOfficial === true,
    courseMappingSource:
      boat.courseMappingSource || "",
    registerNo: boat.registerNo,
    racerName: boat.racerName,
    className: boat.className,
    avgSt: boat.avgST,
    nationalWinRate:
      boat.nationalWinRate,
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
  const hasOfficialCourses =
    entries.every(
      (entry) =>
        entry.courseOfficial === true &&
        Number(entry.course) >= 1 &&
        Number(entry.course) <= 6
    );

  return {
    ok: true,
    source: "boatrace-official",
    stadiumCode:
      String(record.jcd).padStart(2, "0"),
    stadiumName: record.place,
    raceNo: Number(record.raceNo),
    date: String(record.date),
    weather: snapshot.weather,
    entries,
    ...(
      hasOfficialCourses
        ? {
            startExhibition:
              entries.map((entry) => ({
                boat: entry.boat,
                course: entry.course,
                st: entry.exhibitionSt,
                isOfficialCourse: true,
                mappingSource:
                  entry.courseMappingSource ||
                  "saved-official-course"
              }))
          }
        : {}
    )
  };
}

const preparedRaceData =
  theoryInput.prepare(
    createRaceData(savedRace),
    global.ChappyAICore
  );
const formalAnalysis =
  global.ChappyAICore
    .buildPredictionData(
      preparedRaceData
    );
const prediction =
  global.createPrediction(
    preparedRaceData
  );
const practical =
  practicalSelector.select(prediction);
const evidence =
  prediction.aiCore.formations.evidence;
const branchById =
  new Map(
    evidence.branches.map((branch) => [
      branch.id,
      branch
    ])
  );
const candidateByTicket =
  new Map(
    prediction.ticketSheets.possibility.map(
      (candidate) => [
        candidate.ticket,
        candidate
      ]
    )
  );
const fourthEvaluation =
  prediction.boatEvaluation.evaluations
    .find(
      (evaluation) =>
        boatNo(evaluation) === 4
    );
const expectedTickets = [
  "3-4-5",
  "3-4-1",
  "3-1-4",
  "3-4-2"
];

assert.deepEqual(
  [
    "honmei",
    "taikou",
    "ana",
    "osae"
  ].map(
    (key) =>
      boatNo(prediction.mainSheet[key])
  ),
  [
    "honmei",
    "taikou",
    "ana",
    "osae"
  ].map(
    (key) =>
      boatNo(formalAnalysis.marks[key])
  ),
  "4印すべてを正式主展開へそろえる"
);
assert.ok(
  prediction.preservedEvaluationTargets
    .some(
      (target) =>
        boatNo(target) === 4 &&
        target.source ===
          "displaced-legacy-mark"
    ),
  "旧印の4号艇評価は正式印へ混ぜず別展開候補として保持する"
);
assert.ok(
  fourthEvaluation.score >= 70 &&
    fourthEvaluation.attack >= 85 &&
    fourthEvaluation.tenkai >= 75,
  "4号艇の正しい総合・攻め・展開評価を弱めない"
);
assert.equal(
  prediction.aiCore.raceScenarios
    .mainScenario.attackerBoatNo,
  3,
  "3号艇攻めの主筋を維持する"
);
assert.ok(
  prediction.raceFlow.attackBoats.some(
    (row) => boatNo(row) === 3
  ),
  "保存済み展開の3号艇攻めを消さない"
);

expectedTickets.forEach((ticket) => {
  const candidate =
    candidateByTicket.get(ticket);

  assert.ok(
    candidate,
    `${ticket}を点数制限前の候補へ残す`
  );
  assert.equal(
    candidate.expansionEligible,
    true,
    `${ticket}へ独立した展開枝を接続する`
  );
  assert.ok(
    candidate.branchIds.some((branchId) => {
      const branch =
        branchById.get(branchId);

      return (
        branch?.qualified === true &&
        branch.ticket === ticket &&
        branch.roles.some(
          (role) =>
            role.boatNo === 4 &&
            (
              (
                ticket.split("-")[1] ===
                "4" &&
                role.eligiblePositions
                  .includes(2)
              ) ||
              (
                ticket.split("-")[2] ===
                "4" &&
                role.eligiblePositions
                  .includes(3)
              )
            )
        )
      );
    }),
    `${ticket}の4号艇と着順を構造化根拠で検証する`
  );
});

const selectedByTicket =
  new Map(
    practical.tickets.map((row) => [
      row.ticket,
      row
    ])
  );

assert.equal(
  practical.status,
  "selected",
  "江戸川1Rを実戦選択する"
);
assert.ok(
  practical.tickets.length >= 5 &&
    practical.tickets.length <= 10,
  "基本5〜7点・根拠がある場合だけ最大10点とする"
);
const selectedFourthTickets =
  expectedTickets.filter(
    (ticket) =>
      selectedByTicket.has(ticket)
  );
assert.equal(
  selectedFourthTickets.length,
  3,
  "最大10点内で4号艇根拠の独立展開を優先順に3点採用する"
);
selectedFourthTickets.forEach((ticket) => {
  const row = selectedByTicket.get(ticket);

  assert.ok(
    row,
    `${ticket}を実戦買い目へ通す`
  );
  assert.match(
    row.comment,
    /4号艇/,
    `${ticket}の個別コメントへ4号艇の根拠を残す`
  );
});
const omittedFourthTicket =
  practical.excludedCandidates.find(
    (row) => row.ticket === "3-4-5"
  );
assert.equal(
  omittedFourthTicket?.reasonCode,
  "MAXIMUM_REACHED",
  "3-4-5は消さず、10点上限との具体比較を残す"
);
assert.match(
  omittedFourthTicket?.scenarioSummary || "",
  /4号艇が2着.*5号艇が3着/,
  "非採用の3-4-5にも4の追走と5の展開拾いを記す"
);
assert.match(
  selectedByTicket.get("3-4-1").comment,
  /4号艇が2着.*1号艇が3着/,
  "3-4-1へ4の追走と1の内残りを記す"
);
assert.match(
  selectedByTicket.get("3-1-4").comment,
  /1号艇が.*2着.*4号艇.*3着/,
  "3-1-4へ1の内残りと4の3着残りを記す"
);
assert.match(
  selectedByTicket.get("3-4-2").comment,
  /4号艇が2着.*2号艇が3着/,
  "3-4-2へ4の追走と2の残りを記す"
);
assert.ok(
  practical.tickets.every(
    (row) =>
      !row.ticket.startsWith("4-")
  ),
  "評価艇を頭へ機械的に昇格させない"
);
assert.deepEqual(
  global.ChappyNoteGenerator
    .createPracticalSelection(prediction),
  practical.tickets,
  "画面・保存・noteで同じ実戦買い目を使う"
);

function evaluation(
  number,
  course,
  score,
  fields = {}
) {
  return {
    boatNo: number,
    course,
    score,
    total: score,
    attack: fields.attack || 0,
    hold: fields.hold || 0,
    pickup: fields.pickup || 0,
    comment:
      `${number}号艇の構造化評価`
  };
}

const genericEvaluations = [
  evaluation(1, 1, 88, { hold: 85 }),
  evaluation(2, 2, 73, { hold: 72 }),
  evaluation(6, 3, 92, { attack: 95 }),
  evaluation(5, 4, 80, {
    attack: 82,
    hold: 84
  }),
  evaluation(4, 5, 77, { pickup: 86 }),
  evaluation(3, 6, 66, { pickup: 70 })
];
const genericByBoat =
  new Map(
    genericEvaluations.map((row) => [
      row.boatNo,
      row
    ])
  );
const genericPrediction = {
  boatEvaluation: {
    evaluations: genericEvaluations,
    honmei: genericByBoat.get(6),
    taikou: genericByBoat.get(1),
    ana: genericByBoat.get(4),
    osae: genericByBoat.get(5)
  },
  mainSheet: {
    evaluations: genericEvaluations,
    honmei: genericByBoat.get(6),
    taikou: genericByBoat.get(1),
    ana: genericByBoat.get(4),
    osae: genericByBoat.get(5),
    reason: "6号艇の攻めを主筋とする"
  },
  raceFlow: {
    title: "6号艇の攻め",
    summary:
      "6号艇が実3コースから攻める",
    attackBoats: [
      {
        boatNo: 6,
        score: 95,
        reason: "実3コースから攻める"
      },
      {
        boatNo: 5,
        score: 82,
        reason: "攻め返す余地"
      }
    ],
    holdBoats: [
      {
        boatNo: 5,
        score: 84,
        reason: "攻めに追走して残す"
      },
      {
        boatNo: 1,
        score: 85,
        reason: "内で残す"
      },
      {
        boatNo: 2,
        score: 72,
        reason: "内寄りで残す"
      }
    ],
    pickupBoats: [
      {
        boatNo: 4,
        score: 86,
        reason: "外から展開を拾う"
      }
    ],
    phases: {
      firstMark: {
        mainAttack: {
          boatNo: 6,
          score: 95,
          reason: "実3コースから攻める"
        },
        secondAttack: {
          boatNo: 5,
          score: 82,
          reason: "攻め返す余地"
        },
        mainHold: {
          boatNo: 5,
          score: 84,
          reason: "1マークで残す"
        }
      },
      back: {
        leader: {
          boatNo: 6,
          score: 95,
          reason: "バック先頭"
        },
        hold: {
          boatNo: 5,
          score: 84,
          reason: "バックで残す"
        },
        pickup: {
          boatNo: 4,
          score: 86,
          reason: "バックで拾う"
        }
      },
      secondMark: {
        mainHold: {
          boatNo: 5,
          score: 84,
          reason: "2マークで残す"
        },
        mainPickup: {
          boatNo: 4,
          score: 86,
          reason: "2マークで拾う"
        }
      },
      goal: {
        expectedOrder: [
          { boatNo: 6 },
          { boatNo: 5 },
          { boatNo: 2 }
        ]
      }
    }
  }
};
const genericDecision =
  scenarioCandidates.build(
    genericPrediction
  );
const genericExpected = [
  "6-5-4",
  "6-5-1",
  "6-1-5",
  "6-5-2"
];

genericExpected.forEach((ticket) => {
  const candidate =
    genericDecision.candidateByTicket
      .get(ticket);

  assert.ok(
    candidate?.expansionEligible,
    `${ticket}を艇番非依存の成立枝として生成する`
  );
  assert.ok(
    candidate.branchIds.some((branchId) => {
      const branch =
        genericDecision.branches.find(
          (row) => row.id === branchId
        );

      return (
        branch?.kind ===
          "independent-scenario" &&
        branch.attackerBoatNo === 6 &&
        branch.roles.some(
          (role) =>
            role.boatNo === 5
        )
      );
    }),
    `${ticket}へ6号艇攻め・5号艇残しの根拠を接続する`
  );
});
assert.ok(
  genericDecision.branches.every(
    (branch) =>
      !branch.id.includes(
        "fourContinuation"
      )
  ),
  "特定艇専用の枝名を使わない"
);

const rejectedHoldEvidence = {
  boatNo: 5,
  score: 84,
  reason: "形式上の残し候補",
  status: "不成立",
  isAdopted: false
};
const noHoldDecision =
  scenarioCandidates.build({
    ...genericPrediction,
    raceFlow: {
      ...genericPrediction.raceFlow,
      attackBoats:
        genericPrediction.raceFlow
          .attackBoats
          .filter(
            (row) => row.boatNo !== 5
          ),
      holdBoats:
        [
          ...genericPrediction.raceFlow
            .holdBoats
            .filter(
              (row) =>
                row.boatNo !== 5
            ),
          rejectedHoldEvidence
        ],
      phases: {
        ...genericPrediction.raceFlow
          .phases,
        firstMark: {
          ...genericPrediction
            .raceFlow.phases
            .firstMark,
          mainHold:
            rejectedHoldEvidence,
          secondAttack: null
        },
        back: {
          ...genericPrediction
            .raceFlow.phases.back,
          hold:
            rejectedHoldEvidence
        },
        secondMark: {
          ...genericPrediction
            .raceFlow.phases
            .secondMark,
          mainHold:
            rejectedHoldEvidence
        }
      }
    }
  });
const genericTarget =
  noHoldDecision.targets.find(
    (target) =>
      target.markKey === "osae"
  );

assert.equal(
  genericTarget.candidateTickets.length,
  genericTarget.eligiblePositions.length * 20,
  "独立根拠がなくても動的役割の全物理候補を消さない"
);
assert.equal(
  genericTarget.status,
  "structured-candidate-generated",
  "評価由来の役割候補も消さずに保持する"
);
assert.equal(
  noHoldDecision.branches.some(
    (branch) =>
      branch.purchaseEligible === true &&
      branch.roles.some(
        (role) => role.boatNo === 5
      )
  ),
  false,
  "正式な展開根拠がない艇を購入候補へ自己申告で昇格させない"
);

console.log(
  "評価済み展開の艇番非依存回帰テスト: 合格"
);
console.log(
  `- 江戸川1R: ${practical.tickets.length}点、指定4展開を保持`
);
console.log(
  "- 合成例: 6号艇攻め・5号艇残しでも同じ共通処理"
);
