"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const snapshot = require("../js/theory-tag-snapshot");
const evaluator = require("../js/theory-evaluation-engine");

const browserWindow = { addEventListener() {} };
const browserContext = {
  window: browserWindow,
  document: { addEventListener() {} },
  console
};
vm.createContext(browserContext);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "js", "prediction-venue-water-support.js"), "utf8"),
  browserContext
);
const venueWaterSupport = browserWindow.ChappyPredictionVenueWaterSupport;
assert.ok(venueWaterSupport, "当地・水面補助を読み込める");

const prediction = {
  venueWaterSupport: {
    venue: "大村",
    wind: 4,
    wave: 2,
    tide: "満潮前",
    confirmations: ["イン有利を強く評価", "潮汐情報（満潮前）を展開補正に使用"],
    cautions: ["2差しは頭まで届きにくい傾向"]
  }
};

const result = snapshot.build(prediction, [
  { ticket: "1-3-4", category: "本線" },
  { ticket: "1-2-3", category: "押さえ" }
]);
const localWater = result.theories.find(row => row.theoryKey === "localWater");
assert.ok(localWater, "当地・水面の具体的補正がある場合は正式証拠化する");
assert.equal(localWater.ticketCount, 2);
assert.deepEqual(localWater.sources, ["venue-water-support"]);

const generic = snapshot.localWaterEvidence({
  venueWaterSupport: {
    venue: "未知場",
    wind: null,
    wave: null,
    tide: "",
    confirmations: ["開催場の水面特性を補助評価"],
    cautions: []
  }
});
assert.equal(generic.formal, false, "一般文だけでは当地・水面理論を水増ししない");

const missingWeather = venueWaterSupport.build({}, { place: "未知場", weather: {} });
assert.equal(missingWeather.wind, null, "欠損風速を0mとして扱わない");
assert.equal(missingWeather.wave, null, "欠損波高を0cmとして扱わない");
assert.equal(snapshot.localWaterEvidence({ venueWaterSupport: missingWeather }).formal, false);

const calmWeather = venueWaterSupport.build({}, {
  place: "未知場",
  weather: { windSpeed: 0, waveHeight: 0 }
});
assert.equal(calmWeather.wind, 0, "実測0mは有効な値として保持する");
assert.equal(calmWeather.wave, 0, "実測0cmは有効な値として保持する");
assert.equal(snapshot.localWaterEvidence({ venueWaterSupport: calmWeather }).formal, true);

const venues = [
  ["01", "桐生"], ["02", "戸田"], ["03", "江戸川"], ["04", "平和島"],
  ["05", "多摩川"], ["06", "浜名湖"], ["07", "蒲郡"], ["08", "常滑"],
  ["09", "津"], ["10", "三国"], ["11", "びわこ"], ["12", "住之江"],
  ["13", "尼崎"], ["14", "鳴門"], ["15", "丸亀"], ["16", "児島"],
  ["17", "宮島"], ["18", "徳山"], ["19", "下関"], ["20", "若松"],
  ["21", "芦屋"], ["22", "福岡"], ["23", "唐津"], ["24", "大村"]
];
venues.forEach(([jcd, place]) => {
  const generated = venueWaterSupport.build({}, { place, weather: {} });
  const generatedFormal = snapshot.localWaterEvidence({ venueWaterSupport: generated }).formal;
  const storedFormal = evaluator.hasStoredLocalWaterEvidence({
    jcd,
    place,
    prediction: {
      preRaceConditions: {
        weather: { windSpeed: null, waveHeight: null, tideLevel: null, tidePhase: "" },
        dataAvailability: { wind: false, wave: false, tide: false }
      }
    }
  });
  assert.equal(storedFormal, generatedFormal, `${place}の固有水面ルールを生成側と評価側で一致させる`);
});

assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
console.log("local water theory tag tests passed");
