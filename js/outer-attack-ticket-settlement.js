/* チャッピーボートレースAI: 外攻め買い目A/B公式結果照合（本番買い目は変更しない） */
(function (root, factory) {
  "use strict";
  const shadow = typeof module === "object" && module.exports
    ? require("./outer-attack-ticket-shadow.js")
    : root?.ChappyOuterAttackTicketShadow;
  const api = factory(shadow);
  if (root) root.ChappyOuterAttackTicketSettlement = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.ChappyStorage && shadow) api.installStorageHooks(root);
})(typeof window !== "undefined" ? window : globalThis, function (shadow) {
  "use strict";

  const VERSION = "outer-attack-ticket-settlement-v1";
  const STORAGE_KEY = "chappy_outer_attack_ticket_settlements_v1";
  const REPORT_KEY = "chappy_outer_attack_ticket_settlement_report_v1";
  const REPORT_ID = "outer-attack-ticket-ab-report-v1";
  const HOOK_MARK = "__chappyOuterAttackTicketSettlementV1";
  const OFFICIAL_SOURCE = /official|boatrace|race-data-api/i;
  const VARIANT_KEYS = Object.freeze(["cover", "flow", "hole"]);

  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const round = (value, digits = 1) => Math.round(Number(value || 0) * 10 ** digits) / 10 ** digits;
  const finite = value => Number.isFinite(Number(value));
  const positive = value => finite(value) && Number(value) > 0 ? Number(value) : 0;
  const normalizeTicket = value => {
    if (typeof shadow?.normalizeTicket === "function") return shadow.normalizeTicket(value);
    const raw = String(value?.ticket || value?.combination || value || "").trim();
    const match = raw.match(/^([1-6])-([1-6])-([1-6])$/);
    return match && new Set(match.slice(1)).size === 3 ? match.slice(1).join("-") : "";
  };

  function stable(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(stable);
    return Object.keys(value).sort().reduce((out, key) => {
      if (value[key] !== undefined) out[key] = stable(value[key]);
      return out;
    }, {});
  }

  function fingerprint(value) {
    const text = JSON.stringify(stable(value));
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function readJson(rootObject, key, fallback) {
    try {
      const parsed = JSON.parse(rootObject?.localStorage?.getItem(key) || "");
      return parsed ?? fallback;
    } catch (error) {
      console.warn(`[outer-attack-ticket-settlement] ${key}を読み込めません`, error);
      return fallback;
    }
  }

  function writeJson(rootObject, key, value) {
    rootObject?.localStorage?.setItem(key, JSON.stringify(value));
    return value;
  }

  function readSettlements(rootObject) {
    const rows = readJson(rootObject, STORAGE_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function readReport(rootObject) {
    const report = readJson(rootObject, REPORT_KEY, null);
    return report && typeof report === "object" ? report : null;
  }

  function raceKey(record = {}) {
    const key = typeof shadow?.raceKey === "function" ? shadow.raceKey(record) : "";
    if (key) return key;
    const saved = String(record?.raceKey || record?.predictionRaceKey || "").trim();
    if (saved) return saved;
    const date = String(record?.date || "").replace(/\D/g, "").slice(0, 8);
    const jcdRaw = String(record?.jcd || "").replace(/\D/g, "");
    const jcd = jcdRaw ? jcdRaw.padStart(2, "0").slice(-2) : "";
    const raceNo = Number(record?.raceNo ?? record?.rno ?? 0);
    return date.length === 8 && jcd && raceNo >= 1 && raceNo <= 12
      ? `${date}-${jcd}-${raceNo}`
      : "";
  }

  function normalizeFinishers(value) {
    if (!Array.isArray(value) || value.length !== 3) return [];
    const boats = value.map(item => Number(item?.boatNo ?? item?.no ?? item?.boat ?? item));
    return boats.every(boatNo => Number.isInteger(boatNo) && boatNo >= 1 && boatNo <= 6) && new Set(boats).size === 3
      ? boats
      : [];
  }

  function normalizeOfficialResult(record = {}) {
    const nested = record?.result && typeof record.result === "object" ? record.result : {};
    const source = String(
      record?.resultSource || record?.source || nested?.resultSource || nested?.source || ""
    ).trim();
    const recordType = String(record?.recordType || nested?.recordType || "").trim();
    if (record?.resultAvailable === false || nested?.resultAvailable === false) {
      return { valid: false, reason: "result-not-available" };
    }
    if (recordType !== "official_result" && !OFFICIAL_SOURCE.test(source)) {
      return { valid: false, reason: "source-not-official" };
    }

    const key = raceKey(record) || raceKey(nested);
    if (!key) return { valid: false, reason: "race-key-invalid" };

    const finishers = normalizeFinishers(record?.finishers || nested?.finishers);
    if (finishers.length !== 3) return { valid: false, reason: "finishers-invalid", raceKey: key };
    const finishersTicket = normalizeTicket(finishers.join("-"));
    const statedTickets = [
      record?.resultTicket,
      typeof record?.result === "string" ? record.result : "",
      record?.ticket,
      record?.exactTicket,
      record?.combination,
      record?.trifecta?.combination,
      nested?.resultTicket,
      nested?.ticket,
      nested?.exactTicket,
      nested?.combination,
      nested?.trifecta?.combination
    ].map(normalizeTicket).filter(Boolean);
    if (statedTickets.some(ticket => ticket !== finishersTicket)) {
      return { valid: false, reason: "ticket-finishers-mismatch", raceKey: key };
    }

    const payoutCandidates = [
      record?.officialPayoutPer100,
      record?.payoutPer100Yen,
      record?.payoutPer100,
      record?.trifecta?.payout,
      record?.payout,
      nested?.officialPayoutPer100,
      nested?.payoutPer100Yen,
      nested?.payoutPer100,
      nested?.trifecta?.payout,
      nested?.payout
    ];
    const payoutPer100Yen = payoutCandidates.map(positive).find(value => value > 0) || 0;
    if (!payoutPer100Yen) return { valid: false, reason: "payout-missing", raceKey: key };

    const checkedAt = String(
      record?.officialCheckedAt || record?.checkedAt || record?.savedAt ||
      nested?.officialCheckedAt || nested?.checkedAt || nested?.savedAt || ""
    ).trim();
    const official = {
      valid: true,
      raceKey: key,
      ticket: finishersTicket,
      finishers,
      payoutPer100Yen,
      source: source || recordType,
      recordType: recordType || "official_result",
      checkedAt
    };
    official.fingerprint = fingerprint({
      raceKey: official.raceKey,
      ticket: official.ticket,
      payoutPer100Yen: official.payoutPer100Yen,
      finishers: official.finishers
    });
    return official;
  }

  function timestamp(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function snapshotTime(snapshot) {
    return timestamp(snapshot?.captureAt || snapshot?.generatedAt);
  }

  function selectSnapshot(history, official, preferredCaptureKey = "") {
    const candidates = (Array.isArray(history) ? history : []).filter(snapshot =>
      snapshot?.sourceRaceKey === official?.raceKey &&
      Number(snapshot?.readyVariantCount || 0) > 0 &&
      snapshot?.a?.ticketCount > 0
    );
    if (!candidates.length) return null;
    if (preferredCaptureKey) {
      const preferred = candidates.find(snapshot => snapshot?.captureKey === preferredCaptureKey);
      if (preferred) return preferred;
    }
    const resultTime = timestamp(official?.checkedAt);
    const beforeResult = resultTime
      ? candidates.filter(snapshot => snapshotTime(snapshot) > 0 && snapshotTime(snapshot) <= resultTime)
      : [];
    const pool = beforeResult.length ? beforeResult : candidates;
    return pool.slice().sort((left, right) =>
      snapshotTime(right) - snapshotTime(left) ||
      String(right?.captureKey || "").localeCompare(String(left?.captureKey || ""))
    )[0] || null;
  }

  function captureOrder(snapshot, official) {
    const predictionTime = snapshotTime(snapshot);
    const resultTime = timestamp(official?.checkedAt);
    if (!predictionTime || !resultTime) return "unknown";
    return predictionTime <= resultTime ? "prediction-before-result" : "result-before-prediction";
  }

  function buildSettlement(snapshot, official, options = {}) {
    if (!snapshot || !official?.valid || typeof shadow?.compareOutcome !== "function") return null;
    const comparison = shadow.compareOutcome(snapshot, {
      ticket: official.ticket,
      payoutPer100Yen: official.payoutPer100Yen
    });
    const eligibleVariantKeys = VARIANT_KEYS.filter(key => snapshot?.variants?.[key]?.status === "ready");
    if (!eligibleVariantKeys.length) return null;
    const variantMetadata = Object.fromEntries(VARIANT_KEYS.map(key => {
      const variant = snapshot?.variants?.[key] || {};
      return [key, {
        status: variant.status || "missing",
        targetBoatNo: Number(variant.targetBoatNo || snapshot?.signal?.targetBoatNo || 0) || null,
        targetPosition: Number(variant?.replacement?.targetPosition || 0) || null,
        fromTicket: String(variant?.replacement?.fromTicket || ""),
        toTicket: String(variant?.replacement?.toTicket || "")
      }];
    }));
    const now = String(options.now || new Date().toISOString());
    return {
      schemaVersion: 1,
      settlementId: official.raceKey,
      settlementVersion: VERSION,
      experimentId: snapshot.experimentId || shadow?.VERSION || "",
      status: "settled-shadow-only",
      productionChanged: false,
      automaticApplication: false,
      sourceRaceKey: official.raceKey,
      shadowCaptureKey: String(snapshot.captureKey || ""),
      shadowCaptureAt: String(snapshot.captureAt || snapshot.generatedAt || ""),
      resultUsedForGeneration: snapshot.resultUsedForGeneration === true,
      captureOrder: captureOrder(snapshot, official),
      comparisonEligible: snapshot.resultUsedForGeneration !== true,
      targetBoatNo: Number(snapshot?.signal?.targetBoatNo || 0) || null,
      eligibleVariantKeys,
      variantMetadata,
      official: clone(official),
      comparison,
      settledAt: now,
      revision: 1
    };
  }

  function outcomeMetrics(outcomes) {
    const rows = (Array.isArray(outcomes) ? outcomes : []).filter(Boolean);
    const investmentYen = rows.reduce((sum, row) => sum + positive(row?.investmentYen), 0);
    const returnYen = rows.reduce((sum, row) => sum + positive(row?.returnYen), 0);
    const hitCount = rows.filter(row => row?.hit === true).length;
    return {
      sampleCount: rows.length,
      hitCount,
      hitRatePercent: rows.length ? round(hitCount / rows.length * 100, 1) : 0,
      investmentYen,
      returnYen,
      profitYen: returnYen - investmentYen,
      roiPercent: investmentYen ? round(returnYen / investmentYen * 100, 1) : 0
    };
  }

  function metricDelta(a, b) {
    return {
      hitCountDelta: b.hitCount - a.hitCount,
      hitRatePointDelta: round(b.hitRatePercent - a.hitRatePercent, 1),
      returnYenDelta: b.returnYen - a.returnYen,
      profitYenDelta: b.profitYen - a.profitYen,
      roiPointDelta: round(b.roiPercent - a.roiPercent, 1)
    };
  }

  function pairOutcomes(rows, key) {
    return rows.reduce((counts, settlement) => {
      const aHit = settlement?.comparison?.a?.hit === true;
      const bHit = settlement?.comparison?.variants?.[key]?.outcome?.hit === true;
      if (aHit && bHit) counts.bothHit += 1;
      else if (aHit) counts.aOnlyHit += 1;
      else if (bHit) counts.bOnlyHit += 1;
      else counts.neitherHit += 1;
      return counts;
    }, { bothHit: 0, aOnlyHit: 0, bOnlyHit: 0, neitherHit: 0 });
  }

  function variantReport(rows, key) {
    const eligible = rows.filter(settlement =>
      settlement?.variantMetadata?.[key]?.status === "ready" &&
      settlement?.comparison?.variants?.[key]?.status === "ready"
    );
    const a = outcomeMetrics(eligible.map(settlement => settlement?.comparison?.a));
    const b = outcomeMetrics(eligible.map(settlement => settlement?.comparison?.variants?.[key]?.outcome));
    const grouped = (field, valueOf) => {
      const values = [...new Set(eligible.map(settlement => valueOf(settlement)).filter(value => value !== null && value !== ""))];
      return Object.fromEntries(values.sort().map(value => {
        const segmentRows = eligible.filter(settlement => valueOf(settlement) === value);
        const segmentA = outcomeMetrics(segmentRows.map(settlement => settlement?.comparison?.a));
        const segmentB = outcomeMetrics(segmentRows.map(settlement => settlement?.comparison?.variants?.[key]?.outcome));
        return [String(value), {
          [field]: value,
          a: segmentA,
          b: segmentB,
          deltaVsA: metricDelta(segmentA, segmentB),
          pairOutcomes: pairOutcomes(segmentRows, key)
        }];
      }));
    };
    return {
      eligibleCount: eligible.length,
      a,
      b,
      deltaVsA: metricDelta(a, b),
      pairOutcomes: pairOutcomes(eligible, key),
      byTargetBoatNo: grouped("targetBoatNo", settlement => settlement?.variantMetadata?.[key]?.targetBoatNo ?? null),
      byTargetPosition: grouped("targetPosition", settlement => settlement?.variantMetadata?.[key]?.targetPosition ?? null)
    };
  }

  function cohortReport(rows) {
    const eligible = (Array.isArray(rows) ? rows : []).filter(settlement => settlement?.comparisonEligible === true);
    return {
      sampleCount: eligible.length,
      a: outcomeMetrics(eligible.map(settlement => settlement?.comparison?.a)),
      variants: Object.fromEntries(VARIANT_KEYS.map(key => [key, variantReport(eligible, key)]))
    };
  }

  function aggregateSettlements(settlements, options = {}) {
    const rows = (Array.isArray(settlements) ? settlements : [])
      .filter(settlement => settlement?.status === "settled-shadow-only" && settlement?.sourceRaceKey)
      .sort((left, right) => String(left.sourceRaceKey).localeCompare(String(right.sourceRaceKey)));
    const orders = {
      forward: rows.filter(row => row.captureOrder === "prediction-before-result"),
      resultFirst: rows.filter(row => row.captureOrder === "result-before-prediction"),
      unknown: rows.filter(row => row.captureOrder === "unknown")
    };
    return {
      schemaVersion: 1,
      reportId: REPORT_ID,
      settlementVersion: VERSION,
      generatedAt: String(options.now || new Date().toISOString()),
      productionChanged: false,
      automaticApplication: false,
      primaryCohort: "prediction-before-result",
      settlementCount: rows.length,
      captureOrderCounts: {
        predictionBeforeResult: orders.forward.length,
        resultBeforePrediction: orders.resultFirst.length,
        unknown: orders.unknown.length
      },
      cohorts: {
        forward: cohortReport(orders.forward),
        resultFirst: cohortReport(orders.resultFirst),
        unknown: cohortReport(orders.unknown),
        allSettled: cohortReport(rows)
      }
    };
  }

  function upsertSettlement(rootObject, settlement, options = {}) {
    if (!settlement?.sourceRaceKey) return null;
    const rows = readSettlements(rootObject);
    const index = rows.findIndex(row => row?.sourceRaceKey === settlement.sourceRaceKey);
    if (index >= 0) {
      const existing = rows[index];
      if (existing?.official?.fingerprint === settlement?.official?.fingerprint) return existing;
      settlement.revision = Math.max(1, Number(existing?.revision || 1)) + 1;
      settlement.previousOfficialFingerprint = String(existing?.official?.fingerprint || "");
      settlement.correctedAt = String(options.now || new Date().toISOString());
      rows[index] = settlement;
    } else {
      rows.unshift(settlement);
    }
    rows.sort((left, right) => String(right?.settledAt || "").localeCompare(String(left?.settledAt || "")));
    writeJson(rootObject, STORAGE_KEY, rows);
    writeJson(rootObject, REPORT_KEY, aggregateSettlements(rows, options));
    return settlement;
  }

  function settleOfficialResult(rootObject, record, options = {}) {
    const official = normalizeOfficialResult(record);
    if (!official.valid) return { status: "ignored", reason: official.reason, raceKey: official.raceKey || "" };
    const existing = readSettlements(rootObject).find(row => row?.sourceRaceKey === official.raceKey);
    if (existing?.official?.fingerprint === official.fingerprint) return existing;
    const history = typeof shadow?.readHistory === "function" ? shadow.readHistory(rootObject) : [];
    const snapshot = selectSnapshot(history, official, existing?.shadowCaptureKey || "");
    if (!snapshot) return { status: "awaiting-shadow", raceKey: official.raceKey };
    const settlement = buildSettlement(snapshot, official, options);
    return settlement ? upsertSettlement(rootObject, settlement, options) : { status: "not-comparable", raceKey: official.raceKey };
  }

  function settlePrediction(rootObject, prediction, options = {}) {
    const key = raceKey(prediction);
    const storage = rootObject?.ChappyStorage;
    if (!key || typeof storage?.findResult !== "function") return { status: "awaiting-result", raceKey: key };
    const result = storage.findResult(key);
    return result ? settleOfficialResult(rootObject, result, options) : { status: "awaiting-result", raceKey: key };
  }

  function installStorageHooks(rootObject) {
    const storage = rootObject?.ChappyStorage;
    if (!storage || storage[HOOK_MARK]) return false;
    if (typeof shadow?.installStorageHook === "function") shadow.installStorageHook(rootObject);
    if (typeof storage.upsertPrediction !== "function" || typeof storage.upsertResult !== "function") return false;
    const originalPrediction = storage.upsertPrediction;
    const originalResult = storage.upsertResult;
    Object.defineProperty(storage, HOOK_MARK, {
      value: { originalPrediction, originalResult },
      configurable: false,
      enumerable: false,
      writable: false
    });
    const after = (value, callback) => value && typeof value.then === "function"
      ? value.then(result => { callback(result); return result; })
      : (callback(value), value);
    storage.upsertPrediction = function upsertPredictionWithOuterAttackSettlement(prediction) {
      const returned = originalPrediction.call(storage, prediction);
      return after(returned, saved => {
        try { settlePrediction(rootObject, clone(saved || prediction)); }
        catch (error) { console.warn("[outer-attack-ticket-settlement] 予想側照合を継続できません", error); }
      });
    };
    storage.upsertResult = function upsertResultWithOuterAttackSettlement(result) {
      const returned = originalResult.call(storage, result);
      return after(returned, saved => {
        try { settleOfficialResult(rootObject, clone(saved || result)); }
        catch (error) { console.warn("[outer-attack-ticket-settlement] 結果側照合を継続できません", error); }
      });
    };
    return true;
  }

  return Object.freeze({
    VERSION,
    STORAGE_KEY,
    REPORT_KEY,
    REPORT_ID,
    VARIANT_KEYS,
    raceKey,
    normalizeFinishers,
    normalizeOfficialResult,
    readSettlements,
    readReport,
    selectSnapshot,
    captureOrder,
    buildSettlement,
    outcomeMetrics,
    metricDelta,
    aggregateSettlements,
    upsertSettlement,
    settleOfficialResult,
    settlePrediction,
    installStorageHooks
  });
});
