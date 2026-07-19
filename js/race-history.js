// js/race-history.js
// 公式結果の統計を安全に読み込む補助機能

(function () {
  "use strict";

  const STATS_URL =
    "/data/stats/race-patterns.json";

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

    loadingPromise = fetch(
      STATS_URL,
      {
        cache: force
          ? "reload"
          : "default",

        headers: {
          accept: "application/json"
        }
      }
    )
      .then(response => {
        if (!response.ok) {
          throw new Error(
            "履歴統計の取得に失敗しました：" +
            response.status
          );
        }

        return response.json();
      })
      .then(data => {
        stats = validateStats(data);
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

  function getContext(
    options = {}
  ) {
    if (!stats) {
      return emptyContext();
    }

    const venue =
      getVenue(options.jcd);

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