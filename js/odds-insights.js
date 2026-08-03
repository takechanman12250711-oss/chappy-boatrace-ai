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

    function round(value, digits = 1) {
      const scale = 10 ** digits;

      return Math.round(
        (Number(value) + Number.EPSILON) *
          scale
      ) / scale;
    }

    function buildAllocation(rows) {
      const inverseTotal = rows.reduce(
        (sum, row) =>
          sum + 1 / row.odds,
        0
      );

      if (inverseTotal <= 0) {
        return [];
      }

      let allocated = 0;

      return rows.map((row, index) => {
        const isLast =
          index === rows.length - 1;

        const allocationRate = isLast
          ? round(100 - allocated, 1)
          : round(
              (
                (1 / row.odds) /
                inverseTotal
              ) * 100,
              1
            );

        allocated = round(
          allocated + allocationRate,
          1
        );

        return {
          ticket: row.ticket,
          odds: row.odds,
          allocationRate
        };
      });
    }

    function analyzeCategory(
      key,
      label,
      list
    ) {
      const tickets = Array.isArray(list)
        ? list
        : [];

      const rows = tickets
        .map((item, index) => {
          const odds = Number(
            item?.odds
          );

          if (
            !Number.isFinite(odds) ||
            odds <= 0
          ) {
            return null;
          }

          return {
            ticket: String(
              item?.ticket ||
              item?.line ||
              item?.formation ||
              `買い目${index + 1}`
            ).trim(),
            odds
          };
        })
        .filter(Boolean);

      const totalCount = tickets.length;
      const availableCount = rows.length;
      const coverageRate = totalCount
        ? round(
            availableCount /
              totalCount * 100,
            1
          )
        : 0;

      const isFormal =
        totalCount > 0 &&
        availableCount === totalCount;

      const referenceCombinedOdds =
        calculateCombinedOdds(
          rows.map(row => row.odds)
        );

      const inverseTotal = rows.reduce(
        (sum, row) =>
          sum + 1 / row.odds,
        0
      );

      const exactCombinedOdds =
        inverseTotal > 0
          ? 1 / inverseTotal
          : null;

      return {
        key,
        label,
        totalCount,
        availableCount,
        coverageRate,
        isFormal,
        combinedOdds: isFormal
          ? referenceCombinedOdds
          : null,
        referenceCombinedOdds,
        theoreticalRecoveryMarginPercent:
          isFormal &&
          exactCombinedOdds !== null
            ? round(
                (
                  exactCombinedOdds - 1
                ) * 100,
                1
              )
            : null,
        allocation: isFormal
          ? buildAllocation(rows)
          : []
      };
    }

    function buildCombinedOdds(
      prediction
    ) {
      const categories = {
        main: analyzeCategory(
          "main",
          "本線",
          prediction?.mainSheet?.tickets
        ),
        cover: analyzeCategory(
          "cover",
          "押さえ",
          prediction?.mainSheet
            ?.coverTickets
        ),
        flow: analyzeCategory(
          "flow",
          "流し",
          prediction?.mainSheet
            ?.flowTickets
        ),
        manshu: analyzeCategory(
          "manshu",
          "万舟",
          prediction?.manshuSheet?.tickets
        )
      };

      const categoryList =
        Object.values(categories);

      const totalCount =
        categoryList.reduce(
          (sum, category) =>
            sum + category.totalCount,
          0
        );

      const availableCount =
        categoryList.reduce(
          (sum, category) =>
            sum + category.availableCount,
          0
        );

      return {
        source: "boatrace-official",
        formula:
          "1 / Σ(1 / 個別オッズ)",
        allocationFormula:
          "(1 / 個別オッズ) / 逆数合計",
        totalCount,
        availableCount,
        coverageRate: totalCount
          ? round(
              availableCount /
                totalCount * 100,
              1
            )
          : 0,
        categories,
        main:
          categories.main.combinedOdds,
        cover:
          categories.cover.combinedOdds,
        flow:
          categories.flow.combinedOdds,
        manshu:
          categories.manshu.combinedOdds
      };
    }

    function compareMissingScarcity(
      a,
      b
    ) {
      return (
        Number(
          a?.recentOccurrences || 0
        ) -
          Number(
            b?.recentOccurrences || 0
          ) ||
        Number(
          b?.missingDays || 0
        ) -
          Number(
            a?.missingDays || 0
          ) ||
        a.ticket.localeCompare(
          b.ticket
        )
      );
    }

    function buildMissingTop30(
      missingData,
      _byTicket,
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

          return {
            ...item,
            ticket
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
            new Set(boats).size === 3 &&
            Number(
              item.recentOccurrences || 0
            ) === 0
          );
        })
        .sort(compareMissingScarcity)
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
          "zero-in-recent-30-days-then-missing-days"
      };
    }

    return {
      calculateCombinedOdds,
      analyzeCategory,
      buildCombinedOdds,
      compareMissingScarcity,
      buildMissingTop30
    };
  }
);
