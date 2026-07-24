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
  appPrediction.practical.length <= 7,
  "最大7点を維持する"
);

console.log(
  "全理論統合テスト: OK"
);
console.log(
  "- 共通入力・当地出走数・風向・潮汐未取得・3経路一致を確認"
);
