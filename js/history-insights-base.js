/* =========================================================
  公式3年履歴の場＋R別分析
  - 直近1年を優先し、過去2年で裏付ける
  - 予想点・買い目・70点基準は変更しない
========================================================= */

(function (root, factory) {
  "use strict";

  const api = factory();
  if (
    typeof module === "object" &&
    module.exports
  ) {
    module.exports = api;
  }

  if (root) {
    root.ChappyHistoryInsights =
      Object.freeze(api);
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis,
  function () {
    "use strict";

    const MIN_SAMPLES = 30;

    function number(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? parsed
        : fallback;
    }

    function normalizeJcd(value) {
      const parsed = Number(value);

      return (
        Number.isInteger(parsed) &&
        parsed >= 1 &&
        parsed <= 24
      )
        ? String(parsed).padStart(2, "0")
        : "";
    }

    function normalizeRaceNo(value) {
      const parsed = Number(value);

      return (
        Number.isInteger(parsed) &&
        parsed >= 1 &&
        parsed <= 12
      )
        ? String(parsed)
        : "";
    }

    function getPattern(
      stats,
      jcd,
      raceNo
    ) {
      const code = normalizeJcd(jcd);
      const race = normalizeRaceNo(raceNo);

      if (!code || !race) return null;

      return (
        stats?.byVenueRace?.[code]?.[race] ||
        null
      );
    }

    function rateOf(value) {
      return number(value?.rate, 0);
    }

    function buildTrend(
      pattern,
      baselinePattern = null
    ) {
      if (!pattern) return null;

      const recent =
        pattern.recent1Year || {};
      const previous =
        pattern.previous2Years || {};
      const all =
        pattern.all3Years || recent;

      const recentSamples = number(
        recent.totalRaces
      );
      const allSamples = number(
        all.totalRaces
      );

      const primary =
        recentSamples >= MIN_SAMPLES
          ? recent
          : all;

      const frameMovement = Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => {
          const boatNo = index + 1;
          const frame =
            primary.boatPerformance?.[
              String(boatNo)
            ] || {};
          const baselineFrame =
            baselinePattern?.boatPerformance?.[
              String(boatNo)
            ] || {};
          const samples = number(frame.starts);
          const riseRate = number(frame.riseRate);
          const stayRate = number(frame.stayRate);
          const sinkRate = number(frame.sinkRate);
          const baselineRiseRate = number(
            baselineFrame.riseRate
          );
          const baselineStayRate = number(
            baselineFrame.stayRate
          );
          const baselineSinkRate = number(
            baselineFrame.sinkRate
          );
          const movementDelta = Number((
            (riseRate - sinkRate) -
            (
              baselineRiseRate -
              baselineSinkRate
            )
          ).toFixed(1));

          let label = "維持";

          if (riseRate > sinkRate) {
            label = "浮上";
          } else if (sinkRate > riseRate) {
            label = "沈下";
          }

          return [String(boatNo), {
            boatNo,
            samples,
            reliability:
              frame.reliability || "low",
            riseRate,
            stayRate,
            sinkRate,
            baselineRiseRate,
            baselineStayRate,
            baselineSinkRate,
            movementDelta,
            hasBaseline:
              Boolean(
                baselinePattern?.boatPerformance?.[
                  String(boatNo)
                ]
              ),
            label,
            definition:
              "枠番より着順が上なら浮上、同じなら維持、下なら沈下"
          }];
        })
      );

      const recentBoatOne =
        primary.boatPerformance?.["1"] ||
        {};
      const allBoatOne =
        all.boatPerformance?.["1"] || {};

      const escapeRate = number(
        recentBoatOne.winRate,
        number(allBoatOne.winRate)
      );
      const roughRate = rateOf(
        primary.turbulence?.roughRaces
      );
      const manshuRate = rateOf(
        primary.payoutBands?.over10000
      );
      const outsideWinRate = rateOf(
        primary.turbulence?.outsideWins
      );
      const boatOneMissRate = rateOf(
        primary.turbulence
          ?.boatOneOutsideTop3
      );

      let label = "中立傾向";

      if (
        escapeRate >= 55 &&
        roughRate < 35
      ) {
        label = "本線傾向";
      } else if (
        roughRate >= 35 ||
        manshuRate >= 20 ||
        outsideWinRate >= 12
      ) {
        label = "波乱傾向";
      }

      return {
        available:
          recentSamples >= MIN_SAMPLES ||
          allSamples >= MIN_SAMPLES,
        label,
        recentSamples,
        previousSamples: number(
          previous.totalRaces
        ),
        allSamples,
        escapeRate,
        roughRate,
        manshuRate,
        outsideWinRate,
        boatOneMissRate,
        winningMethods:
          primary.winningMethods || [],
        boatPerformance:
          primary.boatPerformance || {},
        frameMovement,
        comparison: {
          escapeRate: Number((
            escapeRate -
            number(allBoatOne.winRate)
          ).toFixed(1)),
          roughRate: Number((
            roughRate -
            rateOf(
              all.turbulence?.roughRaces
            )
          ).toFixed(1))
        },
        policy:
          "参考補強のみ。買い目・予想点・70点基準は変更しない"
      };
    }

    function supportForType(
      trend,
      type
    ) {
      if (!trend?.available) return 0;

      return type === "波乱"
        ? number(trend.roughRate)
        : number(trend.escapeRate);
    }

    return {
      MIN_SAMPLES,
      getPattern,
      buildTrend,
      supportForType
    };
  }
);

/* =========================================================
  当地・水面理論 Ver2
  - AIコア生成時に1回だけ接続
  - 既存local指数の入力を置き換え、別枠加点しない
  - 当地12走未満、風・波未取得時は予想へ反映しない
========================================================= */

(function (root) {
  "use strict";

  if (!root || root.ChappyLocalWaterV2) return;

  const VERSION = "local-water-theory-v2.0.0";
  const ENTRY_KEYS = [
    "entries",
    "boats",
    "racers",
    "entry",
    "raceEntries"
  ];
  const TIDAL_TYPES = new Set([
    "海水",
    "汽水",
    "河口",
    "河川"
  ]);

  function finiteNumber(...values) {
    for (const value of values) {
      if (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(Number(value))
      ) {
        return Number(value);
      }
    }
    return null;
  }

  function clamp(value, min, max) {
    return Math.max(
      min,
      Math.min(max, Number(value) || 0)
    );
  }

  function round(value, digits = 1) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function getWeather(data) {
    return (
      data?.weather ||
      data?.condition ||
      data?.raceCondition ||
      {}
    );
  }

  function getWindSpeed(data) {
    const weather = getWeather(data);
    return finiteNumber(
      weather.windSpeed,
      weather.wind,
      weather.wind_velocity,
      data?.windSpeed
    );
  }

  function getWaveHeight(data) {
    const weather = getWeather(data);
    return finiteNumber(
      weather.waveHeight,
      weather.wave,
      weather.wave_height,
      data?.waveHeight
    );
  }

  function normalizeWind(data) {
    const weather = getWeather(data);
    const speed = getWindSpeed(data);
    const raw = text(
      weather.windDirection ??
      weather.windDir ??
      weather.wind_direction ??
      data?.windDirection ??
      data?.windDir
    ).replace(/\s/g, "");

    if (speed !== null && speed <= 2) {
      return {
        type: "calm",
        label: "弱風",
        isKnown: true
      };
    }
    if (/向かい風|向い風|向風|headwind/i.test(raw)) {
      return {
        type: "head",
        label: "向かい風",
        isKnown: true
      };
    }
    if (/追い風|追風|tailwind/i.test(raw)) {
      return {
        type: "tail",
        label: "追い風",
        isKnown: true
      };
    }
    if (/横風|crosswind/i.test(raw)) {
      return {
        type: "cross",
        label: "横風",
        isKnown: true
      };
    }

    return {
      type: "unknown",
      label: raw || "風向不明",
      isKnown: false
    };
  }

  function getSurface(data) {
    const weather = getWeather(data);
    const waterType = text(
      weather.waterType ??
      data?.waterType ??
      data?.venue?.water ??
      data?.raceInfo?.waterType
    ) || "不明";
    const tideLevel = finiteNumber(
      weather.tideLevel,
      weather.currentTideLevel,
      data?.tideLevel,
      data?.currentTideLevel
    );
    const tideFlow = text(
      weather.tideFlow ??
      weather.currentTide ??
      weather.tidePhase ??
      weather.tideDirection ??
      data?.tideFlow ??
      data?.currentTide ??
      data?.tidePhase ??
      data?.tideDirection
    );

    return {
      waterType,
      isTidal: TIDAL_TYPES.has(waterType),
      tideLevel,
      tideFlow,
      hasLiveTide:
        tideLevel !== null || Boolean(tideFlow)
    };
  }

  function getCourse(entry, fallback) {
    const candidates = [
      entry?.exhibitionCourse,
      entry?.beforeInfo?.exhibitionCourse,
      entry?.beforeInfo?.course,
      entry?.startExhibition?.course,
      entry?.entryCourse,
      entry?.course,
      entry?.boatNo,
      entry?.boat,
      fallback
    ];

    for (const value of candidates) {
      const parsed = Number(value);
      if (parsed >= 1 && parsed <= 6) {
        return parsed;
      }
    }
    return Number(fallback) || 0;
  }

  function getCourseFeature(feature, course) {
    if (course === 1) return Number(feature?.inPower || 50);
    if (course === 2) return Number(feature?.sashi || 50);
    if (course === 3) return Number(feature?.makuri || 50);
    if (course === 4) {
      return Math.max(
        Number(feature?.kado || 50),
        Number(feature?.makuriSashi || 50)
      );
    }
    if (course === 5) {
      return Number(feature?.makuriSashi || 50);
    }
    return Number(feature?.outside || 50);
  }

  function windPoints(
    wind,
    windSpeed,
    course
  ) {
    if (
      windSpeed === null ||
      !wind.isKnown
    ) {
      return null;
    }

    const tables = {
      calm: [20, 18, 16, 14, 12, 10],
      head: [14, 12, 20, 19, 15, 12],
      tail: [19, 20, 14, 12, 10, 8],
      cross: [16, 15, 15, 14, 12, 10]
    };
    const base = tables[wind.type]?.[course - 1];
    if (!Number.isFinite(base)) return null;

    const factor =
      windSpeed >= 6 ? 1
        : windSpeed >= 4 ? 0.9
          : windSpeed > 2 ? 0.8
            : 0.7;

    return clamp(
      Math.round(base * factor),
      0,
      20
    );
  }

  function wavePoints(
    feature,
    waveHeight,
    course
  ) {
    if (waveHeight === null) return null;

    const courseFeature =
      getCourseFeature(feature, course);
    const roughFeature =
      Number(feature?.roughWater || 50);
    const roughMix =
      waveHeight >= 6 ? 0.70
        : waveHeight >= 4 ? 0.55
          : waveHeight >= 2 ? 0.30
            : 0.10;
    const blended =
      courseFeature * (1 - roughMix) +
      roughFeature * roughMix;

    return clamp(
      Math.round(blended * 0.15),
      0,
      15
    );
  }

  function localResultPoints(entry) {
    const win = finiteNumber(
      entry?.localWinRate,
      entry?.localRate,
      entry?.local?.winRate
    );
    const two = finiteNumber(
      entry?.local2Rate,
      entry?.localTwoRate,
      entry?.local?.twoRate
    );
    const three = finiteNumber(
      entry?.local3Rate,
      entry?.localThreeRate,
      entry?.local?.threeRate
    );
    const hasEvidence =
      win !== null &&
      (two !== null || three !== null);

    if (!hasEvidence) {
      return {
        value: 0,
        available: false,
        win,
        two,
        three
      };
    }

    let value = 0;
    value += clamp((win - 3.5) * 2.4, 0, 9);
    if (two !== null) {
      value += clamp((two - 20) * 0.16, 0, 5);
    }
    if (three !== null) {
      value += clamp((three - 35) * 0.16, 0, 6);
    }

    return {
      value: clamp(Math.round(value), 0, 20),
      available: true,
      win,
      two,
      three
    };
  }

  function getLocalStarts(entry) {
    return finiteNumber(
      entry?.localStarts,
      entry?.localRaces,
      entry?.localRaceCount,
      entry?.local?.starts,
      entry?.local?.races
    );
  }

  function reliabilityPoints(starts) {
    if (starts === null) return null;
    if (starts >= 30) return 10;
    if (starts >= 20) return 8;
    if (starts >= 12) return 6;
    if (starts >= 6) return 3;
    return 0;
  }

  function scoreEntry(
    entry,
    index,
    data,
    core
  ) {
    const feature =
      core?.getVenueFeature?.(data) || {};
    const course = getCourse(entry, index + 1);
    const wind = normalizeWind(data);
    const windSpeed = getWindSpeed(data);
    const waveHeight = getWaveHeight(data);
    const surface = getSurface(data);
    const local = localResultPoints(entry);
    const starts = getLocalStarts(entry);
    const reliability = reliabilityPoints(starts);

    const venue = clamp(
      Math.round(
        getCourseFeature(feature, course) * 0.30
      ),
      0,
      30
    );
    const windValue = windPoints(
      wind,
      windSpeed,
      course
    );
    const waveValue = wavePoints(
      feature,
      waveHeight,
      course
    );
    const tide =
      surface.isTidal && surface.hasLiveTide
        ? 5
        : null;

    const components = [
      {
        key: "venueCourse",
        value: venue,
        max: 30,
        available: true
      },
      {
        key: "windCourse",
        value: windValue || 0,
        max: 20,
        available: windValue !== null
      },
      {
        key: "waveSurface",
        value: waveValue || 0,
        max: 15,
        available: waveValue !== null
      },
      {
        key: "localResults",
        value: local.value,
        max: 20,
        available: local.available
      },
      {
        key: "reliability",
        value: reliability || 0,
        max: 10,
        available: reliability !== null
      },
      {
        key: "tideTime",
        value: tide || 0,
        max: 5,
        available: tide !== null
      }
    ];
    const available = components.filter(
      (component) => component.available
    );
    const availablePoints = available.reduce(
      (sum, component) => sum + component.max,
      0
    );
    const earnedPoints = available.reduce(
      (sum, component) => sum + component.value,
      0
    );
    const score = availablePoints
      ? Math.round(
          clamp(
            earnedPoints / availablePoints * 100,
            0,
            100
          )
        )
      : 0;
    const hasConditionEvidence =
      windValue !== null || waveValue !== null;
    const hasReliableSample =
      starts !== null && starts >= 12;
    const isFormal =
      local.available &&
      hasReliableSample &&
      hasConditionEvidence;

    return {
      boatNo: Number(entry?.boatNo || entry?.boat || index + 1),
      course,
      score,
      isFormal,
      isHighReliability:
        starts !== null && starts >= 30,
      hasLocalEvidence: local.available,
      hasConditionEvidence,
      hasReliableSample,
      localStarts: starts,
      windSpeed,
      waveHeight,
      windType: wind.type,
      windLabel: wind.label,
      waterType: surface.waterType,
      tideLevel: surface.tideLevel,
      tideFlow: surface.tideFlow,
      availablePoints,
      earnedPoints,
      components: Object.fromEntries(
        components.map((component) => [
          component.key,
          component.available
            ? component.value
            : null
        ])
      )
    };
  }

  function syntheticLocalStats(score) {
    const normalized = clamp(score, 0, 100) / 100;
    return {
      localWinRate: round(3.5 + normalized * 4, 2),
      local2Rate: round(20 + normalized * 35, 1),
      local3Rate: round(35 + normalized * 30, 1)
    };
  }

  function findEntries(data) {
    for (const key of ENTRY_KEYS) {
      if (Array.isArray(data?.[key])) {
        return {
          key,
          entries: data[key]
        };
      }
    }
    return {
      key: "entries",
      entries: []
    };
  }

  function enhanceData(data, core) {
    if (!data || typeof data !== "object") {
      return {
        data,
        theory: {
          version: VERSION,
          isFormal: false,
          rows: []
        }
      };
    }
    if (
      data?.localWaterTheoryV2?.version ===
      VERSION
    ) {
      return {
        data,
        theory: data.localWaterTheoryV2
      };
    }

    const source = findEntries(data);
    const rows = source.entries.map(
      (entry, index) =>
        scoreEntry(entry, index, data, core)
    );
    const transformed = source.entries.map(
      (entry, index) => {
        const row = rows[index];
        if (!row?.isFormal) return { ...entry };

        return {
          ...entry,
          ...syntheticLocalStats(row.score),
          localWaterTheoryV2: row
        };
      }
    );
    const nextData = {
      ...data,
      [source.key]: transformed,
      localWaterTheoryV2: {
        version: VERSION,
        isFormal: rows.some((row) => row.isFormal),
        rows
      }
    };

    for (const key of ENTRY_KEYS) {
      if (
        key !== source.key &&
        Array.isArray(data[key]) &&
        data[key] === source.entries
      ) {
        nextData[key] = transformed;
      }
    }

    return {
      data: nextData,
      theory: nextData.localWaterTheoryV2
    };
  }

  function install(core) {
    if (
      !core ||
      typeof core !== "object" ||
      core.__localWaterTheoryV2Installed
    ) {
      return core;
    }

    const originalBuild =
      typeof core.buildPredictionData === "function"
        ? core.buildPredictionData.bind(core)
        : null;
    const originalBoatAnalyses =
      typeof core.buildBoatAnalyses === "function"
        ? core.buildBoatAnalyses.bind(core)
        : null;

    if (originalBuild) {
      core.buildPredictionData = function (data) {
        const enhanced = enhanceData(data, core);
        const result = originalBuild(enhanced.data);

        if (result && typeof result === "object") {
          result.localWaterTheoryV2 = enhanced.theory;
        }
        return result;
      };
      core.analyze = core.buildPredictionData;
    }

    if (originalBoatAnalyses) {
      core.buildBoatAnalyses = function (data) {
        const enhanced = enhanceData(data, core);
        const result = originalBoatAnalyses(enhanced.data);

        if (Array.isArray(result)) {
          Object.defineProperty(
            result,
            "localWaterTheoryV2",
            {
              value: enhanced.theory,
              enumerable: false,
              configurable: true
            }
          );
        }
        return result;
      };
    }

    Object.defineProperty(
      core,
      "__localWaterTheoryV2Installed",
      {
        value: true,
        enumerable: false,
        configurable: false
      }
    );

    return core;
  }

  const api = Object.freeze({
    version: VERSION,
    enhanceData,
    install
  });

  root.ChappyLocalWaterV2 = api;

  let storedCore = root.ChappyAICore;
  if (storedCore) {
    storedCore = install(storedCore);
  }

  try {
    Object.defineProperty(
      root,
      "ChappyAICore",
      {
        configurable: true,
        enumerable: true,
        get() {
          return storedCore;
        },
        set(value) {
          storedCore = install(value);
        }
      }
    );
  } catch (error) {
    if (storedCore) install(storedCore);
    if (typeof console !== "undefined") {
      console.warn(
        "[LocalWaterV2] AIコア接続を既存方式へフォールバック",
        error
      );
    }
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis
);
