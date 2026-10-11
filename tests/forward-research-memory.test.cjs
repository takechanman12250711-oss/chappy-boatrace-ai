'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const input = require('../scripts/analysis-input-contract.js');
const exp = require('../scripts/analyze-ticket-expansion-7-12-18-24.cjs');
const { compactForwardResearchRecord: compact } = require('../scripts/report-input-projection.cjs');
const f = require('./helpers/report-input-fixture.cjs');
const targets = [
  'audit-combined-three-rescue-forward-v1.cjs', 'audit-forward-data-completeness-v1.cjs',
  'audit-head11-score90-forward-v1.cjs', 'audit-second-place-rank9-forward-v1.cjs',
  'audit-third-place-rank8-goodscore-forward-v1.cjs', 'analyze-role-ticket-shadow-v1.cjs',
  'analyze-role-ticket-special-trigger-v1.cjs', 'analyze-role-ticket-marginal-cap-v1.cjs',
  'analyze-prerace-theory-context-v1.cjs', 'analyze-prerace-theory-outcomes-v1.cjs',
  'run-new-head-prospective-shadow.cjs', 'analyze-rescue-subgroup-forward-shadow-v1.cjs',
  'analyze-counter-hole-pair-forward-shadow-v1.cjs', 'evaluate-outer-head-forward-shadow-v1.cjs'
];
const modules = targets.map(name => require('../scripts/' + name));
function record(raceNo = 1, date = '20261003') {
  const r = f.prediction(raceNo, date);
  r.prediction.practicalTickets = ['1-2-3','1-2-4','1-2-5','1-3-2','1-3-4','1-4-2','1-4-3'];
  r.prediction.practicalSelection.targetDecisions = [{ scenarioSummary: '攻め', candidateDecisions:
    ['1-2-6','1-5-2','2-1-3','3-1-2','5-1-2','6-1-2'].map((ticket, i) => ({ ticket, score: 96-i })) }];
  r.prediction.preRaceConditions.boats = Array.from({ length: 6 }, (_, i) => ({
    boatNo: i+1, attackStrength: 6-i, raceFlowPower: i, totalScore: i+50, exhibitionST: i/100
  }));
  r.prediction.preRaceConditions.weather = { windSpeed: 2, waveHeight: 2 };
  return r;
}
function prepareOuter(root, records) {
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data/stats'), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '../config/outer-head-forward-shadow-v1.json'), path.join(root, 'config/outer-head-forward-shadow-v1.json'));
  fs.writeFileSync(path.join(root, 'data/stats/local-water-priority-selector-shadow-replay.json'), JSON.stringify({ switchedRaces: records.map((r, i) => ({
    date: r.date, jcd: r.jcd, raceNo: r.raceNo, venue: 'fixture', currentHead: 1, shadowHead: 5,
    actualHead: i % 2 ? 1 : 5, shadowOuterPromotion: true, rescuedOuterWinner: i % 2 === 0,
    scoreImprovement: 2, conditionBand: i % 3 ? 'calm' : 'strong'
  })) }));
}
function snapshot(root) {
  return JSON.stringify(['predictions','results'].map(dir => fs.readdirSync(path.join(root,'data',dir)).map(name => fs.readFileSync(path.join(root,'data',dir,name),'utf8'))));
}
function parity(root) {
  const before = snapshot(root);
  for (let i=0;i<modules.length;i++) {
    const raw = f.comparable(modules[i].build({ root, compactPredictionRecord: null }));
    const projected = f.comparable(modules[i].build({ root }));
    assert.deepEqual(projected, raw, targets[i] + ': all report fields, cohort diagnostics and decisions');
    for (const flag of ['productionChanged','automaticApplication','usableForPrediction']) assert.equal(projected[flag], false);
  }
  assert.equal(snapshot(root), before, 'all original source bytes preserved');
}
// Nonempty complete builds, frozen-window boundaries, hits/misses, missing
// payout, water bands, tie ordering and first-vs-last duplicate contracts.
f.withArchive(root => {
  const records=[];
  for(const date of ['20260831','20260901','20260902','20261003']) {
    const rows=Array.from({length:12},(_,i)=>record(i+1,date));
    rows[1].prediction.preRaceConditions.boats[0].attackStrength=null;
    rows[2].prediction.preRaceConditions.weather={wind:6,wave:8};
    rows[3].prediction.preRaceConditions.weather={}; rows[3].prediction.preRaceConditions.windSpeed=4;
    rows[4].prediction.preRaceConditions.boats[0].boatNo=0;
    rows[5].prediction.preRaceConditions.boats[1].raceFlowPower=5;
    rows[6].prediction.preRaceConditions.boats[2].totalScore='99';
    rows[7].selectedAt=rows[7].deadlineAt;
    const duplicate=f.clone(rows[0]); duplicate.prediction.practicalTickets=['6-5-4'];
    const excluded=f.clone(rows[8]); excluded.isRetrospective=true;
    const verification=f.clone(rows[8]);
    const actuals=['1-2-3','1-2-6','1-5-2','3-1-2','5-1-2','6-5-4'];
    const results=rows.map((r,i)=>f.official(r,actuals[i%6],i===5?0:1200+i*2000));
    results[10].source='untrusted'; results[11].resultAvailable=false;
    f.saveDay(root,date,[...rows,duplicate,excluded],[verification],results);records.push(...rows);
  }
  prepareOuter(root,records);parity(root);
  assert.ok(modules[0].build({root}).settledRaceCountAfterActivation>0);
  assert.ok(modules[5].build({root}).eligibleSettledRaceCount>0);
  assert.ok(modules[9].build({root}).completeSignalRaceCount>0);
  assert.ok(modules[13].build({root}).totalForwardPromotionRows>0);
});
// Preserve every fallback shape, candidate source, score alias and scenario.
const changes=[
  r=>{Object.assign(r,r.prediction);delete r.prediction;},
  ...[null,false,0,'',[],{}].map(v=>r=>{r.preRaceConditions=r.prediction.preRaceConditions;r.prediction.preRaceConditions=v;}),
  r=>{r.practicalSelection=r.prediction.practicalSelection;delete r.prediction.practicalSelection;},
  r=>{r.frameRiseFallReplayBasis=r.prediction.practicalSelection.frameRiseFallReplayBasis;delete r.prediction.practicalSelection.frameRiseFallReplayBasis;},
  r=>{r.prediction.practicalSelection.frameRiseFallReplayBasis={};r.frameRiseFallReplayBasis={analyses:[f.analysis(5)]};},
  r=>{r.capturedAt=r.selectedAt;r.selectedAt='';r.savedAt='2026-09-01T01:00:00Z';r.prediction.selectedAt='invalid';r.prediction.savedAt=r.createdAt;},
  r=>{r.prediction.practicalTickets=[{ticket:{combination:'1-2-3'},score:null},{boats:[2,3,4],effectiveScore:'98'},[3,4,5]];},
  r=>{r.practicalTickets=[{ticket:'1-2-3',score:999}];r.prediction.tickets=[{ticket:'6-5-4',priorityScore:92}];r.prediction.formations={main:['6-4-2'],mainline:['2-6-1'],cover:['3-6-1'],flow:['4-6-1'],hole:['5-6-1']};},
  r=>{r.prediction.practicalSelection.targetDecisions[0].bestCandidateTicket={ticket:'2-4-6',candidateScore:95};r.prediction.practicalSelection.expansionSummary={addedTickets:[{ticket:'2-6-4',selectionScore:95,reason:'差し'}]};},
  r=>{r.prediction.preRaceConditions.sourceFetchedAt=r.deadlineAt;},
  r=>{r.prediction.preRaceConditions.schemaVersion='bad';},
  r=>{r.prediction.preRaceConditions.officialResultUsed=true;},
  r=>{r.raceKey='20261003-21-1';}
];
for(const change of changes) f.withArchive(root=>{
  const r=record();change(r);const before=structuredClone(r),projected=compact(r);
  assert.deepEqual(exp.collectTicketPool(projected),exp.collectTicketPool(r));
  assert.equal(input.raceKey(projected),input.raceKey(r));
  assert.equal(input.preDeadlineReason(projected),input.preDeadlineReason(r));
  assert.deepEqual(r,before);
  f.saveDay(root,'20261003',[r],[],[f.official(record(),'3-1-2')]);prepareOuter(root,[record()]);parity(root);
});
// Same 168 MiB corpus through every actual build in a separate 96 MiB process.
// The unchanged full-record path is a negative control for both loader families.
f.withArchive(root=>{
  const records=[],payload='unused-snapshot-'.repeat(65536);
  for(let day=1;day<=28;day++) {
    const date='202610'+String(day).padStart(2,'0');
    const rows=Array.from({length:6},(_,i)=>{const r=record(i+1,date);r.prediction.unusedSnapshot=payload;return r;});
    f.saveDay(root,date,rows);records.push(...rows.map(r=>({date:r.date,jcd:r.jcd,raceNo:r.raceNo})));
  }
  prepareOuter(root,records);
  for(let i=0;i<targets.length;i++) {
    const src=`const m=require(${JSON.stringify(path.resolve(__dirname,'../scripts',targets[i]))});const options={root:${JSON.stringify(root)}};if(process.argv[1]==='full')options.compactPredictionRecord=null;const r=m.build(options);if(r.productionChanged!==false)throw Error('unsafe');process.stdout.write(JSON.stringify(r));`;
    const run=mode=>spawnSync(process.execPath,['--max-old-space-size=96','-e',src,mode],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,env:{...process.env,NODE_OPTIONS:''}});
    const small=run('compact');assert.equal(small.error,undefined);assert.equal(small.status,0,targets[i]+': '+small.stderr);
    const out=JSON.parse(small.stdout);const count=out.settledRaceCountAfterActivation??out.counts?.settledAfterActivation??out.eligibleSettledRaceCount??out.diagnostics?.forwardEligibleSettledCount??out.diagnostics?.prospectiveSettledRaceCount??out.totalForwardPromotionRows;
    assert.equal(count,168,targets[i]+': no silent loss of rows');
    if(i===0||i===13){const full=run('full');assert.equal(full.error,undefined);assert.notEqual(full.status,0);assert.match(full.stderr,/heap out of memory|Reached heap limit|Allocation failed/i);}
  }
});
console.log('14 forward reports: exact full-report parity, frozen inputs/order/eligibility, source preservation, 96 MiB builds and both negative controls passed');
