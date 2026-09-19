'use strict';
const assert = require('node:assert/strict');
const {buildReport} = require('./build-candidate24-report');
const {classify, summarize, mapRecord} = require('./analyze-candidate24-selection-loss');
assert.equal(classify(['1-2-3'], ['1-2-3'], '1-2-3'), 'both-hit');
assert.equal(classify(['1-2-3'], ['1-3-2'], '1-2-3'), 'candidate-only-hit');
assert.equal(classify(['1-3-2'], ['1-2-3'], '1-2-3'), 'practical-only-hit');
assert.equal(classify(['2-1-3'], ['3-1-2'], '1-2-3'), 'candidate-head-missing');
assert.equal(classify(['1-3-2'], ['3-1-2'], '1-2-3'), 'candidate-first-second-pair-missing');
assert.equal(classify(['1-2-4'], ['3-1-2'], '1-2-3'), 'candidate-third-missing');
const record = {raceKey:'20260901-01-1',date:'20260901',selectedAt:'2026-09-01T01:00:00Z',deadlineAt:'2026-09-01T02:00:00Z',
 prediction:{candidate24Tickets:['1-2-3'],practicalTickets:['1-3-2']}};
const result = {date:'20260901',jcd:'01',raceNo:1,source:'boatrace-official',resultAvailable:true,trifecta:{combination:'1-2-3',payout:1000}};
const observations = [];
const report = buildReport([record,{...record,selectedAt:'2026-09-01T02:01:00Z'},
 {...record,selectedAt:'2026-09-01T01:01:00Z',prediction:{...record.prediction,candidate24Tickets:['1-3-2'],practicalTickets:['1-2-3']}}],
 [result], row=>observations.push(row));
assert.equal(observations.length,1,'latest valid pre-deadline record only');
assert.equal(report.practical.hits,1);
assert.equal(report.candidate24.hits,0);
assert.equal(classify(observations[0].pool,observations[0].practical,result.trifecta.combination),'practical-only-hit');
for (const invalid of [{...result,refund:true},{...result,resultAvailable:false},{...result,source:'unofficial'},
 {...result,trifecta:{combination:'1-2-3',payout:0}}]) {
 let called=false;buildReport([record],[invalid],()=>{called=true;});assert.equal(called,false);
}
const s=summarize([
 {classification:'candidate-only-hit',payoutPer100:1000,practicalOutsideCandidate:[],exclusionReasons:[]},
 {classification:'practical-only-hit',payoutPer100:2000,practicalOutsideCandidate:['1-2-3'],exclusionReasons:[]}
]);
assert.equal(s.netHitDifference,0);
assert.equal(s.counts['candidate-only-hit'],1,'net zero must not hide gross omissions');
assert.equal(s.nonSubsetRaces,1);
assert.equal(s.recordedExclusionReasons['reason-not-recorded'],1);
assert.equal(mapRecord(record).generation,'unrecorded','never infer current generation for old records');
console.log('Candidate24 selection-loss audit tests passed');
