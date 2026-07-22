/* =========================================================
  チャッピーボートレースAI
  ai-core.js 完全版 v3.0.0 Part 1 / 8

  役割：
  - AI指数計算の中核
  - 展示 / ST / 当地 / 全国 / 道中 / 攻め / 展開 / モーター
  - スリットAI / ダブルタイム / 新サム / 合成オッズ
  - prediction.js / render.js に渡せるAI評価データを作る

  公開：
  - window.ChappyAICore
========================================================= */

(function () {
  "use strict";

  const CORE_VERSION = "ai-core-v3.1.0-unified-bets";

  /* ===============================
    基本ユーティリティ
  =============================== */

  function isNil(value) {
    return value === null || value === undefined || value === "";
  }

  function toNumber(value, fallback = 0) {
    if (isNil(value)) return fallback;

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : fallback;
    }

    const text = String(value)
      .replace(/[％%]/g, "")
      .replace(/[^\d.\-]/g, "")
      .trim();

    if (!text) return fallback;

    const num = Number(text);
    return Number.isFinite(num) ? num : fallback;
  }

  function safeText(value, fallback = "-") {
    if (isNil(value)) return fallback;
    return String(value).trim() || fallback;
  }

  function clamp(value, min, max) {
    const num = toNumber(value, min);
    return Math.max(min, Math.min(max, num));
  }

  function round(value, digit = 1) {
    const num = toNumber(value, 0);
    const scale = Math.pow(10, digit);
    return Math.round(num * scale) / scale;
  }

  function average(values, fallback = 0) {
    const nums = values
      .map((v) => toNumber(v, NaN))
      .filter((v) => Number.isFinite(v));

    if (!nums.length) return fallback;

    return nums.reduce((sum, v) => sum + v, 0) / nums.length;
  }

  function sortDesc(array, key) {
    return [...array].sort((a, b) => toNumber(b[key]) - toNumber(a[key]));
  }

  function sortAsc(array, key) {
    return [...array].sort((a, b) => toNumber(a[key], 999) - toNumber(b[key], 999));
  }

function getBoatNo(boat) {
  if (!boat || typeof boat !== "object") {
    return 0;
  }

  function parseBoatNo(value) {
    if (isNil(value)) return 0;

    if (typeof value === "number") {
      return Number.isFinite(value) &&
        value >= 1 &&
        value <= 6
          ? value
          : 0;
    }

    const text = String(value).trim();

    /*
      "1"・"1号艇"・"1コース"などから
      1〜6の艇番を取り出す。
    */
    const match = text.match(/[1-6]/);

    if (!match) return 0;

    const no = Number(match[0]);

    return no >= 1 && no <= 6
      ? no
      : 0;
  }

  const candidates = [
    boat.boat,
    boat.waku,
    boat.course,
    boat.cource,
    boat.lane,
    boat.frame,
    boat.number,
    boat.teiban,
    boat.boatNo,
    boat.racer?.boatNo,
    boat.raw?.boatNo,
    boat.raw?.boat,
    boat.raw?.waku,
    boat.raw?.course
  ];

  for (const value of candidates) {
    const no = parseBoatNo(value);

    if (no >= 1 && no <= 6) {
      return no;
    }
  }

  return 0;
}

  function getPlayerName(boat) {
    return safeText(
      boat.playerName ??
      boat.name ??
      boat.racerName ??
      boat.player,
      "選手不明"
    );
  }

  function getClassName(boat) {
    return safeText(
      boat.className ??
      boat.grade ??
      boat.class ??
      boat.rank,
      "-"
    );
  }

  function hasClassPower(boat) {
    const cls = getClassName(boat);
    if (cls === "A1") return 1.0;
    if (cls === "A2") return 0.7;
    if (cls === "B1") return 0.35;
    if (cls === "B2") return 0.15;
    return 0.3;
  }

  function getRaceEntries(data) {
  if (!data) return [];

  const entries =
    data.entries ??
    data.boats ??
    data.racers ??
    data.entry ??
    data.raceEntries ??
    [];

  if (!Array.isArray(entries)) {
    return [];
  }

  const beforeInfo =
    data.beforeInfo ??
    data.before ??
    data.exhibitionInfo ??
    [];

  const startExhibition =
    data.startExhibition ??
    data.startInfo ??
    [];

  function getItemBoatNo(item, fallback = 0) {
    if (!item || typeof item !== "object") {
      return fallback;
    }

    const candidates = [
      item.boatNo,
      item.boat,
      item.waku,
      item.course,
      item.cource,
      item.lane,
      item.frame,
      item.number,
      item.teiban
    ];

    for (const value of candidates) {
      const text = String(value ?? "");
      const match = text.match(/[1-6]/);

      if (match) {
        return Number(match[0]);
      }
    }

    return fallback;
  }

  return entries.map((entry, index) => {
    const boatNo =
      getBoatNo(entry) ||
      getItemBoatNo(entry, index + 1);

    const before = Array.isArray(beforeInfo)
      ? beforeInfo.find(
          (item, itemIndex) =>
            getItemBoatNo(item, itemIndex + 1) === boatNo
        )
      : null;

    const start = Array.isArray(startExhibition)
      ? startExhibition.find(
          (item, itemIndex) =>
            getItemBoatNo(item, itemIndex + 1) === boatNo
        )
      : null;

    const exhibitionTime =
      before?.exhibitionTime ??
      before?.displayTime ??
      before?.tenjiTime ??
      before?.exhibition?.displayTime ??
      before?.exhibition?.time ??
      entry.exhibitionTime ??
      entry.displayTime ??
      entry.tenjiTime ??
      entry.exhibition?.displayTime ??
      entry.exhibition?.time;

    const exhibitionSt =
      before?.exhibitionSt ??
      before?.exhibitionST ??
      before?.displaySt ??
      before?.displayST ??
      before?.st ??
      before?.exhibition?.st ??
      start?.st ??
      start?.startTime ??
      entry.exhibitionSt ??
      entry.exhibitionST ??
      entry.displaySt ??
      entry.displayST ??
      entry.exhibition?.st;

    const lapTime =
      before?.lapTime ??
      before?.oneLapTime ??
      before?.roundTime ??
      before?.exhibition?.lapTime ??
      before?.exhibition?.oneLapTime ??
      entry.lapTime ??
      entry.oneLapTime ??
      entry.roundTime ??
      entry.exhibition?.lapTime;

    return {
      ...entry,

      boatNo,

      exhibitionTime,
      tenjiTime: exhibitionTime,
      displayTime: exhibitionTime,

      exhibitionSt,
      exhibitionST: exhibitionSt,
      tenjiSt: exhibitionSt,
      displaySt: exhibitionSt,

      lapTime,
      oneLapTime: lapTime,

      tilt:
        before?.tilt ??
        before?.exhibition?.tilt ??
        entry.tilt ??
        entry.exhibition?.tilt,

      partsExchange:
        before?.partsExchange ??
        before?.parts ??
        before?.exhibition?.partsExchange ??
        entry.partsExchange,

      beforeInfo: before || null,
      startExhibition: start || null
    };
  });
}

  function getVenueName(data) {
    return safeText(
      data?.stadiumName ??
      data?.venueName ??
      data?.placeName ??
      data?.raceInfo?.stadiumName ??
      data?.raceInfo?.venueName,
      "不明"
    );
  }

  function getVenueCode(data) {
    return safeText(
      data?.stadiumCode ??
      data?.jcd ??
      data?.venueCode ??
      data?.raceInfo?.stadiumCode,
      ""
    );
  }

  function getRaceNo(data) {
    return toNumber(
      data?.raceNo ??
      data?.rno ??
      data?.raceInfo?.raceNo,
      0
    );
  }

  function getWeather(data) {
    return data?.weather ?? data?.condition ?? data?.raceCondition ?? {};
  }

  function getWindSpeed(data) {
    const weather = getWeather(data);
    return toNumber(
      weather.windSpeed ??
      weather.wind ??
      weather.wind_velocity ??
      data?.windSpeed,
      0
    );
  }

  function getWaveHeight(data) {
    const weather = getWeather(data);
    return toNumber(
      weather.waveHeight ??
      weather.wave ??
      weather.wave_height ??
      data?.waveHeight,
      0
    );
  }

  function getWaterTemp(data) {
    const weather = getWeather(data);
    return toNumber(
      weather.waterTemp ??
      weather.waterTemperature ??
      data?.waterTemp,
      0
    );
  }

  function getAirTemp(data) {
    const weather = getWeather(data);
    return toNumber(
      weather.airTemp ??
      weather.temperature ??
      data?.airTemp,
      0
    );
  }

  /* ===============================
    24場特徴
  =============================== */

  const VENUE_FEATURES = {
    "01": {
      name: "桐生",
      inPower: 74,
      sashi: 64,
      makuri: 58,
      makuriSashi: 60,
      kado: 61,
      outside: 48,
      roughWater: 54,
      night: true,
      comment: "ナイターでインは強いが、展示気配とカド攻めも効く。"
    },
    "02": {
      name: "戸田",
      inPower: 55,
      sashi: 55,
      makuri: 68,
      makuriSashi: 64,
      kado: 70,
      outside: 58,
      roughWater: 63,
      night: false,
      comment: "全国屈指のクセ水面。センター攻めと外の展開拾いを重視。"
    },
    "03": {
      name: "江戸川",
      inPower: 52,
      sashi: 50,
      makuri: 63,
      makuriSashi: 61,
      kado: 62,
      outside: 58,
      roughWater: 90,
      night: false,
      comment: "荒水面適性が最重要。当地・道中・展示を強く見る。"
    },
    "04": {
      name: "平和島",
      inPower: 59,
      sashi: 57,
      makuri: 65,
      makuriSashi: 63,
      kado: 66,
      outside: 56,
      roughWater: 65,
      night: false,
      comment: "イン絶対ではなく、センター攻めと差し残りに注意。"
    },
    "05": {
      name: "多摩川",
      inPower: 63,
      sashi: 59,
      makuri: 62,
      makuriSashi: 63,
      kado: 64,
      outside: 53,
      roughWater: 50,
      night: false,
      comment: "静水面寄り。実力・展示・ターン力が出やすい。"
    },
    "06": {
      name: "浜名湖",
      inPower: 58,
      sashi: 56,
      makuri: 66,
      makuriSashi: 65,
      kado: 67,
      outside: 58,
      roughWater: 67,
      night: false,
      comment: "広い水面で外のスピード戦も届く。風の影響も見る。"
    },
    "07": {
      name: "蒲郡",
      inPower: 72,
      sashi: 63,
      makuri: 58,
      makuriSashi: 60,
      kado: 61,
      outside: 49,
      roughWater: 48,
      night: true,
      comment: "イン中心。展示上位と2コース差しを重視。"
    },
    "08": {
      name: "常滑",
      inPower: 66,
      sashi: 61,
      makuri: 61,
      makuriSashi: 61,
      kado: 62,
      outside: 51,
      roughWater: 61,
      night: false,
      comment: "イン有利寄りだが風で変化。差しとカドの残りに注意。"
    },
    "09": {
      name: "津",
      inPower: 69,
      sashi: 62,
      makuri: 58,
      makuriSashi: 59,
      kado: 60,
      outside: 48,
      roughWater: 58,
      night: false,
      comment: "イン安定寄り。内寄り決着を基本に相手探し。"
    },
    "10": {
      name: "三国",
      inPower: 67,
      sashi: 60,
      makuri: 60,
      makuriSashi: 60,
      kado: 61,
      outside: 50,
      roughWater: 57,
      night: false,
      comment: "季節風に注意。イン軸だが気配悪い内は差される。"
    },
    "11": {
      name: "びわこ",
      inPower: 58,
      sashi: 56,
      makuri: 66,
      makuriSashi: 65,
      kado: 67,
      outside: 57,
      roughWater: 70,
      night: false,
      comment: "うねり・風で波乱あり。センターと外の道中力を評価。"
    },
    "12": {
      name: "住之江",
      inPower: 78,
      sashi: 66,
      makuri: 55,
      makuriSashi: 58,
      kado: 58,
      outside: 45,
      roughWater: 43,
      night: true,
      comment: "イン強め。2コース差しと内枠の安定感が軸。"
    },
    "13": {
      name: "尼崎",
      inPower: 70,
      sashi: 63,
      makuri: 58,
      makuriSashi: 59,
      kado: 60,
      outside: 47,
      roughWater: 49,
      night: false,
      comment: "堅め寄り。インと2コース差し、展示上位を素直に評価。"
    },
    "14": {
      name: "鳴門",
      inPower: 61,
      sashi: 58,
      makuri: 64,
      makuriSashi: 64,
      kado: 65,
      outside: 55,
      roughWater: 74,
      night: false,
      comment: "潮・風の影響あり。センター攻めと展開艇を重視。"
    },
    "15": {
      name: "丸亀",
      inPower: 71,
      sashi: 63,
      makuri: 59,
      makuriSashi: 60,
      kado: 61,
      outside: 50,
      roughWater: 56,
      night: true,
      comment: "ナイターでイン安定。展示と差し足の評価が重要。"
    },
    "16": {
      name: "児島",
      inPower: 65,
      sashi: 60,
      makuri: 62,
      makuriSashi: 62,
      kado: 63,
      outside: 52,
      roughWater: 58,
      night: false,
      comment: "バランス型。内中心も中枠の攻めは軽視しない。"
    },
    "17": {
      name: "宮島",
      inPower: 62,
      sashi: 58,
      makuri: 63,
      makuriSashi: 63,
      kado: 64,
      outside: 54,
      roughWater: 76,
      night: false,
      comment: "潮汐の影響が大きい。時間帯・風・当地巧者を重視。"
    },
    "18": {
      name: "徳山",
      inPower: 80,
      sashi: 66,
      makuri: 54,
      makuriSashi: 56,
      kado: 57,
      outside: 43,
      roughWater: 46,
      night: false,
      comment: "イン最強級。基本は1軸、相手は差し・道中。"
    },
    "19": {
      name: "下関",
      inPower: 73,
      sashi: 64,
      makuri: 58,
      makuriSashi: 60,
      kado: 60,
      outside: 48,
      roughWater: 52,
      night: true,
      comment: "イン寄り。ナイター気配と2・3コースの足を確認。"
    },
    "20": {
      name: "若松",
      inPower: 64,
      sashi: 60,
      makuri: 63,
      makuriSashi: 64,
      kado: 66,
      outside: 57,
      roughWater: 78,
      night: true,
      comment: "風・うねりで展開変化。外の道中艇・当地巧者が怖い。"
    },
    "21": {
      name: "芦屋",
      inPower: 75,
      sashi: 64,
      makuri: 57,
      makuriSashi: 59,
      kado: 59,
      outside: 46,
      roughWater: 50,
      night: false,
      comment: "モーニングはイン強め。内枠信頼と展示を重視。"
    },
    "22": {
      name: "福岡",
      inPower: 56,
      sashi: 55,
      makuri: 67,
      makuriSashi: 66,
      kado: 68,
      outside: 60,
      roughWater: 82,
      night: false,
      comment: "河口水面で波乱あり。2マーク・道中・外枠注意。"
    },
    "23": {
      name: "唐津",
      inPower: 74,
      sashi: 63,
      makuri: 57,
      makuriSashi: 59,
      kado: 59,
      outside: 46,
      roughWater: 50,
      night: false,
      comment: "モーニングでイン強め。1軸と2差しを基本。"
    },
    "24": {
      name: "大村",
      inPower: 82,
      sashi: 67,
      makuri: 55,
      makuriSashi: 58,
      kado: 58,
      outside: 45,
      roughWater: 44,
      night: true,
      comment: "イン最強級。ただし新型エンジン期は展示・ST・技量を重視。"
    }
  };

  const VENUE_NAME_TO_CODE = Object.keys(VENUE_FEATURES).reduce((map, code) => {
    map[VENUE_FEATURES[code].name] = code;
    return map;
  }, {});

  function getVenueFeature(data) {
    const code = getVenueCode(data);
    const name = getVenueName(data);

    if (VENUE_FEATURES[code]) return VENUE_FEATURES[code];

    const foundCode = VENUE_NAME_TO_CODE[name];
    if (foundCode && VENUE_FEATURES[foundCode]) {
      return VENUE_FEATURES[foundCode];
    }

    return {
      name,
      inPower: 65,
      sashi: 60,
      makuri: 60,
      makuriSashi: 60,
      kado: 60,
      outside: 50,
      roughWater: 55,
      night: false,
      comment: "標準水面として評価。展示・ST・当地・道中をバランス確認。"
    };
  }

  /* ===============================
    重み設定
  =============================== */

  const NORMAL_WEIGHTS = {
  st: 0.18,
  exhibition: 0.18,
  motor: 0.12,
  local: 0.13,
  national: 0.10,
  attack: 0.13,
  raceFlow: 0.10,
  turn: 0.06
};

  const NEW_ENGINE_WEIGHTS = {
  st: 0.22,
  exhibition: 0.23,
  motor: 0.05,
  local: 0.14,
  national: 0.10,
  attack: 0.14,
  raceFlow: 0.08,
  turn: 0.04
};

  const INDEX_LIMIT = {
    min: 1,
    max: 100
  };

  function isNewEngineMode(data) {
    const flag =
      data?.isNewEngine ??
      data?.newEngine ??
      data?.raceInfo?.isNewEngine ??
      data?.raceInfo?.newEngine;

    if (flag === true) return true;

    const text = [
      data?.engineType,
      data?.motorTerm,
      data?.raceInfo?.engineType,
      data?.raceInfo?.motorTerm,
      data?.raceInfo?.memo,
      data?.memo
    ].map((v) => safeText(v, "")).join(" ");

    return /新エンジン|新型エンジン|新モーター|新燃料/.test(text);
  }

  function getWeights(data) {
    return isNewEngineMode(data) ? NEW_ENGINE_WEIGHTS : NORMAL_WEIGHTS;
  }
    /* ===============================
    各データ取得
  =============================== */

  function getAverageSt(boat) {
    return toNumber(
      boat.averageSt ??
      boat.avgSt ??
      boat.st ??
      boat.startTiming ??
      boat.nationalSt,
      0.18
    );
  }

  function getExhibitionTime(boat) {
    return toNumber(
      boat.exhibitionTime ??
      boat.tenjiTime ??
      boat.displayTime ??
      boat.exTime,
      0
    );
  }

  function getExhibitionSt(boat) {
    return toNumber(
      boat.exhibitionSt ??
      boat.tenjiSt ??
      boat.displaySt ??
      boat.startExhibition,
      0.15
    );
  }

  function getLapTime(boat) {
    return toNumber(
      boat.lapTime ??
      boat.oneLapTime ??
      boat.roundTime ??
      boat.turnTime,
      0
    );
  }

  function getMotorRate(boat) {
    return toNumber(
      boat.motorRate ??
      boat.motor2Rate ??
      boat.motorTwoRate ??
      boat.motorWinRate ??
      boat.motor?.twoRate,
      30
    );
  }

  function getMotor3Rate(boat) {
    return toNumber(
      boat.motor3Rate ??
      boat.motorThreeRate ??
      boat.motor?.threeRate,
      45
    );
  }

  function getBoatRate(boat) {
    return toNumber(
      boat.boatRate ??
      boat.boat2Rate ??
      boat.boatTwoRate ??
      boat.boat?.twoRate,
      30
    );
  }

  function getLocalWinRate(boat) {
    return toNumber(
      boat.localWinRate ??
      boat.localRate ??
      boat.local?.winRate,
      5
    );
  }

  function getLocal2Rate(boat) {
    return toNumber(
      boat.local2Rate ??
      boat.localTwoRate ??
      boat.local?.twoRate,
      30
    );
  }

  function getLocal3Rate(boat) {
    return toNumber(
      boat.local3Rate ??
      boat.localThreeRate ??
      boat.local?.threeRate,
      45
    );
  }

  function getNationalWinRate(boat) {
    return toNumber(
      boat.nationalWinRate ??
      boat.winRate ??
      boat.rate ??
      boat.national?.winRate,
      5
    );
  }

  function getNational2Rate(boat) {
    return toNumber(
      boat.national2Rate ??
      boat.nationalTwoRate ??
      boat.twoRate ??
      boat.national?.twoRate,
      30
    );
  }

  function getNational3Rate(boat) {
    return toNumber(
      boat.national3Rate ??
      boat.nationalThreeRate ??
      boat.threeRate ??
      boat.national?.threeRate,
      45
    );
  }

  function getThisTermResults(boat) {
    const raw =
      boat.thisTermResults ??
      boat.currentResults ??
      boat.seriesResults ??
      boat.results ??
      [];

    if (Array.isArray(raw)) return raw;

    if (typeof raw === "string") {
      return raw
        .split(/[,\s/・]+/)
        .map((v) => toNumber(v, NaN))
        .filter((v) => Number.isFinite(v));
    }

    return [];
  }

  /* ===============================
    指数計算
  =============================== */

  function calcStIndex(boat, entries) {
    const st = getAverageSt(boat);
    const stList = entries.map(getAverageSt);
    const avg = average(stList, 0.18);

    let score = 60;

    score += (avg - st) * 220;

    if (st <= 0.12) score += 14;
    else if (st <= 0.14) score += 10;
    else if (st <= 0.16) score += 6;
    else if (st <= 0.18) score += 2;
    else if (st >= 0.23) score -= 14;
    else if (st >= 0.21) score -= 9;
    else if (st >= 0.19) score -= 4;

    score += hasClassPower(boat) * 4;

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
  }

  function calcExhibitionIndex(boat, entries) {
    const time = getExhibitionTime(boat);
    const exSt = getExhibitionSt(boat);
    const lap = getLapTime(boat);

    const validTimes = entries.map(getExhibitionTime).filter((v) => v > 0);
    const validLaps = entries.map(getLapTime).filter((v) => v > 0);

    let score = 55;

    if (time > 0 && validTimes.length) {
      const best = Math.min(...validTimes);
      const avg = average(validTimes, time);
      score += (avg - time) * 80;
      score += (time === best ? 12 : 0);
    }

    if (lap > 0 && validLaps.length) {
      const bestLap = Math.min(...validLaps);
      const avgLap = average(validLaps, lap);
      score += (avgLap - lap) * 45;
      score += (lap === bestLap ? 8 : 0);
    }

    if (exSt <= 0.05) score += 8;
    else if (exSt <= 0.10) score += 6;
    else if (exSt <= 0.15) score += 3;
    else if (exSt >= 0.25) score -= 8;
    else if (exSt >= 0.20) score -= 4;

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
  }

  function calcMotorIndex(boat, data) {
  const rawMotor2 =
    boat.motorRate ??
    boat.motor2Rate ??
    boat.motorTwoRate ??
    boat.motorWinRate ??
    boat.motor?.twoRate ??
    boat.motor?.secondRate ??
    boat.motor?.quinellaRate;

  const rawMotor3 =
    boat.motor3Rate ??
    boat.motorThreeRate ??
    boat.motor?.threeRate ??
    boat.motor?.thirdRate ??
    boat.motor?.trioRate;

  const rawBoat2 =
    boat.boatRate ??
    boat.boat2Rate ??
    boat.boatTwoRate ??
    boat.boat?.twoRate ??
    boat.boat?.secondRate ??
    boat.boat?.quinellaRate;

  const hasMotor2 = !isNil(rawMotor2);
  const hasMotor3 = !isNil(rawMotor3);
  const hasBoat2 = !isNil(rawBoat2);

  /*
    モーター情報がない場合は中立50点。
    仮の30%・45%を上位評価として扱わない。
  */
  if (!hasMotor2 && !hasMotor3 && !hasBoat2) {
    return 50;
  }

  const motor2 = hasMotor2
    ? toNumber(rawMotor2, 30)
    : 30;

  const motor3 = hasMotor3
    ? toNumber(rawMotor3, 45)
    : 45;

  const boat2 = hasBoat2
    ? toNumber(rawBoat2, 30)
    : 30;

  let score = 50;

  score += (motor2 - 30) * 0.75;
  score += (motor3 - 45) * 0.22;
  score += (boat2 - 30) * 0.20;

  if (isNewEngineMode(data)) {
    score = 50 + (score - 50) * 0.45;
  }

  return clamp(
    round(score),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  );
}

  function calcLocalIndex(boat) {
    const win = getLocalWinRate(boat);
    const two = getLocal2Rate(boat);
    const three = getLocal3Rate(boat);

    let score = 35;

    score += win * 4.6;
    score += two * 0.35;
    score += three * 0.12;

    if (win >= 7) score += 9;
    else if (win >= 6) score += 5;

    if (two >= 45) score += 6;
    else if (two >= 38) score += 3;

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
  }

  function calcNationalIndex(boat) {
    const win = getNationalWinRate(boat);
    const two = getNational2Rate(boat);
    const three = getNational3Rate(boat);

    let score = 35;

    score += win * 4.8;
    score += two * 0.32;
    score += three * 0.10;
    score += hasClassPower(boat) * 8;

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
  }

  function calcTurnIndex(boat) {
    const results = getThisTermResults(boat);
    const lap = getLapTime(boat);
    const cls = hasClassPower(boat);

    let score = 50 + cls * 15;

    if (results.length) {
      const avgRank = average(results, 3.5);
      score += (3.5 - avgRank) * 8;

      const top3 = results.filter((r) => r <= 3).length / results.length;
      score += top3 * 12;
    }

    if (lap > 0) {
      if (lap <= 37.2) score += 8;
      else if (lap <= 37.6) score += 5;
      else if (lap >= 38.5) score -= 6;
    }

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
  }

  function calcAttackIndex(boat, entries, venueFeature) {
    const boatNo = getBoatNo(boat);
    const stIndex = calcStIndex(boat, entries);
    const exIndex = calcExhibitionIndex(boat, entries);
    const clsPower = hasClassPower(boat);

    let score = 42;

    score += stIndex * 0.30;
    score += exIndex * 0.20;
    score += clsPower * 10;

    if (boatNo === 1) score += venueFeature.inPower * 0.12;
    if (boatNo === 2) score += venueFeature.sashi * 0.12;
    if (boatNo === 3) score += venueFeature.makuri * 0.13;
    if (boatNo === 4) score += venueFeature.kado * 0.15;
    if (boatNo === 5) score += venueFeature.makuriSashi * 0.12;
    if (boatNo === 6) score += venueFeature.outside * 0.12;

    if (boatNo >= 4 && stIndex >= 70) score += 7;
    if (boatNo >= 5 && exIndex >= 75) score += 5;

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
  }

  function calcRaceFlowIndex(boat, entries, venueFeature, data) {
  const boatNo = getBoatNo(boat);

  /* ===============================
    自艇の基本指数
  =============================== */

  const stIndex = calcStIndex(boat, entries);
  const exhibitionIndex = calcExhibitionIndex(boat, entries);
  const localIndex = calcLocalIndex(boat);
  const turnIndex = calcTurnIndex(boat);
  const attackIndex = calcAttackIndex(
    boat,
    entries,
    venueFeature
  );

    const weather = getWeather(data);

  const rawWind =
    weather?.windSpeed ??
    weather?.wind ??
    weather?.wind_velocity ??
    data?.windSpeed;

  const rawWave =
    weather?.waveHeight ??
    weather?.wave ??
    weather?.wave_height ??
    data?.waveHeight;

  const hasWindData = !isNil(rawWind);
  const hasWaveData = !isNil(rawWave);

  const wind = hasWindData
    ? toNumber(rawWind, 0)
    : null;

  const wave = hasWaveData
    ? toNumber(rawWave, 0)
    : null;

  function hasAverageStData(entry) {
    if (!entry) return false;

    const value =
      entry.averageSt ??
      entry.avgSt ??
      entry.st ??
      entry.startTiming ??
      entry.nationalSt;

    return !isNil(value) && toNumber(value, 0) > 0;
  }

  function hasExhibitionData(entry) {
    if (!entry) return false;

    const time =
      entry.exhibitionTime ??
      entry.tenjiTime ??
      entry.displayTime ??
      entry.exTime;

    const exhibitionSt =
      entry.exhibitionSt ??
      entry.tenjiSt ??
      entry.displaySt ??
      entry.startExhibition;

    const lap =
      entry.lapTime ??
      entry.oneLapTime ??
      entry.roundTime ??
      entry.turnTime;

    return (
      (!isNil(time) && toNumber(time, 0) > 0) ||
      (!isNil(exhibitionSt) && toNumber(exhibitionSt, 0) >= 0) ||
      (!isNil(lap) && toNumber(lap, 0) > 0)
    );
  }

  /* ===============================
    各コース艇を取得
  =============================== */

  const boat1 = entries.find(
    (entry) => getBoatNo(entry) === 1
  );

  const boat2 = entries.find(
    (entry) => getBoatNo(entry) === 2
  );

  const boat3 = entries.find(
    (entry) => getBoatNo(entry) === 3
  );

  const boat4 = entries.find(
    (entry) => getBoatNo(entry) === 4
  );

  const boat5 = entries.find(
    (entry) => getBoatNo(entry) === 5
  );

  const boat6 = entries.find(
    (entry) => getBoatNo(entry) === 6
  );

  /* ===============================
    各艇のST指数
  =============================== */

  const st1 = boat1
    ? calcStIndex(boat1, entries)
    : 50;

  const st2 = boat2
    ? calcStIndex(boat2, entries)
    : 50;

  const st3 = boat3
    ? calcStIndex(boat3, entries)
    : 50;

  const st4 = boat4
    ? calcStIndex(boat4, entries)
    : 50;

  const st5 = boat5
    ? calcStIndex(boat5, entries)
    : 50;

  const st6 = boat6
    ? calcStIndex(boat6, entries)
    : 50;

  /* ===============================
    各艇の展示指数
  =============================== */

  const ex1 = boat1
    ? calcExhibitionIndex(boat1, entries)
    : 50;

  const ex2 = boat2
    ? calcExhibitionIndex(boat2, entries)
    : 50;

  const ex3 = boat3
    ? calcExhibitionIndex(boat3, entries)
    : 50;

  const ex4 = boat4
    ? calcExhibitionIndex(boat4, entries)
    : 50;

  const ex5 = boat5
    ? calcExhibitionIndex(boat5, entries)
    : 50;

  const ex6 = boat6
    ? calcExhibitionIndex(boat6, entries)
    : 50;

  /* ===============================
    最初に基本展開点を作る
  =============================== */

  let score = 20;

  score += turnIndex * 0.16;
  score += localIndex * 0.12;
  score += stIndex * 0.14;
  score += exhibitionIndex * 0.13;
  score += attackIndex * 0.12;

  /* ===============================
    展開シナリオ判定

    数字単独ではなく、
    隣艇との比較で攻めを判断
  =============================== */

    const hasSt1 = hasAverageStData(boat1);
  const hasSt2 = hasAverageStData(boat2);
  const hasSt3 = hasAverageStData(boat3);
  const hasSt4 = hasAverageStData(boat4);
  const hasSt5 = hasAverageStData(boat5);
  const hasSt6 = hasAverageStData(boat6);

  const hasEx1 = hasExhibitionData(boat1);
  const hasEx2 = hasExhibitionData(boat2);
  const hasEx3 = hasExhibitionData(boat3);
  const hasEx4 = hasExhibitionData(boat4);
  const hasEx5 = hasExhibitionData(boat5);
  const hasEx6 = hasExhibitionData(boat6);

  const hasInnerComparison =
    (hasSt1 && hasSt2 && hasSt3) ||
    (hasEx1 && hasEx2 && hasEx3);

  /*
    1号艇は、明確な崩れ材料がない限り逃げ・残しを維持する。
    データ不足だけを理由に評価を落とさない。
  */
  const oneHasClearCollapse =
    (
      hasSt1 &&
      (
        (hasSt2 && st1 <= st2 - 12) ||
        (hasSt3 && st1 <= st3 - 14)
      )
    ) ||
    (
      hasEx1 &&
      (
        (hasEx2 && ex1 <= ex2 - 12) ||
        (hasEx3 && ex1 <= ex3 - 14)
      )
    );

  const oneCanEscape = !oneHasClearCollapse;

  /*
    2号艇は差し切りだけでなく、2・3着残しを常に残す。
    頭まで上げる時だけST・展示の裏付けを必要とする。
  */
  const twoCanSashi =
    (
      hasSt1 &&
      hasSt2 &&
      st2 >= 60 &&
      st2 >= st1 - 7
    ) ||
    (
      hasEx1 &&
      hasEx2 &&
      ex2 >= 60 &&
      ex2 >= ex1 - 6
    );

  /*
    3攻めは、STまたは展示の実データと2号艇比較が必要。
    データがない場合はコース傾向だけで攻めを断定しない。
  */
  const threeHasStAttack =
    hasSt2 &&
    hasSt3 &&
    st3 >= 66 &&
    st3 >= st2 + 4;

  const threeHasExAttack =
    hasEx2 &&
    hasEx3 &&
    ex3 >= 62 &&
    ex3 >= ex2 + 4;

  const threeCanAttack =
    hasInnerComparison &&
    (threeHasStAttack || threeHasExAttack) &&
    attackIndex >= 66;

  /*
    4カドも3号艇との実データ比較を必須にする。
  */
  const fourHasStAttack =
    hasSt3 &&
    hasSt4 &&
    st4 >= 67 &&
    st4 >= st3 + 4;

  const fourHasExAttack =
    hasEx3 &&
    hasEx4 &&
    ex4 >= 63 &&
    ex4 >= ex3 + 4;

  const fourCanAttack =
    (fourHasStAttack || fourHasExAttack) &&
    attackIndex >= 67;

  /*
    5号艇は3・4の攻めに乗れる時だけ展開を上げる。
    5自身にもSTまたは展示の実データが必要。
  */
  const fiveHasOwnEvidence =
    (hasSt5 && st5 >= 67) ||
    (hasEx5 && ex5 >= 64);

  const fiveCanMakuriSashi =
    fiveHasOwnEvidence &&
    (threeCanAttack || fourCanAttack);

  /*
    6号艇は頭評価ではなく、道中の2・3着拾い。
    実データと当地・道中の両方を必要とする。
  */
  const sixHasOwnEvidence =
    (hasSt6 && st6 >= 67) ||
    (hasEx6 && ex6 >= 67);

  const sixCanPickup =
    sixHasOwnEvidence &&
    localIndex >= 65 &&
    turnIndex >= 65;

  /* ===============================
    1号艇の逃げ・残し
  =============================== */

  if (oneCanEscape) {
    if (boatNo === 1) score += 16;
    if (boatNo === 2) score += 7;
    if (boatNo === 3) score += 4;
    if (boatNo === 4) score += 2;
    } else {
    if (boatNo === 1) {
      score -= oneHasClearCollapse ? 5 : 0;
    }

    if (boatNo === 2) score += 5;
    if (boatNo === 3) score += 5;
    if (boatNo === 4) score += 3;
  }

  /* ===============================
    2号艇の差し

    2コース差し・残しを切らない
  =============================== */

  if (twoCanSashi) {
    if (boatNo === 2) score += 12;
    if (boatNo === 1) score += 5;
    if (boatNo === 3) score += 3;
  } else {
    if (boatNo === 2) score += 3;
  }

  /* ===============================
    3号艇が攻める展開

    3が攻める
    →1・2が残る
    →4は攻め場が狭くなる
    →5にまくり差し場
  =============================== */

  if (threeCanAttack) {
    if (boatNo === 3) score += 13;
    if (boatNo === 1) score += 6;
    if (boatNo === 2) score += 5;
    if (boatNo === 4) score -= 5;
    if (boatNo === 5) score += 9;
    if (boatNo === 6) score += 3;
  }

  /* ===============================
    4号艇のカド攻め

    3が強く攻める時は、
    4の攻め場を下げる
  =============================== */

  if (fourCanAttack && !threeCanAttack) {
    if (boatNo === 4) score += 13;
    if (boatNo === 1) score += 5;
    if (boatNo === 2) score += 3;
    if (boatNo === 5) score += 8;
    if (boatNo === 6) score += 4;
  }

  if (fourCanAttack && threeCanAttack) {
    if (boatNo === 4) score += 2;
  }

  /* ===============================
    5号艇のまくり差し・展開拾い
  =============================== */

  if (fiveCanMakuriSashi) {
    if (boatNo === 5) score += 12;
    if (boatNo === 1) score += 4;
    if (boatNo === 3) score += 3;
    if (boatNo === 4) score += 2;
  } else if (boatNo === 5) {
    score -= 5;
  }

  /* ===============================
    6号艇の最内差し・道中拾い

    頭評価より、2・3着候補として加点
  =============================== */

  if (sixCanPickup) {
    if (boatNo === 6) score += 9;
  } else if (boatNo === 6) {
    score -= 7;
  }

  /* ===============================
    コース別の基本
  =============================== */

  if (boatNo === 1) {
    score += venueFeature.inPower * 0.16;
  }

  if (boatNo === 2) {
    score += venueFeature.sashi * 0.16;
    score += 5;
  }

  if (boatNo === 3) {
    score += venueFeature.makuri * 0.14;
  }

  if (boatNo === 4) {
    score += venueFeature.kado * 0.14;
    score += venueFeature.makuriSashi * 0.08;
  }

  if (boatNo === 5) {
    score += venueFeature.outside * 0.10;
    score += venueFeature.makuriSashi * 0.12;
  }

  if (boatNo === 6) {
    score += venueFeature.outside * 0.08;
  }

  /* ===============================
    荒水面補正
  =============================== */

  if (wind >= 5 || wave >= 5) {
    score += venueFeature.roughWater * 0.08;

    if (boatNo === 1) score -= 4;
    if (boatNo === 2) score += 2;
    if (boatNo === 4) score += 4;
    if (boatNo === 5) score += 5;
    if (boatNo === 6) score += 4;

    if (localIndex >= 70) score += 4;
    if (turnIndex >= 70) score += 4;
  }

  /* ===============================
    新型エンジン補正

    モーター数字ではなく、
    ST・展示・ターンを優先
  =============================== */

  if (isNewEngineMode(data)) {
    if (stIndex >= 72) score += 3;
    if (exhibitionIndex >= 72) score += 4;
    if (turnIndex >= 72) score += 3;
  }

  return clamp(
    round(score),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  );
}

  function calcTotalIndex(indexes, weights) {

  let total =
    indexes.st * weights.st +
    indexes.exhibition * weights.exhibition +
    indexes.motor * weights.motor +
    indexes.local * weights.local +
    indexes.national * weights.national +
    indexes.attack * weights.attack +
    indexes.raceFlow * weights.raceFlow +
    indexes.turn * weights.turn;

  // STが非常に良い
  if (indexes.st >= 90) total += 4;
  else if (indexes.st >= 80) total += 2;

  // 展示気配が良い
  if (indexes.exhibition >= 90) total += 4;
  else if (indexes.exhibition >= 80) total += 2;

  // 攻め指数
  if (indexes.attack >= 85) total += 3;

  // 展開指数
  if (indexes.raceFlow >= 85) total += 3;

  // 当地巧者
  if (indexes.local >= 85) total += 2;

  // モーターが極端に悪い
  if (indexes.motor <= 35) total -= 2;

  // STと展示が両方優秀なら相乗効果
  if (
    indexes.st >= 85 &&
    indexes.exhibition >= 85
  ) {
    total += 3;
  }

  return clamp(
    round(total),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  );
}
    /* ===============================
    スリットAI
  =============================== */

  function buildSlitAnalysis(entries, venueFeature) {

    const list = entries.map((boat) => {

      const boatNo = getBoatNo(boat);

      const avgSt = getAverageSt(boat);
      const exSt = getExhibitionSt(boat);

      const stIndex = calcStIndex(boat, entries);
      const attackIndex = calcAttackIndex(
        boat,
        entries,
        venueFeature
      );

      const slitScore =
        (100 - avgSt * 100) * 0.45 +
        (100 - exSt * 100) * 0.35 +
        attackIndex * 0.20;

      return {
        boatNo,
        name: getPlayerName(boat),
        avgSt,
        exSt,
        stIndex,
        attackIndex,
        slitScore: round(slitScore)
      };

    });

    list.sort((a, b) => b.slitScore - a.slitScore);

    list.forEach((boat, index) => {
      boat.slitRank = index + 1;
    });

    const averageSt =
      average(list.map(v => v.avgSt), 0.18);

    list.forEach((boat) => {

      boat.slitDiff =
        round(averageSt - boat.avgSt, 3);

      boat.slitAlert =
        boat.slitDiff >= 0.10;

      boat.isAttackBoat =
        boat.slitRank <= 2;

      boat.isStableBoat =
        boat.stIndex >= 75;

      boat.slitComment =
        boat.slitAlert
          ? "スリットアラート"
          : "";

    });

    const attackBoat =
      list.find(v => v.slitRank === 1);

    const secondBoat =
      list.find(v => v.slitRank === 2);

    return {

      ranking: list,

      attackBoat:
        attackBoat
          ? attackBoat.boatNo
          : null,

      secondBoat:
        secondBoat
          ? secondBoat.boatNo
          : null

    };

  }

  /* ===============================
    ダブルタイム理論
  =============================== */

  function buildDoubleTime(entries) {

    const list = entries.map((boat) => {

      const exTime = getExhibitionTime(boat);
      const lapTime = getLapTime(boat);

      let total = 0;

      if (exTime > 0) total += exTime;
      if (lapTime > 0) total += lapTime;

      return {

        boatNo: getBoatNo(boat),

        name: getPlayerName(boat),

        exhibitionTime: exTime,

        lapTime,

        totalTime: round(total, 2)

      };

    });

    const exhibitionRanking =
      [...list]
      .filter(v => v.exhibitionTime > 0)
      .sort((a, b) => a.exhibitionTime - b.exhibitionTime);

    exhibitionRanking.forEach((v, i) => {
      v.exhibitionRank = i + 1;
    });

    const lapRanking =
      [...list]
      .filter(v => v.lapTime > 0)
      .sort((a, b) => a.lapTime - b.lapTime);

    lapRanking.forEach((v, i) => {
      v.lapRank = i + 1;
    });

    const totalRanking =
      [...list]
      .filter(v => v.totalTime > 0)
      .sort((a, b) => a.totalTime - b.totalTime);

    totalRanking.forEach((v, i) => {
      v.doubleRank = i + 1;
    });

    totalRanking.forEach((boat) => {

      boat.doubleAlert =
        boat.doubleRank <= 2;

      boat.comment =
        boat.doubleAlert
          ? "ダブルタイム注目"
          : "";

    });

    return {

      ranking: totalRanking,

      topBoat:
        totalRanking.length
          ? totalRanking[0].boatNo
          : null

    };

  }

  /* ===============================
    新サム理論
  =============================== */

  function buildNewSam(entries) {

    const list = entries.map((boat) => {

      const ex = getExhibitionTime(boat);
      const lap = getLapTime(boat);

      const sum =
        (ex > 0 ? ex : 0) +
        (lap > 0 ? lap : 0);

      return {

        boatNo: getBoatNo(boat),

        name: getPlayerName(boat),

        sum: round(sum, 2)

      };

    });

    const valid =
      list.filter(v => v.sum > 0);

    const avg =
      average(valid.map(v => v.sum));

    valid.forEach((boat) => {

      boat.diff =
        round(avg - boat.sum, 2);

      boat.samAlert =
        boat.diff >= 0.20;

    });

    valid.sort((a, b) => b.diff - a.diff);

    valid.forEach((boat, index) => {
      boat.rank = index + 1;
    });

    return {

      ranking: valid,

      average: round(avg, 2),

      topBoat:
        valid.length
          ? valid[0].boatNo
          : null

    };

  }

  /* ===============================
    合成オッズ
  =============================== */

  function calculateCombinedOdds(oddsList) {

    if (!Array.isArray(oddsList)) {
      return null;
    }

    const values =
      oddsList
        .map(v => toNumber(v))
        .filter(v => v > 0);

    if (!values.length) {
      return null;
    }

    let inverse = 0;

    values.forEach((odd) => {
      inverse += 1 / odd;
    });

    if (inverse <= 0) {
      return null;
    }

    return round(1 / inverse, 1);

  }
    /* ===============================
    艇別AI解析
  =============================== */

  function buildBoatAnalysis(boat, entries, data) {

    const venueFeature = getVenueFeature(data);
    const weights = getWeights(data);

    const indexes = {

      st: calcStIndex(boat, entries),

      exhibition: calcExhibitionIndex(
        boat,
        entries
      ),

      motor: calcMotorIndex(
        boat,
        data
      ),

      local: calcLocalIndex(boat),

      national: calcNationalIndex(boat),

      attack: calcAttackIndex(
        boat,
        entries,
        venueFeature
      ),

      raceFlow: calcRaceFlowIndex(
        boat,
        entries,
        venueFeature,
        data
      ),

      turn: calcTurnIndex(boat)

    };

    indexes.total =
      calcTotalIndex(indexes, weights);

    /* ===============================
  役割判定 Ver2
  - 攻め
  - 展開
  - 道中
  - 残し
  - 拾い
=============================== */

const boatNo = getBoatNo(boat);

const roleScores = {
  attack: clamp(
    round(
      indexes.attack * 0.42 +
      indexes.st * 0.30 +
      indexes.exhibition * 0.18 +
      indexes.raceFlow * 0.10
    ),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  ),

  flow: clamp(
    round(
      indexes.raceFlow * 0.42 +
      indexes.attack * 0.20 +
      indexes.turn * 0.18 +
      indexes.exhibition * 0.12 +
      indexes.local * 0.08
    ),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  ),

  road: clamp(
    round(
      indexes.turn * 0.42 +
      indexes.local * 0.23 +
      indexes.national * 0.18 +
      indexes.exhibition * 0.10 +
      indexes.motor * 0.07
    ),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  ),

  hold: clamp(
    round(
      indexes.raceFlow * 0.30 +
      indexes.turn * 0.25 +
      indexes.local * 0.18 +
      indexes.national * 0.15 +
      indexes.st * 0.12 +
      (boatNo === 1 ? 10 : 0) +
      (boatNo === 2 ? 7 : 0) +
      (boatNo === 4 ? 3 : 0)
    ),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  ),

  pickup: clamp(
    round(
      indexes.turn * 0.30 +
      indexes.raceFlow * 0.26 +
      indexes.local * 0.20 +
      indexes.exhibition * 0.12 +
      indexes.national * 0.12 +
      (boatNo >= 5 ? 7 : 0)
    ),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  )
};
/* ===============================
  展開優先・本命総合指数 Ver3

  評価順：
  1. 展開
  2. コース
  3. ST・スリット
  4. 展示・足
  5. 残し・拾い
  6. 当地・水面
  7. 選手実力
  8. モーター
=============================== */

const courseBaseIndex = {
  1: 92,
  2: 77,
  3: 70,
  4: 64,
  5: 50,
  6: 43
};

const courseIndex =
  courseBaseIndex[boatNo] || 50;

/*
  外枠が頭候補になるには、
  展開・攻めに加えてSTか展示の強い裏付けを必須にする。
*/
const hasOuterHeadEvidence =
  boatNo >= 5 &&
  indexes.raceFlow >= 80 &&
  roleScores.flow >= 78 &&
  roleScores.attack >= 74 &&
  (
    indexes.st >= 72 ||
    indexes.exhibition >= 72
  );

/*
  コース補正。
  1号艇は明確な崩れ根拠がある時だけ基礎点を下げる。
*/
let courseAdjustment = 0;

if (boatNo === 1) {
  courseAdjustment = 9;

  if (indexes.raceFlow <= 48) {
    courseAdjustment = 3;
  }
}

if (boatNo === 2) {
  courseAdjustment = 5;
}

if (boatNo === 3) {
  courseAdjustment = 2;
}

if (boatNo === 4) {
  courseAdjustment = 1;
}

if (boatNo === 5) {
  courseAdjustment =
    hasOuterHeadEvidence ? -2 : -9;
}

if (boatNo === 6) {
  courseAdjustment =
    hasOuterHeadEvidence ? -5 : -14;
}

/*
  本命総合指数。
  展開とコースを最優先にし、
  拾い評価は頭順位へ強く反映させない。
*/
indexes.total = clamp(
  round(
    indexes.raceFlow * 0.25 +
    courseIndex * 0.24 +
    roleScores.attack * 0.11 +
    indexes.st * 0.10 +
    indexes.exhibition * 0.09 +
    roleScores.hold * 0.08 +
    roleScores.pickup * 0.03 +
    indexes.local * 0.05 +
    indexes.turn * 0.025 +
    indexes.national * 0.02 +
    indexes.motor * 0.005 +
    courseAdjustment
  ),
  INDEX_LIMIT.min,
  INDEX_LIMIT.max
);

const roleRanking = [
  { key: "attack", label: "攻め艇🔥", score: roleScores.attack },
  { key: "flow", label: "展開艇🌊", score: roleScores.flow },
  { key: "road", label: "道中艇⚡", score: roleScores.road },
  { key: "hold", label: "残し艇🛟", score: roleScores.hold },
  { key: "pickup", label: "拾い艇🎯", score: roleScores.pickup }
].sort((a, b) => b.score - a.score);

const primaryRole = roleRanking[0];

const roleTags = [];

if (primaryRole && primaryRole.score >= 62) {
  roleTags.push(primaryRole.label);
}

roleRanking
  .slice(1)
  .filter((role) => role.score >= 75)
  .slice(0, 2)
  .forEach((role) => {
    roleTags.push(role.label);
  });

if (indexes.local >= 75) {
  roleTags.push("当地巧者🏠");
}

if (indexes.motor >= 75) {
  roleTags.push("機力上位🔧");
}

if (indexes.st >= 75) {
  roleTags.push("スタート巧者🚀");
}

if (indexes.exhibition >= 75) {
  roleTags.push("展示気配◎");
}

    /* ===============================
       バフ
    =============================== */

    const buffs = [];
    const debuffs = [];
    
    if (indexes.st >= 75)
      buffs.push("平均ST優秀");

    if (indexes.exhibition >= 75)
      buffs.push("展示気配良好");

    if (indexes.motor >= 75)
      buffs.push("モーター上位");

    if (indexes.local >= 75)
      buffs.push("当地実績");

    if (indexes.national >= 75)
      buffs.push("全国実績");

    if (indexes.attack >= 75)
      buffs.push("攻撃力あり");

    if (indexes.turn >= 75)
      buffs.push("道中安定");

    /* ===============================
       デバフ
    =============================== */

    if (indexes.st <= 45)
      debuffs.push("ST不安");

    if (indexes.exhibition <= 45)
      debuffs.push("展示弱い");

    if (indexes.motor <= 45)
      debuffs.push("機力不足");

    if (indexes.local <= 45)
      debuffs.push("当地実績不足");

    if (indexes.attack <= 45)
      debuffs.push("攻め不足");

    if (indexes.turn <= 45)
      debuffs.push("道中不安");

    /* ===============================
       AIコメント
    =============================== */

    let comment = "";

    if (indexes.total >= 85) {

      comment =
        "総合評価トップ級。本命候補。";

    } else if (indexes.total >= 78) {

      comment =
        "連対期待大。軸候補。";

    } else if (indexes.total >= 70) {

      comment =
        "展開次第で頭まで。";

    } else if (indexes.total >= 60) {

      comment =
        "相手・3着候補。";

    } else {

      comment =
        "厳しい条件だが穴なら注意。";

    }

    if (
      isNewEngineMode(data) &&
      indexes.exhibition >= indexes.motor
    ) {

      comment +=
        " 新型エンジン期のため展示重視。";

    }

    return {

      boatNo: getBoatNo(boat),

      playerName: getPlayerName(boat),

      className: getClassName(boat),

      indexes,

roleScores,

primaryRole: primaryRole
  ? {
      key: primaryRole.key,
      label: primaryRole.label,
      score: primaryRole.score
    }
  : null,

roleRanking,

roleTags,

buffs,

debuffs,

aiComment: comment

    };

  }

  /* ===============================
    全艇AI解析
  =============================== */

  function buildBoatAnalyses(data) {
  const entries = getRaceEntries(data);

  const analyses = entries
    .map((boat) =>
      buildBoatAnalysis(
        boat,
        entries,
        data
      )
    )
    .filter(Boolean);

  /* ===============================
    各指数ランキング
  =============================== */

  function setRanking(rankKey, getScore) {
    [...analyses]
      .sort((a, b) => {
        const scoreA = Number(getScore(a) || 0);
        const scoreB = Number(getScore(b) || 0);

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        return Number(a.boatNo || 0) - Number(b.boatNo || 0);
      })
      .forEach((boat, index) => {
        boat[rankKey] = index + 1;
      });
  }

  setRanking(
    "totalRank",
    (boat) => boat.indexes?.total
  );

  setRanking(
    "attackRank",
    (boat) => boat.roleScores?.attack
  );

  setRanking(
    "flowRank",
    (boat) => boat.roleScores?.flow
  );

  setRanking(
    "roadRank",
    (boat) => boat.roleScores?.road
  );

  setRanking(
    "holdRank",
    (boat) => boat.roleScores?.hold
  );

  setRanking(
    "pickupRank",
    (boat) => boat.roleScores?.pickup
  );

  /* ===============================
    最終AI順位
  =============================== */

  analyses.sort((a, b) => {
    const totalA = Number(a.indexes?.total || 0);
    const totalB = Number(b.indexes?.total || 0);

    if (totalB !== totalA) {
      return totalB - totalA;
    }

    const attackA = Number(a.roleScores?.attack || 0);
    const attackB = Number(b.roleScores?.attack || 0);

    if (attackB !== attackA) {
      return attackB - attackA;
    }

    return Number(a.boatNo || 0) - Number(b.boatNo || 0);
  });

  analyses.forEach((boat, index) => {
    boat.aiRank = index + 1;

    boat.roleRanks = {
      attack: boat.attackRank || 0,
      flow: boat.flowRank || 0,
      road: boat.roadRank || 0,
      hold: boat.holdRank || 0,
      pickup: boat.pickupRank || 0
    };

    boat.isTopAttack = boat.attackRank === 1;
    boat.isTopFlow = boat.flowRank === 1;
    boat.isTopRoad = boat.roadRank === 1;
    boat.isTopHold = boat.holdRank === 1;
    boat.isTopPickup = boat.pickupRank === 1;
  });

  return analyses;
}

/* ===============================
  レース全体・展開シナリオ生成

  順位や買い目は作らない。
  6艇の関係から展開と着順候補を作る。
=============================== */

function buildRaceScenarios(analyses, data) {
  const list = Array.isArray(analyses)
    ? [...analyses]
    : [];

  const entries = getRaceEntries(data);
  const venue = getVenueFeature(data);

  const byBoat = {};

  list.forEach((boat) => {
    const no = Number(boat?.boatNo || 0);

    if (no >= 1 && no <= 6) {
      byBoat[no] = boat;
    }
  });

  function getAnalysis(no) {
    return byBoat[Number(no)] || null;
  }

  function getEntry(no) {
    return entries.find(
      (entry) => getBoatNo(entry) === Number(no)
    ) || null;
  }

  function total(no) {
    return toNumber(
      getAnalysis(no)?.indexes?.total,
      0
    );
  }

  function st(no) {
    return toNumber(
      getAnalysis(no)?.indexes?.st,
      50
    );
  }

  function exhibition(no) {
    return toNumber(
      getAnalysis(no)?.indexes?.exhibition,
      50
    );
  }

  function flow(no) {
    return toNumber(
      getAnalysis(no)?.indexes?.raceFlow,
      50
    );
  }

  function attack(no) {
    return toNumber(
      getAnalysis(no)?.roleScores?.attack,
      50
    );
  }

  function hold(no) {
    return toNumber(
      getAnalysis(no)?.roleScores?.hold,
      50
    );
  }

  function pickup(no) {
    return toNumber(
      getAnalysis(no)?.roleScores?.pickup,
      50
    );
  }

  function road(no) {
    return toNumber(
      getAnalysis(no)?.roleScores?.road,
      50
    );
  }

  function hasAverageSt(no) {
    const entry = getEntry(no);

    if (!entry) return false;

    const value =
      entry.averageSt ??
      entry.averageST ??
      entry.avgSt ??
      entry.avgST ??
      entry.st ??
      entry.startTiming ??
      entry.nationalSt;

    return (
      !isNil(value) &&
      toNumber(value, 0) > 0
    );
  }

  function hasExhibition(no) {
    const entry = getEntry(no);

    if (!entry) return false;

    const time =
      entry.exhibitionTime ??
      entry.tenjiTime ??
      entry.displayTime ??
      entry.exTime;

    const exhibitionSt =
      entry.exhibitionSt ??
      entry.exhibitionST ??
      entry.tenjiSt ??
      entry.tenjiST ??
      entry.displaySt ??
      entry.displayST;

    const lap =
      entry.lapTime ??
      entry.oneLapTime ??
      entry.roundTime ??
      entry.turnTime;

    return (
      (!isNil(time) && toNumber(time, 0) > 0) ||
      (!isNil(exhibitionSt) &&
        toNumber(exhibitionSt, -1) >= 0) ||
      (!isNil(lap) && toNumber(lap, 0) > 0)
    );
  }

  function hasComparison(leftNo, rightNo) {
    return (
      (
        hasAverageSt(leftNo) &&
        hasAverageSt(rightNo)
      ) ||
      (
        hasExhibition(leftNo) &&
        hasExhibition(rightNo)
      )
    );
  }

  function relationEdge(targetNo, opponentNo) {
    let edge = 0;
    let evidenceCount = 0;

    if (
      hasAverageSt(targetNo) &&
      hasAverageSt(opponentNo)
    ) {
      edge += st(targetNo) - st(opponentNo);
      evidenceCount += 1;
    }

    if (
      hasExhibition(targetNo) &&
      hasExhibition(opponentNo)
    ) {
      edge +=
        exhibition(targetNo) -
        exhibition(opponentNo);

      evidenceCount += 1;
    }

    return evidenceCount
      ? edge / evidenceCount
      : 0;
  }

  /*
    展開成立度
  */

  let escapeScore =
    venue.inPower * 0.30 +
    flow(1) * 0.28 +
    hold(1) * 0.22 +
    st(1) * 0.12 +
    exhibition(1) * 0.08;

  const twoVsOne =
    relationEdge(2, 1);

  const threeVsTwo =
    relationEdge(3, 2);

  const fourVsThree =
    relationEdge(4, 3);

  const innerThreat =
    Math.max(
      relationEdge(2, 1),
      relationEdge(3, 1)
    );

  if (
    hasComparison(1, 2) ||
    hasComparison(1, 3)
  ) {
    if (innerThreat >= 10) {
  escapeScore -= 8;
} else if (innerThreat >= 6) {
  escapeScore -= 5;
} else {
  escapeScore += 3;
}
  }

  let sashiScore =
    venue.sashi * 0.25 +
    flow(2) * 0.25 +
    hold(2) * 0.20 +
    attack(2) * 0.15 +
    road(2) * 0.10 +
    total(2) * 0.05;

  if (hasComparison(2, 1)) {
    if (twoVsOne >= 8) {
  sashiScore += 8;
} else if (twoVsOne >= 4) {
  sashiScore += 4;
} else if (twoVsOne <= -8) {
  sashiScore -= 6;
}
  }

  let threeAttackScore =
  venue.makuri * 0.20 +
  flow(3) * 0.30 +
  attack(3) * 0.25 +
  st(3) * 0.12 +
  exhibition(3) * 0.08 +
  total(3) * 0.05;

const threeVsOne =
  relationEdge(3, 1);

/*
  3攻めの入口は、まず2号艇との比較で判定する。
*/
if (hasComparison(3, 2)) {
  if (threeVsTwo >= 10) {
    threeAttackScore += 18;
  } else if (threeVsTwo >= 6) {
    threeAttackScore += 11;
  } else if (threeVsTwo <= -8) {
    threeAttackScore -= 12;
  }
} else {
  /*
    2号艇との比較データがない時は、
    3攻めを強く断定しない。
  */
  threeAttackScore -= 15;
}

/*
  3が2より速くても、1が3より明確に速い場合は
  1号艇を潰す攻めにはなりにくい。

  3対2だけで3攻めを最有力にしない。
*/
if (hasComparison(3, 1)) {
  if (threeVsOne <= -10) {
    threeAttackScore -= 14;
  } else if (threeVsOne <= -6) {
    threeAttackScore -= 9;
  } else if (threeVsOne >= 6) {
    threeAttackScore += 4;
  }
}

  let fourAttackScore =
    venue.kado * 0.22 +
    flow(4) * 0.28 +
    attack(4) * 0.25 +
    st(4) * 0.12 +
    exhibition(4) * 0.08 +
    total(4) * 0.05;

  if (hasComparison(4, 3)) {
    if (fourVsThree >= 10) {
      fourAttackScore += 18;
    } else if (fourVsThree >= 6) {
      fourAttackScore += 11;
    } else if (fourVsThree <= -8) {
      fourAttackScore -= 12;
    }
  } else {
    /*
      3との比較がない時はカド攻めを断定しない。
    */
    fourAttackScore -= 15;
  }

  /*
    3が攻める場合は4の攻め場を狭くする。
  */
  if (threeAttackScore >= 72) {
    fourAttackScore -= 12;
  }

  escapeScore = clamp(
    round(escapeScore),
    1,
    100
  );

  sashiScore = clamp(
    round(sashiScore),
    1,
    100
  );

  threeAttackScore = clamp(
    round(threeAttackScore),
    1,
    100
  );

  fourAttackScore = clamp(
    round(fourAttackScore),
    1,
    100
  );

  /*
    シナリオ内の着順適性を計算する。
    固定買い目は作らない。
  */

  function buildOutcome(type) {
    const outcome = list.map((boat) => {
      const no = Number(boat.boatNo);

      let firstScore =
        total(no) * 0.30 +
        flow(no) * 0.30 +
        attack(no) * 0.25 +
        st(no) * 0.10 +
        exhibition(no) * 0.05;

      let secondScore =
        hold(no) * 0.32 +
        flow(no) * 0.25 +
        total(no) * 0.18 +
        road(no) * 0.15 +
        attack(no) * 0.10;

      let thirdScore =
        pickup(no) * 0.32 +
        road(no) * 0.27 +
        hold(no) * 0.18 +
        flow(no) * 0.13 +
        total(no) * 0.10;

      const reasons = [];

      if (type === "escape") {
        if (no === 1) {
          firstScore += 20;
          secondScore += 10;
          reasons.push("イン逃げ・残し");
        }

        if (no === 2) {
  secondScore += 10;
  thirdScore += 7;
  reasons.push("2コース差し残り");
}

        if (no === 3) {
          secondScore += 6;
          thirdScore += 6;
          reasons.push("センター追走");
        }

        if (no === 4) {
          thirdScore += 4;
          reasons.push("4コース残し");
        }
      }

      if (type === "sashi") {
        if (no === 2) {
  firstScore += 12;
  secondScore += 10;
  reasons.push("2コース差し");
}

        if (no === 1) {
          secondScore += 14;
          thirdScore += 8;
          reasons.push("イン残し");
        }

        if (no === 3) {
          secondScore += 6;
          thirdScore += 7;
          reasons.push("差し展開の外側追走");
        }
      }

      if (type === "threeAttack") {
        if (no === 3) {
          firstScore += 18;
          secondScore += 8;
          reasons.push("3コース攻め");
        }

        if (no === 1) {
          secondScore += 12;
          thirdScore += 8;
          reasons.push("3攻め時のイン残し");
        }

        if (no === 2) {
          secondScore += 9;
          thirdScore += 9;
          reasons.push("差し・内残し");
        }

        if (no === 4) {
          firstScore -= 12;
          secondScore -= 7;
          reasons.push("3攻めで攻め場減少");
        }

        if (no === 5) {
          secondScore += 9;
          thirdScore += 13;
          reasons.push("3攻めに乗るまくり差し");
        }

        if (no === 6) {
          thirdScore += 6;
          reasons.push("最内差し・道中拾い");
        }
      }

      if (type === "fourAttack") {
        if (no === 4) {
          firstScore += 18;
          secondScore += 8;
          reasons.push("4カド攻め");
        }

        if (no === 1) {
          secondScore += 10;
          thirdScore += 8;
          reasons.push("カド攻め時のイン残し");
        }

        if (no === 2) {
          thirdScore += 7;
          reasons.push("差し残り");
        }

        if (no === 5) {
          secondScore += 12;
          thirdScore += 13;
          reasons.push("カド攻めに乗るまくり差し");
        }

        if (no === 6) {
          secondScore += 5;
          thirdScore += 10;
          reasons.push("最内差し・展開拾い");
        }
      }

      return {
        boatNo: no,
        playerName: boat.playerName,

        firstScore: clamp(
          round(firstScore),
          1,
          100
        ),

        secondScore: clamp(
          round(secondScore),
          1,
          100
        ),

        thirdScore: clamp(
          round(thirdScore),
          1,
          100
        ),

        reasons
      };
    });

    return {
      firstCandidates: [...outcome]
        .sort((a, b) =>
          b.firstScore - a.firstScore
        )
        .slice(0, 3),

      secondCandidates: [...outcome]
        .sort((a, b) =>
          b.secondScore - a.secondScore
        )
        .slice(0, 4),

      thirdCandidates: [...outcome]
        .sort((a, b) =>
          b.thirdScore - a.thirdScore
        )
        .slice(0, 5),

      boats: outcome
    };
  }

  const scenarios = [
    {
      type: "escape",
      label: "1号艇逃げ",
      score: escapeScore,
      attacker: 1,
      blockedBoats: [],
      outcome: buildOutcome("escape")
    },
    {
      type: "sashi",
      label: "2コース差し",
      score: sashiScore,
      attacker: 2,
      blockedBoats: [],
      outcome: buildOutcome("sashi")
    },
    {
      type: "threeAttack",
      label: "3コース攻め",
      score: threeAttackScore,
      attacker: 3,
      blockedBoats:
        threeAttackScore >= 72
          ? [4]
          : [],
      outcome: buildOutcome("threeAttack")
    },
    {
      type: "fourAttack",
      label: "4カド攻め",
      score: fourAttackScore,
      attacker: 4,
      blockedBoats: [],
      outcome: buildOutcome("fourAttack")
    }
  ].sort((a, b) => b.score - a.score);

  scenarios.forEach((scenario, index) => {
    scenario.rank = index + 1;
  });

  const mainScenario = scenarios[0] || null;
  const subScenario = scenarios[1] || null;

  /*
    Phase2の役割判定。

    ここでは印や買い目へ接続せず、既に計算済みの役割点と
    最有力シナリオから「誰がどの役割か」だけを固定形式で返す。
  */
  function rankedBoatNumbers(scoreGetter, options = {}) {
    const {
      exclude = [],
      limit = 3,
      minimum = 0
    } = options;

    const excluded = new Set(
      exclude.map((no) => Number(no))
    );

    return [...list]
      .filter((boat) => {
        const no = Number(boat?.boatNo || 0);
        return no >= 1 && no <= 6 && !excluded.has(no);
      })
      .map((boat) => ({
        boatNo: Number(boat.boatNo),
        score: toNumber(scoreGetter(boat), 0)
      }))
      .filter((boat) => boat.score >= minimum)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.boatNo - b.boatNo;
      })
      .slice(0, limit)
      .map((boat) => boat.boatNo);
  }

  const attacker = Number(mainScenario?.attacker || 0) || null;

  const wallBoat = attacker
    ? (
        attacker >= 2
          ? attacker - 1
          : rankedBoatNumbers(
              (boat) => boat?.roleScores?.hold,
              { exclude: [attacker], limit: 1 }
            )[0] || null
      )
    : null;

  const remainers = rankedBoatNumbers(
    (boat) => boat?.roleScores?.hold,
    { limit: 3 }
  );

  const followers = rankedBoatNumbers(
    (boat) => boat?.roleScores?.flow,
    { exclude: attacker ? [attacker] : [], limit: 3 }
  );

  const pickupCandidates = rankedBoatNumbers(
    (boat) => boat?.roleScores?.pickup,
    { limit: 3 }
  );

  const roadRaceBoats = rankedBoatNumbers(
    (boat) => boat?.roleScores?.road,
    { limit: 3 }
  );

  const localExperts = rankedBoatNumbers(
    (boat) => boat?.indexes?.local,
    { limit: 3, minimum: 75 }
  );

  const blockedBoats = Array.isArray(mainScenario?.blockedBoats)
    ? [...mainScenario.blockedBoats]
    : [];

  const mainGap = Math.max(
    0,
    toNumber(mainScenario?.score, 0) -
      toNumber(subScenario?.score, 0)
  );

  const confidence = toNumber(mainScenario?.score, 0);

  const evidence = {
    scenario: mainScenario?.label || "",
    score: confidence,
    mainGap: round(mainGap),
    relations: {
      twoVsOne: round(twoVsOne),
      threeVsTwo: round(threeVsTwo),
      fourVsThree: round(fourVsThree)
    },
    firstCandidates:
      mainScenario?.outcome?.firstCandidates
        ?.map((boat) => boat.boatNo) || [],
    secondCandidates:
      mainScenario?.outcome?.secondCandidates
        ?.map((boat) => boat.boatNo) || [],
    thirdCandidates:
      mainScenario?.outcome?.thirdCandidates
        ?.map((boat) => boat.boatNo) || []
  };

  const dataStatus = {
    hasSt:
      [1, 2, 3, 4, 5, 6]
        .some(hasAverageSt),

    hasExhibition:
      [1, 2, 3, 4, 5, 6]
        .some(hasExhibition),

    beforeCount:
      Array.isArray(data?.beforeInfo)
        ? data.beforeInfo.length
        : 0,

    rawBeforeCount:
      Array.isArray(data?.raw?.beforeInfo)
        ? data.raw.beforeInfo.length
        : 0,

    startCount:
      Array.isArray(data?.startExhibition)
        ? data.startExhibition.length
        : 0,

    rawStartCount:
      Array.isArray(data?.raw?.startExhibition)
        ? data.raw.startExhibition.length
        : 0,

    mergedExhibition:
      entries.map((entry) => ({
        boatNo: getBoatNo(entry),

        time:
          entry.exhibitionTime ??
          entry.tenjiTime ??
          entry.displayTime ??
          null,

        st:
          entry.exhibitionSt ??
          entry.exhibitionST ??
          entry.tenjiSt ??
          entry.displaySt ??
          entry.displayST ??
          null
      }))
  };

  return {
    mainScenario,

    subScenario,

    scenarios,

    attacker,

    wallBoat,

    remainers,

    followers,

    pickupCandidates,

    roadRaceBoats,

    localExperts,

    blockedBoats,

    confidence,

    evidence,

    relations: {
      twoVsOne: round(twoVsOne),
      threeVsTwo: round(threeVsTwo),
      fourVsThree: round(fourVsThree)
    },

    dataStatus
  };
}
/* ===============================
  レース一覧用・本命／万舟展開期待度

  実際の的中確率ではなく、最終AI Coreの成立展開を
  0〜100へ要約した一覧比較用のAI評価。
  買い目・オッズ・保存処理には使用しない。
=============================== */

function buildRaceTrendEvaluation(data) {
  const entries = getRaceEntries(data);

  const hasAverageSt = (entry) => {
    const value =
      entry?.averageSt ??
      entry?.averageST ??
      entry?.avgSt ??
      entry?.avgST ??
      entry?.st ??
      entry?.startTiming ??
      entry?.nationalSt;

    return !isNil(value) && toNumber(value, 0) > 0;
  };

  const hasExhibition = (entry) => {
    const time =
      entry?.exhibitionTime ??
      entry?.tenjiTime ??
      entry?.displayTime ??
      entry?.exTime;

    const st =
      entry?.exhibitionSt ??
      entry?.exhibitionST ??
      entry?.tenjiSt ??
      entry?.tenjiST ??
      entry?.displaySt ??
      entry?.displayST;

    const lap =
      entry?.lapTime ??
      entry?.oneLapTime ??
      entry?.roundTime ??
      entry?.turnTime;

    return (
      (!isNil(time) && toNumber(time, 0) > 0) ||
      (!isNil(st) && toNumber(st, -1) >= 0) ||
      (!isNil(lap) && toNumber(lap, 0) > 0)
    );
  };

  const entryCount = new Set(
    entries
      .map((entry) => getBoatNo(entry))
      .filter((no) => no >= 1 && no <= 6)
  ).size;

  const stCount = entries.filter(hasAverageSt).length;
  const exhibitionCount = entries.filter(hasExhibition).length;

  const dataStatus = {
    stage: exhibitionCount >= 4 ? "final" : "provisional",
    label: exhibitionCount >= 4
      ? "展示反映済み"
      : "展示前・暫定",
    completeness: clamp(
      round(
        Math.min(entryCount, 6) / 6 * 40 +
        Math.min(stCount, 6) / 6 * 30 +
        Math.min(exhibitionCount, 6) / 6 * 30
      ),
      0,
      100
    ),
    entryCount,
    stCount,
    exhibitionCount
  };

  const makePending = (reasons) => ({
    ready: false,
    raceNo: getRaceNo(data),
    venue: getVenueFeature(data).name,
    honmei: {
      score: null,
      level: "準備中",
      reasons
    },
    manshu: {
      score: null,
      level: "準備中",
      reasons
    },
    dataStatus: {
      ...dataStatus,
      stage: "insufficient",
      label: "判定準備中"
    },
    evidence: null
  });

  if (entryCount < 6 || stCount < 4) {
    const reasons = [];

    if (entryCount < 6) {
      reasons.push(`出走データ${entryCount}/6艇`);
    }

    if (stCount < 4) {
      reasons.push(`STデータ${stCount}/6艇`);
    }

    return makePending(reasons);
  }

  const analyses = buildBoatAnalyses(data);

  if (analyses.length < 6) {
    return makePending([
      `AI分析データ${analyses.length}/6艇`
    ]);
  }

  const raceScenarios = buildRaceScenarios(analyses, data);
  const scenarioByType = Object.fromEntries(
    raceScenarios.scenarios.map((scenario) => [
      scenario.type,
      scenario
    ])
  );

  const escape = scenarioByType.escape;
  const sashi = scenarioByType.sashi;
  const threeAttack = scenarioByType.threeAttack;
  const fourAttack = scenarioByType.fourAttack;

  const scoreOf = (scenario) =>
    toNumber(scenario?.score, 0);

  const innerScenario =
    scoreOf(escape) >= scoreOf(sashi)
      ? escape
      : sashi;

  const attackScenario =
    scoreOf(threeAttack) >= scoreOf(fourAttack)
      ? threeAttack
      : fourAttack;

  if (!innerScenario || !attackScenario) {
    return makePending(["成立展開データ不足"]);
  }

  const mainScenario = raceScenarios.mainScenario;
  const subScenario = raceScenarios.subScenario;
  const mainGap = Math.max(
    0,
    scoreOf(mainScenario) - scoreOf(subScenario)
  );
  const innerEdge =
    scoreOf(innerScenario) - scoreOf(attackScenario);

  const byBoat = Object.fromEntries(
    analyses.map((boat) => [
      Number(boat.boatNo),
      boat
    ])
  );

  const roleScore = (boatNo, role) =>
    toNumber(byBoat[boatNo]?.roleScores?.[role], 0);

  const outcomeScore = (scenario, boatNos, key) => {
    const boats = Array.isArray(scenario?.outcome?.boats)
      ? scenario.outcome.boats
      : [];

    return Math.max(
      0,
      ...boatNos.map((boatNo) => {
        const boat = boats.find(
          (item) => Number(item?.boatNo) === boatNo
        );

        return toNumber(boat?.[key], 0);
      })
    );
  };

  const holdCandidates = [1, 2, 4]
    .map((boatNo) => ({
      boatNo,
      score: roleScore(boatNo, "hold")
    }))
    .sort((a, b) => b.score - a.score);

  const pickupCandidates = [5, 6]
    .map((boatNo) => ({
      boatNo,
      score: roleScore(boatNo, "pickup")
    }))
    .sort((a, b) => b.score - a.score);

  const innerHead = outcomeScore(
    innerScenario,
    [1, 2],
    "firstScore"
  );
  const innerHold =
    holdCandidates[0].score * 0.65 +
    holdCandidates[1].score * 0.35;
  const outerHead = outcomeScore(
    attackScenario,
    [3, 4, 5, 6],
    "firstScore"
  );
  const outerPickup = pickupCandidates[0].score;

  const innerEdgeScore = clamp(
    50 + innerEdge * 2.2,
    10,
    95
  );
  const attackEdgeScore = clamp(
    50 - innerEdge * 2.2,
    10,
    95
  );
  const volatility = clamp(
    78 - mainGap * 3,
    20,
    90
  );
  const attackRelation = Math.max(
    0,
    toNumber(raceScenarios.relations?.threeVsTwo, 0),
    toNumber(raceScenarios.relations?.fourVsThree, 0)
  );
  const innerResistance =
    scoreOf(escape) * 0.70 +
    roleScore(1, "hold") * 0.20 +
    roleScore(2, "hold") * 0.10;
  const innerCollapse = clamp(
    100 - innerResistance + attackRelation,
    5,
    95
  );

    /*
    一覧比較専用指数。

    本命：
    1号艇がイン逃げできる構成か。

    万舟：
    3〜6号艇の人気になりにくい艇に、
    現実的な攻め・拾い展開があるか。

    判定順：
    1. 選手の実力構成
    2. 各艇の展開
    3. 場の特性

    買い目作成・削除・自動絞り込みには使用しない。
  */
  const venueFeature = getVenueFeature(data);

  const classNameOf = (boatNo) =>
    safeText(
      getClassName(byBoat[boatNo]),
      "級別不明"
    ).toUpperCase();

  const classAbilityOf = (boatNo) => {
    const className = classNameOf(boatNo);

    if (className.includes("A1")) return 100;
    if (className.includes("A2")) return 78;
    if (className.includes("B1")) return 52;
    if (className.includes("B2")) return 30;

    return 50;
  };

  /*
    万舟構成では、外側のA1・A2は
    実力上位として予想されやすいため評価を抑える。
  */
  const longshotClassOf = (boatNo) => {
    const className = classNameOf(boatNo);

    if (className.includes("A1")) return 12;
    if (className.includes("A2")) return 28;
    if (className.includes("B1")) return 70;
    if (className.includes("B2")) return 85;

    return 50;
  };

  const isStrongClass = (boatNo) => {
    const className = classNameOf(boatNo);

    return (
      className.includes("A1") ||
      className.includes("A2")
    );
  };

  const indexScore = (boatNo, key) =>
    toNumber(byBoat[boatNo]?.indexes?.[key], 0);

  /*
    数字が簡単に高くならないようにする。
    通常構成は20〜40台、
    根拠が揃った場合だけ50以上とする。
  */
  const strictScore = (rawScore) =>
    clamp(
      round((rawScore - 40) * 1.35),
      5,
      85
    );

  /* ===============================
    本命＝1号艇のイン逃げ
  =============================== */

  const courseThreatRate = {
    2: 0.95,
    3: 0.90,
    4: 0.85,
    5: 0.72,
    6: 0.65
  };

  const challengerCandidates = [2, 3, 4, 5, 6]
    .map((boatNo) => ({
      boatNo,
      className: classNameOf(boatNo),
      classAbility: classAbilityOf(boatNo),
      effectiveAbility:
        classAbilityOf(boatNo) *
        courseThreatRate[boatNo]
    }))
    .sort(
      (a, b) =>
        b.effectiveAbility -
        a.effectiveAbility
    );

  const strongestChallenger =
    challengerCandidates[0];

  const boat1ClassAbility =
    classAbilityOf(1);

  const escapeSkillControl = clamp(
    boat1ClassAbility * 0.65 +
    (
      100 -
      strongestChallenger.effectiveAbility
    ) * 0.35,
    0,
    100
  );

  const escapeScenarioScore =
    scoreOf(escape);

  const strongestOpposingScenarioScore =
    Math.max(
      scoreOf(sashi),
      scoreOf(threeAttack),
      scoreOf(fourAttack)
    );

  const strictEscapeEdge =
    escapeScenarioScore -
    strongestOpposingScenarioScore;

  const escapeScenarioControl = clamp(
    escapeScenarioScore +
    strictEscapeEdge * 1.5,
    0,
    100
  );

  const boat1Hold =
    roleScore(1, "hold");

  const boat1Flow = Math.max(
    roleScore(1, "flow"),
    indexScore(1, "raceFlow")
  );

  const oneEscapeFlow = clamp(
    escapeScenarioControl * 0.65 +
    boat1Hold * 0.20 +
    boat1Flow * 0.15,
    0,
    100
  );

  const honmeiRaw =
    escapeSkillControl * 0.50 +
    oneEscapeFlow * 0.35 +
    toNumber(venueFeature.inPower, 65) * 0.15;

  const honmeiScore =
    strictScore(honmeiRaw);

  /* ===============================
    万舟＝外側からの波乱
  =============================== */

  const outerScenarioScore = Math.max(
    scoreOf(threeAttack),
    scoreOf(fourAttack)
  );

  const outerScenarioPressure = clamp(
    50 +
    (
      outerScenarioScore -
      escapeScenarioScore
    ) * 2,
    0,
    100
  );

  const venueScoreForBoat = (boatNo) => {
    if (boatNo === 3) {
      return average([
        venueFeature.makuri,
        venueFeature.makuriSashi
      ], 55);
    }

    if (boatNo === 4) {
      return toNumber(
        venueFeature.kado,
        55
      );
    }

    return toNumber(
      venueFeature.outside,
      50
    );
  };

  const outerCandidates = [3, 4, 5, 6]
    .map((boatNo) => {
      const attack = roleScore(
        boatNo,
        "attack"
      );

      const flow = Math.max(
        roleScore(boatNo, "flow"),
        indexScore(boatNo, "raceFlow")
      );

      const pickup = roleScore(
        boatNo,
        "pickup"
      );

      let courseFlow = 0;
      let roleLabel = "展開拾い";

      if (boatNo === 3) {
        courseFlow =
          attack * 0.55 +
          flow * 0.35 +
          pickup * 0.10;

        roleLabel = "3コース攻め";
      } else if (boatNo === 4) {
        courseFlow =
          attack * 0.50 +
          flow * 0.30 +
          pickup * 0.20;

        roleLabel = "4カド攻め";
      } else {
        courseFlow =
          attack * 0.25 +
          flow * 0.30 +
          pickup * 0.45;

        roleLabel =
          `${boatNo}号艇の展開拾い`;
      }

      const flowEvidence = clamp(
        courseFlow * 0.70 +
        outerScenarioPressure * 0.30,
        0,
        100
      );

      const classLongshot =
        longshotClassOf(boatNo);

      const venueScore =
        venueScoreForBoat(boatNo);

      const rawScore =
        classLongshot * 0.50 +
        flowEvidence * 0.35 +
        venueScore * 0.15;

      return {
        boatNo,
        className: classNameOf(boatNo),
        roleLabel,
        classLongshot,
        flowEvidence,
        venueScore,
        rawScore
      };
    })
    .sort(
      (a, b) =>
        b.rawScore -
        a.rawScore
    );

  const bestOuter =
    outerCandidates[0];

  const strongOuterCount = [3, 4, 5, 6]
    .filter(isStrongClass)
    .length;

  /*
    外側にA1・A2がいる場合は、
    外決着でも万舟になりにくい構成として抑える。
  */
  const manshuRaw =
    bestOuter.rawScore -
    Math.min(
      strongOuterCount * 5,
      15
    );

  const manshuScore =
    strictScore(manshuRaw);

  const levelOf = (score) => {
    if (score >= 70) return "高";
    if (score >= 50) return "中";
    return "低";
  };

  const escapeDifferenceText =
    strictEscapeEdge >= 5
      ? `1逃げが対抗展開を${round(strictEscapeEdge)}点上回る`
      : strictEscapeEdge <= -5
        ? `対抗展開が1逃げを${round(Math.abs(strictEscapeEdge))}点上回る`
        : "1逃げと対抗展開が拮抗";

  const honmeiReasons = [
    `1号艇${classNameOf(1)}・相手最上位${strongestChallenger.boatNo}号艇${strongestChallenger.className}`,
    `1逃げ展開${round(escapeScenarioScore)}点`,
    escapeDifferenceText,
    `${venueFeature.name}イン傾向${round(venueFeature.inPower)}点`
  ];

  const manshuReasons = [
    `${bestOuter.boatNo}号艇${bestOuter.className}の${bestOuter.roleLabel}`,
    `攻め・拾い成立度${round(bestOuter.flowEvidence)}点`,
    strongOuterCount > 0
      ? `外側のA1・A2が${strongOuterCount}艇のため万舟評価を抑制`
      : "外側にA1・A2不在",
    `${venueFeature.name}外展開傾向${round(bestOuter.venueScore)}点`
  ];

  return {
    ready: true,
    raceNo: getRaceNo(data),
    venue: venueFeature.name,

    honmei: {
      score: honmeiScore,
      level: levelOf(honmeiScore),
      reasons: honmeiReasons
    },

    manshu: {
      score: manshuScore,
      level: levelOf(manshuScore),
      reasons: manshuReasons
    },

    dataStatus,

    evidence: {
      purpose: {
        honmei: "1号艇のイン逃げ",
        manshu: "3〜6号艇からの万舟波乱"
      },

      priority: [
        "選手の実力構成",
        "各艇の展開",
        "場の特性"
      ],

      mainScenario: mainScenario
        ? {
            type: mainScenario.type,
            label: mainScenario.label,
            score: mainScenario.score
          }
        : null,

      subScenario: subScenario
        ? {
            type: subScenario.type,
            label: subScenario.label,
            score: subScenario.score
          }
        : null,

      scenarioScores: {
        escape: scoreOf(escape),
        sashi: scoreOf(sashi),
        threeAttack: scoreOf(threeAttack),
        fourAttack: scoreOf(fourAttack)
      },

      mainGap: round(mainGap),
      innerEdge: round(strictEscapeEdge),

      components: {
        honmei: {
          boat1Class: classNameOf(1),
          boat1ClassAbility:
            round(boat1ClassAbility),
          strongestChallenger:
            strongestChallenger.boatNo,
          strongestChallengerClass:
            strongestChallenger.className,
          skillControl:
            round(escapeSkillControl),
          escapeScenario:
            round(escapeScenarioScore),
          escapeFlow:
            round(oneEscapeFlow),
          venueInPower:
            round(venueFeature.inPower),
          rawScore:
            round(honmeiRaw)
        },

        manshu: {
          targetBoat:
            bestOuter.boatNo,
          targetClass:
            bestOuter.className,
          classLongshot:
            round(bestOuter.classLongshot),
          outerFlow:
            round(bestOuter.flowEvidence),
          venueOutside:
            round(bestOuter.venueScore),
          strongOuterCount,
          rawScore:
            round(manshuRaw)
        }
      },

      outerCandidates,
      relations: raceScenarios.relations
    }
  };
}
  /* ===============================
    AIコメント生成
  =============================== */

  function buildAiComment(
    analyses,
    slit,
    doubleTime,
    newSam,
    data
  ) {

    const comments = [];

    const top =
      analyses[0];

    if (top) {

      comments.push(
        `◎${top.boatNo}号艇 ${top.playerName} がAIトップ評価。`
      );

    }

    if (slit.attackBoat) {

      comments.push(
        `${slit.attackBoat}号艇はスリットAIの攻め艇。`
      );

    }

    if (doubleTime.topBoat) {

      comments.push(
        `${doubleTime.topBoat}号艇はダブルタイム最上位。`
      );

    }

    if (newSam.topBoat) {

      comments.push(
        `${newSam.topBoat}号艇は新サム理論プラス評価。`
      );

    }

    if (isNewEngineMode(data)) {

      comments.push(
        "新型エンジン期のため展示・STを最重視。"
      );

    }

    comments.push(
      getVenueFeature(data).comment
    );

    return comments;

  }
    /* ===============================
    フォーメーション生成
  =============================== */

  function buildFormations(analyses) {
  const list = Array.isArray(analyses)
    ? [...analyses]
    : [];

  const marks = buildMarks(list);
  const evidence = marks.evidence || {};

  const main = [];
  const safety = [];
  const flowTickets = [];
  const longshot = [];

  function boatNo(boat) {
    return Number(boat?.boatNo || 0);
  }

  function total(boat) {
    return toNumber(boat?.indexes?.total, 0);
  }

  function flow(boat) {
    return toNumber(boat?.indexes?.raceFlow, 0);
  }

  function attack(boat) {
    return toNumber(boat?.roleScores?.attack, 0);
  }

  function hold(boat) {
    return toNumber(boat?.roleScores?.hold, 0);
  }

  function pickup(boat) {
    return toNumber(boat?.roleScores?.pickup, 0);
  }

  function road(boat) {
    return toNumber(boat?.roleScores?.road, 0);
  }

  function uniqueBoats(boats) {
    const used = new Set();

    return (boats || []).filter((boat) => {
      const no = boatNo(boat);

      if (no < 1 || no > 6) return false;
      if (used.has(no)) return false;

      used.add(no);
      return true;
    });
  }

  function addTicket(target, first, second, third) {
    const numbers = [
      boatNo(first),
      boatNo(second),
      boatNo(third)
    ];

    if (
      numbers.some((no) =>
        no < 1 ||
        no > 6
      )
    ) {
      return;
    }

    if (new Set(numbers).size !== 3) {
      return;
    }

    const ticket =
      `${numbers[0]}-${numbers[1]}-${numbers[2]}`;

    if (!target.includes(ticket)) {
      target.push(ticket);
    }
  }

  /*
    2着候補：
    展開・残し・総合・攻めから毎回選ぶ。
  */
  function secondScore(boat) {
    let score =
      flow(boat) * 0.30 +
      hold(boat) * 0.28 +
      total(boat) * 0.22 +
      attack(boat) * 0.12 +
      road(boat) * 0.08;

    const no = boatNo(boat);

    if (no === 1) {
      score += hold(boat) >= 70 ? 6 : 0;
    }

    if (no === 2) {
      score += hold(boat) >= 68 ? 5 : 0;
    }

    if (no === 4) {
      score += hold(boat) >= 68 ? 3 : 0;
    }

    if (no >= 5 && flow(boat) < 75) {
      score -= 8;
    }

    return score;
  }

  /*
    3着候補：
    拾い・道中・残し・展開から毎回選ぶ。
  */
  function thirdScore(boat) {
    let score =
      pickup(boat) * 0.30 +
      road(boat) * 0.25 +
      hold(boat) * 0.20 +
      flow(boat) * 0.15 +
      total(boat) * 0.10;

    const no = boatNo(boat);

    if (no === 2 || no === 4) {
      score += 3;
    }

    if (no >= 5 && pickup(boat) >= 72) {
      score += 5;
    }

    return score;
  }

  const secondRanking = [...list]
    .sort((a, b) =>
      secondScore(b) - secondScore(a)
    );

  const thirdRanking = [...list]
    .sort((a, b) =>
      thirdScore(b) - thirdScore(a)
    );

  /*
    本線の頭はbuildMarks()が展開から決めた本命。
    艇番を固定しない。
  */
  const mainHeads = marks.established
    ? uniqueBoats([marks.honmei])
    : [];

  /*
    押さえ頭：
    対抗と、実際に攻め根拠を持つ艇だけ。
  */
  const safetyHeads = uniqueBoats([
    marks.taikou,

    evidence.twoSashi
      ? list.find((boat) => boatNo(boat) === 2)
      : null,

    evidence.threeAttack
      ? list.find((boat) => boatNo(boat) === 3)
      : null,

    evidence.fourAttack
      ? list.find((boat) => boatNo(boat) === 4)
      : null
  ]);

  /*
    穴頭：
    穴印と、展開・攻めの裏付けがある艇だけ。
    5・6を外枠という理由だけでは頭にしない。
  */
  const longshotHeads = uniqueBoats([
    marks.ana,

    evidence.fiveFollow
      ? list.find((boat) => boatNo(boat) === 5)
      : null,

    evidence.sixPickup &&
    attack(
      list.find((boat) => boatNo(boat) === 6)
    ) >= 72
      ? list.find((boat) => boatNo(boat) === 6)
      : null
  ]);

  const flowHeads = marks.established && evidence.flow
    ? uniqueBoats([
        evidence.twoSashi && boatNo(marks.honmei) !== 2
          ? list.find((boat) => boatNo(boat) === 2)
          : null,
        evidence.threeAttack && boatNo(marks.honmei) !== 3
          ? list.find((boat) => boatNo(boat) === 3)
          : null,
        evidence.fourAttack && boatNo(marks.honmei) !== 4
          ? list.find((boat) => boatNo(boat) === 4)
          : null,
        marks.taikou
      ])
    : [];

  function generateTickets(
    target,
    heads,
    secondCandidates,
    thirdCandidates,
    limit
  ) {
    for (const head of heads) {
      for (const second of secondCandidates) {
        if (boatNo(second) === boatNo(head)) {
          continue;
        }

        for (const third of thirdCandidates) {
          if (boatNo(third) === boatNo(head)) {
            continue;
          }

          if (boatNo(third) === boatNo(second)) {
            continue;
          }

          addTicket(
            target,
            head,
            second,
            third
          );

          if (target.length >= limit) {
            return;
          }
        }
      }
    }
  }

  generateTickets(
    main,
    mainHeads,
    secondRanking.slice(0, 4),
    thirdRanking.slice(0, 5),
    6
  );

  generateTickets(
    safety,
    safetyHeads,
    secondRanking.slice(0, 4),
    thirdRanking.slice(0, 5),
    8
  );

  generateTickets(
    flowTickets,
    flowHeads,
    secondRanking.slice(0, 4),
    thirdRanking.slice(0, 5),
    6
  );

  generateTickets(
    longshot,
    longshotHeads,
    secondRanking.slice(0, 5),
    thirdRanking.slice(0, 6),
    8
  );

  return {
    main,
    safety,
    flow: flowTickets,
    longshot,

    scenario: marks.scenario,
    mainEstablished: marks.established === true,
    evidence,

    axis: {
      honmei:
        boatNo(marks.honmei),

      taikou:
        boatNo(marks.taikou),

      ana:
        boatNo(marks.ana),

      osae:
        boatNo(marks.osae)
    },

    rankings: {
      second: secondRanking.map((boat) => ({
        boatNo: boatNo(boat),
        score: round(secondScore(boat))
      })),

      third: thirdRanking.map((boat) => ({
        boatNo: boatNo(boat),
        score: round(thirdScore(boat))
      }))
    }
  };
}

  /* ===============================
    本命シート
  =============================== */

  function buildMainSheet(analyses) {

    return analyses.map((boat) => ({

      rank: boat.aiRank,

      boatNo: boat.boatNo,

      playerName: boat.playerName,

      total: boat.indexes.total,

      attack: boat.indexes.attack,

      raceFlow: boat.indexes.raceFlow,

      turn: boat.indexes.turn,

      local: boat.indexes.local,

      buffs: boat.buffs,

      debuffs: boat.debuffs,

      comment: boat.aiComment

    }));

  }

  /* ===============================
    万舟シート
  =============================== */

  function buildLongshotSheet(analyses) {

    return [...analyses]

      .sort((a, b) => {

        const aScore =
          a.indexes.attack * 0.45 +
          a.indexes.raceFlow * 0.30 +
          a.indexes.turn * 0.25;

        const bScore =
          b.indexes.attack * 0.45 +
          b.indexes.raceFlow * 0.30 +
          b.indexes.turn * 0.25;

        return bScore - aScore;

      })

      .map((boat, index) => ({

        rank: index + 1,

        boatNo: boat.boatNo,

        playerName: boat.playerName,

        attack: boat.indexes.attack,

        raceFlow: boat.indexes.raceFlow,

        turn: boat.indexes.turn,

        total: boat.indexes.total,

        buffs: boat.buffs,

        debuffs: boat.debuffs,

        comment: boat.aiComment

      }));

  }

  /* ===============================
    AI順位
  =============================== */

  function buildAiRanking(analyses) {

    return analyses.map((boat) => ({

      rank: boat.aiRank,

      boatNo: boat.boatNo,

      playerName: boat.playerName,

      score: boat.indexes.total

    }));

  }

  /* ===============================
    本命・対抗・穴
  =============================== */

  function buildMarks(analyses) {
  const list = Array.isArray(analyses)
    ? [...analyses]
    : [];

  if (!list.length) {
    return {
      honmei: null,
      taikou: null,
      ana: null,
      osae: null,
      scenario: "データ不足",
      established: false,
      evidence: {}
    };
  }

  const byBoat = {};

  list.forEach((boat) => {
    byBoat[Number(boat.boatNo)] = boat;
  });

  const boat1 = byBoat[1] || null;
  const boat2 = byBoat[2] || null;
  const boat3 = byBoat[3] || null;
  const boat4 = byBoat[4] || null;
  const boat5 = byBoat[5] || null;
  const boat6 = byBoat[6] || null;

  const total = (boat) =>
    toNumber(boat?.indexes?.total, 0);

  const flow = (boat) =>
    toNumber(boat?.indexes?.raceFlow, 0);

  const attack = (boat) =>
    toNumber(boat?.roleScores?.attack, 0);

  const hold = (boat) =>
    toNumber(boat?.roleScores?.hold, 0);

  const pickup = (boat) =>
    toNumber(boat?.roleScores?.pickup, 0);

  /*
    展開シナリオ判定
  */
  const oneEscape =
    boat1 &&
    total(boat1) >= 72 &&
    flow(boat1) >= 62;

  const twoSashi =
    boat2 &&
    total(boat2) >= 72 &&
    flow(boat2) >= 65;

  const threeAttack =
    boat3 &&
    flow(boat3) >= 78 &&
    attack(boat3) >= 72;

  const fourAttack =
    boat4 &&
    flow(boat4) >= 78 &&
    attack(boat4) >= 74 &&
    !threeAttack;

  const fiveFollow =
    boat5 &&
    pickup(boat5) >= 75 &&
    (threeAttack || fourAttack);

  const sixPickup =
    boat6 &&
    pickup(boat6) >= 78 &&
    flow(boat6) >= 72;

  const established = Boolean(
    oneEscape || twoSashi || threeAttack || fourAttack
  );

  const primaryEvidenceCount = [
    oneEscape,
    twoSashi,
    threeAttack,
    fourAttack
  ].filter(Boolean).length;

  const flowEvidence = established && primaryEvidenceCount >= 2;
  const longshotEvidence = established && Boolean(
    (oneEscape && (threeAttack || fourAttack)) ||
    fiveFollow ||
    sixPickup
  );

  let scenario = "総合展開";
  let honmei = null;
  let taikou = null;

  /*
    頭評価は展開順に決定する。
    選手実力だけでは決めない。
  */
  if (oneEscape) {
    scenario = "1号艇逃げ本線";
    honmei = boat1;

    if (twoSashi) {
      taikou = boat2;
    } else if (threeAttack) {
      taikou = boat3;
    } else {
      taikou = [boat2, boat3, boat4]
        .filter(Boolean)
        .sort((a, b) => total(b) - total(a))[0] || null;
    }
  } else if (twoSashi) {
    scenario = "2コース差し";
    honmei = boat2;
    taikou = boat1 || boat3 || null;
  } else if (threeAttack) {
    scenario = "3コース攻め";
    honmei = boat3;
    taikou = boat1 || boat2 || boat5 || null;
  } else if (fourAttack) {
    scenario = "4カド攻め";
    honmei = boat4;
    taikou = boat1 || boat5 || boat2 || null;
  } else {
    const innerCandidates = [
      boat1,
      boat2,
      boat3,
      boat4
    ]
      .filter(Boolean)
      .sort((a, b) => total(b) - total(a));

    honmei = innerCandidates[0] || list[0] || null;
    taikou = innerCandidates
      .find((boat) => boat !== honmei) || list[1] || null;
  }

  /*
    穴は展開を突ける艇。
    5・6は拾い根拠がある場合だけ選ぶ。
  */
  const selected = new Set([
    honmei?.boatNo,
    taikou?.boatNo
  ].filter(Boolean));

  const holeCandidates = [
    threeAttack ? boat5 : null,
    fourAttack ? boat5 : null,
    fiveFollow ? boat5 : null,
    sixPickup ? boat6 : null,
    boat4,
    boat3,
    boat5,
    boat6
  ]
    .filter(Boolean)
    .filter((boat) => !selected.has(boat.boatNo))
    .sort((a, b) => {
      const scoreA =
        flow(a) * 0.45 +
        attack(a) * 0.30 +
        pickup(a) * 0.25;

      const scoreB =
        flow(b) * 0.45 +
        attack(b) * 0.30 +
        pickup(b) * 0.25;

      return scoreB - scoreA;
    });

  const ana = holeCandidates[0] || null;

  if (ana) {
    selected.add(ana.boatNo);
  }

  /*
    押さえは1・2・4の残しを優先する。
  */
  const holdCandidates = [
    boat1,
    boat2,
    boat4,
    boat3,
    boat5,
    boat6
  ]
    .filter(Boolean)
    .filter((boat) => !selected.has(boat.boatNo))
    .sort((a, b) => {
      const scoreA =
        hold(a) * 0.65 +
        total(a) * 0.35;

      const scoreB =
        hold(b) * 0.65 +
        total(b) * 0.35;

      return scoreB - scoreA;
    });

  const osae = holdCandidates[0] || null;

  return {
    honmei,
    taikou,
    ana,
    osae,
    scenario,
    established,

    evidence: {
      oneEscape: Boolean(oneEscape),
      twoSashi: Boolean(twoSashi),
      threeAttack: Boolean(threeAttack),
      fourAttack: Boolean(fourAttack),
      fiveFollow: Boolean(fiveFollow),
      sixPickup: Boolean(sixPickup),
      flow: Boolean(flowEvidence),
      longshot: Boolean(longshotEvidence)
    }
  };
}
    /* ===============================
    prediction.jsへ渡すAIデータ生成
  =============================== */

  function buildPredictionData(data) {

    const entries = getRaceEntries(data);

    const venueFeature = getVenueFeature(data);

    const analyses =
  buildBoatAnalyses(data);

const raceScenarios =
  buildRaceScenarios(
    analyses,
    data
  );

const slit =
      buildSlitAnalysis(
        entries,
        venueFeature
      );

    const doubleTime =
      buildDoubleTime(entries);

    const newSam =
      buildNewSam(entries);

    const formations =
      buildFormations(analyses);

    const marks =
      buildMarks(analyses);

    const mainSheet =
      buildMainSheet(analyses);

    const longshotSheet =
      buildLongshotSheet(analyses);

    const ranking =
      buildAiRanking(analyses);

    const comments =
      buildAiComment(
        analyses,
        slit,
        doubleTime,
        newSam,
        data
      );

    return {

      version: CORE_VERSION,

      raceNo: getRaceNo(data),

      venue: getVenueName(data),

      venueFeature,

      analyses,

      raceScenarios,

      ranking,

      marks,

      formations,

      mainSheet,

      longshotSheet,

      slit,

      doubleTime,

      newSam,

      comments

    };

  }
  /* ===============================
    prediction.js結合用
  =============================== */

    function mergeWithPrediction(prediction, data) {
    const basePrediction =
      prediction && typeof prediction === "object"
        ? prediction
        : {};

    const aiCore = buildPredictionData(data);
    
    const raceScenarios =
  aiCore.raceScenarios || {};

const scenarioList =
  Array.isArray(raceScenarios.scenarios)
    ? raceScenarios.scenarios
    : [];

const mainScenario =
  raceScenarios.mainScenario || null;

const mainFirstCandidates =
  mainScenario?.outcome?.firstCandidates || [];

const subScenario =
  raceScenarios.subScenario ||
  scenarioList[1] ||
  null;

const firstCandidateText =
  mainFirstCandidates
    .slice(0, 3)
    .map((boat) =>
      `${boat.boatNo}号艇`
    )
    .join("・");

const secondCandidateText =
  (mainScenario?.outcome?.secondCandidates || [])
    .slice(0, 3)
    .map((boat) =>
      `${boat.boatNo}号艇`
    )
    .join("・");

const thirdCandidateText =
  (mainScenario?.outcome?.thirdCandidates || [])
    .slice(0, 3)
    .map((boat) =>
      `${boat.boatNo}号艇`
    )
    .join("・");

const scenarioSummary =
  mainScenario
    ? `最有力展開は${mainScenario.label}（${mainScenario.score}点）。` +
      (
        subScenario
          ? `対抗展開は${subScenario.label}（${subScenario.score}点）。`
          : ""
      ) +
      `1着候補は${firstCandidateText || "確認待ち"}。` +
      (
        secondCandidateText
          ? `2着残し候補は${secondCandidateText}。`
          : ""
      ) +
      (
        thirdCandidateText
          ? `3着拾い候補は${thirdCandidateText}。`
          : ""
      )
    : "展開・コース・ST・展示データが不足し、最終展開を判定できません。";

    /*
      prediction.jsの表示形式へ変換する。
      艇別評価・印・フォーメーションを同じAIコア判断へそろえる。
    */
    const coreEvaluations = (aiCore.analyses || []).map((analysis) => {
      const indexes = analysis.indexes || {};
      const roleScores = analysis.roleScores || {};

      const role =
        Array.isArray(analysis.roleTags) &&
        analysis.roleTags.length
          ? analysis.roleTags.join(" / ")
          : analysis.primaryRole?.label || "展開候補";

      const buffs =
        Array.isArray(analysis.buffs)
          ? analysis.buffs
          : [];

      const debuffs =
        Array.isArray(analysis.debuffs)
          ? analysis.debuffs
          : [];

      return {
  boatNo: analysis.boatNo,
  number: analysis.boatNo,
  waku: analysis.boatNo,

  name: analysis.playerName,
  playerName: analysis.playerName,
  racerName: analysis.playerName,

  className: analysis.className,

        score: indexes.total,
        total: indexes.total,

        attack:
          roleScores.attack ??
          indexes.attack ??
          50,

        tenkai:
          roleScores.flow ??
          indexes.raceFlow ??
          50,

        michu:
          roleScores.road ??
          indexes.turn ??
          50,

        local:
          indexes.local ??
          50,

        expected:
          roleScores.pickup ??
          indexes.raceFlow ??
          50,

        raceFlow:
          indexes.raceFlow ??
          50,

        hold:
          roleScores.hold ??
          50,

        pickup:
          roleScores.pickup ??
          50,

        role,
        label: role,

        buffs,
        debuffs,

        shortComment:
          analysis.aiComment ||
          `${analysis.boatNo}号艇は展開・コースから評価。`,

        comment:
          `${analysis.boatNo}号艇 ${analysis.playerName}は${role}。` +
          `AI総合${indexes.total}点。` +
          (
            buffs.length
              ? `プラス材料は${buffs.slice(0, 2).join("、")}。`
              : ""
          ) +
          (
            debuffs.length
              ? `マイナス材料は${debuffs.slice(0, 2).join("、")}。`
              : ""
          ),

        indexes,
        roleScores,
        raw: analysis
      };
    });

    const oldMainSheet =
  basePrediction.mainSheet &&
  !Array.isArray(basePrediction.mainSheet)
    ? basePrediction.mainSheet
    : {};

function getMarkBoatNo(mark) {
  return Number(
    mark?.boatNo ??
    mark?.number ??
    mark?.waku ??
    0
  );
}

function findCoreEvaluation(mark) {
  const boatNo = getMarkBoatNo(mark);

  if (!boatNo) return null;

  return (
    coreEvaluations.find(
      item => Number(item?.boatNo) === boatNo
    ) ||
    mark
  );
}

function findUnusedEvaluation(...marks) {
  const usedBoatNos = new Set(
    marks
      .map(getMarkBoatNo)
      .filter(Boolean)
  );

  return (
    coreEvaluations.find(
      item => !usedBoatNos.has(Number(item?.boatNo))
    ) ||
    null
  );
}

const honmei =
  findCoreEvaluation(aiCore.marks?.honmei) ||
  null;

const taikou =
  findCoreEvaluation(aiCore.marks?.taikou) ||
  null;

const ana =
  findCoreEvaluation(aiCore.marks?.ana) ||
  null;

const osae =
  findCoreEvaluation(aiCore.marks?.osae) ||
  null;

const coreFormations = aiCore.formations || {};
const compatibleFormation = {
  main: coreFormations.main || [],
  cover: coreFormations.safety || [],
  nagashi: coreFormations.flow || [],
  hole: coreFormations.longshot || [],
  mainEstablished: coreFormations.mainEstablished === true,
  evidence: coreFormations.evidence || {}
};

const compatibleMainSheet = {
  ...oldMainSheet,
  honmei,
  taikou,
  ana,
  osae,
  tickets: compatibleFormation.main,
  coverTickets: compatibleFormation.cover,
  flowTickets: compatibleFormation.nagashi,
  evaluations: coreEvaluations
};

const compatibleManshuSheet = {
  ...(basePrediction.manshuSheet || {}),
  tickets: compatibleFormation.hole
};

const coreScenarioTitle = (() => {
  const scenario = String(coreFormations.scenario || "");
  if (scenario.includes("1号艇逃げ")) return "イン逃げ本線";
  if (scenario.includes("2コース差し")) return "2コース差し本線";
  if (scenario.includes("3コース攻め")) return "3コース攻め本線";
  if (scenario.includes("4カド攻め")) return "4コース・4カド攻め本線";
  return scenario || "本線展開不成立";
})();

const compatibleRaceFlow = {
  ...(basePrediction.raceFlow || {}),
  title: coreScenarioTitle,
  summary: scenarioSummary,
  attackBoats: mainFirstCandidates,
  holdBoats: mainScenario?.outcome?.secondCandidates || [],
  pickupBoats: mainScenario?.outcome?.thirdCandidates || [],
  mainEstablished: compatibleFormation.mainEstablished
};

const compatibleAiCore = {
  ...aiCore,
  mainSheet: compatibleMainSheet
};

return {
      ...basePrediction,

      aiCore: compatibleAiCore,
      
      finalAi: {
  ...(basePrediction.finalAi || {}),
  summary: scenarioSummary
},

      ai: {
        ...(basePrediction.ai || {}),
        ranking: aiCore.ranking,
        comments: aiCore.comments,
        marks: aiCore.marks
      },

      indexes: {
        ...(basePrediction.indexes || {}),
        ai: aiCore.ranking,
        aiCore: aiCore.analyses
      },

      raceFlow: compatibleRaceFlow,

      /*
        STEP1確認用：
        AIコアの順位を既存UI形式へ変換する。
      */
      mainSheet: compatibleMainSheet,

      formation: compatibleFormation,
      formations: coreFormations,
      ticketSheets: {
        main: compatibleFormation.main,
        cover: compatibleFormation.cover,
        flow: compatibleFormation.nagashi,
        hole: compatibleFormation.hole
      },

      manshuSheet: compatibleManshuSheet,
      longshotSheet: basePrediction.longshotSheet,

      slit: aiCore.slit,
      doubleTime: aiCore.doubleTime,
      newSam: aiCore.newSam,

      comments: aiCore.comments,

      coreRanking: aiCore.ranking
    };
  }

  /* ===============================
    AI順位取得
  =============================== */

  function getTopBoat(aiData) {

    if (!aiData) return null;

    if (!Array.isArray(aiData.ranking)) {
      return null;
    }

    return aiData.ranking[0] || null;

  }

  /* ===============================
    攻め艇取得
  =============================== */

  function getAttackBoat(aiData) {

    if (!aiData) return null;

    if (!aiData.slit) return null;

    return aiData.slit.attackBoat;

  }

  /* ===============================
    展開艇取得
  =============================== */

  function getRaceFlowBoats(aiData) {

    if (!aiData) return [];

    return aiData.analyses

      .filter(v =>
        v.indexes.raceFlow >= 75
      )

      .map(v => v.boatNo);

  }

  /* ===============================
    道中艇取得
  =============================== */

  function getTurnBoats(aiData) {

    if (!aiData) return [];

    return aiData.analyses

      .filter(v =>
        v.indexes.turn >= 75
      )

      .map(v => v.boatNo);

  }

  /* ===============================
    当地巧者取得
  =============================== */

  function getLocalExperts(aiData) {

    if (!aiData) return [];

    return aiData.analyses

      .filter(v =>
        v.indexes.local >= 75
      )

      .map(v => v.boatNo);

  }

  /* ===============================
    スリット順位取得
  =============================== */

  function getSlitRanking(aiData) {

    if (!aiData) return [];

    if (!aiData.slit) return [];

    return aiData.slit.ranking;

  }

  /* ===============================
    ダブルタイム順位取得
  =============================== */

  function getDoubleTimeRanking(aiData) {

    if (!aiData) return [];

    if (!aiData.doubleTime) return [];

    return aiData.doubleTime.ranking;

  }

  /* ===============================
    新サム順位取得
  =============================== */

  function getNewSamRanking(aiData) {

    if (!aiData) return [];

    if (!aiData.newSam) return [];

    return aiData.newSam.ranking;

  }
    /* ===============================
    公開API
  =============================== */

  const ChappyAICore = {

    version: CORE_VERSION,

    /* ==========================
       メイン
    ========================== */

    analyze(data) {

      return buildPredictionData(data);

    },

    buildPredictionData,

    buildBoatAnalysis,

    buildBoatAnalyses,
    
    buildRaceScenarios,

    buildRaceTrendEvaluation,
    
    mergeWithPrediction,

    /* ==========================
       AI指数
    ========================== */

    calcStIndex,

    calcExhibitionIndex,

    calcMotorIndex,

    calcLocalIndex,

    calcNationalIndex,

    calcAttackIndex,

    calcRaceFlowIndex,

    calcTurnIndex,

    calcTotalIndex,

    /* ==========================
       AI理論
    ========================== */

    buildSlitAnalysis,

    buildDoubleTime,

    buildNewSam,

    calculateCombinedOdds,

    /* ==========================
       シート
    ========================== */

    buildMainSheet,

    buildLongshotSheet,

    buildFormations,

    buildMarks,

    buildAiRanking,

    /* ==========================
       コメント
    ========================== */

    buildAiComment,

    /* ==========================
       取得
    ========================== */

    getTopBoat,

    getAttackBoat,

    getRaceFlowBoats,

    getTurnBoats,

    getLocalExperts,

    getSlitRanking,

    getDoubleTimeRanking,

    getNewSamRanking,

    /* ==========================
       共通
    ========================== */

    getVenueFeature,

    getVenueName,

    getVenueCode,

    getRaceEntries,

    getWeights,

    isNewEngineMode

  };

  /* ===============================
    prediction.js互換
  =============================== */

  window.createAIAnalysis = function (data) {

    return ChappyAICore.analyze(data);

  };

  window.buildPredictionData = function (data) {

    return ChappyAICore.buildPredictionData(data);

  };

  window.getAIRanking = function (data) {

    return ChappyAICore.buildPredictionData(data).ranking;

  };

  window.getMainSheet = function (data) {

    return ChappyAICore.buildPredictionData(data).mainSheet;

  };

  window.getLongshotSheet = function (data) {

    return ChappyAICore.buildPredictionData(data).longshotSheet;

  };

  window.getAIComments = function (data) {

    return ChappyAICore.buildPredictionData(data).comments;

  };

  /* ===============================
    render.js互換
  =============================== */

  window.getFormationData = function (data) {

    return ChappyAICore.buildPredictionData(data).formations;

  };

  window.getMarksData = function (data) {

    return ChappyAICore.buildPredictionData(data).marks;

  };

  window.getSlitAI = function (data) {

    return ChappyAICore.buildPredictionData(data).slit;

  };

  window.getDoubleTimeAI = function (data) {

    return ChappyAICore.buildPredictionData(data).doubleTime;

  };

  window.getNewSamAI = function (data) {

    return ChappyAICore.buildPredictionData(data).newSam;

  };

  /* ===============================
    本体公開
  =============================== */

  window.ChappyAICore = ChappyAICore;
    /* ===============================
    バージョン確認
  =============================== */

  window.ChappyAICoreVersion = CORE_VERSION;
  if (typeof console !== "undefined") {
    console.log(
      `%cチャッピーボートレースAI ${CORE_VERSION}`,
      "color:#2196f3;font-weight:bold;"
    );
    console.log(`${CORE_VERSION} 読み込み完了`);
  }

  /* ===============================
    初期動作確認
  =============================== */

  try {

    if (
      typeof window !== "undefined" &&
      window.ChappyAICore
    ) {

      window.ChappyAICore.loaded = true;
      window.ChappyAICore.buildDate = new Date().toISOString();

    }

  } catch (error) {

    console.error(
      "[ChappyAICore] 初期化エラー",
      error
    );

  }

})();
