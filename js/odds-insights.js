/* =========================================================
  公式オッズ・出てない目の参考表示
  - 買い目の作成・削除には使用しない
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
    root.ChappyOddsInsights =
      Object.freeze(api);
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis,
  function () {
    "use strict";

    function calculateCombinedOdds(
      oddsList
    ) {
      const values = Array.isArray(
        oddsList
      )
        ? oddsList
            .map(Number)
            .filter(value =>
              Number.isFinite(value) &&
              value > 0
            )
        : [];

      if (!values.length) {
        return null;
      }

      const inverse = values.reduce(
        (sum, value) =>
          sum + 1 / value,
        0
      );

      return inverse > 0
        ? Number(
            (1 / inverse).toFixed(1)
          )
        : null;
    }

    function combinedOddsOf(list) {
      return calculateCombinedOdds(
        Array.isArray(list)
          ? list.map(item =>
              item?.odds
            )
          : []
      );
    }

    function buildCombinedOdds(
      prediction
    ) {
      return {
        source: "boatrace-official",
        formula:
          "1 / Σ(1 / 個別オッズ)",
        main: combinedOddsOf(
          prediction?.mainSheet?.tickets
        ),
        cover: combinedOddsOf(
          prediction?.mainSheet
            ?.coverTickets
        ),
        flow: combinedOddsOf(
          prediction?.mainSheet
            ?.flowTickets
        ),
        manshu: combinedOddsOf(
          prediction?.manshuSheet?.tickets
        )
      };
    }

    function buildMissingTop30(
      missingData,
      byTicket,
      limit = 30
    ) {
      const source = Array.isArray(
        missingData?.missingNumbers
      )
        ? missingData.missingNumbers
        : [];

      const rows = source
        .map(item => {
          const ticket = String(
            item?.ticket || ""
          );

          const odds = Number(
            byTicket?.[ticket]
          );

          return {
            ...item,
            ticket,
            odds:
              Number.isFinite(odds) &&
              odds > 0
                ? odds
                : null
          };
        })
        .filter(item => {
          const boats =
            item.ticket
              .split("-")
              .map(Number);

          return (
            boats.length === 3 &&
            boats.every(boat =>
              Number.isInteger(boat) &&
              boat >= 1 &&
              boat <= 6
            ) &&
            new Set(boats).size === 3
          );
        })
        .sort((a, b) => {
          const oddsA =
            Number.isFinite(a.odds)
              ? a.odds
              : Number.POSITIVE_INFINITY;

          const oddsB =
            Number.isFinite(b.odds)
              ? b.odds
              : Number.POSITIVE_INFINITY;

          return (
            oddsA - oddsB ||
            a.ticket.localeCompare(
              b.ticket
            )
          );
        })
        .slice(
          0,
          Math.max(0, Number(limit) || 0)
        )
        .map((item, index) => ({
          ...item,
          rank: index + 1
        }));

      return {
        ...missingData,
        top30: rows,
        displayedCount: rows.length,
        sort:
          "current-odds-ascending"
      };
    }

    return {
      calculateCombinedOdds,
      buildCombinedOdds,
      buildMissingTop30
    };
  }
);
