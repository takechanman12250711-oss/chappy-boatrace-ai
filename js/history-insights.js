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

    function buildTrend(pattern) {
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
