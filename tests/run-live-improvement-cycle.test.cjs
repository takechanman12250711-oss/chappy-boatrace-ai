'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const runner=require('../scripts/run-live-improvement-cycle.cjs');
const pipeline=require('../scripts/build-learning-analysis-pipeline.js');
const idx=pipeline.steps.indexOf('run-live-improvement-cycle.cjs');
assert.ok(idx>=0,'live improvement runner must be in the existing fixed learning pipeline');
assert.ok(idx<pipeline.steps.indexOf('build-learning-pipeline-gate.js'),'live improvement evidence must refresh before the existing decision gate');
assert.equal(pipeline.steps.filter(x=>x==='run-live-improvement-cycle.cjs').length,1,'live improvement runner must execute once per pipeline cycle');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-live-cycle-'));
try{
 const file=path.join(tmp,'report.json');
 let saved=runner.writeStable(file,{generatedAt:'2026-09-19T00:00:00Z',summary:{matchedRows:22}});
 assert.equal(saved.changed,true);
 saved=runner.writeStable(file,{generatedAt:'2026-09-19T01:00:00Z',summary:{matchedRows:22}});
 assert.equal(saved.changed,false,'timestamp-only refresh must not create duplicate evidence');
 saved=runner.writeStable(file,{generatedAt:'2026-09-19T02:00:00Z',summary:{matchedRows:23}});
 assert.equal(saved.changed,true,'new matched evidence must update the artifact');
 assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).summary.matchedRows,23);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('live improvement central runner contract passed');
