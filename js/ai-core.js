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
    return (
      safeArray(data?.entries) ||
      safeArray(data?.racers) ||
      safeArray(data?.boats) ||
      safeArray(data?.entryList)
    );
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
      "exhibitionTime", "tenjiTime", "displayTime", "展示タイム"
    ], 6.85), 6.85);

    const lapTime = toNumber(getEntryValue(entry, [
      "lapTime", "turnTime", "oneLapTime", "一周タイム"
    ], 37.5), 37.5);

    const exhibitScore = normalize(exhibitionTime, 6.65, 7.10, true);
    const lapScore = normalize(lapTime, 36.0, 39.0, true);

    return round(
      exhibitScore * 0.65 +
      lapScore * 0.35,
      1
    );
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
    "01": { name: "桐生", key: "kiryu", type: "lake", night: true, inPower: 68, rough: 42, road: 58 },
    "02": { name: "戸田", key: "toda", type: "river", night: false, inPower: 48, rough: 70, road: 66 },
    "03": { name: "江戸川", key: "edogawa", type: "river", night: false, inPower: 42, rough: 92, road: 82 },
    "04": { name: "平和島", key: "heiwajima", type: "sea", night: false, inPower: 52, rough: 70, road: 66 },
    "05": { name: "多摩川", key: "tamagawa", type: "river", night: false, inPower: 58, rough: 52, road: 58 },
    "06": { name: "浜名湖", key: "hamanako", type: "lake", night: false, inPower: 54, rough: 62, road: 64 },
    "07": { name: "蒲郡", key: "gamagori", type: "sea", night: true, inPower: 62, rough: 50, road: 60 },
    "08": { name: "常滑", key: "tokoname", type: "sea", night: false, inPower: 56, rough: 58, road: 60 },
    "09": { name: "津", key: "tsu", type: "sea", night: false, inPower: 58, rough: 54, road: 58 },
    "10": { name: "三国", key: "mikuni", type: "sea", night: false, inPower: 64, rough: 50, road: 56 },
    "11": { name: "びわこ", key: "biwako", type: "lake", night: false, inPower: 50, rough: 72, road: 70 },
    "12": { name: "住之江", key: "suminoe", type: "city", night: true, inPower: 66, rough: 42, road: 56 },
    "13": { name: "尼崎", key: "amagasaki", type: "city", night: false, inPower: 62, rough: 44, road: 54 },
    "14": { name: "鳴門", key: "naruto", type: "sea", night: false, inPower: 52, rough: 76, road: 72 },
    "15": { name: "丸亀", key: "marugame", type: "sea", night: true, inPower: 64, rough: 50, road: 58 },
    "16": { name: "児島", key: "kojima", type: "sea", night: false, inPower: 60, rough: 56, road: 60 },
    "17": { name: "宮島", key: "miyajima", type: "sea", night: false, inPower: 58, rough: 68, road: 66 },
    "18": { name: "徳山", key: "tokuyama", type: "sea", night: false, inPower: 70, rough: 42, road: 54 },
    "19": { name: "下関", key: "shimonoseki", type: "sea", night: true, inPower: 66, rough: 48, road: 58 },
    "20": { name: "若松", key: "wakamatsu", type: "sea", night: true, inPower: 58, rough: 72, road: 82 },
    "21": { name: "芦屋", key: "ashiya", type: "sea", night: false, inPower: 68, rough: 44, road: 54 },
    "22": { name: "福岡", key: "fukuoka", type: "sea", night: false, inPower: 50, rough: 82, road: 78 },
    "23": { name: "唐津", key: "karatsu", type: "sea", night: false, inPower: 66, rough: 46, road: 56 },
    "24": { name: "大村", key: "omura", type: "sea", night: true, inPower: 76, rough: 38, road: 54 }
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

    if (venue.inPower >= 68) {
      weights.flow += 3;
      weights.local += 2;
      weights.attack -= 1;
    }

    if (venue.road >= 75) {
      weights.road += 5;
      weights.flow += 2;
    }

    if (venue.rough >= 70) {
      weights.exhibition += 3;
      weights.road += 3;
      weights.motor -= 2;
    }

    if (weather.windSpeed >= 5 || weather.wave >= 5) {
      weights.exhibition += 4;
      weights.road += 4;
      weights.flow += 2;
      weights.motor -= 2;
    }

    if (newEngine) {
      weights.exhibition += 5;
      weights.st += 3;
      weights.road += 2;
      weights.motor -= 5;
      weights.local += 1;
    }

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

    if (venue.inPower >= 68 && boatNo === 1) {
      next.flow += 5;
      next.total += 3;
    }

    if (venue.inPower <= 52 && boatNo >= 4) {
      next.attack += 3;
      next.total += 2;
    }

    if (venue.road >= 75 && boatNo >= 5) {
      next.road += 6;
      next.total += 3;
    }

    if (venue.rough >= 70 && boatNo >= 4) {
      next.exhibition += 3;
      next.road += 3;
      next.total += 2;
    }

    if (weather.windSpeed >= 5 || weather.wave >= 5) {
      next.exhibition += 3;
      next.road += 4;
      next.total += 2;
    }

    if (newEngine) {
      next.exhibition += 4;
      next.st += 2;
      next.motor -= 5;
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
    const top = dashboard?.expectedBoats?.[0];
    const second = dashboard?.expectedBoats?.[1];
    const venue = dashboard?.venue;

    const parts = [];

    if (top) {
      parts.push(`${top.boatNo}号艇が総合指数トップ`);
    }

    if (second) {
      parts.push(`${second.boatNo}号艇が相手筆頭`);
    }

    if (venue?.inPower >= 68) {
      parts.push(`${venue.name}はイン寄り補正`);
    }

    if (venue?.road >= 75) {
      parts.push(`${venue.name}は道中力も重視`);
    }

    if (dashboard?.newEngine) {
      parts.push("新型エンジン補正で展示・STを重視");
    }

    return parts.join("。") + "。";
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
    return classifyEntries(entries).map((entry) => {
      const idx = entry.indexes || {};

      const buffs = [];
      const debuffs = [];

      if (idx.attack >= 75) buffs.push(`攻め指数${idx.attack}`);
      if (idx.flow >= 75) buffs.push(`展開指数${idx.flow}`);
      if (idx.road >= 75) buffs.push(`道中指数${idx.road}`);
      if (idx.local >= 75) buffs.push(`当地指数${idx.local}`);
      if (idx.exhibition >= 75) buffs.push(`展示指数${idx.exhibition}`);
      if (idx.st >= 75) buffs.push(`ST指数${idx.st}`);

      if (idx.motor <= 40) debuffs.push(`モーター指数${idx.motor}`);
      if (idx.st <= 40) debuffs.push(`ST不安${idx.st}`);
      if (idx.exhibition <= 40) debuffs.push(`展示弱め${idx.exhibition}`);

      return {
        boatNo: entry.boatNo,
        name: entry.name,
        class: entry.class,
        mark: entry.mark,
        label: entry.label,
        role: entry.role,
        score: entry.totalScore,
        indexes: idx,
        buffs,
        debuffs,
        comment: `${entry.role}。総合${entry.totalScore}点で${entry.label}評価。`
      };
    });
  }

  function buildMainSheet(entries) {
    return buildSheetEntries(entries)
      .filter((entry) => ["◎", "○", "▲", "△"].includes(entry.mark))
      .slice(0, 4);
  }

  function buildManshuSheet(entries) {
    return buildSheetEntries(entries)
      .slice()
      .sort((a, b) => {
        const ap = toNumber(a.indexes?.road, 0) + toNumber(a.indexes?.local, 0) + (a.boatNo >= 4 ? 15 : 0);
        const bp = toNumber(b.indexes?.road, 0) + toNumber(b.indexes?.local, 0) + (b.boatNo >= 4 ? 15 : 0);
        return bp - ap;
      })
      .slice(0, 4)
      .map((entry) => ({
        ...entry,
        comment: `${entry.boatNo}号艇は${entry.role}として3着・穴絡みに注意。`
      }));
  }

  function buildCoreTickets(entries) {
    const ranked = rankEntries(entries);
    const a = ranked[0]?.boatNo;
    const b = ranked[1]?.boatNo;
    const c = ranked[2]?.boatNo;
    const d = ranked[3]?.boatNo;
    const e = ranked[4]?.boatNo;

    const tickets = [];

    if (a && b && c) {
      tickets.push({
        rank: "S",
        ticket: `${a}-${b}-${c}`,
        reason: "総合指数上位3艇の本線"
      });

      tickets.push({
        rank: "A",
        ticket: `${a}-${c}-${b}`,
        reason: "本命軸の相手入れ替え"
      });
    }

    if (b && a && c) {
      tickets.push({
        rank: "A",
        ticket: `${b}-${a}-${c}`,
        reason: "対抗の差し・攻め切り押さえ"
      });
    }

    if (a && b && d) {
      tickets.push({
        rank: "B",
        ticket: `${a}-${b}-${d}`,
        reason: "4番手評価の3着拾い"
      });
    }

    if (c && a && b) {
      tickets.push({
        rank: "B",
        ticket: `${c}-${a}-${b}`,
        reason: "穴艇の攻め展開"
      });
    }

    if (d && a && b) {
      tickets.push({
        rank: "C",
        ticket: `${d}-${a}-${b}`,
        reason: "展開崩れの穴"
      });
    }

    if (e && a && b) {
      tickets.push({
        rank: "C",
        ticket: `${e}-${a}-${b}`,
        reason: "外枠・道中拾いの穴"
      });
    }

    return tickets;
  }

  function buildPredictionCore(data) {
    const dashboard = buildAiDashboard(data);
    const entries = dashboard.entries;

    return {
      aiCoreVersion: CORE_VERSION,

      venue: dashboard.venue,
      newEngine: dashboard.newEngine,
      weights: dashboard.weights,

      entries,
      ranking: dashboard.ranking,
      expectedBoats: dashboard.expectedBoats,
      roleSummary: dashboard.roleSummary,
      manshuCandidates: dashboard.manshuCandidates,

      indexes: buildIndexSummary(entries),

      ai: {
        ...dashboard.ai,
        trust: dashboard.ai.mainTrust,
        manshu: dashboard.ai.manshuPower,
        comment: buildAiComment(dashboard)
      },

      mainSheet: buildMainSheet(entries),
      manshuSheet: buildManshuSheet(entries),
      tickets: buildCoreTickets(entries)
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