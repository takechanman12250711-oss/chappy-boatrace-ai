/* =========================================================
  チャッピーボートレースAI
  ai-core.js 完全版 v4.0.0 Part 1 / 8

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

  const CORE_VERSION =
    "ai-core-v4.8.5-actual-course-identity";

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
  const isPredictionConditionSnapshot =
    Number(data?.schemaVersion || 0) === 4 &&
    entries === data?.boats;

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
    const snapshotBoatNo =
      isPredictionConditionSnapshot
        ? getItemBoatNo(
            { boatNo: entry?.boatNo },
            0
          )
        : 0;
    const boatNo =
      snapshotBoatNo ||
      getBoatNo(entry) ||
      getItemBoatNo(entry, index + 1);

    const before = Array.isArray(beforeInfo)
      ? beforeInfo.find(
          (item, itemIndex) =>
            getItemBoatNo(item, itemIndex + 1) === boatNo
        )
      : null;

    const externalStart = Array.isArray(startExhibition)
      ? startExhibition.find(
          (item, itemIndex) =>
            getItemBoatNo(item, itemIndex + 1) === boatNo
        )
      : null;
    const start =
      externalStart ||
      entry?.startExhibition ||
      null;

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

      ...(
        isPredictionConditionSnapshot
          ? { boat: boatNo }
          : {}
      ),

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

  function getOptionalWeatherNumber(data, keys) {
    const weather = getWeather(data);
    const sources = [weather, data];

    for (const source of sources) {
      for (const key of keys) {
        const value = source?.[key];
        if (isNil(value)) continue;

        const number = toNumber(value, NaN);
        if (Number.isFinite(number) && number >= 0) return number;
      }
    }

    return null;
  }

  function getWindDirection(data) {
    const weather = getWeather(data);
    return safeText(
      weather.windDirection ??
      weather.windDir ??
      weather.wind_direction ??
      data?.windDirection ??
      data?.windDir,
      ""
    ).trim();
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

  const NEW_ENVIRONMENT_UPDATE_DATA = {
    大村: {
      engine: {
        enabled: true,
        introducedAt: "20250524",
        memo: "新型エンジン導入"
      },
      fuel: {
        enabled: false,
        introducedAt: "",
        memo: ""
      }
    },
    多摩川: {
      engine: {
        enabled: true,
        introducedAt: "",
        memo: "導入日は未確認"
      },
      fuel: {
        enabled: false,
        introducedAt: "",
        memo: ""
      }
    }
  };
  const NEW_ENVIRONMENT_KEYWORDS =
    /新エンジン|新型エンジン|新モーター|新燃料/;

  function normalizeEnvironmentDate(value) {
    const digits = safeText(value, "").replace(/\D/g, "");
    return digits.length === 8 ? digits : "";
  }

  function environmentDiffDays(startValue, endValue) {
    const start = normalizeEnvironmentDate(startValue);
    const end = normalizeEnvironmentDate(endValue);

    if (!start || !end) return null;

    const toUtc = (value) => Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8))
    );
    const diff = Math.floor(
      (toUtc(end) - toUtc(start)) / 86400000
    );

    return Number.isFinite(diff) ? diff : null;
  }

  function getNewEnvironmentPeriod(data) {
    const venueName = getVenueName(data);
    const configured =
      NEW_ENVIRONMENT_UPDATE_DATA[venueName] || {};
    const rawEnvironment =
      data?.newEnvironment ??
      data?.raceInfo?.newEnvironment ??
      {};
    const raceDate = normalizeEnvironmentDate(
      data?.date ??
      data?.raceDate ??
      data?.raceInfo?.date
    );
    const sourceText = [
      data?.engineType,
      data?.motorTerm,
      data?.fuelType,
      data?.raceInfo?.engineType,
      data?.raceInfo?.motorTerm,
      data?.raceInfo?.fuelType,
      data?.raceInfo?.memo,
      data?.memo
    ].map((value) => safeText(value, "")).join(" ");
    const sourceDetected =
      NEW_ENVIRONMENT_KEYWORDS.test(sourceText);

    function buildDeployment(type, label, defaults, aliases) {
      const explicit = rawEnvironment?.[type] || {};
      const enabledFlag = aliases.flags
        .map((path) => path())
        .find((value) => value !== undefined && value !== null);
      const textDetected = aliases.pattern.test(sourceText);
      const enabled =
        explicit.enabled !== undefined
          ? explicit.enabled === true
          : enabledFlag !== undefined
            ? enabledFlag === true
            : defaults?.enabled === true || textDetected;
      const introducedAt = normalizeEnvironmentDate(
        explicit.introducedAt ??
        explicit.updateDate ??
        aliases.dates.map((path) => path()).find((value) => !isNil(value)) ??
        defaults?.introducedAt
      );
      const elapsedDays = enabled
        ? environmentDiffDays(introducedAt, raceDate)
        : null;

      let phase = "none";
      let status = "対象外";
      let isActive = false;
      let isProvisional = false;

      if (enabled && !introducedAt) {
        phase = "unknown";
        status = "導入日不明";
        isProvisional = true;
      } else if (enabled && elapsedDays !== null && elapsedDays < 0) {
        phase = "scheduled";
        status = "導入前";
      } else if (enabled && elapsedDays !== null && elapsedDays <= 45) {
        phase = "early";
        status = "初期";
        isActive = true;
      } else if (enabled && elapsedDays !== null && elapsedDays <= 120) {
        phase = "middle";
        status = "中期";
        isActive = true;
      } else if (enabled && elapsedDays !== null) {
        phase = "stable";
        status = "安定期";
      } else if (enabled) {
        phase = "unknown";
        status = "日付判定不可";
        isProvisional = true;
      }

      return {
        type,
        label,
        enabled,
        introducedAt,
        elapsedDays,
        phase,
        status,
        isActive,
        isProvisional,
        memo: safeText(explicit.memo ?? defaults?.memo, "")
      };
    }

    const deployments = [
      buildDeployment(
        "engine",
        "新型エンジン",
        configured.engine,
        {
          flags: [
            () => data?.isNewEngine,
            () => data?.newEngine,
            () => data?.raceInfo?.isNewEngine,
            () => data?.raceInfo?.newEngine
          ],
          dates: [
            () => data?.engineUpdateDate,
            () => data?.newEngineDate,
            () => data?.raceInfo?.engineUpdateDate,
            () => data?.raceInfo?.newEngineDate
          ],
          pattern: /新エンジン|新型エンジン|新モーター/
        }
      ),
      buildDeployment(
        "fuel",
        "新燃料",
        configured.fuel,
        {
          flags: [
            () => data?.isNewFuel,
            () => data?.newFuel,
            () => data?.raceInfo?.isNewFuel,
            () => data?.raceInfo?.newFuel
          ],
          dates: [
            () => data?.fuelUpdateDate,
            () => data?.newFuelDate,
            () => data?.raceInfo?.fuelUpdateDate,
            () => data?.raceInfo?.newFuelDate
          ],
          pattern: /新燃料/
        }
      )
    ];
    const active = deployments.filter((item) => item.isActive);
    const provisional = deployments.filter((item) => item.isProvisional);
    const targeted = deployments.filter((item) => item.enabled);

    return {
      venueName,
      raceDate,
      deployments,
      activeTypes: active.map((item) => item.type),
      activeLabels: active.map((item) => item.label),
      isActive: active.length > 0,
      isProvisional: provisional.length > 0,
      isTarget: targeted.length > 0,
      isStable:
        targeted.length > 0 &&
        targeted.every((item) =>
          item.phase === "stable" || item.phase === "scheduled"
        ),
      sourceDetected,
      source: "ai-core-new-environment-period-v1"
    };
  }

  function isNewEngineMode(data) {
    return getNewEnvironmentPeriod(data).isActive;
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

  function getOptionalAverageSt(boat) {
    const value =
      boat.averageSt ??
      boat.averageST ??
      boat.avgSt ??
      boat.avgST ??
      boat.st ??
      boat.startTiming ??
      boat.nationalSt;

    if (isNil(value)) return null;

    const st = toNumber(value, NaN);
    return Number.isFinite(st) && st > 0
      ? st
      : null;
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

  function getOptionalExhibitionSt(boat) {
    const value =
      boat.exhibitionSt ??
      boat.exhibitionST ??
      boat.tenjiSt ??
      boat.tenjiST ??
      boat.displaySt ??
      boat.displayST ??
      boat.startExhibition;

    if (isNil(value)) return null;

    const st = toNumber(value, NaN);
    return Number.isFinite(st) && st >= 0
      ? st
      : null;
  }

  function getCurrentSeriesSt(boat) {
    const source =
      boat.currentSeries?.st ??
      boat.currentRace?.st ??
      boat.series?.st ??
      boat.thisTermSt ??
      [];

    const values = (Array.isArray(source) ? source : [source])
      .map((value) => toNumber(value, NaN))
      .filter((value) => Number.isFinite(value) && value >= 0);

    return {
      values,
      count: values.length,
      average: values.length
        ? average(values, null)
        : null,
      spread: values.length >= 2
        ? Math.max(...values) - Math.min(...values)
        : null
    };
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

  function calcLegacyStIndex(
    boat,
    entries
  ) {
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

  function stSpeedScore(
    st,
    maximum
  ) {
    if (
      st === null ||
      st === undefined ||
      !Number.isFinite(Number(st))
    ) {
      return 0;
    }

    const value = Number(st);
    const normalized = clamp(
      (0.23 - value) / 0.12,
      0,
      1
    );

    return round(
      normalized * maximum
    );
  }

  function stStabilityScore(
    spread,
    stdDev,
    maximum
  ) {
    const value =
      Number.isFinite(Number(stdDev))
        ? Number(stdDev)
        : Number.isFinite(Number(spread))
          ? Number(spread) / 2
          : null;

    if (value === null) return 0;
    if (value <= 0.018) return maximum;
    if (value <= 0.025) {
      return round(maximum * 0.8);
    }
    if (value <= 0.035) {
      return round(maximum * 0.5);
    }
    if (value <= 0.05) {
      return round(maximum * 0.2);
    }
    return 0;
  }

  function getFCount(boat) {
    const candidates = [
      boat?.fCount,
      boat?.flyingCount,
      boat?.flying,
      boat?.f
    ];

    for (const value of candidates) {
      if (isNil(value) || value === "") {
        continue;
      }
      const parsed = toNumber(value, NaN);
      if (
        Number.isFinite(parsed) &&
        parsed >= 0
      ) {
        return parsed;
      }
    }

    const text = safeText(
      boat?.fl ??
      boat?.flyingLate,
      ""
    );
    const match = text.match(/F\s*(\d+)/i);
    return match
      ? Number(match[1])
      : null;
  }

  function buildStFoundationEvaluation(
    boat,
    entries,
    data
  ) {
    const boatNo = getBoatNo(boat);
    const course =
      hasFormalStartCourseMapping(entries)
        ? getAttackTheoryCourse(
            boat,
            boatNo
          )
        : boatNo;
    const registerNo =
      getRacerRegisterNo(boat);
    const history = (
      data?.historyContext?.racers || []
    ).find(
      racer =>
        String(racer?.registerNo || "") ===
        registerNo
    ) || null;
    const windows =
      history?.skillHistory?.windows ||
      history?.windows ||
      {};
    const allCourse =
      windows.all3Years?.byCourse?.[
        String(course)
      ] || null;
    const recentCourse =
      windows.recent1Year?.byCourse?.[
        String(course)
      ] || null;
    const previousCourse =
      windows.previous2Years?.byCourse?.[
        String(course)
      ] || null;
    const samples =
      toNumber(allCourse?.starts, 0);
    const current =
      getCurrentSeriesSt(boat);
    const officialAverage =
      getOptionalAverageSt(boat);
    const fCount =
      getFCount(boat);

    const currentSeries =
      current.count >= 2
        ? clamp(
            stSpeedScore(
              current.average,
              20
            ) +
            stStabilityScore(
              current.spread,
              null,
              5
            ),
            0,
            25
          )
        : 0;
    const recentCourseSt =
      recentCourse?.averageSt;
    const recentCourseScore =
      toNumber(
        recentCourse?.starts,
        0
      ) >= 6
        ? clamp(
            stSpeedScore(
              recentCourseSt,
              16
            ) +
            stStabilityScore(
              recentCourse?.stRange,
              recentCourse?.stStdDev,
              4
            ),
            0,
            20
          )
        : 0;
    const trend =
      (
        toNumber(
          recentCourse?.starts,
          0
        ) >= 6 &&
        toNumber(
          previousCourse?.starts,
          0
        ) >= 6 &&
        Number.isFinite(
          Number(recentCourse?.averageSt)
        ) &&
        Number.isFinite(
          Number(previousCourse?.averageSt)
        )
      )
        ? clamp(
            round(
              8 +
              (
                Number(
                  previousCourse.averageSt
                ) -
                Number(
                  recentCourse.averageSt
                )
              ) * 200
            ),
            0,
            15
          )
        : 0;
    const threeYear =
      samples >= 12
        ? clamp(
            stSpeedScore(
              allCourse?.averageSt,
              12
            ) +
            stStabilityScore(
              allCourse?.stRange,
              allCourse?.stStdDev,
              3
            ),
            0,
            15
          )
        : 0;
    const nationalAverage =
      stSpeedScore(
        officialAverage,
        10
      );
    const flyingRisk =
      fCount === null
        ? 0
        : fCount <= 0
          ? 5
          : fCount === 1
            ? 2
            : 0;
    const reliability =
      samples >= 30
        ? 10
        : samples >= 12
          ? 7
          : 0;
    const score = round(clamp(
      currentSeries +
      recentCourseScore +
      trend +
      threeYear +
      nationalAverage +
      flyingRisk +
      reliability,
      0,
      100
    ));
    const mappingFormal =
      hasFormalStartCourseMapping(entries);
    const isFormal =
      mappingFormal &&
      Boolean(history && allCourse) &&
      samples >= 12;
    const legacyIndex =
      calcLegacyStIndex(
        boat,
        entries
      );

    return {
      boatNo,
      course,
      registerNo,
      score,
      appliedIndex:
        isFormal
          ? score
          : legacyIndex,
      grade:
        courseStructureGrade(score),
      status:
        isFormal
          ? "正式反映"
          : "暫定・現行ST評価",
      isFormal,
      appliedToScore: isFormal,
      mappingFormal,
      samples,
      reliability:
        samples >= 30
          ? "high"
          : samples >= 12
            ? "medium"
            : "low",
      currentStCount:
        current.count,
      currentStAverage:
        current.average,
      currentStSpread:
        current.spread,
      fCount,
      components: {
        currentSeries,
        recentCourse:
          recentCourseScore,
        periodTrend: trend,
        threeYear,
        nationalAverage,
        flyingRisk,
        reliability
      },
      history: {
        all3Years: allCourse,
        recent1Year: recentCourse,
        previous2Years:
          previousCourse
      },
      reason: [
        `今節ST${currentSeries}/25`,
        `直近1年コース別ST${recentCourseScore}/20`,
        `期間推移${trend}/15`,
        `3年コース別ST${threeYear}/15`,
        `全国平均ST${nationalAverage}/10`,
        `Fリスク${flyingRisk}/5`,
        `取得信頼度${reliability}/10`,
        mappingFormal
          ? "公式展示進入6艇確定"
          : "実進入未確定",
        samples >= 12
          ? `実進入${course}コース${samples}走`
          : `実進入${course}コース${samples}走で判定数未達`
      ].join(" / ")
    };
  }

  function calcStIndex(
    boat,
    entries,
    data
  ) {
    return buildStFoundationEvaluation(
      boat,
      entries,
      data
    ).appliedIndex;
  }

  const EXHIBITION_TIE_TOLERANCE = 0.01;
  const EXHIBITION_TIME_RANGE = Object.freeze({
    min: 6.0,
    max: 8.0
  });
  const LAP_TIME_RANGE = Object.freeze({
    min: 30.0,
    max: 50.0
  });

  function exhibitionPerformanceGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function normalizedTimingValue(value, range) {
    if (isNil(value)) return null;

    const number = toNumber(value, NaN);

    if (
      !Number.isFinite(number) ||
      number < range.min ||
      number > range.max
    ) {
      return null;
    }

    return number;
  }

  function buildToleranceRanking(rows, key) {
    const sorted = rows
      .filter((row) => row[key] !== null)
      .sort(
        (a, b) =>
          a[key] - b[key] ||
          a.boatNo - b.boatNo
      );

    let groupRank = 0;
    let groupValue = null;

    sorted.forEach((row) => {
      if (
        groupValue === null ||
        row[key] - groupValue >
          EXHIBITION_TIE_TOLERANCE + 1e-9
      ) {
        groupRank += 1;
        groupValue = row[key];
      }

      row[`${key}Rank`] = groupRank;
    });

    return sorted;
  }

  function rankComponent(rank, maximum) {
    if (!rank) return maximum / 2;

    const ratioByRank = [
      1,
      0.82,
      0.64,
      0.46,
      0.28,
      0.10
    ];

    return round(
      maximum *
      (ratioByRank[Math.min(5, rank - 1)] ?? 0.10),
      1
    );
  }

  function averageDiffComponent(diff, maximum, fullRange) {
    return round(
      clamp(
        maximum / 2 +
        (diff / fullRange) * (maximum / 2),
        0,
        maximum
      ),
      1
    );
  }

  function nearestGapComponent(row, ranking, key, maximum) {
    const others = ranking.filter(
      (candidate) => candidate.boatNo !== row.boatNo
    );

    if (!others.length || row[key] === null) {
      return maximum / 2;
    }

    const nearest = [...others].sort(
      (a, b) =>
        Math.abs(a[key] - row[key]) -
        Math.abs(b[key] - row[key])
    )[0];
    const signedGap = nearest[key] - row[key];

    return round(
      clamp(
        maximum / 2 +
        signedGap * (maximum / 0.20),
        0,
        maximum
      ),
      1
    );
  }

  function resolveExhibitionSource(entries, data, fullMode) {
    const explicitExhibitionSource = entries
      .map(
        (boat) =>
          boat?.exhibitionSource ??
          boat?.beforeInfo?.exhibitionSource ??
          boat?.beforeInfo?.source
      )
      .find((value) => !isNil(value));
    const explicitLapSource = entries
      .map(
        (boat) =>
          boat?.lapTimeSource ??
          boat?.beforeInfo?.lapTimeSource
      )
      .find((value) => !isNil(value));
    const rootSource =
      data?.beforeInfoSource ??
      data?.exhibitionSource ??
      data?.source?.exhibition;

    return {
      exhibition:
        safeText(
          explicitExhibitionSource ?? rootSource,
          "BOAT RACE公式"
        ),
      lap:
        fullMode
          ? safeText(explicitLapSource, "外部取得")
          : "",
      label:
        fullMode
          ? `${safeText(
              explicitExhibitionSource ?? rootSource,
              "BOAT RACE公式"
            )}＋${safeText(explicitLapSource, "外部取得")}`
          : safeText(
              explicitExhibitionSource ?? rootSource,
              "BOAT RACE公式"
            )
    };
  }

  function buildExhibitionPerformanceEvaluation(
    entries,
    data = {}
  ) {
    const sourceEntries = Array.isArray(entries)
      ? entries
      : [];
    const rows = sourceEntries.map((boat, index) => ({
      boatNo: getBoatNo(boat) || index + 1,
      name: getPlayerName(boat),
      exhibitionTime: normalizedTimingValue(
        getExhibitionTime(boat),
        EXHIBITION_TIME_RANGE
      ),
      lapTime: normalizedTimingValue(
        getLapTime(boat),
        LAP_TIME_RANGE
      )
    }));
    const validBoatNos = rows
      .map((row) => row.boatNo)
      .filter((boatNo) => boatNo >= 1 && boatNo <= 6);
    const uniqueBoatNos = new Set(validBoatNos);
    const boatMappingFormal =
      rows.length === 6 &&
      uniqueBoatNos.size === 6 &&
      [1, 2, 3, 4, 5, 6].every(
        (boatNo) => uniqueBoatNos.has(boatNo)
      );
    const exhibitionCount = rows.filter(
      (row) => row.exhibitionTime !== null
    ).length;
    const lapCount = rows.filter(
      (row) => row.lapTime !== null
    ).length;
    const officialMode =
      boatMappingFormal &&
      exhibitionCount === 6;
    const fullMode =
      officialMode &&
      lapCount === 6;
    const mode = fullMode
      ? "full"
      : officialMode
        ? "official"
        : "provisional";
    const modeLabel = fullMode
      ? "展示・一周フルモード"
      : officialMode
        ? "公式展示モード"
        : "暫定・中立評価";
    const source = resolveExhibitionSource(
      sourceEntries,
      data,
      fullMode
    );
    const exhibitionRanking = buildToleranceRanking(
      rows,
      "exhibitionTime"
    );
    const lapRanking = buildToleranceRanking(
      rows,
      "lapTime"
    );
    const exhibitionAverage = officialMode
      ? average(
          rows.map((row) => row.exhibitionTime),
          0
        )
      : 0;
    const lapAverage = fullMode
      ? average(
          rows.map((row) => row.lapTime),
          0
        )
      : 0;
    const sumAverage = fullMode
      ? average(
          rows.map(
            (row) =>
              row.exhibitionTime + row.lapTime
          ),
          0
        )
      : 0;
    const exhibitionTop =
      exhibitionRanking[0] || null;
    const lapTop = lapRanking[0] || null;
    const doubleTimeBoatNo =
      fullMode &&
      exhibitionTop &&
      lapTop &&
      exhibitionTop.boatNo === lapTop.boatNo
        ? exhibitionTop.boatNo
        : null;

    const roles = rows.map((row) => {
      let score = 50;
      let components = {
        neutral: 50
      };

      if (officialMode && !fullMode) {
        const rank = rankComponent(
          row.exhibitionTimeRank,
          35
        );
        const averageDiff = averageDiffComponent(
          exhibitionAverage - row.exhibitionTime,
          35,
          0.20
        );
        const neighborGap = nearestGapComponent(
          row,
          exhibitionRanking,
          "exhibitionTime",
          20
        );
        const reliability = 10;

        components = {
          exhibitionRank: rank,
          exhibitionAverageDiff: averageDiff,
          exhibitionNeighborGap: neighborGap,
          reliability
        };
        score =
          rank +
          averageDiff +
          neighborGap +
          reliability;
      }

      if (fullMode) {
        const exhibitionRank = rankComponent(
          row.exhibitionTimeRank,
          18
        );
        const exhibitionDiff = averageDiffComponent(
          exhibitionAverage - row.exhibitionTime,
          12,
          0.20
        );
        const lapRank = rankComponent(
          row.lapTimeRank,
          21
        );
        const lapDiff = averageDiffComponent(
          lapAverage - row.lapTime,
          14,
          0.40
        );
        const newSam = averageDiffComponent(
          sumAverage -
            (row.exhibitionTime + row.lapTime),
          20,
          0.40
        );
        const doubleTime =
          row.boatNo === doubleTimeBoatNo
            ? 5
            : 0;
        const reliability = 10;

        components = {
          exhibitionRank,
          exhibitionAverageDiff: exhibitionDiff,
          lapRank,
          lapAverageDiff: lapDiff,
          newSam,
          doubleTime,
          reliability
        };
        score =
          exhibitionRank +
          exhibitionDiff +
          lapRank +
          lapDiff +
          newSam +
          doubleTime +
          reliability;
      }

      score = clamp(round(score), 1, 100);

      return {
        ...row,
        exhibitionRank:
          row.exhibitionTimeRank || null,
        lapRank: row.lapTimeRank || null,
        sumTime:
          fullMode
            ? round(
                row.exhibitionTime + row.lapTime,
                3
              )
            : null,
        sumDiff:
          fullMode
            ? round(
                sumAverage -
                  (row.exhibitionTime + row.lapTime),
                3
              )
            : null,
        isDoubleTime:
          row.boatNo === doubleTimeBoatNo,
        score,
        appliedIndex:
          officialMode
            ? score
            : 50,
        grade:
          exhibitionPerformanceGrade(score),
        mode,
        modeLabel,
        status:
          officialMode
            ? "正式反映"
            : "暫定・中立50点",
        isFormal: officialMode,
        appliedToScore: officialMode,
        source: source.label,
        components,
        reason:
          mode === "official"
            ? [
                `展示順位${components.exhibitionRank}/35`,
                `6艇平均との差${components.exhibitionAverageDiff}/35`,
                `1位・隣接差${components.exhibitionNeighborGap}/20`,
                `取得信頼度${components.reliability}/10`
              ].join(" / ")
            : mode === "full"
              ? [
                  `展示順位・差${
                    components.exhibitionRank +
                    components.exhibitionAverageDiff
                  }/30`,
                  `一周順位・差${
                    components.lapRank +
                    components.lapAverageDiff
                  }/35`,
                  `新サム${components.newSam}/20`,
                  `ダブルタイム${components.doubleTime}/5`,
                  `取得信頼度${components.reliability}/10`
                ].join(" / ")
              : `展示${exhibitionCount}/6艇・一周${lapCount}/6艇のため中立50点`
      };
    });

    return {
      version: "exhibition-performance-v2",
      mode,
      modeLabel,
      status:
        officialMode
          ? "正式反映"
          : "暫定・中立50点",
      isFormal: officialMode,
      isFullMode: fullMode,
      appliedToScore: officialMode,
      exhibitionCount,
      lapCount,
      tieTolerance: EXHIBITION_TIE_TOLERANCE,
      exhibitionAverage: round(
        exhibitionAverage,
        3
      ),
      lapAverage: round(lapAverage, 3),
      sumAverage: round(sumAverage, 3),
      doubleTimeBoat: doubleTimeBoatNo,
      source,
      missingBoatNos: [1, 2, 3, 4, 5, 6]
        .filter((boatNo) => {
          const row = roles.find(
            (item) => item.boatNo === boatNo
          );

          return (
            !row ||
            row.exhibitionTime === null ||
            (fullMode && row.lapTime === null)
          );
        }),
      roles
    };
  }

  function calcExhibitionIndex(
    boat,
    entries,
    data = {}
  ) {
    const boatNo = getBoatNo(boat);
    const theory =
      buildExhibitionPerformanceEvaluation(
        entries,
        data
      );
    const role = theory.roles.find(
      (item) => item.boatNo === boatNo
    );

    return role?.appliedIndex ?? 50;
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
    const cls = hasClassPower(boat);

    let score = 50 + cls * 15;

    if (results.length) {
      const avgRank = average(results, 3.5);
      score += (3.5 - avgRank) * 8;

      const top3 = results.filter((r) => r <= 3).length / results.length;
      score += top3 * 12;
    }

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
  }

  function calcAttackIndex(
    boat,
    entries,
    venueFeature,
    data
  ) {
    const boatNo = getBoatNo(boat);
    const courseMapping = buildOfficialCourseMapping(entries);
    const scoringCourse = courseMapping.courseOfBoat(boatNo);
    const stIndex = calcStIndex(
      boat,
      entries,
      data
    );
    const clsPower = hasClassPower(boat);

    let score = 42;

    score += stIndex * 0.30;
    /*
      展示・足は最終総合の9％枠だけで反映する。
      攻め指数では従来の中立値相当を固定し、
      展示データによる二重加点を行わない。
    */
    score += 10;
    score += clsPower * 10;

    if (scoringCourse === 1) score += venueFeature.inPower * 0.12;
    if (scoringCourse === 2) score += venueFeature.sashi * 0.12;
    if (scoringCourse === 3) score += venueFeature.makuri * 0.13;
    if (scoringCourse === 4) score += venueFeature.kado * 0.15;
    if (scoringCourse === 5) score += venueFeature.makuriSashi * 0.12;
    if (scoringCourse === 6) score += venueFeature.outside * 0.12;

    if (scoringCourse >= 4 && stIndex >= 70) score += 7;

    return clamp(round(score), INDEX_LIMIT.min, INDEX_LIMIT.max);
  }

  function getAttackTheoryCourse(boat, fallback) {
    const officialStart = boat?.startExhibition || {};
    const officialCourse = toNumber(officialStart.course, 0);
    if (
      officialCourse >= 1 &&
      officialCourse <= 6 &&
      (
        officialStart.isOfficialCourse === true ||
        officialStart.mappingSource === "official-start-image"
      )
    ) {
      return officialCourse;
    }

    // 公式6艇写像が成立しない進入値は予想へ部分適用しない。
    return toNumber(fallback, 0);
  }

  const COURSE_STRUCTURE_BASE = Object.freeze({
    1: 35,
    2: 27,
    3: 22,
    4: 18,
    5: 12,
    6: 8
  });

  const LEGACY_COURSE_INDEX = Object.freeze({
    1: 92,
    2: 77,
    3: 70,
    4: 64,
    5: 50,
    6: 43
  });

  function hasFormalStartCourseMapping(
    entries
  ) {
    const rows = (entries || [])
      .map((entry, index) => {
        const start =
          entry?.startExhibition || {};
        return {
          boatNo:
            getBoatNo(entry) || index + 1,
          course:
            toNumber(start.course, 0),
          isOfficial:
            start.isOfficialCourse === true ||
            start.mappingSource ===
              "official-start-image"
        };
      });
    const boats = new Set(
      rows.map(item => item.boatNo)
    );
    const courses = new Set(
      rows.map(item => item.course)
    );

    return (
      rows.length === 6 &&
      rows.every(
        item =>
          item.isOfficial &&
          item.boatNo >= 1 &&
          item.boatNo <= 6 &&
          item.course >= 1 &&
          item.course <= 6
      ) &&
      boats.size === 6 &&
      courses.size === 6
    );
  }

  /*
    公式展示進入が6艇分そろい、艇番・コースがともに一意な時だけ
    コースと物理艇を対応付ける。不完全・非公式・重複データでは
    部分変換せず、レース全体を従来どおりの枠なりへ戻す。

    正式性を検証した startExhibition.course を正本にすることで、
    古い exhibitionCourse 等と食い違っても別の写像を使わない。
  */
  function buildOfficialCourseMapping(entries) {
    const source = Array.isArray(entries) ? entries : [];
    const formal = hasFormalStartCourseMapping(source);
    const rows = source
      .map((entry, index) => {
        const boatNo = getBoatNo(entry) || index + 1;
        const course = formal
          ? toNumber(entry?.startExhibition?.course, 0)
          : boatNo;

        return { entry, boatNo, course };
      })
      .filter(
        (row) =>
          row.boatNo >= 1 &&
          row.boatNo <= 6 &&
          row.course >= 1 &&
          row.course <= 6
      );
    const byCourse = new Map(
      rows.map((row) => [row.course, row])
    );
    const byBoat = new Map(
      rows.map((row) => [row.boatNo, row])
    );

    return {
      formal,
      boatAtCourse(course) {
        const value = Number(course);
        return Number(byCourse.get(value)?.boatNo || value) || null;
      },
      courseOfBoat(boatNo) {
        const value = Number(boatNo);
        return Number(byBoat.get(value)?.course || value) || null;
      },
      entryAtCourse(course) {
        return byCourse.get(Number(course))?.entry || null;
      }
    };
  }

  function courseStructureGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function buildCourseStructureEvaluation(
    boat,
    entries,
    data,
    options = {}
  ) {
    const boatNo = getBoatNo(boat);
    const formalMapping =
      hasFormalStartCourseMapping(entries);
    const actualCourse =
      formalMapping
        ? getAttackTheoryCourse(
            boat,
            boatNo
          )
        : boatNo;
    const context =
      data?.historyContext
        ?.courseStructure || {};
    const venueWindows =
      context.venue || {};
    const overallWindows =
      context.overall || {};
    const venueAll =
      venueWindows.all3Years
        ?.byCourse?.[
          String(actualCourse)
        ] || null;
    const overallAll =
      overallWindows.all3Years
        ?.byCourse?.[
          String(actualCourse)
        ] || null;
    const recent =
      venueWindows.recent1Year
        ?.byCourse?.[
          String(actualCourse)
        ] || null;
    const previous =
      venueWindows.previous2Years
        ?.byCourse?.[
          String(actualCourse)
        ] || null;
    const minimumSamples = toNumber(
      context.thresholds
        ?.formalVenueCourseSamples,
      100
    );
    const trendSamples = toNumber(
      context.thresholds
        ?.recentTrendSamples,
      30
    );
    const venueSamples =
      toNumber(venueAll?.starts, 0);
    const hasFormalStats =
      Boolean(venueAll && overallAll) &&
      venueSamples >= minimumSamples;
    const isFormal =
      formalMapping &&
      hasFormalStats;
    const basicStructure =
      COURSE_STRUCTURE_BASE[
        actualCourse
      ] || 0;
    const venueWin =
      hasFormalStats
        ? clamp(
            round(
              10 +
              (
                toNumber(
                  venueAll.winRate,
                  0
                ) -
                toNumber(
                  overallAll.winRate,
                  0
                )
              ) * 0.8
            ),
            0,
            20
          )
        : 0;
    const venueTop3 =
      hasFormalStats
        ? clamp(
            round(
              7.5 +
              (
                toNumber(
                  venueAll.top3Rate,
                  0
                ) -
                toNumber(
                  overallAll.top3Rate,
                  0
                )
              ) * 0.3
            ),
            0,
            15
          )
        : 0;
    const hasTrend =
      toNumber(recent?.starts, 0) >=
        trendSamples &&
      toNumber(previous?.starts, 0) > 0;
    const periodTrend =
      hasTrend
        ? clamp(
            round(
              5 +
              (
                toNumber(
                  recent.winRate,
                  0
                ) -
                toNumber(
                  previous.winRate,
                  0
                )
              ) * 0.35 +
              (
                toNumber(
                  recent.top3Rate,
                  0
                ) -
                toNumber(
                  previous.top3Rate,
                  0
                )
              ) * 0.10
            ),
            0,
            10
          )
        : 0;
    const courseChange =
      !formalMapping
        ? 0
        : actualCourse === boatNo
          ? 10
          : actualCourse < boatNo
            ? 6
            : Math.max(
                2,
                6 -
                (
                  actualCourse -
                  boatNo
                ) * 2
              );
    const mappingReliability =
      formalMapping ? 10 : 0;
    const score = round(clamp(
      basicStructure +
      venueWin +
      venueTop3 +
      periodTrend +
      courseChange +
      mappingReliability,
      0,
      100
    ));
    const legacyAdjustment =
      toNumber(
        options.legacyAdjustment,
        0
      );
    const legacyEffectiveIndex =
      (
        LEGACY_COURSE_INDEX[
          actualCourse
        ] || 50
      ) +
      legacyAdjustment / 0.24;
    const neutralScore =
      (
        COURSE_STRUCTURE_BASE[
          actualCourse
        ] || 0
      ) + 42.5;
    const statsDelta =
      isFormal
        ? clamp(
            (score - neutralScore) *
              0.25,
            -4,
            4
          )
        : 0;

    return {
      boatNo,
      course: actualCourse,
      frame: boatNo,
      score,
      grade:
        courseStructureGrade(score),
      status:
        isFormal
          ? "正式反映"
          : "暫定・現行枠番評価",
      isFormal,
      mappingFormal:
        formalMapping,
      statsFormal:
        hasFormalStats,
      venueSamples,
      minimumSamples,
      appliedIndex:
        legacyEffectiveIndex +
        statsDelta,
      appliedToScore: isFormal,
      components: {
        basicStructure,
        venueWin,
        venueTop3,
        periodTrend,
        courseChange,
        mappingReliability
      },
      reason: [
        `展示進入${actualCourse}コース`,
        `基本構造${basicStructure}/35`,
        `場別1着率${venueWin}/20`,
        `場別3連率${venueTop3}/15`,
        `期間推移${periodTrend}/10`,
        `進入変動${courseChange}/10`,
        `取得信頼度${mappingReliability}/10`,
        formalMapping
          ? "公式艇番画像で6艇進入確定"
          : "進入未確定のため枠番評価を維持",
        hasFormalStats
          ? `場×コース${venueSamples}走`
          : `場×コース${venueSamples}走で正式数未達`
      ].join(" / ")
    };
  }

  function attackTheoryRole(course) {
    if (course === 1) return "逃げ";
    if (course === 2) return "差し";
    if (course === 3 || course === 4) return "攻め";
    return "拾い";
  }

  function attackTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function buildAttackTheory(entries, analyses, data) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const venueFeature = getVenueFeature(data);
    const slit = buildSlitAnalysis(
      sourceEntries,
      venueFeature,
      data
    );
    const slitByBoat = new Map(
      (slit.ranking || []).map((boat) => [Number(boat.boatNo), boat])
    );
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [getBoatNo(boat), boat])
    );
    const exhibitionTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        time: getExhibitionTime(boat)
      }))
      .filter((item) => item.time > 0)
      .sort((a, b) => a.time - b.time);
    const lapTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        time: getLapTime(boat)
      }))
      .filter((item) => item.time > 0)
      .sort((a, b) => a.time - b.time);
    const exhibitionReady =
      sourceEntries.length === 6 &&
      sourceEntries.every((boat) => getExhibitionTime(boat) > 0);

    function rankScore(list, boatNo) {
      const rank = list.findIndex((item) => item.boatNo === boatNo);
      if (rank < 0) return null;
      return [10, 8, 6, 4, 2, 0][rank] ?? 0;
    }

    const roles = sourceAnalyses.map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const entry = entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const role = attackTheoryRole(course);
      const isAttackCourse = course === 3 || course === 4;
      const slitBoat = slitByBoat.get(boatNo) || {};
      const currentSt = getCurrentSeriesSt(entry);
      const avgSt = getOptionalAverageSt(entry);
      const supportSt =
        currentSt.count >= 2 ? currentSt.average : avgSt;
      const hasAverageOrCurrentSupport =
        supportSt !== null &&
        supportSt <= 0.16 &&
        (
          currentSt.count < 2 ||
          currentSt.spread === null ||
          currentSt.spread <= 0.05
        );
      const hasSlitAdvantage =
        slitBoat.slitAlert === true ||
        Number(slitBoat.slitDiff || 0) > 0;
      const hasStartEvidence =
        hasSlitAdvantage || hasAverageOrCurrentSupport;

      const development = clamp(
        round(toNumber(analysis?.indexes?.raceFlow, 0) * 0.40),
        0,
        40
      );
      const courseAptitude = isAttackCourse
        ? (course === 4 ? 18 : 17)
        : 0;

      let startSupport = 0;
      if (supportSt !== null) {
        if (supportSt <= 0.12) startSupport = 12;
        else if (supportSt <= 0.14) startSupport = 10;
        else if (supportSt <= 0.16) startSupport = 8;
        else if (supportSt <= 0.18) startSupport = 6;
        else if (supportSt <= 0.20) startSupport = 4;
        else startSupport = 2;
      }

      const slitDiff = Number(slitBoat.slitDiff || 0);
      let slitSupport = 0;
      if (slitDiff >= 0.10) slitSupport = 8;
      else if (slitDiff >= 0.05) slitSupport = 6;
      else if (slitDiff > 0) slitSupport = 4;
      else if (slitBoat.slitRisk) slitSupport = 0;
      else if (slitBoat.exSt !== null && slitBoat.exSt !== undefined) {
        slitSupport = 2;
      }

      const startAndSlit = clamp(startSupport + slitSupport, 0, 20);
      const exhibitionFoot = 5;
      const venueCourseScore =
        course === 3
          ? venueFeature.makuri
          : course === 4
            ? Math.max(venueFeature.kado, venueFeature.makuriSashi)
            : 0;
      const venueCourse = clamp(round(venueCourseScore * 0.10), 0, 10);
      const score = isAttackCourse
        ? round(
            clamp(
              development +
                courseAptitude +
                startAndSlit +
                exhibitionFoot +
                venueCourse,
              0,
              100
            )
          )
        : 0;
      const grade = isAttackCourse ? attackTheoryGrade(score) : "-";
      const isAdopted =
        isAttackCourse &&
        exhibitionReady &&
        score >= 65 &&
        hasStartEvidence;

      let status = "役割分離";
      if (isAttackCourse && !exhibitionReady) status = "暫定";
      else if (isAdopted) status = "正式採用";
      else if (isAttackCourse && score >= 55) status = "参考";
      else if (isAttackCourse) status = "不成立";

      const reasons = [];
      if (isAttackCourse) {
        reasons.push(`展開${development}/40`);
        reasons.push(`コース${courseAptitude}/20`);
        reasons.push(`ST・スリット${startAndSlit}/20`);
        reasons.push(`展示・足は9％枠へ分離`);
        reasons.push(`場傾向${venueCourse}/10`);
        if (!exhibitionReady) {
          reasons.push("展示6艇未取得のため役割判定は暫定");
        }
        if (!hasStartEvidence) reasons.push("ST・隣艇比較の裏付け不足");
      } else {
        reasons.push(`${course}コースは${role}として評価`);
      }

      return {
        boatNo,
        playerName: analysis?.playerName || getPlayerName(entry),
        course,
        role,
        score,
        grade,
        status,
        isFormal:
          exhibitionReady &&
          hasStartEvidence,
        isAttackCourse,
        isAdopted,
        hasStartEvidence,
        hasAverageOrCurrentSupport,
        hasSlitAdvantage,
        comparedBoatNo: slitBoat.comparedBoatNo || null,
        slitDiff: round(slitDiff, 3),
        components: {
          development,
          course: courseAptitude,
          startAndSlit,
          exhibitionFoot,
          venueCourse
        },
        reason: reasons.join(" / ")
      };
    });

    const ranking = roles
      .filter((boat) => boat.isAttackCourse)
      .sort((a, b) => b.score - a.score || a.course - b.course);

    return {
      ranking,
      roles,
      isFormal: exhibitionReady,
      adoptedBoats: ranking
        .filter((boat) => boat.isAdopted)
        .map((boat) => boat.boatNo),
      source: "ai-core-attack-theory-v1"
    };
  }

  function flowTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function buildFlowTheory(
    entries,
    analyses,
    data,
    raceScenarios,
    attackTheory
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const mainScenario = raceScenarios?.mainScenario || null;
    const venueFeature = getVenueFeature(data);
    const slit = buildSlitAnalysis(
      sourceEntries,
      venueFeature,
      data
    );
    const slitByBoat = new Map(
      (slit.ranking || []).map((boat) => [Number(boat.boatNo), boat])
    );
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [getBoatNo(boat), boat])
    );
    const secondCandidates = new Set(
      (mainScenario?.outcome?.secondCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const thirdCandidates = new Set(
      (mainScenario?.outcome?.thirdCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const blockedBoats = new Set(
      (mainScenario?.blockedBoats || [])
        .map((boatNo) => Number(boatNo))
        .filter(Boolean)
    );
    const exhibitionTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        time: getExhibitionTime(boat)
      }))
      .filter((item) => item.time > 0)
      .sort((a, b) => a.time - b.time);
    const lapTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        time: getLapTime(boat)
      }))
      .filter((item) => item.time > 0)
      .sort((a, b) => a.time - b.time);
    const exhibitionReady =
      sourceEntries.length === 6 &&
      sourceEntries.every((boat) => getExhibitionTime(boat) > 0);

    function rankScore(list, boatNo) {
      const rank = list.findIndex((item) => item.boatNo === boatNo);
      if (rank < 0) return null;
      return [10, 8, 6, 4, 2, 0][rank] ?? 0;
    }

    const scenarioAttackerCourse =
      Number(
        mainScenario?.attackerCourse ??
        mainScenario?.attacker ??
        0
      ) || null;
    const scenarioAttackerBoatNo =
      Number(
        mainScenario?.attackerBoatNo ??
        mainScenario?.headBoatNo ??
        mainScenario?.attackTheory?.boatNo ??
        0
      ) ||
      (attackTheory?.roles || []).find(
        (boat) => Number(boat.course) === scenarioAttackerCourse
      )?.boatNo ||
      scenarioAttackerCourse;

    const rows = sourceAnalyses.map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const entry = entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const isAttackSource =
        boatNo === Number(scenarioAttackerBoatNo || 0);
      const isSecondCandidate = secondCandidates.has(boatNo);
      const isThirdCandidate = thirdCandidates.has(boatNo);
      const isScenarioCandidate =
        isSecondCandidate || isThirdCandidate;
      const isBlocked = blockedBoats.has(boatNo);
      const role = isSecondCandidate
        ? "残し"
        : isThirdCandidate
          ? "拾い"
          : "展開外";

      const scenarioMatch = isSecondCandidate
        ? 40
        : isThirdCandidate
          ? 34
          : 0;

      const courseDistance =
        scenarioAttackerCourse === null
          ? 6
          : Math.abs(course - scenarioAttackerCourse);
      let positionRelation = 0;
      if (isScenarioCandidate && !isAttackSource) {
        positionRelation = course < scenarioAttackerCourse
          ? Math.max(12, 20 - Math.max(0, courseDistance - 1) * 2)
          : Math.max(11, 20 - Math.max(0, courseDistance - 1) * 3);
      }

      const holdScore = toNumber(analysis?.roleScores?.hold, 0);
      const pickupScore = toNumber(analysis?.roleScores?.pickup, 0);
      const roleAptitudeBase =
        role === "残し"
          ? holdScore
          : role === "拾い"
            ? pickupScore
            : Math.max(holdScore, pickupScore);
      const holdPickup = clamp(
        round(roleAptitudeBase * 0.15),
        0,
        15
      );

      const slitBoat = slitByBoat.get(boatNo) || {};
      const currentSt = getCurrentSeriesSt(entry);
      const avgSt = getOptionalAverageSt(entry);
      const supportSt =
        currentSt.count >= 2 ? currentSt.average : avgSt;
      let startAndSlit = 0;
      if (supportSt !== null) {
        if (supportSt <= 0.12) startAndSlit = 8;
        else if (supportSt <= 0.14) startAndSlit = 7;
        else if (supportSt <= 0.16) startAndSlit = 6;
        else if (supportSt <= 0.18) startAndSlit = 5;
        else if (supportSt <= 0.20) startAndSlit = 3;
        else startAndSlit = 1;
      }
      if (slitBoat.slitAlert) startAndSlit += 2;
      else if (slitBoat.slitRisk) startAndSlit -= 2;
      startAndSlit = clamp(startAndSlit, 0, 10);

      const exhibitionFoot = 5;

      const venueCourseScore =
        course === 1
          ? venueFeature.inPower
          : course === 2
            ? venueFeature.sashi
            : course === 3
              ? venueFeature.makuri
              : course === 4
                ? Math.max(venueFeature.kado, venueFeature.makuriSashi)
                : course === 5
                  ? venueFeature.makuriSashi
                  : venueFeature.outside;
      const isRoughCondition =
        getWindSpeed(data) >= 4 ||
        getWaveHeight(data) >= 4;
      const venueWaterBase = isRoughCondition
        ? venueCourseScore * 0.7 + venueFeature.roughWater * 0.3
        : venueCourseScore;
      const venueWater = clamp(round(venueWaterBase * 0.05), 0, 5);

      const score = round(
        clamp(
          scenarioMatch +
            positionRelation +
            holdPickup +
            startAndSlit +
            exhibitionFoot +
            venueWater,
          0,
          100
        )
      );
      const grade = flowTheoryGrade(score);
      const isFormal =
        Boolean(mainScenario) &&
        exhibitionReady;
      const isAdopted =
        isFormal &&
        isScenarioCandidate &&
        !isAttackSource &&
        !isBlocked &&
        score >= 65;

      let status = "不成立";
      if (!isFormal && isScenarioCandidate && !isAttackSource) {
        status = "暫定";
      } else if (isAttackSource) {
        status = "攻め起点";
      } else if (isBlocked) {
        status = "展開除外";
      } else if (isAdopted) {
        status = "正式採用";
      } else if (score >= 55) {
        status = "参考";
      }

      const reasons = [
        `展開一致${scenarioMatch}/40`,
        `位置・コース${positionRelation}/20`,
        `残し・拾い${holdPickup}/15`,
        `ST・スリット${startAndSlit}/10`,
        `展示・足は9％枠へ分離`,
        `場・水面${venueWater}/5`
      ];
      if (!exhibitionReady) {
        reasons.push("展示6艇未取得のため役割判定は暫定");
      }
      if (isAttackSource) reasons.push("攻め艇自身は展開艇から分離");
      if (isBlocked) reasons.push("最有力展開で飛び候補");
      if (!isScenarioCandidate) {
        reasons.push("最有力展開の2・3着候補と不一致");
      }

      return {
        boatNo,
        playerName: analysis?.playerName || getPlayerName(entry),
        course,
        role,
        score,
        grade,
        status,
        isFormal,
        isAdopted,
        isAttackSource,
        isBlocked,
        isSecondCandidate,
        isThirdCandidate,
        scenarioType: mainScenario?.type || "",
        scenarioLabel: mainScenario?.label || "",
        attackerBoatNo: Number(scenarioAttackerBoatNo || 0) || null,
        attackerCourse: scenarioAttackerCourse,
        components: {
          scenarioMatch,
          positionRelation,
          holdPickup,
          startAndSlit,
          exhibitionFoot,
          venueWater
        },
        reason: reasons.join(" / ")
      };
    });

    const ranking = rows
      .filter((boat) => !boat.isAttackSource)
      .sort((a, b) => b.score - a.score || a.course - b.course);

    return {
      ranking,
      roles: rows,
      isFormal: Boolean(mainScenario) && exhibitionReady,
      adoptedBoats: ranking
        .filter((boat) => boat.isAdopted)
        .map((boat) => boat.boatNo),
      scenarioType: mainScenario?.type || "",
      scenarioLabel: mainScenario?.label || "",
      attackerBoatNo: Number(scenarioAttackerBoatNo || 0) || null,
      source: "ai-core-flow-theory-v1"
    };
  }

  function roadTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function buildRoadTheory(
    entries,
    analyses,
    data,
    raceScenarios
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const mainScenario = raceScenarios?.mainScenario || null;
    const venueFeature = getVenueFeature(data);
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [getBoatNo(boat), boat])
    );
    const firstCandidates = new Set(
      (mainScenario?.outcome?.firstCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const secondCandidates = new Set(
      (mainScenario?.outcome?.secondCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const thirdCandidates = new Set(
      (mainScenario?.outcome?.thirdCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const blockedBoats = new Set(
      (mainScenario?.blockedBoats || raceScenarios?.blockedBoats || [])
        .map((boatNo) => Number(boatNo))
        .filter(Boolean)
    );
    const lapTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        time: getLapTime(boat)
      }))
      .filter((item) => item.time > 0)
      .sort((a, b) => a.time - b.time);
    const exhibitionTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        time: getExhibitionTime(boat)
      }))
      .filter((item) => item.time > 0)
      .sort((a, b) => a.time - b.time);
    const scenarioAttackerCourse =
      Number(
        mainScenario?.attackerCourse ??
        mainScenario?.attacker ??
        0
      ) || null;

    function rankScore(list, boatNo, points) {
      const rank = list.findIndex((item) => item.boatNo === boatNo);
      if (rank < 0) return 0;
      return points[rank] ?? 0;
    }

    const rows = sourceAnalyses.map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const entry = entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const results = getThisTermResults(entry)
        .map((value) => toNumber(value, NaN))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6);
      const lapTime = getLapTime(entry);
      const hasRoadEvidence = results.length > 0;
      const isFirstCandidate = firstCandidates.has(boatNo);
      const isSecondCandidate = secondCandidates.has(boatNo);
      const isThirdCandidate = thirdCandidates.has(boatNo);
      const isGoalCandidate =
        isFirstCandidate || isSecondCandidate || isThirdCandidate;
      const isBlocked = blockedBoats.has(boatNo);
      const isAttackSource =
        (course === 3 || course === 4) &&
        course === scenarioAttackerCourse;

      let role = "展開外";
      if (isAttackSource) role = "攻め後の粘り";
      else if (course === 1 || course === 2 || course === 4) role = "残し";
      else if (course === 5 || course === 6) role = "拾い";
      else if (course === 3) role = "攻め後の粘り";

      const scenarioMatch = isFirstCandidate
        ? 30
        : isSecondCandidate
          ? 28
          : isThirdCandidate
            ? 24
            : 0;
      const lapAndFoot = 12.5;

      let seriesStability = 0;
      if (results.length) {
        const avgRank = average(results, 3.5);
        const top3Rate =
          results.filter((rank) => rank <= 3).length / results.length;
        const averageRankPoint =
          avgRank <= 1.8 ? 8
            : avgRank <= 2.5 ? 7
              : avgRank <= 3.2 ? 5
                : avgRank <= 4 ? 3
                  : 1;
        seriesStability = clamp(
          averageRankPoint + round(top3Rate * 7),
          0,
          15
        );
      }

      const coursePositionBase = {
        1: 15,
        2: 14,
        3: 10,
        4: 12,
        5: 9,
        6: 7
      };
      const coursePosition = coursePositionBase[course] || 0;
      const isRoughCondition =
        getWindSpeed(data) >= 4 ||
        getWaveHeight(data) >= 4;
      const localScore = toNumber(analysis?.indexes?.local, 0);
      const localWater = clamp(
        round(
          localScore * 0.07 +
          (isRoughCondition ? venueFeature.roughWater * 0.03 : 0)
        ),
        0,
        10
      );
      const playerSkill = clamp(
        round(toNumber(analysis?.indexes?.national, 0) * 0.05),
        0,
        5
      );
      const score = round(
        clamp(
          scenarioMatch +
            lapAndFoot +
            seriesStability +
            coursePosition +
            localWater +
            playerSkill,
          0,
          100
        )
      );
      const grade = roadTheoryGrade(score);
      const isFormal = Boolean(mainScenario) && hasRoadEvidence;
      const isAdopted =
        isFormal &&
        isGoalCandidate &&
        !isBlocked &&
        score >= 65;

      let status = "不成立";
      if (!isFormal && isGoalCandidate) status = "暫定";
      else if (isBlocked) status = "展開除外";
      else if (isAdopted) status = "正式採用";
      else if (score >= 55) status = "参考";

      const reasons = [
        `ゴール想定${scenarioMatch}/30`,
        `展示・一周は9％枠へ分離`,
        `今節安定${seriesStability}/15`,
        `進入・位置${coursePosition}/15`,
        `当地・水面${localWater}/10`,
        `技量${playerSkill}/5`
      ];
      if (!hasRoadEvidence) {
        reasons.push("今節成績不足のため暫定");
      }
      if (!isGoalCandidate) {
        reasons.push("最有力展開のゴール想定と不一致");
      }
      if (isBlocked) reasons.push("最有力展開で飛び候補");

      return {
        boatNo,
        playerName: analysis?.playerName || getPlayerName(entry),
        course,
        role,
        score,
        grade,
        status,
        isFormal,
        isAdopted,
        isBlocked,
        isAttackSource,
        isGoalCandidate,
        isFirstCandidate,
        isSecondCandidate,
        isThirdCandidate,
        hasRoadEvidence,
        lapTime: lapTime || null,
        seriesResultCount: results.length,
        scenarioType: mainScenario?.type || "",
        scenarioLabel: mainScenario?.label || "",
        components: {
          scenarioMatch,
          lapAndFoot,
          seriesStability,
          coursePosition,
          localWater,
          playerSkill
        },
        reason: reasons.join(" / ")
      };
    });

    const ranking = rows.sort(
      (a, b) =>
        Number(b.isAdopted) - Number(a.isAdopted) ||
        b.score - a.score ||
        a.course - b.course
    );

    return {
      ranking,
      roles: rows,
      isFormal:
        Boolean(mainScenario) &&
        rows.some((boat) => boat.hasRoadEvidence),
      adoptedBoats: ranking
        .filter((boat) => boat.isAdopted)
        .map((boat) => boat.boatNo),
      scenarioType: mainScenario?.type || "",
      scenarioLabel: mainScenario?.label || "",
      source: "ai-core-road-theory-v1"
    };
  }

  function localTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function buildLocalTheory(
    entries,
    analyses,
    data,
    raceScenarios
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const mainScenario = raceScenarios?.mainScenario || null;
    const venueFeature = getVenueFeature(data);
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [getBoatNo(boat), boat])
    );
    const firstCandidates = new Set(
      (mainScenario?.outcome?.firstCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const secondCandidates = new Set(
      (mainScenario?.outcome?.secondCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const thirdCandidates = new Set(
      (mainScenario?.outcome?.thirdCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const blockedBoats = new Set(
      (mainScenario?.blockedBoats || raceScenarios?.blockedBoats || [])
        .map((boatNo) => Number(boatNo))
        .filter(Boolean)
    );
    const isRoughCondition =
      getWindSpeed(data) >= 4 ||
      getWaveHeight(data) >= 4;

    function optionalNumber(...values) {
      const value = values.find(
        (item) =>
          item !== null &&
          item !== undefined &&
          item !== "" &&
          Number.isFinite(Number(item))
      );
      return value === undefined ? null : Number(value);
    }

    function courseVenueScore(course) {
      if (course === 1) return venueFeature.inPower;
      if (course === 2) return venueFeature.sashi;
      if (course === 3) return venueFeature.makuri;
      if (course === 4) {
        return Math.max(venueFeature.kado, venueFeature.makuriSashi);
      }
      if (course === 5) return venueFeature.makuriSashi;
      return venueFeature.outside;
    }

    const rows = sourceAnalyses.map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const entry = entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const localWinRate = optionalNumber(
        entry.localWinRate,
        entry.localRate,
        entry.local?.winRate
      );
      const local2Rate = optionalNumber(
        entry.local2Rate,
        entry.localTwoRate,
        entry.local?.twoRate
      );
      const local3Rate = optionalNumber(
        entry.local3Rate,
        entry.localThreeRate,
        entry.local?.threeRate
      );
      const nationalWinRate = optionalNumber(
        entry.nationalWinRate,
        entry.winRate,
        entry.rate,
        entry.national?.winRate
      );
      const hasLocalEvidence =
        localWinRate !== null &&
        nationalWinRate !== null &&
        (local2Rate !== null || local3Rate !== null);
      const isFirstCandidate = firstCandidates.has(boatNo);
      const isSecondCandidate = secondCandidates.has(boatNo);
      const isThirdCandidate = thirdCandidates.has(boatNo);
      const isScenarioCandidate =
        isFirstCandidate || isSecondCandidate || isThirdCandidate;
      const isBlocked = blockedBoats.has(boatNo);

      let role = "展開外";
      if (isFirstCandidate) {
        role = course === 1
          ? "逃げ"
          : course === 2
            ? "差し"
            : "攻め";
      } else if (isSecondCandidate) {
        role = "残し";
      } else if (isThirdCandidate) {
        role = "拾い";
      }

      let localVsNational = 0;
      if (localWinRate !== null && nationalWinRate !== null) {
        const difference = localWinRate - nationalWinRate;
        localVsNational =
          difference >= 1.0 ? 25
            : difference >= 0.6 ? 22
              : difference >= 0.3 ? 19
                : difference >= 0 ? 15
                  : difference >= -0.3 ? 10
                    : 5;
      }

      let localResults = 0;
      if (localWinRate !== null) {
        localResults += clamp(round((localWinRate - 4) * 3), 0, 8);
      }
      if (local2Rate !== null) {
        localResults += clamp(round((local2Rate - 20) * 0.2), 0, 6);
      }
      if (local3Rate !== null) {
        localResults += clamp(round((local3Rate - 35) * 0.15), 0, 6);
      }
      localResults = clamp(localResults, 0, 20);

      const scenarioRole = isFirstCandidate
        ? 20
        : isSecondCandidate
          ? 18
          : isThirdCandidate
            ? 15
            : 0;
      const venueCourse = clamp(
        round(courseVenueScore(course) * 0.15),
        0,
        15
      );
      const venueWater = clamp(
        round(
          courseVenueScore(course) * 0.10 +
          (
            isRoughCondition
              ? venueFeature.roughWater * 0.05
              : 5
          )
        ),
        0,
        15
      );
      const playerSkill = clamp(
        round(toNumber(analysis?.indexes?.national, 0) * 0.05),
        0,
        5
      );
      const score = round(
        clamp(
          localVsNational +
            localResults +
            scenarioRole +
            venueCourse +
            venueWater +
            playerSkill,
          0,
          100
        )
      );
      const grade = localTheoryGrade(score);
      const isFormal = Boolean(mainScenario) && hasLocalEvidence;
      const isAdopted =
        isFormal &&
        isScenarioCandidate &&
        !isBlocked &&
        score >= 65;

      let status = "不成立";
      if (!isFormal && isScenarioCandidate) status = "暫定";
      else if (isBlocked) status = "展開除外";
      else if (isAdopted) status = "正式採用";
      else if (score >= 55) status = "参考";

      const reasons = [
        `当地・全国比較${localVsNational}/25`,
        `当地成績${localResults}/20`,
        `展開役割${scenarioRole}/20`,
        `進入適合${venueCourse}/15`,
        `場・水面${venueWater}/15`,
        `技量${playerSkill}/5`
      ];
      if (!hasLocalEvidence) {
        reasons.push("当地勝率・全国勝率・当地連率不足のため暫定");
      }
      if (!isScenarioCandidate) {
        reasons.push("最有力展開の1〜3着候補と不一致");
      }
      if (isBlocked) reasons.push("最有力展開で飛び候補");

      return {
        boatNo,
        playerName: analysis?.playerName || getPlayerName(entry),
        course,
        role,
        score,
        grade,
        status,
        isFormal,
        isAdopted,
        isBlocked,
        isScenarioCandidate,
        isFirstCandidate,
        isSecondCandidate,
        isThirdCandidate,
        hasLocalEvidence,
        localWinRate,
        nationalWinRate,
        local2Rate,
        local3Rate,
        scenarioType: mainScenario?.type || "",
        scenarioLabel: mainScenario?.label || "",
        components: {
          localVsNational,
          localResults,
          scenarioRole,
          venueCourse,
          venueWater,
          playerSkill
        },
        reason: reasons.join(" / ")
      };
    });

    const ranking = rows.sort(
      (a, b) =>
        Number(b.isAdopted) - Number(a.isAdopted) ||
        b.score - a.score ||
        a.course - b.course
    );

    return {
      ranking,
      roles: rows,
      isFormal:
        Boolean(mainScenario) &&
        rows.some((boat) => boat.hasLocalEvidence),
      adoptedBoats: ranking
        .filter((boat) => boat.isAdopted)
        .map((boat) => boat.boatNo),
      scenarioType: mainScenario?.type || "",
      scenarioLabel: mainScenario?.label || "",
      source: "ai-core-local-theory-v1"
    };
  }

  function newEnvironmentTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function buildNewEnvironmentTheory(
    entries,
    analyses,
    data,
    raceScenarios
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const mainScenario = raceScenarios?.mainScenario || null;
    const period = getNewEnvironmentPeriod(data);
    const venueFeature = getVenueFeature(data);
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [getBoatNo(boat), boat])
    );
    const firstCandidates = new Set(
      (mainScenario?.outcome?.firstCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const secondCandidates = new Set(
      (mainScenario?.outcome?.secondCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const thirdCandidates = new Set(
      (mainScenario?.outcome?.thirdCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const blockedBoats = new Set(
      (mainScenario?.blockedBoats || raceScenarios?.blockedBoats || [])
        .map((boatNo) => Number(boatNo))
        .filter(Boolean)
    );
    const exhibitionTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getExhibitionTime(boat)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value);
    const lapTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getLapTime(boat)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value);
    const currentStRows = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getCurrentSeriesSt(boat).average
      }))
      .filter((item) => item.value !== null)
      .sort((a, b) => a.value - b.value);
    const exhibitionStRows = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getOptionalExhibitionSt(boat)
      }))
      .filter((item) => item.value !== null)
      .sort((a, b) => a.value - b.value);
    const isRoughCondition =
      getWindSpeed(data) >= 4 ||
      getWaveHeight(data) >= 4;

    function rankedScore(rows, boatNo, points) {
      const rank = rows.findIndex((item) => item.boatNo === boatNo);
      return rank < 0 ? 0 : (points[rank] ?? 0);
    }

    const rows = sourceAnalyses.map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const entry = entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const currentSt = getCurrentSeriesSt(entry);
      const results = getThisTermResults(entry);
      const exhibitionTime = getExhibitionTime(entry);
      const lapTime = getLapTime(entry);
      const hasExhibitionEvidence =
        exhibitionTime > 0 || lapTime > 0;
      const hasCurrentEvidence =
        currentSt.count > 0 || results.length > 0;
      const hasAdaptationEvidence =
        hasCurrentEvidence;
      const isFirstCandidate = firstCandidates.has(boatNo);
      const isSecondCandidate = secondCandidates.has(boatNo);
      const isThirdCandidate = thirdCandidates.has(boatNo);
      const isScenarioCandidate =
        isFirstCandidate || isSecondCandidate || isThirdCandidate;
      const isBlocked = blockedBoats.has(boatNo);

      let role = "展開外";
      if (isFirstCandidate) {
        role = course === 1
          ? "逃げ"
          : course === 2
            ? "差し"
            : "攻め";
      } else if (isSecondCandidate) {
        role = "残し";
      } else if (isThirdCandidate) {
        role = "拾い";
      }

      const exhibitionFoot = 15;
      const startAndSlit = clamp(
        rankedScore(
          currentStRows,
          boatNo,
          [12, 10, 8, 6, 4, 2]
        ) +
        rankedScore(
          exhibitionStRows,
          boatNo,
          [8, 7, 6, 4, 2, 1]
        ),
        0,
        20
      );

      let currentAndRoad = 0;
      if (results.length) {
        const averageFinish = average(results, 3.5);
        const top3Rate =
          results.filter((result) => result <= 3).length /
          results.length;
        currentAndRoad += clamp(
          round((4.5 - averageFinish) * 3 + top3Rate * 5),
          0,
          12
        );
      }
      if (currentSt.count >= 2 && currentSt.spread !== null) {
        currentAndRoad +=
          currentSt.spread <= 0.04 ? 8
            : currentSt.spread <= 0.07 ? 6
              : currentSt.spread <= 0.10 ? 4
                : 2;
      } else if (currentSt.count === 1) {
        currentAndRoad += 3;
      }
      currentAndRoad = clamp(currentAndRoad, 0, 20);

      const scenarioRole =
        isFirstCandidate ? 15
          : isSecondCandidate ? 13
            : isThirdCandidate ? 11
              : 0;
      const playerSkill = clamp(
        round(toNumber(analysis?.indexes?.national, 0) * 0.10),
        0,
        10
      );
      const courseVenueScore =
        course === 1 ? venueFeature.inPower
          : course === 2 ? venueFeature.sashi
            : course === 3 ? venueFeature.makuri
              : course === 4
                ? Math.max(venueFeature.kado, venueFeature.makuriSashi)
                : course === 5
                  ? venueFeature.makuriSashi
                  : venueFeature.outside;
      const localWater = clamp(
        round(
          toNumber(analysis?.indexes?.local, 0) * 0.03 +
          courseVenueScore * 0.02 +
          (isRoughCondition ? venueFeature.roughWater * 0.01 : 0)
        ),
        0,
        5
      );
      const score = round(
        clamp(
          exhibitionFoot +
          startAndSlit +
          currentAndRoad +
          scenarioRole +
          playerSkill +
          localWater,
          0,
          100
        )
      );
      const grade = newEnvironmentTheoryGrade(score);
      const isFormal =
        period.isActive &&
        !period.isProvisional &&
        Boolean(mainScenario) &&
        hasAdaptationEvidence;
      const isAdopted =
        isFormal &&
        isScenarioCandidate &&
        !isBlocked &&
        score >= 65;

      let status = "不成立";
      if (!period.isTarget) status = "対象外";
      else if (period.isStable) status = "通常評価";
      else if (
        period.isProvisional ||
        !hasAdaptationEvidence ||
        !mainScenario
      ) {
        status = isScenarioCandidate ? "暫定" : "参考";
      } else if (isBlocked) status = "展開除外";
      else if (isAdopted) status = "正式採用";
      else if (score >= 55) status = "参考";

      const reasons = [
        `展示・足は9％枠へ分離`,
        `今節ST・スリット${startAndSlit}/20`,
        `今節・道中${currentAndRoad}/20`,
        `展開役割${scenarioRole}/15`,
        `技量${playerSkill}/10`,
        `当地・水面${localWater}/5`
      ];
      if (period.isProvisional) {
        reasons.push("導入日不明のため暫定");
      }
      if (!hasAdaptationEvidence) {
        reasons.push("展示または今節実績の裏付け不足");
      }
      if (!isScenarioCandidate) {
        reasons.push("最有力展開の1〜3着候補と不一致");
      }
      if (isBlocked) reasons.push("最有力展開で飛び候補");

      return {
        boatNo,
        playerName: analysis?.playerName || getPlayerName(entry),
        course,
        role,
        score,
        grade,
        status,
        isFormal,
        isAdopted,
        isBlocked,
        isScenarioCandidate,
        isFirstCandidate,
        isSecondCandidate,
        isThirdCandidate,
        hasExhibitionEvidence,
        hasCurrentEvidence,
        hasAdaptationEvidence,
        scenarioType: mainScenario?.type || "",
        scenarioLabel: mainScenario?.label || "",
        components: {
          exhibitionFoot,
          startAndSlit,
          currentAndRoad,
          scenarioRole,
          playerSkill,
          localWater
        },
        reason: reasons.join(" / ")
      };
    });

    const ranking = rows.sort(
      (a, b) =>
        Number(b.isAdopted) - Number(a.isAdopted) ||
        b.score - a.score ||
        a.course - b.course
    );

    return {
      ...period,
      ranking,
      roles: rows,
      isFormal:
        period.isActive &&
        !period.isProvisional &&
        Boolean(mainScenario) &&
        rows.some((boat) => boat.hasAdaptationEvidence),
      adoptedBoats: ranking
        .filter((boat) => boat.isAdopted)
        .map((boat) => boat.boatNo),
      scenarioType: mainScenario?.type || "",
      scenarioLabel: mainScenario?.label || "",
      source: "ai-core-new-environment-theory-v1"
    };
  }

  const WATER_SURFACE_TYPES = {
    桐生: "淡水", 戸田: "淡水", 江戸川: "河川", 平和島: "海水",
    多摩川: "淡水", 浜名湖: "汽水", 蒲郡: "海水", 常滑: "海水",
    津: "海水", 三国: "淡水", びわこ: "淡水", 住之江: "淡水",
    尼崎: "淡水", 鳴門: "海水", 丸亀: "海水", 児島: "海水",
    宮島: "海水", 徳山: "海水", 下関: "海水", 若松: "海水",
    芦屋: "淡水", 福岡: "河口", 唐津: "淡水", 大村: "海水"
  };

  const TIDAL_WATER_TYPES = new Set(["海水", "汽水", "河口", "河川"]);

  function normalizeWindDirection(data) {
    const raw = getWindDirection(data);
    const compact = raw.replace(/\s/g, "");
    const windSpeed = getOptionalWeatherNumber(
      data,
      ["windSpeed", "wind", "wind_velocity"]
    );

    if (windSpeed !== null && windSpeed <= 2) {
      return {
        raw,
        type: "calm",
        label: "弱風",
        isKnown: true
      };
    }

    if (/向かい風|向い風|向風|headwind/i.test(compact)) {
      return { raw, type: "head", label: "向かい風", isKnown: true };
    }
    if (/追い風|追風|tailwind/i.test(compact)) {
      return { raw, type: "tail", label: "追い風", isKnown: true };
    }
    if (/横風|crosswind/i.test(compact)) {
      return { raw, type: "cross", label: "横風", isKnown: true };
    }

    return {
      raw,
      type: "unknown",
      label: raw || "風向不明",
      isKnown: false
    };
  }

  function getWaterSurfaceContext(data) {
    const weather = getWeather(data);
    const venueName = getVenueName(data);
    const waterType = safeText(
      weather.waterType ??
      data?.waterType ??
      data?.venue?.water ??
      data?.raceInfo?.waterType ??
      WATER_SURFACE_TYPES[venueName],
      "不明"
    );
    const tideLevel = getOptionalWeatherNumber(
      data,
      ["tideLevel", "currentTideLevel", "潮位"]
    );
    const tideFlow = safeText(
      weather.tideFlow ??
      weather.currentTide ??
      weather.tidePhase ??
      weather.tideDirection ??
      data?.tideFlow ??
      data?.currentTide ??
      data?.tidePhase ??
      data?.tideDirection,
      ""
    ).trim();
    const hasLiveTide = tideLevel !== null || Boolean(tideFlow);
    const isTidal = TIDAL_WATER_TYPES.has(waterType);

    return {
      venueName,
      waterType,
      isTidal,
      tideLevel,
      tideFlow,
      hasLiveTide
    };
  }

  function waterWeatherTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function buildWaterWeatherTheory(
    entries,
    analyses,
    data,
    raceScenarios
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const mainScenario = raceScenarios?.mainScenario || null;
    const venueFeature = getVenueFeature(data);
    const wind = normalizeWindDirection(data);
    const surface = getWaterSurfaceContext(data);
    const windSpeed = getOptionalWeatherNumber(
      data,
      ["windSpeed", "wind", "wind_velocity"]
    );
    const waveHeight = getOptionalWeatherNumber(
      data,
      ["waveHeight", "wave", "wave_height"]
    );
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [getBoatNo(boat), boat])
    );
    const firstCandidates = new Set(
      (mainScenario?.outcome?.firstCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const secondCandidates = new Set(
      (mainScenario?.outcome?.secondCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const thirdCandidates = new Set(
      (mainScenario?.outcome?.thirdCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const blockedBoats = new Set(
      (mainScenario?.blockedBoats || raceScenarios?.blockedBoats || [])
        .map((boatNo) => Number(boatNo))
        .filter(Boolean)
    );
    const exhibitionTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getExhibitionTime(boat)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value);
    const lapTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getLapTime(boat)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value);
    const hasWeatherEvidence =
      windSpeed !== null && waveHeight !== null;
    const tideReady = !surface.isTidal || surface.hasLiveTide;
    const isProvisional =
      !hasWeatherEvidence || !wind.isKnown || !tideReady;

    function rankedScore(rows, boatNo, points) {
      const rank = rows.findIndex((item) => item.boatNo === boatNo);
      return rank < 0 ? 0 : (points[rank] ?? 0);
    }

    function windCourseScore(course) {
      const table = {
        calm: [20, 18, 16, 14, 12, 10],
        head: [15, 12, 20, 19, 14, 10],
        tail: [17, 20, 13, 11, 10, 8],
        cross: [16, 15, 15, 14, 12, 10]
      };
      return table[wind.type]?.[course - 1] ?? 0;
    }

    const roles = sourceAnalyses.map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const entry = entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const hasExhibitionEvidence =
        getExhibitionTime(entry) > 0 || getLapTime(entry) > 0;
      const isFirstCandidate = firstCandidates.has(boatNo);
      const isSecondCandidate = secondCandidates.has(boatNo);
      const isThirdCandidate = thirdCandidates.has(boatNo);
      const isScenarioCandidate =
        isFirstCandidate || isSecondCandidate || isThirdCandidate;
      const isBlocked = blockedBoats.has(boatNo);

      let role = "展開外";
      if (isFirstCandidate) {
        role = course === 1
          ? "逃げ"
          : course === 2
            ? "差し"
            : "攻め";
      } else if (isSecondCandidate) {
        role = "残し";
      } else if (isThirdCandidate) {
        role = "拾い";
      }

      const windCourse = windCourseScore(course);
      const waveExhibition = clamp(
        rankedScore(
          exhibitionTimes,
          boatNo,
          [12, 10, 8, 6, 4, 2]
        ) +
        rankedScore(
          lapTimes,
          boatNo,
          [8, 7, 6, 5, 3, 1]
        ),
        0,
        20
      );
      const surfaceTide = clamp(
        (surface.waterType !== "不明"
          ? round(venueFeature.roughWater * 0.05)
          : 0) +
        (surface.hasLiveTide ? 10 : surface.isTidal ? 0 : 10),
        0,
        15
      );
      const scenarioRole =
        isFirstCandidate ? 20
          : isSecondCandidate ? 18
            : isThirdCandidate ? 16
              : 0;
      const localRoad = clamp(
        round(
          toNumber(analysis?.indexes?.local, 0) * 0.08 +
          toNumber(analysis?.indexes?.turn, 0) * 0.07
        ),
        0,
        15
      );
      const stSkill = clamp(
        round(
          toNumber(analysis?.indexes?.st, 0) * 0.06 +
          toNumber(analysis?.indexes?.national, 0) * 0.04
        ),
        0,
        10
      );
      const score = round(clamp(
        windCourse +
        waveExhibition +
        surfaceTide +
        scenarioRole +
        localRoad +
        stSkill,
        0,
        100
      ));
      const grade = waterWeatherTheoryGrade(score);
      const isFormal =
        !isProvisional &&
        Boolean(mainScenario) &&
        hasExhibitionEvidence;
      const isAdopted =
        isFormal &&
        isScenarioCandidate &&
        !isBlocked &&
        score >= 65;

      let status = "不成立";
      if (
        isProvisional ||
        !mainScenario ||
        !hasExhibitionEvidence
      ) {
        status = isScenarioCandidate ? "暫定" : "参考";
      } else if (isBlocked) {
        status = "展開除外";
      } else if (isAdopted) {
        status = "正式採用";
      } else if (score >= 55) {
        status = "参考";
      }

      const reasons = [
        `風向・風速とコース${windCourse}/20`,
        `波・展示・回り足${waveExhibition}/20`,
        `水面・潮汐${surfaceTide}/15`,
        `展開役割${scenarioRole}/20`,
        `当地・道中${localRoad}/15`,
        `ST・技量${stSkill}/10`
      ];
      if (!hasWeatherEvidence) reasons.push("風速または波高の実測値不足");
      if (!wind.isKnown) reasons.push("風向を正確に分類できないため暫定");
      if (!tideReady) reasons.push("潮汐場の現在潮位・潮流が不足");
      if (!hasExhibitionEvidence) reasons.push("展示・一周・回り足の裏付け不足");
      if (!isScenarioCandidate) reasons.push("最有力展開の1〜3着候補と不一致");
      if (isBlocked) reasons.push("最有力展開で飛び候補");

      return {
        boatNo,
        playerName: analysis?.playerName || getPlayerName(entry),
        course,
        role,
        score,
        grade,
        status,
        isFormal,
        isAdopted,
        isBlocked,
        isScenarioCandidate,
        isFirstCandidate,
        isSecondCandidate,
        isThirdCandidate,
        hasExhibitionEvidence,
        scenarioType: mainScenario?.type || "",
        scenarioLabel: mainScenario?.label || "",
        components: {
          windCourse,
          waveExhibition,
          surfaceTide,
          scenarioRole,
          localRoad,
          stSkill
        },
        reason: reasons.join(" / ")
      };
    });
    const ranking = roles.sort(
      (a, b) =>
        Number(b.isAdopted) - Number(a.isAdopted) ||
        b.score - a.score ||
        a.course - b.course
    );

    return {
      venueName: surface.venueName,
      wind,
      windSpeed,
      waveHeight,
      surface,
      isProvisional,
      isFormal:
        !isProvisional &&
        Boolean(mainScenario) &&
        roles.some((boat) => boat.hasExhibitionEvidence),
      ranking,
      roles,
      adoptedBoats: ranking
        .filter((boat) => boat.isAdopted)
        .map((boat) => boat.boatNo),
      scenarioType: mainScenario?.type || "",
      scenarioLabel: mainScenario?.label || "",
      source: "ai-core-water-weather-theory-v1"
    };
  }

  function racerSkillTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function getRacerRegisterNo(boat) {
    const candidates = [
      boat?.registerNo,
      boat?.registrationNo,
      boat?.racerNo,
      boat?.playerNo,
      boat?.racer?.registerNo,
      boat?.raw?.registerNo
    ];

    for (const value of candidates) {
      const text = String(value ?? "").trim();
      if (/^\d{4}$/.test(text)) return text;
    }

    return "";
  }

  function getHistoryMethodRate(
    courseStats,
    methodNames
  ) {
    const names = new Set(
      (Array.isArray(methodNames) ? methodNames : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    );

    return (courseStats?.winningMethods || [])
      .filter((item) => names.has(String(item?.key || "")))
      .reduce(
        (sum, item) =>
          sum + toNumber(item?.rate, 0),
        0
      );
  }

  function getRacerSkillRole(
    mainScenario,
    boatNo
  ) {
    const firstCandidates = new Set(
      (mainScenario?.outcome?.firstCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const secondCandidates = new Set(
      (mainScenario?.outcome?.secondCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const thirdCandidates = new Set(
      (mainScenario?.outcome?.thirdCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );

    if (firstCandidates.has(boatNo)) {
      const type = String(mainScenario?.type || "");
      if (type === "escape") {
        return {
          role: "逃げ",
          expectedMethods: ["逃げ"],
          isScenarioCandidate: true,
          isFirstCandidate: true
        };
      }
      if (type === "sashi") {
        return {
          role: "差し",
          expectedMethods: ["差し"],
          isScenarioCandidate: true,
          isFirstCandidate: true
        };
      }
      if (
        type === "threeAttack" ||
        type === "fourAttack"
      ) {
        return {
          role: "攻め",
          expectedMethods: ["まくり", "まくり差し"],
          isScenarioCandidate: true,
          isFirstCandidate: true
        };
      }
    }

    if (secondCandidates.has(boatNo)) {
      return {
        role: "残し",
        expectedMethods: [],
        isScenarioCandidate: true,
        isSecondCandidate: true
      };
    }

    if (thirdCandidates.has(boatNo)) {
      return {
        role: "拾い",
        expectedMethods: [],
        isScenarioCandidate: true,
        isThirdCandidate: true
      };
    }

    return {
      role: "展開外",
      expectedMethods: [],
      isScenarioCandidate: false
    };
  }

  function buildRacerSkillTheory(
    entries,
    analyses,
    data,
    raceScenarios
  ) {
    const sourceEntries =
      Array.isArray(entries) ? entries : [];
    const sourceAnalyses =
      Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const mainScenario =
      raceScenarios?.mainScenario || null;
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [
        getBoatNo(boat),
        boat
      ])
    );
    const historyRacers = new Map(
      (
        data?.historyContext?.racers || []
      )
        .map((racer) => [
          String(racer?.registerNo || ""),
          racer
        ])
        .filter(([registerNo]) =>
          /^\d{4}$/.test(registerNo)
        )
    );
    const blockedBoats = new Set(
      (
        mainScenario?.blockedBoats ||
        raceScenarios?.blockedBoats ||
        []
      )
        .map((boatNo) => Number(boatNo))
        .filter(Boolean)
    );

    function coursePerformanceScore(stats) {
      if (!stats) return 0;
      return clamp(
        round(
          toNumber(stats.winRate, 0) * 0.22 +
          toNumber(stats.top3Rate, 0) * 0.12
        ),
        0,
        25
      );
    }

    function startScore(stats) {
      const st = isNil(stats?.averageSt)
        ? null
        : toNumber(stats.averageSt, null);

      if (st === null) return 0;
      if (st <= 0.12) return 15;
      if (st <= 0.14) return 13;
      if (st <= 0.16) return 10;
      if (st <= 0.18) return 7;
      if (st <= 0.20) return 4;
      return 2;
    }

    function trendScore(recent, previous) {
      const recentSamples =
        toNumber(recent?.starts, 0);
      const previousSamples =
        toNumber(previous?.starts, 0);

      if (
        recentSamples < 6 ||
        previousSamples < 6
      ) {
        return 0;
      }

      const recentValue =
        toNumber(recent?.winRate, 0) * 0.45 +
        toNumber(recent?.top3Rate, 0) * 0.55;
      const previousValue =
        toNumber(previous?.winRate, 0) * 0.45 +
        toNumber(previous?.top3Rate, 0) * 0.55;

      return clamp(
        round(
          8 +
          (recentValue - previousValue) * 0.25
        ),
        0,
        15
      );
    }

    function classNationalScore(entry) {
      const className =
        getClassName(entry).toUpperCase();
      const classPoints =
        className.includes("A1") ? 7
          : className.includes("A2") ? 5
            : className.includes("B1") ? 3
              : className.includes("B2") ? 1
                : 0;
      const nationalWinRate =
        getNationalWinRate(entry);
      const nationalPoints = clamp(
        round(
          (nationalWinRate - 3) * 1.6
        ),
        0,
        8
      );

      return clamp(
        classPoints + nationalPoints,
        0,
        15
      );
    }

    const roles = sourceAnalyses.map((analysis) => {
      const boatNo =
        Number(analysis?.boatNo || 0);
      const entry =
        entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const registerNo =
        getRacerRegisterNo(entry);
      const history =
        historyRacers.get(registerNo) || null;
      const windows =
        history?.skillHistory?.windows ||
        history?.windows ||
        {};
      const allCourse =
        windows.all3Years?.byCourse?.[
          String(course)
        ] ||
        history?.byCourse?.[
          String(course)
        ] ||
        null;
      const recentCourse =
        windows.recent1Year?.byCourse?.[
          String(course)
        ] || null;
      const previousCourse =
        windows.previous2Years?.byCourse?.[
          String(course)
        ] || null;
      const samples =
        toNumber(allCourse?.starts, 0);
      const roleInfo =
        getRacerSkillRole(
          mainScenario,
          boatNo
        );
      const isBlocked =
        blockedBoats.has(boatNo);

      const coursePerformance =
        coursePerformanceScore(allCourse);
      const courseStart =
        startScore(allCourse);

      let methodFit = 0;
      let methodLabel = "戦法根拠不足";

      if (roleInfo.expectedMethods.length) {
        const methodRate =
          getHistoryMethodRate(
            allCourse,
            roleInfo.expectedMethods
          );
        const methodWins =
          (allCourse?.winningMethods || [])
            .filter((item) =>
              roleInfo.expectedMethods.includes(
                String(item?.key || "")
              )
            )
            .reduce(
              (sum, item) =>
                sum + toNumber(item?.count, 0),
              0
            );

        if (methodWins >= 3) {
          methodFit = clamp(
            round(methodRate * 0.20),
            0,
            20
          );
          methodLabel =
            `${roleInfo.expectedMethods.join("・")} ${round(methodRate)}%`;
        }
      } else {
        const methods =
          allCourse?.winningMethods || [];
        const methodWins = methods.reduce(
          (sum, item) =>
            sum + toNumber(item?.count, 0),
          0
        );
        const usefulMethods = methods.filter(
          (item) =>
            toNumber(item?.count, 0) >= 2 &&
            toNumber(item?.rate, 0) >= 15
        );

        if (methodWins >= 5) {
          methodFit = clamp(
            6 +
            usefulMethods.length * 3 +
            Math.min(5, methodWins * 0.25),
            0,
            20
          );
          methodLabel =
            usefulMethods.length >= 2
              ? "複数戦法の実績あり"
              : safeText(
                  methods[0]?.key,
                  "実績戦法あり"
                );
        }
      }

      const recentTrend =
        trendScore(
          recentCourse,
          previousCourse
        );
      const classNational =
        classNationalScore(entry);
      const currentResults =
        getThisTermResults(entry);
      const seriesRoad =
        currentResults.length
          ? clamp(
              round(
                (
                  4.5 -
                  average(
                    currentResults,
                    3.5
                  )
                ) * 1.5 +
                (
                  currentResults.filter(
                    (rank) => rank <= 3
                  ).length /
                  currentResults.length
                ) * 3
              ),
              0,
              5
            )
          : 0;
      const scenarioRole =
        roleInfo.isFirstCandidate ? 5
          : roleInfo.isSecondCandidate ? 4
            : roleInfo.isThirdCandidate ? 3
              : 0;
      const score = round(clamp(
        coursePerformance +
        courseStart +
        methodFit +
        recentTrend +
        classNational +
        seriesRoad +
        scenarioRole,
        0,
        100
      ));
      const grade =
        racerSkillTheoryGrade(score);
      const hasCourseHistory =
        Boolean(history && allCourse);
      const isFormal =
        Boolean(mainScenario) &&
        hasCourseHistory &&
        samples >= 12;
      const isHighReliability =
        samples >= 30;
      const isAdopted =
        isFormal &&
        roleInfo.isScenarioCandidate &&
        !isBlocked &&
        score >= 65;

      let status = "参考";
      if (!hasCourseHistory || samples < 12) {
        status = "暫定";
      } else if (isBlocked) {
        status = "展開除外";
      } else if (isAdopted) {
        status = "正式採用";
      } else if (score >= 55) {
        status = "標準・参考";
      } else {
        status = "適性不足・根拠不足";
      }

      const reasons = [
        `現在コース1着・3連率${coursePerformance}/25`,
        `コース別ST・安定性${courseStart}/15`,
        `得意戦法一致${methodFit}/20`,
        `直近1年・過去2年推移${recentTrend}/15`,
        `級別・全国勝率${classNational}/15`,
        `今節着順・道中${seriesRoad}/5`,
        `最有力展開役割${scenarioRole}/5`
      ];
      if (!registerNo) {
        reasons.push("登録番号未取得");
      }
      if (!hasCourseHistory) {
        reasons.push("公式の実進入コース別履歴なし");
      } else if (samples < 12) {
        reasons.push(`実進入${course}コース${samples}走で判定数未達`);
      } else if (!isHighReliability) {
        reasons.push(`実進入${course}コース${samples}走で中信頼`);
      }
      if (!recentTrend) {
        reasons.push("期間別推移の必要使用数未達");
      }
      if (!methodFit) {
        reasons.push("決まり手の件数・割合不足");
      }
      if (!roleInfo.isScenarioCandidate) {
        reasons.push("最有力展開の1〜3着候補と不一致");
      }
      if (isBlocked) {
        reasons.push("最有力展開で飛び候補");
      }

      return {
        boatNo,
        playerName:
          analysis?.playerName ||
          getPlayerName(entry),
        registerNo,
        course,
        role: roleInfo.role,
        methodLabel,
        samples,
        reliability:
          isHighReliability
            ? "high"
            : samples >= 12
              ? "medium"
              : "low",
        score,
        grade,
        status,
        isFormal,
        isAdopted,
        isBlocked,
        isScenarioCandidate:
          roleInfo.isScenarioCandidate,
        isFirstCandidate:
          roleInfo.isFirstCandidate === true,
        isSecondCandidate:
          roleInfo.isSecondCandidate === true,
        isThirdCandidate:
          roleInfo.isThirdCandidate === true,
        appliedToScore: false,
        courseHistory: {
          all3Years: allCourse,
          recent1Year: recentCourse,
          previous2Years: previousCourse
        },
        components: {
          coursePerformance,
          courseStart,
          methodFit,
          recentTrend,
          classNational,
          seriesRoad,
          scenarioRole
        },
        reason: reasons.join(" / ")
      };
    });
    const ranking = [...roles].sort(
      (a, b) =>
        Number(b.isAdopted) -
          Number(a.isAdopted) ||
        b.score - a.score ||
        b.samples - a.samples ||
        a.course - b.course
    );

    return {
      ranking,
      roles,
      isFormal:
        Boolean(mainScenario) &&
        roles.some((boat) => boat.isFormal),
      isProvisional:
        !mainScenario ||
        !roles.some((boat) => boat.isFormal),
      adoptedBoats: ranking
        .filter((boat) => boat.isAdopted)
        .map((boat) => boat.boatNo),
      scenarioType:
        mainScenario?.type || "",
      scenarioLabel:
        mainScenario?.label || "",
      sampleThreshold: 12,
      highReliabilityThreshold: 30,
      skillWeightLimit: 0.10,
      appliedToScore: false,
      source:
        "ai-core-racer-skill-theory-v1"
    };
  }

  function motorMaintenanceTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function getRawMotorRates(boat) {
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

    return {
      motor2:
        isNil(rawMotor2)
          ? null
          : toNumber(rawMotor2, null),
      motor3:
        isNil(rawMotor3)
          ? null
          : toNumber(rawMotor3, null)
    };
  }

  function hasKnownMotorTerm(data) {
    const candidates = [
      data?.motorUsageRaces,
      data?.motorUsageSeries,
      data?.motorTermStart,
      data?.motorUpdateDate,
      data?.engineUpdateDate,
      data?.raceInfo?.motorUsageRaces,
      data?.raceInfo?.motorUsageSeries,
      data?.raceInfo?.motorTermStart,
      data?.raceInfo?.motorUpdateDate,
      data?.raceInfo?.engineUpdateDate
    ];

    return candidates.some((value) => !isNil(value));
  }

  function getMaintenanceComparison(boat) {
    const comparison =
      boat.maintenanceComparison ??
      boat.partsExchangeChange ??
      boat.adjustmentComparison ??
      boat.maintenance?.comparison ??
      {};
    const before =
      comparison.before ??
      boat.maintenance?.before ??
      boat.beforeMaintenance ??
      {};
    const after =
      comparison.after ??
      boat.maintenance?.after ??
      boat.afterMaintenance ??
      {};
    const partsExchange = safeText(
      boat.partsExchange ??
      boat.parts ??
      boat.exhibition?.partsExchange ??
      boat.beforeInfo?.partsExchange ??
      boat.beforeInfo?.exhibition?.partsExchange,
      ""
    ).trim();
    const metrics = [
      {
        key: "exhibition",
        points: 4,
        before:
          before.exhibitionTime ??
          before.displayTime ??
          before.exhibition?.time,
        after:
          after.exhibitionTime ??
          after.displayTime ??
          after.exhibition?.time
      },
      {
        key: "lap",
        points: 4,
        before:
          before.lapTime ??
          before.oneLapTime ??
          before.turnTime,
        after:
          after.lapTime ??
          after.oneLapTime ??
          after.turnTime
      },
      {
        key: "st",
        points: 3,
        before:
          before.st ??
          before.exhibitionSt ??
          before.averageSt,
        after:
          after.st ??
          after.exhibitionSt ??
          after.averageSt
      },
      {
        key: "finish",
        points: 4,
        before:
          before.finish ??
          before.result ??
          before.averageFinish,
        after:
          after.finish ??
          after.result ??
          after.averageFinish
      }
    ];
    let score = 0;
    let comparableCount = 0;
    let improvedCount = 0;
    let worsenedCount = 0;

    metrics.forEach((metric) => {
      if (isNil(metric.before) || isNil(metric.after)) return;
      const beforeValue = toNumber(metric.before, NaN);
      const afterValue = toNumber(metric.after, NaN);
      if (!Number.isFinite(beforeValue) || !Number.isFinite(afterValue)) {
        return;
      }

      comparableCount += 1;
      if (afterValue < beforeValue) {
        improvedCount += 1;
        score += metric.points;
      } else if (afterValue > beforeValue) {
        worsenedCount += 1;
      }
    });

    let trend = "交換なし";
    if (partsExchange && !comparableCount) trend = "交換情報のみ";
    else if (improvedCount > worsenedCount) trend = "改善";
    else if (worsenedCount > improvedCount) trend = "悪化";
    else if (comparableCount) trend = "変化なし";

    return {
      partsExchange,
      score: clamp(score, 0, 15),
      comparableCount,
      improvedCount,
      worsenedCount,
      trend,
      hasComparison: comparableCount > 0
    };
  }

  function buildMotorMaintenanceTheory(
    entries,
    analyses,
    data,
    raceScenarios
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const mainScenario = raceScenarios?.mainScenario || null;
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [getBoatNo(boat), boat])
    );
    const firstCandidates = new Set(
      (mainScenario?.outcome?.firstCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const secondCandidates = new Set(
      (mainScenario?.outcome?.secondCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const thirdCandidates = new Set(
      (mainScenario?.outcome?.thirdCandidates || [])
        .map((boat) => Number(boat?.boatNo || boat || 0))
        .filter(Boolean)
    );
    const blockedBoats = new Set(
      (mainScenario?.blockedBoats || raceScenarios?.blockedBoats || [])
        .map((boatNo) => Number(boatNo))
        .filter(Boolean)
    );
    const exhibitionTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getExhibitionTime(boat)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value);
    const lapTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getLapTime(boat)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value);
    const currentStRows = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getCurrentSeriesSt(boat).average
      }))
      .filter((item) => item.value !== null)
      .sort((a, b) => a.value - b.value);
    const exhibitionStRows = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getOptionalExhibitionSt(boat)
      }))
      .filter((item) => item.value !== null)
      .sort((a, b) => a.value - b.value);
    const motorRows = sourceEntries
      .map((boat) => {
        const rates = getRawMotorRates(boat);
        return {
          boatNo: getBoatNo(boat),
          value:
            rates.motor2 !== null
              ? rates.motor2 * 0.7 + (rates.motor3 ?? 45) * 0.3
              : null
        };
      })
      .filter((item) => item.value !== null)
      .sort((a, b) => b.value - a.value);
    const newEnvironment = getNewEnvironmentPeriod(data);
    const motorTermKnown = hasKnownMotorTerm(data);
    const motorStatsReady =
      !newEnvironment.isActive &&
      motorTermKnown &&
      motorRows.length === 6;

    function rankedScore(rows, boatNo, points) {
      const rank = rows.findIndex((item) => item.boatNo === boatNo);
      return rank < 0 ? 0 : (points[rank] ?? 0);
    }

    const roles = sourceAnalyses.map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const entry = entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const results = getThisTermResults(entry);
      const currentSt = getCurrentSeriesSt(entry);
      const maintenance = getMaintenanceComparison(entry);
      const hasExhibitionEvidence =
        getExhibitionTime(entry) > 0 || getLapTime(entry) > 0;
      const hasCurrentEvidence =
        results.length > 0 || currentSt.count > 0;
      const hasPracticalEvidence =
        hasExhibitionEvidence || results.length > 0;
      const isFirstCandidate = firstCandidates.has(boatNo);
      const isSecondCandidate = secondCandidates.has(boatNo);
      const isThirdCandidate = thirdCandidates.has(boatNo);
      const isScenarioCandidate =
        isFirstCandidate || isSecondCandidate || isThirdCandidate;
      const isBlocked = blockedBoats.has(boatNo);

      let role = "展開外";
      if (isFirstCandidate) {
        role = course === 1
          ? "逃げ"
          : course === 2
            ? "差し"
            : "攻め";
      } else if (isSecondCandidate) {
        role = "残し";
      } else if (isThirdCandidate) {
        role = "拾い";
      }

      /*
        展示・一周は展示・足9％枠で評価済み。
        モーター理論では実走確認の有無だけを使い、
        順位点は加算しない。
      */
      const exhibitionFoot = 12.5;

      let currentRoad = clamp(
        round(toNumber(analysis?.indexes?.turn, 0) * 0.08),
        0,
        8
      );
      if (results.length) {
        const averageFinish = average(results, 3.5);
        const top3Rate =
          results.filter((result) => result <= 3).length /
          results.length;
        currentRoad += clamp(
          round((4.5 - averageFinish) * 2 + top3Rate * 6),
          0,
          12
        );
      }
      currentRoad = clamp(currentRoad, 0, 20);

      const startAndSlit = clamp(
        rankedScore(currentStRows, boatNo, [9, 8, 7, 5, 3, 1]) +
        rankedScore(exhibitionStRows, boatNo, [6, 5, 4, 3, 2, 1]),
        0,
        15
      );
      const maintenanceChange = maintenance.score;
      const relativeMotor = motorStatsReady
        ? rankedScore(motorRows, boatNo, [10, 8, 6, 4, 2, 1])
        : 0;
      const scenarioRole =
        isFirstCandidate ? 10
          : isSecondCandidate ? 9
            : isThirdCandidate ? 8
              : 0;
      const playerAdjustment = clamp(
        round(
          toNumber(analysis?.indexes?.national, 0) * 0.03 +
          toNumber(analysis?.indexes?.local, 0) * 0.02
        ),
        0,
        5
      );
      const score = round(clamp(
        exhibitionFoot +
        currentRoad +
        startAndSlit +
        maintenanceChange +
        relativeMotor +
        scenarioRole +
        playerAdjustment,
        0,
        100
      ));
      const grade = motorMaintenanceTheoryGrade(score);
      const isFormal =
        Boolean(mainScenario) &&
        hasPracticalEvidence;
      const isAdopted =
        isFormal &&
        isScenarioCandidate &&
        !isBlocked &&
        score >= 65;

      let status = "不成立";
      if (!mainScenario || !hasPracticalEvidence) {
        status = isScenarioCandidate ? "暫定" : "参考";
      } else if (isBlocked) {
        status = "展開除外";
      } else if (isAdopted) {
        status = "正式採用";
      } else if (score >= 55) {
        status = "参考";
      }

      const reasons = [
        `展示・一周は確認条件のみ`,
        `今節・道中${currentRoad}/20`,
        `今節ST・スリット${startAndSlit}/15`,
        `整備後変化${maintenanceChange}/15`,
        `場内相対モーター${relativeMotor}/10`,
        `展開役割${scenarioRole}/10`,
        `調整力・当地${playerAdjustment}/5`
      ];
      if (maintenance.partsExchange && !maintenance.hasComparison) {
        reasons.push("部品交換後の比較不足のため非加点");
      }
      if (maintenance.trend === "悪化") {
        reasons.push("交換後悪化のため参考扱い");
      }
      if (newEnvironment.isActive) {
        reasons.push("新型エンジン期のためモーター数字は非加点");
      } else if (!motorTermKnown) {
        reasons.push("更新時期・使用節数不明のためモーター数字は暫定");
      } else if (motorRows.length < 6) {
        reasons.push("6艇のモーター数字不足");
      }
      if (!hasPracticalEvidence) {
        reasons.push("展示または今節実績の裏付け不足");
      }
      if (!isScenarioCandidate) {
        reasons.push("最有力展開の1〜3着候補と不一致");
      }
      if (isBlocked) reasons.push("最有力展開で飛び候補");

      return {
        boatNo,
        playerName: analysis?.playerName || getPlayerName(entry),
        course,
        role,
        score,
        grade,
        status,
        isFormal,
        isAdopted,
        isBlocked,
        isScenarioCandidate,
        isFirstCandidate,
        isSecondCandidate,
        isThirdCandidate,
        hasExhibitionEvidence,
        hasCurrentEvidence,
        hasPracticalEvidence,
        maintenance,
        motorRates: getRawMotorRates(entry),
        scenarioType: mainScenario?.type || "",
        scenarioLabel: mainScenario?.label || "",
        components: {
          exhibitionFoot,
          currentRoad,
          startAndSlit,
          maintenanceChange,
          relativeMotor,
          scenarioRole,
          playerAdjustment
        },
        reason: reasons.join(" / ")
      };
    });
    const ranking = roles.sort(
      (a, b) =>
        Number(b.isAdopted) - Number(a.isAdopted) ||
        b.score - a.score ||
        a.course - b.course
    );

    return {
      ranking,
      roles,
      isFormal:
        Boolean(mainScenario) &&
        roles.some((boat) => boat.hasPracticalEvidence),
      isProvisional:
        !mainScenario ||
        !roles.some((boat) => boat.hasPracticalEvidence),
      motorTermKnown,
      motorStatsReady,
      motorStatsStatus:
        newEnvironment.isActive
          ? "新型エンジン期・非加点"
          : !motorTermKnown
            ? "更新時期不明・暫定"
            : motorRows.length < 6
              ? "6艇データ不足"
              : "場内相対評価",
      newEnvironmentActive: newEnvironment.isActive,
      adoptedBoats: ranking
        .filter((boat) => boat.isAdopted)
        .map((boat) => boat.boatNo),
      scenarioType: mainScenario?.type || "",
      scenarioLabel: mainScenario?.label || "",
      source: "ai-core-motor-maintenance-theory-v1"
    };
  }

  function wallTheoryGrade(score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 55) return "C";
    return "D";
  }

  function buildWallTheory(
    entries,
    analyses,
    data,
    raceScenarios
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
    const courseMapping = buildOfficialCourseMapping(sourceEntries);
    const mainScenario = raceScenarios?.mainScenario || null;
    const attackerNo =
      Number(
        raceScenarios?.attacker ??
        mainScenario?.attackerBoatNo ??
        mainScenario?.headBoatNo ??
        courseMapping.boatAtCourse(
          mainScenario?.attackerCourse ??
          mainScenario?.attacker
        ) ??
        0
      ) || null;
    const entryByBoat = new Map(
      sourceEntries.map((boat) => [getBoatNo(boat), boat])
    );
    const courseRows = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        course: courseMapping.courseOfBoat(
          getBoatNo(boat)
        )
      }))
      .filter(
        (item) =>
          item.boatNo >= 1 &&
          item.boatNo <= 6 &&
          item.course >= 1 &&
          item.course <= 6
      );
    const attackerEntry =
      entryByBoat.get(attackerNo) || null;
    const attackerCourse = attackerEntry
      ? courseMapping.courseOfBoat(attackerNo)
      : 0;
    const wallCourse =
      attackerCourse >= 2 ? attackerCourse - 1 : null;
    const wallCandidateNo =
      wallCourse === null
        ? null
        : courseRows.find(
            (item) => item.course === wallCourse
          )?.boatNo || null;
    const blockedBoats = new Set(
      (
        mainScenario?.blockedBoats ||
        raceScenarios?.blockedBoats ||
        []
      )
        .map(Number)
        .filter(Boolean)
    );
    const exhibitionTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getExhibitionTime(boat)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value);
    const lapTimes = sourceEntries
      .map((boat) => ({
        boatNo: getBoatNo(boat),
        value: getLapTime(boat)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value);
    const exhibitionReady = exhibitionTimes.length === 6;
    const lapReady = lapTimes.length === 6;
    const venueFeature = getVenueFeature(data);
    const weather = getWeather(data);
    const hasSurfaceEvidence = [
      weather?.windSpeed,
      weather?.wind,
      weather?.wind_velocity,
      weather?.waveHeight,
      weather?.wave,
      weather?.wave_height,
      data?.windSpeed,
      data?.waveHeight
    ].some((value) => !isNil(value));

    function rankedScore(rows, boatNo, points) {
      const rank = rows.findIndex(
        (item) => item.boatNo === Number(boatNo)
      );
      return rank < 0 ? 0 : (points[rank] ?? 0);
    }

    function compareStart(
      wallValue,
      attackValue,
      maximum
    ) {
      if (wallValue === null || attackValue === null) return 0;
      const lag = wallValue - attackValue;

      if (lag <= 0.01) return maximum;
      if (lag <= 0.03) return Math.ceil(maximum * 0.7);
      if (lag <= 0.05) return Math.ceil(maximum * 0.4);
      return 0;
    }

    const roles = sourceAnalyses.map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const entry = entryByBoat.get(boatNo) || {};
      const course = courseMapping.courseOfBoat(boatNo);
      const isAdjacent =
        Boolean(wallCandidateNo) &&
        boatNo === wallCandidateNo &&
        course === wallCourse;
      const currentSt = getCurrentSeriesSt(entry);
      const attackerCurrentSt =
        getCurrentSeriesSt(attackerEntry || {});
      const avgSt = getOptionalAverageSt(entry);
      const attackerAvgSt =
        getOptionalAverageSt(attackerEntry || {});
      const exhibitionSt =
        getOptionalExhibitionSt(entry);
      const attackerExhibitionSt =
        getOptionalExhibitionSt(attackerEntry || {});
      const hasExhibitionStComparison =
        exhibitionSt !== null &&
        attackerExhibitionSt !== null;
      const hasCurrentStComparison =
        currentSt.average !== null &&
        attackerCurrentSt.average !== null;
      const hasAverageStComparison =
        avgSt !== null &&
        attackerAvgSt !== null;
      const hasStartEvidence =
        hasExhibitionStComparison ||
        hasCurrentStComparison ||
        hasAverageStComparison;
      const hasExhibitionEvidence =
        (
          getExhibitionTime(entry) > 0 &&
          getExhibitionTime(attackerEntry || {}) > 0
        ) ||
        (
          getLapTime(entry) > 0 &&
          getLapTime(attackerEntry || {}) > 0
        );

      const startComparison = clamp(
        compareStart(
          exhibitionSt,
          attackerExhibitionSt,
          8
        ) +
        compareStart(
          currentSt.average,
          attackerCurrentSt.average,
          7
        ) +
        compareStart(
          avgSt,
          attackerAvgSt,
          10
        ),
        0,
        25
      );
      let startStability = 0;

      if (currentSt.count >= 2) {
        if (currentSt.average <= 0.15) {
          startStability += 8;
        } else if (currentSt.average <= 0.17) {
          startStability += 5;
        } else if (currentSt.average <= 0.19) {
          startStability += 2;
        }

        if (
          currentSt.spread !== null &&
          currentSt.spread <= 0.04
        ) {
          startStability += 4;
        }
      }

      if (avgSt !== null) {
        if (avgSt <= 0.15) {
          startStability += 12;
        } else if (avgSt <= 0.16) {
          startStability += 9;
        } else if (avgSt <= 0.18) {
          startStability += 4;
        }
      }
      startStability = clamp(startStability, 0, 15);

      const courseAdjacency = isAdjacent ? 15 : 0;
      /*
        旧配点の成立基準を保つ校正常数。
        艇ごとの展示・一周順位はここへ再加算しない。
      */
      const exhibitionFoot = 13;

      const holdRoad = clamp(
        Math.round(
          toNumber(analysis?.roleScores?.hold, 0) * 0.11 +
          toNumber(analysis?.indexes?.turn, 0) * 0.03 +
          toNumber(analysis?.roleScores?.road, 0) * 0.05
        ),
        0,
        15
      );
      const skillCourse = clamp(
        Math.round(
          toNumber(analysis?.indexes?.national, 0) * 0.05 +
          toNumber(analysis?.indexes?.local, 0) * 0.04 +
          (course >= 1 && course <= 4 ? 1 : 0)
        ),
        0,
        10
      );
      const surfaceAdaptation = hasSurfaceEvidence
        ? clamp(
            Math.round(
              toNumber(analysis?.indexes?.local, 0) * 0.03 +
              toNumber(venueFeature?.roughWater, 0) * 0.02
            ),
            0,
            5
          )
        : 0;
      const score = Math.round(clamp(
        startComparison +
        startStability +
        courseAdjacency +
        exhibitionFoot +
        holdRoad +
        skillCourse +
        surfaceAdaptation,
        0,
        100
      ));
      const grade = wallTheoryGrade(score);
      const clearStartLag =
        (
          hasExhibitionStComparison &&
          exhibitionSt - attackerExhibitionSt >= 0.06
        ) ||
        (
          hasCurrentStComparison &&
          currentSt.average - attackerCurrentSt.average >= 0.05
        ) ||
        (
          hasAverageStComparison &&
          avgSt - attackerAvgSt >= 0.05
        );
      const isBlocked = blockedBoats.has(boatNo);
      const isFormal =
        Boolean(mainScenario) &&
        Boolean(attackerCourse && attackerCourse >= 2) &&
        isAdjacent &&
        (hasStartEvidence || hasExhibitionEvidence);
      const isAdopted =
        isFormal &&
        !clearStartLag &&
        !isBlocked &&
        score >= 65;

      let status = "参考";
      if (isAdjacent && !isFormal) {
        status = "暫定";
      } else if (isBlocked && isAdjacent) {
        status = "展開除外";
      } else if (isAdjacent && clearStartLag) {
        status = "壁崩れ";
      } else if (isAdopted) {
        status = "壁成立";
      } else if (isFormal && score >= 55) {
        status = "互角・不安定";
      } else if (isFormal) {
        status = "不成立";
      }

      const reasons = [
        `攻め艇とのST比較${startComparison}/25`,
        `ST安定性${startStability}/15`,
        `展示進入・隣接${courseAdjacency}/15`,
        `展示・一周は9％枠へ分離`,
        `残し・回り足・道中${holdRoad}/15`,
        `技量・コース適性${skillCourse}/10`,
        `場・水面・風適応${surfaceAdaptation}/5`
      ];
      if (!isAdjacent) reasons.push("攻め艇の内側隣接艇ではない");
      if (!hasStartEvidence) reasons.push("ST比較の裏付け不足");
      if (clearStartLag) reasons.push("攻め艇より明確にSTが遅い");
      if (isBlocked) reasons.push("最有力展開で飛び候補");

      return {
        boatNo,
        playerName:
          analysis?.playerName || getPlayerName(entry),
        course,
        attackerNo,
        attackerCourse,
        wallCourse,
        isAdjacent,
        score,
        grade,
        status,
        isFormal,
        isAdopted,
        isBlocked,
        clearStartLag,
        hasStartEvidence,
        hasExhibitionEvidence,
        components: {
          startComparison,
          startStability,
          courseAdjacency,
          exhibitionFoot,
          holdRoad,
          skillCourse,
          surfaceAdaptation
        },
        reason: reasons.join(" / ")
      };
    });
    const ranking = [...roles].sort(
      (a, b) =>
        Number(b.isAdopted) - Number(a.isAdopted) ||
        Number(b.isAdjacent) - Number(a.isAdjacent) ||
        b.score - a.score ||
        a.course - b.course
    );
    const wallCandidate =
      roles.find((boat) => boat.isAdjacent) || null;
    const wallBoat =
      wallCandidate?.isAdopted
        ? wallCandidate.boatNo
        : null;

    return {
      attackerNo,
      attackerCourse,
      wallCourse,
      wallCandidateNo,
      wallBoat,
      state:
        wallCandidate?.status ||
        (attackerCourse === 1 ? "対象外" : "暫定"),
      score: wallCandidate?.score ?? null,
      grade: wallCandidate?.grade || "",
      scoreAdjustment:
        wallCandidate?.isAdopted
          ? -3
          : wallCandidate?.clearStartLag
            ? 3
            : 0,
      adjustmentApplied: false,
      isFormal: wallCandidate?.isFormal === true,
      isProvisional:
        !wallCandidate || wallCandidate.isFormal !== true,
      ranking,
      roles,
      adoptedBoats: wallBoat ? [wallBoat] : [],
      scenarioType: mainScenario?.type || "",
      scenarioLabel: mainScenario?.label || "",
      source: "ai-core-wall-theory-v1"
    };
  }

  function calcRaceFlowIndex(boat, entries, venueFeature, data) {
  const boatNo = getBoatNo(boat);
  const courseMapping = buildOfficialCourseMapping(entries);
  const scoringCourse = courseMapping.courseOfBoat(boatNo);

  /* ===============================
    自艇の基本指数
  =============================== */

  const stIndex = calcStIndex(
    boat,
    entries,
    data
  );
  const localIndex = calcLocalIndex(boat);
  const turnIndex = calcTurnIndex(boat);
  const attackIndex = calcAttackIndex(
    boat,
    entries,
    venueFeature,
    data
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

  /* ===============================
    各コース艇を取得
  =============================== */

  const boat1 = courseMapping.entryAtCourse(1);
  const boat2 = courseMapping.entryAtCourse(2);
  const boat3 = courseMapping.entryAtCourse(3);
  const boat4 = courseMapping.entryAtCourse(4);
  const boat5 = courseMapping.entryAtCourse(5);
  const boat6 = courseMapping.entryAtCourse(6);

  /*
    3攻め・4カド成立はレース全体で共通の条件なので、
    現在評価中の自艇ではなく各コース占有艇の攻め指数を使う。
  */
  const courseThreeAttackIndex = boat3
    ? calcAttackIndex(
        boat3,
        entries,
        venueFeature,
        data
      )
    : 50;
  const courseFourAttackIndex = boat4
    ? calcAttackIndex(
        boat4,
        entries,
        venueFeature,
        data
      )
    : 50;

  /* ===============================
    各艇のST指数
  =============================== */

  const st1 = boat1
    ? calcStIndex(boat1, entries, data)
    : 50;

  const st2 = boat2
    ? calcStIndex(boat2, entries, data)
    : 50;

  const st3 = boat3
    ? calcStIndex(boat3, entries, data)
    : 50;

  const st4 = boat4
    ? calcStIndex(boat4, entries, data)
    : 50;

  const st5 = boat5
    ? calcStIndex(boat5, entries, data)
    : 50;

  const st6 = boat6
    ? calcStIndex(boat6, entries, data)
    : 50;

  /* ===============================
    各艇の展示指数
  =============================== */

  /* ===============================
    最初に基本展開点を作る
  =============================== */

  let score = 20;

  score += turnIndex * 0.16;
  score += localIndex * 0.12;
  score += stIndex * 0.14;
  score += 6.5;
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

  const hasInnerComparison =
    hasSt1 && hasSt2 && hasSt3;

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

  const threeCanAttack =
    hasInnerComparison &&
    threeHasStAttack &&
    courseThreeAttackIndex >= 66;

  /*
    4カドも3号艇との実データ比較を必須にする。
  */
  const fourHasStAttack =
    hasSt3 &&
    hasSt4 &&
    st4 >= 67 &&
    st4 >= st3 + 4;

  const fourCanAttack =
    fourHasStAttack &&
    courseFourAttackIndex >= 67;

  /*
    5号艇は3・4の攻めに乗れる時だけ展開を上げる。
    5自身にもSTまたは展示の実データが必要。
  */
  const fiveHasOwnEvidence =
    hasSt5 && st5 >= 67;

  const fiveCanMakuriSashi =
    fiveHasOwnEvidence &&
    (threeCanAttack || fourCanAttack);

  /*
    6号艇は頭評価ではなく、道中の2・3着拾い。
    実データと当地・道中の両方を必要とする。
  */
  const sixHasOwnEvidence =
    hasSt6 && st6 >= 67;

  const sixCanPickup =
    sixHasOwnEvidence &&
    localIndex >= 65 &&
    turnIndex >= 65;

  /* ===============================
    1号艇の逃げ・残し
  =============================== */

  if (oneCanEscape) {
    if (scoringCourse === 1) score += 16;
    if (scoringCourse === 2) score += 7;
    if (scoringCourse === 3) score += 4;
    if (scoringCourse === 4) score += 2;
    } else {
    if (scoringCourse === 1) {
      score -= oneHasClearCollapse ? 5 : 0;
    }

    if (scoringCourse === 2) score += 5;
    if (scoringCourse === 3) score += 5;
    if (scoringCourse === 4) score += 3;
  }

  /* ===============================
    2号艇の差し

    2コース差し・残しを切らない
  =============================== */

  if (twoCanSashi) {
    if (scoringCourse === 2) score += 12;
    if (scoringCourse === 1) score += 5;
    if (scoringCourse === 3) score += 3;
  } else {
    if (scoringCourse === 2) score += 3;
  }

  /* ===============================
    3号艇が攻める展開

    3が攻める
    →1・2が残る
    →4は攻め場が狭くなる
    →5にまくり差し場
  =============================== */

  if (threeCanAttack) {
    if (scoringCourse === 3) score += 13;
    if (scoringCourse === 1) score += 6;
    if (scoringCourse === 2) score += 5;
    if (scoringCourse === 4) score -= 5;
    if (scoringCourse === 5) score += 9;
    if (scoringCourse === 6) score += 3;
  }

  /* ===============================
    4号艇のカド攻め

    3が強く攻める時は、
    4の攻め場を下げる
  =============================== */

  if (fourCanAttack && !threeCanAttack) {
    if (scoringCourse === 4) score += 13;
    if (scoringCourse === 1) score += 5;
    if (scoringCourse === 2) score += 3;
    if (scoringCourse === 5) score += 8;
    if (scoringCourse === 6) score += 4;
  }

  if (fourCanAttack && threeCanAttack) {
    if (scoringCourse === 4) score += 2;
  }

  /* ===============================
    5号艇のまくり差し・展開拾い
  =============================== */

  if (fiveCanMakuriSashi) {
    if (scoringCourse === 5) score += 12;
    if (scoringCourse === 1) score += 4;
    if (scoringCourse === 3) score += 3;
    if (scoringCourse === 4) score += 2;
  } else if (scoringCourse === 5) {
    score -= 5;
  }

  /* ===============================
    6号艇の最内差し・道中拾い

    頭評価より、2・3着候補として加点
  =============================== */

  if (sixCanPickup) {
    if (scoringCourse === 6) score += 9;
  } else if (scoringCourse === 6) {
    score -= 7;
  }

  /* ===============================
    コース別の基本
  =============================== */

  if (scoringCourse === 1) {
    score += venueFeature.inPower * 0.16;
  }

  if (scoringCourse === 2) {
    score += venueFeature.sashi * 0.16;
    score += 5;
  }

  if (scoringCourse === 3) {
    score += venueFeature.makuri * 0.14;
  }

  if (scoringCourse === 4) {
    score += venueFeature.kado * 0.14;
    score += venueFeature.makuriSashi * 0.08;
  }

  if (scoringCourse === 5) {
    score += venueFeature.outside * 0.10;
    score += venueFeature.makuriSashi * 0.12;
  }

  if (scoringCourse === 6) {
    score += venueFeature.outside * 0.08;
  }

  /* ===============================
    荒水面補正
  =============================== */

  if (wind >= 5 || wave >= 5) {
    score += venueFeature.roughWater * 0.08;

    if (scoringCourse === 1) score -= 4;
    if (scoringCourse === 2) score += 2;
    if (scoringCourse === 4) score += 4;
    if (scoringCourse === 5) score += 5;
    if (scoringCourse === 6) score += 4;

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
    if (turnIndex >= 72) score += 3;
  }

  return clamp(
    round(score),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  );
}

  function calcTotalIndex(indexes, weights) {

  const exhibitionWeight = 0.09;
  const flowWeight =
    weights.raceFlow +
    Math.max(
      0,
      weights.exhibition - exhibitionWeight
    );

  let total =
    indexes.st * weights.st +
    indexes.exhibition * exhibitionWeight +
    indexes.motor * weights.motor +
    indexes.local * weights.local +
    indexes.national * weights.national +
    indexes.attack * weights.attack +
    indexes.raceFlow * flowWeight +
    indexes.turn * weights.turn;

  // STが非常に良い
  if (indexes.st >= 90) total += 4;
  else if (indexes.st >= 80) total += 2;

  // 攻め指数
  if (indexes.attack >= 85) total += 3;

  // 展開指数
  if (indexes.raceFlow >= 85) total += 3;

  // 当地巧者
  if (indexes.local >= 85) total += 2;

  // モーターが極端に悪い
  if (indexes.motor <= 35) total -= 2;

  return clamp(
    round(total),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  );
}
    /* ===============================
    スリットAI
  =============================== */

  function buildSlitAnalysis(
    entries,
    venueFeature,
    data
  ) {
    const courseMapping = buildOfficialCourseMapping(entries);
    const list = entries.map((boat, index) => {

      const boatNo = getBoatNo(boat);
      const avgSt = getOptionalAverageSt(boat);
      const exSt = getOptionalExhibitionSt(boat);
      const currentSt = getCurrentSeriesSt(boat);
      const course = courseMapping.courseOfBoat(
        boatNo || index + 1
      );

      const stTheory =
        buildStFoundationEvaluation(
          boat,
          entries,
          data
        );
      const stIndex =
        stTheory.appliedIndex;
      const slitScore = stIndex;

      return {
        boatNo,
        course,
        name: getPlayerName(boat),
        avgSt,
        exSt,
        currentStAverage: currentSt.average,
        currentStCount: currentSt.count,
        currentStSpread: currentSt.spread,
        stIndex,
        stTheory,
        slitScore: round(slitScore)
      };

    });

    list.sort((a, b) => b.slitScore - a.slitScore);

    list.forEach((boat, index) => {
      boat.slitRank = index + 1;
    });

    const courseOrder = [...list]
      .sort((a, b) => a.course - b.course);

    courseOrder.forEach((boat, index) => {
      const neighbors = [
        courseOrder[index - 1],
        courseOrder[index + 1]
      ].filter(
        (neighbor) =>
          neighbor &&
          boat.exSt !== null &&
          neighbor.exSt !== null
      );

      const fastEdges = neighbors.map((neighbor) => ({
        boatNo: neighbor.boatNo,
        course: neighbor.course,
        diff: round(neighbor.exSt - boat.exSt, 3)
      }));

      const slowEdges = neighbors.map((neighbor) => ({
        boatNo: neighbor.boatNo,
        course: neighbor.course,
        diff: round(boat.exSt - neighbor.exSt, 3)
      }));

      const fastestEdge = [...fastEdges]
        .sort((a, b) => b.diff - a.diff)[0] || null;
      const slowestEdge = [...slowEdges]
        .sort((a, b) => b.diff - a.diff)[0] || null;

      boat.slitDiff = Math.max(0, fastestEdge?.diff || 0);
      boat.slitLossDiff = Math.max(0, slowestEdge?.diff || 0);
      boat.comparedBoatNo = fastestEdge?.boatNo || null;
      boat.delayedByBoatNo = slowestEdge?.boatNo || null;
      const formalSlit =
        hasFormalStartCourseMapping(
          entries
        ) &&
        courseOrder.length === 6 &&
        courseOrder.every(
          item => item.exSt !== null
        );
      boat.slitLevel =
        boat.slitDiff >= 0.10
          ? "明確な攻め警報"
          : boat.slitDiff >= 0.05
            ? "攻め優勢候補"
            : boat.slitLossDiff >= 0.10
              ? "明確なスリット後手"
              : boat.slitLossDiff >= 0.05
                ? "壁・残し不安"
                : "互角";
      boat.slitAlert =
        formalSlit &&
        boat.slitDiff >= 0.10;
      boat.slitAdvantage =
        formalSlit &&
        boat.slitDiff >= 0.05 &&
        boat.slitDiff < 0.10;
      boat.slitRisk =
        formalSlit &&
        boat.slitLossDiff >= 0.10;
      boat.slitConcern =
        formalSlit &&
        boat.slitLossDiff >= 0.05 &&
        boat.slitLossDiff < 0.10;
      boat.isFormalSlit = formalSlit;

      const supportSt =
        boat.currentStCount >= 2
          ? boat.currentStAverage
          : boat.avgSt;

      boat.hasStartSupport =
        boat.currentStCount >= 2 ||
        boat.avgSt !== null;
      boat.isStableBoat =
        boat.hasStartSupport &&
        supportSt !== null &&
        supportSt <= 0.16 &&
        (
          boat.currentStCount < 2 ||
          boat.currentStSpread <= 0.05
        );
      boat.isAttackBoat =
        boat.slitAlert &&
        boat.stTheory.isFormal &&
        (
          boat.stTheory.fCount === null ||
          boat.stTheory.fCount <= 0 ||
          boat.currentStCount >= 2
        );
      boat.isDelayedBoat = boat.slitRisk;
      boat.isWallBoat = !boat.slitRisk && boat.isStableBoat;
      boat.slitComment =
        !formalSlit
          ? "展示STまたは実進入不足のため暫定"
          : boat.slitAlert
            ? `隣艇より展示STで${boat.slitDiff.toFixed(2)}速い`
            : boat.slitAdvantage
              ? `隣艇より展示STで${boat.slitDiff.toFixed(2)}速い攻め優勢候補`
              : boat.slitRisk
                ? `隣艇より展示STで${boat.slitLossDiff.toFixed(2)}遅い`
                : boat.slitConcern
                  ? `隣艇より展示STで${boat.slitLossDiff.toFixed(2)}遅い壁・残し不安`
                  : "";
    });

    const alerts = [...list]
      .filter(
        (boat) =>
          boat.slitAlert &&
          boat.isAttackBoat
      )
      .sort((a, b) =>
        b.slitDiff - a.slitDiff ||
        b.slitScore - a.slitScore
      );

    const risks = [...list]
      .filter((boat) => boat.slitRisk)
      .sort((a, b) => b.slitLossDiff - a.slitLossDiff);

    const advantages = [...list]
      .filter((boat) => boat.slitAdvantage)
      .sort((a, b) =>
        b.slitDiff - a.slitDiff ||
        b.slitScore - a.slitScore
      );

    const concerns = [...list]
      .filter((boat) => boat.slitConcern)
      .sort(
        (a, b) =>
          b.slitLossDiff -
          a.slitLossDiff
      );

    const attackBoat = alerts[0] || null;
    const secondBoat = alerts[1] || null;

    return {

      ranking: list,

      alerts,

      risks,

      advantages,

      concerns,

      attackBoat:
        attackBoat
          ? attackBoat.boatNo
          : null,

      secondBoat:
        secondBoat
          ? secondBoat.boatNo
          : null,

      threshold: 0.10,

      secondaryThreshold: 0.05,

      isFormal:
        list.length === 6 &&
        list.every(
          boat => boat.isFormalSlit
        ),

      source: "neighbor-exhibition-st"

    };

  }

  /* ===============================
    ダブルタイム理論
  =============================== */

  function buildDoubleTime(entries, analyses = []) {

    const courseMapping =
      buildOfficialCourseMapping(entries);

    const analysisByBoat = new Map(
      (Array.isArray(analyses) ? analyses : [])
        .map((boat) => [Number(boat?.boatNo || 0), boat])
        .filter(([boatNo]) => boatNo >= 1 && boatNo <= 6)
    );

    const list = entries.map((boat) => {

      const exTime = getExhibitionTime(boat);
      const lapTime = getLapTime(boat);

      return {

        boatNo: getBoatNo(boat),

        name: getPlayerName(boat),

        exhibitionTime: exTime,

        lapTime,

        totalTime:
          exTime > 0 && lapTime > 0
            ? round(exTime + lapTime, 2)
            : null

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
      .filter(v => v.totalTime !== null)
      .sort((a, b) => a.totalTime - b.totalTime);

    totalRanking.forEach((v, i) => {
      v.doubleRank = i + 1;
    });

    const exhibitionTop = exhibitionRanking[0] || null;
    const exhibitionSecond = exhibitionRanking[1] || null;
    const lapTop = lapRanking[0] || null;
    const lapSecond = lapRanking[1] || null;
    const sameTop = Boolean(
      exhibitionTop &&
      lapTop &&
      exhibitionTop.boatNo === lapTop.boatNo
    );

    const exhibitionGap = sameTop && exhibitionSecond
      ? Math.max(
          0,
          exhibitionSecond.exhibitionTime -
            exhibitionTop.exhibitionTime
        )
      : 0;

    const lapGap = sameTop && lapSecond
      ? Math.max(0, lapSecond.lapTime - lapTop.lapTime)
      : 0;

    const confidence = sameTop
      ? clamp(
          70 +
          Math.min(15, Math.round(exhibitionGap * 150)) +
          Math.min(15, Math.round(lapGap * 75)),
          70,
          100
        )
      : 0;

    const topBoatNo = sameTop
      ? exhibitionTop.boatNo
      : null;
    const topCourse = topBoatNo
      ? courseMapping.courseOfBoat(topBoatNo)
      : null;
    const topAnalysis = topBoatNo
      ? analysisByBoat.get(topBoatNo) || null
      : null;
    const isOuterTarget = Boolean(
      topCourse >= 4 && topCourse <= 6
    );

    let linkRole = "";
    let linkScore = 0;

    if (topCourse === 4) {
      linkRole = "攻め";
      linkScore = round(
        toNumber(topAnalysis?.roleScores?.attack, 0) * 0.45 +
        toNumber(topAnalysis?.roleScores?.flow, 0) * 0.35 +
        toNumber(topAnalysis?.indexes?.total, 0) * 0.20
      );
    } else if (topCourse === 5 || topCourse === 6) {
      linkRole = "拾い";
      linkScore = round(
        toNumber(topAnalysis?.roleScores?.pickup, 0) * 0.45 +
        toNumber(topAnalysis?.roleScores?.road, 0) * 0.35 +
        toNumber(topAnalysis?.roleScores?.flow, 0) * 0.20
      );
    }

    const isLinkable = Boolean(
      isOuterTarget &&
      topAnalysis &&
      linkScore >= 60
    );
    /*
      Ver2ではダブルタイムを展示・足100点内へ統合する。
      展開・役割・着順候補への別枠加点は行わない。
    */
    const isActionable = false;
    const scoreAdjustment = 0;

    totalRanking.forEach((boat) => {
      const isTop = sameTop && boat.boatNo === topBoatNo;

      boat.doubleAlert = isTop;
      boat.confidence = isTop ? confidence : 0;
      boat.isOuterTarget = isTop && isOuterTarget;
      boat.isLinkable = isTop && isLinkable;
      boat.isActionable = isTop && isActionable;
      boat.linkRole = isTop ? linkRole : "";
      boat.linkScore = isTop ? linkScore : 0;
      boat.scoreAdjustment = isTop ? scoreAdjustment : 0;
      boat.comment = isTop
        ? (
            isActionable
              ? `ダブルタイム発動・${linkRole}へ反映`
              : isOuterTarget
                ? "ダブルタイム成立・連絡み条件は未成立"
                : "ダブルタイム成立・内枠は気配情報のみ"
          )
        : "";
    });

    return {

      ranking: totalRanking,

      exhibitionTop,

      lapTop,

      isDouble: sameTop,

      topBoat: topBoatNo,

      activeBoat: sameTop ? topBoatNo : null,

      confidence,

      exhibitionGap: round(exhibitionGap, 3),

      lapGap: round(lapGap, 3),

      isOuterTarget,

      isLinkable,

      isActionable,

      linkRole,

      linkScore,

      scoreAdjustment

    };

  }

  /* ===============================
    新サム理論
  =============================== */

  function buildNewSam(entries, analyses = []) {

    const courseMapping =
      buildOfficialCourseMapping(entries);

    const analysisByBoat = new Map(
      (Array.isArray(analyses) ? analyses : []).map((boat) => [
        Number(boat?.boatNo),
        boat
      ])
    );

    const list = (Array.isArray(entries) ? entries : [])
      .map((boat) => {
        const boatNo = getBoatNo(boat);
        const exhibitionTime = getExhibitionTime(boat);
        const lapTime = getLapTime(boat);

        if (
          boatNo < 1 ||
          boatNo > 6 ||
          exhibitionTime <= 0 ||
          lapTime <= 0
        ) {
          return null;
        }

        return {
          boatNo,
          course:
            courseMapping.courseOfBoat(boatNo),
          name: getPlayerName(boat),
          exhibitionTime,
          lapTime,
          sum: round(exhibitionTime + lapTime, 3)
        };
      })
      .filter(Boolean);

    const validBoatNos = new Set(list.map((boat) => boat.boatNo));
    const missingBoatNos = [1, 2, 3, 4, 5, 6]
      .filter((boatNo) => !validBoatNos.has(boatNo));
    const isFormal = list.length === 6 && missingBoatNos.length === 0;
    const avg = list.length
      ? average(list.map((boat) => boat.sum))
      : 0;

    function gradeOf(diff) {
      if (diff >= 0.300) return "S";
      if (diff >= 0.200) return "A";
      if (diff >= 0.150) return "B";
      if (diff >= 0) return "C";
      return "D";
    }

    function roleOf(course, analysis) {
      const roleScores = analysis?.roleScores || {};
      const indexes = analysis?.indexes || {};
      let role = "";
      let roleScore = 0;

      if (course === 1) {
        role = "逃げ・残し";
        roleScore = round(
          toNumber(roleScores.flow, 0) * 0.45 +
          toNumber(roleScores.hold, 0) * 0.35 +
          toNumber(indexes.total, 0) * 0.20
        );
      } else if (course === 2) {
        role = "差し・残し";
        roleScore = round(
          toNumber(roleScores.attack, 0) * 0.35 +
          toNumber(roleScores.hold, 0) * 0.35 +
          toNumber(roleScores.flow, 0) * 0.20 +
          toNumber(indexes.total, 0) * 0.10
        );
      } else if (course === 3 || course === 4) {
        role = "攻め";
        roleScore = round(
          toNumber(roleScores.attack, 0) * 0.45 +
          toNumber(roleScores.flow, 0) * 0.35 +
          toNumber(indexes.total, 0) * 0.20
        );
      } else {
        role = "拾い";
        roleScore = round(
          toNumber(roleScores.pickup, 0) * 0.45 +
          toNumber(roleScores.road, 0) * 0.35 +
          toNumber(roleScores.flow, 0) * 0.20
        );
      }

      return { role, roleScore };
    }

    list.forEach((boat) => {
      const analysis = analysisByBoat.get(boat.boatNo) || null;
      const diff = round(avg - boat.sum, 3);
      const grade = gradeOf(diff);
      const { role, roleScore } = roleOf(boat.course, analysis);
      const isRoleAligned = Boolean(analysis && roleScore >= 60);
      /*
        新サムは展示・足100点の20点枠へ統合済み。
        展開・役割・着順候補へ追加点を付けない。
      */
      const scoreAdjustment = 0;

      boat.diff = diff;
      boat.grade = grade;
      boat.samAlert =
        isFormal &&
        ["S", "A", "B"].includes(grade);
      boat.isFormal = isFormal;
      boat.role = role;
      boat.roleScore = roleScore;
      boat.isRoleAligned = isRoleAligned;
      boat.isActionable = false;
      boat.scoreAdjustment = scoreAdjustment;
      boat.comment = !isFormal
        ? "6艇データ不足のため参考表示のみ"
        : ["S", "A", "B"].includes(grade)
          ? `新サム${grade}評価・展示足100点へ統合`
          : grade === "C"
            ? "新サムC評価・表示のみ"
            : grade === "D"
              ? "新サムD評価・採用なし"
              : `${role}の裏付け不足のため表示のみ`;
    });

    list.sort((a, b) => b.diff - a.diff || a.boatNo - b.boatNo);
    list.forEach((boat, index) => {
      boat.rank = index + 1;
    });

    const activeBoats = list
      .filter((boat) => boat.samAlert)
      .map((boat) => boat.boatNo);

    return {
      ranking: list,
      average: round(avg, 3),
      isFormal,
      missingBoatNos,
      activeBoats,
      topBoat:
        isFormal && list.length && list[0].diff >= 0
          ? list[0].boatNo
          : null
    };

  }

  /* ===============================
    艇別AI解析
  =============================== */

  function buildBoatAnalysis(boat, entries, data) {

    const venueFeature = getVenueFeature(data);
    const weights = getWeights(data);
    const stTheory =
      buildStFoundationEvaluation(
        boat,
        entries,
        data
      );
    const exhibitionPerformanceTheory =
      buildExhibitionPerformanceEvaluation(
        entries,
        data
      );
    const exhibitionPerformanceRole =
      exhibitionPerformanceTheory.roles.find(
        (item) =>
          item.boatNo === getBoatNo(boat)
      ) || null;

    const indexes = {

      st: stTheory.appliedIndex,

      exhibition:
        exhibitionPerformanceRole?.appliedIndex ??
        50,

      motor: calcMotorIndex(
        boat,
        data
      ),

      local: calcLocalIndex(boat),

      national: calcNationalIndex(boat),

      attack: calcAttackIndex(
        boat,
        entries,
        venueFeature,
        data
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
const scoringCourse =
  buildOfficialCourseMapping(entries)
    .courseOfBoat(boatNo);

const roleScores = {
  attack: clamp(
    round(
      indexes.attack * 0.42 +
      indexes.st * 0.30 +
      indexes.raceFlow * 0.10 +
      9
    ),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  ),

  flow: clamp(
    round(
      indexes.raceFlow * 0.42 +
      indexes.attack * 0.20 +
      indexes.turn * 0.18 +
      indexes.local * 0.08 +
      6
    ),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  ),

  road: clamp(
    round(
      indexes.turn * 0.42 +
      indexes.local * 0.23 +
      indexes.national * 0.18 +
      indexes.motor * 0.07 +
      5
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
      (scoringCourse === 1 ? 10 : 0) +
      (scoringCourse === 2 ? 7 : 0) +
      (scoringCourse === 4 ? 3 : 0)
    ),
    INDEX_LIMIT.min,
    INDEX_LIMIT.max
  ),

  pickup: clamp(
    round(
      indexes.turn * 0.30 +
      indexes.raceFlow * 0.26 +
      indexes.local * 0.20 +
      indexes.national * 0.12 +
      6 +
      (scoringCourse >= 5 ? 7 : 0)
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

/*
  外枠が頭候補になるには、
  展開・攻めに加えてSTか展示の強い裏付けを必須にする。
*/
const hasOuterHeadEvidence =
  scoringCourse >= 5 &&
  indexes.raceFlow >= 80 &&
  roleScores.flow >= 78 &&
  roleScores.attack >= 74 &&
  indexes.st >= 72;

/*
  既存予想との互換基準。
  ここでは別加点せず、コース24％枠へ統合する基準値にだけ使う。
*/
let legacyCourseOffset = 0;

if (scoringCourse === 1) {
  legacyCourseOffset = 9;

  if (indexes.raceFlow <= 48) {
    legacyCourseOffset = 3;
  }
}

if (scoringCourse === 2) {
  legacyCourseOffset = 5;
}

if (scoringCourse === 3) {
  legacyCourseOffset = 2;
}

if (scoringCourse === 4) {
  legacyCourseOffset = 1;
}

if (scoringCourse === 5) {
  legacyCourseOffset =
    hasOuterHeadEvidence ? -2 : -9;
}

if (scoringCourse === 6) {
  legacyCourseOffset =
    hasOuterHeadEvidence ? -5 : -14;
}

const courseStructureTheory =
  buildCourseStructureEvaluation(
    boat,
    entries,
    data,
    {
      legacyAdjustment:
        legacyCourseOffset
    }
  );
const courseIndex =
  courseStructureTheory.appliedIndex;

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
    indexes.motor * 0.005
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

courseStructureTheory,

stTheory,

exhibitionPerformanceTheory:
  exhibitionPerformanceRole,

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

  const attackTheory =
    buildAttackTheory(entries, analyses, data);

  const attackTheoryByBoat = new Map(
    attackTheory.roles.map((boat) => [boat.boatNo, boat])
  );

  analyses.forEach((boat) => {
    boat.attackTheory =
      attackTheoryByBoat.get(Number(boat.boatNo)) || null;
  });

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
    (boat) =>
      boat.attackTheory?.isAttackCourse
        ? boat.attackTheory.score
        : -1
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
  残し・拾い理論 Ver2

  最有力展開・実進入・壁判定を受け取り、
  2着残しと3着拾いを独立した100点で確定する。

  ST・展示・当地・技量・モーターはここで再加点しない。
=============================== */

function holdPickupGrade(score) {
  if (score >= 85) return "S";
  if (score >= 75) return "A";
  if (score >= 65) return "B";
  if (score >= 55) return "C";
  return "D";
}

function buildHoldPickupTheory(
  entries,
  analyses,
  scenario,
  wallTheory,
  options = {}
) {
  const sourceEntries = Array.isArray(entries) ? entries : [];
  const sourceAnalyses = Array.isArray(analyses) ? analyses : [];
  const courseMapping = buildOfficialCourseMapping(sourceEntries);
  const scenarioType = scenario?.type || "";
  const scenarioLabel = scenario?.label || "";
  const courseRows = sourceEntries
    .map((entry) => {
      const boatNo = getBoatNo(entry);

      return {
        boatNo,
        course: courseMapping.courseOfBoat(boatNo),
        entry
      };
    })
    .filter(
      (row) =>
        row.boatNo >= 1 &&
        row.boatNo <= 6 &&
        row.course >= 1 &&
        row.course <= 6
    );
  const courseByBoat = new Map(
    courseRows.map((row) => [row.boatNo, row.course])
  );
  const boatByCourse = new Map(
    courseRows.map((row) => [row.course, row.boatNo])
  );
  const scenarioAttackerCourse =
    Number(
      options.attackerCourse ??
      scenario?.attackerCourse ??
      scenario?.attacker ??
      0
    ) || null;
  const attackerBoatNo =
    Number(
      options.attackerBoatNo ??
      scenario?.attackerBoatNo ??
      scenario?.headBoatNo ??
      boatByCourse.get(scenarioAttackerCourse) ??
      scenario?.attacker ??
      0
    ) || null;
  const hasExplicitBlockedBoats =
    Array.isArray(options.blockedBoats);
  const blockedCoursesOrBoats =
    hasExplicitBlockedBoats
      ? options.blockedBoats
      : scenario?.blockedBoats || [];
  const blockedBoats = new Set(
    blockedCoursesOrBoats
      .map((courseOrBoat) => {
        const value = Number(courseOrBoat);
        return hasExplicitBlockedBoats
          ? value
          : boatByCourse.get(value) || value;
      })
      .filter(Boolean)
  );
  const completeRace =
    sourceEntries.length === 6 &&
    sourceAnalyses.length === 6 &&
    courseRows.length === 6 &&
    new Set(courseRows.map((row) => row.boatNo)).size === 6 &&
    new Set(courseRows.map((row) => row.course)).size === 6;
  const mappingFormal =
    courseMapping.formal;
  const wallBoat = Number(wallTheory?.wallBoat || 0) || null;
  const wallCandidateNo =
    Number(wallTheory?.wallCandidateNo || 0) || null;
  const wallState = wallTheory?.state || "暫定";
  const preservedHoldCourses = new Set(
    (
      Array.isArray(options?.preservations)
        ? options.preservations
        : []
    )
      .filter(
        (preservation) =>
          preservation?.qualified === true &&
          (preservation?.roles || []).includes("hold") &&
          (preservation?.eligiblePositions || []).includes(2)
      )
      .map((preservation) =>
        Number(preservation?.course || 0)
      )
      .filter((course) => course >= 1 && course <= 6)
  );
  const withPreservedCourses = (
    baseCourses,
    preservedCourses
  ) => [
    ...new Set([
      ...baseCourses,
      ...preservedCourses
    ])
  ];

  const scenarioCourses = {
    escape: {
      hold: [2, 3, 4],
      pickup: [3, 4, 5, 6]
    },
    sashi: {
      hold: [1, 3, 4],
      pickup: [3, 4, 5, 6]
    },
    threeAttack: {
      hold: withPreservedCourses(
        [1, 2],
        preservedHoldCourses
      ),
      pickup: [5, 6]
    },
    fourAttack: {
      hold: [1, 3, 5],
      pickup: [2, 5, 6]
    }
  };

  const holdPositionPoints = {
    escape: { 2: 25, 3: 21, 4: 18 },
    sashi: { 1: 25, 3: 20, 4: 18 },
    threeAttack: Object.fromEntries(
      withPreservedCourses(
        [1, 2],
        preservedHoldCourses
      ).map((course) => [
        course,
        ({ 1: 25, 2: 20 })[course] || 18
      ])
    ),
    fourAttack: { 1: 22, 3: 25, 5: 20 }
  };
  const pickupPositionPoints = {
    escape: { 3: 25, 4: 23, 5: 20, 6: 17 },
    sashi: { 3: 25, 4: 23, 5: 20, 6: 17 },
    threeAttack: { 5: 25, 6: 20 },
    fourAttack: { 2: 18, 5: 25, 6: 22 }
  };
  const holdPathPoints = {
    1: 10,
    2: 10,
    3: 8,
    4: 8,
    5: 6,
    6: 4
  };
  const pickupPathPoints = {
    1: 4,
    2: 8,
    3: 7,
    4: 8,
    5: 10,
    6: 10
  };

  function wallHoldPoints(boatNo, course) {
    if (boatNo === wallBoat) return 20;
    if (
      boatNo === wallCandidateNo &&
      wallState === "壁崩れ"
    ) {
      return 0;
    }
    if (
      scenarioAttackerCourse &&
      course < scenarioAttackerCourse
    ) {
      return course <= 2 ? 15 : 12;
    }
    if (course === 4) return 8;
    if (
      scenarioType === "fourAttack" &&
      course === 5
    ) {
      return 20;
    }
    return 0;
  }

  function wallPickupPoints(course) {
    if (!scenarioAttackerCourse) return 0;
    if (course === scenarioAttackerCourse + 1) return 20;
    if (course > scenarioAttackerCourse) {
      return course === 6 ? 15 : 12;
    }
    if (
      scenarioType === "fourAttack" &&
      course === 2
    ) {
      return 10;
    }
    return 0;
  }

  function buildRoleScore(boatNo, role) {
    const course = courseByBoat.get(boatNo) || boatNo;
    const allowedCourses =
      scenarioCourses[scenarioType]?.[role] || [];
    const isScenarioMatch = allowedCourses.includes(course);
    const isAttackSource = boatNo === attackerBoatNo;
    const isBlocked = blockedBoats.has(boatNo);

    if (
      !scenarioType ||
      !completeRace
    ) {
      return {
        score: 50,
        grade: "D",
        status: "暫定",
        isFormal: false,
        isAdopted: false,
        isReference: false,
        components:
          role === "hold"
            ? {
                scenarioMatch: 0,
                positionRelation: 0,
                wallRoute: 0,
                firstMarkRoute: 0,
                dataReliability: 0
              }
            : {
                scenarioLink: 0,
                openWater: 0,
                positionRelation: 0,
                backstretchRoute: 0,
                dataReliability: 0
              },
        reason: "展開または6艇の進入関係が不足し、中立50点で暫定"
      };
    }

    if (isAttackSource || isBlocked || !isScenarioMatch) {
      const exclusionReason = isAttackSource
        ? "1着中心艇のため2・3着候補から除外"
        : isBlocked
          ? "最有力展開で攻め場を失うため除外"
          : `最有力展開の${role === "hold" ? "残し" : "拾い"}経路なし`;

      return {
        score: 1,
        grade: "D",
        status: "不成立",
        isFormal: true,
        isAdopted: false,
        isReference: false,
        components:
          role === "hold"
            ? {
                scenarioMatch: 0,
                positionRelation: 0,
                wallRoute: 0,
                firstMarkRoute: 0,
                dataReliability: mappingFormal ? 5 : 0
              }
            : {
                scenarioLink: 0,
                openWater: 0,
                positionRelation: 0,
                backstretchRoute: 0,
                dataReliability: mappingFormal ? 5 : 0
              },
        reason: exclusionReason
      };
    }

    const dataReliability = mappingFormal ? 5 : 0;
    let components;

    if (role === "hold") {
      components = {
        scenarioMatch: 40,
        positionRelation:
          holdPositionPoints[scenarioType]?.[course] || 0,
        wallRoute: wallHoldPoints(boatNo, course),
        firstMarkRoute: holdPathPoints[course] || 0,
        dataReliability
      };
    } else {
      components = {
        scenarioLink: 40,
        openWater: wallPickupPoints(course),
        positionRelation:
          pickupPositionPoints[scenarioType]?.[course] || 0,
        backstretchRoute: pickupPathPoints[course] || 0,
        dataReliability
      };
    }

    const score = round(
      clamp(
        Object.values(components)
          .reduce((sum, value) => sum + value, 0),
        0,
        100
      )
    );
    const isAdopted = score >= 65;
    const isReference = score >= 55 && score < 65;
    const status = isAdopted
      ? "正式採用"
      : isReference
        ? "参考"
        : "不成立";
    const reason = role === "hold"
      ? [
          `最有力展開一致${components.scenarioMatch}/40`,
          `実進入・位置関係${components.positionRelation}/25`,
          `壁・内側残存経路${components.wallRoute}/20`,
          `1マーク後の残し経路${components.firstMarkRoute}/10`,
          `取得信頼度${components.dataReliability}/5`
        ].join(" / ")
      : [
          `最有力展開連動${components.scenarioLink}/40`,
          `差し場・空き水面${components.openWater}/25`,
          `実進入・位置関係${components.positionRelation}/25`,
          `バック・2マーク到達${components.backstretchRoute}/15`,
          `取得信頼度${components.dataReliability}/5`
        ].join(" / ");

    return {
      score,
      grade: holdPickupGrade(score),
      status,
      isFormal: true,
      isAdopted,
      isReference,
      components,
      reason
    };
  }

  const roles = sourceAnalyses
    .map((analysis) => {
      const boatNo = Number(analysis?.boatNo || 0);
      const course = courseByBoat.get(boatNo) || boatNo;
      const hold = buildRoleScore(boatNo, "hold");
      const pickup = buildRoleScore(boatNo, "pickup");

      return {
        boatNo,
        playerName: analysis?.playerName || "",
        course,
        isAttackSource: boatNo === attackerBoatNo,
        isBlocked: blockedBoats.has(boatNo),
        hold,
        pickup,
        hasIndependentDualEvidence:
          hold.isAdopted &&
          pickup.isAdopted &&
          hold.reason !== pickup.reason
      };
    })
    .filter((boat) => boat.boatNo >= 1 && boat.boatNo <= 6);

  function rankRole(role, limit) {
    const ranked = roles
      .filter((boat) => boat[role].isAdopted)
      .sort(
        (a, b) =>
          b[role].score - a[role].score ||
          a.course - b.course
      )
      .slice(0, limit)
      .map((boat) => ({
        boatNo: boat.boatNo,
        playerName: boat.playerName,
        course: boat.course,
        score: boat[role].score,
        grade: boat[role].grade,
        status: boat[role].status,
        reason: boat[role].reason,
        components: boat[role].components
      }));

    ranked.forEach((boat, index) => {
      boat.rank = index + 1;
      boat.isEquivalentToPrevious =
        index > 0 &&
        Math.abs(
          boat.score - ranked[index - 1].score
        ) <= 2;
    });

    return ranked;
  }

  const secondCandidates = rankRole("hold", 3);
  const thirdCandidates = rankRole("pickup", 4);

  return {
    scenarioType,
    scenarioLabel,
    attackerBoatNo,
    attackerCourse: scenarioAttackerCourse,
    wallBoat,
    wallCandidateNo,
    wallState,
    mappingFormal,
    isFormal: Boolean(scenarioType) && completeRace,
    isProvisional: !scenarioType || !completeRace,
    secondCandidates,
    thirdCandidates,
    referenceHold: roles
      .filter((boat) => boat.hold.isReference)
      .map((boat) => boat.boatNo),
    referencePickup: roles
      .filter((boat) => boat.pickup.isReference)
      .map((boat) => boat.boatNo),
    roles,
    thresholds: {
      adopted: 65,
      reference: 55,
      equivalentDifference: 2,
      secondLimit: 3,
      thirdLimit: 4
    },
    weights: {
      hold: {
        scenarioMatch: 40,
        positionRelation: 25,
        wallRoute: 20,
        firstMarkRoute: 10,
        dataReliability: 5
      },
      pickup: {
        scenarioLink: 40,
        openWater: 25,
        positionRelation: 15,
        backstretchRoute: 15,
        dataReliability: 5
      }
    },
    source: "ai-core-hold-pickup-theory-v2"
  };
}

/* ===============================
  レース全体・展開シナリオ生成

  順位や買い目は作らない。
  6艇の関係から展開と着順候補を作る。
=============================== */

function buildRaceScenarios(
  analyses,
  data,
  options = {}
) {
  const list = Array.isArray(analyses)
    ? [...analyses]
    : [];

  const entries = getRaceEntries(data);
  const courseMapping = buildOfficialCourseMapping(entries);
  const oneNo = courseMapping.boatAtCourse(1);
  const twoNo = courseMapping.boatAtCourse(2);
  const threeNo = courseMapping.boatAtCourse(3);
  const fourNo = courseMapping.boatAtCourse(4);
  const venue = getVenueFeature(data);
  const slit = buildSlitAnalysis(
    entries,
    venue,
    data
  );
  const doubleTime = buildDoubleTime(entries, list);
  const newSam = buildNewSam(entries, list);

  /*
    場＋R別の枠別浮沈率。
    この工程では展開点・印・買い目へ加算せず、
    シナリオ判断に使える公式履歴の根拠として保持する。
  */
  const frameMovementSource =
    data?.historyContext?.venueRace?.trend
      ?.frameMovement || {};

  const frameMovement = Array.from(
    { length: 6 },
    (_, index) => {
      const boatNo = index + 1;
      const source =
        frameMovementSource[String(boatNo)] || {};
      const samples = toNumber(source.samples, 0);
      const usable = samples >= 30;
      const hasBaseline =
        typeof source.hasBaseline === "boolean"
          ? source.hasBaseline
          : Boolean(
              !isNil(source.baselineRiseRate) &&
              !isNil(source.baselineSinkRate)
            );
      const movementDelta = hasBaseline
        ? toNumber(
            source.movementDelta,
            (
              toNumber(source.riseRate, 0) -
              toNumber(source.sinkRate, 0)
            ) - (
              toNumber(
                source.baselineRiseRate,
                0
              ) -
              toNumber(
                source.baselineSinkRate,
                0
              )
            )
          )
        : 0;

      /*
        枠ごとの全国基準との差だけを使う。
        生の浮上率は枠番による構造差が大きいため、
        そのまま比較・加点しない。
      */
      let scoreAdjustment = 0;

      if (
        usable &&
        hasBaseline &&
        Math.abs(movementDelta) >= 5
      ) {
        const sampleWeight =
          samples >= 120
            ? 1
            : samples >= 60
              ? 0.75
              : 0.5;
        const direction =
          movementDelta > 0 ? 1 : -1;
        const strength = Math.min(
          5,
          Math.max(
            1,
            Math.round(
              (Math.abs(movementDelta) - 1) / 4
            )
          )
        );

        scoreAdjustment = clamp(
          round(
            direction *
            strength *
            sampleWeight
          ),
          -5,
          5
        );
      }

      return {
        boatNo,
        samples,
        reliability:
          source.reliability || "low",
        riseRate: toNumber(source.riseRate, 0),
        stayRate: toNumber(source.stayRate, 0),
        sinkRate: toNumber(source.sinkRate, 0),
        baselineRiseRate: toNumber(
          source.baselineRiseRate,
          0
        ),
        baselineStayRate: toNumber(
          source.baselineStayRate,
          0
        ),
        baselineSinkRate: toNumber(
          source.baselineSinkRate,
          0
        ),
        movementDelta: round(movementDelta),
        scoreAdjustment,
        label: usable
          ? (source.label || "維持")
          : "判定保留",
        usable,
        hasBaseline,
        appliedToScore:
          usable &&
          hasBaseline &&
          scoreAdjustment !== 0
      };
    }
  );

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

  function attackTheoryFor(no) {
    return getAnalysis(no)?.attackTheory || null;
  }

  function attackTheoryForCourse(course) {
    return list
      .map((boat) => boat?.attackTheory)
      .find((theory) => Number(theory?.course) === Number(course)) ||
      attackTheoryFor(course);
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
      hasAverageSt(leftNo) &&
      hasAverageSt(rightNo)
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

    return evidenceCount
      ? edge / evidenceCount
      : 0;
  }

  function slitBoat(no) {
    return slit.ranking.find(
      (boat) => boat.boatNo === Number(no)
    ) || null;
  }

  function slitScenarioAdjustment(attackerNo, wallNo) {
    const attacker = slitBoat(attackerNo);
    const wall = slitBoat(wallNo);
    let adjustment = 0;
    const reasons = [];

    if (attacker?.isAttackBoat) {
      if (attacker.isStableBoat) {
        adjustment += 8;
        reasons.push(
          `${attackerNo}号艇が隣艇より展示STで` +
          `${attacker.slitDiff.toFixed(2)}速く、` +
          `平均・今節STの裏付けあり（+8）`
        );
      } else {
        reasons.push(
          `${attackerNo}号艇は隣艇より展示STで` +
          `${attacker.slitDiff.toFixed(2)}速いが、` +
          "平均・今節STの裏付け不足のため表示のみ"
        );
      }
    } else if (
      attacker?.slitAdvantage &&
      attacker.hasStartSupport
    ) {
      adjustment += 4;
      reasons.push(
        `${attackerNo}号艇が隣艇より展示STで` +
        `${attacker.slitDiff.toFixed(2)}速い攻め優勢候補（+4）`
      );
    }

    if (attacker?.slitRisk && attacker.hasStartSupport) {
      adjustment -= 6;
      reasons.push(
        `${attackerNo}号艇が隣艇より展示STで` +
        `${attacker.slitLossDiff.toFixed(2)}遅い（-6）`
      );
    } else if (
      attacker?.slitConcern &&
      attacker.hasStartSupport
    ) {
      adjustment -= 3;
      reasons.push(
        `${attackerNo}号艇が隣艇より展示STで` +
        `${attacker.slitLossDiff.toFixed(2)}遅く、壁・残し不安（-3）`
      );
    }

    if (wall?.slitRisk && wall.hasStartSupport) {
      adjustment += 3;
      reasons.push(`${wallNo}号艇のスリット遅れ（+3）`);
    } else if (
      wall?.slitConcern &&
      wall.hasStartSupport
    ) {
      adjustment += 2;
      reasons.push(`${wallNo}号艇の壁・残し不安（+2）`);
    } else if (
      wall?.isAttackBoat &&
      wall.hasStartSupport
    ) {
      adjustment -= 3;
      reasons.push(`${wallNo}号艇のスリット先行（-3）`);
    } else if (
      wall?.slitAdvantage &&
      wall.hasStartSupport
    ) {
      adjustment -= 2;
      reasons.push(`${wallNo}号艇のスリット優勢（-2）`);
    }

    return {
      score: clamp(round(adjustment), -8, 8),
      reasons
    };
  }

  function newSamBoat(no) {
    return newSam.ranking.find(
      (boat) => boat.boatNo === Number(no)
    ) || null;
  }

  function newSamScenarioAdjustment(no, scenarioType) {
    const boat = newSamBoat(no);

    if (!boat?.isActionable) return 0;

    const course = courseMapping.courseOfBoat(no);
    const roleMatches =
      (course === 1 && scenarioType === "escape") ||
      (course === 2 && scenarioType === "sashi") ||
      (course === 3 && scenarioType === "threeAttack") ||
      (course === 4 && scenarioType === "fourAttack");

    return roleMatches
      ? boat.scoreAdjustment
      : 0;
  }

  /*
    展開成立度
  */

  let escapeScore =
    venue.inPower * 0.30 +
    flow(oneNo) * 0.28 +
    hold(oneNo) * 0.22 +
    st(oneNo) * 0.12 +
    4;

  const escapeSlit = slitScenarioAdjustment(oneNo, twoNo);
  const sashiSlit = slitScenarioAdjustment(twoNo, oneNo);
  const threeAttackSlit = slitScenarioAdjustment(threeNo, twoNo);
  const fourAttackSlit = slitScenarioAdjustment(fourNo, threeNo);
  const escapeNewSam = newSamScenarioAdjustment(oneNo, "escape");
  const sashiNewSam = newSamScenarioAdjustment(twoNo, "sashi");
  const threeAttackNewSam =
    newSamScenarioAdjustment(threeNo, "threeAttack");
  const fourAttackNewSam =
    newSamScenarioAdjustment(fourNo, "fourAttack");

  function frameMovementAdjustment(no) {
    return toNumber(
      frameMovement.find(
        (item) => item.boatNo === Number(no)
      )?.scoreAdjustment,
      0
    );
  }

  const twoVsOne =
    relationEdge(twoNo, oneNo);

  const threeVsTwo =
    relationEdge(threeNo, twoNo);

  const fourVsThree =
    relationEdge(fourNo, threeNo);

  /*
    評価済みの艇が主攻め艇の外から追走・残しできる場合は、
    艇番を固定せず、実コースと役割単位で可能性を保持する。

    この処理は評価点を加算しない。既に存在する構造化された
    ◎○▲△評価と、攻め・残し・STの独立根拠を接続するだけ。
  */
  /*
    旧互換の特定コース保護要求は実行しない。
    評価済み展開の保持は mergeWithPrediction の全艇共通
    候補モジュールだけを正本とする。
  */
  const preservationRequests = [];
  const entryAtCourse = (course) =>
    courseMapping.entryAtCourse(course);
  const threeAttackEntry = entryAtCourse(3);
  const continuationEntry = entryAtCourse(4);
  const threeAttackBoatNo = getBoatNo(threeAttackEntry);
  const continuationBoatNo = getBoatNo(continuationEntry);
  const continuationRequest =
    preservationRequests.find(
      (request) =>
        Number(request?.boatNo || 0) ===
          continuationBoatNo &&
        (request?.roleIntents || []).some(
          (role) =>
            role === "hold" ||
            role === "pickup"
        )
    ) || null;
  const continuationCourse = continuationEntry
    ? courseMapping.courseOfBoat(continuationBoatNo)
    : null;
  const threeAttackCourse = threeAttackEntry
    ? courseMapping.courseOfBoat(threeAttackBoatNo)
    : null;
  const mappingMatched =
    threeAttackCourse === 3 &&
    continuationBoatNo >= 1 &&
    continuationBoatNo <= 6 &&
    continuationCourse === 4;
  const continuationAttackTheory =
    attackTheoryFor(continuationBoatNo);
  const continuationSlit =
    slitBoat(continuationBoatNo);
  const innerSlit = slit.ranking.find(
    (boat) => Number(boat?.course) === 3
  ) || null;
  const continuationCurrentSt =
    continuationSlit?.currentStCount > 0
      ? toNumber(
          continuationSlit.currentStAverage,
          null
        )
      : null;
  const hasCurrentSeriesStart =
    mappingMatched &&
    continuationCurrentSt !== null &&
    continuationCurrentSt <= 0.15;
  const formalSlitEdge =
    mappingMatched &&
    continuationSlit?.isFormalSlit === true &&
    innerSlit?.isFormalSlit === true &&
    continuationSlit?.exSt !== null &&
    innerSlit?.exSt !== null
      ? round(
          toNumber(innerSlit.exSt, 0) -
          toNumber(continuationSlit.exSt, 0),
          3
        )
      : 0;
  const hasFormalSlitSupport =
    formalSlitEdge >= slit.secondaryThreshold;
  const attackTheoryScore =
    round(
      toNumber(
        continuationAttackTheory?.score,
        0
      )
    );
  const holdScore =
    round(hold(continuationBoatNo));
  const evidenceQualified =
    Boolean(continuationRequest) &&
    mappingMatched &&
    attackTheoryScore >= 65 &&
    holdScore >= 65 &&
    (
      hasCurrentSeriesStart ||
      hasFormalSlitSupport
    );
  const supportReason =
    hasCurrentSeriesStart
      ? `今節ST${continuationCurrentSt.toFixed(3)}`
      : hasFormalSlitSupport
        ? `実3コース艇との公式展示ST差${formalSlitEdge.toFixed(3)}`
        : "";
  const continuationPreservation = {
    id:
      `threeAttack:course4:${continuationBoatNo || "none"}`,
    scenarioType: "threeAttack",
    attackerBoatNo: threeAttackBoatNo || null,
    attackerCourse: threeAttackCourse,
    boatNo: continuationBoatNo || null,
    course: continuationCourse,
    sourceRequestIds:
      continuationRequest
        ? [continuationRequest.id]
        : [],
    sourceMarks:
      continuationRequest?.symbol
        ? [continuationRequest.symbol]
        : [],
    roles: ["hold"],
    eligiblePositions: [2, 3],
    mappingMatched,
    evaluationSupported:
      Boolean(continuationRequest),
    evidenceQualified,
    mainScenarioSupported: false,
    blockedByMainScenario: false,
    qualified: false,
    attackTheoryScore,
    holdScore,
    currentSt: continuationCurrentSt,
    comparedBoatNo:
      Number(innerSlit?.boatNo || 0) || null,
    formalSlitEdge,
    formalSlitSupport: hasFormalSlitSupport,
    reason:
      !continuationRequest
        ? "構造化された評価印に追走・残し対象艇がない"
        : !mappingMatched
          ? "主攻め艇と追走艇の実進入が3・4コースに一致しない"
          : "追走艇自身の攻め・残し・STの複合根拠不足"
  };

  const innerThreat =
    Math.max(
      relationEdge(twoNo, oneNo),
      relationEdge(threeNo, oneNo)
    );

  if (
    hasComparison(oneNo, twoNo) ||
    hasComparison(oneNo, threeNo)
  ) {
    if (innerThreat >= 10) {
  escapeScore -= 8;
} else if (innerThreat >= 6) {
  escapeScore -= 5;
} else {
  escapeScore += 3;
}
  }

  escapeScore += frameMovementAdjustment(oneNo);
  escapeScore += escapeSlit.score;
  escapeScore += escapeNewSam;

  let sashiScore =
    venue.sashi * 0.25 +
    flow(twoNo) * 0.25 +
    hold(twoNo) * 0.20 +
    attack(twoNo) * 0.15 +
    road(twoNo) * 0.10 +
    total(twoNo) * 0.05;

  if (hasComparison(twoNo, oneNo)) {
    if (twoVsOne >= 8) {
  sashiScore += 8;
} else if (twoVsOne >= 4) {
  sashiScore += 4;
} else if (twoVsOne <= -8) {
  sashiScore -= 6;
}
  } else {
    /*
      1号艇との平均ST比較がない時は、
      2号艇を差し頭として強く断定しない。
      2・3着の差し残り評価は buildOutcome 側で維持する。
    */
    sashiScore -= 15;
  }

  sashiScore += frameMovementAdjustment(twoNo);
  sashiScore += sashiSlit.score;
  sashiScore += sashiNewSam;

  let threeAttackScore =
  venue.makuri * 0.20 +
  flow(threeNo) * 0.30 +
  attack(threeNo) * 0.25 +
  st(threeNo) * 0.12 +
  total(threeNo) * 0.05 +
  4;

const threeVsOne =
  relationEdge(threeNo, oneNo);

/*
  3攻めの入口は、まず2号艇との比較で判定する。
*/
if (hasComparison(threeNo, twoNo)) {
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
if (hasComparison(threeNo, oneNo)) {
  if (threeVsOne <= -10) {
    threeAttackScore -= 14;
  } else if (threeVsOne <= -6) {
    threeAttackScore -= 9;
  } else if (threeVsOne >= 6) {
    threeAttackScore += 4;
  }
}

  threeAttackScore += frameMovementAdjustment(threeNo);
  threeAttackScore += threeAttackSlit.score;
  threeAttackScore += threeAttackNewSam;

  let fourAttackScore =
    venue.kado * 0.22 +
    flow(fourNo) * 0.28 +
    attack(fourNo) * 0.25 +
    st(fourNo) * 0.12 +
    total(fourNo) * 0.05 +
    4;

  if (hasComparison(fourNo, threeNo)) {
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


  fourAttackScore += frameMovementAdjustment(fourNo);
  fourAttackScore += fourAttackSlit.score;
  fourAttackScore += fourAttackNewSam;

  if (doubleTime.activeBoat === fourNo) {
    fourAttackScore += doubleTime.scoreAdjustment;
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
    1逃げと2差しが僅差の時だけ、最終的な技量差をタイブレークに使う。
    展開スコア自体には加点せず、展開→コース→ST等で作った差が
    2.5点以内の場合に限り、全国技量指数で最終順位を解決する。
  */
  const sashiSkillTiebreak = {
    applied: false,
    scoreGap: round(
      Math.max(0, escapeScore - sashiScore)
    ),
    nationalSkillGap: round(
      toNumber(getAnalysis(twoNo)?.indexes?.national, 0) -
      toNumber(getAnalysis(oneNo)?.indexes?.national, 0)
    )
  };

  const rawEscapeIsMain =
    escapeScore >= sashiScore &&
    escapeScore >= threeAttackScore &&
    escapeScore >= fourAttackScore;

  /*
    #305の技量タイブレークは採用後monitorで基本5点・払戻を悪化させたため停止。
    2差し生スコア、#301のST比較ガード、#308の残し・拾いは維持する。
  */
  sashiSkillTiebreak.applied = false;

  /*
    追走・残しの保持は、該当する攻めが実際の主筋で、
    元の除外が発生する強度の時だけ成立させる。

    艇全体の評価を上げず、2・3着の役割だけを保持する。
  */
  const threeAttackIsMain =
    threeAttackScore > escapeScore &&
    threeAttackScore > sashiScore &&
    threeAttackScore >= fourAttackScore;
  const blockedByThreeAttack =
    threeAttackScore >= 72;

  continuationPreservation.mainScenarioSupported =
    threeAttackIsMain;
  continuationPreservation.blockedByMainScenario =
    blockedByThreeAttack;
  continuationPreservation.qualified =
    evidenceQualified &&
    threeAttackIsMain &&
    blockedByThreeAttack;

  if (continuationPreservation.qualified) {
    continuationPreservation.reason =
      `${continuationBoatNo}号艇の4コース攻め・残し評価に` +
      `${supportReason}の裏付け`;
  } else if (
    evidenceQualified &&
    !threeAttackIsMain
  ) {
    continuationPreservation.reason =
      "3号艇攻めが最有力展開ではない";
  } else if (
    evidenceQualified &&
    !blockedByThreeAttack
  ) {
    continuationPreservation.reason =
      `${continuationBoatNo}号艇を除外する強度の3号艇攻めではない`;
  }

  const preservations =
    continuationPreservation.boatNo
      ? [continuationPreservation]
      : [];

  /*
    シナリオ内の着順適性を計算する。
    固定買い目は作らない。
  */

  function buildOutcome(type) {
    const outcome = list.map((boat) => {
      const no = Number(boat.boatNo);
      const course = courseMapping.courseOfBoat(no);

      let firstScore =
        total(no) * 0.30 +
        flow(no) * 0.30 +
        attack(no) * 0.25 +
        st(no) * 0.10 +
        2.5;

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
        if (course === 1) {
          firstScore += 20;
          secondScore += 10;
          reasons.push("イン逃げ・残し");
        }

        if (course === 2) {
  secondScore += 10;
  thirdScore += 7;
  reasons.push("2コース差し残り");
}

        if (course === 3) {
          secondScore += 6;
          thirdScore += 6;
          reasons.push("センター追走");
        }

        if (course === 4) {
          thirdScore += 4;
          reasons.push("4コース残し");
        }
      }

      if (type === "sashi") {
        if (course === 2) {
  firstScore += 12;
  secondScore += 10;
  reasons.push("2コース差し");
}

        if (course === 1) {
          secondScore += 14;
          thirdScore += 8;
          reasons.push("イン残し");
        }

        if (course === 3) {
          secondScore += 6;
          thirdScore += 7;
          reasons.push("差し展開の外側追走");
        }
      }

      if (type === "threeAttack") {
        if (course === 3) {
          firstScore += 18;
          secondScore += 8;
          reasons.push("3コース攻め");
        }

        if (course === 1) {
          secondScore += 12;
          thirdScore += 8;
          reasons.push("3攻め時のイン残し");
        }

        if (course === 2) {
          secondScore += 9;
          thirdScore += 9;
          reasons.push("差し・内残し");
        }

        if (
          no ===
          Number(continuationPreservation.boatNo)
        ) {
          firstScore -= 12;

          if (continuationPreservation.qualified) {
            reasons.push(
              `3攻めで頭評価は下げるが追走・残しは維持（` +
              `${continuationPreservation.reason}）`
            );
          } else {
            secondScore -= 7;
            reasons.push("3攻めで攻め場減少");
          }
        }

        if (course === 5) {
          secondScore += 9;
          thirdScore += 13;
          reasons.push("3攻めに乗るまくり差し");
        }

        if (course === 6) {
          thirdScore += 6;
          reasons.push("最内差し・道中拾い");
        }
      }

      if (type === "fourAttack") {
        if (course === 4) {
          firstScore += 18;
          secondScore += 8;
          reasons.push("4カド攻め");
        }

        if (course === 1) {
          secondScore += 10;
          thirdScore += 8;
          reasons.push("カド攻め時のイン残し");
        }

        if (course === 2) {
          thirdScore += 7;
          reasons.push("差し残り");
        }

        if (course === 5) {
          secondScore += 12;
          thirdScore += 13;
          reasons.push("カド攻めに乗るまくり差し");
        }

        if (course === 6) {
          secondScore += 5;
          thirdScore += 10;
          reasons.push("最内差し・展開拾い");
        }
      }

      if (
        doubleTime.isActionable &&
        no === doubleTime.activeBoat
      ) {
        const adjustment = doubleTime.scoreAdjustment;

        if (course === 4 && type === "fourAttack") {
          firstScore += adjustment;
          secondScore += adjustment;
          reasons.push(
            `ダブルタイム・4カド攻め +${adjustment}`
          );
        }

        if (
          course === 5 &&
          (type === "threeAttack" || type === "fourAttack")
        ) {
          secondScore += adjustment;
          thirdScore += adjustment;
          reasons.push(
            `ダブルタイム・外の拾い +${adjustment}`
          );
        }

        if (
          course === 6 &&
          (type === "threeAttack" || type === "fourAttack")
        ) {
          secondScore += type === "fourAttack"
            ? Math.ceil(adjustment / 2)
            : 0;
          thirdScore += adjustment;
          reasons.push(
            `ダブルタイム・最内差し拾い +${adjustment}`
          );
        }
      }

      const newSamEvidence = newSamBoat(no);

      if (newSamEvidence?.isActionable) {
        const adjustment = newSamEvidence.scoreAdjustment;
        const label =
          `新サム${newSamEvidence.grade}・` +
          `${newSamEvidence.role}`;

        if (course === 1 && type === "escape") {
          firstScore += adjustment;
          secondScore += Math.ceil(adjustment / 2);
          reasons.push(`${label} +${adjustment}`);
        } else if (
          course === 1 &&
          (type === "threeAttack" || type === "fourAttack")
        ) {
          secondScore += adjustment;
          thirdScore += Math.ceil(adjustment / 2);
          reasons.push(`${label} +${adjustment}`);
        }

        if (course === 2 && type === "sashi") {
          firstScore += adjustment;
          secondScore += adjustment;
          reasons.push(`${label} +${adjustment}`);
        } else if (
          course === 2 &&
          (type === "threeAttack" || type === "fourAttack")
        ) {
          secondScore += adjustment;
          thirdScore += adjustment;
          reasons.push(`${label} +${adjustment}`);
        }

        if (course === 3 && type === "threeAttack") {
          firstScore += adjustment;
          secondScore += adjustment;
          reasons.push(`${label} +${adjustment}`);
        }

        if (course === 4 && type === "fourAttack") {
          firstScore += adjustment;
          secondScore += adjustment;
          reasons.push(`${label} +${adjustment}`);
        }

        if (
          (course === 5 || course === 6) &&
          (type === "threeAttack" || type === "fourAttack")
        ) {
          secondScore += Math.ceil(adjustment / 2);
          thirdScore += adjustment;
          reasons.push(`${label} +${adjustment}`);
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
      label:
        oneNo === 1
          ? "1号艇逃げ"
          : `${oneNo}号艇の1コース逃げ`,
      score: escapeScore,
      slitAdjustment: escapeSlit.score,
      slitReasons: escapeSlit.reasons,
      newSamAdjustment: escapeNewSam,
      frameMovementAdjustment:
        frameMovementAdjustment(oneNo),
      attacker: 1,
      attackerCourse: 1,
      attackerBoatNo: oneNo,
      headBoatNo: oneNo,
      blockedBoats: [],
      outcome: buildOutcome("escape")
    },
    {
      type: "sashi",
      label: "2コース差し",
      score: sashiScore,
      slitAdjustment: sashiSlit.score,
      slitReasons: sashiSlit.reasons,
      newSamAdjustment: sashiNewSam,
      frameMovementAdjustment:
        frameMovementAdjustment(twoNo),
      attacker: 2,
      attackerCourse: 2,
      attackerBoatNo: twoNo,
      headBoatNo: twoNo,
      blockedBoats: [],
      outcome: buildOutcome("sashi")
    },
    {
      type: "threeAttack",
      label: "3コース攻め",
      score: threeAttackScore,
      attackTheory: attackTheoryForCourse(3),
      attackTheoryAligned:
        attackTheoryForCourse(3)?.isAdopted === true,
      slitAdjustment: threeAttackSlit.score,
      slitReasons: threeAttackSlit.reasons,
      newSamAdjustment: threeAttackNewSam,
      frameMovementAdjustment:
        frameMovementAdjustment(threeNo),
      attacker: 3,
      attackerCourse: 3,
      attackerBoatNo: threeNo,
      headBoatNo: threeNo,
      blockedBoats:
        threeAttackScore >= 72 &&
        !continuationPreservation.qualified &&
        continuationBoatNo
          ? [continuationBoatNo]
          : [],
      preservations,
      outcome: buildOutcome("threeAttack")
    },
    {
      type: "fourAttack",
      label: "4カド攻め",
      score: fourAttackScore,
      attackTheory: attackTheoryForCourse(4),
      attackTheoryAligned:
        attackTheoryForCourse(4)?.isAdopted === true,
      slitAdjustment: fourAttackSlit.score,
      slitReasons: fourAttackSlit.reasons,
      doubleTimeAdjustment:
        doubleTime.activeBoat === fourNo
          ? doubleTime.scoreAdjustment
          : 0,
      newSamAdjustment: fourAttackNewSam,
      frameMovementAdjustment:
        frameMovementAdjustment(fourNo),
      attacker: 4,
      attackerCourse: 4,
      attackerBoatNo: fourNo,
      headBoatNo: fourNo,
      blockedBoats: [],
      outcome: buildOutcome("fourAttack")
    }
  ].sort((a, b) => {
    if (sashiSkillTiebreak.applied) {
      if (a.type === "sashi") return -1;
      if (b.type === "sashi") return 1;
    }

    return b.score - a.score;
  });

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

  const attackerCourse =
    Number(
      mainScenario?.attackerCourse ??
      mainScenario?.attacker ??
      0
    ) || null;
  const boatByCourse = new Map(
    [1, 2, 3, 4, 5, 6].map((course) => [
      course,
      courseMapping.boatAtCourse(course)
    ])
  );
  const attacker =
    Number(
      mainScenario?.attackerBoatNo ??
      mainScenario?.headBoatNo ??
      boatByCourse.get(attackerCourse) ??
      attackerCourse ??
      0
    ) || null;

  const legacyWallBoat = attacker
    ? (
        attackerCourse >= 2
          ? boatByCourse.get(attackerCourse - 1) || null
          : rankedBoatNumbers(
              (boat) => boat?.roleScores?.hold,
              { exclude: [attacker], limit: 1 }
            )[0] || null
      )
    : null;

  let remainers = rankedBoatNumbers(
    (boat) => boat?.roleScores?.hold,
    { limit: 3 }
  );

  const followers = rankedBoatNumbers(
    (boat) => boat?.roleScores?.flow,
    { exclude: attacker ? [attacker] : [], limit: 3 }
  );

  let pickupCandidates = rankedBoatNumbers(
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
    ? mainScenario.blockedBoats
        .map(Number)
        .filter(Boolean)
    : [];

  const wallTheory = buildWallTheory(
    entries,
    list,
    data,
    {
      mainScenario,
      attacker,
      blockedBoats
    }
  );

  const wallBoat =
    Number(wallTheory.wallBoat || 0) || null;

  /*
    残し・拾いVer2は、展開と壁を確定した後に一度だけ計算する。
    以降の印・買い目はこの確定候補をそのまま利用する。
  */
  const holdPickupTheory = buildHoldPickupTheory(
    entries,
    list,
    mainScenario,
    wallTheory,
    {
      attackerCourse,
      attackerBoatNo: attacker,
      blockedBoats,
      preservations:
        mainScenario?.preservations || []
    }
  );

  if (mainScenario?.outcome) {
    mainScenario.outcome.secondCandidates =
      holdPickupTheory.secondCandidates;
    mainScenario.outcome.thirdCandidates =
      holdPickupTheory.thirdCandidates;
  }

  remainers = holdPickupTheory.secondCandidates
    .map((boat) => boat.boatNo);
  pickupCandidates = holdPickupTheory.thirdCandidates
    .map((boat) => boat.boatNo);

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
    sashiSkillTiebreak: {
      applied: sashiSkillTiebreak.applied,
      scoreGap: sashiSkillTiebreak.scoreGap,
      nationalSkillGap:
        sashiSkillTiebreak.nationalSkillGap,
      reason: sashiSkillTiebreak.applied
        ? "1逃げと2差しが2.5点以内で、2号艇の全国技量指数が1号艇を10点以上上回るため2差しを最終採用"
        : ""
    },
    relations: {
      twoVsOne: round(twoVsOne),
      threeVsTwo: round(threeVsTwo),
      fourVsThree: round(fourVsThree)
    },
    slit: {
      threshold: slit.threshold,
      source: slit.source,
      alerts: slit.alerts.map((boat) => ({
        boatNo: boat.boatNo,
        comparedBoatNo: boat.comparedBoatNo,
        diff: boat.slitDiff,
        stable: boat.isStableBoat
      })),
      risks: slit.risks.map((boat) => ({
        boatNo: boat.boatNo,
        delayedByBoatNo: boat.delayedByBoatNo,
        diff: boat.slitLossDiff
      }))
    },
    doubleTime: {
      topBoat: doubleTime.topBoat,
      activeBoat: doubleTime.activeBoat,
      confidence: doubleTime.confidence,
      exhibitionGap: doubleTime.exhibitionGap,
      lapGap: doubleTime.lapGap,
      isOuterTarget: doubleTime.isOuterTarget,
      isLinkable: doubleTime.isLinkable,
      linkRole: doubleTime.linkRole,
      linkScore: doubleTime.linkScore,
      scoreAdjustment: doubleTime.scoreAdjustment
    },
    newSam: {
      isFormal: newSam.isFormal,
      average: newSam.average,
      missingBoatNos: [...newSam.missingBoatNos],
      activeBoats: [...newSam.activeBoats],
      ranking: newSam.ranking.map((boat) => ({
        boatNo: boat.boatNo,
        diff: boat.diff,
        grade: boat.grade,
        role: boat.role,
        roleScore: boat.roleScore,
        isRoleAligned: boat.isRoleAligned,
        scoreAdjustment: boat.scoreAdjustment
      }))
    },
    wall: {
      attackerNo: wallTheory.attackerNo,
      attackerCourse: wallTheory.attackerCourse,
      wallCourse: wallTheory.wallCourse,
      wallCandidateNo: wallTheory.wallCandidateNo,
      wallBoat: wallTheory.wallBoat,
      legacyWallBoat,
      state: wallTheory.state,
      score: wallTheory.score,
      grade: wallTheory.grade,
      scoreAdjustment: wallTheory.scoreAdjustment,
      adjustmentApplied: wallTheory.adjustmentApplied
    },
    holdPickup: {
      isFormal: holdPickupTheory.isFormal,
      isProvisional: holdPickupTheory.isProvisional,
      attackerBoatNo: holdPickupTheory.attackerBoatNo,
      attackerCourse: holdPickupTheory.attackerCourse,
      secondCandidates:
        holdPickupTheory.secondCandidates.map((boat) => ({
          boatNo: boat.boatNo,
          course: boat.course,
          score: boat.score,
          grade: boat.grade
        })),
      thirdCandidates:
        holdPickupTheory.thirdCandidates.map((boat) => ({
          boatNo: boat.boatNo,
          course: boat.course,
          score: boat.score,
          grade: boat.grade
        }))
    },
    firstCandidates:
      mainScenario?.outcome?.firstCandidates
        ?.map((boat) => boat.boatNo) || [],
    secondCandidates:
      mainScenario?.outcome?.secondCandidates
        ?.map((boat) => boat.boatNo) || [],
    thirdCandidates:
      mainScenario?.outcome?.thirdCandidates
        ?.map((boat) => boat.boatNo) || [],
    frameMovement: frameMovement
      .filter((item) => item.usable)
      .map((item) => ({
        boatNo: item.boatNo,
        riseRate: item.riseRate,
        stayRate: item.stayRate,
        sinkRate: item.sinkRate,
        label: item.label,
        samples: item.samples,
        baselineRiseRate:
          item.baselineRiseRate,
        baselineStayRate:
          item.baselineStayRate,
        baselineSinkRate:
          item.baselineSinkRate,
        movementDelta:
          item.movementDelta,
        scoreAdjustment:
          item.scoreAdjustment,
        appliedToScore:
          item.appliedToScore
      }))
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

    attackerCourse,

    attackerBoatNo: attacker,

    headBoatNo: attacker,

    wallBoat,

    wallTheory,

    holdPickupTheory,

    remainers,

    followers,

    pickupCandidates,

    roadRaceBoats,

    localExperts,

    frameMovement,

    blockedBoats,

    preservations:
      mainScenario?.preservations || [],

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
  const courseMapping = buildOfficialCourseMapping(entries);
  const oneNo = courseMapping.boatAtCourse(1);
  const twoNo = courseMapping.boatAtCourse(2);
  const threeNo = courseMapping.boatAtCourse(3);
  const fourNo = courseMapping.boatAtCourse(4);
  const fiveNo = courseMapping.boatAtCourse(5);
  const sixNo = courseMapping.boatAtCourse(6);
  const innerBoatNos = [oneNo, twoNo];
  const outerBoatNos = [threeNo, fourNo, fiveNo, sixNo];

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

  const holdCandidates = [oneNo, twoNo, fourNo]
    .map((boatNo) => ({
      boatNo,
      score: roleScore(boatNo, "hold")
    }))
    .sort((a, b) => b.score - a.score);

  const pickupCandidates = [fiveNo, sixNo]
    .map((boatNo) => ({
      boatNo,
      score: roleScore(boatNo, "pickup")
    }))
    .sort((a, b) => b.score - a.score);

  const innerHead = outcomeScore(
    innerScenario,
    innerBoatNos,
    "firstScore"
  );
  const innerHold =
    holdCandidates[0].score * 0.65 +
    holdCandidates[1].score * 0.35;
  const outerHead = outcomeScore(
    attackScenario,
    outerBoatNos,
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
    roleScore(oneNo, "hold") * 0.20 +
    roleScore(twoNo, "hold") * 0.10;
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
    .map((course) => {
      const boatNo = courseMapping.boatAtCourse(course);
      return {
      boatNo,
      course,
      className: classNameOf(boatNo),
      classAbility: classAbilityOf(boatNo),
      effectiveAbility:
        classAbilityOf(boatNo) *
        courseThreatRate[course]
      };
    })
    .sort(
      (a, b) =>
        b.effectiveAbility -
        a.effectiveAbility
    );

  const strongestChallenger =
    challengerCandidates[0];

  const boat1ClassAbility =
    classAbilityOf(oneNo);

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
    roleScore(oneNo, "hold");

  const boat1Flow = Math.max(
    roleScore(oneNo, "flow"),
    indexScore(oneNo, "raceFlow")
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
    const course = courseMapping.courseOfBoat(boatNo);

    if (course === 3) {
      return average([
        venueFeature.makuri,
        venueFeature.makuriSashi
      ], 55);
    }

    if (course === 4) {
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

  const outerCandidates = outerBoatNos
    .map((boatNo) => {
      const course = courseMapping.courseOfBoat(boatNo);
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

      if (course === 3) {
        courseFlow =
          attack * 0.55 +
          flow * 0.35 +
          pickup * 0.10;

        roleLabel = "3コース攻め";
      } else if (course === 4) {
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

  const strongOuterCount = outerBoatNos
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
    `${oneNo}号艇${classNameOf(oneNo)}・相手最上位${strongestChallenger.boatNo}号艇${strongestChallenger.className}`,
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
        honmei:
          oneNo === 1
            ? "1号艇のイン逃げ"
            : `${oneNo}号艇の1コース逃げ`,
        manshu:
          outerBoatNos.every(
            (boatNo, index) => boatNo === index + 3
          )
            ? "3〜6号艇からの万舟波乱"
            : `${outerBoatNos.join("・")}号艇からの万舟波乱`
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
          boat1Class: classNameOf(oneNo),
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

  function buildFormations(analyses, raceScenarios, sourceEntries = [], sourceData = {}) {
  const list = Array.isArray(analyses)
    ? [...analyses]
    : [];

  /*
    Phase2 STEP3：
    買う・見送る条件は従来判定を維持し、
    印と着順候補だけを展開シナリオへ接続する。
    raceScenarios 未指定時は従来結果を返す。
  */
  const legacyMarks = buildLegacyMarks(list, sourceEntries);
  const courseMapping = buildOfficialCourseMapping(sourceEntries);
  const hasScenario = Boolean(raceScenarios?.mainScenario);
  const marks = hasScenario
    ? buildMarks(list, raceScenarios)
    : legacyMarks;
  const legacyEvidence = legacyMarks.evidence || {};
  const evidence = hasScenario
    ? {
        ...legacyEvidence,
        source: "raceScenarios",
        scenarioType:
          raceScenarios.mainScenario?.type || "",
        confidence: toNumber(
          raceScenarios.confidence,
          0
        ),
        mainGap: toNumber(
          raceScenarios?.evidence?.mainGap,
          0
        ),
        attacker:
          Number(raceScenarios.attacker || 0) || null,
        wallBoat:
          Number(raceScenarios.wallBoat || 0) || null,
        remainers: [...(raceScenarios.remainers || [])],
        followers: [...(raceScenarios.followers || [])],
        pickupCandidates: [
          ...(raceScenarios.pickupCandidates || [])
        ],
        roadRaceBoats: [
          ...(raceScenarios.roadRaceBoats || [])
        ],
        blockedBoats: [
          ...(raceScenarios.blockedBoats || [])
        ],
        preservations: [
          ...(raceScenarios?.preservations || [])
        ],
        flow:
          legacyEvidence.flow === true ||
          (raceScenarios?.preservations || [])
            .some(
              (preservation) =>
                preservation?.qualified === true
            )
      }
    : legacyEvidence;

  const main = [];
  const safety = [];
  const flowTickets = [];
  const flowFormations = [];
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

    const no = courseMapping.courseOfBoat(boatNo(boat));

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

    const no = courseMapping.courseOfBoat(boatNo(boat));

    if (no === 2 || no === 4) {
      score += 3;
    }

    if (no >= 5 && pickup(boat) >= 72) {
      score += 5;
    }

    return score;
  }

  const legacySecondRanking = [...list]
    .sort((a, b) =>
      secondScore(b) - secondScore(a)
    );

  const legacyThirdRanking = [...list]
    .sort((a, b) =>
      thirdScore(b) - thirdScore(a)
    );

  function scenarioRanking(candidates, fallback) {
    if (!hasScenario) return fallback;

    const byNo = new Map(
      list.map((boat) => [boatNo(boat), boat])
    );

    if (raceScenarios?.holdPickupTheory?.isFormal === true) {
      return uniqueBoats(
        (candidates || []).map((candidate) =>
          byNo.get(
            Number(candidate?.boatNo ?? candidate ?? 0)
          )
        )
      );
    }

    return uniqueBoats([
      ...(candidates || []).map((candidate) =>
        byNo.get(
          Number(candidate?.boatNo ?? candidate ?? 0)
        )
      ),
      ...fallback
    ]);
  }

  const secondRanking = scenarioRanking(
    raceScenarios?.mainScenario?.outcome?.secondCandidates,
    legacySecondRanking
  );

  const thirdRanking = scenarioRanking(
    raceScenarios?.mainScenario?.outcome?.thirdCandidates,
    legacyThirdRanking
  );

  const scenarioOutcomeByBoat = new Map(
    (raceScenarios?.mainScenario?.outcome?.boats || [])
      .map((boat) => [Number(boat?.boatNo || 0), boat])
  );
  const holdScoreByBoat = new Map(
    (
      raceScenarios?.holdPickupTheory
        ?.secondCandidates || []
    ).map((boat) => [Number(boat.boatNo), boat.score])
  );
  const pickupScoreByBoat = new Map(
    (
      raceScenarios?.holdPickupTheory
        ?.thirdCandidates || []
    ).map((boat) => [Number(boat.boatNo), boat.score])
  );

  /*
    評価済みの追走・残し艇は、艇番に関係なく役割別の枝として
    候補プールへ保持する。艇全体を頭へ昇格させず、成立した
    2・3着位置だけを生成する。
  */
  function buildPreservedScenarioBranches() {
    if (!hasScenario) return [];

    const head = marks.honmei;
    const byNo = new Map(
      list.map((boat) => [boatNo(boat), boat])
    );

    if (
      !head ||
      boatNo(head) !== Number(raceScenarios.attacker)
    ) {
      return [];
    }

    return (raceScenarios?.preservations || [])
      .filter(
        (preservation) =>
          preservation?.qualified === true &&
          preservation?.scenarioType ===
            raceScenarios?.mainScenario?.type
      )
      .flatMap((preservation) => {
        const continuationBoat = byNo.get(
          Number(preservation?.boatNo || 0)
        );

        if (!continuationBoat) return [];

        const innerHoldBoats = (
          raceScenarios?.holdPickupTheory
            ?.secondCandidates || []
        )
          .filter(
            (candidate) =>
              Number(candidate?.course || 0) <
              Number(preservation?.course || 0)
          )
          .map((candidate) =>
            byNo.get(Number(candidate?.boatNo || 0))
          )
          .filter(
            (boat) =>
              boat &&
              boatNo(boat) !== boatNo(head) &&
              boatNo(boat) !== boatNo(continuationBoat)
          );
        const pickupBoat = thirdRanking.find(
          (boat) =>
            boatNo(boat) !== boatNo(head) &&
            boatNo(boat) !== boatNo(continuationBoat)
        );
        const primaryInner = innerHoldBoats[0] || null;
        const secondaryInner = innerHoldBoats[1] || null;
        const rawBranches = [
          {
            type: "pickup-third",
            first: head,
            second: continuationBoat,
            third: pickupBoat,
            useAsCover: false
          },
          {
            type: "inner-third",
            first: head,
            second: continuationBoat,
            third: primaryInner,
            useAsCover: true
          },
          {
            type: "continuation-third",
            first: head,
            second: primaryInner,
            third: continuationBoat,
            useAsCover: true
          },
          {
            type: "second-inner-third",
            first: head,
            second: continuationBoat,
            third: secondaryInner,
            useAsCover: false
          }
        ].filter(
          (branch) =>
            branch.first &&
            branch.second &&
            branch.third
        );

        return rawBranches.map((branch) => {
          const firstNo = boatNo(branch.first);
          const secondNo = boatNo(branch.second);
          const thirdNo = boatNo(branch.third);
          const continuationNo =
            boatNo(continuationBoat);
          const continuationPosition =
            secondNo === continuationNo ? 2 : 3;
          const otherNo =
            continuationPosition === 2
              ? thirdNo
              : secondNo;
          const otherRole =
            branch.type === "pickup-third"
              ? "展開を拾う"
              : "内で残る";
          const summary =
            continuationPosition === 2
              ? `${firstNo}号艇の攻めを主筋に、` +
                `${continuationNo}号艇が2着へ追走・残し、` +
                `${otherNo}号艇が3着で${otherRole}筋。`
              : `${firstNo}号艇の攻めを主筋に、` +
                `${otherNo}号艇が内で2着に残り、` +
                `${continuationNo}号艇の3着残りを拾う筋。`;

          return {
            ...branch,
            id: `${preservation.id}:${branch.type}`,
            preservationId: preservation.id,
            ticket:
              `${firstNo}-${secondNo}-${thirdNo}`,
            scenarioId:
              preservation.scenarioType,
            scenarioType:
              preservation.scenarioType,
            scenarioLabel:
              raceScenarios?.mainScenario?.label || "",
            coverageKey:
              `${preservation.id}:${branch.type}`,
            targetBoatNo: continuationNo,
            targetPosition: continuationPosition,
            evidenceQualified: true,
            expansionEligible: true,
            priorityScore: round(
              toNumber(
                preservation.attackTheoryScore,
                0
              ) * 0.45 +
              toNumber(
                preservation.holdScore,
                0
              ) * 0.55
            ),
            title:
              `${firstNo}攻め＋${continuationNo}追走・残し`,
            summary:
              summary +
              (
                preservation.reason
                  ? `根拠は${preservation.reason}。`
                  : ""
              ),
            evidence: {
              preservationId: preservation.id,
              sourceRequestIds: [
                ...(preservation.sourceRequestIds || [])
              ],
              reason: preservation.reason,
              attackTheoryScore:
                preservation.attackTheoryScore,
              holdScore: preservation.holdScore,
              currentSt: preservation.currentSt,
              formalSlitEdge:
                preservation.formalSlitEdge
            }
          };
        });
      });
  }

  const preservedScenarioBranches =
    buildPreservedScenarioBranches();
  const ticketEvidence = Object.fromEntries(
    preservedScenarioBranches.map((branch) => [
      branch.ticket,
      branch
    ])
  );

  const mainEstablished = hasScenario
    ? Boolean(legacyMarks.established && marks.established)
    : marks.established === true;

  /*
    本線の頭はbuildMarks()が展開から決めた本命。
    艇番を固定しない。
  */
  const mainHeads = mainEstablished
    ? uniqueBoats([marks.honmei])
    : [];

  /*
    押さえ頭：
    対抗と、実際に攻め根拠を持つ艇だけ。
  */
  const scenarioEvidenceKey = {
    escape: "oneEscape",
    sashi: "twoSashi",
    threeAttack: "threeAttack",
    fourAttack: "fourAttack"
  };

  const supportedSubScenarioHeads = hasScenario
    ? (raceScenarios.scenarios || [])
        .filter((scenario) =>
          scenario !== raceScenarios.mainScenario &&
          evidence[
            scenarioEvidenceKey[scenario?.type]
          ] === true
        )
        .map((scenario) =>
          list.find((boat) =>
            boatNo(boat) === Number(
              scenario?.attackerBoatNo ??
              scenario?.headBoatNo ??
              scenario?.attacker
            )
          )
        )
    : [
        evidence.twoSashi
          ? list.find((boat) => boatNo(boat) === 2)
          : null,
        evidence.threeAttack
          ? list.find((boat) => boatNo(boat) === 3)
          : null,
        evidence.fourAttack
          ? list.find((boat) => boatNo(boat) === 4)
          : null
      ];

  const safetyHeads = uniqueBoats([
    marks.taikou,
    ...supportedSubScenarioHeads
  ]);

  /*
    穴頭：
    穴印と、展開・攻めの裏付けがある艇だけ。
    5・6を外枠という理由だけでは頭にしない。
  */
  const longshotHeads = hasScenario
    ? uniqueBoats([marks.ana])
    : uniqueBoats([
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

  function generateTickets(
    target,
    heads,
    secondCandidates,
    thirdCandidates,
    limit
  ) {
    if (target.length >= limit) {
      return;
    }

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

  /*
    実戦本線3点は、2着1位へ3点を固定しない。
    2着1位を2点、2着2位を1点に分散して、
    展開上の残し艇が2着へ入る組み合わせを拾う。
  */
  function generateDiversifiedMainTickets(
    target,
    heads,
    secondCandidates,
    thirdCandidates,
    limit
  ) {
    if (target.length >= limit) {
      return;
    }

    for (const head of heads) {
      const seconds = secondCandidates
        .filter(
          (boat) => boatNo(boat) !== boatNo(head)
        )
        .slice(0, 3);
      const usedThirdsBySecond = new Map();

      for (let round = 0; round < 2; round += 1) {
        for (const second of seconds) {
          const secondNo = boatNo(second);
          const usedThirds =
            usedThirdsBySecond.get(secondNo) || new Set();
          const third = thirdCandidates.find(
            (candidate) => {
              const thirdNo = boatNo(candidate);
              return (
                thirdNo !== boatNo(head) &&
                thirdNo !== secondNo &&
                !usedThirds.has(thirdNo)
              );
            }
          );

          if (!third) continue;

          addTicket(target, head, second, third);
          usedThirds.add(boatNo(third));
          usedThirdsBySecond.set(secondNo, usedThirds);

          if (target.length >= limit) return;
        }
      }
    }

    generateTickets(
      target,
      heads,
      secondCandidates,
      thirdCandidates,
      limit
    );
  }

  if (preservedScenarioBranches.length) {
    /*
      最上位の3着拾い艇に対し、採用済みの各2着残し候補を
      1点ずつ先に並べる。4号艇だけを順位外から強制せず、
      1・2・4の残し筋を同じ条件で比較できる並びにする。
    */
    for (const head of mainHeads) {
      for (const second of secondRanking.slice(0, 3)) {
        const third = thirdRanking.find(
          (candidate) =>
            boatNo(candidate) !== boatNo(head) &&
            boatNo(candidate) !== boatNo(second)
        );

        addTicket(main, head, second, third);
      }
    }

    preservedScenarioBranches.forEach(
      ({ first, second, third }) => {
        addTicket(main, first, second, third);
      }
    );
  }

  generateDiversifiedMainTickets(
    main,
    mainHeads,
    secondRanking.slice(0, 4),
    thirdRanking.slice(0, 5),
    6
  );

  /*
    継続艇が2着・3着へ残る着順違いは、同じ3攻め本線の押さえ。
    実戦厳選の押さえ2枠へ先に渡し、成立した展開を消さない。
  */
  preservedScenarioBranches
    .filter((branch) => branch.useAsCover)
    .forEach(({ first, second, third }) => {
      addTicket(safety, first, second, third);
    });

  function scenarioSpecificSafetyRankings(head) {
    const fallback = {
      second: secondRanking.slice(0, 4),
      third: thirdRanking.slice(0, 5)
    };

    if (
      !hasScenario ||
      !Array.isArray(sourceEntries) ||
      sourceEntries.length < 5
    ) {
      return fallback;
    }

    const headNo = boatNo(head);
    const scenario = (raceScenarios.scenarios || []).find(
      (candidate) => Number(
        candidate?.attackerBoatNo ??
        candidate?.headBoatNo ??
        candidate?.attacker ??
        0
      ) === headNo
    );

    if (!scenario) return fallback;

    const scenarioContext = {
      ...raceScenarios,
      mainScenario: scenario,
      attacker: headNo,
      blockedBoats: [
        ...(scenario.blockedBoats || [])
      ]
    };
    const scenarioWall = buildWallTheory(
      sourceEntries,
      list,
      sourceData,
      scenarioContext
    );
    const scenarioHoldPickup = buildHoldPickupTheory(
      sourceEntries,
      list,
      scenario,
      scenarioWall,
      {
        attackerBoatNo: headNo,
        attackerCourse: Number(
          scenario?.attackerCourse ??
          scenario?.attacker ??
          headNo
        ),
        blockedBoats: [
          ...(scenario.blockedBoats || [])
        ],
        preservations: []
      }
    );
    const byNo = new Map(
      list.map((boat) => [boatNo(boat), boat])
    );
    const second = uniqueBoats(
      (scenarioHoldPickup.secondCandidates || [])
        .map((candidate) => byNo.get(Number(candidate?.boatNo || 0)))
    ).slice(0, 4);
    const third = uniqueBoats(
      (scenarioHoldPickup.thirdCandidates || [])
        .map((candidate) => byNo.get(Number(candidate?.boatNo || 0)))
    ).slice(0, 5);

    return {
      second: second.length ? second : fallback.second,
      third: third.length ? third : fallback.third
    };
  }

  for (const head of safetyHeads) {
    if (safety.length >= 8) break;
    const rankings = scenarioSpecificSafetyRankings(head);
    generateTickets(
      safety,
      [head],
      rankings.second,
      rankings.third,
      8
    );
  }

  /*
    流しは正式主展開の1着頭を固定し、正式な2着残し候補を
    1〜3艇だけ採用する。3着は頭・各2着艇を除く全艇へ展開し、
    4・8・12点の完全なフォーメーションを返す。

    オッズはここでは参照しない。実戦厳選とは別の表示用データで、
    formation.flow には展開後の全買い目を保持する。
  */
  const flowHead = mainHeads[0] || null;
  const flowBoatNos = [
    ...new Set(
      list
        .map(boatNo)
        .filter(
          no => no >= 1 && no <= 6
        )
    )
  ].sort((a, b) => a - b);
  const flowSecondBoats = uniqueBoats(
    secondRanking.filter(
      (candidate) =>
        boatNo(candidate) !== boatNo(flowHead)
    )
  ).slice(0, 3);

  if (
    mainEstablished &&
    flowHead &&
    flowBoatNos.length === 6 &&
    flowSecondBoats.length >= 1
  ) {
    const headBoatNo = boatNo(flowHead);
    const secondPriorityBoatNos =
      flowSecondBoats.map(boatNo);
    const secondBoatNos = [
      ...secondPriorityBoatNos
    ].sort((a, b) => a - b);
    const expandedTickets = [];

    secondPriorityBoatNos.forEach((secondBoatNo) => {
      for (const thirdBoatNo of flowBoatNos) {
        if (
          thirdBoatNo === headBoatNo ||
          thirdBoatNo === secondBoatNo
        ) {
          continue;
        }

        const ticket =
          `${headBoatNo}-${secondBoatNo}-${thirdBoatNo}`;

        if (!expandedTickets.includes(ticket)) {
          expandedTickets.push(ticket);
        }
      }
    });

    flowTickets.push(...expandedTickets);

    const scenarioType =
      raceScenarios?.mainScenario?.type ||
      marks.scenario?.type ||
      "formal-main";
    const scenarioLabel =
      raceScenarios?.mainScenario?.label ||
      marks.scenario?.label ||
      `${headBoatNo}号艇1着`;
    const notation =
      `${headBoatNo}-${secondBoatNos.join("")}-全`;
    const reason =
      `${scenarioLabel}を1着頭に固定し、` +
      `${secondBoatNos.join("・")}号艇を正式な2着残し候補として、` +
      "3着は残り全艇へ流す。";

    flowFormations.push({
      headBoatNo,
      secondBoatNos: [...secondBoatNos],
      secondPriorityBoatNos: [
        ...secondPriorityBoatNos
      ],
      thirdMode: "all",
      notation,
      pointCount: expandedTickets.length,
      ticketCount: expandedTickets.length,
      expandedTickets: [...expandedTickets],
      tickets: [...expandedTickets],
      scenarioType,
      label: scenarioLabel,
      reason
    });
  }

  evidence.flow = flowFormations.length > 0;

  generateTickets(
    longshot,
    longshotHeads,
    secondRanking.slice(0, 5),
    thirdRanking.slice(0, 6),
    8
  );

  evidence.preservations = (
    evidence.preservations || []
  ).map((preservation) => ({
    ...preservation,
    candidateTickets:
      preservedScenarioBranches
        .filter(
          (branch) =>
            branch.preservationId === preservation.id
        )
        .map((branch) => branch.ticket)
  }));

  return {
    main,
    safety,
    flow: flowTickets,
    flowFormations,
    longshot,

    scenario: marks.scenario,
    mainEstablished,
    evidence,
    possibilityCandidates:
      preservedScenarioBranches.map(
        (branch) => ({ ...branch })
      ),
    ticketEvidence,

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
        score: round(
          holdScoreByBoat.get(boatNo(boat)) ??
          scenarioOutcomeByBoat.get(boatNo(boat))
            ?.secondScore ??
          secondScore(boat)
        )
      })),

      third: thirdRanking.map((boat) => ({
        boatNo: boatNo(boat),
        score: round(
          pickupScoreByBoat.get(boatNo(boat)) ??
          scenarioOutcomeByBoat.get(boatNo(boat))
            ?.thirdScore ??
          thirdScore(boat)
        )
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

  function buildLegacyMarks(analyses, sourceEntries = []) {
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

  const courseMapping = buildOfficialCourseMapping(sourceEntries);
  const analysisAtCourse = (course) =>
    byBoat[courseMapping.boatAtCourse(course)] || null;
  const boat1 = analysisAtCourse(1);
  const boat2 = analysisAtCourse(2);
  const boat3 = analysisAtCourse(3);
  const boat4 = analysisAtCourse(4);
  const boat5 = analysisAtCourse(5);
  const boat6 = analysisAtCourse(6);

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
    Phase2 STEP2 展開シナリオ印

    buildRaceScenarios() の最有力展開と役割艇から
    ◎○▲△を決める。raceScenarios が未指定の場合は、
    既存互換のため従来判定を返す。
  =============================== */
  function buildMarks(analyses, raceScenarios) {
    const list = Array.isArray(analyses)
      ? [...analyses]
      : [];

    const mainScenario = raceScenarios?.mainScenario || null;

    if (!mainScenario || !list.length) {
      return buildLegacyMarks(list);
    }

    const byBoat = {};

    list.forEach((boat) => {
      const no = Number(boat?.boatNo || 0);

      if (no >= 1 && no <= 6) {
        byBoat[no] = boat;
      }
    });

    const used = new Set();

    function selectBoat(candidates) {
      for (const candidate of candidates || []) {
        const no = Number(
          candidate?.boatNo ?? candidate ?? 0
        );

        if (
          no >= 1 &&
          no <= 6 &&
          byBoat[no] &&
          !used.has(no)
        ) {
          used.add(no);
          return byBoat[no];
        }
      }

      return null;
    }

    const firstCandidates =
      mainScenario?.outcome?.firstCandidates || [];

    const secondCandidates =
      mainScenario?.outcome?.secondCandidates || [];

    const thirdCandidates =
      mainScenario?.outcome?.thirdCandidates || [];
    const holdPickupFormal =
      raceScenarios?.holdPickupTheory?.isFormal === true;
    const continuationCandidates =
      (raceScenarios?.preservations || [])
        .filter(
          (preservation) =>
            preservation?.qualified === true &&
            (preservation?.eligiblePositions || [])
              .some(
                (position) =>
                  position === 2 ||
                  position === 3
              )
        )
        .map((preservation) =>
          byBoat[
            Number(preservation?.boatNo || 0)
          ]
        )
        .filter(Boolean);

    /*
      ◎は最有力シナリオを作る艇を最優先。
      シナリオ側に攻め艇がない場合だけ1着候補へ戻す。
    */
    const honmei = selectBoat([
      raceScenarios.attacker,
      mainScenario.attacker,
      ...firstCandidates
    ]);

    /*
      ○は2着残し候補を優先。
      内の残し・壁・シナリオ内の2着適性を反映する。
    */
    const taikou = selectBoat([
      ...secondCandidates,
      ...(
        holdPickupFormal
          ? []
          : [
              raceScenarios.wallBoat,
              ...(raceScenarios.remainers || []),
              ...(raceScenarios.followers || []),
              ...firstCandidates
            ]
      )
    ]);

    /*
      ▲は攻めに乗る展開艇・拾い艇を優先。
      3攻め時に4の攻め場が消えるなど、blockedBoats は除外する。
    */
    const blocked = new Set(
      (raceScenarios.blockedBoats || [])
        .map((no) => Number(no))
    );

    const anaCandidates = [
      ...thirdCandidates,
      ...(
        holdPickupFormal
          ? []
          : [
              ...(raceScenarios.followers || []),
              ...(raceScenarios.pickupCandidates || []),
              ...(raceScenarios.roadRaceBoats || []),
              ...firstCandidates
            ]
      )
    ].filter((candidate) => {
      const no = Number(
        candidate?.boatNo ?? candidate ?? 0
      );

      return !blocked.has(no);
    });

    const ana = selectBoat(anaCandidates);

    /*
      △は残し・道中・当地の順で補完する。
    */
    const osae = selectBoat([
      ...continuationCandidates,
      ...secondCandidates,
      ...thirdCandidates,
      ...(
        holdPickupFormal
          ? []
          : [
              ...(raceScenarios.remainers || []),
              ...(raceScenarios.roadRaceBoats || []),
              ...(raceScenarios.localExperts || []),
              ...list
            ]
      )
    ]);

    const confidence = toNumber(
      raceScenarios.confidence ?? mainScenario.score,
      0
    );

    return {
      honmei,
      taikou,
      ana,
      osae,
      scenario: mainScenario.label || "総合展開",
      established: Boolean(honmei && mainScenario),
      confidence,

      evidence: {
        source: "raceScenarios",
        scenarioType: mainScenario.type || "",
        scenarioScore: confidence,
        mainGap: toNumber(
          raceScenarios?.evidence?.mainGap,
          0
        ),
        attacker: Number(raceScenarios.attacker || 0) || null,
        wallBoat: Number(raceScenarios.wallBoat || 0) || null,
        remainers: [...(raceScenarios.remainers || [])],
        followers: [...(raceScenarios.followers || [])],
        pickupCandidates: [
          ...(raceScenarios.pickupCandidates || [])
        ],
        roadRaceBoats: [
          ...(raceScenarios.roadRaceBoats || [])
        ],
        localExperts: [
          ...(raceScenarios.localExperts || [])
        ],
        blockedBoats: [
          ...(raceScenarios.blockedBoats || [])
        ]
      }
    };
  }
    /* ===============================
    prediction.jsへ渡すAIデータ生成
  =============================== */

  function buildPredictionData(
    data,
    options = {}
  ) {

    const entries = getRaceEntries(data);
    const officialCourseMapping =
      buildOfficialCourseMapping(entries);

    const venueFeature = getVenueFeature(data);

const analyses =
  buildBoatAnalyses(data);

const stSlitTheory = {
  ranking: analyses
    .map(
      boat => boat.stTheory
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.samples - a.samples ||
        a.course - b.course
    ),
  roles: analyses
    .map(
      boat => boat.stTheory
    )
    .filter(Boolean),
  isFormal:
    analyses.length === 6 &&
    analyses.every(
      boat =>
        boat.stTheory?.isFormal
    ),
  sampleThreshold: 12,
  highReliabilityThreshold: 30,
  currentSeriesThreshold: 2,
  appliedWeight: 0.10,
  source:
    "ai-core-st-slit-theory-v2"
};

const courseStructureTheory = {
  ranking: analyses
    .map(
      boat =>
        boat.courseStructureTheory
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.course - b.course
    ),
  roles: analyses
    .map(
      boat =>
        boat.courseStructureTheory
    )
    .filter(Boolean),
  isFormal:
    analyses.length === 6 &&
    analyses.every(
      boat =>
        boat.courseStructureTheory
          ?.isFormal
    ),
  source:
    "ai-core-course-structure-v2"
};

const exhibitionPerformanceTheory =
  buildExhibitionPerformanceEvaluation(
    entries,
    data
  );

const exhibitionPerformanceByBoat =
  new Map(
    exhibitionPerformanceTheory.roles.map(
      (boat) => [boat.boatNo, boat]
    )
  );

analyses.forEach((boat) => {
  boat.exhibitionPerformanceTheory =
    exhibitionPerformanceByBoat.get(
      Number(boat.boatNo)
    ) || null;
});

const attackTheory = {
  ranking: analyses
    .map((boat) => boat.attackTheory)
    .filter((boat) => boat?.isAttackCourse)
    .sort((a, b) => b.score - a.score || a.course - b.course),
  roles: analyses
    .map((boat) => boat.attackTheory)
    .filter(Boolean),
  isFormal:
    analyses.length === 6 &&
    analyses.every((boat) => boat.attackTheory?.isFormal),
  adoptedBoats: analyses
    .map((boat) => boat.attackTheory)
    .filter((boat) => boat?.isAdopted)
    .map((boat) => boat.boatNo),
  source: "ai-core-attack-theory-v1"
};

const raceScenarios =
  buildRaceScenarios(
    analyses,
    data,
    options
  );

const wallTheory =
  raceScenarios.wallTheory ||
  buildWallTheory(
    entries,
    analyses,
    data,
    raceScenarios
  );

const wallTheoryByBoat = new Map(
  wallTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  boat.wallTheory =
    wallTheoryByBoat.get(Number(boat.boatNo)) || null;
});

const holdPickupTheory =
  raceScenarios.holdPickupTheory ||
  buildHoldPickupTheory(
    entries,
    analyses,
    raceScenarios.mainScenario,
    wallTheory,
    {
      attackerBoatNo: raceScenarios.attacker,
      blockedBoats: raceScenarios.blockedBoats,
      preservations:
        raceScenarios.preservations || []
    }
  );
const holdPickupByBoat = new Map(
  holdPickupTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  boat.holdPickupTheory =
    holdPickupByBoat.get(Number(boat.boatNo)) || null;
});

const flowTheory =
  buildFlowTheory(
    entries,
    analyses,
    data,
    raceScenarios,
    attackTheory
  );

const flowTheoryByBoat = new Map(
  flowTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  boat.flowTheory =
    flowTheoryByBoat.get(Number(boat.boatNo)) || null;
});

const roadTheory =
  buildRoadTheory(
    entries,
    analyses,
    data,
    raceScenarios
  );

const roadTheoryByBoat = new Map(
  roadTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  boat.roadTheory =
    roadTheoryByBoat.get(Number(boat.boatNo)) || null;
});

const localTheory =
  buildLocalTheory(
    entries,
    analyses,
    data,
    raceScenarios
  );

const localTheoryByBoat = new Map(
  localTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  boat.localTheory =
    localTheoryByBoat.get(Number(boat.boatNo)) || null;
});

const newEnvironmentTheory =
  buildNewEnvironmentTheory(
    entries,
    analyses,
    data,
    raceScenarios
  );

const newEnvironmentTheoryByBoat = new Map(
  newEnvironmentTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  boat.newEnvironmentTheory =
    newEnvironmentTheoryByBoat.get(Number(boat.boatNo)) || null;
});

const waterWeatherTheory =
  buildWaterWeatherTheory(
    entries,
    analyses,
    data,
    raceScenarios
  );

const waterWeatherTheoryByBoat = new Map(
  waterWeatherTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  boat.waterWeatherTheory =
    waterWeatherTheoryByBoat.get(Number(boat.boatNo)) || null;
});

const racerSkillTheory =
  buildRacerSkillTheory(
    entries,
    analyses,
    data,
    raceScenarios
  );

const racerSkillTheoryByBoat = new Map(
  racerSkillTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  const skillTheory =
    racerSkillTheoryByBoat.get(Number(boat.boatNo)) || null;

  boat.racerSkillTheory = skillTheory;
  boat.roleEvidence = {
    ...(boat.roleEvidence || {}),
    racerSkill:
      skillTheory?.isAdopted
        ? {
            score: skillTheory.score,
            grade: skillTheory.grade,
            role: skillTheory.role,
            methodLabel: skillTheory.methodLabel,
            samples: skillTheory.samples
          }
        : null
  };
});

const motorMaintenanceTheory =
  buildMotorMaintenanceTheory(
    entries,
    analyses,
    data,
    raceScenarios
  );

const motorMaintenanceTheoryByBoat = new Map(
  motorMaintenanceTheory.roles.map((boat) => [boat.boatNo, boat])
);

analyses.forEach((boat) => {
  boat.motorMaintenanceTheory =
    motorMaintenanceTheoryByBoat.get(Number(boat.boatNo)) || null;
});

const slit =
      buildSlitAnalysis(
        entries,
        venueFeature,
        data
      );

    const doubleTime =
      buildDoubleTime(entries, analyses);

    const newSam =
      buildNewSam(entries, analyses);

    const formations =
      buildFormations(
        analyses,
        raceScenarios,
        entries,
        data
      );

    const marks =
      buildMarks(
        analyses,
        raceScenarios
      );

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

      courseMapping: {
        formal:
          officialCourseMapping.formal === true,
        byBoat: Object.fromEntries(
          [1, 2, 3, 4, 5, 6].map(
            boatNo => [
              boatNo,
              officialCourseMapping
                .courseOfBoat(boatNo)
            ]
          )
        )
      },

      analyses,

      stSlitTheory,

      courseStructureTheory,

      exhibitionPerformanceTheory,

      attackTheory,

      wallTheory,

      holdPickupTheory,

      flowTheory,

      roadTheory,

      localTheory,

      newEnvironmentTheory,

      waterWeatherTheory,

      racerSkillTheory,

      motorMaintenanceTheory,

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

    function mergeWithPredictionLegacyCompatibility(
      prediction,
      data
    ) {
    const basePrediction =
      prediction && typeof prediction === "object"
        ? prediction
        : {};

    const legacyMarks =
      basePrediction?.boatEvaluation &&
      !Array.isArray(basePrediction.boatEvaluation)
        ? basePrediction.boatEvaluation
        : basePrediction?.mainSheet || {};
    const markDefinitions = [
      {
        key: "honmei",
        symbol: "◎",
        roleIntents: ["head"]
      },
      {
        key: "taikou",
        symbol: "○",
        roleIntents: ["head", "hold"]
      },
      {
        key: "ana",
        symbol: "▲",
        roleIntents: ["alternate-head", "pickup"]
      },
      {
        key: "osae",
        symbol: "△",
        roleIntents: ["hold", "pickup"]
      }
    ];
    const preservationRequests =
      markDefinitions
        .map((definition) => {
          const mark = legacyMarks?.[definition.key];
          const boatNo = Number(
            mark?.boatNo ??
            mark?.number ??
            mark?.waku ??
            0
          );

          if (boatNo < 1 || boatNo > 6) {
            return null;
          }

          return {
            id: `legacy-mark:${definition.key}:${boatNo}`,
            boatNo,
            markKey: definition.key,
            symbol: definition.symbol,
            roleIntents: [...definition.roleIntents],
            source: "structured-boat-evaluation"
          };
        })
        .filter(Boolean);

    const aiCore = buildPredictionData(
      data,
      {
        preservationRequests
      }
    );
    
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
  findCoreEvaluation(
    legacyMarks?.honmei ||
    aiCore.marks?.honmei
  ) ||
  null;

const taikou =
  findCoreEvaluation(
    legacyMarks?.taikou ||
    aiCore.marks?.taikou
  ) ||
  null;

const ana =
  findCoreEvaluation(
    legacyMarks?.ana ||
    aiCore.marks?.ana
  ) ||
  null;

const osae =
  findCoreEvaluation(
    legacyMarks?.osae ||
    aiCore.marks?.osae
  ) ||
  null;

const coreFormations = aiCore.formations || {};
const compatibleFormation = {
  main: coreFormations.main || [],
  cover: coreFormations.safety || [],
  nagashi: coreFormations.flow || [],
  hole: coreFormations.longshot || [],
  possibilityCandidates:
    coreFormations.possibilityCandidates || [],
  ticketEvidence:
    coreFormations.ticketEvidence || {},
  mainEstablished: coreFormations.mainEstablished === true,
  evidence: coreFormations.evidence || {}
};

/*
  AIコアのフォーメーションは買い目文字列を正本として維持する。
  画面・実戦厳選へ渡す時だけ、prediction.js が作成した共通行へ戻し、
  公式オッズ・分類・展開種別を全表示で共有する。
*/
const baseTicketByValue =
  new Map(
    (Array.isArray(basePrediction.aiTicketList)
      ? basePrediction.aiTicketList
      : []
    ).map((item) => [
      String(item?.ticket || ""),
      item
    ])
  );

const officialOddsSource =
  data?.odds?.byTicket;
const hasOfficialOddsMap =
  officialOddsSource !== null &&
  typeof officialOddsSource === "object" &&
  !Array.isArray(officialOddsSource);
const oddsByTicket =
  hasOfficialOddsMap
    ? officialOddsSource
    : {};

const structuredTicketEvidence =
  compatibleFormation.ticketEvidence || {};

function buildTicketPresentation(
  ticket,
  category
) {
  const evidence =
    structuredTicketEvidence[ticket] || null;
  const numbers = String(ticket)
    .split("-")
    .map(Number);

  if (
    numbers.length !== 3 ||
    numbers.some(
      (boatNo) =>
        boatNo < 1 ||
        boatNo > 6
    )
  ) {
    return {
      title: "",
      summary: "",
      evidence
    };
  }

  const [first, second, third] = numbers;
  const scenarioLabel =
    String(
      evidence?.scenarioLabel ||
      raceScenarios?.mainScenario?.label ||
      ""
    ).trim();
  const categoryPrefix =
    category === "本命"
      ? `${scenarioLabel || `${first}号艇の1着展開`}を主筋に`
      : category === "押さえ"
        ? "主筋に対する残し・着順違いとして"
        : category === "流し"
          ? "成立する別展開として"
          : "波乱時の成立順として";
  const generatedSummary =
    `${categoryPrefix}、${first}号艇1着、` +
    `${second}号艇の2着残し、` +
    `${third}号艇の3着拾いを見る。`;

  return {
    title:
      String(evidence?.title || "").trim() ||
      `${first}-${second}-${third}の成立展開`,
    summary:
      String(evidence?.summary || "").trim() ||
      generatedSummary,
    evidence
  };
}

function hydrateCompatibleTickets(
  tickets,
  category,
  scenarioType
) {
  return (Array.isArray(tickets) ? tickets : [])
    .map((ticketValue) => {
      const ticket =
        String(
          ticketValue?.ticket ||
          ticketValue ||
          ""
        );
      const baseRow =
        baseTicketByValue.get(ticket) || {};
      const officialOdds =
        oddsByTicket[ticket];
      const rawOdds =
        hasOfficialOddsMap
          ? officialOdds
          : baseRow.odds;
      const numericOdds =
        Number(rawOdds);
      const hasOdds =
        rawOdds !== null &&
        rawOdds !== undefined &&
        rawOdds !== "" &&
        Number.isFinite(numericOdds) &&
        numericOdds > 0;
      const presentation =
        buildTicketPresentation(
          ticket,
          category
        );

      return {
        ...baseRow,
        ticket,
        category,
        categories: [category],
        scenarioType,
        scenarioTypes: [scenarioType],
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
          presentation.title,
        scenarioSummary:
          presentation.summary,
        reason:
          presentation.summary,
        comment:
          presentation.summary,
        evidenceQualified:
          presentation.evidence
            ?.evidenceQualified === true,
        expansionEligible:
          presentation.evidence
            ?.expansionEligible === true,
        coverageKey:
          presentation.evidence
            ?.coverageKey || "",
        preservationId:
          presentation.evidence
            ?.preservationId || "",
        priorityScore:
          toNumber(
            presentation.evidence
              ?.priorityScore,
            0
          ),
        structuredEvidence:
          presentation.evidence
      };
    })
    .filter((item) => item.ticket);
}

const compatibleTicketSheets = {
  main:
    hydrateCompatibleTickets(
      compatibleFormation.main,
      "本命",
      "中心展開"
    ),
  cover:
    hydrateCompatibleTickets(
      compatibleFormation.cover,
      "押さえ",
      "安全押さえ"
    ),
  flow:
    hydrateCompatibleTickets(
      compatibleFormation.nagashi,
      "流し",
      "流し展開"
    ),
  hole:
    hydrateCompatibleTickets(
      compatibleFormation.hole,
      "穴候補",
      "穴展開"
    )
};

const activeEvaluationTargets =
  preservationRequests.map((request) => ({
    id: request.id,
    boatNo: request.boatNo,
    markKey: request.markKey,
    symbol: request.symbol,
    roleIntents: [...request.roleIntents],
    source: request.source,
    candidateTickets: []
  }));
const exactTicketPattern =
  /^[1-6]-[1-6]-[1-6]$/;
const normalizedBaseRows =
  [...baseTicketByValue.values()]
    .map((row) => {
      const ticket = String(row?.ticket || "").trim();
      const rawCategory = String(
        row?.category ||
        (row?.categories || [])[0] ||
        ""
      );
      const category =
        /本命|本線|中心/.test(rawCategory)
          ? "本命"
          : /押さえ|安全/.test(rawCategory)
            ? "押さえ"
            : /流し/.test(rawCategory)
              ? "流し"
              : "穴候補";
      const presentation =
        buildTicketPresentation(ticket, category);

      return {
        ...row,
        ticket,
        category,
        categories: [category],
        scenarioType:
          String(row?.scenarioType || "") ||
          (
            category === "本命"
              ? "中心展開"
              : category === "押さえ"
                ? "安全押さえ"
                : category === "流し"
                  ? "流し展開"
                  : "穴展開"
          ),
        scenarioTypes: [
          String(row?.scenarioType || "") ||
          (
            category === "本命"
              ? "中心展開"
              : category === "押さえ"
                ? "安全押さえ"
                : category === "流し"
                  ? "流し展開"
                  : "穴展開"
          )
        ],
        scenarioTitle:
          presentation.title,
        scenarioSummary:
          presentation.summary,
        reason:
          presentation.summary,
        comment:
          presentation.summary
      };
    })
    .filter(
      (row) =>
        exactTicketPattern.test(row.ticket) &&
        new Set(row.ticket.split("-")).size === 3
    );
const possibilitySourceRows = [
  ...Object.values(compatibleTicketSheets).flat(),
  ...normalizedBaseRows
];
const possibilityMap = new Map();
const activeHonmeiBoatNo = getMarkBoatNo(honmei);

function rolePositions(roleIntents) {
  const positions = new Set();

  (roleIntents || []).forEach((role) => {
    if (
      role === "head" ||
      role === "alternate-head"
    ) {
      positions.add(1);
    }

    if (role === "hold") {
      positions.add(2);
      positions.add(3);
    }

    if (role === "pickup") {
      positions.add(3);
    }
  });

  return [...positions];
}

activeEvaluationTargets.forEach((target) => {
  const positions = rolePositions(target.roleIntents);
  const targetCandidates =
    possibilitySourceRows
      .filter((row) => {
        const boats = String(row.ticket)
          .split("-")
          .map(Number);
        const targetPosition =
          boats.indexOf(Number(target.boatNo)) + 1;

        if (!positions.includes(targetPosition)) {
          return false;
        }

        if (targetPosition === 1) {
          return true;
        }

        return boats[0] === activeHonmeiBoatNo;
      })
      .map((row) => {
        const boats = String(row.ticket)
          .split("-")
          .map(Number);
        const targetPosition =
          boats.indexOf(Number(target.boatNo)) + 1;
        const structured =
          row?.structuredEvidence || null;
        const categoryPriority =
          row.category === "本命"
            ? 30
            : row.category === "押さえ"
              ? 24
              : row.category === "流し"
                ? 18
                : 12;
        const positionPriority =
          targetPosition === 1
            ? 30
            : targetPosition === 2
              ? 26
              : 22;

        return {
          ...row,
          targetBoatNo: target.boatNo,
          targetPosition,
          coveredEvaluationIds: [target.id],
          coveredBoatNos: [target.boatNo],
          evidenceQualified: true,
          expansionEligible:
            structured?.expansionEligible === true ||
            (
              boats[0] === activeHonmeiBoatNo &&
              targetPosition >= 2
            ),
          preservationRequired:
            structured?.evidenceQualified === true,
          coverageKey:
            structured?.coverageKey ||
            `evaluation:${target.boatNo}:${targetPosition}`,
          priorityScore:
            toNumber(
              structured?.priorityScore,
              categoryPriority + positionPriority
            ),
          evidenceReasons: [
            `構造化された${target.symbol}評価`,
            `${target.boatNo}号艇の${targetPosition}着役割`
          ],
          selectionTier: "展開追加"
        };
      })
      .sort(
        (a, b) =>
          Number(b.preservationRequired) -
            Number(a.preservationRequired) ||
          toNumber(b.priorityScore, 0) -
            toNumber(a.priorityScore, 0) ||
          a.ticket.localeCompare(b.ticket)
      );

  target.candidateTickets =
    targetCandidates.map((row) => row.ticket);

  targetCandidates.forEach((row) => {
    const existing =
      possibilityMap.get(row.ticket);

    if (!existing) {
      possibilityMap.set(
        row.ticket,
        { ...row }
      );
      return;
    }

    existing.coveredEvaluationIds = [
      ...new Set([
        ...(existing.coveredEvaluationIds || []),
        ...(row.coveredEvaluationIds || [])
      ])
    ];
    existing.coveredBoatNos = [
      ...new Set([
        ...(existing.coveredBoatNos || []),
        ...(row.coveredBoatNos || [])
      ])
    ];
    existing.evidenceReasons = [
      ...new Set([
        ...(existing.evidenceReasons || []),
        ...(row.evidenceReasons || [])
      ])
    ];
    existing.preservationRequired =
      existing.preservationRequired === true ||
      row.preservationRequired === true;
    existing.expansionEligible =
      existing.expansionEligible === true ||
      row.expansionEligible === true;
    existing.priorityScore = Math.max(
      toNumber(existing.priorityScore, 0),
      toNumber(row.priorityScore, 0)
    );
  });
});

compatibleTicketSheets.possibility = [
  ...possibilityMap.values()
].sort(
  (a, b) =>
    Number(b.preservationRequired) -
      Number(a.preservationRequired) ||
    toNumber(b.priorityScore, 0) -
      toNumber(a.priorityScore, 0) ||
    a.ticket.localeCompare(b.ticket)
);

const compatibleAiTicketMap =
  new Map();

[
  ...compatibleTicketSheets.main,
  ...compatibleTicketSheets.cover,
  ...compatibleTicketSheets.flow,
  ...compatibleTicketSheets.hole
].forEach((item) => {
  const existing =
    compatibleAiTicketMap.get(
      item.ticket
    );

  if (!existing) {
    compatibleAiTicketMap.set(
      item.ticket,
      { ...item }
    );
    return;
  }

  existing.categories = [
    ...new Set([
      ...(existing.categories || []),
      ...(item.categories || [])
    ])
  ];
  existing.scenarioTypes = [
    ...new Set([
      ...(existing.scenarioTypes || []),
      ...(item.scenarioTypes || [])
    ])
  ];
  existing.isManshu =
    existing.isManshu ||
    item.isManshu;
  existing.coveredEvaluationIds = [
    ...new Set([
      ...(existing.coveredEvaluationIds || []),
      ...(item.coveredEvaluationIds || [])
    ])
  ];
  existing.coveredBoatNos = [
    ...new Set([
      ...(existing.coveredBoatNos || []),
      ...(item.coveredBoatNos || [])
    ])
  ];
  existing.evidenceReasons = [
    ...new Set([
      ...(existing.evidenceReasons || []),
      ...(item.evidenceReasons || [])
    ])
  ];
  existing.evidenceQualified =
    existing.evidenceQualified === true ||
    item.evidenceQualified === true;
  existing.expansionEligible =
    existing.expansionEligible === true ||
    item.expansionEligible === true;
  existing.preservationRequired =
    existing.preservationRequired === true ||
    item.preservationRequired === true;
  existing.priorityScore = Math.max(
    toNumber(existing.priorityScore, 0),
    toNumber(item.priorityScore, 0)
  );
});

const compatibleAiTicketList =
  [...compatibleAiTicketMap.values()];

const evaluationIntegrity = {
  targets: activeEvaluationTargets.map((target) => ({
    ...target,
    status:
      target.candidateTickets.length
        ? "candidate-generated"
        : "no-physical-route"
  })),
  missingCandidateTargetIds:
    activeEvaluationTargets
      .filter(
        (target) =>
          !target.candidateTickets.length
      )
      .map((target) => target.id)
};

compatibleFormation.possibilityCandidates =
  compatibleTicketSheets.possibility;
compatibleFormation.ticketEvidence =
  structuredTicketEvidence;
compatibleFormation.evidence = {
  ...(compatibleFormation.evidence || {}),
  evaluatedTargets:
    evaluationIntegrity.targets,
  evaluationIntegrity
};

const preservedEvaluations =
  Array.isArray(
    basePrediction?.boatEvaluation?.evaluations
  ) &&
  basePrediction.boatEvaluation.evaluations.length
    ? basePrediction.boatEvaluation.evaluations
    : Array.isArray(oldMainSheet?.evaluations) &&
        oldMainSheet.evaluations.length
      ? oldMainSheet.evaluations
      : coreEvaluations;
const compatibleMainSheet = {
  ...oldMainSheet,
  honmei,
  taikou,
  ana,
  osae,
  tickets: compatibleTicketSheets.main,
  coverTickets: compatibleTicketSheets.cover,
  flowTickets: compatibleTicketSheets.flow,
  evaluations: preservedEvaluations
};
const compatibleBoatEvaluation = {
  ...(basePrediction.boatEvaluation || {}),
  honmei,
  taikou,
  ana,
  osae,
  evaluations: preservedEvaluations
};

const compatibleManshuSheet = {
  ...(basePrediction.manshuSheet || {}),
  tickets: compatibleTicketSheets.hole
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

const reconciledMarks = {
  ...(aiCore.marks || {}),
  honmei,
  taikou,
  ana,
  osae,
  evidence: {
    ...(aiCore.marks?.evidence || {}),
    source: "reconciled-structured-evaluation"
  }
};
const compatibleFormations = {
  ...coreFormations,
  possibilityCandidates:
    compatibleTicketSheets.possibility,
  ticketEvidence:
    structuredTicketEvidence,
  evidence:
    compatibleFormation.evidence
};
const compatibleAiCore = {
  ...aiCore,
  marks: reconciledMarks,
  formations: compatibleFormations,
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
        marks: reconciledMarks
      },

      indexes: {
        ...(basePrediction.indexes || {}),
        ai: aiCore.ranking,
        aiCore: aiCore.analyses,
        courseStructureRanking:
          aiCore.courseStructureTheory
            ?.ranking || [],
        stSlitRanking:
          aiCore.stSlitTheory
            ?.ranking || [],
        exhibitionPerformanceRanking:
          aiCore.exhibitionPerformanceTheory
            ?.roles || [],
        attackRanking: aiCore.attackTheory?.ranking || [],
        wallRanking: aiCore.wallTheory?.ranking || [],
        holdRanking:
          aiCore.holdPickupTheory?.secondCandidates || [],
        pickupRanking:
          aiCore.holdPickupTheory?.thirdCandidates || [],
        flowRanking: aiCore.flowTheory?.ranking || [],
        roadRanking: aiCore.roadTheory?.ranking || [],
        localRanking: aiCore.localTheory?.ranking || [],
        newEnvironmentRanking:
          aiCore.newEnvironmentTheory?.ranking || [],
        waterWeatherRanking:
          aiCore.waterWeatherTheory?.ranking || [],
        racerSkillRanking:
          aiCore.racerSkillTheory?.ranking || [],
        motorMaintenanceRanking:
          aiCore.motorMaintenanceTheory?.ranking || []
      },

      raceFlow: compatibleRaceFlow,

      boatEvaluation:
        compatibleBoatEvaluation,

      /*
        STEP1確認用：
        AIコアの順位を既存UI形式へ変換する。
      */
      mainSheet: compatibleMainSheet,

      formation: compatibleFormation,
      formations: compatibleFormations,
      ticketSheets: {
        ...compatibleTicketSheets,
        all:
          compatibleAiTicketList
      },

      manshuSheet: compatibleManshuSheet,
      aiTicketList:
        compatibleAiTicketList,
      longshotSheet: basePrediction.longshotSheet,

      slit: aiCore.slit,
      doubleTime: aiCore.doubleTime,
      newSam: aiCore.newSam,

      attackTheory: aiCore.attackTheory,
      stSlitTheory:
        aiCore.stSlitTheory,
      courseStructureTheory:
        aiCore.courseStructureTheory,
      exhibitionPerformanceTheory:
        aiCore.exhibitionPerformanceTheory,
      wallTheory: aiCore.wallTheory,
      holdPickupTheory: aiCore.holdPickupTheory,
      flowTheory: aiCore.flowTheory,
      roadTheory: aiCore.roadTheory,
      localTheory: aiCore.localTheory,
      newEnvironmentTheory: aiCore.newEnvironmentTheory,
      waterWeatherTheory: aiCore.waterWeatherTheory,
      racerSkillTheory: aiCore.racerSkillTheory,
      motorMaintenanceTheory: aiCore.motorMaintenanceTheory,

      comments: aiCore.comments,

      coreRanking: aiCore.ranking
    };
  }

  function getEvaluatedScenarioCandidateApi() {
    if (
      typeof window !== "undefined" &&
      window.ChappyEvaluatedScenarioCandidates
    ) {
      return window.ChappyEvaluatedScenarioCandidates;
    }

    if (
      typeof module !== "undefined" &&
      module.exports &&
      typeof require === "function"
    ) {
      return require(
        "./evaluated-scenario-candidates"
      );
    }

    return null;
  }

  /*
    最終予想の本線は、オッズ取得前にAIコアが比較した正式主展開を
    正本とする。prediction.js 側の旧印は評価候補として残すが、
    正式主展開より優先して本線頭へ戻さない。

    評価済み展開は専用モジュールで全物理枝へ展開し、通常買い目と
    8〜10点候補の双方へ同じ枝ID・艇・着順・理由を渡す。
  */
  function mergeWithPrediction(prediction, data) {
    const basePrediction =
      prediction &&
      typeof prediction === "object"
        ? prediction
        : {};
    const candidateApi =
      getEvaluatedScenarioCandidateApi();

    if (!candidateApi?.build) {
      throw new Error(
        "評価済み展開候補モジュールが未読込です"
      );
    }

    const aiCore = buildPredictionData(data);
    const analysisRaceScenarios = aiCore.raceScenarios || {};
    const formalMainScenario =
      analysisRaceScenarios.mainScenario || null;
    const markBoatNo = (mark) => {
      const primitive = Number(mark);

      if (
        Number.isInteger(primitive) &&
        primitive >= 1 &&
        primitive <= 6
      ) {
        return primitive;
      }

      return Number(
        mark?.boatNo ??
        mark?.number ??
        mark?.waku ??
        mark?.boat ??
        0
      );
    };
    const formalMainHeadBoatNo = markBoatNo(
      formalMainScenario?.headBoatNo ??
      formalMainScenario?.attackerBoatNo ??
      formalMainScenario?.attacker ??
      formalMainScenario?.outcome
        ?.firstCandidates?.[0] ??
      aiCore.marks?.honmei
    );
    const originalMainSheet =
      basePrediction.mainSheet &&
      !Array.isArray(basePrediction.mainSheet)
        ? basePrediction.mainSheet
        : {};
    const originalBoatEvaluation =
      basePrediction.boatEvaluation &&
      !Array.isArray(basePrediction.boatEvaluation)
        ? basePrediction.boatEvaluation
        : originalMainSheet;
    const originalFormation =
      basePrediction.formation ||
      basePrediction.formations ||
      {};
    const evaluations =
      Array.isArray(originalBoatEvaluation.evaluations)
        ? originalBoatEvaluation.evaluations
        : Array.isArray(originalMainSheet.evaluations)
          ? originalMainSheet.evaluations
          : [];
    const evaluationByBoat = new Map(
      evaluations.map((evaluation) => [
        markBoatNo(evaluation),
        evaluation
      ])
    );
    const evaluationFor = (mark) => {
      const boatNo = markBoatNo(mark);

      if (boatNo < 1 || boatNo > 6) {
        return null;
      }

      return (
        evaluationByBoat.get(boatNo) ||
        mark ||
        null
      );
    };
    const formalMarks = aiCore.marks || {};
    const markKeys = [
      "honmei",
      "taikou",
      "ana",
      "osae"
    ];
    const alignedMarks = {};
    const usedMarkBoatNos =
      new Set();

    markKeys
      .forEach((key) => {
        const candidates = [
          key === "honmei"
            ? { boatNo: formalMainHeadBoatNo }
            : null,
          formalMarks[key],
          ...evaluations
        ].filter(Boolean);
        const selected =
          candidates.find((candidate) => {
            const boatNo =
              markBoatNo(candidate);

            return (
              boatNo >= 1 &&
              boatNo <= 6 &&
              !usedMarkBoatNos.has(boatNo)
            );
          }) || null;
        const boatNo =
          markBoatNo(selected);

        alignedMarks[key] =
          evaluationFor(selected);
        if (boatNo) {
          usedMarkBoatNos.add(boatNo);
        }
      });
    const formalMarkBoatNos =
      new Set(
        markKeys
          .map((key) =>
            markBoatNo(
              alignedMarks[key]
            )
          )
          .filter(Boolean)
      );
    const preservedTargetBoatNos =
      new Set();
    const preservedEvaluationTargets =
      markKeys
        .map((key) => {
          const legacyMark =
            originalBoatEvaluation[key] ||
            originalMainSheet[key] ||
            null;
          const boatNo =
            markBoatNo(legacyMark);

          if (
            boatNo < 1 ||
            boatNo > 6 ||
            formalMarkBoatNos.has(boatNo) ||
            preservedTargetBoatNos.has(boatNo)
          ) {
            return null;
          }

          preservedTargetBoatNos.add(boatNo);
          return {
            boatNo,
            markKey: key,
            symbol:
              key === "honmei"
                ? "◎"
                : key === "taikou"
                  ? "○"
                  : key === "ana"
                    ? "▲"
                    : "△",
            evaluation:
              evaluationFor(legacyMark),
            source:
              "displaced-legacy-mark"
          };
        })
        .filter(Boolean);
    const formalFormation = aiCore.formations || {};
    const formalMainTickets = ticketStrings(
      formalFormation.main
    ).filter(
      (ticket) =>
        Number(ticket.split("-")[0]) ===
        formalMainHeadBoatNo
    );
    const originalMainTickets = ticketStrings(
      originalMainSheet.tickets,
      originalFormation.main
    );
    const retainedOldHeadTickets =
      originalMainTickets
        .filter(
          (ticket) =>
            Number(ticket.split("-")[0]) !==
            formalMainHeadBoatNo
        )
        .slice(0, 2);
    const retainedOldHeadTicketSet =
      new Set(retainedOldHeadTickets);
    const alignedCoverTickets = ticketStrings(
      formalFormation.safety,
      formalFormation.cover
    ).filter(
      (ticket) =>
        !formalMainTickets.includes(ticket) &&
        !retainedOldHeadTicketSet.has(ticket)
    );
    const alignedFlowTickets = ticketStrings(
      formalFormation.flow
    );
    /*
      流しは同一1/2着軸で正式な3着根拠が2艇そろうかを
      実戦厳選側で比較するため、全4・8・12候補を構造化する。
      実際の購入は実戦厳選が根拠上位2点へ絞る。
    */
    const practicalFlowTickets =
      [...alignedFlowTickets];
    const alignedFlowFormations = (
      Array.isArray(formalFormation.flowFormations)
        ? formalFormation.flowFormations
        : []
    ).map((formation) => ({
      ...formation,
      secondBoatNos: [
        ...(formation?.secondBoatNos || [])
      ],
      secondPriorityBoatNos: [
        ...(
          formation?.secondPriorityBoatNos ||
          formation?.secondBoatNos ||
          []
        )
      ],
      expandedTickets: [
        ...(formation?.expandedTickets || [])
      ],
      tickets: [
        ...(formation?.tickets || [])
      ]
    }));
    const alignedHoleTickets = ticketStrings(
      formalFormation.longshot,
      retainedOldHeadTickets
    ).filter(
      (ticket) =>
        !formalMainTickets.includes(ticket) &&
        !alignedCoverTickets.includes(ticket)
    );
    const alignedFormation = {
      ...originalFormation,
      main: formalMainTickets,
      cover: alignedCoverTickets,
      safety: alignedCoverTickets,
      nagashi: practicalFlowTickets,
      flow: practicalFlowTickets,
      flowFormations:
        alignedFlowFormations,
      hole: alignedHoleTickets,
      longshot: alignedHoleTickets,
      mainEstablished:
        formalFormation.mainEstablished === true &&
        formalMainHeadBoatNo >= 1 &&
        formalMainTickets.length >= 3 &&
        alignedCoverTickets.length >= 2
    };
    const originalRaceFlow =
      basePrediction.raceFlow || {};
    const formalOutcome =
      formalMainScenario?.outcome || {};
    const formalSecondCandidates =
      Array.isArray(
        formalOutcome.secondCandidates
      )
        ? formalOutcome.secondCandidates
        : [];
    const formalThirdCandidates =
      Array.isArray(
        formalOutcome.thirdCandidates
      )
        ? formalOutcome.thirdCandidates
        : [];
    const formalRoleRows = (
      candidates,
      role
    ) => {
      const seen = new Set();

      return candidates
        .map((candidate) => {
          const boatNo =
            markBoatNo(candidate);

          if (
            boatNo < 1 ||
            boatNo > 6 ||
            seen.has(boatNo)
          ) {
            return null;
          }

          seen.add(boatNo);
          const evaluation =
            evaluationFor(candidate) || {};

          return {
            ...evaluation,
            ...(
              candidate &&
              typeof candidate === "object"
                ? candidate
                : {}
            ),
            boatNo,
            course: Number(
              candidate?.course ??
              evaluation?.course ??
              boatNo
            ),
            score: toNumber(
              candidate?.score ??
              evaluation?.[role] ??
              evaluation?.score,
              1
            ),
            reason:
              String(
                candidate?.reason ||
                evaluation?.comment ||
                `${boatNo}号艇を正式${role === "hold" ? "残し" : "拾い"}候補として採用`
              ),
            qualified: true,
            isAdopted: true,
            status:
              candidate?.status ||
              "正式採用",
            scenarioRole: role
          };
        })
        .filter(Boolean);
    };
    const formalHoldBoats =
      formalRoleRows(
        formalSecondCandidates,
        "hold"
      );
    const formalPickupBoats =
      formalRoleRows(
        formalThirdCandidates,
        "pickup"
      );
    const formalScenarioLabel =
      String(
        formalMainScenario?.label ||
        `${formalMainHeadBoatNo}号艇1着`
      );
    const secondBoatText =
      formalHoldBoats
        .map((row) => row.boatNo)
        .join("・");
    const thirdBoatText =
      formalPickupBoats
        .map((row) => row.boatNo)
        .join("・");
    const formalScenarioSummary =
      `最有力展開は${formalScenarioLabel}。` +
      `${formalMainHeadBoatNo}号艇を1着軸に、` +
      (
        secondBoatText
          ? `2着残しは${secondBoatText}号艇、`
          : ""
      ) +
      (
        thirdBoatText
          ? `3着拾いは${thirdBoatText}号艇を評価する。`
          : "着順候補は展開成立後に評価する。"
      );
    const formalAttack =
      formalMainHeadBoatNo >= 1
        ? {
            ...(alignedMarks.honmei || {}),
            boatNo: formalMainHeadBoatNo,
            course: Number(
              formalMainScenario?.attackerCourse ||
              alignedMarks.honmei?.course ||
              formalMainHeadBoatNo
            ),
            score: toNumber(
              formalMainScenario?.score,
              1
            ),
            reason:
              `${formalMainScenario?.label ||
                `${formalMainHeadBoatNo}号艇1着`}を正式主展開として採用`,
            qualified: true,
            isAdopted: true,
            status: "正式採用"
          }
        : null;
    const alternateRoleRow = (
      row,
      role
    ) => ({
      ...row,
      boatNo: markBoatNo(row),
      qualified: true,
      isAdopted: true,
      isFormal: false,
      isAlternateScenario: true,
      status: "対抗展開として採用",
      adoptionScope:
        "alternate-scenario-only",
      scenarioRole: role,
      qualificationSource:
        `alternateScenarioRoles.${role}Boats`
    });
    const alternateAttackBoats =
      (originalRaceFlow.attackBoats || [])
        .filter(
          (row) =>
            preservedTargetBoatNos.has(
              markBoatNo(row)
            )
        )
        .map((row) =>
          alternateRoleRow(row, "attack")
        );
    const alternateHoldBoats =
      (originalRaceFlow.holdBoats || [])
        .filter(
          (row) =>
            preservedTargetBoatNos.has(
              markBoatNo(row)
            )
        )
        .map((row) =>
          alternateRoleRow(row, "hold")
        );
    const alternatePickupBoats =
      (originalRaceFlow.pickupBoats || [])
        .filter(
          (row) =>
            preservedTargetBoatNos.has(
              markBoatNo(row)
            )
        )
        .map((row) =>
          alternateRoleRow(row, "pickup")
        );
    const formalGoalOrder = [
      formalAttack,
      formalHoldBoats[0],
      formalPickupBoats[0]
    ].filter(Boolean);
    const alignedRaceFlow = {
      ...originalRaceFlow,
      title:
        formalScenarioLabel,
      summary:
        formalScenarioSummary,
      comment:
        formalScenarioSummary,
      attackBoats: formalAttack
        ? [formalAttack]
        : [],
      holdBoats:
        formalHoldBoats,
      pickupBoats:
        formalPickupBoats,
      alternateScenarioRoles: {
        source:
          "displaced-legacy-evaluation",
        attackBoats:
          alternateAttackBoats,
        holdBoats:
          alternateHoldBoats,
        pickupBoats:
          alternatePickupBoats,
        phases:
          originalRaceFlow.phases || {}
      },
      phases: {
        ...(originalRaceFlow.phases || {}),
        firstMark: {
          ...(originalRaceFlow.phases?.firstMark || {}),
          mainAttack: formalAttack,
          secondAttack: null,
          mainHold:
            formalHoldBoats[0] || null,
          comment:
            formalScenarioSummary
        },
        back: {
          ...(originalRaceFlow.phases?.back || {}),
          leader: formalAttack,
          hold:
            formalHoldBoats[0] || null,
          pickup:
            formalPickupBoats[0] || null,
          comment:
            formalScenarioSummary
        },
        secondMark: {
          ...(originalRaceFlow.phases?.secondMark || {}),
          mainPickup:
            formalPickupBoats[0] || null,
          secondPickup:
            formalPickupBoats[1] || null,
          mainHold:
            formalHoldBoats[0] || null
        },
        goal: {
          ...(originalRaceFlow.phases?.goal || {}),
          expectedOrder:
            formalGoalOrder,
          comment:
            formalScenarioSummary
        }
      }
    };
    const alignedPrediction = {
      ...basePrediction,
      raceFlow: alignedRaceFlow,
      preservedEvaluationTargets,
      boatEvaluation: {
        ...originalBoatEvaluation,
        ...alignedMarks,
        evaluations
      },
      mainSheet: {
        ...originalMainSheet,
        ...alignedMarks,
        evaluations,
        tickets: formalMainTickets,
        coverTickets: alignedCoverTickets,
        flowTickets: practicalFlowTickets,
        flowFormations:
          alignedFlowFormations
      },
      formation: alignedFormation,
      formations: alignedFormation
    };
    const decision =
      candidateApi.build(alignedPrediction);
    const oldMainSheet =
      alignedPrediction.mainSheet &&
      !Array.isArray(
        alignedPrediction.mainSheet
      )
        ? alignedPrediction.mainSheet
        : {};
    const oldManshuSheet =
      basePrediction.manshuSheet &&
      !Array.isArray(basePrediction.manshuSheet)
        ? basePrediction.manshuSheet
        : {};
    const baseFormation =
      alignedPrediction.formation || {};
    const officialOddsSource =
      data?.odds?.byTicket;
    const hasOfficialOddsMap =
      officialOddsSource !== null &&
      typeof officialOddsSource === "object" &&
      !Array.isArray(officialOddsSource);
    const oddsByTicket =
      hasOfficialOddsMap
        ? officialOddsSource
        : {};
    const baseTicketByValue =
      new Map(
        (
          Array.isArray(
            basePrediction.aiTicketList
          )
            ? basePrediction.aiTicketList
            : []
        ).map((item) => [
          String(item?.ticket || ""),
          item
        ])
      );

    function ticketValue(value) {
      return String(
        value?.ticket ||
        value ||
        ""
      ).trim();
    }

    function ticketStrings(...sources) {
      return [
        ...new Set(
          sources
            .flatMap((source) =>
              Array.isArray(source)
                ? source
                : []
            )
            .map(ticketValue)
            .filter((value) =>
              candidateApi.exactTicket(value)
            )
        )
      ];
    }

    function hydrateTicket(
      value,
      category,
      scenarioType
    ) {
      const ticket =
        ticketValue(value);
      const baseRow =
        (
          value &&
          typeof value === "object"
            ? value
            : baseTicketByValue.get(ticket)
        ) || {};
      const candidate =
        decision.candidateByTicket
          .get(ticket) || null;
      const presentationGroup =
        category === "本命"
          ? "main"
          : category === "押さえ"
            ? "cover"
            : category === "流し"
              ? "flow"
              : category === "穴候補"
                ? "hole"
                : "";
      const isPossibility =
        presentationGroup === "";
      const presentationByGroup =
        candidate
          ?.presentationByGroup &&
        typeof candidate
          .presentationByGroup ===
          "object"
          ? candidate
              .presentationByGroup
          : {};
      const groupPresentation =
        presentationGroup
          ? presentationByGroup[
              presentationGroup
            ] || null
          : null;
      const uniqueIds =
        (...sources) => [
          ...new Set(
            sources
              .flatMap((source) =>
                Array.isArray(source)
                  ? source
                  : []
              )
              .map((id) =>
                String(id || "")
              )
              .filter(Boolean)
          )
        ];
      const independentBranchIds =
        uniqueIds(
          candidate
            ?.independentBranchIds
        );
      const candidateSupportingIndependentBranchIds =
        uniqueIds(
          candidate
            ?.supportingIndependentBranchIds
        );
      const groupBranchIds =
        uniqueIds(
          groupPresentation
            ?.branchIds,
          groupPresentation
            ?.structuredEvidence
            ?.branchIds
        );
      const supportingIndependentBranchIds =
        isPossibility
          ? candidateSupportingIndependentBranchIds
          : uniqueIds(
              groupPresentation
                ?.supportingIndependentBranchIds
            );
      const presentationBranchIds =
        Object.values(
          presentationByGroup
        ).flatMap(
          (presentation) =>
            uniqueIds(
              presentation
                ?.branchIds,
              presentation
                ?.structuredEvidence
                ?.branchIds,
              presentation
                ?.supportingIndependentBranchIds
            )
        );
      const allBranchIds =
        uniqueIds(
          candidate
            ?.allBranchIds,
          candidate?.branchIds,
          independentBranchIds,
          candidateSupportingIndependentBranchIds,
          presentationBranchIds
        );
      const activeBranchIds =
        isPossibility
          ? allBranchIds
          : groupBranchIds;
      const activePresentation =
        isPossibility
          ? candidate
          : groupPresentation;
      const officialOdds =
        oddsByTicket[ticket];
      const rawOdds =
        hasOfficialOddsMap
          ? officialOdds
          : baseRow.odds;
      const numericOdds =
        Number(rawOdds);
      const hasOdds =
        rawOdds !== null &&
        rawOdds !== undefined &&
        rawOdds !== "" &&
        Number.isFinite(numericOdds) &&
        numericOdds > 0;
      const numbers =
        candidateApi.exactTicket(ticket);
      const generatedSummary =
        numbers
          ? `${decision.scenarioTitle}から作られた` +
            `${category}候補。` +
            `${numbers[0]}号艇1着、` +
            `${numbers[1]}号艇2着、` +
            `${numbers[2]}号艇3着の順で評価する。`
          : "";
      const hasStructuredCandidate =
        isPossibility
          ? candidate
              ?.evidenceQualified ===
              true
          : activeBranchIds.length > 0;
      const hasIndependentCandidate =
        isPossibility
          ? candidate
              ?.expansionEligible ===
              true
          : supportingIndependentBranchIds
              .length > 0;
      const scenarioSummary =
        String(
          activePresentation
            ?.scenarioSummary ||
          activePresentation
            ?.summary ||
          generatedSummary
        ).trim();
      const scenarioTitle =
        String(
          activePresentation
            ?.scenarioTitle ||
          activePresentation
            ?.title ||
          (
            presentationGroup
              ? `${ticket}の${category}展開`
              : candidate
                  ?.scenarioTitle
          ) ||
          decision.scenarioTitle
        ).trim();
      const presentationSource =
        String(
          activePresentation
            ?.source ||
          activePresentation
            ?.structuredEvidence
            ?.source ||
          (
            presentationGroup &&
            activeBranchIds.length
              ? `base-formation:` +
                presentationGroup
              : ""
          )
        ).trim();
      const structuredEvidence =
        activePresentation
          ?.structuredEvidence ||
        (
          presentationGroup &&
          activeBranchIds.length
            ? {
                branchIds: [
                  ...activeBranchIds
                ],
                source:
                  presentationSource
              }
            : null
        );

      return {
        ...baseRow,
        ticket,
        category,
        categories: [
          category
        ],
        scenarioType,
        scenarioTypes: [
          scenarioType
        ],
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
        scenarioTitle,
        scenarioSummary,
        reason: scenarioSummary,
        comment: scenarioSummary,
        source:
          presentationSource,
        presentationSource,
        candidateId:
          candidate?.id || "",
        candidateKind:
          candidate?.candidateKind ||
          "categorized-ticket",
        branchIds: [
          ...activeBranchIds
        ],
        allBranchIds: [
          ...allBranchIds
        ],
        independentBranchIds: [
          ...independentBranchIds
        ],
        supportingIndependentBranchIds: [
          ...supportingIndependentBranchIds
        ],
        requirementIds: [
          ...(candidate?.requirementIds || [])
        ],
        coverage: [
          ...(candidate?.coverage || [])
        ],
        physicalCoverage: [
          ...(candidate?.physicalCoverage || [])
        ],
        coveredEvaluationIds: [
          ...(candidate
            ?.coveredEvaluationIds || [])
        ],
        coveredBoatNos: [
          ...(candidate?.coveredBoatNos || [])
        ],
        candidateOnlyEvaluationIds: [
          ...(candidate
            ?.candidateOnlyEvaluationIds || [])
        ],
        evidenceReasons: [
          ...(candidate
            ?.evidenceReasons || [])
        ],
        evidenceQualified:
          hasStructuredCandidate,
        expansionEligible:
          hasIndependentCandidate,
        preservationRequired:
          isPossibility
            ? candidate
                ?.preservationRequired ===
                true
            : supportingIndependentBranchIds
                .length > 0,
        coverageKey:
          candidate?.coverageKey || "",
        priorityScore:
          toNumber(
            candidate?.priorityScore,
            0
          ),
        structuredEvidence:
          structuredEvidence,
        presentationGroup,
        presentationByGroup
      };
    }

    const baseMainTickets =
      ticketStrings(
        oldMainSheet.tickets,
        baseFormation.main
      );
    const mainTickets =
      baseMainTickets.filter(
        (ticket) =>
          Number(
            ticket.split("-")[0]
          ) ===
          decision.mainHeadBoatNo
      );
    const alternateHeadTickets =
      baseMainTickets.filter(
        (ticket) =>
          !mainTickets.includes(ticket)
      );
    const coverTickets =
      ticketStrings(
        oldMainSheet.coverTickets,
        baseFormation.cover,
        baseFormation.safety,
        alternateHeadTickets
      ).filter(
        (ticket) =>
          !mainTickets.includes(ticket)
      );
    const flowTickets =
      ticketStrings(
        alignedFlowTickets,
        oldMainSheet.flowTickets,
        baseFormation.nagashi,
        baseFormation.flow
      );
    const holeTickets =
      ticketStrings(
        oldManshuSheet.tickets,
        baseFormation.hole,
        baseFormation.longshot
      ).filter(
        (ticket) =>
          !mainTickets.includes(ticket) &&
          !coverTickets.includes(ticket)
      );
    const ticketSheets = {
      main:
        mainTickets.map((ticket) =>
          hydrateTicket(
            ticket,
            "本命",
            "中心展開"
          )
        ),
      cover:
        coverTickets.map((ticket) =>
          hydrateTicket(
            ticket,
            "押さえ",
            "安全押さえ"
          )
        ),
      flow:
        flowTickets.map((ticket) =>
          hydrateTicket(
            ticket,
            "流し",
            "流し展開"
          )
        ),
      hole:
        holeTickets.map((ticket) =>
          hydrateTicket(
            ticket,
            "穴候補",
            "穴展開"
          )
        ),
      possibility:
        decision.candidatePool.map(
          (candidate) =>
            hydrateTicket(
              candidate,
              "展開候補",
              candidate.candidateKind
            )
        )
    };
    const allTicketMap =
      new Map();

    [
      ...ticketSheets.main,
      ...ticketSheets.cover,
      ...ticketSheets.flow,
      ...ticketSheets.hole
    ].forEach((item) => {
      const existing =
        allTicketMap.get(item.ticket);

      if (!existing) {
        allTicketMap.set(
          item.ticket,
          { ...item }
        );
        return;
      }

      existing.categories = [
        ...new Set([
          ...(existing.categories || []),
          ...(item.categories || [])
        ])
      ];
      existing.scenarioTypes = [
        ...new Set([
          ...(existing.scenarioTypes || []),
          ...(item.scenarioTypes || [])
        ])
      ];
    });

    const canonicalRanking = [
      ...new Set([
        decision.mainHeadBoatNo,
        ...[
          decision.marks.taikou,
          decision.marks.ana,
          decision.marks.osae
        ].map((mark) =>
          Number(mark?.boatNo || 0)
        ),
        ...decision.evaluations.map(
          (evaluation) =>
            Number(
              evaluation?.boatNo || 0
            )
        )
      ])
    ]
      .filter(
        (boatNo) =>
          boatNo >= 1 &&
          boatNo <= 6
      )
      .map((boatNo) =>
        decision.evaluations.find(
          (evaluation) =>
            Number(
              evaluation?.boatNo || 0
            ) === boatNo
        )
      )
      .filter(Boolean);
    const holdByBoat =
      new Map(
        (
          alignedPrediction.raceFlow
            ?.holdBoats || []
        ).map((row) => [
          Number(row?.boatNo || 0),
          row
        ])
      );
    const pickupByBoat =
      new Map(
        (
          alignedPrediction.raceFlow
            ?.pickupBoats || []
        ).map((row) => [
          Number(row?.boatNo || 0),
          row
        ])
      );
    const canonicalHoldPickupTheory = {
      source:
        "canonical-race-flow",
      isFormal: true,
      isProvisional: false,
      attackerBoatNo:
        formalMainHeadBoatNo,
      roles:
        decision.evaluations.map(
          (evaluation) => {
            const boatNo =
              Number(
                evaluation?.boatNo || 0
              );
            const hold =
              holdByBoat.get(boatNo);
            const pickup =
              pickupByBoat.get(boatNo);

            return {
              boatNo,
              hold:
                hold
                  ? {
                      score:
                        toNumber(
                          hold.score,
                          0
                        ),
                      reason:
                        String(
                          hold.reason || ""
                        ),
                      isFormal: true,
                      status:
                        "構造化展開"
                    }
                  : null,
              pickup:
                pickup
                  ? {
                      score:
                        toNumber(
                          pickup.score,
                          0
                        ),
                      reason:
                        String(
                          pickup.reason || ""
                        ),
                      isFormal: true,
                      status:
                        "構造化展開"
                    }
                  : null
            };
          }
        ),
      secondCandidates:
        [
          ...holdByBoat.values()
        ],
      thirdCandidates:
        [
          ...pickupByBoat.values()
        ]
    };
    const canonicalMarks = {
      ...decision.marks,
      evidence: {
        source:
          "canonical-boat-evaluation",
        evaluatedTargetIds:
          decision.targets.map(
            (target) => target.id
          )
      }
    };
    const canonicalBoatEvaluation = {
      ...(alignedPrediction.boatEvaluation || {}),
      ...decision.marks,
      evaluations:
        decision.evaluations
    };
    const canonicalMainSheet = {
      ...oldMainSheet,
      ...decision.marks,
      evaluations:
        decision.evaluations,
      tickets:
        ticketSheets.main,
      coverTickets:
        ticketSheets.cover,
      flowTickets:
        ticketSheets.flow.filter((row) =>
          practicalFlowTickets.includes(row.ticket)
        ),
      flowFormations:
        alignedFlowFormations
    };
    const rawFormationEvidence =
      aiCore.formations?.evidence || {};
    const mainEstablished =
      alignedFormation
        .mainEstablished === true &&
      decision.mainHeadBoatNo ===
        formalMainHeadBoatNo &&
      mainTickets.length >= 3 &&
      coverTickets.length >= 2;
    const formationEvidence = {
      ...rawFormationEvidence,
      source:
        "canonical-evaluated-scenario",
      flow:
        rawFormationEvidence.flow === true,
      longshot:
        rawFormationEvidence.longshot === true,
      evaluatedTargets:
        decision.targets,
      branches:
        decision.branches,
      evaluationIntegrity:
        decision.integrity,
      primaryAttackerBoatNo:
        decision.primaryAttackerBoatNo,
      candidateGeneration:
        "before-ticket-limit"
    };
    const canonicalFormations = {
      ...baseFormation,
      main: mainTickets,
      safety: coverTickets,
      cover: coverTickets,
      flow: flowTickets,
      nagashi: flowTickets,
      flowFormations:
        alignedFlowFormations,
      longshot: holeTickets,
      hole: holeTickets,
      possibilityCandidates:
        ticketSheets.possibility,
      mainEstablished,
      evidence:
        formationEvidence
    };
    const canonicalMainScenario = {
      ...(formalMainScenario || {}),
      type:
        formalMainScenario?.type ||
        "formal-race-scenario",
      label:
        formalMainScenario?.label ||
        decision.scenarioTitle,
      score:
        toNumber(
          formalMainScenario?.score,
          0
        ),
      attacker:
        formalMainHeadBoatNo,
      attackerBoatNo:
        formalMainHeadBoatNo,
      headBoatNo:
        formalMainHeadBoatNo,
      summary:
        formalScenarioSummary,
      reason:
        formalScenarioSummary,
      qualified:
        mainEstablished,
      branches:
        decision.branches,
      outcome:
        formalMainScenario?.outcome ||
        {
          boats:
            decision.evaluations,
          firstCandidates: [
            decision.marks.honmei
          ].filter(Boolean),
          secondCandidates: [
            decision.marks.taikou,
            decision.marks.osae
          ].filter(Boolean),
          thirdCandidates: [
            decision.marks.ana,
            decision.marks.osae
          ].filter(Boolean)
        }
    };
    const analysisScenarioList =
      Array.isArray(
        analysisRaceScenarios
          .scenarios
      )
        ? analysisRaceScenarios
            .scenarios
        : [];
    const formalScenarioKey = [
      formalMainScenario?.type,
      formalMainScenario?.label,
      formalMainHeadBoatNo
    ].join(":");
    const supportingScenarioList =
      analysisScenarioList.filter(
        (scenario) => {
          const scenarioKey = [
            scenario?.type,
            scenario?.label,
            markBoatNo(
              scenario?.headBoatNo ??
              scenario?.attackerBoatNo ??
              scenario?.attacker
            )
          ].join(":");

          return scenarioKey !==
            formalScenarioKey;
        }
      );
    const canonicalRaceScenarios = {
      mainScenario:
        canonicalMainScenario,
      scenarios: [
        canonicalMainScenario,
        ...supportingScenarioList
      ],
      subScenario:
        analysisRaceScenarios
          .subScenario ||
        supportingScenarioList
          .find(
            (scenario) =>
              scenario !==
              formalMainScenario
          ) ||
        null,
      attacker:
        formalMainHeadBoatNo,
      attackerCourse:
        Number(
          formalMainScenario?.attackerCourse ??
          formalMainScenario?.attacker ??
          0
        ) || null,
      attackerBoatNo:
        formalMainHeadBoatNo,
      headBoatNo:
        formalMainHeadBoatNo,
      blockedBoats: [
        ...(
          analysisRaceScenarios
            .blockedBoats || []
        )
      ],
      analysisBlockedBoats: [
        ...(
          analysisRaceScenarios
            .blockedBoats || []
        )
      ],
      preservations:
        decision.branches.filter(
          (branch) =>
            branch.kind ===
            "independent-scenario"
        ),
      evidence: {
        ...(
          analysisRaceScenarios
            .evidence || {}
        ),
        source:
          "formal-race-scenario",
        branches:
          decision.branches,
        candidateCount:
          decision.candidatePool.length
      },
      holdPickupTheory:
        canonicalHoldPickupTheory
    };
    const canonicalAiCore = {
      ...aiCore,
      analysisRaceScenarios:
        analysisRaceScenarios,
      analysisRanking:
        aiCore.ranking,
      analysisMarks:
        aiCore.marks,
      raceScenarios:
        canonicalRaceScenarios,
      ranking:
        canonicalRanking,
      marks:
        canonicalMarks,
      formations:
        canonicalFormations,
      holdPickupTheory:
        canonicalHoldPickupTheory,
      mainSheet:
        canonicalMainSheet,
      ai: {
        ...(aiCore.ai || {}),
        marks:
          canonicalMarks,
        comment:
          formalScenarioSummary
      }
    };

    return {
      ...basePrediction,
      finalComment:
        formalScenarioSummary,
      finalAi: {
        ...(basePrediction.finalAi || {}),
        summary:
          formalScenarioSummary,
        final:
          formalScenarioSummary
      },
      aiCore:
        canonicalAiCore,
      ai: {
        ...(basePrediction.ai || {}),
        marks:
          canonicalMarks
      },
      raceFlow:
        alignedPrediction.raceFlow,
      preservedEvaluationTargets,
      boatEvaluation:
        canonicalBoatEvaluation,
      mainSheet:
        canonicalMainSheet,
      formation:
        canonicalFormations,
      formations:
        canonicalFormations,
      ticketSheets: {
        ...ticketSheets,
        all: [
          ...allTicketMap.values()
        ]
      },
      manshuSheet: {
        ...oldManshuSheet,
        tickets:
          ticketSheets.hole
      },
      aiTicketList: [
        ...allTicketMap.values()
      ],
      slit: aiCore.slit,
      doubleTime: aiCore.doubleTime,
      newSam: aiCore.newSam,
      attackTheory:
        aiCore.attackTheory,
      stSlitTheory:
        aiCore.stSlitTheory,
      courseStructureTheory:
        aiCore.courseStructureTheory,
      exhibitionPerformanceTheory:
        aiCore.exhibitionPerformanceTheory,
      wallTheory:
        aiCore.wallTheory,
      holdPickupTheory:
        canonicalHoldPickupTheory,
      flowTheory:
        aiCore.flowTheory,
      roadTheory:
        aiCore.roadTheory,
      localTheory:
        aiCore.localTheory,
      newEnvironmentTheory:
        aiCore.newEnvironmentTheory,
      waterWeatherTheory:
        aiCore.waterWeatherTheory,
      racerSkillTheory:
        aiCore.racerSkillTheory,
      motorMaintenanceTheory:
        aiCore.motorMaintenanceTheory,
      comments:
        decision.targets.map(
          (target) =>
            `${target.symbol}${target.boatNo}号艇：` +
            String(
              target.evaluation?.comment ||
              target.evaluation
                ?.shortComment ||
              ""
            )
        ),
      coreRanking:
        canonicalRanking,
      compatibilityAudit: {
        source:
          "canonical-boat-evaluation",
        analyticalCore:
          aiCore.marks,
        candidateCount:
          decision.candidatePool.length
      }
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

    buildStFoundationEvaluation,

    buildCourseStructureEvaluation,

    buildExhibitionPerformanceEvaluation,
    
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

    buildAttackTheory,

    buildWallTheory,

    buildHoldPickupTheory,

    buildFlowTheory,

    buildRoadTheory,

    buildLocalTheory,

    getNewEnvironmentPeriod,

    buildNewEnvironmentTheory,

    buildWaterWeatherTheory,

    buildRacerSkillTheory,

    buildMotorMaintenanceTheory,

    calcRaceFlowIndex,

    calcTurnIndex,

    calcTotalIndex,

    /* ==========================
       AI理論
    ========================== */

    buildSlitAnalysis,

    buildDoubleTime,

    buildNewSam,

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

    buildOfficialCourseMapping,

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
