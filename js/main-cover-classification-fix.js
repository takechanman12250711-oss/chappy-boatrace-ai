/* =========================================================
  チャッピーボートレースAI
  本命・押さえ分類整合

  生成済みの main / cover 分類を入れ替えず、
  アプリ全体で同じ向きへ揃える。
========================================================= */
(function (root) {
  "use strict";

  if (!root || root.__chappyMainCoverClassificationFixInstalled) return;

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function ticketOf(item) {
    return String(
      typeof item === "string"
        ? item
        : item?.ticket || item?.line || item?.formation || ""
    ).replace(/\s+/g, "").trim();
  }

  function relabelRow(item, target) {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return item;

    const isMain = target === "main";
    const primary = isMain ? "本命" : "押さえ";
    const secondary = isMain ? "中心展開" : "安全押さえ";
    const type = isMain ? "main" : "cover";
    const next = { ...item };

    ["role", "category", "group", "sheetRole", "label"].forEach(key => {
      if (key in next) next[key] = primary;
    });
    ["type", "sheetType", "ticketType"].forEach(key => {
      if (key in next) next[key] = type;
    });

    const existingLabels = Array.isArray(next.roleLabels)
      ? next.roleLabels.filter(label => !["本命", "押さえ", "本線", "中心展開", "安全押さえ"].includes(String(label || "").trim()))
      : [];
    next.roleLabels = [...new Set([primary, secondary, ...existingLabels])];

    return next;
  }

  function dedupe(list) {
    const seen = new Set();
    return rows(list).filter(item => {
      const ticket = ticketOf(item);
      if (!ticket || seen.has(ticket)) return false;
      seen.add(ticket);
      return true;
    });
  }

  function normalize(prediction) {
    if (!prediction || typeof prediction !== "object") return prediction;
    if (prediction.__mainCoverClassificationNormalized) return prediction;

    const formation = prediction.formation || {};
    const ticketSheets = prediction.ticketSheets || {};
    const mainSheet = prediction.mainSheet || {};

    const mainFormation = rows(formation.main);
    const coverFormation = rows(formation.cover);
    const sourceMainRows = rows(ticketSheets.main).length
      ? rows(ticketSheets.main)
      : rows(mainSheet.tickets);
    const sourceCoverRows = rows(ticketSheets.cover).length
      ? rows(ticketSheets.cover)
      : rows(mainSheet.coverTickets);

    if (!mainFormation.length && !coverFormation.length &&
        !sourceMainRows.length && !sourceCoverRows.length) {
      return prediction;
    }

    const mainRows = sourceMainRows.map(item => relabelRow(item, "main"));
    const coverRows = sourceCoverRows.map(item => relabelRow(item, "cover"));
    const flowRows = rows(ticketSheets.flow);
    const holeRows = rows(ticketSheets.hole);

    const mainTickets = new Set(mainRows.map(ticketOf).filter(Boolean));
    const coverTickets = new Set(coverRows.map(ticketOf).filter(Boolean));

    function normalizeList(list) {
      return dedupe(rows(list).map(item => {
        const ticket = ticketOf(item);
        if (mainTickets.has(ticket)) return relabelRow(item, "main");
        if (coverTickets.has(ticket)) return relabelRow(item, "cover");
        return item;
      }));
    }

    const correctedAll = dedupe([
      ...mainRows,
      ...coverRows,
      ...flowRows,
      ...holeRows
    ]);

    return {
      ...prediction,
      __mainCoverClassificationNormalized: true,
      formation: {
        ...formation,
        main: mainFormation.slice(),
        cover: coverFormation.slice()
      },
      mainSheet: {
        ...mainSheet,
        tickets: mainRows,
        coverTickets: coverRows
      },
      ticketSheets: {
        ...ticketSheets,
        main: mainRows,
        cover: coverRows,
        all: correctedAll
      },
      aiTicketList: normalizeList(
        rows(prediction.aiTicketList).length
          ? prediction.aiTicketList
          : correctedAll
      ),
      ticketRanks: normalizeList(prediction.ticketRanks),
      tickets: normalizeList(prediction.tickets),
      buyTickets: normalizeList(prediction.buyTickets)
    };
  }

  const original = root.createPrediction;
  if (typeof original === "function") {
    root.createPrediction = function (...args) {
      const result = original.apply(this, args);
      if (result && typeof result.then === "function") {
        return result.then(normalize);
      }
      return normalize(result);
    };
  }

  root.ChappyMainCoverClassificationFix = Object.freeze({ normalize });
  root.__chappyMainCoverClassificationFixInstalled = true;
})(window);
