/* =========================================================
  チャッピーボートレースAI
  本命・押さえ分類修正

  既存の買い目は変更せず、生成済みの main / cover 分類だけを
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

  function swapWords(value) {
    if (typeof value !== "string") return value;
    return value
      .replace(/本線/g, "__CHAPPY_COVER__")
      .replace(/本命/g, "__CHAPPY_COVER_LABEL__")
      .replace(/中心展開/g, "__CHAPPY_SAFE__")
      .replace(/押さえ/g, "本線")
      .replace(/安全押さえ/g, "中心展開")
      .replace(/__CHAPPY_COVER__/g, "押さえ")
      .replace(/__CHAPPY_COVER_LABEL__/g, "押さえ")
      .replace(/__CHAPPY_SAFE__/g, "安全押さえ");
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

    if (Array.isArray(next.roleLabels)) {
      const filtered = next.roleLabels
        .map(swapWords)
        .filter(label => !["流し", "流し展開"].includes(String(label || "").trim()));
      next.roleLabels = [...new Set([primary, secondary, ...filtered])];
    } else {
      next.roleLabels = [primary, secondary];
    }

    ["reason", "comment", "description", "summary"].forEach(key => {
      if (typeof next[key] === "string") next[key] = swapWords(next[key]);
    });

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

    const oldMainFormation = rows(formation.main);
    const oldCoverFormation = rows(formation.cover);
    const oldMainRows = rows(ticketSheets.main).length
      ? rows(ticketSheets.main)
      : rows(mainSheet.tickets);
    const oldCoverRows = rows(ticketSheets.cover).length
      ? rows(ticketSheets.cover)
      : rows(mainSheet.coverTickets);

    if (!oldMainFormation.length && !oldCoverFormation.length &&
        !oldMainRows.length && !oldCoverRows.length) {
      return prediction;
    }

    const newMainRows = oldCoverRows.map(item => relabelRow(item, "main"));
    const newCoverRows = oldMainRows.map(item => relabelRow(item, "cover"));
    const flowRows = rows(ticketSheets.flow);
    const holeRows = rows(ticketSheets.hole);

    const mainTickets = new Set(newMainRows.map(ticketOf).filter(Boolean));
    const coverTickets = new Set(newCoverRows.map(ticketOf).filter(Boolean));

    function normalizeList(list) {
      return dedupe(rows(list).map(item => {
        const ticket = ticketOf(item);
        if (mainTickets.has(ticket)) return relabelRow(item, "main");
        if (coverTickets.has(ticket)) return relabelRow(item, "cover");
        return item;
      }));
    }

    const correctedAll = dedupe([
      ...newMainRows,
      ...newCoverRows,
      ...flowRows,
      ...holeRows
    ]);

    return {
      ...prediction,
      __mainCoverClassificationNormalized: true,
      formation: {
        ...formation,
        main: oldCoverFormation.slice(),
        cover: oldMainFormation.slice()
      },
      mainSheet: {
        ...mainSheet,
        tickets: newMainRows,
        coverTickets: newCoverRows
      },
      ticketSheets: {
        ...ticketSheets,
        main: newMainRows,
        cover: newCoverRows,
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
