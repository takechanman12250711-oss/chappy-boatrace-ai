/* =========================================================
  AI予想と公式結果の共通照合

  重要：検証結果を返すだけで、予想ロジック・重み・買い目は変更しない。
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyPredictionVerification = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const MARKS = [
    { key: "honmei", symbol: "◎", label: "本命" },
    { key: "taikou", symbol: "○", label: "対抗" },
    { key: "ana", symbol: "▲", label: "穴" },
    { key: "osae", symbol: "△", label: "押さえ" }
  ];

  const CATEGORY_ORDER = ["本線", "押さえ", "流し", "万舟・穴", "その他"];

  function normalizeTicket(value) {
    const boats = String(value || "").match(/[1-6]/g) || [];
    if (boats.length < 3) return "";
    const ticket = boats.slice(0, 3);
    return new Set(ticket).size === 3 ? ticket.join("-") : "";
  }

  function percentage(count, total) {
    return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function boatNoOf(value) {
    const number = Number(value?.boatNo ?? value?.no ?? value?.boat ?? value);
    return number >= 1 && number <= 6 ? number : 0;
  }

  function normalizeCategory(value) {
    const text = String(value || "");
    if (/本線|本命|中心/.test(text)) return "本線";
    if (/押さえ|安全/.test(text)) return "押さえ";
    if (/流し/.test(text)) return "流し";
    if (/万舟|穴|高配当/.test(text)) return "万舟・穴";
    return "その他";
  }

  function getPracticalRows(prediction) {
    const source = Array.isArray(prediction?.practicalTickets)
      ? prediction.practicalTickets
      : [];
    const used = new Set();

    return source
      .map(item => {
        const row = typeof item === "string" ? { ticket: item } : item || {};
        return {
          ticket: normalizeTicket(row.ticket || row.line || row.formation),
          category: normalizeCategory(row.category || row.role)
        };
      })
      .filter(row => {
        if (!row.ticket || used.has(row.ticket)) return false;
        used.add(row.ticket);
        return true;
      })
      .slice(0, 7);
  }

  function classifyMiss(tickets, resultTicket) {
    const actual = normalizeTicket(resultTicket);
    const selected = (Array.isArray(tickets) ? tickets : [])
      .map(normalizeTicket)
      .filter(Boolean);

    if (!actual || selected.length === 0) return "見送り";
    if (selected.includes(actual)) return "的中";

    const result = actual.split("-");
    const normalized = selected.map(ticket => ticket.split("-"));
    if (!normalized.some(ticket => ticket[0] === result[0])) return "頭外れ";

    if (normalized.some(ticket =>
      [...ticket].sort().join("") === [...result].sort().join("")
    )) return "着順違い";

    const resultOpponents = new Set(result.slice(1));
    const hasOneOpponent = normalized.some(ticket =>
      ticket[0] === result[0] &&
      ticket.slice(1).some(boat => resultOpponents.has(boat))
    );
    return hasOneOpponent ? "相手抜け" : "完全抜け";
  }

  function predictedScenarioTitle(prediction) {
    return String(
      prediction?.predictedScenarioTitle ||
      prediction?.raceFlow?.title ||
      prediction?.raceFlow?.scenario?.title ||
      ""
    ).trim();
  }

  function expectedWinningMethods(title) {
    const text = String(title || "");
    if (/まくり差し/.test(text)) return ["まくり差し"];
    if (/まくり/.test(text)) return ["まくり"];
    if (/差し/.test(text)) return ["差し"];
    if (/逃げ|イン先行|イン中心/.test(text)) return ["逃げ"];
    if (/[34]コース攻め|[34]攻め|4カド/.test(text)) {
      return ["まくり", "まくり差し"];
    }
    return [];
  }

  function expectedWinningMethod(title) {
    return expectedWinningMethods(title).join("／");
  }

  function normalizeWinningMethod(value) {
    const text = String(value || "").trim();
    if (/まくり差し/.test(text)) return "まくり差し";
    if (/まくり/.test(text)) return "まくり";
    if (/差し/.test(text)) return "差し";
    if (/逃げ/.test(text)) return "逃げ";
    if (/抜き/.test(text)) return "抜き";
    if (/恵まれ/.test(text)) return "恵まれ";
    return text;
  }

  function getMarkResults(prediction, resultTicket) {
    const order = normalizeTicket(resultTicket).split("-");
    const sheet = prediction?.mainSheet || {};

    return MARKS.map(mark => {
      const boatNo = boatNoOf(sheet[mark.key]);
      const index = boatNo ? order.indexOf(String(boatNo)) : -1;
      return {
        ...mark,
        boatNo,
        finish: boatNo ? (index >= 0 ? index + 1 : 4) : 0,
        finishLabel: boatNo ? (index >= 0 ? `${index + 1}着` : "4着以下") : "-"
      };
    });
  }

  function verifyPrediction(prediction, result) {
    const resultTicket = normalizeTicket(
      result?.resultTicket || result?.result || result?.trifecta?.combination
    );
    const settled = Boolean(
      resultTicket && result?.resultAvailable !== false && result?.settled !== false
    );
    const practicalRows = getPracticalRows(prediction);
    const practicalTickets = practicalRows.map(row => row.ticket);
    const winningMethod = normalizeWinningMethod(result?.winningMethod);
    const scenarioTitle = predictedScenarioTitle(prediction);
    const expectedMethods = expectedWinningMethods(scenarioTitle);
    const expectedMethod = expectedMethods.join("／");
    const comparableMethod = ["逃げ", "差し", "まくり", "まくり差し"]
      .includes(winningMethod);
    const hitRow = practicalRows.find(row => row.ticket === resultTicket) || null;
    const payoutPer100 = numberOrZero(
      result?.payout ?? result?.officialPayoutPer100 ?? result?.trifecta?.payout
    );
    const simulatedStake = practicalRows.length * 100;
    const simulatedReturn = hitRow ? payoutPer100 : 0;

    return {
      schemaVersion: 2,
      settled,
      resultTicket,
      winningMethod,
      scenarioTitle,
      expectedMethod,
      scenarioMatched: expectedMethods.length && comparableMethod
        ? expectedMethods.includes(winningMethod)
        : null,
      marks: getMarkResults(prediction, resultTicket),
      practicalRows,
      practicalTickets,
      practicalPointCount: practicalRows.length,
      practicalHit: Boolean(hitRow),
      hitCategory: hitRow?.category || "",
      missType: settled ? classifyMiss(practicalTickets, resultTicket) : "結果待ち",
      payoutPer100,
      popularity: Number(result?.popularity ?? result?.officialPopularity ?? 0) || 0,
      simulatedStake,
      simulatedReturn,
      simulatedProfit: simulatedReturn - simulatedStake,
      simulatedRecoveryRate: simulatedStake
        ? Math.round((simulatedReturn / simulatedStake) * 1000) / 10
        : 0,
      usagePolicy: "検証表示のみ。予想ロジック・重み・買い目は自動変更しない"
    };
  }

  function buildSummary(items) {
    const settled = (Array.isArray(items) ? items : [])
      .filter(item => item?.settled);
    const practical = settled.filter(item => item.practicalPointCount > 0);
    const hits = practical.filter(item => item.practicalHit);
    const scenarioComparable = settled.filter(item => item.scenarioMatched !== null);
    const scenarioHits = scenarioComparable.filter(item => item.scenarioMatched);
    const totalStake = practical.reduce((sum, item) => sum + item.simulatedStake, 0);
    const totalReturn = practical.reduce((sum, item) => sum + item.simulatedReturn, 0);

    const categorySummary = CATEGORY_ORDER.map(label => {
      const count = hits.filter(item => item.hitCategory === label).length;
      return { label, count, percentage: percentage(count, hits.length) };
    });

    const markSummary = MARKS.map(mark => {
      const rows = settled
        .map(item => item.marks?.find(value => value.key === mark.key))
        .filter(item => item?.boatNo);
      const first = rows.filter(item => item.finish === 1).length;
      const top3 = rows.filter(item => item.finish >= 1 && item.finish <= 3).length;
      return {
        ...mark,
        count: rows.length,
        first,
        firstRate: percentage(first, rows.length),
        top3,
        top3Rate: percentage(top3, rows.length)
      };
    });

    return {
      settledCount: settled.length,
      practicalCount: practical.length,
      practicalHits: hits.length,
      practicalHitRate: percentage(hits.length, practical.length),
      scenarioComparableCount: scenarioComparable.length,
      scenarioHits: scenarioHits.length,
      scenarioMatchRate: percentage(scenarioHits.length, scenarioComparable.length),
      totalStake,
      totalReturn,
      simulatedProfit: totalReturn - totalStake,
      simulatedRecoveryRate: totalStake
        ? Math.round((totalReturn / totalStake) * 1000) / 10
        : 0,
      categorySummary,
      markSummary
    };
  }

  return {
    MARKS,
    CATEGORY_ORDER,
    normalizeTicket,
    normalizeCategory,
    classifyMiss,
    expectedWinningMethods,
    expectedWinningMethod,
    verifyPrediction,
    buildSummary
  };
});
