"use strict";

const THEORY_CATALOG = Object.freeze([
  { key: "race-flow", label: "展開理論", aliases: [/展開|scenario|race.?flow/i] },
  { key: "course", label: "コース理論", aliases: [/コース|course|進入/i] },
  { key: "start", label: "ST・スリット理論", aliases: [/\bST\b|スタート|スリット|start/i] },
  { key: "exhibition", label: "展示・足理論", aliases: [/展示|足|exhibition|turn.?time/i] },
  { key: "remain-pickup", label: "残し・拾い理論", aliases: [/残し|拾い|remainer|pickup/i] },
  { key: "local-water", label: "当地・水面理論", aliases: [/当地|水面|風|波|潮|water/i] },
  { key: "skill", label: "技量理論", aliases: [/技量|選手|級別|skill|racer/i] },
  { key: "motor", label: "モーター理論", aliases: [/モーター|motor|engine(?!.*new)/i] },
  { key: "wall-boat", label: "壁艇理論", aliases: [/壁艇|壁|wall/i] },
  { key: "frame-rise-fall", label: "枠別浮沈率", aliases: [/枠別浮沈|浮沈|frame.?rise|frame.?fall/i] },
  { key: "double-time", label: "ダブルタイム", aliases: [/ダブルタイム|double.?time/i] },
  { key: "new-engine", label: "新エンジン理論", aliases: [/新エンジン|新モーター|新燃料|new.?engine/i] }
]);

const EXACT_THEORY_KEYS = Object.freeze({
  flow: "race-flow",
  "race-flow": "race-flow",
  course: "course",
  stSlit: "start",
  start: "start",
  exhibitionFoot: "exhibition",
  exhibition: "exhibition",
  holdPickup: "remain-pickup",
  "remain-pickup": "remain-pickup",
  localWater: "local-water",
  "local-water": "local-water",
  skill: "skill",
  motor: "motor",
  wallBoat: "wall-boat",
  "wall-boat": "wall-boat",
  frameRiseSink: "frame-rise-fall",
  "frame-rise-fall": "frame-rise-fall",
  doubleTime: "double-time",
  "double-time": "double-time",
  newEngine: "new-engine",
  "new-engine": "new-engine"
});

const SPECIFIC_LOCAL_WATER_VENUES = new Set([
  "江戸川", "多摩川", "住之江", "宮島", "若松", "福岡", "大村"
]);
const SPECIFIC_LOCAL_WATER_VENUE_CODES = new Set(["03", "05", "12", "17", "20", "22", "24"]);

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function settledResult(record) {
  const result = record?.result || {};
  const ticket = normalizeTicket(result.resultTicket || result.ticket || record?.resultTicket);
  return { settled: result.settled === true && Boolean(ticket), ticket };
}

function textOf(theory) {
  return [
    theory?.theoryKey,
    theory?.key,
    theory?.label,
    theory?.theoryLabel,
    theory?.version,
    ...(Array.isArray(theory?.sources) ? theory.sources : [])
  ].filter(Boolean).join(" ");
}

function catalogTheoryFor(source) {
  const sourceKey = String(source?.theoryKey || source?.key || "").trim();
  const exactKey = EXACT_THEORY_KEYS[sourceKey];
  if (exactKey) return THEORY_CATALOG.find(item => item.key === exactKey) || null;
  const text = textOf(source);
  return THEORY_CATALOG.find(item => item.aliases.some(pattern => pattern.test(text))) || null;
}

function hasStoredLocalWaterEvidence(record) {
  const place = String(record?.place || "").trim();
  const jcd = String(record?.jcd || "").padStart(2, "0");
  if (SPECIFIC_LOCAL_WATER_VENUES.has(place) || SPECIFIC_LOCAL_WATER_VENUE_CODES.has(jcd)) return true;

  const conditions = record?.prediction?.preRaceConditions;
  if (!conditions || typeof conditions !== "object") return true;
  const availability = conditions?.dataAvailability || {};
  const availabilityKeys = ["wind", "wave", "tide"];
  if (availabilityKeys.some(key => availability?.[key] === true)) return true;

  const weather = conditions?.weather || {};
  const hasMeasuredValue = [weather?.windSpeed, weather?.waveHeight, weather?.tideLevel].some(value =>
    value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value))
  ) || Boolean(String(weather?.tidePhase || weather?.tideFlow || "").trim());
  if (hasMeasuredValue) return true;

  const hasExplicitAvailability = availabilityKeys.every(key => Object.hasOwn(availability, key));
  return !hasExplicitAvailability;
}

function sourceTheories(record) {
  const rows = record?.theoryTagSnapshot?.theories;
  return (Array.isArray(rows) ? rows : []).filter(row =>
    catalogTheoryFor(row)?.key !== "local-water" || hasStoredLocalWaterEvidence(record)
  );
}

function theoryTickets(theories) {
  return [...new Set(theories.flatMap(row => Array.isArray(row?.tickets) ? row.tickets : [])
    .map(normalizeTicket).filter(Boolean))];
}

function build(record) {
  const official = settledResult(record);
  const source = sourceTheories(record);
  const evaluations = THEORY_CATALOG.map(definition => {
    const matchedSources = source.filter(row => catalogTheoryFor(row)?.key === definition.key);
    const tickets = theoryTickets(matchedSources);
    const used = matchedSources.length > 0;
    const evaluable = official.settled && used && tickets.length > 0;
    const matched = evaluable ? tickets.includes(official.ticket) : null;
    return {
      theoryKey: definition.key,
      label: definition.label,
      status: !official.settled ? "result-unavailable" : !used ? "not-used" : !tickets.length ? "insufficient-evidence" : "evaluated",
      used,
      matched,
      sourceTheoryKeys: [...new Set(matchedSources.map(row => String(row?.theoryKey || row?.key || "")).filter(Boolean))],
      tickets,
      actualTicket: official.ticket || "",
      evidenceCount: matchedSources.length
    };
  });

  return {
    schemaVersion: 1,
    engineVersion: "theory-evaluation-phase1-20260806",
    status: official.settled ? "evaluated" : "result-unavailable",
    catalogSize: THEORY_CATALOG.length,
    evaluatedCount: evaluations.filter(row => row.status === "evaluated").length,
    matchedCount: evaluations.filter(row => row.matched === true).length,
    evaluations,
    usableForPrediction: false,
    automaticApplication: false,
    uiVisible: false
  };
}

module.exports = { THEORY_CATALOG, EXACT_THEORY_KEYS, normalizeTicket, catalogTheoryFor, hasStoredLocalWaterEvidence, build };
