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

  const VERSION = "prediction-v1.0.1-boat-identity";
  const boatIdentity =
    window.ChappyBoatIdentity ||
    (
      typeof require === "function"
        ? require("./boat-identity")
        : null
    );

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
    MIDDLE: "middle"
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
    メイン関数
  =============================== */

  function createPrediction(data) {
    const race = normalizeRaceData(data);

    const officialHistory =
      createOfficialHistoryAnalysis(
        race
      );

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

    const hasNumber = value =>
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(
        Number(value)
      );

    const entryCount =
      Math.min(
        race.entries.length,
        6
      );

    const avgSTCount =
      race.entries.filter(
        entry =>
          hasNumber(entry.avgST)
      ).length;

    const exhibitionCount =
      race.entries.filter(
        entry =>
          hasNumber(
            entry.exhibitionTime
          )
      ).length;

    const startCount =
      race.startExhibition.filter(
        entry =>
          hasNumber(entry.st)
      ).length;

    const localCount =
      race.entries.filter(
        entry =>
          hasNumber(
            entry.local?.winRate
          )
      ).length;

    const motorCount =
      race.entries.filter(
        entry =>
          hasNumber(
            entry.motor?.secondRate
          )
      ).length;

    const weatherCount =
      [
        race.weather.temperature,
        race.weather.windSpeed,
        race.weather
          .waterTemperature,
        race.weather.waveHeight
      ].filter(hasNumber).length;

    const qualityWarnings = [];

    if (entryCount < 6) {
      qualityWarnings.push(
        `出走表 ${entryCount}/6艇`
      );
    }

    if (avgSTCount < 6) {
      qualityWarnings.push(
        `平均ST ${avgSTCount}/6艇`
      );
    }

    if (exhibitionCount < 6) {
      qualityWarnings.push(
        `展示タイム ${exhibitionCount}/6艇`
      );
    }

    if (startCount < 6) {
      qualityWarnings.push(
        `展示ST ${startCount}/6艇`
      );
    }

    if (localCount < 6) {
      qualityWarnings.push(
        `当地勝率 ${localCount}/6艇`
      );
    }

    if (motorCount < 6) {
      qualityWarnings.push(
        `モーター2連率 ${motorCount}/6艇`
      );
    }

    if (weatherCount < 4) {
      qualityWarnings.push(
        `気象・水面 ${weatherCount}/4項目`
      );
    }

    const availableQualityPoints =
      entryCount +
      avgSTCount +
      exhibitionCount +
      startCount +
      localCount +
      motorCount +
      weatherCount;

    if (!race.boatIdentity?.valid) {
      qualityWarnings.push(
        `艇番不整合：${
          boatIdentity?.reasonText(
            race.boatIdentity
          ) ||
          "1〜6号艇を確認できません"
        }`
      );
    }

    const qualityScore =
      race.boatIdentity?.valid
        ? Math.round(
            (
              availableQualityPoints /
              40
            ) * 100
          )
        : 0;

    const dataQuality = {
      score: qualityScore,
      level:
        qualityScore >= 90
          ? "高"
          : qualityScore >= 70
            ? "中"
            : "低",
      warnings:
        qualityWarnings,
      counts: {
        entry: entryCount,
        avgST: avgSTCount,
        exhibition:
          exhibitionCount,
        start: startCount,
        local: localCount,
        motor: motorCount,
        weather: weatherCount
      },
      boatIdentity:
        race.boatIdentity || null
    };

        const oddsByTicket =
      race.odds?.byTicket || {};

    const createTicketRow = (
      ticketValue,
      category,
      scenarioType
    ) => {
      const ticketText =
        normalizeTicket(ticketValue);

      const rawOdds =
        oddsByTicket[ticketText];

      const numericOdds =
        Number(rawOdds);

      const hasOdds =
        rawOdds !== undefined &&
        rawOdds !== null &&
        rawOdds !== "" &&
        Number.isFinite(numericOdds) &&
        numericOdds > 0;

      return {
        ticket: ticketText,
        category,
        scenarioType,

        odds:
          hasOdds
            ? numericOdds
            : null,

        oddsText:
          hasOdds
            ? `${numericOdds}倍`
            : "オッズ未取得",

        hasOdds,

        isManshu:
          hasOdds &&
          numericOdds >= 100,

        scenarioTitle:
          raceFlow?.title || "",

        scenarioSummary:
          raceFlow?.summary || ""
      };
    };

    const mainTicketRows =
      (formation.main || [])
        .map(ticketText =>
          createTicketRow(
            ticketText,
            "本命",
            "中心展開"
          )
        )
        .filter(item => item.ticket);

    const coverTicketRows =
      (formation.cover || [])
        .map(ticketText =>
          createTicketRow(
            ticketText,
            "押さえ",
            "安全押さえ"
          )
        )
        .filter(item => item.ticket);

    const flowTicketRows =
      (formation.nagashi || [])
        .map(ticketText =>
          createTicketRow(
            ticketText,
            "流し",
            "流し展開"
          )
        )
        .filter(item => item.ticket);

    const holeTicketRows =
      (formation.hole || [])
        .map(ticketText => {
          const row =
            createTicketRow(
              ticketText,
              "穴候補",
              "穴展開"
            );

          return {
            ...row,

            category:
              row.isManshu
                ? "万舟"
                : row.hasOdds
                  ? "高配当候補"
                  : "穴候補"
          };
        })
        .filter(item => item.ticket);

    const aiTicketMap =
      new Map();

    [
      ...mainTicketRows,
      ...coverTicketRows,
      ...flowTicketRows,
      ...holeTicketRows
    ].forEach(item => {
      const existing =
        aiTicketMap.get(item.ticket);

      if (!existing) {
        aiTicketMap.set(
          item.ticket,
          {
            ...item,
            categories: [
              item.category
            ],
            scenarioTypes: [
              item.scenarioType
            ]
          }
        );

        return;
      }

      existing.categories =
        uniqueList([
          ...(existing.categories || []),
          item.category
        ]);

      existing.scenarioTypes =
        uniqueList([
          ...(existing.scenarioTypes || []),
          item.scenarioType
        ]);

      if (
        item.isManshu &&
        !existing.isManshu
      ) {
        existing.isManshu = true;
      }
    });

    const aiTicketList =
      [...aiTicketMap.values()];

    return {
      ok: true,
      version: VERSION,
      race,
      dataQuality,

      officialHistory,

      venue,
      newEngine,
      weather,
      exhibition,
      indexes,
      raceFlow,

      boatEvaluation:
        mainSheet,

      mainSheet: {
        ...mainSheet,

        sheetRole:
          "中心展開から作る本命3連単",

        tickets:
          mainTicketRows,

        coverTickets:
          coverTicketRows,

        flowTickets:
          flowTicketRows,

        formation
      },

      manshuSheet: {
        ...manshuSheet,

        sheetRole:
          "成立する穴展開・高配当・万舟買い目",

        tickets:
          holeTicketRows
      },

      ticketSheets: {
        main:
          mainTicketRows,

        cover:
          coverTicketRows,

        flow:
          flowTicketRows,

        hole:
          holeTicketRows,

        all:
          aiTicketList
      },

      aiTicketList,
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

    const rawEntries =
      Array.isArray(raw.entries)
        ? raw.entries
        : [];
    const entryIdentity =
      boatIdentity?.inspectEntries(
        rawEntries,
        {
          allowBoatNoFallback: false
        }
      ) || {
        valid: false,
        boatNos: rawEntries.map(() => 0),
        reasons: [{
          code: "identity_module_unavailable",
          label: "艇番整合性を確認できません"
        }]
      };
    const entries = normalizeEntries(
      rawEntries,
      entryIdentity
    );
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
      boatIdentity: entryIdentity,
      beforeInfo,
      startExhibition,
      weather,

      historyContext:
        raw.historyContext || null,

      odds: raw.odds || null,
      missingNumbers: raw.missingNumbers || raw.missing || [],
      raw
    };
  }
  function createOfficialHistoryAnalysis(
    race
  ) {
    const context =
      race?.historyContext || null;

    if (!context?.ready) {
      return {
        ready: false,
        usable: false,
        source: "",
        generatedAt: "",
        venue: null,
        racers: [],
        warnings: [
          "公式履歴統計はまだ利用できません"
        ]
      };
    }

    const venue =
      context.venue || null;

    const racers =
      Array.isArray(context.racers)
        ? context.racers
        : [];

    return {
      ready: true,

      usable:
        Boolean(
          context.usableVenueHistory ||
          context.usableRacerHistory
        ),

      source:
        context.source || "",

      generatedAt:
        context.generatedAt || "",

      venue:
        venue
          ? {
              jcd:
                String(
                  venue.jcd || ""
                ),

              place:
                venue.place ||
                race?.stadiumName ||
                "",

              samples:
                Number(
                  venue.samples ||
                  venue.totalRaces ||
                  0
                ),

              usable:
                Boolean(venue.usable),

              winningCourses:
                Array.isArray(
                  venue.winningCourses
                )
                  ? venue.winningCourses
                  : [],

              winningMethods:
                Array.isArray(
                  venue.winningMethods
                )
                  ? venue.winningMethods
                  : [],

              averageWinningSt:
                Number(
                  venue.averageWinningSt ||
                  0
                ),

              payoutBands:
                venue.payoutBands || null
            }
          : null,

      racers:
        racers.map(racer => ({
          registerNo:
            String(
              racer.registerNo || ""
            ),

          racerName:
            racer.racerName || "",

          samples:
            Number(
              racer.samples ||
              racer.starts ||
              0
            ),

          usable:
            Boolean(racer.usable),

          winRate:
            Number(
              racer.winRate || 0
            ),

          top3Rate:
            Number(
              racer.top3Rate || 0
            ),

          averageSt:
            Number(
              racer.averageSt || 0
            )
        })),

      warnings:
        Array.isArray(context.warnings)
          ? context.warnings
          : [],

      usagePolicy:
        "展開・コースを優先し、十分なサンプルがある場合だけ参考補正に使用する"
    };
  }
  function normalizeEntries(
    entries,
    entryIdentity = null
  ) {
    if (!Array.isArray(entries)) return [];

    return entries.map((entry, index) => {
      const boatNo =
        Number(
          entryIdentity
            ?.boatNos?.[index] ||
          0
        ) ||
        index + 1;

      const national = {
        winRate: toNumberOrNull(
          entry.nationalWinRate ??
          entry.national?.winRate ??
          entry.national?.rate
        ),
        secondRate: toPercentNumber(entry.national2Rate ?? entry.national?.secondRate ?? entry.national?.quinellaRate),
        thirdRate: toPercentNumber(entry.national3Rate ?? entry.national?.thirdRate ?? entry.national?.trioRate)
      };

      const local = {
        winRate: toNumberOrNull(
          entry.localWinRate ??
          entry.local?.winRate ??
          entry.local?.rate
        ),
        secondRate: toPercentNumber(entry.local2Rate ?? entry.local?.secondRate ?? entry.local?.quinellaRate),
        thirdRate: toPercentNumber(entry.local3Rate ?? entry.local?.thirdRate ?? entry.local?.trioRate)
      };

      const motor = {
        no: entry.motorNo ?? entry.motor?.no ?? entry.motor?.number ?? "",
        secondRate: toPercentNumber(entry.motor2Rate ?? entry.motor?.secondRate ?? entry.motor?.quinellaRate),
        thirdRate: toPercentNumber(entry.motor3Rate ?? entry.motor?.thirdRate ?? entry.motor?.trioRate)
      };

      const boat = {
        no:
          entry.boatNumber ??
          entry.boatNoValue ??
          (
            boatIdentity?.primaryBoatNo(
              entry
            )
              ? entry.boatNo
              : null
          ) ??
          entry.boatData?.no ??
          entry.boat?.no ??
          "",
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
        fCount: toNumberOrNull(
          entry.fCount ??
          entry.falseStartCount ??
          entry.falseStarts
        ),
        lCount: toNumberOrNull(
          entry.lCount ??
          entry.lateStartCount ??
          entry.lateStarts
        ),
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
        marker: safeString(item.marker),
        mappingSource:
          safeString(item.mappingSource),
        isOfficialCourse:
          item.isOfficialCourse === true,
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
      st:
  current.stList ||
  current.st ||
  current.ST ||
  current.startTiming ||
  current.スタート ||
  [],
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
    const period =
      window.ChappyAICore?.getNewEnvironmentPeriod
        ? window.ChappyAICore.getNewEnvironmentPeriod({
            ...(race.raw || {}),
            date: race.date,
            stadiumName: venueName,
            raceInfo: race.raceInfo
          })
        : {
            venueName,
            deployments: [],
            activeLabels: [],
            isActive: false,
            isProvisional: false,
            isStable: false
          };
    const activeDeployment =
      period.deployments?.find(item => item.isActive) || null;
    const provisionalDeployment =
      period.deployments?.find(item => item.isProvisional) || null;
    const phase =
      activeDeployment?.phase === "early"
        ? NEW_ENGINE_PHASE.EARLY
        : activeDeployment?.phase === "middle"
          ? NEW_ENGINE_PHASE.MIDDLE
          : NEW_ENGINE_PHASE.NONE;

    const weights = createNewEngineWeights(phase);

    return {
      venueName: period.venueName || venueName,
      updated: period.isActive === true,
      updateDate:
        activeDeployment?.introducedAt ||
        provisionalDeployment?.introducedAt ||
        "",
      phase,
      phaseLabel:
        period.isProvisional
          ? "暫定"
          : createEnginePhaseLabel(phase),
      weights,
      memo:
        period.isProvisional
          ? "導入日不明のため新環境補正は発動せず、参考表示のみ。"
          : createNewEngineRuleText(phase),
      rule: createNewEngineRuleText(phase),
      deployments: period.deployments || [],
      activeLabels: period.activeLabels || [],
      isProvisional: period.isProvisional === true,
      isStable: period.isStable === true,
      source: period.source || "ai-core-new-environment-period-v1"
    };
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
    return "通常";
  }

  function createNewEngineRuleText(phase) {
    if (phase === NEW_ENGINE_PHASE.EARLY) {
      return "新型エンジン初期。モーター2連率・3連率は過信せず、展示・今節気配・ST・技量を上位評価。";
    }

    if (phase === NEW_ENGINE_PHASE.MIDDLE) {
      return "新型エンジン中期。モーター数字も見始めるが、展示・今節気配をまだ重視。";
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

    const waterType =
  String(venue?.water || "");

const isVariableWater = [
  "海水",
  "汽水",
  "河口",
  "河川"
].includes(waterType);

const hasStrongWind =
  windSpeed !== null &&
  windSpeed >= 4;

const hasWaveEffect =
  waveHeight !== null &&
  waveHeight >= 3;

if (
  isVariableWater &&
  (
    hasStrongWind ||
    hasWaveEffect
  )
) {
  const waterSurfaceBonus =
    hasStrongWind &&
    hasWaveEffect
      ? 8
      : 6;

  roughScore += waterSurfaceBonus;
  insideRisk += 4;
  outsideChance += 4;
  pickupChance += waterSurfaceBonus;

  buffs.push(
    `${waterType}の風波補正 +${waterSurfaceBonus}`
  );
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
  before?.exhibitionST ||
  start?.st ||
  entry.exhibitionST
);

      const exhibitionSTNumber = toSTNumber(exhibitionST);

      const lapTime = toNumberOrNull(before?.lapTime);
      const tilt = safeString(before?.tilt ?? entry.tilt);
      const weight = safeString(before?.weight ?? entry.weight);
      const partsExchange = safeString(before?.partsExchange);

const courseCandidate = toBoatNo(
  start?.course ?? boatNo
);

const course =
  courseCandidate >= 1 && courseCandidate <= 6
    ? courseCandidate
    : boatNo;

return {
  boatNo,
  course,
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

    const stRank = rankSmallNumber(
      list,
      "exhibitionSTNumber"
    );
    const exhibitionTheory =
      window.ChappyAICore
        ?.buildExhibitionPerformanceEvaluation
        ? window.ChappyAICore
            .buildExhibitionPerformanceEvaluation(
              list,
              race
            )
        : {
            version:
              "exhibition-performance-v2",
            mode: "provisional",
            modeLabel: "暫定・中立評価",
            status: "暫定・中立50点",
            isFormal: false,
            appliedToScore: false,
            exhibitionCount: list.filter(
              item =>
                item.exhibitionTime !== null
            ).length,
            lapCount: list.filter(
              item => item.lapTime !== null
            ).length,
            source: {
              label: "出典未確定"
            },
            roles: list.map(item => ({
              boatNo: item.boatNo,
              exhibitionRank: null,
              lapRank: null,
              score: 50,
              appliedIndex: 50,
              grade: "D",
              reason:
                "統一展示判定を利用できないため中立50点"
            }))
          };
    const theoryByBoat = new Map(
      exhibitionTheory.roles.map(
        item => [Number(item.boatNo), item]
      )
    );

    const enriched = list.map(item => {
      const theory =
        theoryByBoat.get(Number(item.boatNo)) ||
        {};
      const stR =
        stRank[item.boatNo] || null;
      const buffs = [];
      const debuffs = [];

      if (
        theory.isFormal &&
        ["S", "A"].includes(theory.grade)
      ) {
        buffs.push(
          `展示・足${theory.grade}評価`
        );
      }

      if (theory.isDoubleTime) {
        buffs.push(
          "ダブルタイム成立・展示足内へ統合"
        );
      }

      if (
        theory.isFormal &&
        theory.grade === "D"
      ) {
        debuffs.push("展示・足D評価");
      }

      return {
        ...item,
        exhibitionRank:
          theory.exhibitionRank || null,
        stRank: stR,
        lapRank: theory.lapRank || null,
        score:
          theory.appliedIndex ?? 50,
        rawExhibitionScore:
          theory.score ?? 50,
        grade: theory.grade || "D",
        theoryMode:
          theory.mode ||
          exhibitionTheory.mode,
        theoryStatus:
          theory.status ||
          exhibitionTheory.status,
        source:
          theory.source ||
          exhibitionTheory.source?.label ||
          "出典未確定",
        components:
          theory.components || {},
        reason: theory.reason || "",
        buffs,
        debuffs,
        comment:
          theory.isFormal
            ? `${item.boatNo}号艇は展示・足${theory.grade}（${theory.appliedIndex}点）。${theory.reason}`
            : `${item.boatNo}号艇は展示データ不足のため中立50点。`
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
      exhibitionTheory.doubleTimeBoat
        ? findByBoatNo(
            enriched,
            exhibitionTheory.doubleTimeBoat
          )
        : null;

    return {
      list: enriched,
      topExhibition,
      topST,
      topLap,
      doubleTimeBoat,
      theory: exhibitionTheory,
      mode: exhibitionTheory.mode,
      modeLabel:
        exhibitionTheory.modeLabel,
      status: exhibitionTheory.status,
      isFormal:
        exhibitionTheory.isFormal === true,
      source:
        exhibitionTheory.source,
      comment: createExhibitionComment({
        topExhibition,
        topST,
        topLap,
        doubleTimeBoat,
        theory: exhibitionTheory
      })
    };
  }

  function createExhibitionComment(params) {
    const parts = [];

    if (params.topExhibition) {
      parts.push(`展示タイム1位は${params.topExhibition.boatNo}号艇`);
    }

    if (params.topLap) {
      parts.push(`一周1位は${params.topLap.boatNo}号艇`);
    }

    if (params.doubleTimeBoat) {
      parts.push(`ダブルタイムは${params.doubleTimeBoat.boatNo}号艇`);
    }

    if (!parts.length) {
      return "展示データ不足のため、展示・足は中立50点。";
    }

    const mode =
      params.theory?.modeLabel ||
      "暫定・中立評価";
    const source =
      params.theory?.source?.label ||
      "出典未確定";

    return `${parts.join(" / ")}。${mode}・出典：${source}。展示・足9％枠だけへ反映。`;
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

  const courseCandidate = toBoatNo(
    params.exhibition?.course ?? boatNo
  );

  const course =
    courseCandidate >= 1 && courseCandidate <= 6
      ? courseCandidate
      : boatNo;

  const base = COURSE_BASE[course] || DEFAULT_INDEX;
  const weights =
    params.newEngine?.weights ||
    createNewEngineWeights(NEW_ENGINE_PHASE.NONE);

    let attack = base.attack;
    let tenkai = base.tenkai;
    let michu = base.michu;
    let local = base.local;
    let expected = base.expected;

    const buffs = [];
    const debuffs = [];

    buffs.push(base.comment);

    const classBonus =
  getClassBonus(entry.className);

const skillSupportWeight = 0.60;

attack +=
  classBonus.attack *
  weights.skill *
  skillSupportWeight;

tenkai +=
  classBonus.tenkai *
  weights.skill *
  skillSupportWeight;

michu +=
  classBonus.michu *
  weights.skill *
  skillSupportWeight;

local +=
  classBonus.local *
  weights.skill *
  skillSupportWeight;

if (boatNo >= 4) {
  expected +=
    classBonus.expectedOuter *
    skillSupportWeight;
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

    const currentSTValues = (
  Array.isArray(entry.currentSeries?.st)
    ? entry.currentSeries.st
    : []
)
  .map(value => toSTNumber(value))
  .filter(value => value !== null);

const currentSTAverage = currentSTValues.length
  ? currentSTValues.reduce((sum, value) => sum + value, 0) /
    currentSTValues.length
  : null;

if (currentSTAverage !== null) {
  if (currentSTAverage <= 0.12) {
    attack += 18 * weights.st;
    tenkai += 12 * weights.st;
    expected += 8;
    buffs.push(`今節ST速い ${formatST(currentSTAverage)}`);
  } else if (currentSTAverage <= 0.15) {
    attack += 12 * weights.st;
    tenkai += 8 * weights.st;
    expected += 4;
    buffs.push(`今節ST安定 ${formatST(currentSTAverage)}`);
  } else if (currentSTAverage >= 0.20) {
    attack -= 15 * weights.st;
    tenkai -= 10 * weights.st;
    expected -= 5;
    debuffs.push(`今節ST遅め ${formatST(currentSTAverage)}`);
  }
}

const nationalWinRate = toNumberOrNull(entry.national?.winRate);
    const localWinRate = toNumberOrNull(entry.local?.winRate);
    const motor2Rate = toNumberOrNull(entry.motor?.secondRate);
    const boat2Rate = toNumberOrNull(entry.boat?.secondRate);

  if (
  nationalWinRate !== null &&
  nationalWinRate > 0
) {
  const nationalDiff =
    nationalWinRate - 5.0;

  const rawNationalBonus =
    nationalDiff * 5;

  const nationalBonus =
    Math.max(
      -8,
      Math.min(
        8,
        rawNationalBonus
      )
    );

  attack +=
    nationalBonus *
    weights.skill *
    skillSupportWeight;

  michu +=
    nationalBonus *
    0.85 *
    weights.skill *
    skillSupportWeight;

  if (nationalWinRate >= 6.5) {
    buffs.push(
      `全国勝率上位 ${nationalWinRate}`
    );
  } else if (nationalWinRate >= 5.5) {
    buffs.push(
      `全国勝率安定 ${nationalWinRate}`
    );
  } else if (nationalWinRate <= 4.0) {
    debuffs.push(
      `全国勝率低め ${nationalWinRate}`
    );
  }
}
  

    if (localWinRate !== null && localWinRate > 0) {
  const localDiff =
    localWinRate - 5.0;

  const localBonus =
    localDiff * 7;

  local +=
    localBonus * weights.local;

  michu +=
    localBonus *
    0.35 *
    weights.local;

  const localRanking = (
    params.race?.entries || []
  )
    .map((raceEntry, index) => ({
      boatNo:
        raceEntry.boatNo ||
        index + 1,

      localWinRate:
        toNumberOrNull(
          raceEntry.local?.winRate
        )
    }))
    .filter(
      value =>
        value.localWinRate !== null &&
        value.localWinRate > 0
    )
    .sort(
      (a, b) =>
        b.localWinRate -
        a.localWinRate
    );

  const localRank =
    localRanking.findIndex(
      value =>
        Number(value.boatNo) ===
        Number(boatNo)
    ) + 1;

  if (localRank === 1) {
    local += 8;
    expected += 6;

    buffs.push(
      `当地勝率1位 ${localWinRate}`
    );
  } else if (localRank === 2) {
    local += 5;
    expected += 4;

    buffs.push(
      `当地勝率2位 ${localWinRate}`
    );
  } else if (localRank === 3) {
    local += 2;
    expected += 2;

    buffs.push(
      `当地勝率3位 ${localWinRate}`
    );
  } else if (localRank >= 5) {
    local -= 4;
    expected -= 2;

    debuffs.push(
      `当地勝率下位 ${localWinRate}`
    );
  }
}

     if (
  motor2Rate !== null &&
  motor2Rate > 0
) {
  const rawMotorBonus =
    (motor2Rate - 30) / 2.5;

  const motorBonus =
    Math.max(
      -6,
      Math.min(
        6,
        rawMotorBonus
      )
    );

  const motorSupportWeight = 0.50;

  attack +=
    motorBonus *
    weights.motor *
    motorSupportWeight;

  tenkai +=
    motorBonus *
    0.70 *
    weights.motor *
    motorSupportWeight;

  if (motor2Rate >= 40) {
    buffs.push(
      `M2連率上位 ${motor2Rate}%`
    );
  } else if (motor2Rate <= 25) {
    debuffs.push(
      `M2連率低め ${motor2Rate}%`
    );
  }
}
      if (
  boat2Rate !== null &&
  boat2Rate > 0
) {
  const rawBoatBonus =
    (boat2Rate - 30) / 4;

  const boatBonus =
    Math.max(
      -4,
      Math.min(
        4,
        rawBoatBonus
      )
    );

  const boatSupportWeight = 0.50;

  michu +=
    boatBonus *
    boatSupportWeight;

  if (boat2Rate >= 40) {
    buffs.push(
      `ボート2連率上位 ${boat2Rate}%`
    );
  } else if (boat2Rate <= 25) {
    debuffs.push(
      `ボート2連率低め ${boat2Rate}%`
    );
  }
}
    if (params.exhibition) {
      if (params.exhibition.buffs?.length) {
        buffs.push(...params.exhibition.buffs.slice(0, 2));
      }

      if (params.exhibition.debuffs?.length) {
        debuffs.push(...params.exhibition.debuffs.slice(0, 1));
      }
    }

    applyVenueAdjustment({
  boatNo: course,
  venue: params.venue,
  weather: params.weather,
  values: {
    attackRef: value => attack += value,
    tenkaiRef: value => tenkai += value,
    michuRef: value => michu += value,
    localRef: value => local += value,
    expectedRef: value => expected += value
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
  course,
  name: entry.racerName || entry.name || "",
  className: entry.className || "",
avgST: entry.avgST || "",
avgSTNumber,
currentSTAverage,
currentSTCount: currentSTValues.length,
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
    const pickupCandidates =
  selectPickupBoats(scores, context);

const mustKeepPickupBoats = [5, 6]
  .map(course =>
    pickupCandidates.find(
      item => Number(item.course) === course
    )
  )
  .filter(Boolean);

const pickupBoats = [
  pickupCandidates[0],
  ...mustKeepPickupBoats,
  ...pickupCandidates
].filter(
  (item, index, list) =>
    item &&
    list.findIndex(
      value =>
        Number(value.boatNo) ===
        Number(item.boatNo)
    ) === index
);
    const holdCandidates =
  selectHoldBoats(scores, context);

const mustKeepHoldBoats = [2, 4]
  .map(course =>
    holdCandidates.find(
      item => Number(item.course) === course
    )
  )
  .filter(Boolean);

const holdBoats = [
  holdCandidates[0],
  ...mustKeepHoldBoats,
  ...holdCandidates
].filter(
  (item, index, list) =>
    item &&
    list.findIndex(
      value =>
        Number(value.boatNo) ===
        Number(item.boatNo)
    ) === index
);

    const primaryAttackBoatNo =
  Number(attackBoats[0]?.boatNo || 0);

if (primaryAttackBoatNo > 0) {
  const pickupAttackIndex =
    pickupBoats.findIndex(
      item =>
        Number(item.boatNo) ===
        primaryAttackBoatNo
    );

  if (pickupAttackIndex >= 0) {
    pickupBoats.splice(
      pickupAttackIndex,
      1
    );
  }

  const holdAttackIndex =
    holdBoats.findIndex(
      item =>
        Number(item.boatNo) ===
        primaryAttackBoatNo
    );

  if (holdAttackIndex >= 0) {
    holdBoats.splice(
      holdAttackIndex,
      1
    );
  }
}

const startPhase =
  createStartPhase(
    race,
    context,
    scores
  );
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
  const exhibitionList = [
    ...(context.exhibition?.list || [])
  ].sort((a, b) => {
    const courseA = Number(a.course || a.boatNo);
    const courseB = Number(b.course || b.boatNo);

    return courseA - courseB;
  });

  return [...scores]
    .map(item => {
      let score = item.attack;

      const boatNo = toBoatNo(item.boatNo);

      const courseCandidate = toBoatNo(
        item.course ?? boatNo
      );

      const course =
        courseCandidate >= 1 &&
        courseCandidate <= 6
          ? courseCandidate
          : boatNo;

      const currentIndex = exhibitionList.findIndex(
        exhibitionItem =>
          toBoatNo(exhibitionItem.boatNo) === boatNo
      );

      const currentExhibition =
        currentIndex >= 0
          ? exhibitionList[currentIndex]
          : null;

      const currentST = toSTNumber(
        currentExhibition?.exhibitionSTNumber
      );

      const neighborSTValues = [
        exhibitionList[currentIndex - 1]?.exhibitionSTNumber,
        exhibitionList[currentIndex + 1]?.exhibitionSTNumber
      ]
        .map(value => toSTNumber(value))
        .filter(value => value !== null);

      const slitDiff =
        currentST !== null && neighborSTValues.length
          ? Math.max(
              ...neighborSTValues.map(
                neighborST => neighborST - currentST
              )
            )
          : 0;

      const hasSlitAlert = slitDiff >= 0.1;

      if (
        course === 2 &&
        context.venue?.sashi >= 60
      ) {
        score += 8;
      }

      if (
        (course === 3 || course === 4) &&
        context.venue?.makuri >= 60
      ) {
        score += 8;
      }

      if (
        course >= 4 &&
        item.expected >= 70
      ) {
        score += 4;
      }

      if (hasSlitAlert) {
        score +=
          12 +
          Math.min(
            6,
            Math.round((slitDiff - 0.1) * 50)
          );
      }

      const flowReasons = [
        createAttackFlowReason(
          {
            ...item,
            course
          },
          context
        )
      ];

      if (hasSlitAlert) {
        flowReasons.push(
          `スリットアラート 隣艇より${slitDiff.toFixed(2)}速い`
        );
      }

      return {
        ...item,
        course,
        slitAlert: hasSlitAlert,
        slitDiff:
          Math.round(slitDiff * 100) / 100,
        flowScore: clampScore(score),
        flowReason: flowReasons.join(" / ")
      };
    })
        .sort((a, b) => {
      const alertDifference =
        Number(b.slitAlert) -
        Number(a.slitAlert);

      if (alertDifference !== 0) {
        return alertDifference;
      }

      return b.flowScore - a.flowScore;
    });
}

  function selectDangerBoats(scores, context) {
  const exhibitionList = [
    ...(context.exhibition?.list || [])
  ].sort((a, b) => {
    const courseA = Number(a.course || a.boatNo);
    const courseB = Number(b.course || b.boatNo);

    return courseA - courseB;
  });

  return [...scores]
    .map(item => {
      let score = 40;
      const reasons = [];

      const boatNo = toBoatNo(item.boatNo);

      const courseCandidate = toBoatNo(
        item.course ?? boatNo
      );

      const course =
        courseCandidate >= 1 &&
        courseCandidate <= 6
          ? courseCandidate
          : boatNo;

      const currentIndex = exhibitionList.findIndex(
        exhibitionItem =>
          toBoatNo(exhibitionItem.boatNo) === boatNo
      );

      const currentExhibition =
        currentIndex >= 0
          ? exhibitionList[currentIndex]
          : null;

      const currentST = toSTNumber(
        currentExhibition?.exhibitionSTNumber
      );

      const neighborSTValues = [
        exhibitionList[currentIndex - 1]?.exhibitionSTNumber,
        exhibitionList[currentIndex + 1]?.exhibitionSTNumber
      ]
        .map(value => toSTNumber(value))
        .filter(value => value !== null);

      const slitLossDiff =
        currentST !== null && neighborSTValues.length
          ? Math.max(
              ...neighborSTValues.map(
                neighborST => currentST - neighborST
              )
            )
          : 0;

      const hasSlitRisk = slitLossDiff >= 0.1;

      if (course === 1) {
        score += 18;
        reasons.push("攻めを受ける側");
      }

      if (course === 2) {
        score += 10;
        reasons.push(
          "3コース攻めを受ける位置"
        );
      }

      if (course === 4) {
        score += 8;
        reasons.push(
          "3コース艇が攻めると攻め場が狭くなる"
        );
      }

      if (item.attack < 55) {
        score += 8;
        reasons.push("攻め指数控えめ");
      }

      if (item.total < 58) {
        score += 6;
        reasons.push("総合指数控えめ");
      }

      if (
        context.weather?.insideRisk >= 65 &&
        course <= 2
      ) {
        score += 8;
        reasons.push("風波で内リスク");
      }

      if (hasSlitRisk) {
        score +=
          14 +
          Math.min(
            6,
            Math.round((slitLossDiff - 0.1) * 50)
          );

        reasons.push(
          `スリット遅れ 隣艇より${slitLossDiff.toFixed(2)}遅い`
        );
      }

      return {
        ...item,
        course,
        slitRisk: hasSlitRisk,
        slitLossDiff:
          Math.round(slitLossDiff * 100) / 100,
        flowScore: clampScore(score),
        flowReason:
          reasons.length
            ? reasons.join(" / ")
            : "展開を受けた時のリスク"
      };
    })
    .sort(
      (a, b) =>
        b.flowScore - a.flowScore
    );
}

  function selectPickupBoats(scores, context) {
  return [...scores]
    .map(item => {
      const isRoughWater =
  Number(
    context.weather?.roughScore
  ) >= 65;

const michuWeight =
  isRoughWater ? 0.40 : 0.45;

const tenkaiWeight =
  isRoughWater ? 0.30 : 0.35;

const localWeight =
  isRoughWater ? 0.30 : 0.20;

let score =
  item.michu * michuWeight +
  item.tenkai * tenkaiWeight +
  item.local * localWeight;

const reasons = [];

if (isRoughWater) {
  reasons.push(
    "荒れ水面で当地・道中重視"
  );
}

      const boatNo = toBoatNo(
        item.boatNo
      );

      const courseCandidate = toBoatNo(
        item.course ??
        boatNo
      );

      const course =
        courseCandidate >= 1 &&
        courseCandidate <= 6
          ? courseCandidate
          : boatNo;

      if (course === 5) {
  score += 12;
  reasons.push(
    "5コースまくり差し拾い"
  );
} else if (course === 6) {
  score += 10;
  reasons.push(
    "6コース最内差し・道中拾い"
  );
}

      if (course === 2) {
        score += 6;
        reasons.push(
          "2コース差し残り"
        );
      }

      if (item.michu >= 75) {
        reasons.push("道中指数上位");
      }

      if (item.local >= 75) {
        reasons.push("当地指数上位");
      }

      if (
        context.weather?.pickupChance >= 62
      ) {
        score += 7;
        reasons.push(
          "水面荒れで拾い上昇"
        );
      }

      return {
        ...item,
        course,
        flowScore: clampScore(score),
        flowReason:
          reasons.length
            ? reasons.join(" / ")
            : item.shortComment
      };
    })
    .sort(
      (a, b) =>
        b.flowScore - a.flowScore
    );
}

  function selectHoldBoats(scores, context) {
  return [...scores]
    .map(item => {
      let score =
        item.tenkai * 0.35 +
        item.michu * 0.35 +
        item.total * 0.30;

      const reasons = [];

      const boatNo = toBoatNo(
        item.boatNo
      );

      const courseCandidate = toBoatNo(
        item.course ??
        boatNo
      );

      const course =
        courseCandidate >= 1 &&
        courseCandidate <= 6
          ? courseCandidate
          : boatNo;

      if (course === 1) {
        score +=
          context.venue?.inPower >= 70
            ? 12
            : 4;

        reasons.push("イン残し");
      }

      if (course === 2) {
  const isOmura =
    context.venue?.name === "大村";

  score += isOmura ? 12 : 10;

  reasons.push(
    isOmura
      ? "大村2差し・2着残り"
      : "2コース差し残り"
  );
}

  if (course === 4) {
  const currentST =
    item.currentSTAverage;

  const averageST =
    item.avgSTNumber;

  const kadoST =
    currentST !== null &&
    currentST !== undefined
      ? Number(currentST)
      : averageST !== null &&
        averageST !== undefined
        ? Number(averageST)
        : null;

  const hasKadoST =
    Number.isFinite(kadoST) &&
    kadoST <= 0.15;

  const isOmura =
    context.venue?.name === "大村";

  const course3Boat = scores.find(
    value =>
      Number(
        value.course ??
        value.boatNo
      ) === 3
  );

  const hasCourse3Attack =
    Number(course3Boat?.attack) >= 75;

  score += hasKadoST ? 10 : 4;

  reasons.push(
    hasKadoST
      ? `4カドST決めて残し ${formatST(kadoST)}`
      : "4コース残し候補"
  );

  if (
    isOmura &&
    hasCourse3Attack &&
    !hasKadoST
  ) {
    score -= 8;

    reasons.push(
      "大村3攻め時は4の攻め場縮小 -8"
    );
  }
}

      if (item.total >= 75) {
        reasons.push("総合指数上位");
      }

      return {
        ...item,
        course,
        flowScore: clampScore(score),
        flowReason:
          reasons.length
            ? reasons.join(" / ")
            : "着残し候補"
      };
    })
    .sort(
      (a, b) =>
        b.flowScore - a.flowScore
    );
}

  function createAttackFlowReason(item, context) {
  const reasons = [];

  const boatNo = toBoatNo(
    item?.boatNo
  );

  const courseCandidate = toBoatNo(
    item?.course ??
    boatNo
  );

  const course =
    courseCandidate >= 1 &&
    courseCandidate <= 6
      ? courseCandidate
      : boatNo;

  if (item.attack >= 75) {
    reasons.push("攻め指数上位");
  }

  if (course === 1) {
    reasons.push("イン先マイ");
  }

  if (course === 2) {
    reasons.push("2コース差し");
  }

  if (course === 3) {
    reasons.push("3コース攻め");
  }

  if (course === 4) {
    reasons.push("カド攻め");
  }

  if (course >= 5) {
    reasons.push("外コースから展開突き");
  }

  if (
    context.exhibition?.topST?.boatNo ===
    boatNo
  ) {
    reasons.push("展示ST1位");
  }

  if (
    context.exhibition?.topExhibition?.boatNo ===
    boatNo
  ) {
    reasons.push("展示タイム1位");
  }

  if (!reasons.length) {
    reasons.push(
      item.shortComment ||
      "攻め候補"
    );
  }

  return reasons.join(" / ");
}

  function toFlowBoat(item) {
  const boatNo = toBoatNo(
    item?.boatNo
  );

  const courseCandidate = toBoatNo(
    item?.course ??
    boatNo
  );

  const course =
    courseCandidate >= 1 &&
    courseCandidate <= 6
      ? courseCandidate
      : boatNo;

  return {
    boatNo,
    course,
    label: item?.name || "",
    name: item?.name || "",

    slitAlert: Boolean(item?.slitAlert),
    slitDiff: Number(item?.slitDiff || 0),

    slitRisk: Boolean(item?.slitRisk),
    slitLossDiff: Number(
      item?.slitLossDiff || 0
    ),

    score:
      item?.flowScore ??
      item?.total ??
      "-",

    reason:
      item?.flowReason ||
      item?.shortComment ||
      "展開候補"
  };
}

  function createStartPhase(race, context, scores) {
  const stSorted = [...scores]
    .map(item => {
      const useCurrentST =
        Number(item.currentSTCount) >= 2 &&
        Number.isFinite(Number(item.currentSTAverage));

      const stNumber = useCurrentST
        ? Number(item.currentSTAverage)
        : toSTNumber(item.avgST);

      return {
        ...item,
        stNumber,
        stValue: stNumber,
        stSource: useCurrentST ? "今節ST" : "平均ST"
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
      comment: "今節ST・平均STデータが薄いため、展示STとコース傾向で補正。"
    };
  }

  const hasClearDifference =
    slow &&
    slow.boatNo !== top.boatNo &&
    slow.stNumber - top.stNumber >= 0.05;

  const comment = hasClearDifference
    ? `${top.boatNo}号艇が${top.stSource}で優位。${slow.boatNo}号艇は${slow.stSource}で遅れリスク。`
    : `${top.boatNo}号艇が${top.stSource}でやや優位。全体は大きな差まではない。`;

  return {
    title: "スタート",
    leader: {
      boatNo: top.boatNo,
      name: top.name,
      st: formatST(top.stValue),
      source: top.stSource,
      score: top.attack
    },
    risk:
      slow && slow.boatNo !== top.boatNo
        ? {
            boatNo: slow.boatNo,
            name: slow.name,
            st: formatST(slow.stValue),
            source: slow.stSource
          }
        : null,
    comment
  };
}

  function createSlitPhase(race, context, scores) {
  const exhibitionList = [
    ...(context.exhibition?.list || [])
  ].sort((a, b) => {
    const courseA = Number(a.course || a.boatNo);
    const courseB = Number(b.course || b.boatNo);

    return courseA - courseB;
  });

  const stList = exhibitionList
    .filter(
      item =>
        toSTNumber(
          item.exhibitionSTNumber
        ) !== null
    )
    .sort(
      (a, b) =>
        toSTNumber(a.exhibitionSTNumber) -
        toSTNumber(b.exhibitionSTNumber)
    );

  const alerts = [];
  let comparisonCount = 0;

  for (
    let i = 0;
    i < exhibitionList.length;
    i++
  ) {
    const current = exhibitionList[i];

    const currentST = toSTNumber(
      current.exhibitionSTNumber
    );

    if (currentST === null) {
      continue;
    }

    const neighbors = [
      {
        side: "内側",
        boat: exhibitionList[i - 1]
      },
      {
        side: "外側",
        boat: exhibitionList[i + 1]
      }
    ]
      .map(item => {
        const neighborST = toSTNumber(
          item.boat?.exhibitionSTNumber
        );

        if (
          !item.boat ||
          neighborST === null
        ) {
          return null;
        }

        return {
          boatNo: toBoatNo(
            item.boat.boatNo
          ),
          name: item.boat.name || "",
          side: item.side,
          st: neighborST,
          diff: neighborST - currentST
        };
      })
      .filter(Boolean);

    comparisonCount += neighbors.length;

    const compared = [...neighbors]
      .sort(
        (a, b) =>
          b.diff - a.diff
      )[0] || null;

    if (
      !compared ||
      compared.diff < 0.1
    ) {
      continue;
    }

    const boatNo = toBoatNo(
      current.boatNo
    );

    const course =
      toBoatNo(
        current.course ?? boatNo
      ) || boatNo;

    const diff =
      Math.round(
        compared.diff * 100
      ) / 100;

    let development =
      "スリット優位を展開全体と照合する。";

    if (course === 1) {
      development =
        "イン先マイの後押しとなり、1着候補として展開全体と照合する。";
    } else if (course === 2) {
      development =
        "2コース差しの入口となり、1着候補と1号艇の残しを比較する。";
    } else if (
      course === 3 ||
      course === 4
    ) {
      development =
        `${course}コース攻めの入口となり、内側の残しと外側の拾いを比較する。`;
    } else if (course >= 5) {
      development =
        "外から展開を突く材料として、1着固定ではなく拾いも含めて確認する。";
    }

    alerts.push({
      boatNo,
      name: current.name,
      course,

      st: currentST,

      comparedBoatNo:
        compared.boatNo,

      comparedName:
        compared.name,

      comparedSide:
        compared.side,

      comparedST:
        compared.st,

      diff,

      score:
        clampScore(
          70 + diff * 100
        ),

      reason:
        `${compared.side}の` +
        `${compared.boatNo}号艇より` +
        `展示STで${diff.toFixed(2)}速い`,

      comment:
        `${boatNo}号艇は` +
        `${compared.side}の` +
        `${compared.boatNo}号艇との比較で` +
        `展示STが${diff.toFixed(2)}速く、` +
        `スリットアラート発動。` +
        development
    });
  }

  const top =
    stList[0] || null;

  let comment = "";

  if (alerts.length) {
    comment = alerts
      .map(item => item.comment)
      .join(" ");
  } else if (
    top &&
    comparisonCount > 0
  ) {
    comment =
      `展示ST最上位は${top.boatNo}号艇だが、` +
      `隣接艇との差はすべて0.10未満のため、` +
      `スリットアラートは発動していない。`;
  } else if (top) {
    comment =
      `展示STは${top.boatNo}号艇が上位だが、` +
      `比較できる隣接艇の展示STが不足しているため、` +
      `スリットアラートは発動していない。`;
  } else {
    comment =
      "展示STデータが不足しているため、スリットアラートは判定できない。";
  }

  return {
    title: "スリット",

    top: top
      ? {
          boatNo: top.boatNo,
          name: top.name,
          st: formatST(
            top.exhibitionST
          )
        }
      : null,

    alerts,
    comment
  };
}

  function createFirstMarkPhase(race, context, flow) {
  const mainAttack =
    flow.attackBoats[0] || null;

  const secondAttack =
    flow.attackBoats[1] || null;

  const mainHold =
    flow.holdBoats[0] || null;

  const mainDanger =
    flow.dangerBoats[0] || null;

  let pattern = "standard";
  let comment =
    "1マークは内の残しとセンター攻めの比較。";

  const attackBoatNo = toBoatNo(
    mainAttack?.boatNo
  );

  const attackCourseCandidate = toBoatNo(
    mainAttack?.course ??
    attackBoatNo
  );

  const attackCourse =
    attackCourseCandidate >= 1 &&
    attackCourseCandidate <= 6
      ? attackCourseCandidate
      : attackBoatNo;

  if (mainAttack) {
    if (attackCourse === 1) {
      pattern = "escape";
      comment =
        `1マークは${attackBoatNo}号艇の` +
        `イン逃げが基本線。` +
        `相手は差し残し・外の拾い。`;
    } else if (attackCourse === 2) {
      pattern = "sashi";
      comment =
        `${attackBoatNo}号艇の2コース差しが展開の入口。` +
        `インが残すか、差しが届くかを見る。`;
    } else if (attackCourse === 3) {
      pattern = "center_attack";
      comment =
        `${attackBoatNo}号艇の3コース攻めが入口。` +
        `内の1・2コース艇が受ける形になり、` +
        `4コース艇は攻め場が狭くなる可能性。`;
    } else if (attackCourse === 4) {
      pattern = "kado";
      comment =
        `${attackBoatNo}号艇の4カド攻めが入口。` +
        `内が流れれば外のまくり差し・拾いが浮上。`;
    } else {
      pattern = "outside";
      comment =
        `${attackBoatNo}号艇は${attackCourse}コースから` +
        `展開突き。頭と2・3着の両方で評価。`;
    }
  }

  if (
    context.weather?.insideRisk >= 68 &&
    attackCourse !== 1
  ) {
    comment +=
      " 風波で内が流れるリスクも加味。";
  }

  if (mainDanger) {
    comment +=
      ` 飛ぶ・流れる候補は` +
      `${mainDanger.boatNo}号艇。`;
  }

  return {
    title: "1マーク",
    pattern,
    mainAttack:
      mainAttack
        ? toFlowBoat(mainAttack)
        : null,
    secondAttack:
      secondAttack
        ? toFlowBoat(secondAttack)
        : null,
    mainHold:
      mainHold
        ? toFlowBoat(mainHold)
        : null,
    mainDanger:
      mainDanger
        ? toFlowBoat(mainDanger)
        : null,
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
      summary:
        "攻め艇・残し艇・拾い艇を分けて評価。"
    };
  }

  const attackBoatNo = toBoatNo(
    mainAttack.boatNo
  );

  const attackCourseCandidate = toBoatNo(
    mainAttack.course ??
    attackBoatNo
  );

  const attackCourse =
    attackCourseCandidate >= 1 &&
    attackCourseCandidate <= 6
      ? attackCourseCandidate
      : attackBoatNo;

  const holdBoatNo =
    toBoatNo(mainHold?.boatNo) || 1;

  const pickupBoatNo =
    toBoatNo(mainPickup?.boatNo) || 5;

  const insideRisk = Number(
    weather?.insideRisk ?? 0
  );

  if (
    attackCourse === 1 &&
    venue?.inPower >= 70 &&
    insideRisk < 65
  ) {
    return {
      title: "イン逃げ本線",
      summary:
        `基本は${attackBoatNo}号艇のイン逃げ。` +
        `相手は${holdBoatNo}号艇の残し、` +
        `${pickupBoatNo}号艇の拾い。`
    };
  }

  if (attackCourse === 2) {
    return {
      title: "2コース差し本線",
      summary:
        `${attackBoatNo}号艇の2コース差しが展開の入口。` +
        `${holdBoatNo}号艇の残しと、` +
        `${pickupBoatNo}号艇の2・3着拾いを重視。`
    };
  }

  if (attackCourse === 3) {
    return {
      title: "3コース攻め警戒",
      summary:
        `${attackBoatNo}号艇の3コース攻めが入口。` +
        `内の残しと、${pickupBoatNo}号艇の展開拾いまで見る。`
    };
  }

  if (attackCourse === 4) {
    return {
      title: "4カド攻め警戒",
      summary:
        `${attackBoatNo}号艇の4カド攻めが入口。` +
        `内が流れた時は${pickupBoatNo}号艇の` +
        `まくり差し・拾いが浮上。`
    };
  }

  if (attackCourse === 1) {
    return {
      title: "イン先マイ・外攻め警戒",
      summary:
        `${attackBoatNo}号艇の先マイを基準に、` +
        `${pickupBoatNo}号艇の外からの攻め・` +
        `まくり差しを警戒。` +
        `${attackBoatNo}号艇は残し、外攻め艇は頭まで評価。`
    };
  }

  return {
    title: "外コース展開突き",
    summary:
      `${attackBoatNo}号艇は${attackCourse}コースから` +
      `展開を突く形。` +
      `攻め切れば頭まで、届かない場合は2・3着で評価。`
  };
}
    /* ===============================
    青シート生成
  =============================== */

    function createMainSheet(race, context) {
    const safeContext = context || {};
    const evaluations = createMainEvaluations(race, safeContext);

    const mainAttackBoatNo = Number(
      safeContext.raceFlow?.attackBoats?.[0]?.boatNo || 0
    );

    const insideRisk = Number(
      safeContext.weather?.insideRisk ?? 0
    );

    const rankedRows = evaluations
      .map(item => {
        const boatNo = Number(item.boatNo || 0);

const courseCandidate = toBoatNo(
  item.course ?? boatNo
);

const course =
  courseCandidate >= 1 && courseCandidate <= 6
    ? courseCandidate
    : boatNo;

const attack = Number(item.attack ?? 50);
const tenkai = Number(item.tenkai ?? 50);
const michu = Number(item.michu ?? 50);
const expected = Number(item.expected ?? 50);
const local = Number(item.local ?? 50);
const total = Number(item.total ?? 50);
const score = Number(item.score ?? 50);

let priority =
  tenkai * 0.30 +
  attack * 0.23 +
  michu * 0.15 +
  expected * 0.12 +
  total * 0.08 +
  local * 0.07 +
  score * 0.05;

let canHead = course === 1 || course === 2;

if (course === 1) {
  priority += insideRisk < 65 ? 8 : 2;
}

if (course === 2) {
  priority += 4;
}

if (course === 3) {
  if (attack >= 70 && tenkai >= 60) {
    priority += 4;
    canHead = true;
  }
}

if (course === 4) {
  if (attack >= 72 && tenkai >= 65) {
    priority += 4;
    canHead = true;
  }
}

if (course >= 5) {
  const outsideEvidence =
    attack >= 75 &&
    tenkai >= 75 &&
    (michu >= 70 || expected >= 75);

  if (outsideEvidence) {
    priority += 3;
    canHead = true;
  } else {
    priority -= 8;
  }
}

        if (boatNo === mainAttackBoatNo) {
          priority += 6;
        }

        const mainAttack =
  safeContext.raceFlow?.attackBoats?.[0];

const mainAttackCourseCandidate = toBoatNo(
  mainAttack?.course ??
  mainAttack?.boatNo
);

const mainAttackCourse =
  mainAttackCourseCandidate >= 1 &&
  mainAttackCourseCandidate <= 6
    ? mainAttackCourseCandidate
    : 0;

if (mainAttackCourse === 3) {
  if (course === 4) {
    priority -= 4;
  }

  if ([1, 2, 5].includes(course)) {
    priority += 3;
  }
}

if (
  mainAttackCourse === 4 &&
  [5, 6].includes(course)
) {
  priority += 4;
}

        return {
          item,
          boatNo,
          attack,
          tenkai,
          priority,
          canHead
        };
      })
      .sort((a, b) =>
        b.priority - a.priority ||
        b.tenkai - a.tenkai ||
        b.attack - a.attack ||
        a.boatNo - b.boatNo
      );

    const headRow =
      rankedRows.find(row => row.canHead) ||
      rankedRows[0] ||
      null;

    const honmei = headRow?.item || null;

    const remainingRows = rankedRows.filter(
      row => row.item !== honmei
    );

    const taikou = remainingRows[0]?.item || null;

    const scenarioSorted = [
      honmei,
      ...remainingRows.map(row => row.item)
    ].filter(Boolean);

    const ana = selectAnaCandidate(
      scenarioSorted,
      safeContext
    );

    const osae = selectOsaeCandidate(
      scenarioSorted,
      safeContext,
      {
        honmei,
        taikou,
        ana
      }
    );

    return {
      honmei,
      taikou,
      ana,
      osae,
      reason: createMainSheetReason({
        race,
        context: safeContext,
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
  course:
    indexData.course ??
    exhibition?.course ??
    boatNo,
  name: entry.racerName || entry.name || "",
  className:
    entry.className ||
    entry.grade ||
    entry.class ||
    "",
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

  const courseCandidate = toBoatNo(
    indexData.course ??
    exhibition.course ??
    boatNo
  );

  const course =
    courseCandidate >= 1 && courseCandidate <= 6
      ? courseCandidate
      : boatNo;

  let score = Number(indexData.total ?? 50);

  const buffs = [];
  const debuffs = [];

  if (Array.isArray(indexData.buffs)) {
    buffs.push(...indexData.buffs);
  }

  if (Array.isArray(indexData.debuffs)) {
    debuffs.push(...indexData.debuffs);
  }

  const venue = context.venue;
  const weather = context.weather;
  const newEngine = context.newEngine;

  if (course === 1) {
    if (
      venue?.inPower >= 72 &&
      weather?.insideRisk < 65
    ) {
      score += 8;
      buffs.push("イン逃げ本線");
    }

    if (weather?.insideRisk >= 65) {
      score -= 5;
      debuffs.push("風波でイン過信注意");
    }
  }

  if (course === 2) {
    score += 4;
    buffs.push("2コース差し・残しを切らない");

    if (venue?.sashi >= 60) {
      score += 5;
      buffs.push("差し水面補正");
    }
  }

  if (course === 3) {
    if (venue?.makuri >= 58) {
      score += 4;
      buffs.push("3コース攻め警戒");
    }

    if (
      newEngine?.updated &&
      newEngine.phase !== NEW_ENGINE_PHASE.NONE
    ) {
      score += 3;
      buffs.push("新型エンジン期の3攻め警戒");
    }
  }

  if (course === 4) {
    score += 2;
    buffs.push("4コース残しを切らない");

    const mainAttack =
      context.raceFlow?.attackBoats?.[0];

    const mainAttackCourse = toBoatNo(
      mainAttack?.course ??
      mainAttack?.boatNo
    );

    if (mainAttackCourse === 3) {
      score -= 3;
      debuffs.push("3攻め時は攻め場が狭くなる");
    }
  }

  if (course >= 5) {
    if (
      indexData.michu >= 70 ||
      indexData.local >= 70
    ) {
      score += 5;
      buffs.push("外コースでも拾い評価");
    } else {
      score -= 3;
      debuffs.push("外コースで展開待ち");
    }
  }

    const slitAlertData = (
  context.raceFlow?.phases?.slit?.alerts || []
).find(
  item =>
    toBoatNo(item.boatNo) === boatNo
);

const slitRiskData = (
  context.raceFlow?.dangerBoats || []
).find(
  item =>
    toBoatNo(item.boatNo) === boatNo &&
    item.slitRisk
);

if (slitAlertData) {
  const slitDiff = Number(
    slitAlertData.diff || 0
  );

  score +=
    8 +
    Math.min(
      4,
      Math.max(
        0,
        Math.round((slitDiff - 0.1) * 20)
      )
    );

  buffs.push(
    `スリットアラート 隣艇より${slitDiff.toFixed(2)}速い`
  );
}

if (slitRiskData) {
  const slitLossDiff = Number(
    slitRiskData.slitLossDiff || 0
  );

  score -=
    8 +
    Math.min(
      4,
      Math.max(
        0,
        Math.round((slitLossDiff - 0.1) * 20)
      )
    );

  debuffs.push(
    `スリット遅れ 隣艇より${slitLossDiff.toFixed(2)}遅い`
  );
}

    if (newEngine?.updated && newEngine.phase === NEW_ENGINE_PHASE.EARLY) {
      const motor2Rate = toNumberOrNull(entry.motor?.secondRate);

      if (motor2Rate !== null && motor2Rate >= 40) {
        score -= 2;
        debuffs.push("新型初期はM数字過信注意");
      }

      if (indexData.attack >= 70) {
        score += 3;
        buffs.push("新型初期はST・攻めを重視");
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
        fallbackBoatNo: boatNo,
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

  const courseCandidate = toBoatNo(
    params.course ??
    indexData.course ??
    boatNo
  );

  const course =
    courseCandidate >= 1 && courseCandidate <= 6
      ? courseCandidate
      : boatNo;

  if (indexData.attack >= 75) {
    roles.push("🔥攻め艇");
  }

  if (indexData.tenkai >= 75) {
    roles.push("🌊展開艇");
  }

  if (indexData.michu >= 75) {
    roles.push("⚡道中艇");
  }

  if (indexData.local >= 75) {
    roles.push("🏠当地巧者");
  }

  if (course === 1) {
    roles.push("🛟イン残し");
  }

  if (course === 2) {
    roles.push("🛟差し残し");
  }

  if (course >= 5) {
    roles.push("💣外コース妙味");
  }

  if (!roles.length) {
    if (params.score >= 75) {
      roles.push("⭐軸候補");
    } else if (params.score >= 65) {
      roles.push("○相手候補");
    } else {
      roles.push("△押さえ");
    }
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
    const boatNo =
  Number(params.boatNo) >= 1 && Number(params.boatNo) <= 6
    ? Number(params.boatNo)
    : Number(params.entry?.boatNo) >= 1 && Number(params.entry?.boatNo) <= 6
      ? Number(params.entry.boatNo)
      : Number(params.fallbackBoatNo) || 0;
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
      .filter(item => {
  const course = toBoatNo(
    item.course ??
    item.boatNo
  );

  return (
    item.expected >= 65 ||
    item.attack >= 70 ||
    course >= 4
  );
})
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
    const course = toBoatNo(
      item.course ??
      item.boatNo
    );

    if (course === 2) return true;
    if (course === 4) return true;
    if (item.michu >= 68) return true;
    if (item.local >= 68) return true;
    if (item.total >= 60) return true;

    return false;
  })[0];

    return holdCandidate || sorted.find(item => !used.has(item.boatNo)) || sorted[3] || null;
  }

    function createMainSheetReason(params) {
    const context = params?.context || {};
    const venue = context.venue || {};
    const weather = context.weather || {};
    const newEngine = context.newEngine || {};

    const parts = [];

    function cleanText(value) {
      return String(value || "")
        .trim()
        .replace(/[。]+$/, "");
    }

    function getScenarioLabel(item) {
  const boatNo = toBoatNo(
    item?.boatNo
  );

  const courseCandidate = toBoatNo(
    item?.course ??
    boatNo
  );

  const course =
    courseCandidate >= 1 && courseCandidate <= 6
      ? courseCandidate
      : boatNo;

  if (course === 1) {
    return "イン逃げ・残し";
  }

  if (course === 2) {
    return "2コース差し・残し";
  }

  if (course === 3) {
    return "3コースからの攻め";
  }

  if (course === 4) {
    return "カド攻め・展開突き";
  }

  if (course === 5) {
    return "まくり差し・展開拾い";
  }

  if (course === 6) {
    return "最内差し・道中拾い";
  }

  return "展開対応";
}

    function getIndexSummary(item) {
      const values = [];

      const score = Number(item?.score);
      const attack = Number(item?.attack);
      const tenkai = Number(item?.tenkai);
      const michu = Number(item?.michu);

      if (Number.isFinite(score)) {
        values.push(`AI${Math.round(score)}`);
      }

      if (Number.isFinite(attack)) {
        values.push(`攻め${Math.round(attack)}`);
      }

      if (Number.isFinite(tenkai)) {
        values.push(`展開${Math.round(tenkai)}`);
      }

      if (Number.isFinite(michu)) {
        values.push(`道中${Math.round(michu)}`);
      }

      return values.join("・");
    }

    function addBoatReason(label, item) {
      if (!item) return;

      const boatNo = Number(item.boatNo || 0);
      const scenario = getScenarioLabel(item);
      const indexes = getIndexSummary(item);

      const reason = indexes
        ? `${label}は${boatNo}号艇。${scenario}を軸に、${indexes}を評価`
        : `${label}は${boatNo}号艇。${scenario}を評価`;

      parts.push(reason);
    }

    addBoatReason("本命", params?.honmei);
    addBoatReason("対抗", params?.taikou);
    addBoatReason("穴", params?.ana);
    addBoatReason("押さえ", params?.osae);

    if (venue?.name && venue?.memo) {
      parts.push(
        `${cleanText(venue.name)}は${cleanText(venue.memo)}`
      );
    }

    if (weather?.comment) {
      parts.push(cleanText(weather.comment));
    }

    if (newEngine?.updated && newEngine?.rule) {
      parts.push(cleanText(newEngine.rule));
    }

    if (!parts.length) {
      return "展開・コース・ST・展示を優先して本線を組み立てる。";
    }

    return `${parts.join("。")}。`;
  }
    /* ===============================
     ピンクシート生成（万舟）
  =============================== */

  function createManshuSheet(race, context) {

    const evaluations = createManshuEvaluations(race, context);

    const mainBoatNo = Number(
  context.mainSheet?.honmei?.boatNo || 0
);

const candidates = [...evaluations]
  .filter(
    item =>
      Number(item.boatNo) !==
      mainBoatNo
  )
  .sort(
    (a, b) =>
      b.manshuScore -
      a.manshuScore
  )
  .slice(0, 3);

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

  function createManshuScore(entry, index, context) {
  index = index || {
    attack: 50,
    tenkai: 50,
    michu: 50,
    local: 50,
    total: 50,
    expected: 50
  };

  context = context || {};
  context.weather = context.weather || {};
  context.newEngine = context.newEngine || {};

  let manshu = 45;
  let hold = 45;
  let pickup = 45;

  const buffs = [];
  const debuffs = [];

  const boatNo = Number(entry?.boatNo || 0);

  /* ===============================
    外枠補正
  =============================== */

  if (boatNo >= 4) {
    manshu += 18;
    pickup += 10;

    buffs.push("外枠高配当");
  }

  /* ===============================
    2コース差し・残し
  =============================== */

  if (boatNo === 2) {
    hold += 18;
    pickup += 8;

    buffs.push("2コース差し");
  }

  /* ===============================
    イン残し
  =============================== */

  if (boatNo === 1) {
    hold += 20;
    manshu -= 8;

    buffs.push("イン残し");
  }

  /* ===============================
    攻め指数
  =============================== */

  if (Number(index.attack) >= 75) {
    manshu += 10;

    buffs.push("攻め指数高い");
  }

  /* ===============================
    期待値指数
  =============================== */

  if (Number(index.expected) >= 75) {
    manshu += 14;

    buffs.push("期待値高い");
  }

  /* ===============================
    道中指数
  =============================== */

  if (Number(index.michu) >= 75) {
    pickup += 14;

    buffs.push("道中指数高い");
  }

  /* ===============================
    当地指数
  =============================== */

  if (Number(index.local) >= 75) {
    pickup += 10;
    hold += 8;

    buffs.push("当地巧者");
  }

  /* ===============================
    風・水面補正
  =============================== */

  if (Number(context.weather.outsideChance) >= 65) {
    manshu += 8;
    pickup += 8;

    buffs.push("風で外有利");
  }

  if (
    Number(context.weather.insideRisk) >= 65 &&
    boatNo === 1
  ) {
    hold -= 6;

    debuffs.push("インリスク");
  }

  /* ===============================
    新型エンジン補正
  =============================== */

  if (context.newEngine.updated) {
    if (Number(index.attack) >= 70) {
      manshu += 5;

      buffs.push("新型エンジン期は展示重視");
    }
  }

  manshu = clampScore(manshu);
  hold = clampScore(hold);
  pickup = clampScore(pickup);

  return {
    boatNo,

    name:
      entry?.racerName ||
      entry?.name ||
      `${boatNo}号艇`,
      
      className: entry.className || entry.grade || entry.class || "",

    manshuScore: manshu,
    holdScore: hold,
    pickupScore: pickup,

    reason:
      buffs.length
        ? buffs.join(" / ")
        : "展開と指数を総合評価",

    buffs: uniqueList(buffs),
    debuffs: uniqueList(debuffs)
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
    /* ===============================
    フォーメーション生成
    - 本線
    - 押さえ
    - 流し
    - 万舟
  =============================== */

    function createFormation(race, context) {
    const raceFlow = context.raceFlow || {};
    const byBoat = context.indexes?.byBoat || {};
    const exhibitionList = context.exhibition?.list || [];

    const courseByBoat = {};

    (race.entries || []).forEach((entry, index) => {
      const boatNo = toBoatNo(
        entry?.boatNo ?? index + 1
      );

      const exhibition = findByBoatNo(
        exhibitionList,
        boatNo
      );

      const courseCandidate = toBoatNo(
        byBoat[boatNo]?.course ??
        exhibition?.course ??
        boatNo
      );

      courseByBoat[boatNo] =
        courseCandidate >= 1 &&
        courseCandidate <= 6
          ? courseCandidate
          : boatNo;
    });

    const boatAtCourse = course => {
      const found = Object.entries(
        courseByBoat
      ).find(
        ([, value]) =>
          Number(value) === Number(course)
      );

      return found
        ? Number(found[0])
        : Number(course);
    };

    const insideBoat = boatAtCourse(1);
    const secondBoat = boatAtCourse(2);
    const thirdBoat = boatAtCourse(3);
    const fourthBoat = boatAtCourse(4);
    const fifthBoat = boatAtCourse(5);
    const sixthBoat = boatAtCourse(6);

    const primaryAttack =
      raceFlow.attackBoats?.[0] || null;

    const attackBoat = toBoatNo(
      primaryAttack?.boatNo
    );

    const attackCourseCandidate = toBoatNo(
      primaryAttack?.course ??
      courseByBoat[attackBoat] ??
      attackBoat
    );

    const attackCourse =
      attackCourseCandidate >= 1 &&
      attackCourseCandidate <= 6
        ? attackCourseCandidate
        : 0;

    const alternateAttackBoat = toBoatNo(
      raceFlow.attackBoats?.find(item => {
        const boatNo = toBoatNo(
          item?.boatNo
        );

        const course = toBoatNo(
          item?.course ??
          courseByBoat[boatNo] ??
          boatNo
        );

        return (
          boatNo !== insideBoat &&
          course >= 3
        );
      })?.boatNo
    );

    const challengerBoat =
      attackBoat &&
      attackBoat !== insideBoat
        ? attackBoat
        : alternateAttackBoat ||
          thirdBoat;

    const holdBoats = uniqueNumbers([
      secondBoat,
      fourthBoat,
      ...(raceFlow.holdBoats || [])
        .map(item => item?.boatNo)
    ]).filter(isValidBoatNo);

    const pickupBoats = uniqueNumbers([
      ...(raceFlow.pickupBoats || [])
        .map(item => item?.boatNo),
      fifthBoat,
      sixthBoat
    ]).filter(isValidBoatNo);

    const scenarioTitle =
      String(raceFlow.title || "");

        const markedHead = toBoatNo(
      context.mainSheet?.honmei?.boatNo
    );

    const mainHead =
      isValidBoatNo(markedHead)
        ? markedHead
        : scenarioTitle === "2コース差し本線" &&
            attackCourse === 2
          ? attackBoat
          : insideBoat;

    const addTickets = (
      target,
      head,
      seconds,
      thirds,
      limit,
      perSecondLimit = Infinity
    ) => {
      if (!isValidBoatNo(head)) return;

      uniqueNumbers(seconds)
        .filter(
          second =>
            isValidBoatNo(second) &&
            second !== head
        )
        .forEach(second => {
          let addedForSecond = 0;

          uniqueNumbers(thirds)
            .filter(
              third =>
                isValidBoatNo(third) &&
                third !== head &&
                third !== second
            )
            .forEach(third => {
              if (
                target.length >= limit ||
                addedForSecond >=
                  perSecondLimit
              ) {
                return;
              }

              const ticketText = ticket(
                head,
                second,
                third
              );

              if (
                ticketText &&
                !target.includes(ticketText)
              ) {
                target.push(ticketText);
                addedForSecond += 1;
              }
            });
        });
    };

    const main = [];
    const cover = [];
    const nagashi = [];
    const hole = [];

    const mainSeconds = uniqueNumbers([
      mainHead === secondBoat
        ? insideBoat
        : secondBoat,
      challengerBoat,
      thirdBoat,
      fourthBoat
    ]);

    const mainThirds = uniqueNumbers([
      secondBoat,
      thirdBoat,
      fourthBoat,
      ...holdBoats,
      ...pickupBoats
    ]);

    addTickets(
      main,
      mainHead,
      mainSeconds,
      mainThirds,
      8,
      2
    );

    if (
      mainHead === secondBoat &&
      insideBoat !== mainHead
    ) {
      addTickets(
        main,
        insideBoat,
        [secondBoat, challengerBoat],
        [secondBoat, thirdBoat, fourthBoat],
        8,
        2
      );
    }

    addTickets(
      cover,
      secondBoat,
      [insideBoat, challengerBoat],
      [insideBoat, thirdBoat, fourthBoat],
      6,
      2
    );

    addTickets(
      cover,
      insideBoat,
      [fourthBoat, challengerBoat],
      [secondBoat, fourthBoat, ...pickupBoats],
      10,
      2
    );

    if (
      challengerBoat !== insideBoat &&
      challengerBoat !== secondBoat
    ) {
      addTickets(
        cover,
        challengerBoat,
        [insideBoat, secondBoat],
        [insideBoat, secondBoat, fourthBoat, ...pickupBoats],
        10,
        2
      );
    }

    addTickets(
      nagashi,
      mainHead,
      mainSeconds,
      mainThirds,
      12
    );

    if (
      challengerBoat !== mainHead
    ) {
      addTickets(
        nagashi,
        challengerBoat,
        [insideBoat, secondBoat, fourthBoat],
        [insideBoat, secondBoat, fourthBoat, ...pickupBoats],
        18
      );
    }

    if (
      challengerBoat !== mainHead
    ) {
      addTickets(
        hole,
        challengerBoat,
        [insideBoat, secondBoat, fourthBoat, ...pickupBoats],
        [insideBoat, secondBoat, fourthBoat, ...pickupBoats],
        8,
        2
      );
    }

    pickupBoats.forEach(pickupBoat => {
      if (
        pickupBoat === mainHead ||
        hole.length >= 12
      ) {
        return;
      }

      addTickets(
        hole,
        pickupBoat,
        [insideBoat, challengerBoat, secondBoat],
        [insideBoat, challengerBoat, secondBoat, fourthBoat],
        12,
        2
      );
    });

    const cleanMain =
      cleanExactTickets(main)
        .slice(0, 8);

    const cleanCover =
      cleanExactTickets(cover)
        .filter(
          item =>
            !cleanMain.includes(item)
        )
        .slice(0, 10);

    const cleanNagashi =
      cleanExactTickets(nagashi)
        .slice(0, 18);

    const cleanHole =
      cleanExactTickets(hole)
        .filter(
          item =>
            !cleanMain.includes(item)
        )
        .slice(0, 12);

    const all = uniqueList([
      ...cleanMain,
      ...cleanCover,
      ...cleanNagashi,
      ...cleanHole
    ]);

    return {
      main: cleanMain,
      honmei: cleanMain,
      normal: cleanMain,
      base: cleanMain,

      cover: cleanCover,
      safety: cleanCover,
      osae: cleanCover,

      nagashi: cleanNagashi,
      flow: cleanNagashi,

      hole: cleanHole,
      ana: cleanHole,

      manshu: cleanHole,
      longshot: cleanHole,
      highPay: cleanHole,

      all,

      source: {
        type: "raceFlow",
        scenarioTitle,
        scenarioSummary:
          raceFlow.summary || "",
        mainHead,
        attackBoat: challengerBoat,
        attackCourse,
        holdBoats,
        pickupBoats
      },

      summary: createFormationSummary({
        main: cleanMain,
        cover: cleanCover,
        nagashi: cleanNagashi,
        hole: cleanHole,
        axis: mainHead,
        secondAxis: secondBoat,
        holeAxis: challengerBoat,
        coverAxis: fourthBoat,
        context
      })
    };
  }

  function createMainFormationTickets(params) {
    const {
      axis,
      secondAxis,
      holeAxis,
      coverAxis,
      secondGroup,
      thirdGroup,
      context
    } = params;

    const tickets = [];

    tickets.push(ticket(axis, secondAxis, holeAxis));
    tickets.push(ticket(axis, secondAxis, coverAxis));
    tickets.push(ticket(axis, holeAxis, secondAxis));

    if (coverAxis) {
      tickets.push(ticket(axis, coverAxis, secondAxis));
    }

    if (axis === 1 && context.venue?.inPower >= 70) {
      const s = secondGroup.slice(0, 3).join("");
      const t = thirdGroup.slice(0, 4).join("");

      if (s && t) {
        tickets.push(`${axis}-${s}-${t}`);
      }
    }

    return cleanTickets(tickets).slice(0, 8);
  }

  function createCoverFormationTickets(params) {
    const {
      axis,
      secondAxis,
      holeAxis,
      coverAxis,
      totalRanking,
      pickupRanking,
      context
    } = params;

    const tickets = [];

    if (secondAxis) {
      tickets.push(ticket(secondAxis, axis, holeAxis));
      tickets.push(ticket(secondAxis, axis, coverAxis));
    }

    if (holeAxis) {
      tickets.push(ticket(holeAxis, axis, secondAxis));
      tickets.push(ticket(holeAxis, secondAxis, axis));
    }

    if (coverAxis) {
      tickets.push(ticket(axis, coverAxis, holeAxis));
      tickets.push(ticket(coverAxis, axis, secondAxis));
    }

    const road = pickupRanking[0]?.boatNo;
    const third = totalRanking[2]?.boatNo;

    if (road && third) {
      tickets.push(ticket(axis, secondAxis, road));
      tickets.push(ticket(axis, road, third));
    }

    if (context.weather?.insideRisk >= 65 && axis === 1) {
      tickets.push(ticket(secondAxis, holeAxis, axis));
      tickets.push(ticket(holeAxis, secondAxis, axis));
    }

    return cleanTickets(tickets).slice(0, 10);
  }

  function createNagashiTickets(params) {
    const {
      axis,
      secondGroup,
      thirdGroup,
      raceFlow,
      context
    } = params;

    const tickets = [];

    const attackBoat = Number(raceFlow?.attackBoats?.[0]?.boatNo || 0);
    const pickupBoat = Number(raceFlow?.pickupBoats?.[0]?.boatNo || 0);

    const second = uniqueNumbers(secondGroup).filter(n => n && n !== axis);
    const third = uniqueNumbers(thirdGroup).filter(n => n && n !== axis);

    if (second.length >= 2 && third.length >= 3) {
      tickets.push(`${axis}-${second.slice(0, 3).join("")}-${third.slice(0, 5).join("")}`);
    }

    if (attackBoat && attackBoat !== axis) {
      const s = uniqueNumbers([axis, ...second]).filter(n => n !== attackBoat).slice(0, 3);
      const t = uniqueNumbers([axis, pickupBoat, ...third]).filter(n => n !== attackBoat).slice(0, 5);

      if (s.length && t.length) {
        tickets.push(`${attackBoat}-${s.join("")}-${t.join("")}`);
      }
    }

    if (pickupBoat && pickupBoat !== axis) {
      const s = uniqueNumbers([axis, attackBoat, ...second]).filter(n => n !== pickupBoat).slice(0, 3);
      const t = uniqueNumbers([axis, attackBoat, ...third]).filter(n => n !== pickupBoat).slice(0, 5);

      if (s.length && t.length) {
        tickets.push(`${axis}-${s.join("")}-${pickupBoat}${t.join("")}`);
      }
    }

    if (context.weather?.outsideChance >= 65) {
      const outside = uniqueNumbers([4, 5, 6, attackBoat, pickupBoat]).filter(Boolean);
      const inside = uniqueNumbers([1, 2, 3, axis]).filter(Boolean);

      if (outside.length && inside.length) {
        tickets.push(`${outside.slice(0, 2).join("")}-${inside.slice(0, 3).join("")}-${third.slice(0, 5).join("")}`);
      }
    }

    return cleanTickets(tickets).slice(0, 6);
  }

  function createHoleFormationTickets(params) {
    const {
      manshuSheet,
      expectedRanking,
      pickupRanking,
      totalRanking,
      context
    } = params;

    const tickets = [];

    if (Array.isArray(manshuSheet.formation)) {
      tickets.push(...manshuSheet.formation);
    }

    const e1 = expectedRanking[0]?.boatNo;
    const e2 = expectedRanking[1]?.boatNo;
    const p1 = pickupRanking[0]?.boatNo;
    const p2 = pickupRanking[1]?.boatNo;
    const t1 = totalRanking[0]?.boatNo;
    const t2 = totalRanking[1]?.boatNo;

    tickets.push(ticket(e1, t1, p1));
    tickets.push(ticket(e1, p1, t1));
    tickets.push(ticket(e2, t1, p1));
    tickets.push(ticket(t1, e1, p1));
    tickets.push(ticket(t1, p1, e1));
    tickets.push(ticket(p1, t1, e1));

    if (context.weather?.insideRisk >= 65) {
      tickets.push(ticket(e1, e2, t1));
      tickets.push(ticket(e1, p2, t1));
    }

    if (context.newEngine?.updated) {
      tickets.push(ticket(e1, t2, p1));
      tickets.push(ticket(t2, e1, p1));
    }

    return cleanTickets(tickets).slice(0, 12);
  }

  function createFormationSummary(params) {
    const parts = [];

    parts.push(`本線は${params.axis}号艇を軸に、${params.secondAxis}号艇・${params.holeAxis}号艇・${params.coverAxis}号艇を相手評価。`);

    if (params.main.length) {
      parts.push(`本線${params.main.length}点。`);
    }

    if (params.cover.length) {
      parts.push(`押さえ${params.cover.length}点。2コース差し・4コース残し・道中艇を残す。`);
    }

    if (params.nagashi.length) {
      parts.push(`流し${params.nagashi.length}点。展開が割れる場合に対応。`);
    }

    if (params.hole.length) {
      parts.push(`万舟${params.hole.length}点。期待値艇と拾い艇を絡める。`);
    }

    if (params.context.weather?.insideRisk >= 65) {
      parts.push("風波でイン過信注意のため、外・差し・拾いを厚めにする。");
    }

    if (params.context.newEngine?.updated) {
      parts.push("新型エンジン期なので、モーター数字より展示・ST・今節気配を優先。");
    }

    return parts.join("");
  }

  function ticket(a, b, c) {
    if (!a || !b || !c) return "";
    if (a === b || a === c || b === c) return "";
    return `${a}-${b}-${c}`;
  }

  function cleanTickets(list) {
    return uniqueList(
      (list || [])
        .filter(Boolean)
        .map(v => String(v).trim())
        .filter(v => v.includes("-"))
    );
  }

  function uniqueNumbers(list) {
    return uniqueList(list)
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v >= 1 && v <= 6);
  }
    /* ===============================
    最終コメント生成
  =============================== */

    function createFinalComment(race, context) {
    const safeContext = context || {};

    const mainSheet = safeContext.mainSheet || {};
    const manshuSheet = safeContext.manshuSheet || {};
    const formation = safeContext.formation || {};
    const raceFlow = safeContext.raceFlow || {};
    const venue = safeContext.venue || {};
    const weather = safeContext.weather || {};
    const newEngine = safeContext.newEngine || {};

    const honmei = mainSheet.honmei || null;
    const taikou = mainSheet.taikou || null;
    const ana = mainSheet.ana || null;
    const osae = mainSheet.osae || null;

    const lines = [];

    function getScenarioLabel(item) {
  const boatNo = toBoatNo(
    item?.boatNo
  );

  const courseCandidate = toBoatNo(
    item?.course ??
    boatNo
  );

  const course =
    courseCandidate >= 1 && courseCandidate <= 6
      ? courseCandidate
      : boatNo;

  if (course === 1) {
    return "イン逃げ・先マイ・残し";
  }

  if (course === 2) {
    return "2コース差し・残し";
  }

  if (course === 3) {
    return "3コースからの攻め";
  }

  if (course === 4) {
    return "カド攻め・展開突き";
  }

  if (course === 5) {
    return "まくり差し・展開拾い";
  }

  if (course === 6) {
    return "最内差し・道中拾い";
  }

  return "展開対応";
}

    function getIndexText(item) {
      const values = [];

      const score = Number(item?.score);
      const attack = Number(item?.attack);
      const tenkai = Number(item?.tenkai);
      const michu = Number(item?.michu);

      if (Number.isFinite(score)) {
        values.push(`AI${Math.round(score)}`);
      }

      if (Number.isFinite(attack)) {
        values.push(`攻め${Math.round(attack)}`);
      }

      if (Number.isFinite(tenkai)) {
        values.push(`展開${Math.round(tenkai)}`);
      }

      if (Number.isFinite(michu)) {
        values.push(`道中${Math.round(michu)}`);
      }

      return values.join("・");
    }

    function addBoatLine(label, item) {
      if (!item) return;

      const boatNo = Number(item.boatNo || 0);
      const scenario = getScenarioLabel(item);
      const indexes = getIndexText(item);

      if (indexes) {
        lines.push(
          `${label}は${boatNo}号艇。` +
          `${scenario}を軸に、${indexes}で評価`
        );
      } else {
        lines.push(
          `${label}は${boatNo}号艇。${scenario}で評価`
        );
      }
    }

    const attackBoat =
  raceFlow.attackBoats?.[0] || null;

const attackBoatNo = toBoatNo(
  attackBoat?.boatNo
);

const attackCourseCandidate = toBoatNo(
  attackBoat?.course ??
  attackBoatNo
);

const attackCourse =
  attackCourseCandidate >= 1 &&
  attackCourseCandidate <= 6
    ? attackCourseCandidate
    : attackBoatNo;

const honmeiBoatNo = toBoatNo(
  honmei?.boatNo
);

const honmeiCourseCandidate = toBoatNo(
  honmei?.course ??
  honmeiBoatNo
);

const honmeiCourse =
  honmeiCourseCandidate >= 1 &&
  honmeiCourseCandidate <= 6
    ? honmeiCourseCandidate
    : honmeiBoatNo;

if (attackCourse === 1) {
  if (
    honmei &&
    honmeiBoatNo !== attackBoatNo &&
    honmeiCourse >= 4
  ) {
    lines.push(
      `展開は${attackBoatNo}号艇のイン先マイを基準に、` +
      `${honmeiBoatNo}号艇の外からの展開対応を上位評価`
    );
  } else {
    lines.push(
      `展開は${attackBoatNo}号艇の` +
      `イン先マイと残しを中心に判断`
    );
  }
} else if (attackCourse === 2) {
  lines.push(
    `展開は${attackBoatNo}号艇の2コース差しと、` +
    `イン艇の残しを中心に判断`
  );
} else if (attackCourse === 3) {
  lines.push(
    `展開は${attackBoatNo}号艇の3コース攻めを基準に、` +
    `内側艇の残しと外コース艇の展開拾いを評価`
  );
} else if (attackCourse === 4) {
  lines.push(
    `展開は${attackBoatNo}号艇の4カド攻めを基準に、` +
    `外コース艇の展開拾いを評価`
  );
} else if (attackCourse === 5) {
  lines.push(
    `展開は${attackBoatNo}号艇の5コースからの` +
    `まくり差しと、内側艇の残りを中心に判断`
  );
} else if (attackCourse === 6) {
  lines.push(
    `展開は${attackBoatNo}号艇の6コースからの` +
    `最内差し・道中拾いと、内側艇の残りを中心に判断`
  );
} else if (honmei) {
  lines.push(
    `展開は${honmeiBoatNo}号艇の` +
    `${getScenarioLabel(honmei)}を中心に判断`
  );
}

    addBoatLine("本命", honmei);
    addBoatLine("対抗", taikou);
    addBoatLine("穴", ana);
    addBoatLine("押さえ", osae);

    if (newEngine?.updated && newEngine?.rule) {
      lines.push(
        String(newEngine.rule).replace(/[。]+$/, "")
      );
    }

    if (!lines.length) {
      lines.push(
        "展開・コース・ST・展示を優先して予想を組み立てる"
      );
    }

    return {
      title: createFinalTitle({
        honmei,
        taikou,
        ana,
        osae,
        weather,
        newEngine
      }),

      comment: `${lines.join("。")}。`,

      buyLevel: createBuyLevel({
        honmei,
        taikou,
        ana,
        osae,
        weather
      }),

      memo: createFinalMemo({
        venue,
        weather,
        newEngine,
        raceFlow
      }),

      formation,
      manshuSheet,
      race
    };
  }

  function createFinalTitle(params) {
    const honmei = params.honmei;
    const taikou = params.taikou;
    const ana = params.ana;

    if (!honmei) return "データ不足";

    if (params.weather?.insideRisk >= 70) {
      return `波乱含み：${honmei.boatNo}中心も外・差し注意`;
    }

    if (params.newEngine?.updated) {
      return `新型エンジン期：${honmei.boatNo}中心、展示重視`;
    }

    if (honmei.score >= 82 && taikou?.score >= 72) {
      return `本線濃いめ：${honmei.boatNo}-${taikou.boatNo}軸`;
    }

    if (ana?.score >= 68 || ana?.expected >= 72) {
      return `穴含み：${honmei.boatNo}中心＋${ana.boatNo}警戒`;
    }

    return `${honmei.boatNo}号艇中心の標準戦`;
  }

  function createBuyLevel(params) {
    const honmei = params.honmei;
    const taikou = params.taikou;
    const ana = params.ana;
    const osae = params.osae;

    if (!honmei) {
      return {
        level: "見送り",
        score: 30,
        reason: "本命評価が作れないため"
      };
    }

    let score = honmei.score;

    if (taikou?.score >= 70) score += 5;
    if (ana?.expected >= 75) score += 4;
    if (osae?.michu >= 70 || osae?.local >= 70) score += 3;

    if (params.weather?.insideRisk >= 70) score -= 8;
    if (params.weather?.roughScore >= 75) score -= 5;

    score = clampScore(score);

    if (score >= 82) {
      return {
        level: "強め",
        score,
        reason: "本命と相手の指数が揃っている"
      };
    }

    if (score >= 70) {
      return {
        level: "標準",
        score,
        reason: "中心はあるが押さえも必要"
      };
    }

    if (score >= 58) {
      return {
        level: "軽め",
        score,
        reason: "波乱・展開ズレを含む"
      };
    }

    return {
      level: "見送り寄り",
      score,
      reason: "軸信頼度が足りない"
    };
  }

  function createFinalMemo(params) {
    const memo = [];

    if (params.venue?.bias?.length) {
      memo.push(`場バイアス：${params.venue.bias.join(" / ")}`);
    }

    if (params.weather?.buffs?.length) {
      memo.push(`水面プラス：${params.weather.buffs.slice(0, 2).join(" / ")}`);
    }

    if (params.weather?.debuffs?.length) {
      memo.push(`水面注意：${params.weather.debuffs.slice(0, 2).join(" / ")}`);
    }

    if (params.newEngine?.updated) {
      memo.push(`新型エンジン：${params.newEngine.phaseLabel}`);
    }

    if (params.raceFlow?.title) {
      memo.push(`展開型：${params.raceFlow.title}`);
    }

    return memo;
  }

  /* ===============================
    共通ユーティリティ
  =============================== */

  function toBoatNo(v) {
    const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
    if (!Number.isFinite(n)) return 0;
    if (n < 1 || n > 6) return 0;
    return n;
  }

  function toNumber(v) {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function toNumberOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function toPercentNumber(v) {
    if (v === null || v === undefined || v === "") return null;
    const raw = String(v).replace("%", "");
    const n = Number(raw.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function safeString(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function normalizeST(v) {
    if (v === null || v === undefined || v === "") return "";

    let s = String(v).trim();

    if (s.startsWith(".")) {
      s = "0" + s;
    }

    const n = Number(s);

    if (!Number.isFinite(n)) return String(v).trim();

    return n.toFixed(2);
  }

  function toSTNumber(v) {
    if (v === null || v === undefined || v === "") return null;

    let s = String(v).trim();

    if (s.startsWith(".")) {
      s = "0" + s;
    }

    const n = Number(s);

    if (!Number.isFinite(n)) return null;

    return n;
  }

  function formatST(v) {
    const n = toSTNumber(v);
    if (n === null) return "-";
    return n.toFixed(2).replace(/^0/, "");
  }

  function findByBoatNo(list, boatNo) {
    if (!Array.isArray(list)) return null;
    return list.find(item => Number(item.boatNo) === Number(boatNo)) || null;
  }

  function rankSmallNumber(list, key) {
    const valid = (list || [])
      .filter(item => item[key] !== null && item[key] !== undefined)
      .sort((a, b) => Number(a[key]) - Number(b[key]));

    const result = {};

    valid.forEach((item, index) => {
      result[item.boatNo] = index + 1;
    });

    return result;
  }

  function uniqueList(list) {
    return [...new Set((list || []).filter(v => v !== null && v !== undefined && v !== ""))];
  }

　  /* ===============================
    Part8 修正版
    - 未定義対策
    - 不正舟券除外
    - 展示0をデータなし扱い
    - バフ/デバフ整理
  =============================== */

  function clampScore(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function isValidBoatNo(n) {
    const v = Number(n);
    return Number.isFinite(v) && v >= 1 && v <= 6;
  }

  function hasDuplicateBoats(nums) {
    const clean = nums.map(Number).filter(isValidBoatNo);
    return new Set(clean).size !== clean.length;
  }

  function normalizeTicket(ticketText) {
    if (!ticketText) return "";

    const text = String(ticketText).trim();

    if (!text.includes("-")) return "";

    const parts = text.split("-");

    if (parts.length !== 3) return "";

    const nums = parts.map(p => String(p).trim());

    if (nums.some(p => !p)) return "";

    return nums.join("-");
  }

  function isValidExactTicket(ticketText) {
    const t = normalizeTicket(ticketText);
    if (!t) return false;

    const parts = t.split("-");

    if (parts.some(p => p.length !== 1)) return false;

    const nums = parts.map(Number);

    if (nums.some(n => !isValidBoatNo(n))) return false;

    return !hasDuplicateBoats(nums);
  }

  function cleanExactTickets(list) {
    return uniqueList(
      (list || [])
        .map(normalizeTicket)
        .filter(isValidExactTicket)
    );
  }

  function cleanFormationTickets(list) {
    return uniqueList(
      (list || [])
        .map(v => String(v || "").trim())
        .filter(Boolean)
        .filter(v => v.includes("-"))
        .filter(v => !hasInvalidFormationDuplicate(v))
    );
  }

  function hasInvalidFormationDuplicate(text) {
    const parts = String(text).split("-");
    if (parts.length !== 3) return true;

    const first = parts[0];
    const second = parts[1];
    const third = parts[2];

    if (!/^[1-6]+$/.test(first)) return true;
    if (!/^[1-6]+$/.test(second)) return true;
    if (!/^[1-6]+$/.test(third)) return true;

    if (first.length === 1) {
      if (second.includes(first)) return true;
      if (third.includes(first)) return true;
    }

    return false;
  }

  function safeTimeValue(v) {
    const n = toNumberOrNull(v);

    if (n === null) return null;
    if (n <= 0) return null;

    return n;
  }

  function limitReasons(list, max = 2) {
    const clean = uniqueList(list || [])
      .map(v => String(v).trim())
      .filter(Boolean);

    return clean.slice(0, max);
  }

  function safeBuffs(list) {
    const result = limitReasons(list, 2);
    return result.length ? result : ["特になし"];
  }

  function safeDebuffs(list) {
    const result = limitReasons(list, 2);
    return result.length ? result : ["特になし"];
  }

  function safeDisplay(v) {
    if (v === null || v === undefined || v === "") return "-";
    if (Number(v) === 0) return "-";
    return v;
  }

  function replaceAllFormationCleaner() {
    const oldCleanTickets = cleanTickets;

    window.__CHAPPY_OLD_CLEAN_TICKETS__ = oldCleanTickets;
  }
    /* ===============================
    Part9 舟券生成 安全版
    - 重複艇番禁止
    - 流し自動整理
    - 万舟フォーメーション修正
  =============================== */

  function ticket(a, b, c) {
    const nums = [Number(a), Number(b), Number(c)];

    if (nums.some(n => !isValidBoatNo(n))) return "";
    if (hasDuplicateBoats(nums)) return "";

    return `${nums[0]}-${nums[1]}-${nums[2]}`;
  }

  function cleanTickets(list) {
    return cleanExactTickets(list);
  }

  function createSafeFormation(axis, seconds, thirds) {
    const a = Number(axis);
    if (!isValidBoatNo(a)) return "";

    const s = uniqueNumbers(seconds)
      .filter(n => n !== a);

    const t = uniqueNumbers(thirds)
      .filter(n => n !== a)
      .filter(n => !s.includes(n) || s.length >= 2);

    if (!s.length || !t.length) return "";

    const safeThirds = t.filter(n => n !== a);

    if (!safeThirds.length) return "";

    return `${a}-${s.join("")}-${safeThirds.join("")}`;
  }

  function expandFormation(text) {
    if (!text || !String(text).includes("-")) return [];

    const parts = String(text).split("-");
    if (parts.length !== 3) return [];

    const firsts = parts[0].split("").map(Number).filter(isValidBoatNo);
    const seconds = parts[1].split("").map(Number).filter(isValidBoatNo);
    const thirds = parts[2].split("").map(Number).filter(isValidBoatNo);

    const tickets = [];

    firsts.forEach(a => {
      seconds.forEach(b => {
        thirds.forEach(c => {
          const t = ticket(a, b, c);
          if (t) tickets.push(t);
        });
      });
    });

    return cleanExactTickets(tickets);
  }

  function cleanFormationTickets(list) {
    const result = [];

    (list || []).forEach(item => {
      const text = String(item || "").trim();
      if (!text) return;

      if (isValidExactTicket(text)) {
        result.push(text);
        return;
      }

      result.push(...expandFormation(text));
    });

    return cleanExactTickets(result);
  }

  function createManshuFormation(candidates, hold, pickup) {
    const c = (candidates || []).map(v => v.boatNo);
    const h = (hold || []).map(v => v.boatNo);
    const p = (pickup || []).map(v => v.boatNo);

    const tickets = [];

    tickets.push(ticket(c[0], h[0], p[0]));
    tickets.push(ticket(c[0], p[0], h[0]));
    tickets.push(ticket(h[0], c[0], p[0]));
    tickets.push(ticket(h[0], c[0], p[1]));
    tickets.push(ticket(c[1], h[0], p[0]));
    tickets.push(ticket(c[0], h[1], p[0]));
    tickets.push(ticket(p[0], h[0], c[0]));

    return cleanExactTickets(tickets).slice(0, 8);
  }

  function createMainFormationTickets(params) {
    const {
      axis,
      secondAxis,
      holeAxis,
      coverAxis,
      secondGroup,
      thirdGroup,
      context
    } = params;

    const tickets = [];

    tickets.push(ticket(axis, secondAxis, holeAxis));
    tickets.push(ticket(axis, secondAxis, coverAxis));
    tickets.push(ticket(axis, holeAxis, secondAxis));
    tickets.push(ticket(axis, coverAxis, secondAxis));

    if (axis === 1 && context.venue?.inPower >= 70) {
      tickets.push(...expandFormation(createSafeFormation(axis, secondGroup, thirdGroup)));
    }

    return cleanExactTickets(tickets).slice(0, 8);
  }

  function createCoverFormationTickets(params) {
    const {
      axis,
      secondAxis,
      holeAxis,
      coverAxis,
      totalRanking,
      pickupRanking,
      context
    } = params;

    const road = pickupRanking[0]?.boatNo;
    const third = totalRanking[2]?.boatNo;

    const tickets = [
      ticket(secondAxis, axis, holeAxis),
      ticket(secondAxis, axis, coverAxis),
      ticket(holeAxis, axis, secondAxis),
      ticket(holeAxis, secondAxis, axis),
      ticket(axis, coverAxis, holeAxis),
      ticket(coverAxis, axis, secondAxis),
      ticket(axis, secondAxis, road),
      ticket(axis, road, third)
    ];

    if (context.weather?.insideRisk >= 65 && axis === 1) {
      tickets.push(ticket(secondAxis, holeAxis, axis));
      tickets.push(ticket(holeAxis, secondAxis, axis));
    }

    return cleanExactTickets(tickets).slice(0, 10);
  }

  function createNagashiTickets(params) {
    const { axis, secondGroup, thirdGroup, raceFlow, context } = params;

    const tickets = [];

    const attackBoat = Number(raceFlow?.attackBoats?.[0]?.boatNo || 0);
    const pickupBoat = Number(raceFlow?.pickupBoats?.[0]?.boatNo || 0);

    tickets.push(...expandFormation(createSafeFormation(axis, secondGroup, thirdGroup)));

    if (attackBoat && attackBoat !== axis) {
      const seconds = uniqueNumbers([axis, ...secondGroup]).filter(n => n !== attackBoat);
      const thirds = uniqueNumbers([axis, pickupBoat, ...thirdGroup]).filter(n => n !== attackBoat);
      tickets.push(...expandFormation(createSafeFormation(attackBoat, seconds, thirds)));
    }

    if (pickupBoat && pickupBoat !== axis) {
      const seconds = uniqueNumbers([axis, attackBoat, ...secondGroup]).filter(n => n !== pickupBoat);
      const thirds = uniqueNumbers([axis, attackBoat, ...thirdGroup]).filter(n => n !== pickupBoat);
      tickets.push(...expandFormation(createSafeFormation(axis, seconds, thirds)));
    }

    if (context.weather?.outsideChance >= 65) {
      const outside = uniqueNumbers([4, 5, 6, attackBoat, pickupBoat]);
      const inside = uniqueNumbers([1, 2, 3, axis]);

      outside.forEach(a => {
        inside.forEach(b => {
          thirdGroup.forEach(c => {
            tickets.push(ticket(a, b, c));
          });
        });
      });
    }

    return cleanExactTickets(tickets).slice(0, 12);
  }

  function createHoleFormationTickets(params) {
    const {
      manshuSheet,
      expectedRanking,
      pickupRanking,
      totalRanking,
      context
    } = params;

    const e1 = expectedRanking[0]?.boatNo;
    const e2 = expectedRanking[1]?.boatNo;
    const p1 = pickupRanking[0]?.boatNo;
    const p2 = pickupRanking[1]?.boatNo;
    const t1 = totalRanking[0]?.boatNo;
    const t2 = totalRanking[1]?.boatNo;

    const tickets = [
      ...(manshuSheet.formation || []),
      ticket(e1, t1, p1),
      ticket(e1, p1, t1),
      ticket(e2, t1, p1),
      ticket(t1, e1, p1),
      ticket(t1, p1, e1),
      ticket(p1, t1, e1)
    ];

    if (context.weather?.insideRisk >= 65) {
      tickets.push(ticket(e1, e2, t1));
      tickets.push(ticket(e1, p2, t1));
    }

    if (context.newEngine?.updated) {
      tickets.push(ticket(e1, t2, p1));
      tickets.push(ticket(t2, e1, p1));
    }

    return cleanExactTickets(tickets).slice(0, 12);
  }
  function debugPrediction(data) {
    console.log("[Chappy Prediction]", data);
    return data;
  }

    /* ===============================
    Part10 最終AI評価
    - 買い目ランク
    - 信頼度
    - 万舟期待度
    - 最終判定
  =============================== */

  function createTicketRanks(prediction) {
    const formation = prediction?.formation || {};

    const main = rankTickets(formation.main || [], "本線", 85);
    const cover = rankTickets(formation.cover || [], "押さえ", 72);
    const nagashi = rankTickets(formation.nagashi || [], "流し", 65);
    const hole = rankTickets(formation.hole || [], "万舟", 58);

    const rankedTickets =
  [...main, ...cover, ...nagashi, ...hole]
    .filter(
      item =>
        isValidExactTicket(item.ticket)
    )
    .sort(
      (a, b) =>
        b.score - a.score
    );

const seenTickets = new Set();

return rankedTickets.filter(item => {
  const ticketText =
    normalizeTicket(item.ticket);

  if (
    !ticketText ||
    seenTickets.has(ticketText)
  ) {
    return false;
  }

  seenTickets.add(ticketText);
  return true;
});
  }

  function rankTickets(tickets, type, baseScore) {
    return cleanExactTickets(tickets).map((ticketText, index) => {
      const score = clampScore(baseScore - index * 3);

      return {
        ticket: ticketText,
        type,
        score,
        rank: createRankLabel(score),
        comment: createTicketComment(type, score)
      };
    });
  }

  function createRankLabel(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function createTicketComment(type, score) {
    if (type === "本線") return "中心評価の買い目";
    if (type === "押さえ") return "2着・3着ズレの保険";
    if (type === "流し") return "展開が割れた時の対応";
    if (type === "万舟") return "高配当狙い";
    return "AI候補";
  }

  function createConfidence(prediction) {
    const honmei = prediction?.mainSheet?.honmei;
    const taikou = prediction?.mainSheet?.taikou;
    const weather = prediction?.weather || {};

    if (!honmei) {
      return {
        score: 30,
        level: "低",
        reason: "本命評価が不足"
      };
    }

    let score = honmei.score || 50;

    if (taikou?.score >= 70) score += 6;
    if (weather.insideRisk >= 70) score -= 10;
    if (weather.roughScore >= 75) score -= 8;

    score = clampScore(score);

    return {
      score,
      level: score >= 80 ? "高" : score >= 65 ? "中" : "低",
      reason:
        score >= 80
          ? "軸と相手が比較的はっきりしている"
          : score >= 65
            ? "中心はあるが押さえも必要"
            : "展開ズレ・波乱を警戒"
    };
  }

  function createManshuPower(prediction) {
    const hole = prediction?.formation?.hole || [];
    const weather = prediction?.weather || {};
    const manshu = prediction?.manshuSheet?.candidates || [];

    let score = 45;

    score += Math.min(hole.length, 8) * 3;
    if (weather.outsideChance >= 65) score += 10;
    if (weather.insideRisk >= 65) score += 8;
    if (manshu[0]?.manshuScore >= 70) score += 10;

    score = clampScore(score);

    return {
      score,
      level: score >= 75 ? "高" : score >= 60 ? "中" : "低",
      reason:
        score >= 75
          ? "外枠・ズレ目・拾いの期待値が高い"
          : score >= 60
            ? "万舟は狙えるが点数管理が必要"
            : "本線寄りで万舟は軽め"
    };
  }

  function createFinalAiJudge(prediction) {
    const confidence = createConfidence(prediction);
    const manshuPower = createManshuPower(prediction);
    const ticketRanks = createTicketRanks(prediction);

    const topTickets = ticketRanks.slice(0, 5);
    const manshuTickets = ticketRanks
      .filter(t => t.type === "万舟")
      .slice(0, 5);

    return {
      confidence,
      manshuPower,
      ticketRanks,
      topTickets,
      manshuTickets,
      summary: createFinalAiSummary({
        prediction,
        confidence,
        manshuPower,
        topTickets,
        manshuTickets
      })
    };
  }

  function createFinalAiSummary(params) {
    const honmei = params.prediction?.mainSheet?.honmei;
    const taikou = params.prediction?.mainSheet?.taikou;
    const ana = params.prediction?.mainSheet?.ana;

    const parts = [];

    if (honmei) {
      parts.push(`中心は${honmei.boatNo}号艇`);
    }

    if (taikou) {
      parts.push(`相手本線は${taikou.boatNo}号艇`);
    }

    if (ana) {
      parts.push(`穴は${ana.boatNo}号艇`);
    }

    parts.push(`信頼度は${params.confidence.level}`);
    parts.push(`万舟期待度は${params.manshuPower.level}`);

    if (params.topTickets.length) {
      parts.push(`最上位買い目は${params.topTickets[0].ticket}`);
    }

    return parts.join("。") + "。";
  }

  function enhancePrediction(prediction) {
    const finalAi = createFinalAiJudge(prediction);

    return {
      ...prediction,
      finalAi,
      ticketRanks: finalAi.ticketRanks,
      confidence: finalAi.confidence,
      manshuPower: finalAi.manshuPower
    };
  }

  const __CHAPPY_BASE_CREATE_PREDICTION__ = createPrediction;

  window.createPrediction = function(data) {
  const prediction = __CHAPPY_BASE_CREATE_PREDICTION__(data);
  const enhanced = enhancePrediction(prediction);

  try {
    const aiCorePrediction = useAiCorePrediction(enhanced, data);

    if (aiCorePrediction && typeof aiCorePrediction === "object") {
      return aiCorePrediction;
    }
  } catch (error) {
  console.error("AI Core統合エラー", error);

  return {
    ...enhanced,

    finalAi: {
      ...(enhanced.finalAi || {}),

      summary:
        `AI Core統合エラー：` +
        `${error?.name || "Error"} / ` +
        `${error?.message || String(error)}`
    }
  };
}

    return enhanced;
  }

  window.debugPrediction = debugPrediction;

/* =========================================================
  prediction.js 軽量化 Phase1
  aiCore 優先データ整理
========================================================= */

function useAiCorePrediction(prediction, data) {
  if (!window.ChappyAICore) {
    return prediction;
  }

  const merged =
  window.ChappyAICore.mergeWithPrediction(prediction, data) || prediction;
  const core = merged.aiCore || {};
  const coreAi = core.ai || {};

  return {
    ...merged,

    ai: {
      ...(merged.ai || {}),
      ...coreAi
    },

    indexes: {
      ...(merged.indexes || {}),
      ...(core.indexes || {})
    },

    finalAi: {
      ...(merged.finalAi || {}),
      confidence: coreAi.trust ?? coreAi.mainTrust ?? merged.confidence,
      manshuPower: coreAi.manshu ?? coreAi.manshuPower ?? merged.manshuPower,
      ticketRanks: core.tickets || merged.ticketRanks || [],
      summary: coreAi.comment || merged.finalAi?.summary || ""
    },

    confidence: {
  score: coreAi.trust ?? coreAi.mainTrust ?? merged.confidence?.score ?? merged.confidence ?? 0,
  reason: coreAi.comment || merged.confidence?.reason || ""
},

manshuPower: {
  score: coreAi.manshu ?? coreAi.manshuPower ?? merged.manshuPower?.score ?? merged.manshuPower ?? 0,
  reason: coreAi.comment || merged.manshuPower?.reason || ""
},

    ticketRanks: core.tickets || merged.ticketRanks,
    tickets: core.tickets || merged.tickets,
    buyTickets: core.tickets || merged.buyTickets,

    mainSheet: merged.mainSheet,
    manshuSheet: merged.manshuSheet,
    
    expectedBoats: core.expectedBoats || merged.expectedBoats,
    ranking: core.ranking || merged.ranking,
    roleSummary: core.roleSummary || merged.roleSummary,
    manshuCandidates: core.manshuCandidates || merged.manshuCandidates
  };
}
})();
