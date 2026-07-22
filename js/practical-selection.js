/* =========================================================
  チャッピーボートレースAI
  実戦厳選・共通処理

  役割：
  - アプリ・note・自動保存で同じ買い目を返す
  - 本線3＋押さえ2を基本5点とする
  - 展開根拠がある場合だけ流し1・万舟1を追加する
  - 本線不成立、または基本5点を作れない場合は見送る
========================================================= */

(function (root) {
  "use strict";

  const STANDARD_COUNT = 5;
  const MAXIMUM_COUNT = 7;

  function arrayify(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === "") return [];
    return [value];
  }

  function validTicket(ticket) {
    if (!/^[1-6]-[1-6]-[1-6]$/.test(ticket)) return false;
    return new Set(ticket.split("-")).size === 3;
  }

  function normalizeTicket(item, category) {
    const row = typeof item === "string" ? { ticket: item } : item || {};
    const ticket = String(
      row.ticket || row.line || row.formation || ""
    ).trim();

    return {
      ...row,
      ticket,
      category,
      scenarioType: String(
        row.scenarioType || arrayify(row.scenarioTypes)[0] || ""
      ),
      odds: Number.isFinite(Number(row.odds)) && Number(row.odds) > 0
        ? Number(row.odds)
        : 0,
      amount: 0,
      comment: String(
        row.scenarioSummary || row.comment || row.reason || ""
      )
    };
  }

  function ticketLists(prediction) {
    return {
      main: arrayify(
        prediction?.mainSheet?.tickets || prediction?.ticketSheets?.main
      ),
      cover: arrayify(
        prediction?.mainSheet?.coverTickets || prediction?.ticketSheets?.cover
      ),
      flow: arrayify(
        prediction?.mainSheet?.flowTickets || prediction?.ticketSheets?.flow
      ),
      longshot: arrayify(
        prediction?.manshuSheet?.tickets || prediction?.ticketSheets?.hole
      )
    };
  }

  function evidenceOf(prediction) {
    const formations =
      prediction?.aiCore?.formations || prediction?.formations || {};
    const evidence = formations.evidence || {};

    return {
      mainEstablished: formations.mainEstablished === true,
      flow: evidence.flow === true,
      longshot: evidence.longshot === true
    };
  }

  function select(prediction) {
    const lists = ticketLists(prediction);
    const evidence = evidenceOf(prediction);
    const selected = [];
    const used = new Set();

    if (!evidence.mainEstablished || !lists.main.length) {
      return {
        status: "skipped",
        reason: "主軸となる展開が定まらないため見送り。",
        standardCount: STANDARD_COUNT,
        maximumCount: MAXIMUM_COUNT,
        tickets: []
      };
    }

    function take(list, limit, category) {
      let added = 0;

      for (const item of arrayify(list)) {
        if (added >= limit || selected.length >= MAXIMUM_COUNT) break;

        const row = normalizeTicket(item, category);
        if (!validTicket(row.ticket) || used.has(row.ticket)) continue;

        used.add(row.ticket);
        selected.push(row);
        added += 1;
      }

      return added;
    }

    const mainCount = take(lists.main, 3, "本線");
    const coverCount = take(lists.cover, 2, "押さえ");

    if (mainCount !== 3 || coverCount !== 2) {
      return {
        status: "skipped",
        reason: "本線3点・押さえ2点の基本5点を構成できないため見送り。",
        standardCount: STANDARD_COUNT,
        maximumCount: MAXIMUM_COUNT,
        tickets: []
      };
    }

    if (evidence.flow) take(lists.flow, 1, "流し");
    if (evidence.longshot) take(lists.longshot, 1, "万舟・穴");

    return {
      status: "selected",
      reason: "展開とコースから基本5点を構成。",
      standardCount: STANDARD_COUNT,
      maximumCount: MAXIMUM_COUNT,
      evidence,
      tickets: selected
    };
  }

  const api = {
    STANDARD_COUNT,
    MAXIMUM_COUNT,
    select,
    createPracticalSelection(prediction) {
      return select(prediction).tickets;
    }
  };

  root.ChappyPracticalSelection = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
