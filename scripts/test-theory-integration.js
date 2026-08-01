"use strict";

const assert = require("node:assert/strict");
const {
  parseOfficialRaceHtml
} = require("../api/_parser");
const {
  addRacerVenueStarts,
  finalizeRacerVenueStarts
} = require("./build-race-stats");

global.window = global;
require("../js/ai-core");
require("../js/history-insights");
require("../js/motor-maintenance-insights");
const theoryInput = require(
  "../js/theory-input"
);
const predictionConditions = require(
  "../js/prediction-conditions"
);
const shadowSelectionV2 = require(
  "../js/shadow-selection-v2"
);
require("../js/prediction");
require("../js/practical-selection");
require("../js/note-generator");

const beforeHtml = `
  <div class="weather1">
    <span>気温 28.0℃</span>
    <span>風速 5m</span>
    <p class="weather1_bodyUnitImage is-wind5"></p>
    <span>水温 26.0℃</span>
    <span>波高 4cm</span>
  </div>
`;
const parsedWeather =
  parseOfficialRaceHtml(
    "",
    beforeHtml
  ).weather;

assert.equal(
  parsedWeather.windDirection,
  "向かい風",
  "公式風向アイコンを相対風向へ変換する"
);
assert.equal(
  parsedWeather.windDirectionCode,
  5
);
assert.equal(
  parsedWeather.inputStatus.tide,
  "unavailable",
  "実潮汐がない場合は取得済みにしない"
);

const venueStarts = {};
for (let index = 0; index < 12; index += 1) {
  addRacerVenueStarts(
    venueStarts,
    {
      jcd: "24",
      finishers: [
        { registerNo: "4001" }
      ]
    }
  );
}
const finalizedStarts =
  finalizeRacerVenueStarts(
    venueStarts
  );
assert.equal(
  finalizedStarts["4001"].venues["24"],
  12,
  "公式結果から選手×場の出走数を集計する"
);

function entry(boatNo) {
  return {
    boat: boatNo,
    registerNo:
      String(4000 + boatNo),
    className:
      boatNo <= 2 ? "A1" : "A2",
    racerName: `${boatNo}号艇`,
    avgSt: 0.11 + boatNo * 0.01,
    nationalWinRate:
      7.2 - boatNo * 0.2,
    national2Rate: 45,
    national3Rate: 65,
    localWinRate:
      7.0 - boatNo * 0.15,
    local2Rate: 44,
    local3Rate: 64,
    motor2Rate: 32 + boatNo,
    motor3Rate: 48 + boatNo,
    boat2Rate: 31 + boatNo,
    currentRace: {
      stList: [
        0.10 + boatNo * 0.005,
        0.12 + boatNo * 0.005
      ]
    },
    currentResults: [2, 3, 2],
    exhibition: {
      displayTime:
        6.70 + boatNo * 0.02,
      partsExchange:
        boatNo === 4
          ? "リング"
          : ""
    }
  };
}

const rawRaceData = {
  ok: true,
  source: "boatrace-official",
  stadiumCode: "24",
  raceNo: 8,
  date: "20260724",
  weather: parsedWeather,
  entries:
    [1, 2, 3, 4, 5, 6]
      .map(entry),
  startExhibition:
    [1, 2, 3, 4, 5, 6]
      .map((boat) => ({
        boat,
        course: boat,
        st: 0.08 + boat * 0.01,
        isOfficialCourse: true
      })),
  historyContext: {
    ready: true,
    source: "boatrace-official",
    racers:
      [1, 2, 3, 4, 5, 6]
        .map((boat) => ({
          registerNo:
            String(4000 + boat),
          localStarts:
            boat === 6 ? 11 : 12 + boat,
          currentVenueStarts:
            boat === 6 ? 11 : 12 + boat
        }))
  }
};

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

const appInput =
  theoryInput.prepare(
    clone(rawRaceData),
    global.ChappyAICore
  );
const selectionInput =
  theoryInput.prepare(
    clone(rawRaceData),
    global.ChappyAICore
  );
const serverInput =
  theoryInput.prepare(
    clone(rawRaceData),
    global.ChappyAICore
  );

assert.deepEqual(
  appInput,
  selectionInput,
  "アプリとレース自動選定の共通入力を一致させる"
);
assert.deepEqual(
  appInput,
  serverInput,
  "アプリとサーバー自動予想の共通入力を一致させる"
);

const karatsuNames = [
  "濱本優一",
  "末永祐輝",
  "島田一生",
  "竹内来",
  "梶原正",
  "加藤政彦"
];
const karatsuEquipmentNumbers = [
  22, 13, 28, 30, 1, 47
];
const karatsuRaw =
  clone(rawRaceData);
karatsuRaw.stadiumCode = "23";
karatsuRaw.raceNo = 2;
karatsuRaw.entries =
  karatsuRaw.entries.map(
    (row, index) => ({
      ...row,
      boat: index + 1,
      boatNo:
        karatsuEquipmentNumbers[index],
      racerName:
        karatsuNames[index]
    })
  );
const karatsuPrepared =
  theoryInput.prepare(
    karatsuRaw,
    global.ChappyAICore
  );

for (const [label, rows] of [
  ["共通入力", karatsuPrepared.entries],
  [
    "当地・水面理論",
    karatsuPrepared
      .localWaterTheoryV2
      .rows
  ],
  [
    "モーター理論",
    karatsuPrepared
      .motorMaintenanceTheoryV2
      .rows
  ]
]) {
  assert.deepEqual(
    rows.map(row => row.boatNo),
    [1, 2, 3, 4, 5, 6],
    `${label}で機材番号を艇番として採用しない`
  );
}

const karatsuPrediction =
  global.createPrediction(
    karatsuPrepared
  );
assert.deepEqual(
  karatsuPrepared.entries.map(
    row => row.boatNumber
  ),
  karatsuEquipmentNumbers,
  "機材ボート番号は艇番と分離して共通入力へ保持する"
);
assert.deepEqual(
  karatsuPrediction.race.entries
    .map(row => row.boatNo),
  [1, 2, 3, 4, 5, 6]
);
assert.deepEqual(
  karatsuPrediction.race.entries
    .map(row => row.boat.no),
  karatsuEquipmentNumbers,
  "予想出力でも機材ボート番号を失わない"
);
assert.deepEqual(
  karatsuPrediction.mainSheet
    .evaluations
    .map(row => row.boatNo),
  [1, 2, 3, 4, 5, 6],
  "唐津2R型の6艇評価で5号艇を欠落させない"
);
assert.equal(
  karatsuPrediction.mainSheet
    .evaluations[0].name,
  "濱本優一"
);
assert.equal(
  karatsuPrediction.mainSheet
    .evaluations[4].name,
  "梶原正"
);
assert.equal(
  karatsuPrediction
    .dataQuality
    .boatIdentity
    .valid,
  true
);

const malformedKaratsu =
  clone(karatsuRaw);
malformedKaratsu.entries[4].boat = 1;
const malformedPrediction =
  global.createPrediction(
    theoryInput.prepare(
      malformedKaratsu,
      global.ChappyAICore
    )
  );
assert.equal(
  malformedPrediction
    .dataQuality
    .boatIdentity
    .valid,
  false
);
assert.equal(
  malformedPrediction
    .dataQuality
    .score,
  0,
  "艇番不整合をデータ充足100点として扱わない"
);
const malformedArticle =
  global.ChappyNoteGenerator
    .generateArticle(
      malformedPrediction
    );
assert.equal(
  malformedArticle.publishable,
  false
);
assert.ok(
  malformedArticle.rejectionReasons
    .some(reason =>
      reason.includes("艇番不整合")
    ),
  "艇番が重複・欠落するnoteを販売可能にしない"
);

assert.equal(
  appInput.entries[0].localStarts,
  13
);
assert.equal(
  appInput.entries[5].localStarts,
  11
);
assert.equal(
  appInput.localWaterTheoryV2.rows[0]
    .hasReliableSample,
  true
);
assert.equal(
  appInput.localWaterTheoryV2.rows[5]
    .hasReliableSample,
  false,
  "12走未満は当地・水面Ver2の正式判定にしない"
);
assert.equal(
  appInput.weather.liveTideAvailable,
  false
);
assert.equal(
  appInput.motorMaintenanceTheoryV2
    .version,
  "motor-maintenance-theory-v2.0.0",
  "モーターVer2を共通入力へ接続する"
);
assert.equal(
  theoryInput.prepare(
    appInput,
    global.ChappyAICore
  ),
  appInput,
  "共通入力を二重加工しない"
);

const trendApp =
  global.ChappyAICore
    .buildRaceTrendEvaluation(
      appInput
    );
const trendSelection =
  global.ChappyAICore
    .buildRaceTrendEvaluation(
      selectionInput
    );
const trendServer =
  global.ChappyAICore
    .buildRaceTrendEvaluation(
      serverInput
    );

assert.deepEqual(
  trendApp,
  trendSelection,
  "アプリとレース自動選定の期待度を一致させる"
);
assert.deepEqual(
  trendApp,
  trendServer,
  "アプリとサーバー自動予想の期待度を一致させる"
);

function predictionSnapshot(input) {
  const prediction =
    global.createPrediction(input);
  const practical =
    global.ChappyNoteGenerator
      .createPracticalSelection(
        prediction
      );

  return {
    marks: {
      honmei:
        prediction?.mainSheet
          ?.honmei?.boatNo || 0,
      taikou:
        prediction?.mainSheet
          ?.taikou?.boatNo || 0,
      ana:
        prediction?.mainSheet
          ?.ana?.boatNo || 0,
      osae:
        prediction?.mainSheet
          ?.osae?.boatNo || 0
    },
    mainFormation:
      prediction?.mainSheet
        ?.formation || null,
    manshuFormation:
      prediction?.manshuSheet
        ?.formation || null,
    practical:
      practical.map((item) =>
        item.ticket ||
        item.combination ||
        ""
      )
  };
}

const appPrediction =
  predictionSnapshot(appInput);
const selectionPrediction =
  predictionSnapshot(selectionInput);
const serverPrediction =
  predictionSnapshot(serverInput);

assert.deepEqual(
  appPrediction,
  selectionPrediction,
  "アプリとレース自動選定後の印・買い目を一致させる"
);
assert.deepEqual(
  appPrediction,
  serverPrediction,
  "アプリとサーバー自動予想の印・買い目を一致させる"
);
assert.ok(
  appPrediction.practical.length <= 10,
  "通常5〜7点・成立展開時最大10点を維持する"
);

const withoutOdds =
  global.createPrediction(
    clone(appInput)
  );
const formationTickets = [
  ...(withoutOdds.formation?.main || []),
  ...(withoutOdds.formation?.cover || []),
  ...(withoutOdds.formation?.nagashi || []),
  ...(withoutOdds.formation?.hole || [])
];
const oddsInput =
  clone(appInput);

oddsInput.odds = {
  byTicket:
    Object.fromEntries(
      formationTickets.map(
        (ticket, index) => [
          ticket,
          10 + index
        ]
      )
    )
};

const predictionWithOdds =
  global.createPrediction(
    oddsInput
  );
const displayedTicketLists = [
  predictionWithOdds.mainSheet
    .tickets,
  predictionWithOdds.mainSheet
    .coverTickets,
  predictionWithOdds.mainSheet
    .flowTickets,
  predictionWithOdds.manshuSheet
    .tickets,
  predictionWithOdds.ticketSheets
    .all,
  predictionWithOdds
    .aiTicketList
].filter((list) => list.length);

assert.ok(
  displayedTicketLists.length >= 3,
  "本命・押さえ・全買い目の表示データを作成する"
);

displayedTicketLists.forEach(
  (list) => {
    list.forEach((item) => {
      assert.equal(
        typeof item,
        "object",
        "全表示へ共通の買い目オブジェクトを渡す"
      );
      assert.ok(
        item.ticket,
        "全表示の買い目にticketを保持する"
      );
      assert.equal(
        item.odds,
        oddsInput.odds
          .byTicket[item.ticket],
        "本命・万舟・実戦厳選・一覧で同じ公式オッズを使う"
      );
      assert.notEqual(
        item.oddsText,
        "オッズ未取得",
        "取得済みオッズを未取得表示へ戻さない"
      );
    });
  }
);

assert.deepEqual(
  predictionWithOdds.aiTicketList
    .map((item) => item.ticket),
  predictionWithOdds.ticketSheets
    .all
    .map((item) => item.ticket),
  "AI買い目一覧も最新AIコアの共通買い目を使う"
);
assert.equal(
  new Set(
    predictionWithOdds
      .aiTicketList
      .map((item) => item.ticket)
  ).size,
  predictionWithOdds
    .aiTicketList.length,
  "複数分類に入る同一買い目は一覧で重複させない"
);

const integratedPrediction =
  global.createPrediction(appInput);
const integratedPracticalTickets =
  global.ChappyNoteGenerator
    .createPracticalSelection(
      integratedPrediction
    );
const integratedShadow =
  shadowSelectionV2.buildRecord({
    raceKey: "20260724-24-8",
    date: "20260724",
    jcd: "24",
    place: "大村",
    raceNo: 8,
    deadlineAt:
      "2026-07-24T10:02:00.000Z",
    capturedAt:
      "2026-07-24T10:00:00.000Z",
    logicFingerprint: "integration-test",
    referenceDataFingerprint: "stats-test",
    theoryInputVersion:
      theoryInput.VERSION,
    selection: {
      type: "本線",
      score: 45,
      threshold: 70,
      qualified: false
    },
    preRaceConditions:
      predictionConditions.capture(
        rawRaceData,
        integratedPrediction
      ),
    preparedRaceData: appInput,
    practicalTickets:
      integratedPracticalTickets,
    prediction: integratedPrediction,
    coreApi: global.ChappyAICore
  });

assert.equal(
  integratedShadow.evaluation.components.length,
  8,
  "実際の予想出力からV2の8項目を作る"
);
assert.ok(
  integratedShadow.evaluation.components.every(
    item => item.score !== null
  ),
  "実際の予想出力で8項目を数値保存する"
);
assert.equal(
  integratedShadow.selectionReference.threshold,
  70,
  "V2自動選定と同じ70点基準を監査参照として保持する"
);
assert.equal(
  integratedShadow.snapshot.boats[0].localWinRate,
  rawRaceData.entries[0].localWinRate,
  "V2スナップショットへ理論補正前の公式値を保存する"
);
assert.equal(
  integratedShadow.officialResultUsedForEvaluation,
  false
);

console.log(
  "全理論統合テスト: OK"
);
console.log(
  "- 共通入力・当地出走数・風向・潮汐未取得・3経路・全表示オッズ一致を確認"
);
