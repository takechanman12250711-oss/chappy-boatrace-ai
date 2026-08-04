/* =========================================================
  チャッピーボートレースAI
  実戦厳選 最大7点固定境界

  固定仕様：本線3＋押さえ2を基本5点、
  流し1＋万舟1を加えても最大7点。
  独立展開は候補・監査情報として保持し、購入点数は増やさない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyPracticalMax7 = Object.freeze(api);
    api.install(root);
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const MAXIMUM_COUNT = 7;

  function arrayify(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeSelection(selection) {
    if (!selection || typeof selection !== "object") return selection;

    const originalTickets = arrayify(selection.tickets);
    const tickets = originalTickets.slice(0, MAXIMUM_COUNT);
    const removed = originalTickets.slice(MAXIMUM_COUNT);
    const removedTickets = new Set(removed.map(row => String(row?.ticket || "")));
    const excludedCandidates = [
      ...arrayify(selection.excludedCandidates),
      ...removed.map(row => ({
        ...row,
        selected: false,
        reasonCode: "MAXIMUM_REACHED",
        reason: "実戦厳選は固定仕様の最大7点に達したため、候補として保持する。"
      }))
    ];
    const candidateDecisions = arrayify(selection.candidateDecisions).map(row => {
      if (!removedTickets.has(String(row?.ticket || ""))) return row;
      return {
        ...row,
        selected: false,
        reasonCode: "MAXIMUM_REACHED",
        reason: "実戦厳選は固定仕様の最大7点に達したため、候補として保持する。"
      };
    });
    const addedTickets = arrayify(selection.expansionSummary?.addedTickets)
      .filter(row => !removedTickets.has(String(row?.ticket || "")));

    return {
      ...selection,
      reason: tickets.length >= MAXIMUM_COUNT
        ? "展開とコースから基本5点、流し・万舟を含めても最大7点に固定。"
        : "展開とコースから基本5〜7点を構成。",
      maximumCount: MAXIMUM_COUNT,
      tickets,
      excludedCandidates,
      candidateDecisions,
      expansionSummary: {
        ...(selection.expansionSummary || {}),
        addedCount: addedTickets.length,
        finalCount: tickets.length,
        hasIndependentAdditions: false,
        exceededNormalMaximum: false,
        addedTickets,
        reason: removed.length
          ? "8点目以降の独立展開は購入せず、候補・監査情報として保持。"
          : "固定仕様の最大7点以内。"
      },
      verificationEvidence: selection.verificationEvidence
        ? {
            ...selection.verificationEvidence,
            generation: {
              ...(selection.verificationEvidence.generation || {}),
              ticketPolicyVersion: "practical-5-7-fixed-v1"
            },
            tickets: arrayify(selection.verificationEvidence.tickets)
              .filter(row => !removedTickets.has(String(row?.ticket || "")))
          }
        : selection.verificationEvidence,
      max7Boundary: Object.freeze({
        fixedMaximum: MAXIMUM_COUNT,
        removedCount: removed.length,
        removedTickets: Object.freeze([...removedTickets])
      })
    };
  }

  function install(root) {
    const original = root?.ChappyPracticalSelection;
    if (!original || original.__max7Installed) return false;
    if (typeof original.select !== "function") return false;

    const select = prediction => normalizeSelection(original.select(prediction));
    const patched = {
      ...original,
      MAXIMUM_COUNT,
      select,
      createPracticalSelection(prediction) {
        return select(prediction).tickets;
      },
      normalizeMax7Selection: normalizeSelection,
      __max7Installed: true
    };

    root.ChappyPracticalSelection = Object.freeze(patched);
    return true;
  }

  return {
    MAXIMUM_COUNT,
    normalizeSelection,
    install
  };
});
