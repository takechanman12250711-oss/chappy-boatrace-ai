'use strict';
const fs = require('node:fs');
const path = require('node:path');
const candidate24 = require('./build-candidate24-report');

function mapRecord(row) {
  const p = row.prediction || {}, s = p.practicalSelection || {};
  const decisions = [...(s.candidateDecisions || []),
    ...(s.targetDecisions || []).flatMap(t => t.candidateDecisions || [])];
  const reasons = {};
  for (const d of decisions) {
    const ticket = d.ticket || d.combination;
    if (typeof ticket !== 'string') continue;
    reasons[ticket] ||= [];
    for (const reason of [d.reasonCode, ...(d.reasonCodes || [])]) {
      if (typeof reason === 'string' && !reasons[ticket].includes(reason)) reasons[ticket].push(reason);
    }
  }
  return {
    candidateSource: p.candidate24Tickets ? 'stored' : 'reconstructed-from-saved-sheets',
    generation: row.reviewEvidence?.method || s.logicFingerprint || p.logicFingerprint || 'unrecorded',
    scenario: s.verificationEvidence?.mainScenario?.label || p.verificationEvidence?.mainScenario?.label ||
      p.predictedScenarioTitle || p.raceFlow?.title || 'unrecorded',
    reasons
  };
}

function classify(pool, practical, actual) {
  const candidateHit = pool.includes(actual), practicalHit = practical.includes(actual);
  if (candidateHit && practicalHit) return 'both-hit';
  if (candidateHit) return 'candidate-only-hit';
  if (practicalHit) return 'practical-only-hit';
  if (!pool.some(t => t[0] === actual[0])) return 'candidate-head-missing';
  if (!pool.some(t => t.slice(0, 3) === actual.slice(0, 3))) return 'candidate-first-second-pair-missing';
  return 'candidate-third-missing';
}

function summarize(rows) {
  const counts = {}, reasons = {};
  let candidateOnlyReturn = 0, practicalOnlyReturn = 0, nonSubsetRaces = 0;
  for (const r of rows) {
    counts[r.classification] = (counts[r.classification] || 0) + 1;
    if (r.practicalOutsideCandidate.length) nonSubsetRaces++;
    if (r.classification === 'candidate-only-hit') {
      candidateOnlyReturn += r.payoutPer100;
      for (const code of r.exclusionReasons.length ? r.exclusionReasons : ['reason-not-recorded']) {
        reasons[code] = (reasons[code] || 0) + 1;
      }
    }
    if (r.classification === 'practical-only-hit') practicalOnlyReturn += r.payoutPer100;
  }
  return { races: rows.length, counts, nonSubsetRaces, candidateOnlyReturn, practicalOnlyReturn,
    netHitDifference: (counts['candidate-only-hit'] || 0) - (counts['practical-only-hit'] || 0),
    recordedExclusionReasons: reasons };
}

function main(root = process.cwd()) {
  const rows = [];
  const reference = candidate24.main(root, { write: false, mapRecord,
    onSettled({row, pool, practical, result}) {
      const actual = result.trifecta.combination;
      rows.push({ raceKey: row.raceKey, date: row.date, selectedAt: row.selectedAt,
        generation: row.audit.generation, scenario: row.audit.scenario,
        candidateSource: row.audit.candidateSource,
        candidateTickets: pool, practicalTickets: practical, actual,
        payoutPer100: result.trifecta.payout,
        classification: classify(pool, practical, actual),
        practicalOutsideCandidate: practical.filter(t => !pool.includes(t)),
        exclusionReasons: row.audit.reasons[actual] || [] });
    }
  });
  rows.sort((a,b) => a.selectedAt.localeCompare(b.selectedAt) || a.raceKey.localeCompare(b.raceKey));
  const byGeneration = {};
  for (const row of rows) (byGeneration[row.generation] ||= []).push(row);
  const report = { version: 'candidate24-selection-loss-v1', sourceCommit: process.env.GITHUB_SHA || null,
    generatedAt: new Date().toISOString(), reference, summary: summarize(rows),
    byGeneration: Object.fromEntries(Object.entries(byGeneration).map(([k,v]) => [k,summarize(v)])),
    limitations: [
      'Diagnostic only: missing winning tickets do not establish which prediction rule caused a miss.',
      'Candidate and practical sets need not be nested; net hit difference is not the gross number of omissions.',
      'The original candidate24 cohort includes legacy generations and reconstructed saved sheets.',
      'No rule was selected using these outcomes; no prediction or original record is changed.'
    ], rows };
  const file = path.join(root, 'data/stats/candidate24-selection-loss.json');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({reference, summary: report.summary, byGeneration: report.byGeneration}));
  return report;
}
if (require.main === module) main();
module.exports = { mapRecord, classify, summarize, main };
