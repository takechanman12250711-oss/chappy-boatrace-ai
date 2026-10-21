/* チャッピーボートレースAI: 引き波越え実績による外コース頭判定 shadow（本番予想・買い目は変更しない） */
(function (root, factory) {
  "use strict";
  const api = factory();
  root.ChappyWakeCrossingHeadGate = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // 結果を見る前に固定した判定条件。
  // 2コースより外は、内側艇の引き波を越えて勝ったことを示す「差し・まくり差し」の
  // 実進入コース別1着が複数回ある場合だけ頭候補として残す。
  // 「まくり」は引き波をほぼ通らずに勝つ形のため実績に数えない。
  const FIXED = Object.freeze({
    version: "wake-crossing-head-gate-v1",
    historyWindow: "all3Years",
    minCourseStarts: 12,
    minWakeCrossingWins: 2,
    wakeCrossingMethods: Object.freeze(["差し", "まくり差し"]),
    excludedMethods: Object.freeze(["まくり"]),
    exemptCourses: Object.freeze([1]),
    evidenceReadyDemotedHeads: 30
  });

  const STATUSES = Object.freeze([
    "exempt-inside",
    "qualified",
    "demote",
    "insufficient-samples",
    "history-missing"
  ]);

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeTicket(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return normalizeTicket(value.ticket || value.combination || value.text || value.boats);
    }
    const matches = Array.isArray(value)
      ? value.slice(0, 3)
      : (String(value || "").match(/[1-6]/g) || []);
    if (matches.length !== 3) return "";
    const boats = matches.map(Number);
    if (boats.some(b => !Number.isInteger(b) || b < 1 || b > 6) || new Set(boats).size !== 3) return "";
    return boats.join("-");
  }

  function methodCount(history, methods) {
    const list = Array.isArray(history?.winningMethods) ? history.winningMethods : [];
    return list
      .filter(item => methods.includes(String(item?.key || "")))
      .reduce((sum, item) => sum + toNumber(item?.count, 0), 0);
  }

  function evaluateBoat(role) {
    const boatNo = toNumber(role?.boatNo, 0);
    const course = toNumber(role?.course, 0);
    const history = role?.courseHistory?.[FIXED.historyWindow] || null;
    const starts = toNumber(history?.starts, 0);
    const wins = toNumber(history?.wins, 0);
    const wakeCrossingWins = methodCount(history, FIXED.wakeCrossingMethods);
    const makuriWins = methodCount(history, FIXED.excludedMethods);
    let status;
    if (FIXED.exemptCourses.includes(course)) status = "exempt-inside";
    else if (!history || course < 1 || course > 6) status = "history-missing";
    else if (starts < FIXED.minCourseStarts) status = "insufficient-samples";
    else if (wakeCrossingWins >= FIXED.minWakeCrossingWins) status = "qualified";
    else status = "demote";
    return { boatNo, course, status, starts, wins, wakeCrossingWins, makuriWins };
  }

  function skillRoles(record) {
    const prediction = record?.prediction || record || {};
    const conditions = prediction?.preRaceConditions || record?.preRaceConditions || {};
    const roles = conditions?.escapeEvaluationEvidence?.racerSkillTheory?.roles;
    return Array.isArray(roles) ? roles : null;
  }

  function practicalTickets(record) {
    const prediction = record?.prediction || record || {};
    const list = Array.isArray(prediction?.practicalTickets) ? prediction.practicalTickets : [];
    const seen = new Set();
    const tickets = [];
    for (const item of list) {
      const ticket = normalizeTicket(item);
      if (ticket && !seen.has(ticket)) { seen.add(ticket); tickets.push(ticket); }
    }
    return tickets;
  }

  function evaluateRecord(record) {
    const tickets = practicalTickets(record);
    const roles = skillRoles(record);
    const base = {
      version: FIXED.version,
      applicationMode: "shadow",
      usableForPrediction: false,
      automaticApplication: false,
      productionChanged: false
    };
    if (!tickets.length) return { ...base, basisValid: false, reason: "practical-tickets-missing", tickets, aTickets: tickets, bTickets: tickets, boats: [], heads: [], demotedHeadBoatNos: [], changed: false };
    if (!roles || !roles.length) return { ...base, basisValid: false, reason: "racer-skill-roles-missing", tickets, aTickets: tickets, bTickets: tickets, boats: [], heads: [], demotedHeadBoatNos: [], changed: false };

    const boats = roles
      .map(evaluateBoat)
      .filter(row => row.boatNo >= 1 && row.boatNo <= 6)
      .sort((a, b) => a.boatNo - b.boatNo);
    const byBoat = new Map(boats.map(row => [row.boatNo, row]));
    const headBoatNos = [...new Set(tickets.map(t => Number(t.split("-")[0])))].sort((a, b) => a - b);
    const heads = headBoatNos.map(boatNo => {
      const row = byBoat.get(boatNo) || { boatNo, course: 0, status: "history-missing", starts: 0, wins: 0, wakeCrossingWins: 0, makuriWins: 0 };
      return { ...row, ticketCount: tickets.filter(t => Number(t.split("-")[0]) === boatNo).length };
    });
    const demoted = new Set(heads.filter(h => h.status === "demote").map(h => h.boatNo));
    const bTickets = tickets.filter(t => !demoted.has(Number(t.split("-")[0])));
    return {
      ...base,
      basisValid: true,
      reason: "",
      tickets,
      aTickets: tickets,
      bTickets,
      boats,
      heads,
      demotedHeadBoatNos: [...demoted].sort((a, b) => a - b),
      changed: demoted.size > 0,
      skippedByB: demoted.size > 0 && bTickets.length === 0
    };
  }

  return Object.freeze({ FIXED, STATUSES, normalizeTicket, evaluateBoat, evaluateRecord, skillRoles, practicalTickets });
});
