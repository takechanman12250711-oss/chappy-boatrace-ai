'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config/escape-partner-structured-forward.json');
const OUTPUT_PATH = path.join(ROOT, 'data/stats/escape-partner-structured-forward.json');
const STAKE_PER_TICKET = 100;
const ALLOWED_ROLES = {
  1: new Set(['head', 'alternate-head', 'attack']),
  2: new Set(['hold', 'pickup', 'attack']),
  3: new Set(['hold', 'pickup'])
};

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function ticketParts(ticket) { return String(ticket || '').split('-').map(Number); }
function round(value, digits = 2) { return Number(Number(value || 0).toFixed(digits)); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function sourceCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(); }
  catch { return null; }
}

function evidenceOf(record) { return record?.prediction?.practicalSelection?.candidateValidationEvidence || null; }
function selectedTicketRows(record) { return Array.isArray(record?.prediction?.practicalTickets) ? record.prediction.practicalTickets : []; }
function selectedTickets(record) { return selectedTicketRows(record).map(row => String(row?.ticket || '')).filter(Boolean); }
function mainHead(record) { return Number(record?.prediction?.mainSheet?.honmei?.boatNo); }
function raceKey(record) { return String(record?.raceKey || `${record?.date}-${record?.jcd}-${record?.raceNo}`); }

function scenarioForObservation(evidence, observation) {
  const branchById = new Map((evidence.branches || []).map(branch => [branch.id, branch]));
  const groups = new Map();
  for (const branchId of observation.validPurchaseBranchIds || []) {
    const branch = branchById.get(branchId);
    if (!branch?.scenarioId) continue;
    if (!groups.has(branch.scenarioId)) groups.set(branch.scenarioId, new Set());
    const positions = groups.get(branch.scenarioId);
    for (const coverage of observation.coverage || []) {
      if (coverage.branchId !== branchId) continue;
      const position = Number(coverage.position);
      const boat = Number(coverage.boatNo);
      const parts = ticketParts(observation.ticket);
      if (parts[position - 1] !== boat) continue;
      if (!ALLOWED_ROLES[position]?.has(String(coverage.role || ''))) continue;
      positions.add(position);
    }
  }
  return [...groups.entries()]
    .filter(([, positions]) => [1, 2, 3].every(position => positions.has(position)))
    .map(([scenarioId]) => scenarioId)
    .sort()[0] || null;
}

function structuredOptions(record) {
  const evidence = evidenceOf(record);
  const baseline = selectedTickets(record);
  if (!Number.isInteger(mainHead(record)) || mainHead(record) === 1) return {ok: false, reason: 'MAIN_HEAD_NOT_ELIGIBLE'};
  if (evidence?.status !== 'captured' || evidence.resultUsedForGeneration !== false) return {ok: false, reason: 'EVIDENCE_NOT_CAPTURED'};
  if (JSON.stringify(evidence.finalSelectedTickets || []) !== JSON.stringify(baseline)) return {ok: false, reason: 'FINAL_TICKETS_MISMATCH'};
  const options = [];
  for (const observation of evidence.observations || []) {
    if (observation?.purchaseEligible !== true) continue;
    if (!/^1-[2-6]-[2-6]$/.test(String(observation.ticket || ''))) continue;
    const priority = Number(observation.priorityScore);
    if (!Number.isFinite(priority)) continue;
    const scenarioId = scenarioForObservation(evidence, observation);
    if (!scenarioId) continue;
    options.push({ticket: observation.ticket, priority, scenarioId, observation});
  }
  return {ok: true, evidence, baseline, options};
}

function selectCandidate(record) {
  const structured = structuredOptions(record);
  if (!structured.ok) return {changed: false, reason: structured.reason, tickets: selectedTickets(record)};
  const {evidence, baseline, options} = structured;
  const selectedSet = new Set(baseline);
  const oneHeadRows = selectedTicketRows(record)
    .map((row, index) => ({row, index, parts: ticketParts(row?.ticket)}))
    .filter(item => item.parts[0] === 1);
  const secondCounts = new Map();
  for (const item of oneHeadRows) secondCounts.set(item.parts[1], (secondCounts.get(item.parts[1]) || 0) + 1);
  const observationByTicket = new Map((evidence.observations || []).map(row => [row.ticket, row]));
  const donors = oneHeadRows.filter(item => {
    const category = String(item.row?.category || '');
    const observation = observationByTicket.get(item.row.ticket);
    return (secondCounts.get(item.parts[1]) || 0) >= 2
      && !['本線', '流し'].includes(category)
      && observation?.purchaseEligible === true
      && Number.isFinite(Number(observation.priorityScore));
  }).map(item => ({...item, priority: Number(observationByTicket.get(item.row.ticket).priorityScore)}));
  const selectedSeconds = new Set(oneHeadRows.map(item => item.parts[1]));
  const choices = [];
  for (const candidate of options) {
    const parts = ticketParts(candidate.ticket);
    if (selectedSet.has(candidate.ticket) || selectedSeconds.has(parts[1])) continue;
    for (const donor of donors) {
      if (candidate.priority <= donor.priority) continue;
      choices.push({candidate, donor});
    }
  }
  choices.sort((a, b) => b.candidate.priority - a.candidate.priority
    || a.donor.priority - b.donor.priority
    || b.donor.index - a.donor.index
    || a.candidate.ticket.localeCompare(b.candidate.ticket));
  const choice = choices[0];
  if (!choice) return {changed: false, reason: 'NO_STRICTLY_BETTER_DIVERSIFIER', tickets: baseline};
  const tickets = baseline.slice();
  tickets[choice.donor.index] = choice.candidate.ticket;
  return {
    changed: true,
    reason: 'REPLACE_DUPLICATE_SECOND',
    tickets,
    added: choice.candidate.ticket,
    removed: choice.donor.row.ticket,
    candidatePriority: choice.candidate.priority,
    donorPriority: choice.donor.priority,
    scenarioId: choice.candidate.scenarioId
  };
}

function officialOutcome(resultFile, key) {
  const result = (resultFile?.races || []).find(row => `${row.date}-${row.jcd}-${row.raceNo}` === key);
  if (!result || result.ok !== true || result.resultAvailable !== true || result.void === true || result.status !== 'finished') return null;
  const ticket = String(result?.trifecta?.combination || '');
  const payout = Number(result?.trifecta?.payout);
  return /^\d-\d-\d$/.test(ticket) && Number.isFinite(payout) ? {ticket, payout, source: result.source} : null;
}

function summarize(rows) {
  const settled = rows.filter(row => row.outcome);
  const baselineHits = settled.filter(row => row.baselineTickets.includes(row.outcome.ticket));
  const candidateHits = settled.filter(row => row.candidateTickets.includes(row.outcome.ticket));
  const baselineStake = settled.reduce((sum, row) => sum + row.baselineTickets.length * STAKE_PER_TICKET, 0);
  const candidateStake = settled.reduce((sum, row) => sum + row.candidateTickets.length * STAKE_PER_TICKET, 0);
  const baselineReturn = baselineHits.reduce((sum, row) => sum + row.outcome.payout, 0);
  const candidateReturn = candidateHits.reduce((sum, row) => sum + row.outcome.payout, 0);
  const gained = settled.filter(row => !row.baselineTickets.includes(row.outcome.ticket) && row.candidateTickets.includes(row.outcome.ticket));
  const lost = settled.filter(row => row.baselineTickets.includes(row.outcome.ticket) && !row.candidateTickets.includes(row.outcome.ticket));
  const reasons = {};
  for (const row of rows) reasons[row.selection.reason] = (reasons[row.selection.reason] || 0) + 1;
  const metrics = (hits, stake, returned) => ({
    races: settled.length,
    hits: hits.length,
    hitRate: settled.length ? round(hits.length / settled.length * 100) : null,
    stakeYen: stake,
    returnYen: returned,
    recoveryRate: stake ? round(returned / stake * 100) : null
  });
  return {
    records: rows.length,
    settled: settled.length,
    pending: rows.length - settled.length,
    changed: rows.filter(row => row.selection.changed).length,
    reasons,
    baseline: metrics(baselineHits, baselineStake, baselineReturn),
    candidate: metrics(candidateHits, candidateStake, candidateReturn),
    gainedHits: gained.length,
    lostHits: lost.length,
    netHitChange: gained.length - lost.length,
    gainedRaceKeys: gained.map(row => row.raceKey),
    lostRaceKeys: lost.map(row => row.raceKey)
  };
}

function loadRecords(config) {
  const predictionDir = path.join(ROOT, 'data/predictions');
  const files = fs.readdirSync(predictionDir).filter(name => /^\d{8}\.json$/.test(name) && name.slice(0, 8) >= config.discoveryDate).sort();
  const byKey = new Map();
  const inputFiles = [];
  for (const name of files) {
    const file = path.join(predictionDir, name);
    inputFiles.push(file);
    const data = readJson(file);
    for (const source of ['verificationPredictions', 'predictions']) {
      for (const record of data[source] || []) byKey.set(raceKey(record), {record, source});
    }
  }
  return {records: [...byKey.values()].sort((a, b) => raceKey(a.record).localeCompare(raceKey(b.record))), inputFiles};
}

function buildReport(now = new Date()) {
  const config = readJson(CONFIG_PATH);
  const loaded = loadRecords(config);
  const resultFiles = new Map();
  const inputFiles = [...loaded.inputFiles];
  const rows = [];
  for (const item of loaded.records) {
    const record = item.record;
    const selectedAt = new Date(record.selectedAt);
    const deadlineAt = new Date(record.deadlineAt);
    if (!Number.isFinite(selectedAt.getTime()) || !Number.isFinite(deadlineAt.getTime()) || selectedAt >= deadlineAt) continue;
    const date = String(record.date || raceKey(record).slice(0, 8));
    let period = null;
    if (date === config.discoveryDate) period = 'discovery';
    else if (selectedAt >= new Date(config.registeredAt) && deadlineAt > new Date(config.registeredAt)) period = 'forward';
    if (!period) continue;
    if (!resultFiles.has(date)) {
      const resultPath = path.join(ROOT, `data/results/${date}.json`);
      resultFiles.set(date, fs.existsSync(resultPath) ? readJson(resultPath) : null);
      if (fs.existsSync(resultPath)) inputFiles.push(resultPath);
    }
    const baselineTickets = selectedTickets(record);
    const selection = selectCandidate(record);
    rows.push({
      raceKey: raceKey(record), date, period, source: item.source,
      selectedAt: record.selectedAt, deadlineAt: record.deadlineAt,
      baselineTickets, candidateTickets: selection.tickets,
      selection, outcome: officialOutcome(resultFiles.get(date), raceKey(record))
    });
  }
  const groups = {};
  for (const period of ['discovery', 'forward']) {
    const periodRows = rows.filter(row => row.period === period);
    groups[period] = {
      total: summarize(periodRows),
      primary: summarize(periodRows.filter(row => row.source === 'predictions')),
      verificationOnly: summarize(periodRows.filter(row => row.source === 'verificationPredictions'))
    };
  }
  return {
    schemaVersion: 1,
    reportId: config.version,
    generatedAt: now.toISOString(),
    sourceCommit: sourceCommit(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    resultUsedForSelection: false,
    decision: 'INSUFFICIENT_EVIDENCE',
    contract: {
      discoveryDate: config.discoveryDate,
      registeredAt: config.registeredAt,
      forwardRequiresSelectedAtOnOrAfterRegistration: true,
      sameRaceAndTicketCount: true,
      sameScenarioPositionsRequired: [1, 2, 3],
      physicalCoverageAccepted: false,
      oddsUsedForSelection: false,
      resultsUsedForSelection: false
    },
    integrity: {
      configSha256: sha256(CONFIG_PATH),
      scriptSha256: sha256(__filename),
      inputFileCount: new Set(inputFiles).size,
      inputSha256: crypto.createHash('sha256').update([...new Set(inputFiles)].sort().map(file => `${path.relative(ROOT, file)}:${sha256(file)}`).join('\n')).digest('hex')
    },
    groups,
    rows
  };
}

if (require.main === module) {
  const report = buildReport();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), {recursive: true});
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({output: path.relative(ROOT, OUTPUT_PATH), discovery: report.groups.discovery.total, forward: report.groups.forward.total}, null, 2)}\n`);
}

module.exports = {buildReport, scenarioForObservation, selectCandidate, summarize};
