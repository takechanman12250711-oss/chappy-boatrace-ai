/* チャッピーボートレースAI: 外攻め買い目A/B shadow（本番買い目は変更しない） */
(function (root, factory) {
  "use strict";
  const api = factory();
  root.ChappyOuterAttackTicketShadow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root?.ChappyStorage) api.installStorageHook(root);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "outer-attack-ticket-shadow-v1";
  const STORAGE_KEY = "chappy_outer_attack_ticket_shadow_v1";
  const DEFAULT_STAKE_YEN = 100;
  const EPSILON = 1e-12;
  const REPLACEMENT_POLICY = "category-tail-preserve-leading-order";
  const BASELINE_PROFILE = Object.freeze({
    id: "p0-current",
    weights: Object.freeze({
      raceFlow: 0.25, courseIndex: 0.24, roleAttack: 0.11, st: 0.1,
      exhibition: 0.09, roleHold: 0.08, rolePickup: 0.03, local: 0.05,
      turn: 0.025, national: 0.02, motor: 0.005
    }),
    minimumScore: 1,
    maximumScore: 100,
    roundDigits: 1,
    rankingTieBreak: Object.freeze(["total-desc", "roleAttack-desc", "boatNo-asc"])
  });
  const FIXED_SIGNAL = Object.freeze({
    challengerBoatNos: Object.freeze([3, 4]),
    stMinimum: 0,
    roleAttackMinimum: 0.25,
    exhibitionMinimum: 0.5,
    requiresPositiveAttackSignal: true,
    requiresNegativeRaceFlowGap: true
  });
  const CATEGORY_DEFINITIONS = Object.freeze([
    Object.freeze({ key: "cover", label: "押さえ", aliases: Object.freeze(["cover", "safety", "osae", "押さえ"]) }),
    Object.freeze({ key: "flow", label: "流し", aliases: Object.freeze(["flow", "nagashi", "流し", "フォーメーション"]) }),
    Object.freeze({ key: "hole", label: "万舟", aliases: Object.freeze(["hole", "longshot", "manshu", "万舟", "万舟・穴", "穴候補"]) })
  ]);
  const HOOK_MARK = "__chappyOuterAttackTicketShadowV1";

  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const unique = values => [...new Set(values)];

  function normalizeTicket(value) {
    const raw = String(value?.ticket || value?.combination || value || "").trim();
    const match = raw.match(/^([1-6])-([1-6])-([1-6])$/);
    if (!match) return "";
    const boats = match.slice(1).map(Number);
    return new Set(boats).size === 3 ? boats.join("-") : "";
  }
  const ticketBoats = value => {
    const ticket = normalizeTicket(value);
    return ticket ? ticket.split("-").map(Number) : [];
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

  function categoryKey(value) {
    const raw = String(value || "").trim();
    if (["main", "本線"].includes(raw)) return "main";
    return CATEGORY_DEFINITIONS.find(item => item.aliases.includes(raw))?.key || raw || "unknown";
  }
  function categoryOf(row) {
    return categoryKey(row?.sourceCategory || row?.categoryKey || row?.displayCategory || row?.category || row?.selectionTier || "");
  }
  function stakeOf(row) {
    if (!row || typeof row !== "object") return { amountYen: DEFAULT_STAKE_YEN, source: "default-100-yen" };
    for (const field of ["amountYen", "amount", "stakeYen", "stake", "betAmount", "yen"]) {
      const amount = Number(row[field]);
      if (Number.isFinite(amount) && amount > 0) return { amountYen: amount, source: `ticket.${field}` };
    }
    return { amountYen: DEFAULT_STAKE_YEN, source: "default-100-yen" };
  }

  function explicitFormations(record = {}) {
    for (const source of [record.formations, record.prediction?.formations]) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const hasTicket = Object.values(source).some(rows => Array.isArray(rows) && rows.some(normalizeTicket));
      if (hasTicket) return source;
    }
    return null;
  }
  function practicalTicketRows(record = {}) {
    for (const rows of [
      record.practicalTickets,
      record.prediction?.practicalTickets,
      record.practicalSelection?.tickets,
      record.prediction?.practicalSelection?.tickets
    ]) if (Array.isArray(rows) && rows.some(normalizeTicket)) return rows;
    return [];
  }
  function formationGroups(record = {}) {
    const explicit = explicitFormations(record);
    if (explicit) return Object.entries(explicit).map(([sourceKey, rows]) => ({ sourceKey, rows }));
    const grouped = new Map();
    practicalTicketRows(record).forEach(row => {
      const sourceKey = categoryOf(row);
      if (!grouped.has(sourceKey)) grouped.set(sourceKey, []);
      grouped.get(sourceKey).push(row);
    });
    return [...grouped].map(([sourceKey, rows]) => ({ sourceKey, rows }));
  }
  function snapshotA(record = {}) {
    const before = JSON.stringify(record);
    const groups = formationGroups(record).map(({ sourceKey, rows }) => ({
      sourceKey,
      categoryKey: categoryKey(sourceKey),
      entries: (Array.isArray(rows) ? rows : []).map((row, originalIndex) => {
        const ticket = normalizeTicket(row);
        if (!ticket) return null;
        const stake = stakeOf(row);
        return { ticket, amountYen: stake.amountYen, amountSource: stake.source, originalIndex };
      }).filter(Boolean)
    }));
    const entries = groups.flatMap(group => group.entries.map(entry => ({ ...entry, sourceKey: group.sourceKey, categoryKey: group.categoryKey })));
    const formations = Object.fromEntries(groups.map(group => [group.sourceKey, group.entries.map(entry => ({ ticket: entry.ticket, amountYen: entry.amountYen }))]));
    return {
      formations, groups, entries,
      ticketCount: entries.length,
      uniqueTicketCount: unique(entries.map(entry => entry.ticket)).length,
      totalStakeYen: entries.reduce((sum, entry) => sum + entry.amountYen, 0),
      fingerprint: fingerprint(formations),
      inputUnchanged: before === JSON.stringify(record)
    };
  }

  function replayBasis(record = {}) {
    return record.practicalSelection?.frameRiseFallReplayBasis ||
      record.prediction?.practicalSelection?.frameRiseFallReplayBasis ||
      record.frameRiseFallReplayBasis || null;
  }
  function candidatePool(record = {}) {
    for (const source of [
      record.evaluatedScenarioCandidates,
      record.prediction?.evaluatedScenarioCandidates,
      record.practicalSelection?.evaluatedScenarioCandidates,
      record.prediction?.practicalSelection?.evaluatedScenarioCandidates
    ]) {
      if (Array.isArray(source)) return source;
      if (Array.isArray(source?.candidatePool)) return source.candidatePool;
    }
    return [];
  }

  function components(analysis = {}) {
    const indexes = analysis.indexes || {};
    const roles = analysis.roleScores || {};
    return {
      raceFlow: num(indexes.raceFlow, NaN),
      courseIndex: num(analysis.courseStructureTheory?.appliedIndex, NaN),
      roleAttack: num(roles.attack, NaN), st: num(indexes.st, NaN),
      exhibition: num(indexes.exhibition, NaN), roleHold: num(roles.hold, NaN),
      rolePickup: num(roles.pickup, NaN), local: num(indexes.local, NaN),
      turn: num(indexes.turn, NaN), national: num(indexes.national, NaN),
      motor: num(indexes.motor, NaN)
    };
  }
  function scoreAnalysis(analysis = {}) {
    const boatNo = Number(analysis.boatNo);
    const row = components(analysis);
    if (!Number.isInteger(boatNo) || boatNo < 1 || boatNo > 6 || !Object.values(row).every(Number.isFinite)) return null;
    const rawTotal = Object.entries(BASELINE_PROFILE.weights).reduce((sum, [key, weight]) => sum + row[key] * weight, 0);
    return {
      boatNo, components: row, rawTotal,
      total: clamp(round(rawTotal, BASELINE_PROFILE.roundDigits), BASELINE_PROFILE.minimumScore, BASELINE_PROFILE.maximumScore),
      roleAttack: row.roleAttack
    };
  }
  function rankedAnalyses(record = {}) {
    const analyses = replayBasis(record)?.analyses;
    if (!Array.isArray(analyses) || analyses.length !== 6) return [];
    const rows = analyses.map(scoreAnalysis);
    if (rows.some(row => !row) || new Set(rows.map(row => row.boatNo)).size !== 6) return [];
    return rows.sort((left, right) => right.total - left.total || right.roleAttack - left.roleAttack || left.boatNo - right.boatNo)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }
  function detectSignal(record = {}) {
    const ranking = rankedAnalyses(record);
    const top = ranking[0];
    if (!top || top.boatNo !== 1) return { status: "inactive", active: false, basisValid: ranking.length === 6, baselineTopBoatNo: top?.boatNo || null, matchedBoatNos: [], pairs: [] };
    const pairs = FIXED_SIGNAL.challengerBoatNos.map(boatNo => {
      const challenger = ranking.find(row => row.boatNo === boatNo);
      if (!challenger) return null;
      const gaps = {
        st: (challenger.components.st - top.components.st) * BASELINE_PROFILE.weights.st,
        roleAttack: (challenger.components.roleAttack - top.components.roleAttack) * BASELINE_PROFILE.weights.roleAttack,
        exhibition: (challenger.components.exhibition - top.components.exhibition) * BASELINE_PROFILE.weights.exhibition,
        raceFlow: (challenger.components.raceFlow - top.components.raceFlow) * BASELINE_PROFILE.weights.raceFlow
      };
      const attackSignal = gaps.st > EPSILON && gaps.roleAttack > EPSILON;
      const flowSuppressed = gaps.raceFlow < -EPSILON;
      const matched = attackSignal && flowSuppressed && gaps.st + EPSILON >= FIXED_SIGNAL.stMinimum &&
        gaps.roleAttack + EPSILON >= FIXED_SIGNAL.roleAttackMinimum &&
        gaps.exhibition + EPSILON >= FIXED_SIGNAL.exhibitionMinimum;
      return { boatNo, matched, attackSignal, flowSuppressed, weightedGaps: gaps };
    }).filter(Boolean);
    const matchedBoatNos = pairs.filter(pair => pair.matched).map(pair => pair.boatNo);
    return {
      status: matchedBoatNos.length === 1 ? "active" : matchedBoatNos.length > 1 ? "ambiguous-multiple-targets" : "inactive",
      active: matchedBoatNos.length === 1,
      targetBoatNo: matchedBoatNos.length === 1 ? matchedBoatNos[0] : null,
      basisValid: true, baselineTopBoatNo: 1, matchedBoatNos, pairs
    };
  }

  const compactEntries = entries => entries.map(entry => ({
    ticket: entry.ticket, amountYen: entry.amountYen,
    sourceKey: entry.sourceKey, categoryKey: entry.categoryKey
  }));
  const flatEntries = groups => groups.flatMap(group => group.entries.map(entry => ({ ...entry, sourceKey: group.sourceKey, categoryKey: group.categoryKey })));
  const targetPosition = (ticket, boatNo) => ticketBoats(ticket).indexOf(Number(boatNo)) + 1;

  function replacementCandidates(record, a, category, targetBoatNo) {
    const existing = new Set(a.entries.map(entry => entry.ticket));
    return candidatePool(record).map(candidate => {
      const ticket = normalizeTicket(candidate);
      const position = targetPosition(ticket, targetBoatNo);
      if (!ticket || existing.has(ticket) || categoryOf(candidate) !== category || candidate.evidenceQualified !== true || position < 2 || position > 3) return null;
      return {
        candidate, ticket, targetPosition: position,
        purchaseEligible: candidate.purchaseEligible === true,
        evidenceQualified: true,
        priorityScore: num(candidate.priorityScore, 0)
      };
    }).filter(Boolean).sort((left, right) =>
      Number(right.purchaseEligible) - Number(left.purchaseEligible) ||
      right.priorityScore - left.priorityScore ||
      left.targetPosition - right.targetPosition ||
      left.ticket.localeCompare(right.ticket)
    );
  }
  function unchangedVariant(base, a, status) {
    return {
      ...base, status, replacement: null,
      b: { entries: compactEntries(a.entries), ticketCount: a.ticketCount, totalStakeYen: a.totalStakeYen },
      invariants: { sameTicketCount: true, sameStake: true, mainUnchanged: true, exactlyOneTicketReplaced: false, targetNotHead: true }
    };
  }
  function buildVariant(record, a, signal, category) {
    const definition = CATEGORY_DEFINITIONS.find(item => item.key === category);
    const base = {
      id: `${category}-one-ticket-replacement`, categoryKey: category,
      categoryLabel: definition?.label || category,
      targetBoatNo: signal.targetBoatNo || null,
      replacementPolicy: REPLACEMENT_POLICY
    };
    if (!signal.active) return unchangedVariant(base, a, "signal-not-active");
    const groupIndex = a.groups.findIndex(group => group.categoryKey === category && group.entries.length > 0);
    if (groupIndex < 0) return unchangedVariant(base, a, "no-source-ticket");
    const candidates = replacementCandidates(record, a, category, signal.targetBoatNo);
    if (!candidates.length) return { ...unchangedVariant(base, a, "no-category-candidate"), candidateCount: 0 };

    const selected = candidates[0];
    const groups = clone(a.groups);
    const sourceGroup = groups[groupIndex];
    const replaceIndex = sourceGroup.entries.length - 1;
    const removed = sourceGroup.entries[replaceIndex];
    sourceGroup.entries[replaceIndex] = { ...removed, ticket: selected.ticket, amountSource: "carried-from-replaced-a-ticket" };
    const bEntries = flatEntries(groups);
    const aMain = a.entries.filter(entry => entry.categoryKey === "main").map(entry => entry.ticket);
    const bMain = bEntries.filter(entry => entry.categoryKey === "main").map(entry => entry.ticket);
    const position = targetPosition(selected.ticket, signal.targetBoatNo);
    const invariants = {
      sameTicketCount: a.ticketCount === bEntries.length,
      sameStake: a.totalStakeYen === bEntries.reduce((sum, entry) => sum + entry.amountYen, 0),
      mainUnchanged: JSON.stringify(aMain) === JSON.stringify(bMain),
      exactlyOneTicketReplaced: a.entries.reduce((count, entry, index) => count + Number(entry.ticket !== bEntries[index]?.ticket), 0) === 1,
      targetNotHead: position === 2 || position === 3
    };
    const ready = Object.values(invariants).every(Boolean);
    return {
      ...base, status: ready ? "ready" : "invariant-failed", candidateCount: candidates.length,
      replacement: {
        sourceKey: sourceGroup.sourceKey, validEntryIndex: replaceIndex,
        fromTicket: removed.ticket, toTicket: selected.ticket,
        carriedAmountYen: removed.amountYen, targetPosition: position,
        candidateId: String(selected.candidate.id || ""),
        candidateKind: String(selected.candidate.candidateKind || ""),
        purchaseEligible: selected.purchaseEligible,
        evidenceQualified: selected.evidenceQualified,
        priorityScore: selected.priorityScore
      },
      b: { entries: compactEntries(bEntries), ticketCount: bEntries.length, totalStakeYen: bEntries.reduce((sum, entry) => sum + entry.amountYen, 0) },
      invariants
    };
  }

  function raceKey(record = {}) {
    const saved = String(record.raceKey || record.predictionRaceKey || "").trim();
    if (saved) return saved;
    const date = String(record.date || record.predictionDate || "").replace(/\D/g, "").slice(0, 8);
    const jcd = String(record.jcd || record.predictionJcd || "").replace(/\D/g, "").padStart(2, "0").slice(-2);
    const raceNo = Number(record.raceNo ?? record.rno ?? record.predictionRaceNo ?? String(record.race || "").replace(/\D/g, ""));
    return date.length === 8 && jcd && raceNo >= 1 && raceNo <= 12 ? `${date}-${jcd}-${raceNo}` : "";
  }
  function buildSnapshot(record = {}, options = {}) {
    const now = String(options.now || new Date().toISOString());
    const a = snapshotA(record);
    const signal = detectSignal(record);
    const variants = Object.fromEntries(CATEGORY_DEFINITIONS.map(definition => [definition.key, buildVariant(record, a, signal, definition.key)]));
    const captureAt = String(record.generatedAt || record.selectedAt || record.collectedAt || record.savedAt || now);
    const key = raceKey(record);
    const readyVariantCount = Object.values(variants).filter(variant => variant.status === "ready").length;
    return {
      schemaVersion: 1, experimentId: VERSION, status: "shadow-only",
      productionChanged: false, automaticApplication: false,
      resultUsedForGeneration: false, retrospectiveBackfillAllowed: false,
      replacementPolicy: REPLACEMENT_POLICY,
      sourceRaceKey: key, captureAt,
      captureKey: `${key || "unknown-race"}|${captureAt || now}`,
      generatedAt: now,
      signal: {
        ...signal,
        fixedThresholds: { st: FIXED_SIGNAL.stMinimum, roleAttack: FIXED_SIGNAL.roleAttackMinimum, exhibition: FIXED_SIGNAL.exhibitionMinimum },
        baselineProfileId: BASELINE_PROFILE.id
      },
      a: {
        formations: a.formations, entries: compactEntries(a.entries),
        ticketCount: a.ticketCount, uniqueTicketCount: a.uniqueTicketCount,
        totalStakeYen: a.totalStakeYen, fingerprint: a.fingerprint,
        inputUnchanged: a.inputUnchanged
      },
      variants, readyVariantCount,
      comparisonStatus: signal.active && a.ticketCount > 0 && readyVariantCount > 0 ? "awaiting-official-result" : "not-ready",
      persistenceRecommended: signal.status === "active" || signal.status === "ambiguous-multiple-targets"
    };
  }

  function readHistory(rootObject) {
    try {
      const parsed = JSON.parse(rootObject?.localStorage?.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("[outer-attack-ticket-shadow] shadow履歴を読み込めません", error);
      return [];
    }
  }
  function upsertShadow(rootObject, snapshot) {
    if (!snapshot || snapshot.persistenceRecommended !== true) return null;
    const history = readHistory(rootObject);
    const index = history.findIndex(item => item?.captureKey === snapshot.captureKey);
    if (index >= 0) {
      const existing = history[index];
      if (existing?.a?.fingerprint && existing.a.fingerprint !== snapshot?.a?.fingerprint) {
        console.warn("[outer-attack-ticket-shadow] 同一captureKeyのA買い目変更を拒否しました", snapshot.captureKey);
        return existing;
      }
      history[index] = snapshot;
    } else history.unshift(snapshot);
    history.sort((left, right) => String(right.captureAt || right.generatedAt || "").localeCompare(String(left.captureAt || left.generatedAt || "")));
    rootObject?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(history));
    return snapshot;
  }

  function outcome(entries, official) {
    const ticket = normalizeTicket(official?.ticket || official?.exactTicket || official?.combination || "");
    const payout = num(official?.payoutPer100Yen, NaN);
    const investmentYen = entries.reduce((sum, entry) => sum + num(entry.amountYen, DEFAULT_STAKE_YEN), 0);
    const winner = entries.find(entry => entry.ticket === ticket);
    const returnYen = winner && Number.isFinite(payout) ? payout * (num(winner.amountYen, DEFAULT_STAKE_YEN) / 100) : 0;
    return {
      ticket, hit: Boolean(winner), investmentYen, returnYen,
      profitYen: returnYen - investmentYen,
      roiPercent: investmentYen > 0 ? round(returnYen / investmentYen * 100, 1) : null
    };
  }
  function compareOutcome(snapshot, official) {
    const a = outcome(snapshot?.a?.entries || [], official);
    return {
      sourceRaceKey: snapshot?.sourceRaceKey || "",
      officialTicket: a.ticket,
      payoutPer100Yen: num(official?.payoutPer100Yen, null),
      a,
      variants: Object.fromEntries(Object.entries(snapshot?.variants || {}).map(([key, variant]) => [key, {
        status: variant?.status || "missing",
        outcome: outcome(variant?.b?.entries || snapshot?.a?.entries || [], official)
      }]))
    };
  }

  function installStorageHook(rootObject) {
    const storage = rootObject?.ChappyStorage;
    if (!storage || typeof storage.upsertPrediction !== "function" || storage[HOOK_MARK]) return false;
    const original = storage.upsertPrediction;
    Object.defineProperty(storage, HOOK_MARK, { value: { original }, configurable: false, enumerable: false, writable: false });
    const capture = prediction => {
      try { upsertShadow(rootObject, buildSnapshot(clone(prediction))); }
      catch (error) { console.warn("[outer-attack-ticket-shadow] shadow保存を続行できません", error); }
      return prediction;
    };
    storage.upsertPrediction = function upsertPredictionWithOuterAttackShadow(prediction) {
      const result = original.call(storage, prediction);
      return result && typeof result.then === "function" ? result.then(capture) : capture(result || prediction);
    };
    return true;
  }

  return Object.freeze({
    VERSION, STORAGE_KEY, DEFAULT_STAKE_YEN, REPLACEMENT_POLICY,
    BASELINE_PROFILE, FIXED_SIGNAL, CATEGORY_DEFINITIONS,
    normalizeTicket, snapshotA, replayBasis, candidatePool, rankedAnalyses,
    detectSignal, buildVariant, buildSnapshot, readHistory, upsertShadow,
    compareOutcome, installStorageHook
  });
});
