"use strict";

const assert = require("assert");

require("../js/history-insights.js");

const theory = globalThis.ChappyLocalWaterV2;
assert(theory, "ChappyLocalWaterV2 must load");
assert.strictEqual(
  theory.version,
  "local-water-theory-v2.0.0"
);

function createCore() {
  return {
    getVenueFeature(data) {
      const code = String(
        data?.stadiumCode || ""
      ).padStart(2, "0");

      if (code === "24") {
        return {
          inPower: 90,
          sashi: 62,
          makuri: 58,
          makuriSashi: 54,
          kado: 55,
          outside: 35,
          roughWater: 42
        };
      }

      return {
        inPower: 70,
        sashi: 63,
        makuri: 68,
        makuriSashi: 66,
        kado: 70,
        outside: 55,
        roughWater: 65
      };
    },

    buildPredictionData(data) {
      return {
        receivedData: data,
        marker: "original-build"
      };
    },

    buildBoatAnalyses(data) {
      return data.entries.map((entry) => ({
        boatNo: entry.boatNo,
        localWinRate: entry.localWinRate
      }));
    }
  };
}

function entries(localStarts = 30) {
  return [1, 2, 3, 4, 5, 6].map(
    (boatNo) => ({
      boatNo,
      course: boatNo,
      playerName: `選手${boatNo}`,
      localWinRate:
        boatNo === 1 ? 7.2 : 5.8,
      local2Rate:
        boatNo === 1 ? 52 : 38,
      local3Rate:
        boatNo === 1 ? 72 : 58,
      localStarts
    })
  );
}

const core = createCore();
globalThis.ChappyAICore = core;

assert.strictEqual(
  core.__localWaterTheoryV2Installed,
  true,
  "AIコアへ1回だけ接続する"
);

const omuraInput = {
  stadiumCode: "24",
  stadiumName: "大村",
  waterType: "海水",
  entries: entries(30),
  weather: {
    windSpeed: 1,
    windDirection: "弱風",
    waveHeight: 1,
    tideLevel: 150,
    tideFlow: "上げ"
  }
};

const omura = core.buildPredictionData(omuraInput);
const omuraTheory = omura.localWaterTheoryV2;
const omuraOne = omuraTheory.rows.find(
  (row) => row.boatNo === 1
);
const omuraSix = omuraTheory.rows.find(
  (row) => row.boatNo === 6
);

assert.strictEqual(
  omura.marker,
  "original-build",
  "既存予想処理を維持する"
);
assert.strictEqual(
  omuraTheory.isFormal,
  true,
  "当地30走・風波ありは正式判定"
);
assert.strictEqual(
  omuraOne.isFormal,
  true
);
assert(
  omuraOne.score > omuraSix.score,
  "大村の弱風では内コース適性を上位にする"
);
assert.notStrictEqual(
  omura.receivedData.entries[0].localWinRate,
  omuraInput.entries[0].localWinRate,
  "正式時だけ既存local指数への入力を置換する"
);
assert.strictEqual(
  omuraInput.entries[0].localWinRate,
  7.2,
  "元データは変更しない"
);

const rough = core.buildPredictionData({
  stadiumCode: "20",
  stadiumName: "若松",
  waterType: "海水",
  entries: entries(30),
  weather: {
    windSpeed: 6,
    windDirection: "向かい風",
    waveHeight: 6,
    tideLevel: 110,
    tideFlow: "下げ"
  }
});
const roughThree = rough.localWaterTheoryV2.rows.find(
  (row) => row.boatNo === 3
);
const roughSix = rough.localWaterTheoryV2.rows.find(
  (row) => row.boatNo === 6
);

assert(
  roughThree.components.windCourse >
    roughSix.components.windCourse,
  "向かい風ではセンター攻め適性を優先する"
);
assert(
  roughSix.components.waveSurface >= 0,
  "波・荒水面を独立評価する"
);

const lowSampleInput = {
  stadiumCode: "17",
  stadiumName: "宮島",
  waterType: "海水",
  entries: entries(8),
  weather: {
    windSpeed: 4,
    windDirection: "横風",
    waveHeight: 3,
    tideLevel: 90,
    tideFlow: "上げ"
  }
};
const lowSample = core.buildPredictionData(
  lowSampleInput
);
const lowOne = lowSample.localWaterTheoryV2.rows.find(
  (row) => row.boatNo === 1
);

assert.strictEqual(
  lowOne.isFormal,
  false,
  "当地12走未満は正式採用しない"
);
assert.strictEqual(
  lowSample.receivedData.entries[0].localWinRate,
  lowSampleInput.entries[0].localWinRate,
  "暫定判定は予想点へ反映しない"
);

const missingWeatherInput = {
  stadiumCode: "22",
  stadiumName: "福岡",
  waterType: "河口",
  entries: entries(30),
  weather: {}
};
const missingWeather = core.buildPredictionData(
  missingWeatherInput
);
const missingOne =
  missingWeather.localWaterTheoryV2.rows.find(
    (row) => row.boatNo === 1
  );

assert.strictEqual(
  missingOne.hasConditionEvidence,
  false
);
assert.strictEqual(
  missingOne.isFormal,
  false,
  "風・波未取得では正式採用しない"
);
assert.strictEqual(
  missingWeather.receivedData.entries[0].localWinRate,
  missingWeatherInput.entries[0].localWinRate,
  "未取得値を仮点で埋めない"
);

const analyses = core.buildBoatAnalyses(omuraInput);
assert.strictEqual(
  analyses.localWaterTheoryV2.isFormal,
  true,
  "艇別解析にも理論メタデータを保持する"
);

assert.strictEqual(
  core.__localWaterTheoryV2Installed,
  true
);
theory.install(core);
assert.strictEqual(
  core.__localWaterTheoryV2Installed,
  true,
  "二重接続しない"
);

console.log("Local/Water Theory V2 tests passed");
