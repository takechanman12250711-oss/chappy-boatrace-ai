'use strict';

// Settlement reads the immutable forward records only. It never regenerates a
// forecast, changes a source selection, or turns the research into a predictor.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const audit = require('./audit-escape-main.cjs');
const input = require('./analysis-input-contract');
const { pointBudgetComparison } = require('./frozen-comparison-fairness.cjs');

const RECORD_DIR = 'data/independent-head-forward-v2';
const REPORT_PATH = 'data/stats/independent-head-forward-v2-report.json';
const MAX_RECORD_BYTES = 4 * 1024 * 1024;
const json = value => JSON.stringify(value) + '\n';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const count = (counts, reason) => { counts[reason] = (counts[reason] || 0) + 1; };
const unique = records => [...new Map(records.map(record => [hash(json(record)), record])).values()];
const stamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;

function commonAttempt(record) {
  const { stage, completedAt, startedHash, outcome, ...common } = record;
  return common;
}

function firstStart(records) {
  return [...records].sort((a, b) => stamp(a.startedAt) - stamp(b.startedAt) ||
    String(a.runId).localeCompare(String(b.runId), 'en', { numeric: true }) ||
    String(a.runAttempt).localeCompare(String(b.runAttempt), 'en', { numeric: true }) ||
    hash(json(a)).localeCompare(hash(json(b))))[0];
}

function financialStats(rows, key, blocked) {
  if (blocked) return { races: 0, hits: null, stake: null, returned: null, profit: null,
    hitRate: null, recoveryRate: null };
  const settled = rows.filter(row => row.result && !row.result.excluded);
  const hits = settled.filter(row => row[key].tickets.includes(row.result.actual));
  const stake = settled.reduce((sum, row) => sum + row[key].tickets.length * 100, 0);
  const returned = hits.reduce((sum, row) => sum + row.result.payout, 0);
  return { races: settled.length, hits: hits.length, stake, returned, profit: returned - stake,
    hitRate: settled.length ? hits.length / settled.length * 100 : null,
    recoveryRate: stake ? returned / stake * 100 : null };
}

function normalizedResult(value) {
  if (!value) return null;
  if (value.excluded) return { excluded: String(value.excluded) };
  if (!/^[1-6]-[1-6]-[1-6]$/.test(value.actual || '') || new Set(value.actual.split('-')).size !== 3 ||
      !Number.isFinite(value.payout) || value.payout <= 0) return { excluded: 'invalid-normalized-result' };
  return value;
}

// Inputs here have already passed the receipt contract. officialResults contains
// audit.resultOf() projections, not arbitrary raw responses or forecast results.
function summarize({ attempts = [], seals = [], officialResults = new Map(), protocolHash } = {}) {
  if (!/^[a-f0-9]{64}$/.test(protocolHash || '')) throw Error('head_report_protocol_hash_required');
  if (!Array.isArray(attempts) || !Array.isArray(seals) || !(officialResults instanceof Map))
    throw TypeError('head_report_invalid_inputs');
  const currentAttempts = unique(attempts.filter(record => record.protocolHash === protocolHash));
  const currentSeals = unique(seals.filter(record => record.protocolHash === protocolHash));
  const races = new Map();
  const group = key => {
    if (!races.has(key)) races.set(key, { starts: [], completed: [], seals: [] });
    return races.get(key);
  };
  for (const attempt of currentAttempts) {
    if (attempt.stage === 'started') group(attempt.raceKey).starts.push(attempt);
    else if (attempt.stage === 'completed') group(attempt.raceKey).completed.push(attempt);
  }
  for (const seal of currentSeals) group(seal.attempt.raceKey).seals.push(seal);

  const rows = [], pairedRows = [], states = {};
  const startsByHash = new Map(currentAttempts.filter(record => record.stage === 'started').map(record => [hash(json(record)), record]));
  const linkedCompletions = currentAttempts.filter(record => record.stage === 'completed' && startsByHash.has(record.startedHash) &&
    isDeepStrictEqual(commonAttempt(record), commonAttempt(startsByHash.get(record.startedHash))));
  const completionHashes = new Set(linkedCompletions.map(record => hash(json(record))));
  const orphanCompletionRecords = currentAttempts.filter(record => record.stage === 'completed').length - linkedCompletions.length;
  const orphanSealRecords = currentSeals.filter(receipt => !completionHashes.has(receipt.attemptHash)).length;
  for (const [raceKey, evidence] of [...races].sort(([a], [b]) => a.localeCompare(b))) {
    const { starts, completed, seals: receipts } = evidence;
    const start = firstStart(starts);
    const row = { raceKey, date: raceKey.slice(0, 8), started: Boolean(start),
      attemptId: start?.attemptId || null, startedHash: start ? hash(json(start)) : null,
      sourcePath: start?.source?.path || start?.source?.sourcePointer?.path || null,
      sourceSha256: start?.source?.sha256 || start?.source?.sourcePointer?.sha256 || null,
      startedAt: start?.startedAt || null, completed: false, remoteArtifactVerified: false,
      status: null, reason: null };
    const finish = (status, reason) => {
      row.status = status; row.reason = reason; rows.push(row); count(states, status);
    };
    if (!start) {
      finish('unclaimed', 'NO_STORED_START'); continue;
    }
    if (starts.length !== 1) { finish('ambiguous', 'CONFLICTING_STARTS'); continue; }
    const matching = completed.filter(record => record.startedHash === row.startedHash &&
      isDeepStrictEqual(commonAttempt(record), commonAttempt(start)));
    if (completed.length !== matching.length || matching.length > 1) {
      finish('ambiguous', 'CONFLICTING_COMPLETIONS'); continue;
    }
    if (!matching.length) {
      finish('generation-pending', 'NO_COMPLETED_ATTEMPT'); continue;
    }
    const completion = matching[0];
    row.completed = true; row.completedHash = hash(json(completion));
    row.completedAt = completion.completedAt;
    const matchedReceipts = receipts.filter(receipt => receipt.attemptHash === row.completedHash &&
      isDeepStrictEqual(receipt.attempt, completion));
    if (receipts.length !== matchedReceipts.length) {
      finish('ambiguous', 'CONFLICTING_SEAL_ATTEMPTS'); continue;
    }
    const artifactKeys = new Set(matchedReceipts.map(receipt => json({
      id: receipt.artifact.id, digest: receipt.artifact.digest, name: receipt.artifact.name,
      runId: receipt.artifact.runId, runAttempt: receipt.artifact.runAttempt,
      workflowHead: receipt.artifact.workflowHead, batchSha256: receipt.batchSha256
    })));
    if (artifactKeys.size > 1) { finish('ambiguous', 'CONFLICTING_ARTIFACTS'); continue; }
    const receipt = [...matchedReceipts].sort((a, b) => stamp(a.artifact.confirmedAt) - stamp(b.artifact.confirmedAt) ||
      hash(json(a)).localeCompare(hash(json(b))))[0];
    row.remoteArtifactVerified = Boolean(receipt?.remoteBytesVerified);
    row.sealStatus = receipt?.status || 'unsealed';
    if (receipt) {
      row.sealHash = hash(json(receipt));
      row.artifactId = receipt.artifact.id; row.confirmedAt = receipt.artifact.confirmedAt;
    }
    if (completion.outcome.status === 'missing') {
      finish('generation-missing', completion.outcome.reason); continue;
    }
    if (completion.outcome.status === 'failed') {
      finish('generation-failed', completion.outcome.reason); continue;
    }
    if (!receipt) { finish('unsealed', 'NO_REMOTE_SEAL'); continue; }
    if (receipt.status === 'late') { finish('late', 'REMOTE_CONFIRMATION_AFTER_DEADLINE'); continue; }
    if (receipt.status !== 'eligible' || receipt.forwardEligible !== true || receipt.remoteBytesVerified !== true ||
        completion.outcome.status !== 'generated' || !completion.outcome.snapshot) {
      finish('ineligible-seal', 'SEAL_NOT_ELIGIBLE'); continue;
    }
    const snapshot = completion.outcome.snapshot;
    row.baseline = snapshot.baseline; row.candidate = snapshot.candidate;
    row.guardChanged = snapshot.guard?.changed === true;
    row.guardReason = snapshot.guard?.reason || null;
    row.result = normalizedResult(officialResults.get(raceKey));
    row.resultStatus = !row.result ? 'pending' : row.result.excluded ? 'excluded' : 'settled';
    pairedRows.push({ key: raceKey, baseline: row.baseline, candidate: row.candidate, result: row.result });
    finish('eligible-sealed', 'VERIFIED_BEFORE_DEADLINE');
  }
  const comparison = pointBudgetComparison(pairedRows, { baselineKey: 'baseline', candidateKey: 'candidate' });
  const blocked = ['POINT_BUDGET_MISMATCH', 'INVALID_COMPARISON_INPUT'].includes(comparison.status);
  const stats = { baseline: financialStats(pairedRows, 'baseline', blocked),
    candidate: financialStats(pairedRows, 'candidate', blocked) };
  const startedRaces = rows.filter(row => row.started).length;
  return {
    collectionStatus: !rows.length ? 'NO_ATTEMPTS' : blocked ? 'INVALID_COMPARISON_INPUT' :
      comparison.evaluatedRaces ? 'COMPARISON_AVAILABLE' : pairedRows.length ? 'RESULTS_PENDING' : 'EVIDENCE_INCOMPLETE',
    coverage: { observedRaces: rows.length, startedRaces,
      completedRaces: rows.filter(row => row.completed).length,
      eligibleSealedRaces: pairedRows.length,
      remoteArtifactVerifiedRaces: rows.filter(row => row.remoteArtifactVerified).length,
      unclaimedRaces: rows.length - startedRaces,
      orphanCompletionRecords, orphanSealRecords,
      settledRaces: comparison.settledRaces, pendingResultRaces: comparison.pendingRaces,
      resultExcludedRaces: comparison.resultExcludedRaces, states },
    comparison, stats, rows
  };
}

function loadEvidence(root, protocol, contract = require('./head-forward-contract.cjs')) {
  const base = path.join(root, RECORD_DIR), attempts = [], seals = [], invalid = [], otherProtocols = {};
  let recordsRead = 0;
  if (!fs.existsSync(base)) return { attempts, seals, recordsRead, invalid, otherProtocols: {} };
  if (!fs.lstatSync(base).isDirectory()) return { attempts, seals, recordsRead,
    invalid: [{ path: RECORD_DIR, reason: 'invalid-root-directory' }], otherProtocols };
  for (const date of fs.readdirSync(base).filter(name => /^\d{8}$/.test(name)).sort()) {
    const directory = path.join(base, date);
    if (!fs.lstatSync(directory).isDirectory()) { invalid.push({ path: `${RECORD_DIR}/${date}`, reason: 'invalid-directory' }); continue; }
    for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
      const relative = path.posix.join(RECORD_DIR, date, name);
      try {
        const file = path.join(root, relative), stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECORD_BYTES) throw Error('record-size-or-type-invalid');
        const bytes = fs.readFileSync(file); recordsRead++;
        const record = JSON.parse(bytes);
        const key = record.raceKey || record.attempt?.raceKey;
        if (!/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(key || '') ||
            date !== key.slice(0, 8) || name !== `${key}-${hash(bytes)}.json`) throw Error('record-path-or-hash-mismatch');
        if (bytes.toString('utf8') !== json(record)) throw Error('noncanonical-record');
        if (record.protocolHash !== protocol.digest) {
          if (!/^[a-f0-9]{64}$/.test(record.protocolHash || '')) throw Error('invalid-protocol-hash');
          if (!['independent-head-forward-attempt-v2', 'independent-head-forward-seal-v2'].includes(record.version))
            throw Error('unknown-record-version');
          count(otherProtocols, record.protocolHash); continue;
        }
        if (record.version === 'independent-head-forward-attempt-v2' && contract.validAttempt(record, protocol)) attempts.push(record);
        else if (record.version === 'independent-head-forward-seal-v2' && contract.validSeal(record, protocol)) seals.push(record);
        else throw Error('record-contract-invalid');
      } catch (error) { invalid.push({ path: relative, reason: error.message }); }
    }
  }
  return { attempts, seals, recordsRead, invalid, otherProtocols };
}

function loadResults(root, wanted) {
  const selected = new Map(), files = [];
  const add = (record, date = '') => {
    const key = input.raceKey(record, date);
    if (wanted.has(key)) selected.set(key, audit.chooseOfficialResult(selected.get(key), record));
  };
  for (const date of [...new Set([...wanted].map(key => key.slice(0, 8)))].sort()) {
    const relative = `data/results/${date}.json`, file = path.join(root, relative);
    if (!fs.existsSync(file)) continue;
    const value = JSON.parse(fs.readFileSync(file, 'utf8')); files.push(relative);
    for (const record of value.races || []) add(record, date);
  }
  const ledger = 'data/stats/race-review-results.json';
  if (wanted.size && fs.existsSync(path.join(root, ledger))) {
    const value = JSON.parse(fs.readFileSync(path.join(root, ledger), 'utf8')); files.push(ledger);
    for (const record of Object.values(value.races || {})) add(record);
  }
  return { officialResults: new Map([...selected].map(([key, value]) => [key, audit.resultOf(value)])), files };
}

function report(root, { contract = require('./head-forward-contract.cjs'), now = Date.now, sourceCommit = process.env.GITHUB_SHA || '' } = {}) {
  const protocol = contract.readProtocol(root);
  const evidence = loadEvidence(root, protocol, contract);
  const wanted = new Set(evidence.attempts.map(record => record.raceKey));
  const results = loadResults(root, wanted);
  const summary = summarize({ ...evidence, officialResults: results.officialResults, protocolHash: protocol.digest });
  if (evidence.invalid.length) {
    summary.collectionStatus = 'INVALID_STORED_EVIDENCE';
    summary.comparison = { ...summary.comparison, comparable: false, status: 'INVALID_STORED_EVIDENCE',
      evaluatedRaces: 0, baseline: { hits: null, hitRate: null }, candidate: { hits: null, hitRate: null },
      gainedHits: null, lostHits: null, netHits: null, hitRateDelta: null };
    summary.stats = { baseline: financialStats([], 'baseline', true), candidate: financialStats([], 'candidate', true) };
  }
  const invalidReasons = {};
  for (const record of evidence.invalid) count(invalidReasons, record.reason);
  const value = { version: 'independent-head-forward-v2-report-v1', generatedAt: new Date(now()).toISOString(),
    sourceCommit, candidateId: protocol.value.candidateId, protocolHash: protocol.digest,
    productionChanged: false, automaticProductionChange: false, usableForPrediction: false,
    automaticApplication: false, adoptionGate: null,
    decisionGate: { status: 'INSUFFICIENT_EVIDENCE', reason: 'NO_FORMAL_DECISION_GATE' },
    ...summary,
    input: { recordsRead: evidence.recordsRead, attemptRecords: evidence.attempts.length,
      sealRecords: evidence.seals.length, invalidRecords: evidence.invalid.length,
      invalidReasons, invalid: evidence.invalid, otherProtocolRecords: evidence.otherProtocols,
      otherProtocolsValidatedAgainstCurrentContract: false,
      storedRecordsValid: evidence.invalid.length === 0, officialResultFiles: results.files },
    limitation: 'Research only. The denominator is stored starts from the existing note collector, not all races or venues. Missing, failed, unsealed, late and ambiguous attempts stay visible. Only matching before-deadline remote seals enter paired results. One ticket is treated as 100 yen for comparison, not an actual purchase. No adoption gate is registered.' };
  const file = path.join(root, REPORT_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, json(value), { flag: 'wx' }); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return value;
}

if (require.main === module) {
  try {
    const value = report(process.cwd());
    console.log(JSON.stringify({ ...value, rows: undefined }));
    if (value.input.invalidRecords || value.collectionStatus === 'INVALID_COMPARISON_INPUT') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { RECORD_DIR, REPORT_PATH, summarize, loadEvidence, loadResults, report };
