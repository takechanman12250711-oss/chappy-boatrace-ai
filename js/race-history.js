// js/race-history.js
// 公式結果の統計を安全に読み込む補助機能

(function () {
  "use strict";

  const STATS_URL =
    "/data/stats/race-patterns.json?v=20260723-skill1";

  const VENUE_RACE_STATS_URL =
    "/data/stats/venue-race-patterns.json";

  const RACER_SKILL_STATS_URL =
    "/data/stats/racer-skill-patterns.json?v=20260723-skill1";

  const MIN_VENUE_SAMPLES = 30;
  const MIN_RACER_SAMPLES = 12;

  let stats = null;
  let loadingPromise = null;
  let lastError = null;

  function emptyContext() {
    return {
      ready: false,
      source: "",
      generatedAt: "",
      venue: null,
      racers: [],
      usableVenueHistory: false,
      usableRacerHistory: false,
      warnings: [
        "履歴統計はまだ読み込まれていません"
      ]
    };
  }

  function normalizeJcd(value) {
    const number = Number(value);

    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > 24
    ) {
      return "";
    }

    return String(number).padStart(2, "0");
  }

  function normalizeRegisterNo(value) {
    const text = String(
      value || ""
    ).trim();

    return /^\d{4}$/.test(text)
      ? text
      : "";
  }

  function validateStats(data) {
    if (
      !data ||
      typeof data !== "object"
    ) {
      throw new Error(
        "履歴統計の形式が正しくありません"
      );
    }

    if (
      data.source !==
      "boatrace-official"
    ) {
      throw new Error(
        "公式結果以外の履歴統計は使用できません"
      );
    }

    if (
      !data.overall ||
      !data.byVenue ||
      !data.racers
    ) {
      throw new Error(
        "履歴統計に必要な項目がありません"
      );
    }

    return data;
  }

  async function load(options = {}) {
    const force = Boolean(
      options.force
    );

    if (stats && !force) {
      return stats;
    }

    if (
      loadingPromise &&
      !force
    ) {
      return loadingPromise;
    }

    lastError = null;

    const fetchJson = url => fetch(
      url,
      {
        cache: force ? "reload" : "default",
        headers: { accept: "application/json" }
      }
    ).then(response => {
      if (!response.ok) {
        throw new Error(
          "履歴統計の取得に失敗しました：" +
          response.status
        );
      }
      return response.json();
    });

    loadingPromise = Promise.all([
      fetchJson(STATS_URL),
      fetchJson(VENUE_RACE_STATS_URL),
      fetchJson(RACER_SKILL_STATS_URL)
    ])
      .then(([
        data,
        venueRaceData,
        racerSkillData
      ]) => {
        if (
          racerSkillData?.source !==
            "boatrace-official" ||
          !racerSkillData?.racers
        ) {
          throw new Error(
            "選手技量履歴の形式が正しくありません"
          );
        }

        const racers = Object.fromEntries(
          Object.entries(
            data.racers || {}
          ).map(([registerNo, racer]) => [
            registerNo,
            {
              ...racer,
              skillHistory:
                racerSkillData.racers[
                  registerNo
                ] || null
            }
          ])
        );

        stats = validateStats({
          ...data,
          racers,
          analysisWindow:
            racerSkillData.analysisWindow ||
            venueRaceData.analysisWindow ||
            null,
          byVenueRace:
            venueRaceData.byVenueRace || {}
        });
        return stats;
      })
      .catch(error => {
        lastError = error;
        throw error;
      })
      .finally(() => {
        loadingPromise = null;
      });

    return loadingPromise;
  }

  function getSummary() {
    if (!stats) return null;

    return {
      source: stats.source,

      generatedAt:
        stats.generatedAt || "",

      firstDate:
        stats.firstDate || "",

      lastDate:
        stats.lastDate || "",

      sourceFileCount:
        Number(
          stats.sourceFileCount || 0
        ),

      raceCount:
        Number(
          stats.raceCount || 0
        ),

      reliability:
        stats.overall?.reliability ||
        "low"
    };
  }

  function getVenue(jcd) {
    if (!stats) return null;

    const code =
      normalizeJcd(jcd);

    if (!code) return null;

    const venue =
      stats.byVenue?.[code];

    if (!venue) return null;

    const samples =
      Number(
        venue.totalRaces || 0
      );

    return {
      ...venue,
      samples,
      usable:
        samples >=
        MIN_VENUE_SAMPLES
    };
  }

  function getRacer(registerNo) {
    if (!stats) return null;

    const code =
      normalizeRegisterNo(
        registerNo
      );

    if (!code) return null;

    const racer =
      stats.racers?.[code];

    if (!racer) return null;

    const samples =
      Number(
        racer.starts || 0
      );

    return {
      ...racer,
      samples,
      usable:
        samples >=
        MIN_RACER_SAMPLES
    };
  }

  function getVenueRace(
    jcd,
    raceNo
  ) {
    if (!stats) return null;

    const pattern =
      window.ChappyHistoryInsights
        ?.getPattern(
          stats,
          jcd,
          raceNo
        ) || null;

    if (!pattern) return null;

    return {
      ...pattern,
      trend:
        window.ChappyHistoryInsights
          ?.buildTrend(
            pattern,
            stats.overall || null
          ) || null
    };
  }

  function getContext(
    options = {}
  ) {
    if (!stats) {
      return emptyContext();
    }

    const venue =
      getVenue(options.jcd);

    const venueRace =
      getVenueRace(
        options.jcd,
        options.raceNo || options.rno
      );

    const registerNos =
      Array.isArray(
        options.registerNos
      )
        ? options.registerNos
        : [];

    const racers =
      registerNos
        .map(getRacer)
        .filter(Boolean);

    const usableRacers =
      racers.filter(
        racer => racer.usable
      );

    const warnings = [];

    if (
      venue &&
      !venue.usable
    ) {
      warnings.push(
        `会場別履歴は${venue.samples}レースのため参考表示のみです`
      );
    }

    if (
      racers.length &&
      !usableRacers.length
    ) {
      warnings.push(
        "選手別履歴はサンプル不足のため評価へ加算しません"
      );
    }

    return {
      ready: true,

      source:
        stats.source,

      generatedAt:
        stats.generatedAt || "",

      firstDate:
        stats.firstDate || "",

      lastDate:
        stats.lastDate || "",

      venue,
      venueRace,
      racers,

      usableVenueHistory:
        Boolean(venue?.usable),

      usableRacerHistory:
        usableRacers.length > 0,

      warnings
    };
  }

  function getStatus() {
    return {
      ready: Boolean(stats),

      loading:
        Boolean(
          loadingPromise
        ),

      error:
        lastError?.message || "",

      summary:
        getSummary()
    };
  }

  window.ChappyRaceHistory =
    Object.freeze({
      load,
      getStatus,
      getSummary,
      getVenue,
      getVenueRace,
      getRacer,
      getContext,

      limits:
        Object.freeze({
          venueSamples:
            MIN_VENUE_SAMPLES,

          racerSamples:
            MIN_RACER_SAMPLES
        })
    });
})();
