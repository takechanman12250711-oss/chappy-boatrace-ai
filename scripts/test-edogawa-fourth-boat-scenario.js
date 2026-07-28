"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");
const theoryInput = require("../js/theory-input");
require("../js/prediction");
const practicalSelector = require("../js/practical-selection");
require("../js/note-generator");

const archive = require("../data/predictions/20260728.json");
const savedRace = archive.verificationPredictions.find(
  (item) => item.raceKey === "20260728-03-1"
);

assert.ok(savedRace, "2026年7月28日 江戸川1Rの保存値を読み込む");

function createRaceDataFromRecord(
  record,
  options = {}
) {
  const {
    fourCurrentSt = 0.111,
    officialCourses = false,
    courses = {},
    exhibitionStByBoat = {}
  } = options;
  const snapshot =
    record.prediction.preRaceConditions;
  const entries = snapshot.boats.map((boat) => {
    const course =
      Number(courses[boat.boatNo]) || boat.course;
    const exhibitionSt =
      exhibitionStByBoat[boat.boatNo];
    const currentSt =
      boat.boatNo === 4
        ? fourCurrentSt
        : boat.currentST;

    return {
      boat: boat.boatNo,
      course,
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
      ...(
        exhibitionSt === undefined
          ? {}
          : { exhibitionSt }
      ),
      currentRace: {
        stList:
          currentSt === null
            ? []
            : [currentSt]
      }
    };
  });

  return {
    ok: true,
    source: "boatrace-official",
    stadiumCode: String(record.jcd).padStart(2, "0"),
    stadiumName: record.place,
    raceNo: Number(record.raceNo),
    date: String(record.date),
    weather: snapshot.weather,
    entries,
    ...(
      officialCourses
        ? {
            startExhibition: entries.map((entry) => ({
              boat: entry.boat,
              course: entry.course,
              st: entry.exhibitionSt,
              isOfficialCourse: true,
              mappingSource: "official-start-image"
            }))
          }
        : {}
    )
  };
}

function createRaceData(options = {}) {
  return createRaceDataFromRecord(
    savedRace,
    options
  );
}

function predict(data) {
  return global.createPrediction(
    theoryInput.prepare(
      data,
      global.ChappyAICore
    )
  );
}

function buildAiCore(
  data,
  preserveFourthContinuation = true
) {
  return global.ChappyAICore.buildPredictionData(
    theoryInput.prepare(
      data,
      global.ChappyAICore
    ),
    {
      preserveFourthContinuation
    }
  );
}

function boatNo(mark) {
  return Number(
    mark?.boatNo ??
    mark?.number ??
    mark?.waku ??
    0
  );
}

function ticketContains(ticket, targetBoatNo) {
  return String(ticket || "")
    .split("-")
    .map(Number)
    .includes(Number(targetBoatNo));
}

const prediction = predict(createRaceData());
const scenarios = prediction.aiCore.raceScenarios;
const fourthEvaluation =
  prediction.boatEvaluation.evaluations.find(
    (item) => Number(item.boatNo) === 4
  );

assert.equal(
  scenarios.mainScenario.type,
  "threeAttack",
  "主筋の3号艇攻めは変えない"
);
assert.equal(
  boatNo(prediction.mainSheet.honmei),
  3,
  "本命3号艇は変えない"
);
assert.ok(
  fourthEvaluation.score >= 70 &&
  fourthEvaluation.attack >= 85 &&
  fourthEvaluation.tenkai >= 75,
  "4号艇の正しい総合・攻め・展開評価を弱めない"
);
assert.equal(
  scenarios.fourContinuation.qualified,
  true,
  "攻め・残し・今節STの複合根拠を認識する"
);
assert.equal(
  scenarios.fourContinuation.currentSt,
  0.111,
  "4号艇の保存済み今節STを使う"
);
assert.equal(
  scenarios.fourContinuation.blockedByThreeAttack,
  true,
  "元の無条件除外が働く強度の3号艇攻めだけを修正対象にする"
);
assert.ok(
  !scenarios.blockedBoats.includes(4),
  "3攻めだけを理由に4号艇を全展開から消さない"
);
assert.ok(
  scenarios.holdPickupTheory.secondCandidates.some(
    (item) => Number(item.boatNo) === 4
  ),
  "4号艇を追走・残し候補として維持する"
);
assert.ok(
  !scenarios.holdPickupTheory.thirdCandidates.some(
    (item) => Number(item.boatNo) === 4
  ),
  "4号艇の3着可能性は着順枝で扱い、拾い点を二重加点しない"
);
assert.equal(
  boatNo(prediction.boatEvaluation.osae),
  4,
  "元の正しい4号艇押さえ評価を維持する"
);
assert.equal(
  boatNo(prediction.mainSheet.osae),
  4,
  "最終印にも4号艇押さえを接続する"
);

const practical =
  practicalSelector.select(prediction);
const practicalWithFour =
  practical.tickets.filter((item) =>
    ticketContains(item.ticket, 4)
  );
const expectedContinuationTickets = [
  "3-4-5",
  "3-4-1",
  "3-1-4",
  "3-4-2"
];
const expectedContinuationComments = new Map([
  [
    "3-4-5",
    "4号艇が2着へ追走・残し、5号艇が3着で展開を拾う"
  ],
  [
    "3-4-1",
    "4号艇が2着へ追走・残し、1号艇が内で3着に残る"
  ],
  [
    "3-1-4",
    "1号艇が内で2着に残り、4号艇の3着残りを拾う"
  ],
  [
    "3-4-2",
    "4号艇が2着へ追走・残し、2号艇が内で3着に残る"
  ]
]);

assert.equal(practical.status, "selected");
assert.ok(
  practical.tickets.length >= 5 &&
  practical.tickets.length <= 7,
  "実戦厳選の基本5点・最大7点を維持する"
);
assert.deepEqual(
  prediction.aiCore.formations.evidence
    .fourContinuation.candidateTickets,
  expectedContinuationTickets,
  "4号艇の2着残し・3着残りを別々の展開候補として保持する"
);
assert.deepEqual(
  practicalWithFour.map((item) => item.ticket),
  expectedContinuationTickets,
  "江戸川1Rでは成立した4号艇絡み4展開を実戦7点へ通す"
);
practicalWithFour.forEach((item) => {
  const expectedComment =
    expectedContinuationComments.get(
      item.ticket
    );

  assert.equal(
    item.scenarioTitle,
    "3攻め＋4追走・残し",
    `${item.ticket}へ4号艇継続の展開名を渡す`
  );
  assert.ok(
    expectedComment &&
    item.comment.includes(expectedComment),
    `${item.ticket}へ着順別の4号艇継続根拠を渡す`
  );
  assert.ok(
    item.comment.includes(
      prediction.aiCore.formations.evidence
        .fourContinuation.reason
    ),
    `${item.ticket}へ4号艇自身のST・攻め・残し根拠を渡す`
  );
  assert.ok(
    !item.comment.includes(
      "内の残しと5号艇の展開拾い"
    ),
    `${item.ticket}へ旧汎用コメントを残さない`
  );
});
assert.deepEqual(
  practical.tickets.map((item) => item.ticket),
  [
    "3-1-5",
    "3-2-5",
    "3-4-5",
    "3-4-1",
    "3-1-4",
    "3-4-2",
    "5-1-6"
  ],
  "本線3・押さえ2・流し1・穴1の配分内で展開を比較する"
);
assert.ok(
  practical.tickets.every(
    (item) => !String(item.ticket).startsWith("4-")
  ),
  "4号艇を頭へ強制昇格させない"
);
assert.deepEqual(
  global.ChappyNoteGenerator
    .createPracticalSelection(prediction),
  practical.tickets,
  "画面とnoteで同じ実戦厳選買い目を使う"
);
assert.ok(
  prediction.raceFlow.phases &&
  prediction.raceFlow.byBoat,
  "既存のスタートからゴールまでの展開詳細を消さない"
);
assert.equal(
  prediction.raceFlow.phases
    .firstMark.secondAttack.boatNo,
  4,
  "1マークの4号艇攻め返し評価を消さない"
);
assert.equal(
  prediction.raceFlow.phases.back.hold.boatNo,
  4,
  "バックの4号艇残し評価を消さない"
);
assert.equal(
  prediction.raceFlow.phases
    .secondMark.mainHold.boatNo,
  4,
  "2マークまで4号艇の残し展開を維持する"
);
assert.deepEqual(
  prediction.raceFlow.phases.goal
    .expectedOrder.map((item) => item.boatNo),
  [3, 4, 2],
  "保存済みのゴール想定3-4-2を消さない"
);
assert.equal(
  prediction.raceFlow.byBoat[4]
    .currentSTAverage,
  0.111,
  "4号艇の展開根拠である今節STを保持する"
);
assert.ok(
  prediction.finalComment.buyLevel,
  "既存の最終判断情報を消さない"
);
assert.match(
  String(prediction.finalComment.comment || ""),
  /押さえは4号艇/,
  "正しい4号艇評価を最終コメントへ残す"
);

const unsupported = predict(
  createRaceData({
    fourCurrentSt: 0.151
  })
);
const unsupportedScenarios =
  unsupported.aiCore.raceScenarios;
const unsupportedPractical =
  practicalSelector.select(unsupported);
const supportedFourAttack =
  scenarios.scenarios.find(
    (item) => item.type === "fourAttack"
  );
const unsupportedFourAttack =
  unsupportedScenarios.scenarios.find(
    (item) => item.type === "fourAttack"
  );

assert.equal(
  unsupportedScenarios.fourContinuation.qualified,
  false,
  "今節STの裏付けがない4号艇は例外にしない"
);
assert.ok(
  unsupportedScenarios.blockedBoats.includes(4),
  "独立根拠がない時は従来の3攻め判定を維持する"
);
assert.ok(
  unsupportedPractical.tickets.every(
    (item) => !ticketContains(item.ticket, 4)
  ),
  "根拠がない4号艇を買い目へ強制追加しない"
);
assert.equal(
  supportedFourAttack.score,
  unsupportedFourAttack.score,
  "4号艇の頭評価は引き上げず、追走・残しだけを復活させる"
);

const boundarySupported = predict(
  createRaceData({
    fourCurrentSt: 0.15
  })
);

assert.equal(
  boundarySupported.aiCore.raceScenarios
    .fourContinuation.qualified,
  true,
  "既存の4カド残し基準どおり今節ST.150は成立する"
);

const evaluationUnsupported =
  global.ChappyAICore.mergeWithPrediction(
    {
      ...prediction,
      boatEvaluation: {
        ...prediction.boatEvaluation,
        osae: prediction.boatEvaluation.taikou
      },
      mainSheet: {
        ...prediction.mainSheet,
        osae: prediction.mainSheet.taikou
      }
    },
    theoryInput.prepare(
      createRaceData(),
      global.ChappyAICore
    )
  ).aiCore;

assert.match(
  String(prediction.finalComment.comment || ""),
  /押さえは4号艇/,
  "表示文が4号艇押さえのままでも構造化評価を優先する"
);

assert.equal(
  evaluationUnsupported.raceScenarios
    .fourContinuation.qualified,
  false,
  "元の艇評価が4号艇押さえでなければ例外を開かない"
);
assert.equal(
  evaluationUnsupported.raceScenarios
    .fourContinuation.evaluationSupported,
  false,
  "ST根拠だけで4号艇を他レースへ押し込まない"
);

const differentMainData = createRaceData();
differentMainData.entries =
  differentMainData.entries.map((entry) => {
    if (Number(entry.boat) === 1) {
      return {
        ...entry,
        avgSt: 0.08,
        nationalWinRate: 9,
        national2Rate: 90,
        national3Rate: 95,
        localWinRate: 9,
        motor2Rate: 70,
        motor3Rate: 85,
        boat2Rate: 70,
        currentRace: {
          stList: [0.05]
        }
      };
    }

    if (Number(entry.boat) === 3) {
      return {
        ...entry,
        avgSt: 0.3,
        nationalWinRate: 1,
        national2Rate: 1,
        national3Rate: 1,
        localWinRate: 1,
        motor2Rate: 0,
        motor3Rate: 0,
        boat2Rate: 0,
        currentRace: {
          stList: [0.3]
        }
      };
    }

    return entry;
  });
const differentMainCore = buildAiCore(
  differentMainData
);
const differentMainContinuation =
  differentMainCore.raceScenarios.scenarios
    .find(
      (scenario) =>
        scenario.type === "threeAttack"
    )
    .fourContinuation;

assert.notEqual(
  differentMainCore.raceScenarios
    .mainScenario.type,
  "threeAttack",
  "3号艇の攻め根拠が崩れた時は別の主筋を選ぶ"
);
assert.equal(
  differentMainContinuation.evidenceQualified,
  true,
  "4号艇評価とSTの根拠自体は保持する"
);
assert.equal(
  differentMainContinuation.mainScenarioSupported,
  false,
  "別の主筋へ3号艇攻め用の例外を持ち込まない"
);
assert.equal(
  differentMainContinuation.blockedByThreeAttack,
  false,
  "元から4号艇を除外しない弱い3号艇攻めへ例外を足さない"
);
assert.equal(
  differentMainContinuation.qualified,
  false,
  "逃げなど別の主筋では3-4固定枝を生成しない"
);
assert.deepEqual(
  differentMainCore
    .formations.evidence.fourContinuation
    ?.candidateTickets || [],
  [],
  "別の主筋へ江戸川1Rの4点を流用しない"
);

const formalExhibitionSt = {
  1: 0.13,
  2: 0.13,
  3: 0.15,
  4: 0.10,
  5: 0.13,
  6: 0.13
};
const formalSlitSupported = buildAiCore(
  createRaceData({
    fourCurrentSt: 0.2,
    officialCourses: true,
    exhibitionStByBoat: formalExhibitionSt
  })
);

assert.equal(
  formalSlitSupported.raceScenarios
    .fourContinuation.qualified,
  true,
  "今節STが遅くても実3コース艇との公式展示ST差.050で成立する"
);
assert.equal(
  formalSlitSupported.raceScenarios
    .fourContinuation.comparedBoatNo,
  3,
  "公式展示STは実3コース艇と比較する"
);

const weakFormalSlit = buildAiCore(
  createRaceData({
    fourCurrentSt: 0.2,
    officialCourses: true,
    exhibitionStByBoat: {
      ...formalExhibitionSt,
      3: 0.149
    }
  })
);

assert.equal(
  weakFormalSlit.raceScenarios
    .fourContinuation.qualified,
  false,
  "公式展示ST差.049は独立した追走根拠にしない"
);

const onlyOutsideBoatFast = buildAiCore(
  createRaceData({
    fourCurrentSt: 0.2,
    officialCourses: true,
    exhibitionStByBoat: {
      ...formalExhibitionSt,
      3: 0.13,
      4: 0.14,
      5: 0.08
    }
  })
);

assert.equal(
  onlyOutsideBoatFast.raceScenarios
    .fourContinuation.qualified,
  false,
  "5号艇だけが速い展示を4号艇の追走根拠へ混ぜない"
);

const provisionalSlit = buildAiCore(
  createRaceData({
    fourCurrentSt: 0.2,
    exhibitionStByBoat: {
      ...formalExhibitionSt,
      3: 0.16
    }
  })
);

assert.equal(
  provisionalSlit.raceScenarios
    .fourContinuation.qualified,
  false,
  "進入未確定の展示ST差だけでは追走展開を追加しない"
);

const swappedCourse = buildAiCore(
  createRaceData({
    fourCurrentSt: 0.111,
    officialCourses: true,
    courses: {
      4: 5,
      5: 4
    },
    exhibitionStByBoat: formalExhibitionSt
  })
);

assert.equal(
  swappedCourse.raceScenarios
    .fourContinuation.mappingMatched,
  false,
  "4号艇が実4コースでなければ別艇の攻め根拠を混ぜない"
);
assert.equal(
  swappedCourse.raceScenarios
    .fourContinuation.qualified,
  false,
  "進入変更時は4号艇専用の追走展開を成立させない"
);
assert.deepEqual(
  swappedCourse.formations.evidence
    .fourContinuation.candidateTickets,
  [],
  "進入不一致時は4号艇専用の着順候補を生成しない"
);

console.log("江戸川1R 4号艇展開保持テスト: 合格");
console.log("- 主筋3号艇は維持");
console.log("- 4号艇は2着残し・3着残りの4展開を保持");
console.log("- 4号艇の頭固定と展開詳細の削除なし");
