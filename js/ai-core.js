/* =========================================================
  チャッピーボートレースAI
  ai-core.js 完全版 Part 1 / 5

  役割：
  - AI指数計算の中核
  - 展示 / ST / 当地 / 道中 / 攻め / 展開 / モーターを数値化
  - prediction.js に渡せるAI評価データを作る

  公開：
  - window.ChappyAICore
========================================================= */

(function () {
  "use strict";

  const CORE_VERSION = "ai-core-v2.0.0";

  /* ===============================
    安全関数
  =============================== */

  function isNil(value) {
    return value === null || value === undefined || value === "";
  }

  function safeText(value, fallback = "-") {
    if (isNil(value)) return fallback;
    return String(value).trim();
  }

  function toNumber(value, fallback = 0) {
    if (isNil(value)) return fallback;

    const text = String(value)
      .replace("%", "")
      .replace("％", "")
      .replace("F", "")
      .replace("L", "")
      .replace(/[^\d.-]/g, "");

    const num = Number(text);
    return Number.isFinite(num) ? num : fallback;
  }

  function clamp(value, min = 0, max = 100) {
    const num = toNumber(value, min);
    return Math.max(min, Math.min(max, num));
  }

  function round(value, digit = 1) {
    const num = toNumber(value, 0);
    const p = Math.pow(10, digit);
    return Math.round(num * p) / p;
  }

  function average(values, fallback = 0) {
    const nums = values
      .map((v) => toNumber(v, null))
      .filter((v) => Number.isFinite(v));

    if (!nums.length) return fallback;

    return nums.reduce((sum, v) => sum + v, 0) / nums.length;
  }

  function normalize(value, min, max, reverse = false) {
    const num = toNumber(value, null);
    if (!Number.isFinite(num)) return 50;
    if (max === min) return 50;

    let score = ((num - min) / (max - min)) * 100;
    if (reverse) score = 100 - score;

    return clamp(round(score, 1));
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  /* ===============================
    艇データ抽出
  =============================== */

  function getEntries(data) {
  const candidates = [
    data?.entries,
    data?.racers,
    data?.boats,
    data?.entryList,
    data?.race?.entries,
    data?.race?.entry,
    data?.raceInfo?.entries,
    data?.raceInfo?.entry
  ];

  for (const list of candidates) {
    if (Array.isArray(list) && list.length) {
      return list;
    }
  }

  return [];
}

  function getBoatNo(entry, index) {
    return toNumber(
      entry?.boatNo ??
      entry?.waku ??
      entry?.frame ??
      entry?.course ??
      entry?.number ??
      index + 1,
      index + 1
    );
  }

  function getRacerName(entry) {
    return safeText(
      entry?.name ??
      entry?.racerName ??
      entry?.playerName ??
      entry?.racer ??
      entry?.選手名,
      "選手名不明"
    );
  }

  function getClass(entry) {
    return safeText(
      entry?.class ??
      entry?.rank ??
      entry?.grade ??
      entry?.級別,
      "-"
    );
  }

  function getBaseEntry(entry, index) {
    const boatNo = getBoatNo(entry, index);

    return {
      boatNo,
      name: getRacerName(entry),
      class: getClass(entry),

      raw: entry
    };
  }

  function buildBaseEntries(data) {
    return getEntries(data).map((entry, index) => {
      return getBaseEntry(entry, index);
    });
  }

  /* ===============================
    公開API
  =============================== */

  const ChappyAICore = {
    version: CORE_VERSION,

    utils: {
      isNil,
      safeText,
      toNumber,
      clamp,
      round,
      average,
      normalize,
      safeArray
    },

    entries: {
      getEntries,
      getBoatNo,
      getRacerName,
      getClass,
      getBaseEntry,
      buildBaseEntries
    }
  };

  window.ChappyAICore = ChappyAICore;
  
  /* ===============================
    Part 2 / 5
    基本指数計算
  =============================== */

  const DEFAULT_WEIGHTS = {
    attack: 18,
    flow: 14,
    road: 14,
    local: 12,
    exhibition: 18,
    st: 16,
    motor: 8
  };

  function getEntryValue(entry, keys, fallback = 0) {
    for (const key of keys) {
      if (entry?.raw && !isNil(entry.raw[key])) return entry.raw[key];
      if (!isNil(entry?.[key])) return entry[key];
    }
    return fallback;
  }

  function scoreClass(className) {
    const c = safeText(className, "").toUpperCase();

    if (c.includes("A1")) return 92;
    if (c.includes("A2")) return 78;
    if (c.includes("B1")) return 58;
    if (c.includes("B2")) return 42;

    return 50;
  }

  function calcSTScore(entry) {
    const avgST = toNumber(getEntryValue(entry, [
      "avgST", "averageST", "st", "ST", "平均ST"
    ], 0.17), 0.17);

    const exhibitST = toNumber(getEntryValue(entry, [
      "exhibitionST", "tenjiST", "displayST", "展示ST"
    ], avgST), avgST);

    const recentST = toNumber(getEntryValue(entry, [
      "recentST", "seasonST", "今節ST"
    ], avgST), avgST);

    const avgScore = normalize(avgST, 0.10, 0.24, true);
    const exScore = normalize(exhibitST, 0.05, 0.25, true);
    const recentScore = normalize(recentST, 0.10, 0.24, true);

    return round(
      avgScore * 0.45 +
      exScore * 0.30 +
      recentScore * 0.25,
      1
    );
  }

  function calcExhibitionScore(entry) {

  const exhibitionTime = toNumber(getEntryValue(entry, [
    "exhibitionTime",
    "tenjiTime",
    "displayTime",
    "展示タイム"
  ], 6.85), 6.85);

  const exhibitionST = toNumber(getEntryValue(entry, [
    "exhibitionST",
    "tenjiST",
    "displayST",
    "展示ST"
  ], 0.16), 0.16);

  const lapTime = toNumber(getEntryValue(entry, [
    "lapTime",
    "turnTime",
    "oneLapTime",
    "一周タイム"
  ], 37.50), 37.50);

  const timeScore = normalize(exhibitionTime, 6.65, 7.10, true);
  const stScore = normalize(exhibitionST, 0.05, 0.25, true);
  const lapScore = normalize(lapTime, 36.0, 39.0, true);
  const exhibitionRank = toNumber(getEntryValue(entry, [
  "exhibitionRank",
  "tenjiRank",
  "展示順位"
], 4), 4);

let rankBonus = 0;

switch (exhibitionRank) {
  case 1:
    rankBonus = 8;
    break;
  case 2:
    rankBonus = 6;
    break;
  case 3:
    rankBonus = 4;
    break;
  case 4:
    rankBonus = 2;
    break;
  default:
    rankBonus = 0;
}
  return clamp(round(
    timeScore * 0.45 +
    stScore * 0.25 +
    lapScore * 0.20 +
    rankBonus,
    1
));
}

  function calcMotorScore(entry) {
    const motor2 = toNumber(getEntryValue(entry, [
      "motor2", "motor2Rate", "motorWin2", "motorTwoRate", "モーター2連率"
    ], 30), 30);

    const motor3 = toNumber(getEntryValue(entry, [
      "motor3", "motor3Rate", "motorWin3", "motorThreeRate", "モーター3連率"
    ], motor2 + 15), motor2 + 15);

    const boat2 = toNumber(getEntryValue(entry, [
      "boat2", "boat2Rate", "boatTwoRate", "ボート2連率"
    ], 30), 30);

    const motor2Score = normalize(motor2, 15, 60);
    const motor3Score = normalize(motor3, 25, 75);
    const boatScore = normalize(boat2, 15, 60);

    return round(
      motor2Score * 0.50 +
      motor3Score * 0.30 +
      boatScore * 0.20,
      1
    );
  }

  function calcLocalScore(entry) {
    const localWin = toNumber(getEntryValue(entry, [
      "localWinRate", "localRate", "当地勝率"
    ], 5.0), 5.0);

    const local2 = toNumber(getEntryValue(entry, [
      "local2Rate", "localTwoRate", "当地2連率"
    ], 30), 30);

    const local3 = toNumber(getEntryValue(entry, [
      "local3Rate", "localThreeRate", "当地3連率"
    ], local2 + 15), local2 + 15);

    const winScore = normalize(localWin, 3.0, 8.5);
    const twoScore = normalize(local2, 10, 65);
    const threeScore = normalize(local3, 25, 85);

    return round(
      winScore * 0.45 +
      twoScore * 0.30 +
      threeScore * 0.25,
      1
    );
  }

  function calcRoadScore(entry) {
    const nationalWin = toNumber(getEntryValue(entry, [
      "winRate", "nationalWinRate", "rate", "全国勝率"
    ], 5.0), 5.0);

    const national3 = toNumber(getEntryValue(entry, [
      "threeRate", "national3Rate", "全国3連率"
    ], 45), 45);

    const classScore = scoreClass(entry.class);

    const winScore = normalize(nationalWin, 3.0, 8.5);
    const threeScore = normalize(national3, 20, 85);

    return round(
      winScore * 0.35 +
      threeScore * 0.30 +
      classScore * 0.35,
      1
    );
  }

  function calcAttackScore(entry) {
    const stScore = calcSTScore(entry);
    const exhibitionScore = calcExhibitionScore(entry);
    const classScore = scoreClass(entry.class);

    const courseBonus = {
      1: 4,
      2: 2,
      3: 7,
      4: 6,
      5: 4,
      6: 2
    }[entry.boatNo] || 0;

    return clamp(round(
      stScore * 0.42 +
      exhibitionScore * 0.33 +
      classScore * 0.20 +
      courseBonus,
      1
    ));
  }

  function calcFlowScore(entry) {
    const attack = calcAttackScore(entry);
    const road = calcRoadScore(entry);
    const local = calcLocalScore(entry);

    const courseBonus = {
      1: 8,
      2: 7,
      3: 6,
      4: 6,
      5: 4,
      6: 3
    }[entry.boatNo] || 0;

    return clamp(round(
      attack * 0.30 +
      road * 0.30 +
      local * 0.25 +
      courseBonus,
      1
    ));
  }

  function calcTotalScore(entry, weights = DEFAULT_WEIGHTS) {
    const scores = {
      attack: calcAttackScore(entry),
      flow: calcFlowScore(entry),
      road: calcRoadScore(entry),
      local: calcLocalScore(entry),
      exhibition: calcExhibitionScore(entry),
      st: calcSTScore(entry),
      motor: calcMotorScore(entry)
    };

    const totalWeight = Object.values(weights).reduce((sum, v) => sum + v, 0);

    const total =
      Object.keys(weights).reduce((sum, key) => {
        return sum + scores[key] * weights[key];
      }, 0) / totalWeight;

    return {
      ...scores,
      total: clamp(round(total, 1))
    };
  }

  function analyzeEntriesBasic(data, weights = DEFAULT_WEIGHTS) {
    return buildBaseEntries(data).map((entry) => {
      const indexes = calcTotalScore(entry, weights);

      return {
        ...entry,
        indexes,
        totalScore: indexes.total
      };
    }).sort((a, b) => b.totalScore - a.totalScore);
  }

  Object.assign(ChappyAICore, {
    weights: {
      DEFAULT_WEIGHTS
    },

    scoring: {
      getEntryValue,
      scoreClass,
      calcSTScore,
      calcExhibitionScore,
      calcMotorScore,
      calcLocalScore,
      calcRoadScore,
      calcAttackScore,
      calcFlowScore,
      calcTotalScore,
      analyzeEntriesBasic
    }
  });
    /* ===============================
    Part 3 / 5
    24場補正 + 新型エンジン補正
  =============================== */

  const VENUE_PROFILE = {
  "01": { name:"桐生", key:"kiryu", type:"lake", night:true,  inPower:68, sashiPower:58, makuriPower:48, kadoPower:46, outsidePower:42, rough:42, road:58 },
  "02": { name:"戸田", key:"toda", type:"river", night:false, inPower:48, sashiPower:72, makuriPower:68, kadoPower:70, outsidePower:58, rough:70, road:66 },
  "03": { name:"江戸川", key:"edogawa", type:"river", night:false, inPower:42, sashiPower:78, makuriPower:72, kadoPower:74, outsidePower:68, rough:92, road:82 },
  "04": { name:"平和島", key:"heiwajima", type:"sea", night:false, inPower:52, sashiPower:64, makuriPower:62, kadoPower:60, outsidePower:56, rough:70, road:66 },
  "05": { name:"多摩川", key:"tamagawa", type:"river", night:false, inPower:58, sashiPower:60, makuriPower:58, kadoPower:58, outsidePower:52, rough:52, road:58 },
  "06": { name:"浜名湖", key:"hamanako", type:"lake", night:false, inPower:54, sashiPower:62, makuriPower:60, kadoPower:60, outsidePower:56, rough:62, road:64 },
  "07": { name:"蒲郡", key:"gamagori", type:"sea", night:true, inPower:62, sashiPower:56, makuriPower:54, kadoPower:56, outsidePower:48, rough:50, road:60 },
  "08": { name:"常滑", key:"tokoname", type:"sea", night:false, inPower:56, sashiPower:58, makuriPower:60, kadoPower:60, outsidePower:52, rough:58, road:60 },
  "09": { name:"津", key:"tsu", type:"sea", night:false, inPower:58, sashiPower:58, makuriPower:60, kadoPower:58, outsidePower:50, rough:54, road:58 },
  "10": { name:"三国", key:"mikuni", type:"sea", night:false, inPower:64, sashiPower:54, makuriPower:52, kadoPower:52, outsidePower:46, rough:50, road:56 },
  "11": { name:"びわこ", key:"biwako", type:"lake", night:false, inPower:50, sashiPower:72, makuriPower:66, kadoPower:68, outsidePower:60, rough:72, road:70 },
  "12": { name:"住之江", key:"suminoe", type:"city", night:true, inPower:66, sashiPower:54, makuriPower:52, kadoPower:54, outsidePower:46, rough:42, road:56 },
  "13": { name:"尼崎", key:"amagasaki", type:"city", night:false, inPower:62, sashiPower:56, makuriPower:54, kadoPower:54, outsidePower:48, rough:44, road:54 },
  "14": { name:"鳴門", key:"naruto", type:"sea", night:false, inPower:52, sashiPower:74, makuriPower:66, kadoPower:68, outsidePower:60, rough:76, road:72 },
  "15": { name:"丸亀", key:"marugame", type:"sea", night:true, inPower:64, sashiPower:56, makuriPower:58, kadoPower:58, outsidePower:50, rough:50, road:58 },
  "16": { name:"児島", key:"kojima", type:"sea", night:false, inPower:60, sashiPower:58, makuriPower:56, kadoPower:56, outsidePower:50, rough:56, road:60 },
  "17": { name:"宮島", key:"miyajima", type:"sea", night:false, inPower:58, sashiPower:68, makuriPower:62, kadoPower:62, outsidePower:56, rough:68, road:66 },
  "18": { name:"徳山", key:"tokuyama", type:"sea", night:false, inPower:70, sashiPower:50, makuriPower:48, kadoPower:48, outsidePower:42, rough:42, road:54 },
  "19": { name:"下関", key:"shimonoseki", type:"sea", night:true, inPower:66, sashiPower:54, makuriPower:54, kadoPower:56, outsidePower:48, rough:48, road:58 },
  "20": { name:"若松", key:"wakamatsu", type:"sea", night:true, inPower:58, sashiPower:74, makuriPower:68, kadoPower:70, outsidePower:62, rough:72, road:82 },
  "21": { name:"芦屋", key:"ashiya", type:"sea", night:false, inPower:68, sashiPower:52, makuriPower:50, kadoPower:52, outsidePower:44, rough:44, road:54 },
  "22": { name:"福岡", key:"fukuoka", type:"sea", night:false, inPower:50, sashiPower:76, makuriPower:70, kadoPower:68, outsidePower:62, rough:82, road:78 },
  "23": { name:"唐津", key:"karatsu", type:"sea", night:false, inPower:66, sashiPower:54, makuriPower:52, kadoPower:52, outsidePower:46, rough:46, road:56 },
  "24": { name:"大村", key:"omura", type:"sea", night:true, inPower:76, sashiPower:64, makuriPower:62, kadoPower:52, outsidePower:40, rough:38, road:54 }
};

  const VENUE_NAME_TO_CODE = Object.keys(VENUE_PROFILE).reduce((map, code) => {
    const v = VENUE_PROFILE[code];
    map[v.name] = code;
    map[v.key] = code;
    return map;
  }, {});

  const NEW_ENGINE_VENUES = {
    "24": true,
    "05": true
  };

  function getVenueCode(data) {
    const raw =
      data?.stadiumCode ??
      data?.jcd ??
      data?.venueCode ??
      data?.raceInfo?.stadiumCode ??
      data?.raceInfo?.jcd ??
      "";

    const code = String(raw).padStart(2, "0");
    if (VENUE_PROFILE[code]) return code;

    const name =
      data?.stadiumName ??
      data?.venueName ??
      data?.place ??
      data?.raceInfo?.stadiumName ??
      data?.raceInfo?.place ??
      "";

    return VENUE_NAME_TO_CODE[safeText(name, "")] || "24";
  }

  function getVenueProfile(data) {
    const code = getVenueCode(data);
    return {
      code,
      ...VENUE_PROFILE[code]
    };
  }

  function isNewEngineRace(data) {
    const code = getVenueCode(data);

    const explicit =
      data?.isNewEngine ??
      data?.newEngine ??
      data?.raceInfo?.isNewEngine ??
      data?.raceInfo?.newEngine;

    if (!isNil(explicit)) return Boolean(explicit);

    return Boolean(NEW_ENGINE_VENUES[code]);
  }

  function getWeatherInfo(data) {
    const weather = data?.weather || data?.condition || data?.raceInfo?.weather || {};

    return {
      windSpeed: toNumber(weather.windSpeed ?? weather.wind ?? weather.風速, 0),
      wave: toNumber(weather.wave ?? weather.waveHeight ?? weather.波高, 0),
      temperature: toNumber(weather.temperature ?? weather.temp ?? weather.気温, 20),
      waterTemperature: toNumber(weather.waterTemperature ?? weather.waterTemp ?? weather.水温, 20),
      windDirection: safeText(weather.windDirection ?? weather.windDir ?? weather.風向, "")
    };
  }

  function buildVenueWeights(data) {
  const venue = getVenueProfile(data);
  const weather = getWeatherInfo(data);
  const newEngine = isNewEngineRace(data);

  const weights = { ...DEFAULT_WEIGHTS };

  // イン有利
  if (venue.inPower >= 65) {
    weights.flow += 3;
    weights.local += 2;
  }

  // 差し補正
  if (venue.sashiPower >= 65) {
    weights.flow += 3;
    weights.road += 2;
  }

  // まくり補正
  if (venue.makuriPower >= 65) {
    weights.attack += 3;
  }

  // カド補正
  if (venue.kadoPower >= 65) {
    weights.attack += 2;
    weights.flow += 1;
  }

  // 外枠補正
  if (venue.outsidePower >= 60) {
    weights.road += 3;
    weights.flow += 2;
  }

  // 荒水面
  if (venue.rough >= 70) {
    weights.exhibition += 3;
    weights.road += 3;
    weights.motor -= 2;
  }

  // 風補正
  if (weather.windSpeed >= 3) {
    weights.exhibition += 2;
  }

  if (weather.windSpeed >= 5) {
    weights.exhibition += 2;
    weights.road += 3;
    weights.flow += 2;
  }

  // 波補正
  if (weather.wave >= 5) {
    weights.road += 2;
    weights.local += 2;
  }

  // 新型エンジン補正
  if (newEngine) {
    weights.motor -= 5;
    weights.exhibition += 3;
    weights.st += 3;
    weights.local += 2;
    weights.road += 2;
  }

  // 最低値保証
  Object.keys(weights).forEach((key) => {
    weights[key] = Math.max(1, weights[key]);
  });

  return weights;
}

  function applyVenueBonusToIndexes(entry, indexes, data) {

  const venue = getVenueProfile(data);
  const weather = getWeatherInfo(data);
  const newEngine = isNewEngineRace(data);

  const next = { ...indexes };

  const boatNo = entry.boatNo;

  // イン有利
  if (boatNo === 1 && venue.inPower >= 70) {
    next.flow += 6;
    next.total += 3;
  }

  // 差し場
  if (boatNo === 2 && venue.sashiPower >= 65) {
    next.attack += 4;
    next.flow += 4;
    next.total += 2;
  }

  // まくり場
  if (boatNo === 3 && venue.makuriPower >= 65) {
    next.attack += 6;
    next.total += 3;
  }

  // カド場
  if (boatNo === 4 && venue.kadoPower >= 65) {
    next.attack += 5;
    next.flow += 3;
    next.total += 3;
  }

  // 外枠有利
  if (boatNo >= 5 && venue.outsidePower >= 60) {
    next.road += 5;
    next.flow += 3;
    next.total += 2;
  }

  // 荒水面
  if (venue.rough >= 70) {
    next.exhibition += 3;
    next.road += 3;
    next.total += 2;
  }

  // 強風
  if (weather.windSpeed >= 5) {
    next.exhibition += 3;
    next.road += 3;
    next.total += 2;
  }

  // 高波
  if (weather.wave >= 5) {
    next.road += 2;
    next.local += 2;
  }

  // 新型エンジン
  if (newEngine) {
    next.motor -= 5;
    next.exhibition += 4;
    next.st += 2;
    next.total += 1;
  }

  Object.keys(next).forEach((key) => {
    next[key] = clamp(round(next[key], 1));
  });

  return next;
}

  function analyzeEntriesWithVenue(data) {
    const weights = buildVenueWeights(data);

    return buildBaseEntries(data).map((entry) => {
      const baseIndexes = calcTotalScore(entry, weights);
      const indexes = applyVenueBonusToIndexes(entry, baseIndexes, data);

      return {
        ...entry,
        indexes,
        totalScore: indexes.total,
        venue: getVenueProfile(data),
        newEngine: isNewEngineRace(data)
      };
    }).sort((a, b) => b.totalScore - a.totalScore);
  }

  Object.assign(ChappyAICore, {
    venue: {
      VENUE_PROFILE,
      VENUE_NAME_TO_CODE,
      NEW_ENGINE_VENUES,
      getVenueCode,
      getVenueProfile,
      isNewEngineRace,
      getWeatherInfo,
      buildVenueWeights,
      applyVenueBonusToIndexes,
      analyzeEntriesWithVenue
    }
  });
    /* ===============================
    Part 4 / 5
    AI順位・注目艇・役割分類
  =============================== */

  function rankEntries(entries) {
    return safeArray(entries)
      .slice()
      .sort((a, b) => {
        const ta = toNumber(a?.totalScore ?? a?.indexes?.total, 0);
        const tb = toNumber(b?.totalScore ?? b?.indexes?.total, 0);
        return tb - ta;
      })
      .map((entry, index) => ({
        ...entry,
        aiRank: index + 1
      }));
  }

  function getTopEntries(entries, count = 3) {
    return rankEntries(entries).slice(0, count);
  }

  function pickByIndex(entries, key, count = 1) {
    return safeArray(entries)
      .slice()
      .sort((a, b) => {
        const av = toNumber(a?.indexes?.[key], 0);
        const bv = toNumber(b?.indexes?.[key], 0);
        return bv - av;
      })
      .slice(0, count);
  }

  function getMainRole(entry, allEntries) {
    const indexes = entry?.indexes || {};
    const boatNo = entry?.boatNo;

    const topAttack = pickByIndex(allEntries, "attack", 1)[0]?.boatNo;
    const topRoad = pickByIndex(allEntries, "road", 1)[0]?.boatNo;
    const topLocal = pickByIndex(allEntries, "local", 1)[0]?.boatNo;
    const topFlow = pickByIndex(allEntries, "flow", 1)[0]?.boatNo;

    if (boatNo === topAttack && indexes.attack >= 70) return "攻め艇🔥";
    if (boatNo === topFlow && indexes.flow >= 70) return "展開艇🌊";
    if (boatNo === topRoad && indexes.road >= 70) return "道中艇⚡";
    if (boatNo === topLocal && indexes.local >= 70) return "当地巧者🏠";

    if (indexes.attack >= 75) return "攻め候補🔥";
    if (indexes.road >= 75) return "道中候補⚡";
    if (indexes.local >= 75) return "当地候補🏠";
    if (indexes.flow >= 75) return "展開候補🌊";

    return "相手候補";
  }

  function classifyEntry(entry, rank, allEntries) {
    const total = toNumber(entry?.totalScore ?? entry?.indexes?.total, 0);
    const boatNo = entry?.boatNo;
    const indexes = entry?.indexes || {};

    let mark = "△";
    let label = "押さえ";

    if (rank === 1) {
      mark = "◎";
      label = "本命";
    } else if (rank === 2) {
      mark = "○";
      label = "対抗";
    } else if (rank === 3) {
      mark = "▲";
      label = "穴";
    } else if (total >= 65) {
      mark = "△";
      label = "押さえ";
    }

    const manshuPower =
      (boatNo >= 4 ? 12 : 0) +
      (indexes.road >= 75 ? 8 : 0) +
      (indexes.local >= 75 ? 6 : 0) +
      (indexes.attack >= 75 && boatNo >= 4 ? 6 : 0) +
      Math.max(0, 70 - total) * 0.3;

    const role = getMainRole(entry, allEntries);

    return {
      ...entry,
      mark,
      label,
      role,
      manshuPower: clamp(round(manshuPower, 1))
    };
  }

  function classifyEntries(entries) {
    const ranked = rankEntries(entries);

    return ranked.map((entry, index) => {
      return classifyEntry(entry, index + 1, ranked);
    });
  }

  function buildExpectedBoats(entries) {
    return rankEntries(entries).slice(0, 3).map((entry, index) => {
      return {
        rank: index + 1,
        boatNo: entry.boatNo,
        name: entry.name,
        score: entry.totalScore ?? entry.indexes?.total ?? 0,
        role: entry.role || getMainRole(entry, entries)
      };
    });
  }

  function buildRoleSummary(entries) {
    const ranked = classifyEntries(entries);

    const attack = pickByIndex(ranked, "attack", 1)[0];
    const flow = pickByIndex(ranked, "flow", 1)[0];
    const road = pickByIndex(ranked, "road", 1)[0];
    const local = pickByIndex(ranked, "local", 1)[0];

    return {
      attack: attack ? {
        boatNo: attack.boatNo,
        name: attack.name,
        score: attack.indexes.attack
      } : null,

      flow: flow ? {
        boatNo: flow.boatNo,
        name: flow.name,
        score: flow.indexes.flow
      } : null,

      road: road ? {
        boatNo: road.boatNo,
        name: road.name,
        score: road.indexes.road
      } : null,

      local: local ? {
        boatNo: local.boatNo,
        name: local.name,
        score: local.indexes.local
      } : null
    };
  }

  function buildManshuCandidates(entries) {
    return classifyEntries(entries)
      .slice()
      .sort((a, b) => b.manshuPower - a.manshuPower)
      .slice(0, 3)
      .map((entry, index) => ({
        rank: index + 1,
        boatNo: entry.boatNo,
        name: entry.name,
        manshuPower: entry.manshuPower,
        role: entry.role
      }));
  }

  function buildAiDashboard(data) {
    const analyzed = analyzeEntriesWithVenue(data);
    const classified = classifyEntries(analyzed);
    const top = getTopEntries(classified, 3);

    const avgTotal = average(classified.map((e) => e.totalScore), 50);
    const topScore = top[0]?.totalScore ?? 50;
    const scoreGap = top[0] && top[1]
      ? top[0].totalScore - top[1].totalScore
      : 0;

    const mainTrust = clamp(round(
      topScore * 0.65 +
      scoreGap * 2.2 +
      getVenueProfile(data).inPower * 0.15,
      1
    ));

    const manshuCandidates = buildManshuCandidates(classified);
    const manshuPower = clamp(round(
      average(manshuCandidates.map((e) => e.manshuPower), 35) +
      getVenueProfile(data).rough * 0.25,
      1
    ));

    return {
      version: CORE_VERSION,
      venue: getVenueProfile(data),
      newEngine: isNewEngineRace(data),
      weights: buildVenueWeights(data),

      entries: classified,
      ranking: rankEntries(classified),
      expectedBoats: buildExpectedBoats(classified),
      roleSummary: buildRoleSummary(classified),
      manshuCandidates,

      ai: {
        mainTrust,
        manshuPower,
        difficulty: mainTrust >= 80 ? "低" : mainTrust >= 65 ? "中" : "高",
        averageScore: round(avgTotal, 1),
        topScore: round(topScore, 1),
        scoreGap: round(scoreGap, 1)
      }
    };
  }

  Object.assign(ChappyAICore, {
    ranking: {
      rankEntries,
      getTopEntries,
      pickByIndex,
      getMainRole,
      classifyEntry,
      classifyEntries,
      buildExpectedBoats,
      buildRoleSummary,
      buildManshuCandidates,
      buildAiDashboard
    }
  });
    /* ===============================
    Part 5 / 5
    統合データ生成 + 外部呼び出し完成
  =============================== */

  function buildAiComment(dashboard) {
  const entries = buildBoatAnalysis(dashboard);
  const top = entries[0];
  const second = entries[1];
  const third = entries[2];
  const hole = entries.find((entry) => entry.boatNo >= 4 && entry.score >= 60) || entries[3];

  if (!top) {
    return "出走データ不足のため、AIコメントを生成できません。";
  }

  const parts = [];

  parts.push(
    `${top.boatNo}号艇${top.name}は総合${top.score}点で中心評価。${top.comment}`
  );

  if (second) {
    parts.push(
      `${second.boatNo}号艇${second.name}は${second.style}として相手筆頭。${(second.roleTags || []).join("・") || "バランス型"}。`
    );
  }

  if (third) {
    parts.push(
      `${third.boatNo}号艇${third.name}は3番手評価。${third.buffs?.[0] || "展開次第で連絡み"}。`
    );
  }

  if (hole) {
    parts.push(
      `穴では${hole.boatNo}号艇${hole.name}に注意。${(hole.roleTags || []).join("・") || "展開待ち"}で、3着拾いまで警戒。`
    );
  }

  const attackBoat = entries.find((entry) => entry.indexes?.attack >= 70);
  const roadBoat = entries.find((entry) => entry.indexes?.road >= 70 && entry.boatNo >= 4);
  const localBoat = entries.find((entry) => entry.indexes?.local >= 70);

  if (attackBoat) {
    parts.push(
      `展開面では${attackBoat.boatNo}号艇の攻め指数が高く、スリットから動く可能性がある。`
    );
  }

  if (roadBoat) {
    parts.push(
      `${roadBoat.boatNo}号艇は道中指数が高く、1マークで遅れても2・3着に拾う形がある。`
    );
  }

  if (localBoat) {
    parts.push(
      `${localBoat.boatNo}号艇は当地指数が高く、この水面での残しに注意。`
    );
  }

  return parts.join(" ");
}

  function buildIndexSummary(entries) {
    const ranked = rankEntries(entries);
    const top = ranked[0];

    return {
      attack: pickByIndex(ranked, "attack", 1)[0]?.indexes?.attack ?? 0,
      flow: pickByIndex(ranked, "flow", 1)[0]?.indexes?.flow ?? 0,
      road: pickByIndex(ranked, "road", 1)[0]?.indexes?.road ?? 0,
      local: pickByIndex(ranked, "local", 1)[0]?.indexes?.local ?? 0,
      exhibition: pickByIndex(ranked, "exhibition", 1)[0]?.indexes?.exhibition ?? 0,
      st: pickByIndex(ranked, "st", 1)[0]?.indexes?.st ?? 0,
      motor: pickByIndex(ranked, "motor", 1)[0]?.indexes?.motor ?? 0,
      total: top?.totalScore ?? 0
    };
  }

  function buildSheetEntries(entries) {
  return entries.map((entry, index) => {
    const idx = entry.indexes || {};

    const markList = ["◎", "○", "▲", "△", "☆", "注"];

    const buffs = [
      ...(entry.buffs || []),
      ...(entry.roleTags || [])
    ];

    const debuffs = [
      ...(entry.debuffs || [])
    ];

    return {
      boatNo: entry.boatNo,
      name: entry.name,
      class: entry.class || entry.raw?.class || "",
      mark: markList[index] || "注",
      label: entry.style || entry.label || "",
      role: entry.style || entry.role || "",
      score: entry.score || entry.totalScore || 0,
      indexes: idx,
      roleTags: entry.roleTags || [],
      buffs,
      debuffs,
      comment:
        entry.comment ||
        `${entry.style || "総合評価"}。総合${entry.score || entry.totalScore || 0}点。`
    };
  });
}
/* =========================================================
  Step1：各艇AI評価生成
========================================================= */

function buildBoatAnalysis(data) {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
　const slitEngine = buildSlitEngine(entries);

  return entries.map((boat) => {
    const boatNo = Number(boat.boatNo || boat.number || boat.course || 0);

    const st = Number(boat.avgSt || boat.averageSt || boat.st || 0.18);
    const nationalWin = Number(boat.nationalWinRate || boat.winRate || 0);
    const localWin = Number(boat.localWinRate || boat.localRate || 0);
    const motor2 = Number(boat.motor2Rate || boat.motorRate || 0);
    const exhibit = Number(boat.exhibitTime || boat.exhibitionTime || 0);

    let score = 50;
    const buffs = [];
    const debuffs = [];
    let attackIndex = 50;
    let flowIndex = 50;
    let roadIndex = 50;
    let localIndex = 50;
　　　const slit = slitEngine.stRanking.find(
  (item) => Number(item.number) === boatNo
);

if (slit) {

  score += slit.slitBonus || 0;

  if (slit.stRank === 1) {
    attackIndex += 10;
    flowIndex += 8;
  }

  else if (slit.stRank === 2) {
    attackIndex += 6;
    flowIndex += 5;
  }

  else if (slit.stRank >= 5) {
    attackIndex -= 5;
    flowIndex -= 4;
  }

}
}

    // コース補正
if (boatNo === 1) {
  score += 18;
  attackIndex += 8;
  flowIndex += 10;
  roadIndex += 4;
  buffs.push("イン有利");
} else if (boatNo === 2) {
  score += 8;
  attackIndex += 4;
  flowIndex += 9;
  roadIndex += 6;
  buffs.push("差し残し候補");
} else if (boatNo === 3) {
  score += 6;
  attackIndex += 12;
  flowIndex += 5;
  roadIndex += 5;
  buffs.push("攻め展開候補");
} else if (boatNo === 4) {
  score += 3;
  attackIndex += 10;
  flowIndex += 6;
  roadIndex += 6;
  buffs.push("カド攻め候補");
} else if (boatNo >= 5) {
  score -= 4;
  attackIndex += 3;
  flowIndex += 10;
  roadIndex += 12;
  buffs.push("展開待ち");
  debuffs.push("外枠不利");
}

    // ST評価
if (st > 0 && st <= 0.13) {
  score += 12;
  attackIndex += 14;
  flowIndex += 4;
  buffs.push("ST鋭い");
} else if (st <= 0.16) {
  score += 7;
  attackIndex += 8;
  flowIndex += 3;
  buffs.push("ST安定");
} else if (st >= 0.20) {
  score -= 8;
  attackIndex -= 10;
  flowIndex -= 4;
  debuffs.push("ST遅め");
}

    // 全国勝率
if (nationalWin >= 6.5) {
  score += 12;
  attackIndex += 7;
  flowIndex += 5;
  roadIndex += 10;
  buffs.push("選手技量上位");
} else if (nationalWin >= 5.5) {
  score += 7;
  attackIndex += 4;
  flowIndex += 3;
  roadIndex += 6;
  buffs.push("実力安定");
} else if (nationalWin > 0 && nationalWin < 4.5) {
  score -= 6;
  attackIndex -= 4;
  roadIndex -= 5;
  debuffs.push("勝率低め");
}

    // 当地勝率
if (localWin >= 6.5) {
  score += 9;
  localIndex += 18;
  roadIndex += 6;
  buffs.push("当地巧者");
} else if (localWin >= 5.5) {
  score += 5;
  localIndex += 10;
  roadIndex += 3;
  buffs.push("当地実績あり");
} else if (localWin > 0 && localWin < 4.5) {
  score -= 4;
  localIndex -= 8;
  debuffs.push("当地不安");
}
    // モーター評価
if (motor2 >= 40) {
  score += 8;
  attackIndex += 5;
  flowIndex += 5;
  roadIndex += 5;
  buffs.push("モーター上位");
} else if (motor2 >= 33) {
  score += 4;
  attackIndex += 3;
  flowIndex += 3;
  buffs.push("モーター並以上");
} else if (motor2 > 0 && motor2 < 25) {
  score -= 5;
  attackIndex -= 4;
  flowIndex -= 3;
  debuffs.push("モーター弱め");
}

    // 展示タイム評価
if (exhibit > 0 && exhibit <= 6.75) {
  score += 8;
  attackIndex += 6;
  flowIndex += 4;
  roadIndex += 4;
  buffs.push("展示気配◎");
} else if (exhibit > 0 && exhibit <= 6.85) {
  score += 4;
  attackIndex += 3;
  flowIndex += 2;
  buffs.push("展示気配○");
} else if (exhibit >= 6.95) {
  score -= 4;
  attackIndex -= 3;
  debuffs.push("展示気配ひと息");
}

    score = Math.max(1, Math.min(100, Math.round(score)));
    attackIndex = Math.max(1, Math.min(100, Math.round(attackIndex)));
    flowIndex = Math.max(1, Math.min(100, Math.round(flowIndex)));
    roadIndex = Math.max(1, Math.min(100, Math.round(roadIndex)));
    localIndex = Math.max(1, Math.min(100, Math.round(localIndex)));

    let style = "自在型";
    if (boatNo === 1) style = "逃げ型";
    if (boatNo === 2) style = "差し型";
    if (boatNo === 3) style = "まくり型";
    if (boatNo === 4) style = "カド攻め型";
    if (boatNo >= 5) style = "展開拾い型";

    const roleTags = [];

if (attackIndex >= 65) {
  roleTags.push("攻め艇🔥");
}

if (flowIndex >= 65) {
  roleTags.push("展開艇🌊");
}

if (roadIndex >= 65) {
  roleTags.push("道中艇⚡");
}

if (localIndex >= 65) {
  roleTags.push("当地巧者🏠");
}

if (boatNo === 1 && score >= 70) {
  roleTags.push("逃げ中心🚤");
}

if (boatNo === 2 && flowIndex >= 60) {
  roleTags.push("差し残し注意");
}

if (boatNo >= 5 && roadIndex >= 60) {
  roleTags.push("3着拾い注意");
}
    let comment = "総合的には押さえ評価。";
    if (score >= 85) comment = "中心候補。展開・数値ともに上位。";
    else if (score >= 75) comment = "相手筆頭。舟券には厚く入れたい。";
    else if (score >= 65) comment = "連絡み候補。展開次第で浮上。";
    else if (score >= 55) comment = "3着候補。拾い目で注意。";
    else comment = "条件待ち。強く買うには展開の助けが必要。";

    return {
      boatNo,
      name: boat.name || boat.playerName || "",
      score,
      indexes: {
  attack: attackIndex,
  flow: flowIndex,
  road: roadIndex,
  local: localIndex
},
      style,
      roleTags,
      buffs,
      debuffs,
      comment,
      raw: boat
    };
  }).sort((a, b) => b.score - a.score);
}

/* =========================================================
  Phase3 Step10
  スリットAI / buildSlitEngine()
========================================================= */

function buildSlitEngine(boats) {
  const list = safeArray(boats);
  const analyzed = list.map((boat) => {
    const course = Number(boat.course || boat.number || boat.waku || 0);
    const st = toNumber(
      boat.exhibitionST ??
      boat.tenjiST ??
      boat.st ??
      boat.avgST ??
      boat.averageST,
      0.18
    );

    const score = Math.round((0.25 - st) * 1000);
　　　let slitBonus = 0;

if (st <= 0.10) {
  slitBonus = 12;
} else if (st <= 0.12) {
  slitBonus = 10;
} else if (st <= 0.14) {
  slitBonus = 8;
} else if (st <= 0.16) {
  slitBonus = 5;
} else if (st >= 0.22) {
  slitBonus = -8;
}
    let startRankType = "普通";
    if (st <= 0.10) startRankType = "超速";
    else if (st <= 0.13) startRankType = "速い";
    else if (st <= 0.16) startRankType = "安定";
    else if (st >= 0.21) startRankType = "遅れ注意";

    return {
      number: boat.number || boat.waku || course,
      name: boat.name || boat.playerName || "",
      course,
      st,
      score,
      slitBonus,
      startRankType
    };
  });

  const sorted = [...analyzed].sort((a, b) => a.st - b.st);

  const withRank = analyzed.map((boat) => {
    const rank = sorted.findIndex((b) => b.number === boat.number) + 1;
    return {
      ...boat,
      stRank: rank
    };
  });

  const alerts = [];
  const dents = [];
  const attackCandidates = [];
  const stableStarters = [];

  withRank.forEach((boat) => {
    const inner = withRank.find((b) => b.course === boat.course - 1);
    const outer = withRank.find((b) => b.course === boat.course + 1);

    const innerGap = inner ? inner.st - boat.st : 0;
    const outerGap = outer ? outer.st - boat.st : 0;

    if (inner && Math.abs(innerGap) >= 0.10) {
      alerts.push({
        number: boat.number,
        type: "🚨スリットアラート",
        target: inner.number,
        gap: Math.abs(innerGap).toFixed(2),
        comment:
          innerGap > 0
            ? `${boat.number}号艇が${inner.number}号艇より大きく先行。攻め起点候補。`
            : `${boat.number}号艇は内の${inner.number}号艇に対して遅れ注意。`
      });
    }

    if (outer && Math.abs(outerGap) >= 0.10) {
      alerts.push({
        number: boat.number,
        type: "🚨スリットアラート",
        target: outer.number,
        gap: Math.abs(outerGap).toFixed(2),
        comment:
          outerGap > 0
            ? `${boat.number}号艇が${outer.number}号艇より大きく先行。外を止める可能性。`
            : `${boat.number}号艇は外の${outer.number}号艇に対して遅れ注意。`
      });
    }

    if (boat.st >= 0.21) {
      dents.push({
        number: boat.number,
        risk: "凹み予測",
        comment: `${boat.number}号艇はST遅れリスクあり。隣艇の攻め場になりやすい。`
      });
    }

    if (boat.st <= 0.13) {
      attackCandidates.push({
        number: boat.number,
        course: boat.course,
        comment: `${boat.number}号艇はスリット先行候補。攻めの起点になりやすい。`
      });
    }

    if (boat.st <= 0.16) {
      stableStarters.push({
        number: boat.number,
        comment: `${boat.number}号艇はST安定。隊形を崩しにくい。`
      });
    }
  });

  const fastest = sorted[0];
  const slowest = sorted[sorted.length - 1];

  const makuriBase =
    fastest && fastest.course >= 3
      ? Math.min(85, 45 + fastest.score)
      : fastest && fastest.course === 2
      ? Math.min(70, 35 + fastest.score)
      : 30;

  const sashiBase =
    fastest && fastest.course <= 2
      ? Math.min(80, 45 + fastest.score)
      : 35;

  const makuriSashiBase =
    fastest && fastest.course >= 4
      ? Math.min(80, 40 + fastest.score)
      : 30;

  let startTrigger = null;

  if (fastest) {
    if (fastest.course === 1) {
      startTrigger = {
        type: "イン主導",
        boat: fastest.number,
        comment: "1号艇がスリット優勢なら逃げ主導。"
      };
    } else if (fastest.course === 2) {
      startTrigger = {
        type: "差し起点",
        boat: fastest.number,
        comment: "2号艇がスリット優勢。差し抜け、差し残しに注意。"
      };
    } else if (fastest.course === 3) {
      startTrigger = {
        type: "まくり起点",
        boat: fastest.number,
        comment: "3号艇がスリット優勢。まくり・まくり差しの展開開始艇。"
      };
    } else if (fastest.course >= 4) {
      startTrigger = {
        type: "外攻め起点",
        boat: fastest.number,
        comment: `${fastest.number}号艇が外からスリット優勢。まくり差し・展開突きに注意。`
      };
    }
  }

  return {
    stRanking: sorted.map((boat, index) => ({
      rank: index + 1,
      number: boat.number,
      name: boat.name,
      st: boat.st,
      type: boat.startRankType
    })),

    slitAlerts: alerts,
    dentPredictions: dents,
    attackCandidates,
    stableStarters,

    fastestStarter: fastest || null,
    slowestStarter: slowest || null,

    makuriRate: Math.max(0, Math.round(makuriBase)),
    sashiRate: Math.max(0, Math.round(sashiBase)),
    makuriSashiRate: Math.max(0, Math.round(makuriSashiBase)),

    startTrigger,

    comment: buildSlitComment({
      fastest,
      slowest,
      alerts,
      makuriRate: Math.max(0, Math.round(makuriBase)),
      sashiRate: Math.max(0, Math.round(sashiBase)),
      makuriSashiRate: Math.max(0, Math.round(makuriSashiBase))
    })
  };
}

function buildSlitComment(data) {
  if (!data.fastest) {
    return "スリット情報が不足しているため、平均STベースで判定。";
  }

  const parts = [];

  parts.push(
    `スリット最速候補は${data.fastest.number}号艇。`
  );

  if (data.alerts && data.alerts.length > 0) {
    parts.push("隣艇との差が大きいスリットアラートあり。");
  }

  if (data.makuriRate >= 60) {
    parts.push("まくり展開の発生率が高め。");
  }

  if (data.sashiRate >= 60) {
    parts.push("差し展開も成立しやすい。");
  }

  if (data.makuriSashiRate >= 60) {
    parts.push("外のまくり差し・展開突きに注意。");
  }

  return parts.join(" ");
}



function buildRaceFlowEngine(boatAnalysis) {
  const sorted = [...boatAnalysis].sort((a, b) => a.boatNo - b.boatNo);

  const attackBoat =
    sorted.find((boat) => boat.indexes?.attack >= 70 && boat.boatNo >= 3) ||
    sorted.find((boat) => boat.boatNo === 3) ||
    sorted[2];

  const flowBoats = sorted
    .filter((boat) => boat.indexes?.flow >= 60 || boat.indexes?.road >= 60)
    .sort((a, b) => {
      const ap = (a.indexes?.flow || 0) + (a.indexes?.road || 0);
      const bp = (b.indexes?.flow || 0) + (b.indexes?.road || 0);
      return bp - ap;
    })
    .slice(0, 3);

  const localBoats = sorted
    .filter((boat) => boat.indexes?.local >= 65)
    .sort((a, b) => (b.indexes?.local || 0) - (a.indexes?.local || 0));

  const riskBoats = sorted.filter((boat) => {
    return (
      (boat.debuffs || []).length >= 2 ||
      boat.score <= 55
    );
  });

  const scenarios = [];

  const one = sorted.find((boat) => boat.boatNo === 1);
  const two = sorted.find((boat) => boat.boatNo === 2);
  const three = sorted.find((boat) => boat.boatNo === 3);
  const four = sorted.find((boat) => boat.boatNo === 4);
  const five = sorted.find((boat) => boat.boatNo === 5);
  const six = sorted.find((boat) => boat.boatNo === 6);

  if (one) {
    scenarios.push({
      type: "本命展開",
      title: "1号艇逃げ中心",
      boats: [one.boatNo, two?.boatNo, three?.boatNo, four?.boatNo].filter(Boolean),
      comment: "1号艇が先マイできれば逃げ中心。2号艇の差し残し、3号艇の攻め残しが相手候補。"
    });
  }

  if (three && three.indexes?.attack >= 65) {
    scenarios.push({
      type: "攻め展開",
      title: "3号艇攻め",
      boats: [three.boatNo, one?.boatNo, two?.boatNo, five?.boatNo, six?.boatNo].filter(Boolean),
      comment: "3号艇の攻めが強い場合、内側の隊形が崩れやすい。2号艇は差し残し、5・6号艇は展開拾いで浮上。"
    });
  }

  if (four && four.indexes?.attack >= 65) {
    scenarios.push({
      type: "カド展開",
      title: "4号艇カド攻め",
      boats: [four.boatNo, one?.boatNo, five?.boatNo, six?.boatNo, two?.boatNo].filter(Boolean),
      comment: "4号艇がカドから踏み込めば一撃候補。外の5・6号艇は展開をもらいやすい。"
    });
  }

  if ((five && five.indexes?.road >= 65) || (six && six.indexes?.road >= 65)) {
    scenarios.push({
      type: "穴展開",
      title: "外枠の道中拾い",
      boats: [five?.boatNo, six?.boatNo, one?.boatNo, two?.boatNo].filter(Boolean),
      comment: "外枠に道中指数の高い艇がいるため、1マーク後の残しや2マーク逆転で3着浮上に注意。"
    });
  }

  return {
    attackBoat,
    flowBoats,
    localBoats,
    riskBoats,
    scenarios
  };
}

  function buildMainSheet(entries) {
  return buildSheetEntries(entries)
    .slice(0, 4)
    .map((entry, index) => {
      const marks = ["◎", "○", "▲", "△"];
      const idx = entry.indexes || {};

      const reasonParts = [];

      if (idx.attack >= 65) reasonParts.push("攻め指数高め");
      if (idx.flow >= 65) reasonParts.push("展開対応力あり");
      if (idx.road >= 65) reasonParts.push("道中で拾える");
      if (idx.local >= 65) reasonParts.push("当地適性あり");
      if ((entry.buffs || []).length) reasonParts.push(entry.buffs[0]);

      const reason = reasonParts.length
        ? reasonParts.join("・")
        : "総合バランスで上位評価";

      return {
        ...entry,
        mark: marks[index],
        reason,
        mainPoint: `${marks[index]} ${entry.boatNo}号艇 ${entry.name}`,
        indexText:
          `攻${idx.attack || 0} / 展${idx.flow || 0} / 道${idx.road || 0} / 当${idx.local || 0}`,
        shortComment:
          `${entry.style || "総合型"}。${reason}。`
      };
    });
}

  function buildManshuSheet(entries) {
  return buildSheetEntries(entries)
    .filter((entry) => entry.mark !== "◎")
    .map((entry) => {
      const idx = entry.indexes || {};

      let manshuScore = 0;
      const manshuReasons = [];

      if (entry.boatNo >= 4) {
        manshuScore += 18;
        manshuReasons.push("外寄りで人気が落ちやすい");
      }

      if (idx.attack >= 65) {
        manshuScore += 15;
        manshuReasons.push("攻め指数が高い");
      }

      if (idx.flow >= 65) {
        manshuScore += 12;
        manshuReasons.push("展開を拾える");
      }

      if (idx.road >= 65) {
        manshuScore += 15;
        manshuReasons.push("道中で残せる");
      }

      if (idx.local >= 65) {
        manshuScore += 10;
        manshuReasons.push("当地適性がある");
      }

      if ((entry.roleTags || []).includes("3着拾い注意")) {
        manshuScore += 10;
        manshuReasons.push("3着拾いの形がある");
      }

      if ((entry.debuffs || []).length >= 2) {
        manshuScore -= 8;
        manshuReasons.push("不安材料もある");
      }

      manshuScore = Math.max(1, Math.min(100, Math.round(manshuScore)));

      return {
        ...entry,
        manshuScore,
        manshuReasons,
        manshuPoint: `${entry.boatNo}号艇 ${entry.name}`,
        manshuType:
          idx.attack >= 70 ? "一撃型" :
          idx.road >= 70 ? "道中拾い型" :
          idx.flow >= 70 ? "展開待ち型" :
          "押さえ穴型",
        shortComment:
          manshuReasons.length
            ? manshuReasons.join("・")
            : "展開次第で穴候補。"
      };
    })
    .sort((a, b) => b.manshuScore - a.manshuScore)
    .slice(0, 4);
}

  function buildCoreTickets(entries) {
  const sheet = buildSheetEntries(entries);
  const top = sheet.slice(0, 4);

  if (top.length < 3) return [];

  const first = top[0];
  const second = top[1];
  const third = top[2];
  const fourth = top[3] || top[2];

  const makeTicket = (rank, combo, hit, value, reason) => ({
    rank,
    combo,
    hitRate: hit,
    valueRate: value,
    reason,
    comment: `${rank}評価。的中期待${hit}、回収期待${value}。${reason}`
  });

  const tickets = [
    makeTicket(
      "S",
      `${first.boatNo}-${second.boatNo}-${third.boatNo}`,
      "高",
      "中",
      `${first.boatNo}号艇を中心に、${second.boatNo}号艇と${third.boatNo}号艇を相手本線。`
    ),

    makeTicket(
      "A",
      `${first.boatNo}-${third.boatNo}-${second.boatNo}`,
      "中高",
      "中",
      `${third.boatNo}号艇の浮上を見た押さえ本線。`
    ),

    makeTicket(
      "B",
      `${second.boatNo}-${first.boatNo}-${third.boatNo}`,
      "中",
      "中高",
      `${second.boatNo}号艇が先に攻める展開なら逆転候補。`
    ),

    makeTicket(
      "C",
      `${third.boatNo}-${first.boatNo}-${fourth.boatNo}`,
      "低中",
      "高",
      `${third.boatNo}号艇の一撃と${fourth.boatNo}号艇の絡みで高配当狙い。`
    )
  ];

  return tickets;
}

  function buildPredictionCore(data) {
    const dashboard = buildAiDashboard(data);
    const entries = dashboard.entries;

    const boatAnalysis = buildBoatAnalysis(dashboard);

    return {
      aiCoreVersion: CORE_VERSION,

      venue: dashboard.venue,
      newEngine: dashboard.newEngine,
      weights: dashboard.weights,

      entries,
      
      boatAnalysis,
      
      ranking: dashboard.ranking,
      expectedBoats: dashboard.expectedBoats,
      roleSummary: dashboard.roleSummary,
      manshuCandidates: dashboard.manshuCandidates,

      indexes: buildIndexSummary(entries),
      slitEngine: buildSlitEngine(entries),

      ai: {
        ...dashboard.ai,
        trust: dashboard.ai.mainTrust,
        manshu: dashboard.ai.manshuPower,
        comment: buildAiComment(dashboard)
      },

      mainSheet: buildMainSheet(boatAnalysis),
      manshuSheet: buildManshuSheet(boatAnalysis),
      tickets: buildCoreTickets(boatAnalysis)
    };
  }

  function mergeWithPrediction(rawPrediction, data) {
    const core = buildPredictionCore(data);

    return {
      ...rawPrediction,
      aiCore: core,

      ai: {
        ...(rawPrediction?.ai || {}),
        ...(core.ai || {})
      },

      indexes: {
        ...(rawPrediction?.indexes || {}),
        ...(core.indexes || {})
      },

      expectedBoats: rawPrediction?.expectedBoats || core.expectedBoats,
      ranking: rawPrediction?.ranking || core.ranking,
      mainSheet: rawPrediction?.mainSheet || core.mainSheet,
      manshuSheet: rawPrediction?.manshuSheet || core.manshuSheet,
      tickets: rawPrediction?.tickets || core.tickets
    };
  }

  Object.assign(ChappyAICore, {
    buildAiComment,
    buildIndexSummary,
    buildSheetEntries,
    buildMainSheet,
    buildManshuSheet,
    buildCoreTickets,
    buildPredictionCore,
    mergeWithPrediction
  });
})();