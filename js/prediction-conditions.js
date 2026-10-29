/* =========================================================
  予想時点の条件スナップショット

  ST・展示・風・波・潮・予想時点の攻め/展開指数を締切前の状態で固定保存する。
  このモジュールは予想ロジック・重み・買い目を変更しない。
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyPredictionConditions = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const PRIORITY_STAGES = [
    "展開",
    "コース",
    "ST・スリット",
    "展示・足",
    "残し・拾い",
    "当地・水面",
    "技量",
    "モーター"
  ];

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalizeDataSource(raceData) {
    const source = text(
      raceData?.source ||
      raceData?.dataSource ||
      raceData?.provider
    );
    if (/^(?:boatrace[-_ ]?official|BOAT\s*RACE公式)$/i.test(source)) {
      return "boatrace-official";
    }
    return source;
  }

  function boatNoOf(value, fallback = 0) {
    const number = Number(
      value?.boat ?? value?.waku ?? value?.no ?? value?.boatNo ?? value ?? fallback
    );
    return number >= 1 && number <= 6 ? number : 0;
  }

  function average(values) {
    const source = Array.isArray(values)
      ? values
      : values === null || values === undefined
        ? []
        : [values];
    const numbers = source.map(numberOrNull).filter(value => value !== null);
    if (!numbers.length) return null;
    return Math.round(numbers.reduce((sum, value) => sum + value, 0) /
      numbers.length * 1000) / 1000;
  }

  function findBoat(list, boatNo) {
    return (Array.isArray(list) ? list : []).find((item, index) =>
      boatNoOf(item, index + 1) === boatNo
    ) || null;
  }

  function findEntries(raceData) {
    const keys = [
      "entries",
      "boats",
      "racers",
      "entry",
      "raceEntries"
    ];

    for (const key of keys) {
      if (Array.isArray(raceData?.[key])) {
        return raceData[key];
      }
    }

    return [];
  }

  function getCurrentSt(entry) {
    const current = entry?.currentRace || entry?.currentSeries || entry?.series || {};
    const source =
      current.stList ||
      current.st ||
      current.starts ||
      current.startTimings ||
      [];
    return average((Array.isArray(source) ? source : [source]).map(item =>
      item?.st ?? item?.startTime ?? item
    ));
  }

  function getPredictionIndex(prediction, boatNo) {
    const byBoat = prediction?.indexes?.byBoat || {};
    const direct = byBoat?.[boatNo] || byBoat?.[String(boatNo)] || null;
    if (direct && typeof direct === "object") return direct;

    const scores = Array.isArray(prediction?.indexes?.scores)
      ? prediction.indexes.scores
      : [];
    return scores.find((item, index) =>
      boatNoOf(item, index + 1) === boatNo
    ) || {};
  }

  function startMarker(value) {
    const marker = text(value).toUpperCase();
    return marker === "F" || marker === "L" ? marker : "";
  }

  function captureTheoryIndex(prediction, boatNo) {
    const index = getPredictionIndex(prediction, boatNo);
    const attackStrength = numberOrNull(index?.attack);
    const raceFlowPower = numberOrNull(index?.tenkai);
    const totalScore = numberOrNull(index?.total);

    return {
      attackStrength,
      attackScore: attackStrength,
      tenkaiScore: raceFlowPower,
      raceFlowPower,
      raceFlowScore: raceFlowPower,
      totalScore,
      indexSource:
        attackStrength !== null || raceFlowPower !== null || totalScore !== null
          ? "prediction.indexes.pre_deadline"
          : ""
    };
  }

  const ORIGINAL_FOOT_METRICS = [
    ["lapTime", "一周"],
    ["mawariTime", "まわり足"],
    ["straightTime", "直線"]
  ];

  function originalFootNumber(value) {
    if (value === null || value === undefined || value === "" ||
        !/^(?:\d+(?:\.\d+)?)$/.test(String(value))) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function captureOriginalMetric(entry, before, metric) {
    // Resolve value and metadata from the same row. A missing/null venue
    // measurement must not inherit a different row's source or another metric.
    const containers = [before, before?.exhibition, entry, entry?.exhibition];
    const row = containers.find(value => value && Object.hasOwn(value, metric));
    return {
      [metric]: originalFootNumber(row?.[metric]),
      ...Object.fromEntries(["Source", "SourceUrl", "Unit", "MeasurementLabel", "SourceRef"].map(suffix =>
        [metric + suffix, text(row?.[metric + suffix])]))
    };
  }

  function captureBoat(raceData, prediction, boatNo) {
    const entry = findBoat(findEntries(raceData), boatNo) || {};
    const before = findBoat(raceData?.beforeInfo, boatNo) || {};
    const start = findBoat(raceData?.startExhibition, boatNo) || {};
    const exhibition = before?.exhibition || entry?.exhibition || {};
    const theoryIndex = captureTheoryIndex(prediction, boatNo);
    const registerNo = text(
      entry?.registerNo ??
      entry?.registrationNo ??
      entry?.racerNo
    );
    const historyRacer = (
      Array.isArray(raceData?.historyContext?.racers)
        ? raceData.historyContext.racers
        : []
    ).find(
      racer =>
        registerNo &&
        text(racer?.registerNo) === registerNo
    ) || {};

    return {
      boatNo,
      course: numberOrNull(start?.course ?? entry?.course ?? boatNo) || boatNo,
      courseOfficial: start?.isOfficialCourse === true,
      courseMappingSource: text(start?.mappingSource),
      startExhibition: {
        boatNo,
        course:
          numberOrNull(start?.course ?? entry?.course ?? boatNo) || boatNo,
        st: numberOrNull(
          start?.st ?? before?.exhibitionST ?? before?.displayST ??
          exhibition?.st ?? entry?.exhibitionST
        ),
        isOfficialCourse:
          start?.isOfficialCourse === true,
        mappingSource:
          text(start?.mappingSource),
        // Official start-exhibition flag ("F" flying / "L" late), kept beside
        // the unchanged ST so F.08 is not read as a clean .08. Record only.
        marker: startMarker(start?.marker)
      },
      exhibitionStartMarker: startMarker(start?.marker),
      registerNo,
      racerName: text(entry?.racerName || entry?.name || entry?.playerName),
      className: text(entry?.className || entry?.class || entry?.grade),
      avgST: numberOrNull(entry?.avgST ?? entry?.avgSt ?? entry?.averageST ?? entry?.st),
      currentST: getCurrentSt(entry),
      exhibitionST: numberOrNull(
        start?.st ?? before?.exhibitionST ?? before?.displayST ??
        exhibition?.st ?? entry?.exhibitionST
      ),
      exhibitionTime: numberOrNull(
        before?.exhibitionTime ?? before?.displayTime ??
        exhibition?.displayTime ?? exhibition?.time ?? entry?.exhibitionTime
      ),
      lapTime: numberOrNull(
        before?.lapTime ?? before?.oneLapTime ??
        exhibition?.lapTime ?? exhibition?.oneLapTime ?? entry?.lapTime
      ),
      lapTimeSource: text(
        before?.lapTimeSource ?? exhibition?.lapTimeSource ??
        entry?.lapTimeSource ?? entry?.exhibition?.lapTimeSource
      ),
      lapTimeSourceUrl: text(
        before?.lapTimeSourceUrl ?? exhibition?.lapTimeSourceUrl ??
        entry?.lapTimeSourceUrl ?? entry?.exhibition?.lapTimeSourceUrl
      ),
      ...Object.fromEntries(["Unit", "MeasurementLabel", "SourceRef"].map(suffix =>
        ["lapTime" + suffix, text(before?.["lapTime" + suffix] ??
          exhibition?.["lapTime" + suffix] ?? entry?.["lapTime" + suffix] ??
          entry?.exhibition?.["lapTime" + suffix])])),
      ...captureOriginalMetric(entry, before, "mawariTime"),
      ...captureOriginalMetric(entry, before, "straightTime"),
      officialStartRank: entry?.officialStartRank
        ? JSON.parse(JSON.stringify(entry.officialStartRank)) : null,
      localWinRate: numberOrNull(
        entry?.localWinRate ?? entry?.local?.winRate ?? entry?.local?.rate
      ),
      nationalWinRate: numberOrNull(
        entry?.nationalWinRate ?? entry?.national?.winRate ?? entry?.national?.rate
      ),
      national2Rate: numberOrNull(
        entry?.national2Rate ?? entry?.national?.secondRate
      ),
      national3Rate: numberOrNull(
        entry?.national3Rate ?? entry?.national?.thirdRate
      ),
      motor2Rate: numberOrNull(
        entry?.motor2Rate ?? entry?.motor?.secondRate ?? entry?.motor?.quinellaRate
      ),
      motor3Rate: numberOrNull(
        entry?.motor3Rate ?? entry?.motor?.thirdRate ?? entry?.motor?.trioRate
      ),
      boat2Rate: numberOrNull(
        entry?.boat2Rate ?? entry?.boat?.secondRate ?? entry?.boat?.quinellaRate
      ),
      localStarts: numberOrNull(
        entry?.localStarts ?? entry?.localRaces ??
        entry?.localRaceCount ?? entry?.local?.starts ??
        historyRacer?.localStarts ??
        historyRacer?.currentVenueStarts
      ),
      ...theoryIndex
    };
  }

  function captureWeather(raceData, prediction) {
    const weather = raceData?.weather || raceData?.condition || {};
    const predictionWeather = prediction?.weather || {};
    const venue = prediction?.venue || prediction?.venueProfile || {};

    const tideLevel = numberOrNull(
      weather?.tideLevel ?? weather?.tide ??
      raceData?.tideLevel ?? raceData?.tide
    );
    const tidePhase = text(
      weather?.tideFlow || weather?.tidePhase ||
      raceData?.tideFlow || raceData?.tidePhase
    );
    const liveTideAvailable =
      weather?.liveTideAvailable === true ||
      tideLevel !== null ||
      Boolean(tidePhase);

    return {
      weather: text(weather?.weather || weather?.condition || predictionWeather?.weather),
      windDirection: text(
        weather?.windDirection || weather?.wind_direction || predictionWeather?.windDirection
      ),
      windDirectionCode: numberOrNull(
        weather?.windDirectionCode ?? raceData?.windDirectionCode
      ),
      windSpeed: numberOrNull(
        weather?.windSpeed ?? weather?.wind ?? weather?.wind_velocity ??
        predictionWeather?.windSpeed
      ),
      waveHeight: numberOrNull(
        weather?.waveHeight ?? weather?.wave ?? weather?.wave_height ??
        predictionWeather?.waveHeight
      ),
      temperature: numberOrNull(
        weather?.temperature ?? weather?.airTemp ?? predictionWeather?.temperature
      ),
      waterTemperature: numberOrNull(
        weather?.waterTemperature ?? weather?.waterTemp ??
        predictionWeather?.waterTemperature
      ),
      waterType: text(
        weather?.waterType || raceData?.waterType
      ),
      tideLevel,
      tidePhase,
      tideStatus:
        liveTideAvailable
          ? "acquired"
          : "unavailable",
      liveTideAvailable,
      venueTideInfluence: numberOrNull(
        venue?.tideInfluence ?? prediction?.water?.tideInfluence
      )
    };
  }

  function countAvailable(boats, keys) {
    return boats.filter(boat => keys.some(key => boat[key] !== null)).length;
  }

  function captureOriginalFootEvidence(raceData = {}, capturedBoats) {
    const boats = capturedBoats || Array.from({ length: 6 }, (_, index) =>
      captureBoat(raceData, {}, index + 1));
    const original = raceData?.originalExhibition || null;
    const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
    const entries = findEntries(raceData);
    const beforeRows = raceData?.beforeInfo;
    const starts = raceData?.startExhibition;
    const date = text(raceData?.date).replace(/-/g, "");
    const jcd = text(raceData?.stadiumCode ?? raceData?.jcd).padStart(2, "0");
    const rno = Number(raceData?.raceNo ?? raceData?.rno);
    const sourceFetchedAt = text(original?.sourceFetchedAt);
    const sourceSha256 = text(original?.sourceSha256);
    const sourceTime = Date.parse(sourceFetchedAt);
    const fetchedTime = Date.parse(text(raceData?.fetchedAt));
    const isoTimestamp = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
    let reasonCode = "";
    if (!original || original.status !== "available" || !text(original.source) || !text(original.sourceUrl) ||
        original.rowCount !== 6 || original.identityMatched !== true || original.exhibitionMatched !== true) {
      reasonCode = "SOURCE_METADATA_UNAVAILABLE";
    } else if (!/^[a-f0-9]{64}$/i.test(sourceSha256) || !isoTimestamp(sourceFetchedAt) ||
        !isoTimestamp(text(raceData?.fetchedAt)) || sourceTime > fetchedTime) {
      reasonCode = "SOURCE_INTEGRITY_METADATA_INVALID";
    } else if (!/^\d{8}$/.test(date) || !/^\d{2}$/.test(jcd) || !Number.isInteger(rno) || rno < 1 || rno > 12 ||
        original.date !== date || text(original.jcd) !== jcd || original.rno !== rno) {
      reasonCode = "SOURCE_RACE_IDENTITY_MISMATCH";
    } else if (entries.length !== 6 || new Set(entries.map(row => boatNoOf(row))).size !== 6 ||
        !Array.isArray(beforeRows) || beforeRows.length !== 6 || new Set(beforeRows.map(row => boatNoOf(row))).size !== 6 ||
        beforeRows.some(row => boatNoOf(row) < 1) ||
        !Array.isArray(original.boatIdentities) || original.boatIdentities.length !== 6 ||
        new Set(original.boatIdentities.map(row => boatNoOf(row))).size !== 6 ||
        !entries.every(entry => {
          const identity = original.boatIdentities.find(row => boatNoOf(row) === boatNoOf(entry));
          const registerNo = text(entry?.registerNo ?? entry?.registrationNo ?? entry?.racerNo);
          return boatNoOf(entry) >= 1 && /^\d{4}$/.test(registerNo) && identity &&
            text(identity.registerNo) === registerNo;
        })) {
      reasonCode = "SOURCE_BOAT_IDENTITY_MISMATCH";
    } else if (!Array.isArray(starts) || starts.length !== 6 || new Set(starts.map(row => boatNoOf(row))).size !== 6 ||
        new Set(starts.map(row => Number(row?.course))).size !== 6 || !starts.every(row =>
          boatNoOf(row) >= 1 && Number.isInteger(Number(row.course)) && Number(row.course) >= 1 && Number(row.course) <= 6 &&
          (row.isOfficialCourse === true || row.mappingSource === "official-start-image"))) {
      reasonCode = "OFFICIAL_COURSE_MAPPING_UNAVAILABLE";
    }
    const metrics = Object.fromEntries(ORIGINAL_FOOT_METRICS.map(([metric, label]) => {
      const definition = original?.metricDefinitions?.[metric];
      let metricReason = reasonCode;
      if (!metricReason && (!Number.isInteger(original?.metricCounts?.[metric]) ||
          original.metricCounts[metric] < 0 || original.metricCounts[metric] > 6)) {
        metricReason = "METRIC_MEASUREMENT_COUNT_UNAVAILABLE";
      }
      if (!metricReason && (original.metricCounts[metric] !== 6 ||
          (metric === "lapTime" && original.lapComplete !== true))) {
        // Existing raw lap values may remain for engine compatibility. The
        // current source must independently attest six measurements before
        // those values can enter this source's reference comparison.
        metricReason = "METRIC_VALUES_INCOMPLETE";
      }
      if (!metricReason && (definition?.unit !== "seconds" || definition?.measurementLabel !== label ||
          definition?.venueCode !== jcd ||
          !boats.every(row => row[metric + "Source"] === original.source &&
            row[metric + "SourceUrl"] === original.sourceUrl && row[metric + "Unit"] === definition.unit &&
            row[metric + "MeasurementLabel"] === definition.measurementLabel &&
            row[metric + "SourceRef"] === "originalExhibition" &&
            captureOriginalMetric(findBoat(entries, row.boatNo), findBoat(beforeRows, row.boatNo), metric)[metric] ===
              originalFootNumber(row[metric])))) {
        metricReason = "METRIC_DEFINITION_OR_SOURCE_MISMATCH";
      }
      const values = boats.map(row => originalFootNumber(row[metric]));
      if (!metricReason && values.some(value => value === null)) metricReason = "METRIC_VALUES_INCOMPLETE";
      const comparable = !metricReason;
      const mean = comparable ? values.reduce((sum, value) => sum + value, 0) / 6 : null;
      const rounded = value => Math.round(value * 1000000) / 1000000;
      return [metric, {
        measurementLabel: label,
        unit: definition?.unit || null,
        status: comparable ? "comparable" : metricReason === "METRIC_VALUES_INCOMPLETE" ? "incomplete" : "unknown",
        comparable,
        reasonCode: metricReason,
        meanSeconds: mean === null ? null : rounded(mean),
        boats: boats.map((row, index) => ({
          boatNo: row.boatNo, registerNo: row.registerNo, value: values[index],
          rank: comparable ? 1 + values.filter(value => value < values[index]).length : null,
          differenceFromMeanSeconds: comparable ? rounded(values[index] - mean) : null
        }))
      }];
    }));
    const comparableCount = Object.values(metrics).filter(metric => metric.comparable).length;
    return {
      version: "original-foot-evidence-v1",
      mode: "reference-only",
      referenceOnly: true,
      scoreApplied: false,
      affectsPrediction: false,
      affectsTickets: false,
      usableForPrediction: false,
      officialResultUsed: false,
      status: comparableCount === 3 ? "comparable" : comparableCount ? "partial" : "unknown",
      reasonCode,
      sourceMetadata: clone(original),
      rankingPolicy: "ascending-exact-ties-competition",
      metrics
    };
  }

  function capture(raceData = {}, prediction = {}) {
    const boats = Array.from({ length: 6 }, (_, index) =>
      captureBoat(raceData, prediction, index + 1)
    );
    const weather = captureWeather(raceData, prediction);
    const source = normalizeDataSource(raceData);
    const sourceText = JSON.stringify({
      raceInfo: raceData?.raceInfo || {},
      engine: prediction?.engine || prediction?.motorMode || ""
    });

    return {
      schemaVersion: 4,
      sourceTiming: "pre_deadline",
      officialResultUsed: false,
      source,
      sourceFetchedAt: text(raceData?.fetchedAt),
      analysisProfile:
        source === "boatrace-official"
          ? "hiyori-compatible"
          : "",
      boats,
      weather,
      originalExhibition: raceData?.originalExhibition
        ? JSON.parse(JSON.stringify(raceData.originalExhibition)) : null,
      originalFootEvidence: captureOriginalFootEvidence(raceData, boats),
      escapeEvaluationEvidence: captureEscapeEvaluation(raceData, prediction),
      // 計算時の判定をそのまま保存。過去レコードへの現行理論の後付けはしない。
      adjacentExhibitionEvidence: JSON.parse(JSON.stringify(
        prediction?.aiCore?.exhibitionPerformanceTheory?.adjacentExhibition ||
        prediction?.exhibitionPerformanceTheory?.adjacentExhibition || null
      )),
      dataAvailability: {
        entries: boats.filter(boat => boat.racerName || boat.className).length,
        officialCourses:
          boats.filter(boat => boat.courseOfficial === true).length,
        averageST: countAvailable(boats, ["avgST"]),
        currentST: countAvailable(boats, ["currentST"]),
        exhibitionST: countAvailable(boats, ["exhibitionST"]),
        exhibitionTime: countAvailable(boats, ["exhibitionTime"]),
        lapTime: countAvailable(boats, ["lapTime"]),
        mawariTime: countAvailable(boats, ["mawariTime"]),
        straightTime: countAvailable(boats, ["straightTime"]),
        attackStrength: countAvailable(boats, ["attackStrength"]),
        raceFlowPower: countAvailable(boats, ["raceFlowPower"]),
        totalScore: countAvailable(boats, ["totalScore"]),
        skill:
          boats.filter(boat =>
            Boolean(boat.className) &&
            boat.nationalWinRate !== null &&
            boat.localWinRate !== null
          ).length,
        motor:
          boats.filter(boat =>
            boat.motor2Rate !== null &&
            boat.motor3Rate !== null
          ).length,
        windDirection: Boolean(weather.windDirection),
        wind: weather.windSpeed !== null,
        wave: weather.waveHeight !== null,
        tide:
          weather.liveTideAvailable === true
      },
      theorySignalStorage: {
        mode: "shadow-observation-only",
        source: "prediction.indexes",
        sourceTiming: "pre_deadline",
        affectsPrediction: false,
        affectsTickets: false,
        officialResultUsed: false
      },
      newEngineMode: Boolean(
        prediction?.isNewEngineMode ||
        /新型エンジン|新エンジン|新モーター|新燃料/.test(sourceText)
      ),
      usagePolicy: "検証表示のみ。予想ロジック・重み・買い目は自動変更しない"
    };
  }

  // Freeze only evidence used by the current engine, not a new scoring rule.
  // Legacy snapshots remain legacy: never fill their history with today's data.
  function captureEscapeEvaluation(raceData, prediction) {
    const core = prediction?.aiCore || {};
    const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
    // Full scenarios contain repeated candidate trees exceeding 1 MB per race.
    // Keep the actual decisions; the original history/input is stored separately.
    const scenario = value => value ? clone(Object.fromEntries([
      "type", "label", "score", "headBoatNo", "attackerBoatNo", "attacker", "attackerCourse",
      "blockedBoats", "frameMovementAdjustment", "slitAdjustment", "slitReasons"
    ].filter(key => value[key] !== undefined).map(key => [key, value[key]]))) : null;
    const history = raceData?.historyContext;
    return {
      version: "escape-evaluation-evidence-v1",
      sourceFetchedAt: text(raceData?.fetchedAt),
      datasetVersion: text(raceData?.datasetVersion),
      resultUsedForGeneration: false,
      affectsPrediction: false,
      historyStatus: history && Array.isArray(history.racers)
        ? "captured" : "unavailable",
      historyContext: clone(history),
      // Original entries retain current-series ST lists, F risk and field names.
      entries: clone(findEntries(raceData)),
      beforeInfo: clone(raceData?.beforeInfo),
      startExhibition: clone(raceData?.startExhibition),
      raceInfo: clone(raceData?.raceInfo),
      originalExhibition: clone(raceData?.originalExhibition),
      raceScenarios: core.raceScenarios ? {
        mainScenario: scenario(core.raceScenarios.mainScenario),
        subScenario: scenario(core.raceScenarios.subScenario),
        scenarios: (core.raceScenarios.scenarios || []).map(scenario)
      } : null,
      racerSkillTheory: clone(core.racerSkillTheory),
      stSlitTheory: clone(core.stSlitTheory),
      aiCoreVersion: text(core.version),
      limitation: "Recorded inputs and evaluations; full-engine replay equivalence must be checked separately."
    };
  }

  return {
    PRIORITY_STAGES,
    numberOrNull,
    boatNoOf,
    captureOriginalFootEvidence,
    capture
  };
});
