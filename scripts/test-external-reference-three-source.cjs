'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {sha256,validateCapture,saveCapture,buildReport}=require('./external-reference-three-source.cjs');

function fixture(source='hiyori'){
  const raw=Buffer.from('public pre-race reference fixture');
  return {version:'external-reference-v1',raceKey:'20300930-24-1',source,
    capturedAt:'2030-09-30T17:20:00+09:00',beforeResult:true,
    sourceUrl:'https://example.invalid/public',sourceSha256:sha256(raw),
    features:{attackBoat:3,escapeSecondCandidates:[2,3]},
    productionChanged:false,automaticApplication:false,usableForPrediction:false};
}
function root(){return fs.mkdtempSync(path.join(os.tmpdir(),'external-ref-'));}

test('accepts only the three approved research source ids',()=>{
  for(const s of ['hiyori','macour','br']) assert.equal(validateCapture(fixture(s)).source,s);
  for(const s of ['unknown','omura','']) assert.throws(()=>validateCapture(fixture(s)),/source_invalid/);
});

test('safety locks forbid result-aware or prediction-usable captures',()=>{
  assert.throws(()=>validateCapture({...fixture(),beforeResult:false}),/post_result/);
  assert.throws(()=>validateCapture({...fixture(),usableForPrediction:true}),/safety_lock/);
  assert.throws(()=>validateCapture({...fixture(),automaticApplication:true}),/safety_lock/);
  assert.throws(()=>validateCapture({...fixture(),productionChanged:true}),/safety_lock/);
});

test('immutable storage is source-separated and idempotent',()=>{
  const r=root();
  try{
    const a=saveCapture(r,fixture('hiyori')), b=saveCapture(r,fixture('macour')), c=saveCapture(r,fixture('br'));
    assert.notEqual(a,b);assert.notEqual(b,c);
    assert.equal(saveCapture(r,fixture('hiyori')),a);
    const report=buildReport(r);
    assert.equal(report.totalCaptures,3);
    assert.equal(report.bySource.hiyori.races,1);
    assert.equal(report.bySource.macour.races,1);
    assert.equal(report.bySource.br.races,1);
    assert.equal(report.usableForPrediction,false);
    assert.equal(report.adoptionGate.minimumForwardRacesPerFeature,120);
    assert.equal(report.adoptionGate.humanApprovalRequired,true);
  }finally{fs.rmSync(r,{recursive:true,force:true});}
});
