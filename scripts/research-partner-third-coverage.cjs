'use strict';
// Bounded replay of a saved first-100 cohort, not a new forward receipt.
const fs = require('node:fs'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const forward = require('./partner-forward.cjs');
const frozen = require('./research-escape-partners.cjs');
const candidate = require('./partner-third-coverage.cjs');
const {assess} = require('./build-race-review-progress');
const {resultOf, chooseOfficialResult} = require('./audit-escape-main.cjs');
const input = require('./analysis-input-contract');
const variants = ['baseline','control','guarded','coverageFirst','thirdGuard'];
function summarize(rows) {
  return Object.fromEntries(variants.map(key => {
    const stake = rows.reduce((n,r) => n+r[key].length*100,0);
    const hits = rows.filter(r => r[key].includes(r.actual));
    const returned = hits.reduce((n,r) => n+r.payout,0);
    return [key,{races:rows.length,hits:hits.length,stake,returned,
      hitRate:rows.length ? hits.length/rows.length*100 : null,
      recoveryRate:stake ? returned/stake*100 : null}];
  }));
}
function replay(root, receipt, bytes) {
  const s = receipt.snapshot, p = forward.protocol(root,s?.method);
  assert(forward.validSeal(receipt,p),'invalid seal');
  assert.equal(forward.hash(bytes),s.sourceSha256,'source SHA mismatch');
  const bundle = JSON.parse(bytes), a = assess(bundle);
  assert(!a.reason,`invalid source: ${a.reason}`);
  assert.equal(a.method,s.method,'method mismatch');
  for (const key of ['raceKey','date','selectedAt','deadlineAt']) assert.equal(a.row[key],s[key],key);
  const row = {baseline:a.row.prediction.practicalTickets,pool:a.row.prediction.candidate24Tickets,
    evidence:a.row.practicalSelectionEvidence,courses:frozen.courseMap(bundle.record.prediction.preRaceConditions?.boats,true)};
  // Only whitelisted pre-race fields enter selection; settlement happens later.
  const selected = candidate.select(row);
  assert(!selected.reason,`selector rejected: ${selected.reason}`);
  for (const key of ['baseline','control','guarded']) assert.deepEqual(selected[key],s[key],`frozen ${key} mismatch`);
  for (const key of variants) {
    assert.equal(selected[key].length,s.baseline.length,'ticket budget mismatch');
    assert.equal(new Set(selected[key]).size,s.baseline.length,'duplicate ticket');
    assert.deepEqual(selected[key].map(t=>t[0]).sort(),s.baseline.map(t=>t[0]).sort(),'head budget mismatch');
    assert(selected.locked.every(t=>selected[key].includes(t)),'locked ticket lost');
  }
  return {raceKey:s.raceKey,sourcePath:s.sourcePath,sourceSha256:s.sourceSha256,snapshotHash:receipt.snapshotHash,
    ...Object.fromEntries(variants.map(key=>[key,selected[key]])),
    thirdGuardApplied:selected.thirdGuardApplied,protectedThirds:selected.protectedThirds,
    incompleteAdditions:selected.incompleteAdditions};
}
function build(root, ref, readAt) {
  const reportPath = 'data/stats/partner-forward-report.json';
  const raw = readAt(reportPath), source = JSON.parse(raw);
  assert(source.version==='partner-forward-report-v2' && source.sealed===100 && source.rows.length===100 && source.target===100,
    'requires completed fixed 100-slot report');
  assert.equal(new Set(source.rows.map(r=>r.snapshot.raceKey)).size,100,'duplicate race');
  const p = forward.protocol(root,source.method);
  assert.equal(p.digest,source.protocolHash,'cohort protocol mismatch');
  assert(source.rows.every(r=>r.snapshot.method===source.method),'mixed methods');
  const rows = source.rows.map(receipt => {
    const s = receipt.snapshot;
    const receiptPath = `data/partner-forward/${s.date}/${s.raceKey}-${forward.hash(forward.json(receipt))}.json`;
    assert.deepEqual(JSON.parse(readAt(receiptPath)),receipt,'receipt differs from report');
    return replay(root,receipt,readAt(s.sourcePath));
  });
  // Candidate generation is complete before any result file is opened.
  const results = new Map(), resultSources = [];
  for (const file of [...new Set(source.rows.map(r=>`data/results/${r.snapshot.date}.json`)), 'data/stats/race-review-results.json']) {
    const bytes = readAt(file), data = JSON.parse(bytes);
    resultSources.push({path:file,sha256:forward.hash(bytes)});
    for (const r of Object.values(data.races || {})) {
      const key=input.raceKey(r);
      results.set(key,chooseOfficialResult(results.get(key),r));
    }
  }
  const settled=[], pending=[], excluded=[];
  for (const row of rows) {
    const result = resultOf(results.get(row.raceKey));
    if (!result) pending.push(row.raceKey);
    else if (result.excluded) excluded.push({raceKey:row.raceKey,reason:result.excluded});
    else settled.push({...row,...result});
  }
  const stats=summarize(settled);
  assert.deepEqual(pending,source.pending,'pending changed');
  assert.deepEqual(excluded,source.excluded,'exclusions changed');
  for (const key of ['baseline','control','guarded']) assert.deepEqual(stats[key],source.stats[key],`saved ${key} accounting mismatch`);
  const comparisons={thirdVsSaved:frozen.compareSelections(settled,'baseline','thirdGuard'),
    thirdVsGuarded:frozen.compareSelections(settled,'guarded','thirdGuard'),
    coverageFirstVsSaved:frozen.compareSelections(settled,'baseline','coverageFirst')};
  return {version:candidate.VERSION,experiment:'retrospective-discovery',generatedAt:new Date().toISOString(),
    inputCommit:ref,sourceReport:{path:reportPath,sha256:forward.hash(raw),generatedAt:source.generatedAt,sourceCommit:source.sourceCommit},
    method:source.method,protocolHash:source.protocolHash,selectorSha256:forward.hash(fs.readFileSync(path.join(root,'scripts/partner-third-coverage.cjs'))),
    frozenSelectorSha256:p.value.selectorSha256,resultSources,sealed:rows.length,replayed:rows.length,pending,excluded,stats,comparisons,
    changedFromSaved:rows.filter(r=>JSON.stringify([...r.baseline].sort())!==JSON.stringify([...r.thirdGuard].sort())).length,
    thirdGuardApplied:rows.filter(r=>r.thirdGuardApplied).length,
    untouchedHoldout:false,usableForPrediction:false,productionChanged:false,automaticApplication:false,
    decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'Hypothesis designed after inspecting these outcomes; no untouched holdout or registered adoption gate'},
    rows:settled};
}
function main() {
  const [ref,out] = process.argv.slice(2), root=path.resolve(__dirname,'..');
  assert(/^[a-f0-9]{40}$/.test(ref || ''),'supply a fixed 40-character input commit');
  const readAt = file => execFileSync('git',['show',`${ref}:${file}`],{cwd:root,maxBuffer:128*1024*1024});
  const report=build(root,ref,readAt);
  if(out) {
    const target=path.resolve(out);
    assert(!target.startsWith(path.join(root,'data')+path.sep),'do not write experimental output into saved data');
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify({...report,rows:undefined},null,2));
}
if(require.main===module)main();
module.exports={summarize,replay,build};
