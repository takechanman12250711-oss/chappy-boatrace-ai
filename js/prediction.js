/* =========================================================
  チャッピーボートレースAI
  prediction.js 完成版 Part 1/7

  役割：
  - 予想AI本体
  - 情報 → 展開 → スコア → フォーメーション → 解説
  - render.js に渡す prediction オブジェクトを生成

  公開関数：
  - window.createPrediction(data)
========================================================= */

(function () {
  "use strict";

  /* ===============================
    基本定数
  =============================== */

  const VERSION = "prediction-v1.0.0";

  const BOAT_COLORS = {
    1: { name: "白", bg: "#ffffff", text: "#111111" },
    2: { name: "黒", bg: "#111111", text: "#ffffff" },
    3: { name: "赤", bg: "#e53935", text: "#ffffff" },
    4: { name: "青", bg: "#1e88e5", text: "#ffffff" },
    5: { name: "黄", bg: "#fdd835", text: "#111111" },
    6: { name: "緑", bg: "#43a047", text: "#ffffff" }
  };

  const DEFAULT_INDEX = {
    attack: 50,
    tenkai: 50,
    michu: 50,
    local: 50,
    total: 50,
    expected: 50
  };

  const COURSE_BASE = {
    1: {
      attack: 62,
      tenkai: 60,
      michu: 58,
      local: 55,
      expected: 44,
      comment: "インコース利"
    },
    2: {
      attack: 58,
      tenkai: 62,
      michu: 60,
      local: 55,
      expected: 54,
      comment: "2コース差し・残し"
    },
    3: {
      attack: 64,
      tenkai: 60,
      michu: 56,
      local: 53,
      expected: 60,
      comment: "センター攻め"
    },
    4: {
      attack: 62,
      tenkai: 61,
      michu: 58,
      local: 53,
      expected: 63,
      comment: "カド攻め・展開突き"
    },
    5: {
      attack: 54,
      tenkai: 62,
      michu: 64,
      local: 52,
      expected: 68,
      comment: "まくり差し・展開拾い"
    },
    6: {
      attack: 50,
      tenkai: 60,
      michu: 66,
      local: 52,
      expected: 72,
      comment: "道中拾い・高配当候補"
    }
  };

  const CLASS_BONUS = {
    A1: {
      attack: 12,
      tenkai: 9,
      michu: 12,
      local: 5,
      total: 8,
      expectedOuter: 10
    },
    A2: {
      attack: 7,
      tenkai: 6,
      michu: 7,
      local: 3,
      total: 5,
      expectedOuter: 5
    },
    B1: {
      attack: -2,
      tenkai: -1,
      michu: -2,
      local: 0,
      total: -2,
      expectedOuter: 2
    },
    B2: {
      attack: -5,
      tenkai: -4,
      michu: -5,
      local: 0,
      total: -5,
      expectedOuter: 1
    }
  };

  const NEW_ENGINE_PHASE = {
    NONE: "none",
    EARLY: "early",
    MIDDLE: "middle",
    LATE: "late"
  };

  const PLACE_CODE_MAP = {
    "01": "桐生",
    "02": "戸田",
    "03": "江戸川",
    "04": "平和島",
    "05": "多摩川",
    "06": "浜名湖",
    "07": "蒲郡",
    "08": "常滑",
    "09": "津",
    "10": "三国",
    "11": "びわこ",
    "12": "住之江",
    "13": "尼崎",
    "14": "鳴門",
    "15": "丸亀",
    "16": "児島",
    "17": "宮島",
    "18": "徳山",
    "19": "下関",
    "20": "若松",
    "21": "芦屋",
    "22": "福岡",
    "23": "唐津",
    "24": "大村"
  };

  /* ===============================
    24場の仮DB
    ※ 後で venueData.js に分離予定
  =============================== */

  const VENUE_BASE_DATA = {
    桐生: {
      water: "淡水",
      night: true,
      inPower: 73,
      sashi: 60,
      makuri: 55,
      makuriSashi: 58,
      tide: 20,
      wind: 55,
      rough: 45,
      memo: "淡水ナイター。インは強めだが、気温差と展示気配を重視。"
    },
    戸田: {
      water: "淡水",
      night: false,
      inPower: 55,
      sashi: 54,
      makuri: 68,
      makuriSashi: 63,
      tide: 10,
      wind: 62,
      rough: 65,
      memo: "狭水面。センター攻め、外の展開突きが怖い。"
    },
    江戸川: {
      water: "河川",
      night: false,
      inPower: 48,
      sashi: 50,
      makuri: 56,
      makuriSashi: 58,
      tide: 75,
      wind: 85,
      rough: 95,
      memo: "難水面。波・風・乗り心地・当地適性を最重視。"
    },
    平和島: {
      water: "海水",
      night: false,
      inPower: 58,
      sashi: 56,
      makuri: 63,
      makuriSashi: 65,
      tide: 60,
      wind: 68,
      rough: 67,
      memo: "イン絶対ではない。センター・ダッシュ勢の攻め注意。"
    },
    多摩川: {
      water: "淡水",
      night: false,
      inPower: 62,
      sashi: 55,
      makuri: 63,
      makuriSashi: 60,
      tide: 15,
      wind: 55,
      rough: 45,
      memo: "日本一の静水面系。スピードと展示気配を評価。"
    },
    浜名湖: {
      water: "汽水",
      night: false,
      inPower: 60,
      sashi: 57,
      makuri: 62,
      makuriSashi: 63,
      tide: 55,
      wind: 70,
      rough: 68,
      memo: "広い水面。風で外・センターの評価が変わる。"
    },
    蒲郡: {
      water: "海水",
      night: true,
      inPower: 72,
      sashi: 61,
      makuri: 56,
      makuriSashi: 60,
      tide: 50,
      wind: 55,
      rough: 50,
      memo: "ナイターでイン安定。展示と伸びを重視。"
    },
    常滑: {
      water: "海水",
      night: false,
      inPower: 64,
      sashi: 58,
      makuri: 60,
      makuriSashi: 62,
      tide: 50,
      wind: 65,
      rough: 62,
      memo: "海水面。風向きで差し・まくり差しが変化。"
    },
    津: {
      water: "海水",
      night: false,
      inPower: 65,
      sashi: 58,
      makuri: 58,
      makuriSashi: 61,
      tide: 45,
      wind: 65,
      rough: 60,
      memo: "イン寄りだが風の影響あり。"
    },
    三国: {
      water: "淡水",
      night: false,
      inPower: 70,
      sashi: 58,
      makuri: 56,
      makuriSashi: 58,
      tide: 10,
      wind: 55,
      rough: 45,
      memo: "イン強め。朝・昼の気配変化に注意。"
    },
    びわこ: {
      water: "淡水",
      night: false,
      inPower: 58,
      sashi: 55,
      makuri: 62,
      makuriSashi: 63,
      tide: 10,
      wind: 75,
      rough: 70,
      memo: "風・うねりで波乱あり。展示の乗り心地重視。"
    },
    住之江: {
      water: "淡水",
      night: true,
      inPower: 76,
      sashi: 62,
      makuri: 54,
      makuriSashi: 58,
      tide: 10,
      wind: 45,
      rough: 35,
      memo: "イン強いナイター。差し残りも評価。"
    },
    尼崎: {
      water: "淡水",
      night: false,
      inPower: 68,
      sashi: 60,
      makuri: 57,
      makuriSashi: 60,
      tide: 10,
      wind: 50,
      rough: 42,
      memo: "センプル水面。基本は内寄り。"
    },
    鳴門: {
      water: "海水",
      night: false,
      inPower: 60,
      sashi: 56,
      makuri: 62,
      makuriSashi: 64,
      tide: 65,
      wind: 72,
      rough: 70,
      memo: "潮・風の影響あり。まくり差し注意。"
    },
    丸亀: {
      water: "海水",
      night: true,
      inPower: 70,
      sashi: 60,
      makuri: 57,
      makuriSashi: 62,
      tide: 55,
      wind: 60,
      rough: 55,
      memo: "ナイター海水面。展示とターン足を重視。"
    },
    児島: {
      water: "海水",
      night: false,
      inPower: 66,
      sashi: 58,
      makuri: 59,
      makuriSashi: 62,
      tide: 60,
      wind: 60,
      rough: 58,
      memo: "潮汐あり。満潮・干潮で差し場変化。"
    },
    宮島: {
      water: "海水",
      night: false,
      inPower: 62,
      sashi: 57,
      makuri: 60,
      makuriSashi: 63,
      tide: 80,
      wind: 65,
      rough: 68,
      memo: "潮汐影響大。潮・風・展示気配を重視。"
    },
    徳山: {
      water: "海水",
      night: false,
      inPower: 78,
      sashi: 62,
      makuri: 52,
      makuriSashi: 57,
      tide: 45,
      wind: 50,
      rough: 42,
      memo: "イン強い。基本は1中心、相手探し。"
    },
    下関: {
      water: "海水",
      night: true,
      inPower: 72,
      sashi: 60,
      makuri: 56,
      makuriSashi: 61,
      tide: 55,
      wind: 58,
      rough: 55,
      memo: "ナイター海水面。内中心だが気配差で穴。"
    },
    若松: {
      water: "海水",
      night: true,
      inPower: 61,
      sashi: 58,
      makuri: 61,
      makuriSashi: 65,
      tide: 70,
      wind: 75,
      rough: 72,
      memo: "ナイター海水面。道中力・当地巧者の拾いに注意。"
    },
    芦屋: {
      water: "淡水",
      night: false,
      inPower: 74,
      sashi: 61,
      makuri: 55,
      makuriSashi: 58,
      tide: 10,
      wind: 50,
      rough: 42,
      memo: "モーニング系。イン強め、STと展示重視。"
    },
    福岡: {
      water: "河口",
      night: false,
      inPower: 55,
      sashi: 55,
      makuri: 62,
      makuriSashi: 65,
      tide: 78,
      wind: 78,
      rough: 82,
      memo: "河口水面。2マーク波乱・見えない波に注意。"
    },
    唐津: {
      water: "淡水",
      night: false,
      inPower: 73,
      sashi: 60,
      makuri: 55,
      makuriSashi: 58,
      tide: 15,
      wind: 50,
      rough: 42,
      memo: "モーニング。イン寄りで安定。"
    },
    大村: {
      water: "海水",
      night: true,
      inPower: 82,
      sashi: 66,
      makuri: 54,
      makuriSashi: 58,
      tide: 55,
      wind: 50,
      rough: 45,
      memo: "全国屈指のイン水面。ただし新型エンジン期は展示・今節ST・技量重視。"
    }
  };

  /* ===============================
    新型エンジン仮DB
    ※ 後で engineUpdateData.js に分離予定
  =============================== */

  const ENGINE_UPDATE_DATA = {
    大村: {
      updated: true,
      updateDate: "20250524",
      memo: "新型エンジン期。モーター数字を過信せず、展示・今節ST・技量・当地を重視。"
    },
    多摩川: {
      updated: true,
      updateDate: "",
      memo: "新エンジン期は数字より展示・実戦気配を重視。"
    }
  };

  /* ===============================
    メイン関数
  =============================== */

  function createPrediction(data) {
    const race = normalizeRaceData(data);

    const venue = analyzeVenue(race);
    const newEngine = analyzeNewEngine(race, venue);
    const weather = analyzeWeather(race, venue);
    const exhibition = analyzeExhibition(race);

    const indexes = calculateIndexes(race, {
      venue,
      newEngine,
      weather,
      exhibition
    });

    const raceFlow = createRaceFlow(race, {
      venue,
      newEngine,
      weather,
      exhibition,
      indexes
    });

    const mainSheet = createMainSheet(race, {
      venue,
      newEngine,
      weather,
      exhibition,
      indexes,
      raceFlow
    });

    const manshuSheet = createManshuSheet(race, {
      venue,
      newEngine,
      weather,
      exhibition,
      indexes,
      raceFlow,
      mainSheet
    });

    const formation = createFormation(race, {
      venue,
      newEngine,
      weather,
      exhibition,
      indexes,
      raceFlow,
      mainSheet,
      manshuSheet
    });

    const finalComment = createFinalComment(race, {
      venue,
      newEngine,
      weather,
      exhibition,
      indexes,
      raceFlow,
      mainSheet,
      manshuSheet,
      formation
    });

    return {
      ok: true,
      version: VERSION,
      race,
      venue,
      newEngine,
      weather,
      exhibition,
      indexes,
      raceFlow,
      mainSheet: {
        ...mainSheet,
        formation
      },
      manshuSheet,
      formation,
      finalComment
    };
  }

  /* ===============================
    データ正規化
  =============================== */

  function normalizeRaceData(data) {
    const raw = data || {};

    const stadiumCode = String(raw.stadiumCode || raw.jcd || "");
    const stadiumName =
      raw.stadiumName ||
      raw.place ||
      PLACE_CODE_MAP[stadiumCode] ||
      raw.raceInfo?.stadiumName ||
      raw.raceInfo?.place ||
      "";

    const raceNo = Number(raw.raceNo || raw.rno || raw.raceInfo?.raceNo || 0);
    const date = String(raw.date || raw.raceInfo?.date || "");

    const entries = normalizeEntries(raw.entries || []);
    const beforeInfo = normalizeBeforeInfo(raw.beforeInfo || []);
    const startExhibition = normalizeStartExhibition(raw.startExhibition || []);
    const weather = normalizeWeather(raw.weather || {});
    const raceInfo = raw.raceInfo || {};

    return {
      ok: true,
      stadiumCode,
      stadiumName,
      raceNo,
      date,
      raceInfo,
      entries,
      beforeInfo,
      startExhibition,
      weather,
      odds: raw.odds || null,
      missingNumbers: raw.missingNumbers || raw.missing || [],
      raw
    };
  }

  function normalizeEntries(entries) {
    if (!Array.isArray(entries)) return [];

    return entries.map((entry, index) => {
      const boatNo = toBoatNo(
        entry.boatNo ??
        entry.boat ??
        entry.waku ??
        entry.course ??
        index + 1
      );

      const national = {
        winRate: toNumber(entry.nationalWinRate ?? entry.national?.winRate ?? entry.national?.rate),
        secondRate: toPercentNumber(entry.national2Rate ?? entry.national?.secondRate ?? entry.national?.quinellaRate),
        thirdRate: toPercentNumber(entry.national3Rate ?? entry.national?.thirdRate ?? entry.national?.trioRate)
      };

      const local = {
        winRate: toNumber(entry.localWinRate ?? entry.local?.winRate ?? entry.local?.rate),
        secondRate: toPercentNumber(entry.local2Rate ?? entry.local?.secondRate ?? entry.local?.quinellaRate),
        thirdRate: toPercentNumber(entry.local3Rate ?? entry.local?.thirdRate ?? entry.local?.trioRate)
      };

      const motor = {
        no: entry.motorNo ?? entry.motor?.no ?? entry.motor?.number ?? "",
        secondRate: toPercentNumber(entry.motor2Rate ?? entry.motor?.secondRate ?? entry.motor?.quinellaRate),
        thirdRate: toPercentNumber(entry.motor3Rate ?? entry.motor?.thirdRate ?? entry.motor?.trioRate)
      };

      const boat = {
        no: entry.boatNumber ?? entry.boatNoValue ?? entry.boatData?.no ?? entry.boat?.no ?? "",
        secondRate: toPercentNumber(entry.boat2Rate ?? entry.boat?.secondRate ?? entry.boat?.quinellaRate),
        thirdRate: toPercentNumber(entry.boat3Rate ?? entry.boat?.thirdRate ?? entry.boat?.trioRate)
      };

      const currentSeries = normalizeCurrentSeries(entry.currentRace || entry.currentSeries || entry.series || {});

      return {
        boatNo,
        color: BOAT_COLORS[boatNo],

        racerName: safeString(entry.racerName || entry.name || entry.playerName),
        name: safeString(entry.racerName || entry.name || entry.playerName),

        registerNo: safeString(entry.registerNo || entry.registrationNo || entry.racerNo),
        className: safeString(entry.className || entry.class || entry.grade),
        branch: safeString(entry.branch),
        birthplace: safeString(entry.birthplace || entry.birthPlace || entry.hometown),
        age: safeString(entry.age),
        weight: safeString(entry.weight),
        fl: safeString(entry.fl || entry.flyingLate || ""),
        avgST: normalizeST(entry.avgST ?? entry.avgSt ?? entry.averageST ?? entry.st),

        national,
        local,
        motor,
        boat,
        currentSeries,

        exhibitionTime: toNumberOrNull(entry.exhibitionTime ?? entry.exhibition?.displayTime),
        exhibitionST: normalizeST(entry.exhibitionST ?? entry.exhibition?.st),
        tilt: safeString(entry.tilt ?? entry.exhibition?.tilt),

        raw: entry
      };
    });
  }

  function normalizeBeforeInfo(beforeInfo) {
    if (!Array.isArray(beforeInfo)) return [];

    return beforeInfo.map((item, index) => {
      const boatNo = toBoatNo(item.boatNo ?? item.boat ?? item.waku ?? index + 1);

      return {
        boatNo,
        exhibitionTime: toNumberOrNull(
          item.exhibitionTime ??
          item.displayTime ??
          item.exhibition?.displayTime ??
          item.exhibition?.time
        ),
        exhibitionST: normalizeST(
          item.exhibitionST ??
          item.displayST ??
          item.st ??
          item.exhibition?.st
        ),
        tilt: safeString(item.tilt ?? item.exhibition?.tilt),
        weight: safeString(item.weight ?? item.exhibition?.weight),
        lapTime: toNumberOrNull(
          item.lapTime ??
          item.oneLapTime ??
          item.exhibition?.lapTime ??
          item.exhibition?.oneLapTime
        ),
        partsExchange: safeString(item.partsExchange ?? item.parts ?? item.exhibition?.partsExchange),
        raw: item
      };
    });
  }

  function normalizeStartExhibition(startExhibition) {
    if (!Array.isArray(startExhibition)) return [];

    return startExhibition.map((item, index) => {
      const boatNo = toBoatNo(item.boatNo ?? item.boat ?? index + 1);

      return {
        boatNo,
        course: Number(item.course || boatNo),
        st: normalizeST(item.st ?? item.startTime),
        raw: item
      };
    });
  }

  function normalizeWeather(weather) {
    const w = weather || {};

    return {
      weather: safeString(w.weather || w.condition || w.天候),
      temperature: toNumberOrNull(w.temperature ?? w.temp ?? w.気温),
      windSpeed: toNumberOrNull(w.windSpeed ?? w.wind ?? w.風速),
      windDirection: safeString(w.windDirection ?? w.windDir ?? w.風向),
      waterTemperature: toNumberOrNull(w.waterTemperature ?? w.waterTemp ?? w.水温),
      waveHeight: toNumberOrNull(w.waveHeight ?? w.wave ?? w.波高),
      raw: w
    };
  }

  function normalizeCurrentSeries(current) {
    if (!current) return {};

    if (Array.isArray(current)) {
      return {
        results: current,
        text: current.join(" / ")
      };
    }

    if (typeof current === "string") {
      return {
        text: current
      };
    }

    return {
      ...current,
      results: current.results || current.result || current.着順 || [],
      st: current.st || current.ST || current.startTiming || current.スタート || [],
      text: current.text || ""
    };
  }

  /* ===============================
    場分析
  =============================== */

  function analyzeVenue(race) {
    const name = race.stadiumName || PLACE_CODE_MAP[race.stadiumCode] || "";
    const base = VENUE_BASE_DATA[name] || createDefaultVenueData(name);

    const isNight = Boolean(base.night);
    const inPower = clampScore(base.inPower);
    const sashi = clampScore(base.sashi);
    const makuri = clampScore(base.makuri);
    const makuriSashi = clampScore(base.makuriSashi);

    return {
      name,
      code: race.stadiumCode,
      water: base.water || "不明",
      night: isNight,
      inPower,
      sashi,
      makuri,
      makuriSashi,
      tideInfluence: clampScore(base.tide),
      windInfluence: clampScore(base.wind),
      roughInfluence: clampScore(base.rough),
      memo: base.memo || "場の基本傾向・風・波・展示を合わせて判断。",
      bias: createVenueBias(base),
      raw: base
    };
  }

  function createDefaultVenueData(name) {
    return {
      water: "不明",
      night: false,
      inPower: 62,
      sashi: 56,
      makuri: 58,
      makuriSashi: 60,
      tide: 40,
      wind: 55,
      rough: 50,
      memo: `${name || "この場"}は基本傾向・展示・気象を合わせて判断。`
    };
  }

  function createVenueBias(base) {
    const bias = [];

    if (base.inPower >= 72) bias.push("イン有利");
    if (base.inPower <= 58) bias.push("イン過信注意");
    if (base.sashi >= 62) bias.push("差し評価");
    if (base.makuri >= 62) bias.push("まくり警戒");
    if (base.makuriSashi >= 63) bias.push("まくり差し警戒");
    if (base.tide >= 65) bias.push("潮汐注意");
    if (base.wind >= 70) bias.push("風注意");
    if (base.rough >= 70) bias.push("波乱水面");

    if (!bias.length) bias.push("標準水面");

    return bias;
  }

  /* ===============================
    新型エンジン分析
  =============================== */

  function analyzeNewEngine(race, venue) {
    const venueName = venue?.name || race.stadiumName || "";
    const config = ENGINE_UPDATE_DATA[venueName] || {
      updated: false,
      updateDate: "",
      memo: "通常エンジン評価。モーター数字と展示をバランス評価。"
    };

    const phase = detectEnginePhase(race.date, config.updateDate, config.updated);

    const weights = createNewEngineWeights(phase);

    return {
      venueName,
      updated: Boolean(config.updated),
      updateDate: config.updateDate || "",
      phase,
      phaseLabel: createEnginePhaseLabel(phase),
      weights,
      memo: config.memo,
      rule: createNewEngineRuleText(phase)
    };
  }

  function detectEnginePhase(raceDate, updateDate, updated) {
    if (!updated || !updateDate) return NEW_ENGINE_PHASE.NONE;

    const diffDays = diffDateDays(updateDate, raceDate);

    if (diffDays === null) return NEW_ENGINE_PHASE.MIDDLE;
    if (diffDays <= 45) return NEW_ENGINE_PHASE.EARLY;
    if (diffDays <= 120) return NEW_ENGINE_PHASE.MIDDLE;
    return NEW_ENGINE_PHASE.LATE;
  }

  function createNewEngineWeights(phase) {
    if (phase === NEW_ENGINE_PHASE.EARLY) {
      return {
        motor: 0.45,
        exhibition: 1.35,
        current: 1.3,
        st: 1.25,
        skill: 1.2,
        local: 1.15,
        water: 1.15
      };
    }

    if (phase === NEW_ENGINE_PHASE.MIDDLE) {
      return {
        motor: 0.75,
        exhibition: 1.2,
        current: 1.18,
        st: 1.15,
        skill: 1.12,
        local: 1.1,
        water: 1.08
      };
    }

    if (phase === NEW_ENGINE_PHASE.LATE) {
      return {
        motor: 1.0,
        exhibition: 1.08,
        current: 1.08,
        st: 1.08,
        skill: 1.05,
        local: 1.05,
        water: 1.03
      };
    }

    return {
      motor: 1.0,
      exhibition: 1.0,
      current: 1.0,
      st: 1.0,
      skill: 1.0,
      local: 1.0,
      water: 1.0
    };
  }

  function createEnginePhaseLabel(phase) {
    if (phase === NEW_ENGINE_PHASE.EARLY) return "初期";
    if (phase === NEW_ENGINE_PHASE.MIDDLE) return "中期";
    if (phase === NEW_ENGINE_PHASE.LATE) return "後期";
    return "通常";
  }

  function createNewEngineRuleText(phase) {
    if (phase === NEW_ENGINE_PHASE.EARLY) {
      return "新型エンジン初期。モーター2連率・3連率は過信せず、展示・今節気配・ST・技量を上位評価。";
    }

    if (phase === NEW_ENGINE_PHASE.MIDDLE) {
      return "新型エンジン中期。モーター数字も見始めるが、展示・今節気配をまだ重視。";
    }

    if (phase === NEW_ENGINE_PHASE.LATE) {
      return "新型エンジン後期。モーター数字と展示をバランス評価。";
    }

    return "通常エンジン評価。モーター数字・展示・選手技量を総合評価。";
  }
    /* ===============================
    気象分析
  =============================== */

  function analyzeWeather(race, venue) {
    const weather = race.weather || {};

    const windSpeed = toNumberOrNull(weather.windSpeed);
    const waveHeight = toNumberOrNull(weather.waveHeight);
    const temperature = toNumberOrNull(weather.temperature);
    const waterTemperature = toNumberOrNull(weather.waterTemperature);

    let roughScore = 50;
    let insideRisk = 50;
    let outsideChance = 50;
    let pickupChance = 50;

    const buffs = [];
    const debuffs = [];

    if (windSpeed !== null) {
      if (windSpeed >= 7) {
        roughScore += 22;
        insideRisk += 16;
        outsideChance += 14;
        pickupChance += 14;
        debuffs.push(`風速${windSpeed}mでイン過信注意`);
        buffs.push("外・道中艇の拾い上昇");
      } else if (windSpeed >= 4) {
        roughScore += 12;
        insideRisk += 8;
        outsideChance += 7;
        pickupChance += 8;
        buffs.push(`風速${windSpeed}mで展開変化あり`);
      } else if (windSpeed <= 2) {
        roughScore -= 8;
        insideRisk -= 7;
        outsideChance -= 4;
        buffs.push("風弱めで内の安定感上昇");
      }
    }

    if (waveHeight !== null) {
      if (waveHeight >= 5) {
        roughScore += 20;
        insideRisk += 12;
        outsideChance += 10;
        pickupChance += 16;
        debuffs.push(`波高${waveHeight}cmで乗り心地差が出る`);
      } else if (waveHeight >= 3) {
        roughScore += 10;
        pickupChance += 8;
        buffs.push(`波高${waveHeight}cmで道中力を評価`);
      } else if (waveHeight <= 1) {
        roughScore -= 8;
        insideRisk -= 6;
      }
    }

    if (venue?.tideInfluence >= 65) {
      roughScore += 8;
      pickupChance += 8;
      outsideChance += 5;
      buffs.push("潮汐影響がある場");
    }

    if (venue?.roughInfluence >= 70) {
      roughScore += 8;
      pickupChance += 10;
      buffs.push("荒れやすい水面特性");
    }

    roughScore = clampScore(roughScore);
    insideRisk = clampScore(insideRisk);
    outsideChance = clampScore(outsideChance);
    pickupChance = clampScore(pickupChance);

    return {
      weather: weather.weather || "",
      windSpeed,
      windDirection: weather.windDirection || "",
      waveHeight,
      temperature,
      waterTemperature,
      roughScore,
      insideRisk,
      outsideChance,
      pickupChance,
      buffs,
      debuffs,
      comment: createWeatherComment({
        windSpeed,
        waveHeight,
        roughScore,
        insideRisk,
        outsideChance,
        pickupChance,
        venue
      })
    };
  }

  function createWeatherComment(params) {
    const windSpeed = params.windSpeed;
    const waveHeight = params.waveHeight;
    const roughScore = params.roughScore;
    const venue = params.venue;

    const parts = [];

    if (windSpeed !== null) {
      parts.push(`風速${windSpeed}m`);
    }

    if (waveHeight !== null) {
      parts.push(`波高${waveHeight}cm`);
    }

    if (venue?.tideInfluence >= 65) {
      parts.push("潮汐影響あり");
    }

    if (!parts.length) {
      return "気象データは薄め。基本は展示・ST・場傾向を優先。";
    }

    if (roughScore >= 72) {
      return `${parts.join(" / ")}。水面は荒れ寄りで、道中艇・当地巧者・外の拾いを上げる。`;
    }

    if (roughScore >= 60) {
      return `${parts.join(" / ")}。やや展開変化あり。内の残しと外の拾いを両方見る。`;
    }

    return `${parts.join(" / ")}。大きな荒れ要素は少なく、基本線はコースと展示で判断。`;
  }

  /* ===============================
    展示分析
  =============================== */

  function analyzeExhibition(race) {
    const entries = race.entries || [];
    const beforeInfo = race.beforeInfo || [];
    const startExhibition = race.startExhibition || [];

    const list = entries.map((entry, index) => {
      const boatNo = entry.boatNo || index + 1;
      const before = findByBoatNo(beforeInfo, boatNo);
      const start = findByBoatNo(startExhibition, boatNo);

      const exhibitionTime = toNumberOrNull(
        before?.exhibitionTime ??
        entry.exhibitionTime
      );

      const exhibitionST = normalizeST(
        before?.exhibitionST ??
        start?.st ??
        entry.exhibitionST
      );

      const exhibitionSTNumber = toSTNumber(exhibitionST);

      const lapTime = toNumberOrNull(before?.lapTime);
      const tilt = safeString(before?.tilt ?? entry.tilt);
      const weight = safeString(before?.weight ?? entry.weight);
      const partsExchange = safeString(before?.partsExchange);

      return {
        boatNo,
        name: entry.racerName || entry.name || "",
        exhibitionTime,
        exhibitionST,
        exhibitionSTNumber,
        lapTime,
        tilt,
        weight,
        partsExchange
      };
    });

    const exhibitionRank = rankSmallNumber(list, "exhibitionTime");
    const stRank = rankSmallNumber(list, "exhibitionSTNumber");
    const lapRank = rankSmallNumber(list, "lapTime");

    const enriched = list.map(item => {
      const exRank = exhibitionRank[item.boatNo] || null;
      const stR = stRank[item.boatNo] || null;
      const lapR = lapRank[item.boatNo] || null;

      const scoreData = calculateExhibitionScore(item, {
        exRank,
        stRank: stR,
        lapRank: lapR
      });

      return {
        ...item,
        exhibitionRank: exRank,
        stRank: stR,
        lapRank: lapR,
        score: scoreData.score,
        buffs: scoreData.buffs,
        debuffs: scoreData.debuffs,
        comment: scoreData.comment
      };
    });

    const topExhibition = [...enriched]
      .filter(v => v.exhibitionTime !== null)
      .sort((a, b) => a.exhibitionTime - b.exhibitionTime)[0] || null;

    const topST = [...enriched]
      .filter(v => v.exhibitionSTNumber !== null)
      .sort((a, b) => a.exhibitionSTNumber - b.exhibitionSTNumber)[0] || null;

    const topLap = [...enriched]
      .filter(v => v.lapTime !== null)
      .sort((a, b) => a.lapTime - b.lapTime)[0] || null;

    const doubleTimeBoat =
      topExhibition &&
      topLap &&
      topExhibition.boatNo === topLap.boatNo
        ? topExhibition
        : null;

    return {
      list: enriched,
      topExhibition,
      topST,
      topLap,
      doubleTimeBoat,
      comment: createExhibitionComment({
        topExhibition,
        topST,
        topLap,
        doubleTimeBoat
      })
    };
  }

  function calculateExhibitionScore(item, ranks) {
    let score = 50;
    const buffs = [];
    const debuffs = [];

    if (item.exhibitionTime !== null) {
      if (ranks.exRank === 1) {
        score += 16;
        buffs.push(`展示1位 ${item.exhibitionTime}`);
      } else if (ranks.exRank === 2) {
        score += 10;
        buffs.push(`展示2位 ${item.exhibitionTime}`);
      } else if (ranks.exRank === 3) {
        score += 5;
        buffs.push(`展示3位 ${item.exhibitionTime}`);
      }

      if (item.exhibitionTime >= 7.0) {
        score -= 8;
        debuffs.push(`展示重め ${item.exhibitionTime}`);
      }
    }

    if (item.exhibitionSTNumber !== null) {
      if (ranks.stRank === 1) {
        score += 12;
        buffs.push(`展示ST1位 ${formatST(item.exhibitionST)}`);
      } else if (ranks.stRank <= 3) {
        score += 6;
        buffs.push(`展示ST上位 ${formatST(item.exhibitionST)}`);
      }

      if (item.exhibitionSTNumber >= 0.25) {
        score -= 8;
        debuffs.push(`展示ST遅め ${formatST(item.exhibitionST)}`);
      }
    }

    if (item.lapTime !== null) {
      if (ranks.lapRank === 1) {
        score += 12;
        buffs.push(`一周1位 ${item.lapTime}`);
      } else if (ranks.lapRank <= 3) {
        score += 6;
        buffs.push(`一周上位 ${item.lapTime}`);
      }
    }

    if (String(item.tilt).includes("3")) {
      score += 8;
      buffs.push("チルト3度の一撃型");
    }

    score = clampScore(score);

    return {
      score,
      buffs,
      debuffs,
      comment: createExhibitionShortComment(item.boatNo, score, buffs, debuffs)
    };
  }

  function createExhibitionShortComment(boatNo, score, buffs, debuffs) {
    if (score >= 75) {
      return `${boatNo}号艇は展示気配上位。${buffs.slice(0, 2).join("、")}を評価。`;
    }

    if (score >= 62) {
      return `${boatNo}号艇は展示悪くない。連絡み候補。`;
    }

    if (debuffs.length) {
      return `${boatNo}号艇は${debuffs[0]}が気になる。`;
    }

    return `${boatNo}号艇は展示標準。展開次第。`;
  }

  function createExhibitionComment(params) {
    const parts = [];

    if (params.topExhibition) {
      parts.push(`展示タイム1位は${params.topExhibition.boatNo}号艇`);
    }

    if (params.topST) {
      parts.push(`展示ST1位は${params.topST.boatNo}号艇`);
    }

    if (params.topLap) {
      parts.push(`一周1位は${params.topLap.boatNo}号艇`);
    }

    if (params.doubleTimeBoat) {
      parts.push(`ダブルタイムは${params.doubleTimeBoat.boatNo}号艇`);
    }

    if (!parts.length) {
      return "展示データが薄いため、平均ST・成績・場傾向で補正。";
    }

    return `${parts.join(" / ")}。展示上位はスコアと展開評価に反映。`;
  }

  /* ===============================
    AI指数計算
  =============================== */

  function calculateIndexes(race, context) {
    const entries = race.entries || [];

    const scores = entries.map((entry, index) => {
      const boatNo = entry.boatNo || index + 1;

      const exhibitionItem = findByBoatNo(context.exhibition?.list || [], boatNo);

      const item = calculateBoatIndexes(entry, {
        race,
        boatNo,
        venue: context.venue,
        newEngine: context.newEngine,
        weather: context.weather,
        exhibition: exhibitionItem
      });

      return item;
    });

    const sorted = [...scores].sort((a, b) => b.total - a.total);

    return {
      scores: sorted,
      byBoat: toByBoatMap(scores),
      attackRanking: createRanking(scores, "attack"),
      tenkaiRanking: createRanking(scores, "tenkai"),
      michuRanking: createRanking(scores, "michu"),
      localRanking: createRanking(scores, "local"),
      expectedRanking: createRanking(scores, "expected"),
      totalRanking: createRanking(scores, "total")
    };
  }

  function calculateBoatIndexes(entry, params) {
    const boatNo = params.boatNo;
    const base = COURSE_BASE[boatNo] || DEFAULT_INDEX;
    const weights = params.newEngine?.weights || createNewEngineWeights(NEW_ENGINE_PHASE.NONE);

    let attack = base.attack;
    let tenkai = base.tenkai;
    let michu = base.michu;
    let local = base.local;
    let expected = base.expected;

    const buffs = [];
    const debuffs = [];

    buffs.push(base.comment);

    const classBonus = getClassBonus(entry.className);

    attack += classBonus.attack * weights.skill;
    tenkai += classBonus.tenkai * weights.skill;
    michu += classBonus.michu * weights.skill;
    local += classBonus.local * weights.skill;

    if (boatNo >= 4) {
      expected += classBonus.expectedOuter;
    }

    if (String(entry.className).includes("A1")) {
      buffs.push("A1格上");
    } else if (String(entry.className).includes("A2")) {
      buffs.push("A2安定");
    } else if (String(entry.className).includes("B")) {
      debuffs.push("級別は控えめ");
    }

    const avgSTNumber = toSTNumber(entry.avgST);

    if (avgSTNumber !== null) {
      if (avgSTNumber <= 0.13) {
        attack += 15 * weights.st;
        tenkai += 8 * weights.st;
        expected += 6;
        buffs.push(`ST速い ${formatST(entry.avgST)}`);
      } else if (avgSTNumber <= 0.16) {
        attack += 9 * weights.st;
        tenkai += 5 * weights.st;
        buffs.push(`ST安定 ${formatST(entry.avgST)}`);
      } else if (avgSTNumber >= 0.20) {
        attack -= 10 * weights.st;
        tenkai -= 5 * weights.st;
        debuffs.push(`ST遅め ${formatST(entry.avgST)}`);
      }
    }

    const nationalWinRate = toNumberOrNull(entry.national?.winRate);
    const localWinRate = toNumberOrNull(entry.local?.winRate);
    const motor2Rate = toNumberOrNull(entry.motor?.secondRate);
    const boat2Rate = toNumberOrNull(entry.boat?.secondRate);

    if (nationalWinRate !== null && nationalWinRate > 0) {
      const bonus = nationalWinRate * 2;
      attack += bonus * weights.skill;
      michu += bonus * weights.skill;

      if (nationalWinRate >= 6) {
        buffs.push(`全国勝率高い ${nationalWinRate}`);
      } else if (nationalWinRate <= 4) {
        debuffs.push(`全国勝率低め ${nationalWinRate}`);
      }
    }

    if (localWinRate !== null && localWinRate > 0) {
      const bonus = localWinRate * 4;
      local += bonus * weights.local;
      michu += localWinRate * 1.5 * weights.local;

      if (localWinRate >= 6) {
        buffs.push(`当地勝率高い ${localWinRate}`);
        expected += 7;
      }
    }

    if (motor2Rate !== null && motor2Rate > 0) {
      const motorBonus = (motor2Rate - 30) / 2.5;
      attack += motorBonus * weights.motor;
      tenkai += motorBonus * 0.7 * weights.motor;

      if (motor2Rate >= 40) {
        buffs.push(`M2連率上位 ${motor2Rate}%`);
      } else if (motor2Rate <= 25) {
        debuffs.push(`M2連率低め ${motor2Rate}%`);
      }
    }

    if (boat2Rate !== null && boat2Rate > 0) {
      const boatBonus = (boat2Rate - 30) / 4;
      michu += boatBonus;
    }

    if (params.exhibition) {
      attack += (params.exhibition.score - 50) * 0.7 * weights.exhibition;
      michu += (params.exhibition.score - 50) * 0.5 * weights.exhibition;
      expected += (params.exhibition.score - 50) * 0.35;

      if (params.exhibition.buffs?.length) {
        buffs.push(...params.exhibition.buffs.slice(0, 2));
      }

      if (params.exhibition.debuffs?.length) {
        debuffs.push(...params.exhibition.debuffs.slice(0, 1));
      }
    }

    applyVenueAdjustment({
      boatNo,
      venue: params.venue,
      weather: params.weather,
      values: {
        attackRef: v => attack += v,
        tenkaiRef: v => tenkai += v,
        michuRef: v => michu += v,
        localRef: v => local += v,
        expectedRef: v => expected += v
      },
      buffs,
      debuffs
    });

    attack = clampScore(attack);
    tenkai = clampScore(tenkai);
    michu = clampScore(michu);
    local = clampScore(local);
    expected = clampScore(expected);

    const total = clampScore(
      Math.round(
        attack * 0.3 +
        tenkai * 0.25 +
        michu * 0.25 +
        local * 0.2
      )
    );

    const label = createIndexLabel({
      attack,
      tenkai,
      michu,
      local,
      total,
      expected
    });

    return {
      boatNo,
      name: entry.racerName || entry.name || "",
      className: entry.className || "",
      attack,
      tenkai,
      michu,
      local,
      total,
      expected,
      label,
      buffs: uniqueList(buffs).slice(0, 8),
      debuffs: uniqueList(debuffs).slice(0, 5),
      shortComment: createIndexShortComment({
        boatNo,
        total,
        attack,
        tenkai,
        michu,
        local,
        expected,
        buffs,
        debuffs
      })
    };
  }

  function applyVenueAdjustment(params) {
    const boatNo = params.boatNo;
    const venue = params.venue;
    const weather = params.weather;
    const buffs = params.buffs;
    const debuffs = params.debuffs;
    const v = params.values;

    if (!venue) return;

    if (boatNo === 1) {
      if (venue.inPower >= 72) {
        v.attackRef(10);
        v.tenkaiRef(8);
        buffs.push(`${venue.name}イン有利`);
      } else if (venue.inPower <= 58) {
        v.attackRef(-6);
        v.tenkaiRef(-6);
        debuffs.push("イン過信注意水面");
      }
    }

    if (boatNo === 2) {
      if (venue.sashi >= 60) {
        v.attackRef(8);
        v.tenkaiRef(8);
        v.michuRef(5);
        buffs.push("2コース差し評価");
      }
    }

    if (boatNo === 3 || boatNo === 4) {
      if (venue.makuri >= 60) {
        v.attackRef(7);
        v.expectedRef(5);
        buffs.push("センター攻め水面");
      }

      if (venue.makuriSashi >= 62) {
        v.tenkaiRef(6);
        v.expectedRef(6);
        buffs.push("まくり差し警戒");
      }
    }

    if (boatNo >= 5) {
      if (venue.makuriSashi >= 62) {
        v.tenkaiRef(8);
        v.michuRef(8);
        v.expectedRef(8);
        buffs.push("外の展開突き評価");
      }

      if (weather?.pickupChance >= 62) {
        v.michuRef(8);
        v.expectedRef(8);
        buffs.push("水面荒れで拾い上昇");
      }
    }

    if (weather?.insideRisk >= 65 && boatNo === 1) {
      v.tenkaiRef(-6);
      v.expectedRef(-4);
      debuffs.push("風波でインリスク");
    }

    if (weather?.outsideChance >= 62 && boatNo >= 4) {
      v.tenkaiRef(6);
      v.expectedRef(7);
      buffs.push("風波で外の出番");
    }
  }

  function getClassBonus(className) {
    const cls = String(className || "");

    if (cls.includes("A1")) return CLASS_BONUS.A1;
    if (cls.includes("A2")) return CLASS_BONUS.A2;
    if (cls.includes("B2")) return CLASS_BONUS.B2;
    if (cls.includes("B1")) return CLASS_BONUS.B1;

    return {
      attack: 0,
      tenkai: 0,
      michu: 0,
      local: 0,
      total: 0,
      expectedOuter: 0
    };
  }

  function createIndexLabel(item) {
    const labels = [];

    if (item.attack >= 75) labels.push("🔥攻め艇");
    if (item.tenkai >= 75) labels.push("🌊展開艇");
    if (item.michu >= 75) labels.push("⚡道中艇");
    if (item.local >= 75) labels.push("🏠当地巧者");
    if (item.expected >= 75) labels.push("💣妙味艇");

    if (item.total >= 82) labels.push("⭐軸候補");
    else if (item.total >= 70) labels.push("○相手本線");
    else if (item.total >= 60) labels.push("△押さえ");
    else labels.push("展開待ち");

    return labels.join(" / ");
  }

  function createIndexShortComment(item) {
    if (item.total >= 82) {
      return `${item.boatNo}号艇は総合上位。${item.buffs.slice(0, 2).join("、")}が強い。`;
    }

    if (item.attack >= 78) {
      return `${item.boatNo}号艇は攻めの入口。スタート・1マークで展開を作る。`;
    }

    if (item.michu >= 78 || item.local >= 78) {
      return `${item.boatNo}号艇は2・3着拾いが強い。道中・当地を評価。`;
    }

    if (item.expected >= 78) {
      return `${item.boatNo}号艇は人気次第で妙味。万舟側で残す。`;
    }

    if (item.debuffs.length) {
      return `${item.boatNo}号艇は${item.debuffs[0]}が気になる。`;
    }

    return `${item.boatNo}号艇は展開次第で押さえ。`;
  }

  function createRanking(scores, key) {
    return [...scores]
      .sort((a, b) => Number(b[key]) - Number(a[key]))
      .map(item => ({
        boatNo: item.boatNo,
        name: item.name,
        score: item[key],
        reason: item.shortComment
      }));
  }

  function toByBoatMap(list) {
    return list.reduce((map, item) => {
      map[item.boatNo] = item;
      return map;
    }, {});
  }
    /* ===============================
    展開AI
    スタート → スリット → 1マーク → バック → 2マーク → ゴール
  =============================== */

  function createRaceFlow(race, context) {
    const scores = context.indexes?.scores || [];
    const byBoat = context.indexes?.byBoat || {};

    const attackBoats = selectAttackBoats(scores, context);
    const dangerBoats = selectDangerBoats(scores, context);
    const pickupBoats = selectPickupBoats(scores, context);
    const holdBoats = selectHoldBoats(scores, context);

    const startPhase = createStartPhase(race, context, scores);
    const slitPhase = createSlitPhase(race, context, scores);
    const firstMarkPhase = createFirstMarkPhase(race, context, {
      attackBoats,
      dangerBoats,
      holdBoats,
      pickupBoats
    });
    const backPhase = createBackPhase(race, context, {
      attackBoats,
      holdBoats,
      pickupBoats
    });
    const secondMarkPhase = createSecondMarkPhase(race, context, {
      holdBoats,
      pickupBoats
    });
    const goalPhase = createGoalPhase(race, context, {
      attackBoats,
      holdBoats,
      pickupBoats
    });

    const mainAttack = attackBoats[0] || null;
    const mainPickup = pickupBoats[0] || null;
    const mainHold = holdBoats[0] || null;

    const scenario = createRaceScenario({
      race,
      context,
      mainAttack,
      mainPickup,
      mainHold,
      attackBoats,
      pickupBoats,
      holdBoats,
      dangerBoats
    });

    return {
      title: scenario.title,
      summary: scenario.summary,

      attackBoats: attackBoats.slice(0, 2).map(toFlowBoat),
      dangerBoats: dangerBoats.slice(0, 2).map(toFlowBoat),
      pickupBoats: pickupBoats.slice(0, 3).map(toFlowBoat),

      holdBoats: holdBoats.slice(0, 3).map(toFlowBoat),

      startPoint: startPhase.comment,
      firstMark: firstMarkPhase.comment,
      pickupPoint: secondMarkPhase.comment,

      phases: {
        start: startPhase,
        slit: slitPhase,
        firstMark: firstMarkPhase,
        back: backPhase,
        secondMark: secondMarkPhase,
        goal: goalPhase
      },

      scenario,
      byBoat
    };
  }

  function selectAttackBoats(scores, context) {
    return [...scores]
      .map(item => {
        let score = item.attack;

        if (item.boatNo === 2 && context.venue?.sashi >= 60) {
          score += 8;
        }

        if ((item.boatNo === 3 || item.boatNo === 4) && context.venue?.makuri >= 60) {
          score += 8;
        }

        if (item.boatNo >= 4 && item.expected >= 70) {
          score += 4;
        }

        return {
          ...item,
          flowScore: clampScore(score),
          flowReason: createAttackFlowReason(item, context)
        };
      })
      .sort((a, b) => b.flowScore - a.flowScore);
  }

  function selectDangerBoats(scores, context) {
    return [...scores]
      .map(item => {
        let score = 40;
        const reasons = [];

        if (item.boatNo === 1) {
          score += 18;
          reasons.push("攻めを受ける側");
        }

        if (item.boatNo === 2) {
          score += 10;
          reasons.push("3コース攻めを受ける位置");
        }

        if (item.boatNo === 4) {
          score += 8;
          reasons.push("3が攻めると攻め場が狭くなる");
        }

        if (item.attack < 55) {
          score += 8;
          reasons.push("攻め指数控えめ");
        }

        if (item.total < 58) {
          score += 6;
          reasons.push("総合指数控えめ");
        }

        if (context.weather?.insideRisk >= 65 && item.boatNo <= 2) {
          score += 8;
          reasons.push("風波で内リスク");
        }

        return {
          ...item,
          flowScore: clampScore(score),
          flowReason: reasons.length ? reasons.join(" / ") : "展開を受けた時のリスク"
        };
      })
      .sort((a, b) => b.flowScore - a.flowScore);
  }

  function selectPickupBoats(scores, context) {
    return [...scores]
      .map(item => {
        let score = item.michu * 0.45 + item.tenkai * 0.35 + item.local * 0.2;
        const reasons = [];

        if (item.boatNo >= 5) {
          score += 8;
          reasons.push("外の展開拾い");
        }

        if (item.boatNo === 2) {
          score += 6;
          reasons.push("2コース差し残り");
        }

        if (item.michu >= 75) reasons.push("道中指数上位");
        if (item.local >= 75) reasons.push("当地指数上位");

        if (context.weather?.pickupChance >= 62) {
          score += 7;
          reasons.push("水面荒れで拾い上昇");
        }

        return {
          ...item,
          flowScore: clampScore(score),
          flowReason: reasons.length ? reasons.join(" / ") : item.shortComment
        };
      })
      .sort((a, b) => b.flowScore - a.flowScore);
  }

  function selectHoldBoats(scores, context) {
    return [...scores]
      .map(item => {
        let score = item.tenkai * 0.35 + item.michu * 0.35 + item.total * 0.3;
        const reasons = [];

        if (item.boatNo === 1) {
          score += context.venue?.inPower >= 70 ? 12 : 4;
          reasons.push("イン残し");
        }

        if (item.boatNo === 2) {
          score += 10;
          reasons.push("差し残り・内残し");
        }

        if (item.boatNo === 4) {
          score += 4;
          reasons.push("カド残し");
        }

        if (item.total >= 75) reasons.push("総合指数上位");

        return {
          ...item,
          flowScore: clampScore(score),
          flowReason: reasons.length ? reasons.join(" / ") : "着残し候補"
        };
      })
      .sort((a, b) => b.flowScore - a.flowScore);
  }

  function createAttackFlowReason(item, context) {
    const reasons = [];

    if (item.attack >= 75) reasons.push("攻め指数上位");
    if (item.boatNo === 2) reasons.push("2コース差し");
    if (item.boatNo === 3) reasons.push("3コース攻め");
    if (item.boatNo === 4) reasons.push("カド攻め");
    if (item.boatNo >= 5) reasons.push("外から展開突き");

    if (context.exhibition?.topST?.boatNo === item.boatNo) {
      reasons.push("展示ST1位");
    }

    if (context.exhibition?.topExhibition?.boatNo === item.boatNo) {
      reasons.push("展示タイム1位");
    }

    if (!reasons.length) reasons.push(item.shortComment || "攻め候補");

    return reasons.join(" / ");
  }

  function toFlowBoat(item) {
    return {
      boatNo: item.boatNo,
      label: item.name,
      name: item.name,
      score: item.flowScore ?? item.total ?? "-",
      reason: item.flowReason || item.shortComment || "展開候補"
    };
  }

  function createStartPhase(race, context, scores) {
    const stSorted = [...scores]
      .map(item => {
        const entry = findByBoatNo(race.entries, item.boatNo);
        const stNumber = toSTNumber(entry?.avgST);

        return {
          ...item,
          avgST: entry?.avgST || "",
          stNumber
        };
      })
      .filter(item => item.stNumber !== null)
      .sort((a, b) => a.stNumber - b.stNumber);

    const top = stSorted[0] || null;
    const slow = stSorted[stSorted.length - 1] || null;

    if (!top) {
      return {
        title: "スタート",
        leader: null,
        risk: null,
        comment: "平均STデータが薄いため、展示STとコース傾向で補正。"
      };
    }

    const comment = slow && slow.stNumber - top.stNumber >= 0.05
      ? `${top.boatNo}号艇が平均STで優位。${slow.boatNo}号艇は遅れリスク。`
      : `${top.boatNo}号艇がST入口でやや優位。全体は大きな差まではない。`;

    return {
      title: "スタート",
      leader: {
        boatNo: top.boatNo,
        name: top.name,
        st: formatST(top.avgST),
        score: top.attack
      },
      risk: slow
        ? {
            boatNo: slow.boatNo,
            name: slow.name,
            st: formatST(slow.avgST)
          }
        : null,
      comment
    };
  }

  function createSlitPhase(race, context, scores) {
    const exhibitionList = context.exhibition?.list || [];

    const stList = exhibitionList
      .filter(item => item.exhibitionSTNumber !== null)
      .sort((a, b) => a.exhibitionSTNumber - b.exhibitionSTNumber);

    const alerts = [];

    for (let i = 0; i < exhibitionList.length; i++) {
      const current = exhibitionList[i];
      if (current.exhibitionSTNumber === null) continue;

      const left = exhibitionList[i - 1];
      const right = exhibitionList[i + 1];

      const diffs = [];

      if (left?.exhibitionSTNumber !== null && left?.exhibitionSTNumber !== undefined) {
        diffs.push(left.exhibitionSTNumber - current.exhibitionSTNumber);
      }

      if (right?.exhibitionSTNumber !== null && right?.exhibitionSTNumber !== undefined) {
        diffs.push(right.exhibitionSTNumber - current.exhibitionSTNumber);
      }

      const maxDiff = diffs.length ? Math.max(...diffs) : 0;

      if (maxDiff >= 0.1) {
        alerts.push({
          boatNo: current.boatNo,
          name: current.name,
          diff: Math.round(maxDiff * 100) / 100,
          score: clampScore(70 + maxDiff * 100),
          reason: `隣艇より${maxDiff.toFixed(2)}速い`
        });
      }
    }

    const top = stList[0] || null;

    return {
      title: "スリット",
      top: top
        ? {
            boatNo: top.boatNo,
            name: top.name,
            st: formatST(top.exhibitionST)
          }
        : null,
      alerts,
      comment: alerts.length
        ? `${alerts.map(v => `${v.boatNo}号艇`).join("・")}にスリットアラート。0.10以上の差で攻めの入口。`
        : top
          ? `展示STは${top.boatNo}号艇が上位。明確な0.10差アラートはなし。`
          : "展示STデータが薄いため、平均STで補正。"
    };
  }

  function createFirstMarkPhase(race, context, flow) {
    const mainAttack = flow.attackBoats[0] || null;
    const secondAttack = flow.attackBoats[1] || null;
    const mainHold = flow.holdBoats[0] || null;
    const mainDanger = flow.dangerBoats[0] || null;

    let pattern = "standard";
    let comment = "1マークは内の残しとセンター攻めの比較。";

    if (mainAttack) {
      if (mainAttack.boatNo === 1) {
        pattern = "escape";
        comment = `1マークは${mainAttack.boatNo}号艇の逃げが基本線。相手は差し残し・外の拾い。`;
      } else if (mainAttack.boatNo === 2) {
        pattern = "sashi";
        comment = `2コース差しが展開の入口。1が残すか、2が差し届くかを見る。`;
      } else if (mainAttack.boatNo === 3) {
        pattern = "center_attack";
        comment = `3コース攻めが入口。1・2が受ける形になり、4は攻め場が狭くなる可能性。`;
      } else if (mainAttack.boatNo === 4) {
        pattern = "kado";
        comment = `4カド攻めが入口。内が流れれば外のまくり差し・拾いが浮上。`;
      } else {
        pattern = "outside";
        comment = `${mainAttack.boatNo}号艇は外から展開突き。頭より2・3着の拾いを厚めに見る。`;
      }
    }

    if (context.weather?.insideRisk >= 68 && mainAttack?.boatNo !== 1) {
      comment += " 風波で内が流れるリスクも加味。";
    }

    if (mainDanger) {
      comment += ` 飛ぶ・流れる候補は${mainDanger.boatNo}号艇。`;
    }

    return {
      title: "1マーク",
      pattern,
      mainAttack: mainAttack ? toFlowBoat(mainAttack) : null,
      secondAttack: secondAttack ? toFlowBoat(secondAttack) : null,
      mainHold: mainHold ? toFlowBoat(mainHold) : null,
      mainDanger: mainDanger ? toFlowBoat(mainDanger) : null,
      comment
    };
  }

  function createBackPhase(race, context, flow) {
    const hold = flow.holdBoats[0] || null;
    const pickup = flow.pickupBoats[0] || null;
    const attack = flow.attackBoats[0] || null;

    const parts = [];

    if (attack) {
      parts.push(`${attack.boatNo}号艇が1マークで展開を作る`);
    }

    if (hold) {
      parts.push(`${hold.boatNo}号艇が残す`);
    }

    if (pickup) {
      parts.push(`${pickup.boatNo}号艇がバックで拾う`);
    }

    return {
      title: "バック",
      leader: attack ? toFlowBoat(attack) : null,
      hold: hold ? toFlowBoat(hold) : null,
      pickup: pickup ? toFlowBoat(pickup) : null,
      comment: parts.length
        ? `${parts.join(" → ")}想定。`
        : "バックでは内残しと道中艇の拾いを比較。"
    };
  }

  function createSecondMarkPhase(race, context, flow) {
    const pickupBoats = flow.pickupBoats || [];
    const holdBoats = flow.holdBoats || [];

    const mainPickup = pickupBoats[0] || null;
    const secondPickup = pickupBoats[1] || null;
    const mainHold = holdBoats[0] || null;

    const parts = [];

    if (mainPickup) {
      parts.push(`${mainPickup.boatNo}号艇は道中・当地・展開利で2、3着候補`);
    }

    if (secondPickup) {
      parts.push(`${secondPickup.boatNo}号艇も拾い評価`);
    }

    if (mainHold) {
      parts.push(`${mainHold.boatNo}号艇は残し候補`);
    }

    return {
      title: "2マーク",
      mainPickup: mainPickup ? toFlowBoat(mainPickup) : null,
      secondPickup: secondPickup ? toFlowBoat(secondPickup) : null,
      mainHold: mainHold ? toFlowBoat(mainHold) : null,
      comment: parts.length
        ? parts.join("。") + "。"
        : "2・3着は道中指数、当地指数、展開指数を重視。"
    };
  }

  function createGoalPhase(race, context, flow) {
    const total = context.indexes?.totalRanking || [];
    const top = total[0] || null;
    const second = total[1] || null;
    const third = total[2] || null;

    return {
      title: "ゴール",
      expectedOrder: [top, second, third].filter(Boolean).map(item => ({
        boatNo: item.boatNo,
        name: item.name,
        score: item.score
      })),
      comment: top
        ? `最終総合は${top.boatNo}号艇中心。${second ? `${second.boatNo}号艇` : "相手"}、${third ? `${third.boatNo}号艇` : "押さえ"}まで。`
        : "総合指数から着順候補を整理。"
    };
  }

  function createRaceScenario(params) {
    const mainAttack = params.mainAttack;
    const mainPickup = params.mainPickup;
    const mainHold = params.mainHold;
    const venue = params.context.venue;
    const weather = params.context.weather;

    if (!mainAttack) {
      return {
        title: "AI展開シミュレーション",
        summary: "攻め艇・残し艇・拾い艇を分けて評価。"
      };
    }

    if (mainAttack.boatNo === 1 && venue?.inPower >= 70 && weather?.insideRisk < 65) {
      return {
        title: "イン逃げ本線",
        summary: `基本は1号艇の逃げ。相手は${mainHold?.boatNo || 2}号艇の残し、${mainPickup?.boatNo || 3}号艇の拾い。`
      };
    }

    if (mainAttack.boatNo === 2) {
      return {
        title: "2コース差し本線",
        summary: `2号艇の差しが展開の入口。1号艇の残しと、${mainPickup?.boatNo || 3}号艇の2・3着拾いを重視。`
      };
    }

    if (mainAttack.boatNo === 3) {
      return {
        title: "3コース攻め警戒",
        summary: `3号艇が攻める展開。1・2の残し、外の${mainPickup?.boatNo || 5}号艇の拾いまで見る。`
      };
    }

    if (mainAttack.boatNo === 4) {
      return {
        title: "4カド攻め警戒",
        summary: `4号艇の攻めが入口。内が流れた時は${mainPickup?.boatNo || 5}号艇のまくり差し・拾いが浮上。`
      };
    }

    return {
      title: "外枠展開突き",
      summary: `${mainAttack.boatNo}号艇は外から展開を突く形。頭固定より2・3着絡みと万舟側で評価。`
    };
  }
    /* ===============================
    青シート生成
  =============================== */

  function createMainSheet(race, context) {
    const evaluations = createMainEvaluations(race, context);
    const sorted = [...evaluations].sort((a, b) => b.score - a.score);

    const honmei = sorted[0] || null;
    const taikou = sorted[1] || null;
    const ana = selectAnaCandidate(sorted, context);
    const osae = selectOsaeCandidate(sorted, context, {
      honmei,
      taikou,
      ana
    });

    return {
      honmei,
      taikou,
      ana,
      osae,
      reason: createMainSheetReason({
        race,
        context,
        honmei,
        taikou,
        ana,
        osae
      }),
      evaluations,
      formation: null
    };
  }

  function createMainEvaluations(race, context) {
    const entries = race.entries || [];
    const byBoat = context.indexes?.byBoat || {};

    return entries.map((entry, index) => {
      const boatNo = entry.boatNo || index + 1;
      const indexData = byBoat[boatNo] || {};
      const exhibition = findByBoatNo(context.exhibition?.list || [], boatNo);

      const scoreData = calculateMainSheetScore({
        entry,
        indexData,
        exhibition,
        race,
        context
      });

      return {
        boatNo,
        name: entry.racerName || entry.name || "",
        score: scoreData.score,
        buffs: scoreData.buffs,
        debuffs: scoreData.debuffs,
        shortComment: scoreData.shortComment,
        comment: scoreData.comment,

        attack: indexData.attack ?? 50,
        tenkai: indexData.tenkai ?? 50,
        michu: indexData.michu ?? 50,
        local: indexData.local ?? 50,
        total: indexData.total ?? 50,
        expected: indexData.expected ?? 50,
        label: indexData.label || "",

        role: scoreData.role,
        raw: {
          entry,
          indexData,
          exhibition
        }
      };
    });
  }

  function calculateMainSheetScore(params) {
    const entry = params.entry;
    const boatNo = entry.boatNo;
    const indexData = params.indexData || {};
    const exhibition = params.exhibition || {};
    const context = params.context || {};

    let score = Number(indexData.total ?? 50);

    const buffs = [];
    const debuffs = [];

    if (Array.isArray(indexData.buffs)) buffs.push(...indexData.buffs);
    if (Array.isArray(indexData.debuffs)) debuffs.push(...indexData.debuffs);

    const venue = context.venue;
    const weather = context.weather;
    const newEngine = context.newEngine;

    if (boatNo === 1) {
      if (venue?.inPower >= 72 && weather?.insideRisk < 65) {
        score += 8;
        buffs.push("イン逃げ本線");
      }

      if (weather?.insideRisk >= 65) {
        score -= 5;
        debuffs.push("風波でイン過信注意");
      }
    }

    if (boatNo === 2) {
      score += 4;
      buffs.push("2コース差し・残しを切らない");

      if (venue?.sashi >= 60) {
        score += 5;
        buffs.push("差し水面補正");
      }
    }

    if (boatNo === 3) {
      if (venue?.makuri >= 58) {
        score += 4;
        buffs.push("3コース攻め警戒");
      }

      if (newEngine?.updated && newEngine.phase !== NEW_ENGINE_PHASE.NONE) {
        score += 3;
        buffs.push("新型エンジン期の3攻め警戒");
      }
    }

    if (boatNo === 4) {
      score += 2;
      buffs.push("4コース残しを切らない");

      const mainAttack = context.raceFlow?.attackBoats?.[0];
      if (Number(mainAttack?.boatNo) === 3) {
        score -= 3;
        debuffs.push("3攻め時は攻め場が狭くなる");
      }
    }

    if (boatNo >= 5) {
      if (indexData.michu >= 70 || indexData.local >= 70) {
        score += 5;
        buffs.push("外枠でも拾い評価");
      } else {
        score -= 3;
        debuffs.push("外枠で展開待ち");
      }
    }

    if (exhibition?.score >= 70) {
      score += 5;
      buffs.push("展示気配上位");
    } else if (exhibition?.score <= 42) {
      score -= 5;
      debuffs.push("展示気配重め");
    }

    if (newEngine?.updated && newEngine.phase === NEW_ENGINE_PHASE.EARLY) {
      const motor2Rate = toNumberOrNull(entry.motor?.secondRate);

      if (motor2Rate !== null && motor2Rate >= 40) {
        score -= 2;
        debuffs.push("新型初期はM数字過信注意");
      }

      if (exhibition?.score >= 62 || indexData.attack >= 70) {
        score += 3;
        buffs.push("新型初期は展示・STを重視");
      }
    }

    score = clampScore(score);

    const role = createMainRole({
      boatNo,
      score,
      indexData
    });

    return {
      score,
      buffs: uniqueList(buffs).slice(0, 7),
      debuffs: uniqueList(debuffs).slice(0, 5),
      role,
      shortComment: createMainEvaluationShortComment({
        boatNo,
        score,
        buffs,
        debuffs,
        role
      }),
      comment: createMainEvaluationComment({
        boatNo,
        entry,
        score,
        buffs,
        debuffs,
        indexData,
        role
      })
    };
  }

  function createMainRole(params) {
    const boatNo = params.boatNo;
    const indexData = params.indexData || {};
    const roles = [];

    if (indexData.attack >= 75) roles.push("🔥攻め艇");
    if (indexData.tenkai >= 75) roles.push("🌊展開艇");
    if (indexData.michu >= 75) roles.push("⚡道中艇");
    if (indexData.local >= 75) roles.push("🏠当地巧者");

    if (boatNo === 1) roles.push("🛟イン残し");
    if (boatNo === 2) roles.push("🛟差し残し");
    if (boatNo >= 5) roles.push("💣外枠妙味");

    if (!roles.length) {
      if (params.score >= 75) roles.push("⭐軸候補");
      else if (params.score >= 65) roles.push("○相手候補");
      else roles.push("△押さえ");
    }

    return uniqueList(roles).join(" / ");
  }

  function createMainEvaluationShortComment(params) {
    const boatNo = params.boatNo;

    if (params.score >= 82) {
      return `${boatNo}号艇は軸級。${params.buffs.slice(0, 2).join("、")}が強い。`;
    }

    if (params.score >= 72) {
      return `${boatNo}号艇は相手本線。頭・2着まで見る。`;
    }

    if (params.score >= 62) {
      return `${boatNo}号艇は押さえ候補。2・3着で残す。`;
    }

    if (params.debuffs.length) {
      return `${boatNo}号艇は${params.debuffs[0]}が気になる。`;
    }

    return `${boatNo}号艇は展開待ち。厚くは買わない。`;
  }

  function createMainEvaluationComment(params) {
    const boatNo = params.boatNo;
    const name = params.entry.racerName || params.entry.name || "";
    const role = params.role;

    const plus = params.buffs.length
      ? `プラス材料は${params.buffs.slice(0, 3).join("、")}`
      : "プラス材料は控えめ";

    const minus = params.debuffs.length
      ? `マイナス材料は${params.debuffs.slice(0, 2).join("、")}`
      : "大きなマイナスは少ない";

    return `${boatNo}号艇 ${name} は${role}。総合${params.score}点。${plus}。${minus}。`;
  }

  function selectAnaCandidate(sorted, context) {
    if (!Array.isArray(sorted) || !sorted.length) return null;

    const candidate = [...sorted]
      .filter(item => item.expected >= 65 || item.attack >= 70 || item.boatNo >= 4)
      .filter(item => item.boatNo !== sorted[0]?.boatNo)
      .filter(item => item.boatNo !== sorted[1]?.boatNo)
      .sort((a, b) => {
        const aScore = a.expected * 0.45 + a.attack * 0.25 + a.michu * 0.2 + a.total * 0.1;
        const bScore = b.expected * 0.45 + b.attack * 0.25 + b.michu * 0.2 + b.total * 0.1;
        return bScore - aScore;
      })[0];

    return candidate || sorted[2] || null;
  }

  function selectOsaeCandidate(sorted, context, selected) {
    const used = new Set([
      selected.honmei?.boatNo,
      selected.taikou?.boatNo,
      selected.ana?.boatNo
    ].filter(Boolean));

    const holdCandidate = [...sorted]
      .filter(item => !used.has(item.boatNo))
      .filter(item => {
        if (item.boatNo === 2) return true;
        if (item.boatNo === 4) return true;
        if (item.michu >= 68) return true;
        if (item.local >= 68) return true;
        if (item.total >= 60) return true;
        return false;
      })[0];

    return holdCandidate || sorted.find(item => !used.has(item.boatNo)) || sorted[3] || null;
  }

  function createMainSheetReason(params) {
    const venue = params.context.venue;
    const weather = params.context.weather;
    const newEngine = params.context.newEngine;

    const parts = [];

    if (params.honmei) {
      parts.push(`本命は${params.honmei.boatNo}号艇。総合${params.honmei.score}点で中心評価`);
    }

    if (params.taikou) {
      parts.push(`対抗は${params.taikou.boatNo}号艇。${params.taikou.role || "相手本線"}`);
    }

    if (params.ana) {
      parts.push(`穴は${params.ana.boatNo}号艇。期待値・展開ズレを評価`);
    }

    if (params.osae) {
      parts.push(`押さえは${params.osae.boatNo}号艇。残し・拾いで残す`);
    }

    if (venue) {
      parts.push(`${venue.name}は${venue.memo}`);
    }

    if (weather?.comment) {
      parts.push(weather.comment);
    }

    if (newEngine?.updated) {
      parts.push(newEngine.rule);
    }

    return parts.join("。") + "。";
  }
    /* ===============================
     ピンクシート生成（万舟）
  =============================== */

  function createManshuSheet(race, context) {

    const evaluations = createManshuEvaluations(race, context);

    const candidates = [...evaluations]
      .sort((a,b)=>b.manshuScore-a.manshuScore)
      .slice(0,3);

    const holdBoats = [...evaluations]
      .sort((a,b)=>b.holdScore-a.holdScore)
      .slice(0,3);

    const pickupBoats = [...evaluations]
      .sort((a,b)=>b.pickupScore-a.pickupScore)
      .slice(0,3);

    return {

      candidates,

      holdBoats,

      pickupBoats,

      formation:createManshuFormation(
        candidates,
        holdBoats,
        pickupBoats
      ),

      missingNumbers:createMissingNumbers(race),

      reason:createManshuReason(
        candidates,
        holdBoats,
        pickupBoats,
        context
      )

    };

  }

  function createManshuEvaluations(race,context){

    const list=[];

    const byBoat=context.indexes.byBoat;

    race.entries.forEach(entry=>{

      const idx=byBoat[entry.boatNo];

      const score=createManshuScore(
        entry,
        idx,
        context
      );

      list.push(score);

    });

    return list;

  }

  function createManshuScore(entry,index,context){

    let manshu=45;
    let hold=45;
    let pickup=45;

    const buffs=[];
    const debuffs=[];

    const boatNo=entry.boatNo;

    /* 外枠補正 */

    if(boatNo>=4){

      manshu+=18;
      pickup+=10;

      buffs.push("外枠高配当");

    }

    /* 2差し */

    if(boatNo===2){

      hold+=18;
      pickup+=8;

      buffs.push("2コース差し");

    }

    /* イン残し */

    if(boatNo===1){

      hold+=20;
      manshu-=8;

      buffs.push("イン残し");

    }

    /* 攻め */

    if(index.attack>=75){

      manshu+=10;
      buffs.push("攻め指数高い");

    }

    if(index.expected>=75){

      manshu+=14;
      buffs.push("期待値高い");

    }

    if(index.michu>=75){

      pickup+=14;
      buffs.push("道中指数高い");

    }

    if(index.local>=75){

      pickup+=10;
      hold+=8;

      buffs.push("当地巧者");

    }

    if(context.weather.outsideChance>=65){

      manshu+=8;
      pickup+=8;

      buffs.push("風で外有利");

    }

    if(context.weather.insideRisk>=65){

      if(boatNo===1){

        hold-=6;

        debuffs.push("インリスク");

      }

    }

    if(context.newEngine.updated){

      if(index.attack>=70){

        manshu+=5;

        buffs.push("新型エンジン期は展示重視");

      }

    }

    manshu=clampScore(manshu);
    hold=clampScore(hold);
    pickup=clampScore(pickup);

    return{

      boatNo,

      name:entry.racerName||entry.name,

      manshuScore:manshu,

      holdScore:hold,

      pickupScore:pickup,

      reason:buffs.join(" / "),

      buffs,

      debuffs

    };

  }

  function createManshuFormation(
    candidates,
    hold,
    pickup
  ){

    const c=candidates.map(v=>v.boatNo);
    const h=hold.map(v=>v.boatNo);
    const p=pickup.map(v=>v.boatNo);

    const tickets=[];

    if(c[0]&&h[0]&&p[0]){

      tickets.push(`${c[0]}-${h[0]}-${p[0]}`);
      tickets.push(`${c[0]}-${p[0]}-${h[0]}`);

    }

    if(h[0]&&c[0]&&p[0]){

      tickets.push(`${h[0]}-${c[0]}-${p[0]}`);

    }

    if(h[0]&&c[0]&&p[1]){

      tickets.push(`${h[0]}-${c[0]}-${p[1]}`);

    }

    if(c[0]&&h[0]&&p.length>=2){

      tickets.push(
        `${c[0]}-${h[0]}-${p[0]}${p[1]}`
      );

    }

    if(h[0]&&c.length>=2){

      tickets.push(
        `${h[0]}-${c[0]}${c[1]}-${p[0]}${p[1]}`
      );

    }

    return [...new Set(tickets)];

  }

  function createMissingNumbers(race){

    if(Array.isArray(race.missingNumbers)){

      return race.missingNumbers;

    }

    return [];

  }

  function createManshuReason(
    candidates,
    hold,
    pickup,
    context
  ){

    const text=[];

    if(candidates.length){

      text.push(
        `万舟入口は${candidates
          .map(v=>`${v.boatNo}号艇`)
          .join("・")}`
      );

    }

    if(hold.length){

      text.push(
        `残しは${hold
          .map(v=>`${v.boatNo}号艇`)
          .join("・")}`
      );

    }

    if(pickup.length){

      text.push(
        `拾いは${pickup
          .map(v=>`${v.boatNo}号艇`)
          .join("・")}`
      );

    }

    if(context.weather.outsideChance>=65){

      text.push("風で外の期待値アップ");

    }

    if(context.newEngine.updated){

      text.push("新型エンジン期は展示優先");

    }

    return text.join("。")+"。";

  }
    /* =========================================================
    Part6 舟券太郎理論
    - スリットアラート
    - ダブルタイム理論
    - 新サム理論
    - アラート表示
  ========================================================= */

  function num(v) {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function getRacers(data) {
    return data?.racers || data?.entries || data?.entry || [];
  }

  function boatName(r) {
    return r?.boatNo || r?.waku || r?.number || r?.course || "-";
  }

  function racerName(r) {
    return r?.name || r?.racerName || r?.playerName || "選手名なし";
  }

  function getExTime(r) {
    return num(r?.exhibitionTime ?? r?.tenjiTime ?? r?.displayTime);
  }

  function getLapTime(r) {
    return num(r?.lapTime ?? r?.roundTime ?? r?.oneLapTime);
  }

  function getTenjiST(r) {
    return num(r?.exhibitionST ?? r?.tenjiST ?? r?.st);
  }

  function renderTheoryPanel(data) {
    const area = document.getElementById("theoryArea");
    if (!area) return;

    const racers = getRacers(data);

    if (!racers.length) {
      area.innerHTML = `
        <section class="card theory-card">
          <h2>舟券太郎理論</h2>
          <p class="muted">出走データが不足しています。</p>
        </section>
      `;
      return;
    }

    const slitAlerts = createSlitAlerts(racers);
    const doubleTime = createDoubleTimeTheory(racers);
    const shinsam = createShinsamTheory(racers, data);

    area.innerHTML = `
      <section class="card theory-card">
        <h2>舟券太郎理論</h2>

        ${renderSlitAlerts(slitAlerts)}
        ${renderDoubleTime(doubleTime)}
        ${renderShinsam(shinsam)}

        <div class="theory-note">
          <strong>判定ルール</strong>
          <p>
            スリット差・展示タイム・一周タイムを数値化し、
            展開を作る艇と拾う艇を分けて見る。
          </p>
        </div>
      </section>
    `;
  }

  function createSlitAlerts(racers) {
    const list = racers.map((r, i) => ({
      boat: boatName(r),
      name: racerName(r),
      st: getTenjiST(r),
      index: i
    }));

    const alerts = [];

    list.forEach((item, i) => {
      if (item.st === null) return;

      const prev = list[i - 1];
      const next = list[i + 1];

      const diffs = [];

      if (prev && prev.st !== null) {
        diffs.push({
          target: prev.boat,
          diff: prev.st - item.st
        });
      }

      if (next && next.st !== null) {
        diffs.push({
          target: next.boat,
          diff: next.st - item.st
        });
      }

      const max = diffs.find(d => d.diff >= 0.1);

      if (max) {
        alerts.push({
          ...item,
          diff: max.diff,
          target: max.target,
          comment: `${item.boat}号艇が隣艇よりスリット優勢。攻め起点候補。`
        });
      }
    });

    return alerts;
  }

  function renderSlitAlerts(alerts) {
    if (!alerts.length) {
      return `
        <div class="theory-block">
          <h3>⚡ スリットアラート</h3>
          <p class="muted">発動なし。展示ST差は大きくない。</p>
        </div>
      `;
    }

    return `
      <div class="theory-block">
        <h3>⚡ スリットアラート</h3>
        <div class="mini-grid">
          ${alerts.map(a => `
            <div class="mini-card boat-${a.boat}">
              <strong>${a.boat}号艇 ${a.name}</strong>
              <p>展示ST：${a.st}</p>
              <p>隣艇差：+${a.diff.toFixed(2)}</p>
              <p>${a.comment}</p>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function createDoubleTimeTheory(racers) {
    const exList = racers
      .map(r => ({
        boat: boatName(r),
        name: racerName(r),
        ex: getExTime(r),
        lap: getLapTime(r)
      }))
      .filter(r => r.ex !== null || r.lap !== null);

    const exBest = exList
      .filter(r => r.ex !== null)
      .sort((a, b) => a.ex - b.ex)[0];

    const lapBest = exList
      .filter(r => r.lap !== null)
      .sort((a, b) => a.lap - b.lap)[0];

    const doubleHit =
      exBest && lapBest && String(exBest.boat) === String(lapBest.boat)
        ? exBest
        : null;

    return {
      exBest,
      lapBest,
      doubleHit
    };
  }

  function renderDoubleTime(data) {
    const ex = data.exBest;
    const lap = data.lapBest;
    const hit = data.doubleHit;

    return `
      <div class="theory-block">
        <h3>⏱ ダブルタイム理論</h3>

        <div class="mini-grid">
          <div class="mini-card">
            <strong>展示タイム1位</strong>
            <p>${ex ? `${ex.boat}号艇 ${ex.name} / ${ex.ex}` : "データなし"}</p>
          </div>

          <div class="mini-card">
            <strong>一周タイム1位</strong>
            <p>${lap ? `${lap.boat}号艇 ${lap.name} / ${lap.lap}` : "データなし"}</p>
          </div>
        </div>

        <p class="${hit ? "alert-text" : "muted"}">
          ${
            hit
              ? `🔥 ${hit.boat}号艇が展示・一周の両方で1位。連絡み警戒。`
              : "展示1位と一周1位は分散。単独の強烈気配は薄め。"
          }
        </p>
      </div>
    `;
  }

  function createShinsamTheory(racers, data) {
    const water = data?.weather || data?.water || {};
    const wind = num(water?.windSpeed ?? water?.wind);
    const isStrongWind = wind !== null && wind >= 5;

    const list = racers
      .map(r => {
        const ex = getExTime(r);
        const lap = getLapTime(r);
        const total = ex !== null && lap !== null ? ex + lap : null;

        return {
          boat: boatName(r),
          name: racerName(r),
          ex,
          lap,
          total
        };
      })
      .filter(r => r.total !== null);

    if (!list.length) {
      return {
        list: [],
        alerts: [],
        average: null,
        wind,
        isStrongWind
      };
    }

    const average =
      list.reduce((sum, r) => sum + r.total, 0) / list.length;

    const ranked = list
      .map(r => ({
        ...r,
        diff: average - r.total
      }))
      .sort((a, b) => b.diff - a.diff);

    const alerts = ranked.filter(r => r.diff > 0);

    return {
      list: ranked,
      alerts,
      average,
      wind,
      isStrongWind
    };
  }

  function renderShinsam(data) {
    if (!data.list.length) {
      return `
        <div class="theory-block">
          <h3>🌊 新サム理論</h3>
          <p class="muted">展示タイム・一周タイムの不足で判定不可。</p>
        </div>
      `;
    }

    return `
      <div class="theory-block">
        <h3>🌊 新サム理論</h3>

        <p class="muted">
          展示タイム＋一周タイムの合計で評価。
          平均より速い艇だけプラス判定。
        </p>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>艇</th>
                <th>選手</th>
                <th>合計</th>
                <th>平均差</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              ${data.list.map(r => `
                <tr>
                  <td class="boat-label boat-${r.boat}">${r.boat}号艇</td>
                  <td>${r.name}</td>
                  <td>${r.total.toFixed(2)}</td>
                  <td>${r.diff > 0 ? "+" : ""}${r.diff.toFixed(2)}</td>
                  <td>${r.diff > 0 ? "⬆️プラス" : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <p class="${data.alerts.length ? "alert-text" : "muted"}">
          ${
            data.alerts.length
              ? `🔥 新サムアラート：${data.alerts.map(r => `${r.boat}号艇`).join("・")} がプラス判定。`
              : "新サムアラート発動なし。"
          }
        </p>

        <p class="muted">
          風速：${data.wind ?? "不明"}m　
          ${
            data.isStrongWind
              ? "風が強めなので新サム評価を少し重視。"
              : "風が弱めなら新サム評価は補助扱い。"
          }
        </p>
      </div>
    `;
  }

  window.renderTheoryPanel = renderTheoryPanel;
    /* =========================================================
    Part7 AI指数
    - 攻め指数
    - 展開指数
    - 道中指数
    - 当地指数
    - 総合指数
    - ランキング
    - 期待値
  ========================================================= */

  function clampScore(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function calcAttackIndex(r) {
    const st = getTenjiST(r);
    const ex = getExTime(r);
    const rank = num(r?.rankPoint ?? r?.classPoint ?? r?.winRate);

    let score = 50;

    if (st !== null) score += (0.18 - st) * 180;
    if (ex !== null) score += (6.85 - ex) * 35;
    if (rank !== null) score += (rank - 5.0) * 4;

    return clampScore(score);
  }

  function calcFlowIndex(r, racers) {
    const boat = Number(boatName(r));
    const attack = calcAttackIndex(r);

    let score = 50;

    if (boat === 1) score += 8;
    if (boat === 2) score += 6;
    if (boat === 3) score += attack >= 60 ? 10 : 3;
    if (boat === 4) score += attack >= 62 ? 8 : 2;
    if (boat === 5) score += 4;
    if (boat === 6) score += 2;

    const left = racers[boat - 2];
    const right = racers[boat];

    if (left && calcAttackIndex(left) >= 65) score += 6;
    if (right && calcAttackIndex(right) >= 65) score += 4;

    return clampScore(score);
  }

  function calcRoadIndex(r) {
    const winRate = num(r?.winRate ?? r?.racerWinRate);
    const secondRate = num(r?.secondRate ?? r?.twoRate);
    const grade = String(r?.class || r?.grade || "");

    let score = 50;

    if (winRate !== null) score += (winRate - 5.0) * 6;
    if (secondRate !== null) score += (secondRate - 35) * 0.5;

    if (grade.includes("A1")) score += 10;
    if (grade.includes("A2")) score += 5;
    if (grade.includes("B2")) score -= 6;

    return clampScore(score);
  }

  function calcLocalIndex(r) {
    const localRate = num(r?.localWinRate ?? r?.venueWinRate ?? r?.placeWinRate);
    const isLocal =
      r?.isLocal === true ||
      String(r?.branch || r?.home || "").includes(String(r?.venuePref || ""));

    let score = 50;

    if (localRate !== null) score += (localRate - 5.0) * 7;
    if (isLocal) score += 8;

    return clampScore(score);
  }

  function calcMotorIndex(r) {
    const motor2 = num(r?.motorTwoRate ?? r?.motor2Rate ?? r?.motorRate);
    const boat2 = num(r?.boatTwoRate ?? r?.boat2Rate);

    let score = 50;

    if (motor2 !== null) score += (motor2 - 35) * 0.45;
    if (boat2 !== null) score += (boat2 - 35) * 0.25;

    return clampScore(score);
  }

  function calcTotalIndex(r, racers) {
    const attack = calcAttackIndex(r);
    const flow = calcFlowIndex(r, racers);
    const road = calcRoadIndex(r);
    const local = calcLocalIndex(r);
    const motor = calcMotorIndex(r);

    const total =
      attack * 0.28 +
      flow * 0.24 +
      road * 0.22 +
      local * 0.16 +
      motor * 0.10;

    return {
      attack,
      flow,
      road,
      local,
      motor,
      total: clampScore(total)
    };
  }

  function createAiIndexes(data) {
    const racers = getRacers(data);

    return racers
      .map(r => {
        const index = calcTotalIndex(r, racers);

        return {
          boat: boatName(r),
          name: racerName(r),
          className: r?.class || r?.grade || "-",
          attack: index.attack,
          flow: index.flow,
          road: index.road,
          local: index.local,
          motor: index.motor,
          total: index.total,
          value: calcExpectedValue(index.total, r)
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  function calcExpectedValue(total, r) {
    const odds = num(r?.odds ?? r?.winOdds ?? r?.trioOdds);
    let value = total;

    if (odds !== null) {
      if (odds >= 15) value += 8;
      if (odds >= 30) value += 10;
      if (odds <= 3) value -= 8;
    }

    return clampScore(value);
  }

  function indexLabel(score) {
    if (score >= 80) return "S";
    if (score >= 70) return "A";
    if (score >= 60) return "B";
    if (score >= 50) return "C";
    return "D";
  }

  function renderAiIndexPanel(data) {
    const area = document.getElementById("aiIndexArea");
    if (!area) return;

    const list = createAiIndexes(data);

    if (!list.length) {
      area.innerHTML = `
        <section class="card ai-index-card">
          <h2>AI指数</h2>
          <p class="muted">指数データが不足しています。</p>
        </section>
      `;
      return;
    }

    area.innerHTML = `
      <section class="card ai-index-card">
        <h2>AI指数</h2>

        <p class="muted">
          攻め・展開・道中・当地・機力を分けて数値化。
          総合だけでなく、3着候補は道中指数と当地指数も重視。
        </p>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>順位</th>
                <th>艇</th>
                <th>選手</th>
                <th>攻め</th>
                <th>展開</th>
                <th>道中</th>
                <th>当地</th>
                <th>機力</th>
                <th>総合</th>
                <th>期待値</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((r, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td class="boat-label boat-${r.boat}">${r.boat}号艇</td>
                  <td>${r.name}</td>
                  <td>${r.attack}</td>
                  <td>${r.flow}</td>
                  <td>${r.road}</td>
                  <td>${r.local}</td>
                  <td>${r.motor}</td>
                  <td><strong>${r.total}</strong> / ${indexLabel(r.total)}</td>
                  <td><strong>${r.value}</strong> / ${indexLabel(r.value)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        ${renderIndexSummary(list)}
      </section>
    `;
  }

  function renderIndexSummary(list) {
    const attack = [...list].sort((a, b) => b.attack - a.attack)[0];
    const flow = [...list].sort((a, b) => b.flow - a.flow)[0];
    const road = [...list].sort((a, b) => b.road - a.road)[0];
    const local = [...list].sort((a, b) => b.local - a.local)[0];
    const value = [...list].sort((a, b) => b.value - a.value)[0];

    return `
      <div class="mini-grid index-summary">
        <div class="mini-card">
          <strong>🔥 攻め指数1位</strong>
          <p>${attack.boat}号艇 ${attack.name} / ${attack.attack}</p>
        </div>

        <div class="mini-card">
          <strong>🌊 展開指数1位</strong>
          <p>${flow.boat}号艇 ${flow.name} / ${flow.flow}</p>
        </div>

        <div class="mini-card">
          <strong>⚡ 道中指数1位</strong>
          <p>${road.boat}号艇 ${road.name} / ${road.road}</p>
        </div>

        <div class="mini-card">
          <strong>🏠 当地指数1位</strong>
          <p>${local.boat}号艇 ${local.name} / ${local.local}</p>
        </div>

        <div class="mini-card">
          <strong>💰 期待値1位</strong>
          <p>${value.boat}号艇 ${value.name} / ${value.value}</p>
        </div>
      </div>
    `;
  }

  window.renderAiIndexPanel = renderAiIndexPanel;
    /* =========================================================
    Part8 オッズ画面
    - 3連単
    - 2連単
    - 2連複
    - 拡連複
    - 合成オッズ
    - 期待値
  ========================================================= */

  function getOddsData(data) {
    return data?.odds || data?.oddsData || {};
  }

  function normalizeOddsList(list) {
    if (!Array.isArray(list)) return [];

    return list
      .map(o => ({
        mark: o?.mark || o?.combination || o?.ticket || o?.kumi || "-",
        odds: num(o?.odds ?? o?.value ?? o?.rate),
        popularity: num(o?.popularity ?? o?.rank)
      }))
      .filter(o => o.mark !== "-" && o.odds !== null)
      .sort((a, b) => {
        if (a.popularity !== null && b.popularity !== null) {
          return a.popularity - b.popularity;
        }
        return a.odds - b.odds;
      });
  }

  function getOddsListByType(odds, type) {
    const keys = {
      trifecta: ["trifecta", "sanrentan", "threeExact", "3rentan", "3連単"],
      exacta: ["exacta", "nirentan", "twoExact", "2rentan", "2連単"],
      quinella: ["quinella", "nirenpuku", "twoQuinella", "2renpuku", "2連複"],
      wide: ["wide", "kakurenpuku", "kakuren", "拡連複"]
    };

    const candidates = keys[type] || [];

    for (const key of candidates) {
      if (Array.isArray(odds?.[key])) return normalizeOddsList(odds[key]);
    }

    return [];
  }

  function calcSyntheticOdds(marks, oddsList) {
    if (!marks || !marks.length) return null;

    const oddsMap = new Map(
      oddsList.map(o => [String(o.mark).replace(/\s/g, ""), o.odds])
    );

    let inverseSum = 0;
    let hitCount = 0;

    marks.forEach(mark => {
      const key = String(mark).replace(/\s/g, "");
      const odds = oddsMap.get(key);

      if (odds && odds > 0) {
        inverseSum += 1 / odds;
        hitCount++;
      }
    });

    if (!inverseSum || !hitCount) return null;

    return {
      odds: 1 / inverseSum,
      count: hitCount
    };
  }

  function getFormationMarks(data) {
    const f = data?.formation || data?.formations || {};

    const main = f?.main || f?.honmei || data?.mainFormation || [];
    const cover = f?.cover || f?.osae || data?.coverFormation || [];
    const hole = f?.hole || f?.manshu || data?.holeFormation || [];

    return {
      main: Array.isArray(main) ? main : [],
      cover: Array.isArray(cover) ? cover : [],
      hole: Array.isArray(hole) ? hole : []
    };
  }

  function expectedValueLabel(odds) {
    if (odds === null || odds === undefined) return "判定不可";
    if (odds >= 30) return "一撃型";
    if (odds >= 15) return "妙味あり";
    if (odds >= 7) return "標準";
    if (odds >= 3) return "堅め";
    return "過剰人気注意";
  }

  function renderOddsPanel(data) {
    const area = document.getElementById("oddsArea");
    if (!area) return;

    const odds = getOddsData(data);

    const trifecta = getOddsListByType(odds, "trifecta");
    const exacta = getOddsListByType(odds, "exacta");
    const quinella = getOddsListByType(odds, "quinella");
    const wide = getOddsListByType(odds, "wide");

    const formations = getFormationMarks(data);

    const mainSynthetic = calcSyntheticOdds(formations.main, trifecta);
    const coverSynthetic = calcSyntheticOdds(formations.cover, trifecta);
    const holeSynthetic = calcSyntheticOdds(formations.hole, trifecta);

    area.innerHTML = `
      <section class="card odds-card">
        <h2>オッズ</h2>

        <div class="mini-grid">
          ${renderSyntheticCard("本線", mainSynthetic)}
          ${renderSyntheticCard("押さえ", coverSynthetic)}
          ${renderSyntheticCard("万舟", holeSynthetic)}
        </div>

        ${renderOddsTypeBlock("3連単", trifecta, 12)}
        ${renderOddsTypeBlock("2連単", exacta, 10)}
        ${renderOddsTypeBlock("2連複", quinella, 10)}
        ${renderOddsTypeBlock("拡連複", wide, 10)}
      </section>
    `;
  }

  function renderSyntheticCard(title, result) {
    if (!result) {
      return `
        <div class="mini-card">
          <strong>${title} 合成オッズ</strong>
          <p class="muted">判定不可</p>
        </div>
      `;
    }

    const odds = result.odds;

    return `
      <div class="mini-card">
        <strong>${title} 合成オッズ</strong>
        <p class="big-number">${odds.toFixed(1)}倍</p>
        <p>${expectedValueLabel(odds)}</p>
        <p class="muted">取得点数：${result.count}点</p>
      </div>
    `;
  }

  function renderOddsTypeBlock(title, list, limit) {
    if (!list.length) {
      return `
        <div class="odds-block">
          <h3>${title}</h3>
          <p class="muted">オッズデータなし</p>
        </div>
      `;
    }

    const top = list.slice(0, limit);

    return `
      <div class="odds-block">
        <h3>${title}</h3>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>人気</th>
                <th>買い目</th>
                <th>オッズ</th>
                <th>期待値</th>
              </tr>
            </thead>
            <tbody>
              ${top.map((o, i) => `
                <tr>
                  <td>${o.popularity ?? i + 1}</td>
                  <td><strong>${o.mark}</strong></td>
                  <td>${o.odds.toFixed(1)}倍</td>
                  <td>${expectedValueLabel(o.odds)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.renderOddsPanel = renderOddsPanel;
    /* =========================================================
    Part9 履歴・成績・データ確認・最終コメント
  ========================================================= */

  function renderHistoryPanel(data) {
    const area = document.getElementById("historyArea");
    if (!area) return;

    const history = JSON.parse(localStorage.getItem("chappyRaceHistory") || "[]");

    area.innerHTML = `
      <section class="card history-card">
        <h2>履歴</h2>
        ${
          history.length
            ? history.slice(0, 10).map(h => `
              <div class="mini-card">
                <strong>${h.date || "-"} ${h.venue || "-"} ${h.raceNo || "-"}R</strong>
                <p>${h.result || "結果未登録"}</p>
              </div>
            `).join("")
            : `<p class="muted">履歴はまだありません。</p>`
        }
      </section>
    `;
  }

  function renderStatsPanel(data) {
    const area = document.getElementById("statsArea");
    if (!area) return;

    const stats = JSON.parse(localStorage.getItem("chappyStats") || "{}");

    const total = num(stats.total) || 0;
    const hit = num(stats.hit) || 0;
    const returnRate = num(stats.returnRate) || 0;
    const hitRate = total ? Math.round((hit / total) * 100) : 0;

    area.innerHTML = `
      <section class="card stats-card">
        <h2>成績管理</h2>

        <div class="mini-grid">
          <div class="mini-card">
            <strong>予想数</strong>
            <p class="big-number">${total}</p>
          </div>

          <div class="mini-card">
            <strong>的中数</strong>
            <p class="big-number">${hit}</p>
          </div>

          <div class="mini-card">
            <strong>的中率</strong>
            <p class="big-number">${hitRate}%</p>
          </div>

          <div class="mini-card">
            <strong>回収率</strong>
            <p class="big-number">${returnRate}%</p>
          </div>
        </div>
      </section>
    `;
  }

  function renderDataCheckPanel(data) {
    const area = document.getElementById("dataCheckArea");
    if (!area) return;

    const racers = getRacers(data);
    const odds = getOddsData(data);

    const checks = [
      {
        name: "出走表",
        ok: racers.length >= 6
      },
      {
        name: "展示タイム",
        ok: racers.some(r => getExTime(r) !== null)
      },
      {
        name: "展示ST",
        ok: racers.some(r => getTenjiST(r) !== null)
      },
      {
        name: "一周タイム",
        ok: racers.some(r => getLapTime(r) !== null)
      },
      {
        name: "オッズ",
        ok: Object.keys(odds || {}).length > 0
      },
      {
        name: "気象",
        ok: !!(data?.weather || data?.water)
      },
      {
        name: "場情報",
        ok: !!(data?.venue || data?.stadium || data?.place)
      }
    ];

    area.innerHTML = `
      <section class="card data-check-card">
        <h2>データ確認</h2>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>項目</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              ${checks.map(c => `
                <tr>
                  <td>${c.name}</td>
                  <td>${c.ok ? "✅ 取得済み" : "⚠️ 未取得"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderFinalComment(data) {
    const area = document.getElementById("finalCommentArea");
    if (!area) return;

    const indexes = createAiIndexes(data);
    const top = indexes[0];
    const second = indexes[1];
    const value = [...indexes].sort((a, b) => b.value - a.value)[0];

    if (!top) {
      area.innerHTML = `
        <section class="card final-comment-card">
          <h2>最終コメント</h2>
          <p class="muted">データ不足で最終判定できません。</p>
        </section>
      `;
      return;
    }

    area.innerHTML = `
      <section class="card final-comment-card">
        <h2>最終コメント</h2>

        <p>
          総合指数トップは
          <strong>${top.boat}号艇 ${top.name}</strong>。
          攻め・展開・道中・当地を合わせた中心候補。
        </p>

        <p>
          相手筆頭は
          <strong>${second ? `${second.boat}号艇 ${second.name}` : "判定不可"}</strong>。
          本線は指数上位から組み、押さえは道中指数と当地指数を重視。
        </p>

        <p>
          妙味候補は
          <strong>${value.boat}号艇 ${value.name}</strong>。
          人気だけで切らず、3着拾い・展開待ちの評価に入れる。
        </p>

        <p class="muted">
          最終判断は展示・ST・風・水面・オッズを合わせて調整。
        </p>
      </section>
    `;
  }

  window.renderHistoryPanel = renderHistoryPanel;
  window.renderStatsPanel = renderStatsPanel;
  window.renderDataCheckPanel = renderDataCheckPanel;
  window.renderFinalComment = renderFinalComment;
    /* =========================================================
    Part10 renderAll・互換関数・初期化
  ========================================================= */

  function renderAll(data) {
    if (!data) return;

    window.__CHAPPY_LAST_DATA__ = data;

    if (typeof renderEntryTable === "function") renderEntryTable(data);
    if (typeof renderWeatherPanel === "function") renderWeatherPanel(data);
    if (typeof renderVenuePanel === "function") renderVenuePanel(data);
    if (typeof renderMaterialPanel === "function") renderMaterialPanel(data);
    if (typeof renderRaceFlow === "function") renderRaceFlow(data);
    if (typeof renderMainSheet === "function") renderMainSheet(data);
    if (typeof renderPinkSheet === "function") renderPinkSheet(data);
    if (typeof renderTheoryPanel === "function") renderTheoryPanel(data);
    if (typeof renderAiIndexPanel === "function") renderAiIndexPanel(data);
    if (typeof renderOddsPanel === "function") renderOddsPanel(data);
    if (typeof renderHistoryPanel === "function") renderHistoryPanel(data);
    if (typeof renderStatsPanel === "function") renderStatsPanel(data);
    if (typeof renderDataCheckPanel === "function") renderDataCheckPanel(data);
    if (typeof renderFinalComment === "function") renderFinalComment(data);
  }

  function rerenderLastRace() {
    if (window.__CHAPPY_LAST_DATA__) {
      renderAll(window.__CHAPPY_LAST_DATA__);
    }
  }

  function clearArea(id) {
    const area = document.getElementById(id);
    if (area) area.innerHTML = "";
  }

  function clearAllRenderAreas() {
    [
      "raceListArea",
      "entryArea",
      "weatherArea",
      "venueArea",
      "materialArea",
      "raceFlowArea",
      "mainSheetArea",
      "formationArea",
      "pinkSheetArea",
      "theoryArea",
      "aiIndexArea",
      "oddsArea",
      "statsArea",
      "historyArea",
      "dataCheckArea",
      "finalCommentArea"
    ].forEach(clearArea);
  }

  function renderError(message) {
    const area =
      document.getElementById("finalCommentArea") ||
      document.getElementById("raceListArea");

    if (!area) return;

    area.innerHTML = `
      <section class="card error-card">
        <h2>エラー</h2>
        <p>${message || "データ取得に失敗しました。"}</p>
      </section>
    `;
  }

  function renderLoading(message) {
    const area = document.getElementById("raceListArea");
    if (!area) return;

    area.innerHTML = `
      <section class="card loading-card">
        <h2>読み込み中</h2>
        <p>${message || "レースデータを取得しています。"}</p>
      </section>
    `;
  }

  function renderEmpty(message) {
    const area = document.getElementById("raceListArea");
    if (!area) return;

    area.innerHTML = `
      <section class="card empty-card">
        <h2>データなし</h2>
        <p>${message || "表示できるデータがありません。"}</p>
      </section>
    `;
  }

  function renderRaceList(races) {
    const area = document.getElementById("raceListArea");
    if (!area) return;

    if (!Array.isArray(races) || !races.length) {
      renderEmpty("レース一覧がありません。");
      return;
    }

    area.innerHTML = `
      <section class="card race-list-card">
        <h2>レース一覧</h2>

        <div class="race-list">
          ${races.map(r => `
            <button class="race-button" data-race-no="${r.raceNo || r.rno || ""}">
              ${r.raceNo || r.rno || "-"}R
              <span>${r.title || r.name || ""}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }

  function initRenderEvents() {
    document.addEventListener("click", e => {
      const btn = e.target.closest("[data-race-no]");
      if (!btn) return;

      const raceNo = btn.dataset.raceNo;

      if (typeof window.selectRace === "function") {
        window.selectRace(raceNo);
      }
    });
  }

  window.renderAll = renderAll;
  window.rerenderLastRace = rerenderLastRace;
  window.clearAllRenderAreas = clearAllRenderAreas;
  window.renderError = renderError;
  window.renderLoading = renderLoading;
  window.renderEmpty = renderEmpty;
  window.renderRaceList = renderRaceList;

  initRenderEvents();

})();