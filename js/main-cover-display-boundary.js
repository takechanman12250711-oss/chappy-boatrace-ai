/* =========================================================
  チャッピーボートレースAI
  通常予想 表示境界

  実戦厳選で選ばれた通常枠だけを、表示直前に各欄へ渡す。
  候補生成、選択順、買い目内容、オッズ値は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyMainCoverDisplayBoundary = Object.freeze(api);
    api.install(root);
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DISPLAY_LIMITS = Object.freeze({
    main: 3,
    cover: 2,
    flow: 2,
    hole: 1
  });
  const MINIMUM_FLOW_ROLE_SCORE = 65;

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeTicket(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  function ticketOf(item) {
    return normalizeTicket(
      typeof item === "string"
        ? item
        : item?.ticket || item?.line || item?.formation
    );
  }

  function flowAnchorOf(item) {
    const parts =
      ticketOf(item)
        .split("-")
        .map(Number);

    const ticketAnchor = (
      parts.length === 3 &&
      parts.every(
        value =>
          value >= 1 && value <= 6
      ) &&
      new Set(parts).size === 3
    )
      ? `${parts[0]}-${parts[1]}`
      : "";
    const explicit =
      String(
        item?.flowAnchor || ""
      ).trim();

    if (
      !ticketAnchor ||
      !explicit ||
      explicit !== ticketAnchor
    ) {
      return "";
    }

    return ticketAnchor;
  }

  function isGroundedFlowRow(item) {
    const parts =
      ticketOf(item)
        .split("-")
        .map(Number);
    const secondScore =
      Number(item?.flowSecondScore);
    const thirdScore =
      Number(item?.flowThirdScore);
    const roleEvidence =
      rows(item?.flowRoleEvidence);
    const secondEvidence =
      roleEvidence.find(row =>
        Number(row?.position) === 2 &&
        Number(row?.boatNo) === parts[1] &&
        String(row?.role || "") === "hold" &&
        Number(row?.score) >=
          MINIMUM_FLOW_ROLE_SCORE &&
        Boolean(
          String(row?.reason || "")
            .trim()
        )
      );
    const thirdEvidence =
      roleEvidence.find(row =>
        Number(row?.position) === 3 &&
        Number(row?.boatNo) === parts[2] &&
        ["pickup", "hold"].includes(
          String(row?.role || "")
        ) &&
        Number(row?.score) >=
          MINIMUM_FLOW_ROLE_SCORE &&
        Boolean(
          String(row?.reason || "")
            .trim()
        )
      );

    return (
      Boolean(flowAnchorOf(item)) &&
      Boolean(
        String(item?.scenarioId || "")
          .trim()
      ) &&
      Boolean(
        String(
          item?.flowCommonReason || ""
        ).trim()
      ) &&
      Boolean(
        String(
          item?.scenarioSummary || ""
        ).trim()
      ) &&
      secondScore >=
        MINIMUM_FLOW_ROLE_SCORE &&
      thirdScore >=
        MINIMUM_FLOW_ROLE_SCORE &&
      Boolean(secondEvidence) &&
      Boolean(thirdEvidence)
    );
  }

  function isAtomicFlowPair(list) {
    if (
      rows(list).length !== 2 ||
      !list.every(isGroundedFlowRow)
    ) {
      return false;
    }

    const anchors =
      list.map(flowAnchorOf);
    const scenarioIds =
      list.map(item =>
        String(
          item?.scenarioId || ""
        ).trim()
      );
    const commonReasons =
      list.map(item =>
        String(
          item?.flowCommonReason || ""
        ).trim()
      );

    return (
      Boolean(anchors[0]) &&
      anchors[0] === anchors[1] &&
      new Set(scenarioIds).size === 1 &&
      new Set(commonReasons).size === 1
    );
  }

  function hasOdds(item) {
    return Number.isFinite(Number(item?.odds)) && Number(item.odds) > 0;
  }

  function hasOddsText(item) {
    return Boolean(
      item?.oddsText && item.oddsText !== "オッズ未取得"
    );
  }

  function finalOddsSourceRank(item) {
    if (
      item?.isFinalRetrievedOdds !== true ||
      (!hasOdds(item) && !hasOddsText(item))
    ) {
      return 0;
    }

    const source = String(item.oddsSource || "");
    if (
      source === "boatrace-official" ||
      source === "boatrace-official-snapshot"
    ) {
      return 3;
    }
    if (source === "official-last-retrieved") return 2;
    return 1;
  }

  function savedAtTime(item) {
    const time = Date.parse(
      String(item?.oddsSavedAt || item?.savedAt || "")
    );
    return Number.isFinite(time) ? time : null;
  }

  function preferredOddsRow(existing, item) {
    const existingRank = finalOddsSourceRank(existing);
    const incomingRank = finalOddsSourceRank(item);

    if (existingRank || incomingRank) {
      if (existingRank !== incomingRank) {
        return incomingRank > existingRank ? item : existing;
      }

      const existingTime = savedAtTime(existing);
      const incomingTime = savedAtTime(item);
      if (existingTime !== null || incomingTime !== null) {
        if (existingTime === null) return item;
        if (incomingTime === null) return existing;
        if (existingTime !== incomingTime) {
          return incomingTime > existingTime ? item : existing;
        }
      }

      return existing;
    }

    if (hasOdds(item)) return item;
    if (!hasOdds(existing) && hasOddsText(item)) return item;
    return existing;
  }

  function mergeRow(existing, item) {
    if (!existing || typeof existing !== "object") return item;

    if (typeof item === "string") {
      return {
        ...existing,
        ticket: item
      };
    }

    if (!item || typeof item !== "object") return item;

    const oddsRow = preferredOddsRow(existing, item);
    const fallbackOddsRow = oddsRow === item ? existing : item;
    const oddsText = hasOddsText(oddsRow)
      ? oddsRow.oddsText
      : oddsRow.isFinalRetrievedOdds === true && hasOdds(oddsRow)
        ? `${oddsRow.odds}倍（最終取得）`
        : !hasOdds(oddsRow) && hasOddsText(fallbackOddsRow)
          ? fallbackOddsRow.oddsText
          : undefined;

    return {
      ...existing,
      ...item,
      odds:
        hasOdds(oddsRow)
          ? oddsRow.odds
          : fallbackOddsRow.odds,
      oddsText,
      oddsSource:
        oddsRow.oddsSource || fallbackOddsRow.oddsSource,
      oddsSavedAt:
        oddsRow.oddsSavedAt ||
        oddsRow.savedAt ||
        fallbackOddsRow.oddsSavedAt ||
        fallbackOddsRow.savedAt,
      isFinalRetrievedOdds:
        oddsRow.isFinalRetrievedOdds === true
    };
  }

  function mergeDisplayRows(sourceRows, existingRows) {
    const existingByTicket = new Map();

    rows(existingRows).forEach(item => {
      const ticket = ticketOf(item);
      if (!ticket) return;

      existingByTicket.set(
        ticket,
        mergeRow(existingByTicket.get(ticket), item)
      );
    });

    return rows(sourceRows).map(item => {
      const existing = existingByTicket.get(ticketOf(item));
      return mergeRow(existing, item);
    });
  }

  function isSkipped(selection) {
    const status = String(selection?.status || "").toLowerCase();
    return status === "skipped" || status === "skip" || status.includes("見送り");
  }

  function isIndependentAddition(item) {
    if (!item || typeof item !== "object") return false;

    const categories = [
      item.category,
      item.type,
      item.selectionTier
    ].map(value => String(value || ""));

    return String(item.selectionTier || "") === "展開追加" ||
      categories.some(value => value.includes("独立展開"));
  }

  function categoryOf(item) {
    if (!item || typeof item !== "object") return "";

    function classify(value) {
      const category = String(value || "");
      if (/本線|本命/.test(category)) return "main";
      if (/押さえ|抑え/.test(category)) return "cover";
      if (/流し/.test(category)) return "flow";
      if (/万舟|穴/.test(category)) return "hole";
      return "";
    }

    const direct = classify(item.category) || classify(item.type);
    if (direct) return direct;

    for (const category of rows(item.categories)) {
      const fallback = classify(category);
      if (fallback) return fallback;
    }
    return "";
  }

  function allExistingRows(prediction) {
    return [
      ...rows(prediction?.ticketSheets?.main),
      ...rows(prediction?.ticketSheets?.cover),
      ...rows(prediction?.ticketSheets?.flow),
      ...rows(prediction?.ticketSheets?.hole),
      ...rows(prediction?.aiCore?.mainSheet?.tickets),
      ...rows(prediction?.aiCore?.mainSheet?.coverTickets),
      ...rows(prediction?.aiCore?.mainSheet?.flowTickets),
      ...rows(prediction?.aiCore?.manshuSheet?.tickets),
      ...rows(prediction?.mainSheet?.tickets),
      ...rows(prediction?.mainSheet?.coverTickets),
      ...rows(prediction?.mainSheet?.flowTickets),
      ...rows(prediction?.manshuSheet?.tickets),
      ...rows(prediction?.practicalTickets),
      ...rows(prediction?.practicalSelection?.tickets)
    ];
  }

  function resolveSelection(prediction, selector) {
    let selection =
      prediction?.practicalSelection &&
      typeof prediction.practicalSelection === "object"
        ? prediction.practicalSelection
        : null;
    let selectedAtBoundary = false;

    if (
      !selection &&
      !Array.isArray(prediction?.practicalTickets) &&
      typeof selector?.select === "function"
    ) {
      try {
        const resolved = selector.select(prediction);
        if (resolved && typeof resolved === "object") {
          selection = resolved;
          selectedAtBoundary = true;
        }
      } catch (_) {
        selection = null;
      }
    }

    if (isSkipped(selection)) {
      return {
        available: true,
        status: "skipped",
        selection,
        selectedAtBoundary,
        tickets: []
      };
    }

    let source = null;
    if (rows(selection?.tickets).length) {
      source = selection.tickets;
    } else if (Array.isArray(prediction?.practicalTickets)) {
      source = prediction.practicalTickets;
    } else if (Array.isArray(selection?.tickets)) {
      source = selection.tickets;
    }

    if (!source) {
      return {
        available: false,
        status: "unavailable",
        selection,
        selectedAtBoundary,
        tickets: []
      };
    }

    const normalCount = Number(selection?.expansionSummary?.normalCount);
    const normalRows =
      Number.isInteger(normalCount) && normalCount >= 0
        ? source.slice(0, normalCount)
        : source.slice();

    return {
      available: true,
      status: "selected",
      selection,
      selectedAtBoundary,
      tickets: normalRows.filter(item => !isIndependentAddition(item))
    };
  }

  function resolveNormalDisplayRows(prediction, selector) {
    const resolved = resolveSelection(prediction, selector);
    const grouped = {
      main: [],
      cover: [],
      flow: [],
      hole: []
    };

    if (!resolved.available || resolved.status === "skipped") {
      return {
        ...resolved,
        ...grouped
      };
    }

    const selectedRows = mergeDisplayRows(
      resolved.tickets,
      allExistingRows(prediction)
    );
    const seenTickets = new Set();

    selectedRows.forEach(item => {
      const ticket = ticketOf(item);
      if (!ticket || seenTickets.has(ticket)) return;
      seenTickets.add(ticket);

      const category = categoryOf(item);
      if (!category || grouped[category].length >= DISPLAY_LIMITS[category]) {
        return;
      }
      grouped[category].push(item);
    });

    if (
      !isAtomicFlowPair(
        grouped.flow
      )
    ) {
      grouped.flow = [];
    } else {
      grouped.hole = [];
    }

    return {
      ...resolved,
      ...grouped
    };
  }

  function prepare(prediction, selector) {
    if (!prediction || typeof prediction !== "object") return prediction;

    const displayRows = resolveNormalDisplayRows(prediction, selector);
    if (!displayRows.available) return prediction;

    const mainSheetFields = {
      tickets: displayRows.main,
      coverTickets: displayRows.cover,
      flowTickets: displayRows.flow
    };
    const manshuSheetFields = {
      tickets: displayRows.hole
    };
    const display = {
      ...prediction,
      mainSheet: {
        ...(prediction.mainSheet || {}),
        ...mainSheetFields
      },
      manshuSheet: {
        ...(prediction.manshuSheet || {}),
        ...manshuSheetFields
      }
    };

    if (displayRows.selectedAtBoundary && displayRows.selection) {
      display.practicalSelection = displayRows.selection;
    }

    if (prediction.aiCore && typeof prediction.aiCore === "object") {
      display.aiCore = {
        ...prediction.aiCore,
        mainSheet: {
          ...(prediction.aiCore.mainSheet || {}),
          ...mainSheetFields
        },
        manshuSheet: {
          ...(prediction.aiCore.manshuSheet || {}),
          ...manshuSheetFields
        }
      };
    }

    return display;
  }

  function install(root) {
    if (!root || root.__mainCoverDisplayBoundaryInstalled) return false;

    ["renderAll", "renderPrediction"].forEach(name => {
      const original = root[name];
      if (typeof original !== "function") return;

      root[name] = function (prediction, ...args) {
        // 本番ではこのwrapperがrender adapterの外側に載るため、
        // selectorを呼ぶ前に同じadapterを明示的に適用する。
        const adapter = root.ChappyRenderAdapter;
        const adaptedPrediction =
          adapter && typeof adapter.applyAiCoreAdapter === "function"
            ? adapter.applyAiCoreAdapter(prediction)
            : prediction;

        return original.call(
          this,
          prepare(adaptedPrediction, root.ChappyPracticalSelection),
          ...args
        );
      };
    });

    root.__mainCoverDisplayBoundaryInstalled = true;
    return true;
  }

  return {
    DISPLAY_LIMITS,
    isAtomicFlowPair,
    mergeDisplayRows,
    resolveNormalDisplayRows,
    prepare,
    install
  };
});
