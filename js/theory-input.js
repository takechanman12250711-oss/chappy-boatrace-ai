/* =========================================================
  全理論 共通入力
  - アプリ予想・レース自動選定・サーバー自動予想で共用
  - 公式入力を8段階の理論へ渡す形へ1回だけ正規化する
  - 承認済みの配点・優先順位・買い目基準は変更しない
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyTheoryInput = Object.freeze(api);
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function (root) {
    "use strict";

    const VERSION = "theory-input-v1.0.2-st-history-fallback";
    const boatIdentity =
      root?.ChappyBoatIdentity ||
      (
        typeof require === "function"
          ? require("./boat-identity")
          : null
      );
    const localRacerSkillStats = (() => {
      if (typeof require !== "function") return null;
      try {
        return require("../data/stats/racer-skill-patterns.json");
      } catch (_) {
        return null;
      }
    })();
    const ENTRY_KEYS = [
      "entries",
      "boats",
      "racers",
      "entry",
      "raceEntries"
    ];
    const WATER_TYPES = Object.freeze({
      "01": "淡水", "02": "淡水", "03": "河川", "04": "海水",
      "05": "淡水", "06": "汽水", "07": "海水", "08": "海水",
      "09": "海水", "10": "淡水", "11": "淡水", "12": "淡水",
      "13": "淡水", "14": "海水", "15": "海水", "16": "海水",
      "17": "海水", "18": "海水", "19": "海水", "20": "海水",
      "21": "淡水", "22": "河口", "23": "淡水", "24": "海水"
    });

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

    function text(value) {
      return String(value ?? "").trim();
    }

    function normalizeJcd(data) {
      const value =
        data?.stadiumCode ??
        data?.jcd ??
        data?.venueCode ??
        data?.raceInfo?.jcd;
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 24
        ? String(parsed).padStart(2, "0")
        : "";
    }

    function findEntries(data) {
      for (const key of ENTRY_KEYS) {
        if (Array.isArray(data?.[key])) {
          return { key, entries: data[key] };
        }
      }
      return { key: "entries", entries: [] };
    }

    function historyRacerMap(data) {
      const source = data?.historyContext?.racers;
      const rows = Array.isArray(source)
        ? source
        : source && typeof source === "object"
          ? Object.values(source)
          : [];

      return new Map(
        rows
          .map((racer) => {
            const registerNo = text(racer?.registerNo);
            const fallbackSkillHistory =
              registerNo
                ? localRacerSkillStats?.racers?.[registerNo] || null
                : null;
            return [
              registerNo,
              {
                ...racer,
                skillHistory:
                  racer?.skillHistory || fallbackSkillHistory
              }
            ];
          })
          .filter(([registerNo]) => registerNo)
      );
    }

    function normalizedHistoryContext(data, racerMap) {
      const context = data?.historyContext;
      if (!context || typeof context !== "object") return context;
      const source = context.racers;
      const racers = Array.isArray(source)
        ? source.map(racer =>
            racerMap.get(text(racer?.registerNo)) || racer
          )
        : source && typeof source === "object"
          ? Object.fromEntries(
              Object.entries(source).map(([key, racer]) => [
                key,
                racerMap.get(text(racer?.registerNo || key)) || racer
              ])
            )
          : source;
      return {
        ...context,
        racers
      };
    }

    function startByBoat(data) {
      return new Map(
        (Array.isArray(data?.startExhibition)
          ? data.startExhibition
          : []
        ).map((row) => [
          Number(row?.boat),
          row
        ])
      );
    }

    function normalizeEntry(
      entry,
      index,
      racerMap,
      starts,
      canonicalBoatNo
    ) {
      const boatNo = Number(canonicalBoatNo || 0);
      const start = starts.get(boatNo) || {};
      const racer = racerMap.get(text(entry?.registerNo)) || {};
      const localStarts = finiteNumber(
        entry?.localStarts,
        entry?.localRaces,
        entry?.localRaceCount,
        entry?.local?.starts,
        racer?.localStarts,
        racer?.currentVenueStarts,
        racer?.venueStarts
      );
      const equipmentBoatNo =
        entry?.boatNumber ??
        entry?.boatNoValue ??
        (
          boatIdentity?.primaryBoatNo(
            entry
          )
            ? entry?.boatNo
            : null
        );

      return {
        ...entry,
        boatNumber:
          equipmentBoatNo ?? "",
        boatNo,
        exhibitionCourse: finiteNumber(
          entry?.exhibitionCourse,
          entry?.beforeInfo?.exhibitionCourse,
          start?.course,
          entry?.course,
          boatNo
        ),
        exhibitionSt: finiteNumber(
          entry?.exhibitionSt,
          entry?.exhibitionST,
          entry?.exhibition?.st,
          start?.st
        ),
        exhibitionTime: finiteNumber(
          entry?.exhibitionTime,
          entry?.tenjiTime,
          entry?.displayTime,
          entry?.exhibition?.displayTime
        ),
        partsExchange: text(
          entry?.partsExchange ??
          entry?.parts ??
          entry?.maintenance ??
          entry?.exhibition?.partsExchange
        ),
        averageSt: finiteNumber(
          entry?.averageSt,
          entry?.averageST,
          entry?.avgSt,
          entry?.avgST
        ),
        currentSeries: {
          ...(entry?.currentSeries || {}),
          st: Array.isArray(entry?.currentSeries?.st)
            ? entry.currentSeries.st
            : Array.isArray(entry?.currentRace?.stList)
              ? entry.currentRace.stList
              : []
        },
        localStarts,
        skillHistory: racer?.skillHistory || null
      };
    }

    function normalizeWeather(data, jcd) {
      const source =
        data?.weather ||
        data?.condition ||
        data?.raceCondition ||
        {};
      const windDirection = text(
        source?.windDirection ??
        source?.windDir ??
        source?.wind_direction ??
        data?.windDirection
      );
      const tideLevel = finiteNumber(
        source?.tideLevel,
        source?.currentTideLevel,
        data?.tideLevel,
        data?.currentTideLevel
      );
      const tideFlow = text(
        source?.tideFlow ??
        source?.currentTide ??
        source?.tidePhase ??
        source?.tideDirection ??
        data?.tideFlow ??
        data?.currentTide ??
        data?.tidePhase ??
        data?.tideDirection
      );
      const hasLiveTide =
        tideLevel !== null ||
        Boolean(tideFlow);

      return {
        ...source,
        windDirection,
        windDirectionCode: finiteNumber(
          source?.windDirectionCode,
          data?.windDirectionCode
        ),
        waterType:
          text(source?.waterType) ||
          text(data?.waterType) ||
          WATER_TYPES[jcd] ||
          "不明",
        tideLevel,
        tideFlow,
        tidePhase:
          text(source?.tidePhase) ||
          tideFlow,
        liveTideAvailable: hasLiveTide,
        tideStatus:
          hasLiveTide
            ? "acquired"
            : "unavailable",
        inputStatus: {
          ...(source?.inputStatus || {}),
          windDirection:
            windDirection
              ? "acquired"
              : "unavailable",
          tide:
            hasLiveTide
              ? "acquired"
              : "unavailable"
        }
      };
    }

    function normalize(data) {
      if (!data || typeof data !== "object") return data;
      if (data?.theoryInput?.version === VERSION) return data;

      const source = findEntries(data);
      const identity =
        boatIdentity?.inspectEntries(
          source.entries,
          {
            allowBoatNoFallback: false
          }
        ) || {
          valid: false,
          boatNos: source.entries.map(
            () => 0
          ),
          reasons: [{
            code: "identity_module_unavailable",
            label: "艇番整合性を確認できません"
          }]
        };
      const racerMap = historyRacerMap(data);
      const starts = startByBoat(data);
      const entries = source.entries.map(
        (entry, index) =>
          normalizeEntry(
            entry,
            index,
            racerMap,
            starts,
            identity.boatNos[index]
          )
      );
      const jcd = normalizeJcd(data);
      const weather =
        normalizeWeather(data, jcd);
      const normalized = {
        ...data,
        stadiumCode: jcd || data?.stadiumCode,
        [source.key]: entries,
        historyContext: normalizedHistoryContext(data, racerMap),
        weather,
        theoryInput: {
          version: VERSION,
          normalized: true,
          boatIdentity: identity,
          localStartsCount:
            entries.filter(
              (entry) =>
                finiteNumber(entry?.localStarts) !== null
            ).length,
          windDirectionAvailable:
            Boolean(weather.windDirection),
          liveTideAvailable:
            weather.liveTideAvailable ===
              true
        }
      };

      for (const key of ENTRY_KEYS) {
        if (
          key !== source.key &&
          Array.isArray(data[key]) &&
          data[key] === source.entries
        ) {
          normalized[key] = entries;
        }
      }

      return normalized;
    }

    function prepare(data, core = root?.ChappyAICore) {
      let prepared = normalize(data);
      if (!prepared || typeof prepared !== "object") {
        return prepared;
      }
      if (prepared?.theoryInput?.prepared === true) {
        return prepared;
      }

      const localApi = root?.ChappyLocalWaterV2;
      if (typeof localApi?.enhanceData === "function") {
        prepared =
          localApi.enhanceData(prepared, core)
            ?.data || prepared;
      }

      const motorApi =
        root?.ChappyMotorMaintenanceV2;
      if (typeof motorApi?.enhanceData === "function") {
        prepared =
          motorApi.enhanceData(prepared, core)
            ?.data || prepared;
      }

      return {
        ...prepared,
        theoryInput: {
          ...(prepared.theoryInput || {}),
          version: VERSION,
          normalized: true,
          prepared: true,
          policy:
            "8段階の優先順位・承認済み配点・買い目基準を変更しない"
        }
      };
    }

    return {
      VERSION,
      WATER_TYPES,
      normalize,
      prepare
    };
  }
);