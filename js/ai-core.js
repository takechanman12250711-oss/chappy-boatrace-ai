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

  const CORE_VERSION = "ai-core-v3.0.1-debuff-fixed";

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

  const candidates = [
    boat.boatNo,
    boat.waku,
    boat.course,
    boat.cource,
    boat.lane,
    boat.frame
  ];

  for (const value of candidates) {
    const no = Number(value);

    if (Number.isFinite(no) && no >= 1 && no <= 6) {
      return no;
    }
  }

  const number = Number(boat.number);

  if (Number.isFinite(number) && number >= 1 && number <= 6) {
    return number;
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

    return Array.isArray(entries) ? entries : [];
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
    const motor2 = getMotorRate(boat);
    const motor3 = getMotor3Rate(boat);
    const boat2 = getBoatRate(boat);

    let score = 45;

    score += motor2 * 0.75;
    score += motor3 * 0.22;
    score += boat2 * 0.20;

    if (isNewEngineMode(data)) {
      score = score * 0.82;
      score += 10;
    }

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
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

  const wind = getWindSpeed(data);
  const wave = getWaveHeight(data);

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

  const oneCanEscape =
    st1 >= 58 &&
    ex1 >= 50 &&
    st1 >= st2 - 10 &&
    st1 >= st3 - 12;

  const twoCanSashi =
    st2 >= 58 &&
    ex2 >= 50 &&
    st2 >= st1 - 8;

  const threeCanAttack =
    st3 >= 68 &&
    ex3 >= 58 &&
    st3 >= st2 + 3;

  const fourCanAttack =
    st4 >= 68 &&
    ex4 >= 58 &&
    st4 >= st3 + 3;

  const fiveCanMakuriSashi =
    st5 >= 70 &&
    ex5 >= 62 &&
    (
      threeCanAttack ||
      fourCanAttack
    );

  const sixCanPickup =
    (
      st6 >= 65 ||
      ex6 >= 65
    ) &&
    (
      localIndex >= 65 ||
      turnIndex >= 68
    );

  /* ===============================
    1号艇の逃げ・残し
  =============================== */

  if (oneCanEscape) {
    if (boatNo === 1) score += 16;
    if (boatNo === 2) score += 7;
    if (boatNo === 3) score += 4;
    if (boatNo === 4) score += 2;
  } else {
    if (boatNo === 1) score -= 7;
    if (boatNo === 2) score += 5;
    if (boatNo === 3) score += 5;
    if (boatNo === 4) score += 4;
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
  1: 90,
  2: 74,
  3: 69,
  4: 64,
  5: 53,
  6: 47
};

const courseIndex =
  courseBaseIndex[boatNo] || 50;

/*
  外枠が本命になるには、
  展開・攻め・STまたは展示の裏付けが必要
*/
const hasOuterHeadEvidence =
  boatNo >= 5 &&
  roleScores.flow >= 78 &&
  roleScores.attack >= 72 &&
  (
    indexes.st >= 68 ||
    indexes.exhibition >= 68
  );

/*
  コース基本補正
  1は簡単に軽視しない
  2差し・3攻め・4残しを維持
  5・6は展開根拠なしで頭評価を上げない
*/
let courseAdjustment = 0;

if (boatNo === 1) {
  courseAdjustment = 8;

  if (
    indexes.st <= 45 ||
    indexes.exhibition <= 42 ||
    indexes.raceFlow <= 45
  ) {
    courseAdjustment = 2;
  }
}

if (boatNo === 2) {
  courseAdjustment = 4;
}

if (boatNo === 3) {
  courseAdjustment = 2;
}

if (boatNo === 4) {
  courseAdjustment = 1;
}

if (boatNo === 5) {
  courseAdjustment =
    hasOuterHeadEvidence ? -1 : -7;
}

if (boatNo === 6) {
  courseAdjustment =
    hasOuterHeadEvidence ? -3 : -11;
}

/*
  選手実力・モーターは最後の補助点。
  全国実績だけで外枠が本命にならない配分。
*/
indexes.total = clamp(
  round(
    roleScores.flow * 0.22 +
    courseIndex * 0.20 +
    roleScores.attack * 0.13 +
    indexes.st * 0.11 +
    indexes.exhibition * 0.10 +
    roleScores.hold * 0.07 +
    roleScores.pickup * 0.05 +
    indexes.local * 0.05 +
    indexes.turn * 0.03 +
    indexes.national * 0.025 +
    indexes.motor * 0.015 +
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

    const debuffs = [];

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

    const rank = [...analyses]
      .sort((a, b) => b.indexes.total - a.indexes.total);

    const r1 = rank[0];
    const r2 = rank[1];
    const r3 = rank[2];
    const r4 = rank[3];
    const r5 = rank[4];

    const main = [];
    const safety = [];
    const longshot = [];

    if (r1 && r2 && r3) {
      main.push(
        `${r1.boatNo}-${r2.boatNo}-${r3.boatNo}`
      );
    }

    if (r1 && r3 && r2) {
      main.push(
        `${r1.boatNo}-${r3.boatNo}-${r2.boatNo}`
      );
    }

    if (r2 && r1 && r3) {
      safety.push(
        `${r2.boatNo}-${r1.boatNo}-${r3.boatNo}`
      );
    }

    if (r1 && r2 && r4) {
      safety.push(
        `${r1.boatNo}-${r2.boatNo}-${r4.boatNo}`
      );
    }

    if (r2 && r3 && r1) {
      longshot.push(
        `${r2.boatNo}-${r3.boatNo}-${r1.boatNo}`
      );
    }

    if (r3 && r1 && r2) {
      longshot.push(
        `${r3.boatNo}-${r1.boatNo}-${r2.boatNo}`
      );
    }

    if (r3 && r2 && r1) {
      longshot.push(
        `${r3.boatNo}-${r2.boatNo}-${r1.boatNo}`
      );
    }

    if (r5) {

      longshot.push(
        `${r5.boatNo}-${r1.boatNo}-${r2.boatNo}`
      );

      longshot.push(
        `${r1.boatNo}-${r5.boatNo}-${r2.boatNo}`
      );

    }

    return {

      main,

      safety,

      longshot

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

    return {

      honmei: analyses[0] || null,

      taikou: analyses[1] || null,

      ana: analyses[2] || null,

      osae: analyses[3] || null

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

    const aiCore = buildPredictionData(data);

    return {
      ...(prediction || {}),

      aiCore,

      ai: {
        ...((prediction && prediction.ai) || {}),
        ranking: aiCore.ranking,
        comments: aiCore.comments,
        marks: aiCore.marks
      },

      indexes: {
        ...((prediction && prediction.indexes) || {}),
        ai: aiCore.ranking
      },

      formations: {
        ...((prediction && prediction.formations) || {}),
        ...aiCore.formations
      },

      mainSheet: aiCore.mainSheet,
      longshotSheet: aiCore.longshotSheet,
      slit: aiCore.slit,
      doubleTime: aiCore.doubleTime,
      newSam: aiCore.newSam,
      comments: aiCore.comments
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
    console.log("ai-core.js v3.0.1-debuff-fixed 読み込み完了");
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