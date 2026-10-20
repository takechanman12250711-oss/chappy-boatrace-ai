'use strict';

// Read-only comparison of already replayed rows. Never changes a prediction,
// ticket budget, cohort membership or an experiment's candidate definition.
const validTicket = value => typeof value === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(value) &&
  new Set(value.split('-')).size === 3;
const validHead = value => Number.isInteger(value) && value >= 1 && value <= 6;
const rate = (hits, races) => races ? 100 * hits / races : null;

function inspectRows(rows, { baselineKey = 'current', candidateKey = 'candidate' } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Comparison rows must be an array');
  if (typeof baselineKey !== 'string' || !baselineKey || typeof candidateKey !== 'string' || !candidateKey)
    throw new TypeError('Comparison keys must be nonempty strings');
  const seen = new Set(), inputIssues = [], pendingRaceKeys = [], resultExclusions = [], settled = [];
  for (const [index, row] of rows.entries()) {
    const key = row?.key || row?.raceKey;
    if (typeof key !== 'string' || !key) inputIssues.push({ index, key: null, reason: 'missing-race-key' });
    else if (seen.has(key)) inputIssues.push({ index, key, reason: 'duplicate-race-key' });
    else seen.add(key);
    if (row?.result?.excluded) resultExclusions.push({ key: key || null, reason: String(row.result.excluded) });
    else if (validTicket(row?.result?.actual)) settled.push({ key, row, actual: row.result.actual });
    else if (row?.result?.actual !== undefined && row.result.actual !== null && row.result.actual !== '')
      resultExclusions.push({ key: key || null, reason: 'invalid-result-ticket' });
    else pendingRaceKeys.push(key || null);
  }
  return { baselineKey, candidateKey, replayedRaces: rows.length, inputIssues,
    pendingRaces: pendingRaceKeys.length, pendingRaceKeys,
    resultExcludedRaces: resultExclusions.length, resultExclusions, settled };
}
function metadata(input) {
  const { settled, ...rest } = input;
  return { ...rest, settledRaces: settled.length };
}
function metrics(rows, baselineHit, candidateHit) {
  let baselineHits = 0, candidateHits = 0, gainedHits = 0, lostHits = 0;
  for (const row of rows) {
    const a = baselineHit(row), b = candidateHit(row);
    if (a) baselineHits++;
    if (b) candidateHits++;
    if (b && !a) gainedHits++;
    if (a && !b) lostHits++;
  }
  return { evaluatedRaces: rows.length,
    baseline: { hits: baselineHits, hitRate: rate(baselineHits, rows.length) },
    candidate: { hits: candidateHits, hitRate: rate(candidateHits, rows.length) },
    gainedHits, lostHits, netHits: gainedHits - lostHits,
    hitRateDelta: rows.length ? rate(candidateHits - baselineHits, rows.length) : null };
}
function blockedMetrics() {
  return { evaluatedRaces: 0, baseline: { hits: null, hitRate: null },
    candidate: { hits: null, hitRate: null }, gainedHits: null, lostHits: null, netHits: null, hitRateDelta: null };
}
function ticketList(model) {
  if (!Array.isArray(model?.tickets)) return { count: null, tickets: null, reason: 'tickets-not-array' };
  const tickets = Array.from(model.tickets, t => typeof t === 'string' ? t : t?.ticket);
  if (!tickets.length || tickets.some(t => !validTicket(t)) || new Set(tickets).size !== tickets.length)
    return { count: tickets.length, tickets: null, reason: 'invalid-ticket-list' };
  return { count: tickets.length, tickets, reason: null };
}
function pointBudgetComparison(rows, options) {
  const input = inspectRows(rows, options), { baselineKey, candidateKey } = input;
  const budgetMismatches = [], ticketInputIssues = [];
  let changedTicketsReplayed = 0;
  // Check every replayed row before looking at settlement. A pending/refunded
  // unequal budget must not silently become an eligible comparison later.
  for (const [index, row] of rows.entries()) {
    const key = row?.key || row?.raceKey || null;
    const baseline = ticketList(row?.[baselineKey]), candidate = ticketList(row?.[candidateKey]);
    if (baseline.count !== candidate.count) budgetMismatches.push({ key,
      baselineTicketCount: baseline.count, candidateTicketCount: candidate.count });
    if (baseline.reason || candidate.reason) ticketInputIssues.push({ index, key,
      baselineReason: baseline.reason, candidateReason: candidate.reason });
    if (baseline.tickets && candidate.tickets &&
        JSON.stringify([...baseline.tickets].sort()) !== JSON.stringify([...candidate.tickets].sort())) changedTicketsReplayed++;
  }
  const common = { metric: 'saved-ticket-hit-rate', ...metadata(input),
    pointBudgetsEqual: budgetMismatches.length ? false : ticketInputIssues.length ? null : true,
    budgetMismatchCount: budgetMismatches.length,
    budgetMismatches, ticketInputIssues, changedTicketsReplayed };
  if (budgetMismatches.length) return { ...common, comparable: false,
    status: 'POINT_BUDGET_MISMATCH', ...blockedMetrics() };
  if (input.inputIssues.length || ticketInputIssues.length) return { ...common, comparable: false,
    status: 'INVALID_COMPARISON_INPUT', ...blockedMetrics() };
  const result = metrics(input.settled,
    r => ticketList(r.row[baselineKey]).tickets.includes(r.actual),
    r => ticketList(r.row[candidateKey]).tickets.includes(r.actual));
  return { ...common, comparable: result.evaluatedRaces > 0,
    status: result.evaluatedRaces ? 'COMPARABLE' : 'INSUFFICIENT_EVIDENCE', ...result };
}
function headAccuracyComparison(rows, options) {
  const input = inspectRows(rows, options), { baselineKey, candidateKey } = input;
  const headExclusions = [], evaluated = [];
  for (const row of input.settled) {
    const baselineHead = row.row?.[baselineKey]?.head, candidateHead = row.row?.[candidateKey]?.head;
    if (!validHead(baselineHead) || !validHead(candidateHead)) {
      headExclusions.push({ key: row.key,
        baselineHead: baselineHead ?? null, candidateHead: candidateHead ?? null,
        reason: 'invalid-or-missing-head' });
    } else evaluated.push({ ...row, baselineHead, candidateHead });
  }
  const changedHeadReplayed = rows.filter(row => validHead(row?.[baselineKey]?.head) &&
    validHead(row?.[candidateKey]?.head) && row[baselineKey].head !== row[candidateKey].head).length;
  const common = { metric: 'main-head-accuracy', ...metadata(input),
    headExcludedRaces: headExclusions.length, headExclusions, changedHeadReplayed,
    changedHeadRaces: evaluated.filter(r => r.baselineHead !== r.candidateHead).length,
    unchangedHeadRaces: evaluated.filter(r => r.baselineHead === r.candidateHead).length };
  if (input.inputIssues.length) return { ...common, comparable: false,
    status: 'INVALID_COMPARISON_INPUT', ...blockedMetrics() };
  const result = metrics(evaluated,
    r => r.baselineHead === Number(r.actual[0]), r => r.candidateHead === Number(r.actual[0]));
  return { ...common, comparable: result.evaluatedRaces > 0,
    status: result.evaluatedRaces ? 'COMPARABLE' : 'INSUFFICIENT_EVIDENCE', ...result };
}

module.exports = { pointBudgetComparison, headAccuracyComparison };
