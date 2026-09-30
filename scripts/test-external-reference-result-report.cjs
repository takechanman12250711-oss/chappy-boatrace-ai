'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {saveCapture,sha256}=require('./external-reference-three-source.cjs');
const {build,firstCapturePerSourceRace}=require('./build-external-reference-result-report.cjs');

test('settles only official results and reports candidate/escape diagnostics without applying prediction changes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ext-report-')); try{
  const base={version:'external-reference-v1',raceKey:'20300930-24-1',source:'hiyori',capturedAt:'2030-09-30T10:00:00+09:00',beforeResult:true,sourceUrl:'https://example.invalid',sourceSha256:sha256('x'),features:{signal:'escape70_release50',boat:2},productionChanged:false,automaticApplication:false,usableForPrediction:false};
  saveCapture(root,base); fs.mkdirSync(path.join(root,'data','results'),{recursive:true});
  fs.writeFileSync(path.join(root,'data','results','20300930.json'),JSON.stringify({races:[{raceKey:'20300930-24-1',resultAvailable:true,resultSource:'boatrace-official',resultTicket:'1-2-3',winningMethod:'逃げ'}]}));
  const r=build(root); assert.equal(r.bySource.hiyori.settled,1); assert.equal(r.bySource.hiyori.candidateTop3.hits,1);assert.equal(r.bySource.hiyori.escapeSignal.hits,1);assert.equal(r.usableForPrediction,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('formal evaluation keeps only the first valid forward capture per source and race',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ext-report-')); try{
  const base={version:'external-reference-v1',raceKey:'20300930-24-1',source:'hiyori',capturedAt:'2030-09-30T09:00:00+09:00',beforeResult:true,sourceUrl:'https://example.invalid',sourceSha256:sha256('first'),features:{signal:'escape70_release50',boat:1},productionChanged:false,automaticApplication:false,usableForPrediction:false};
  saveCapture(root,base);
  saveCapture(root,{...base,capturedAt:'2030-09-30T09:30:00+09:00',sourceSha256:sha256('second'),features:{signal:'escape70_release50',boat:2}});
  fs.mkdirSync(path.join(root,'data','results'),{recursive:true});
  fs.writeFileSync(path.join(root,'data','results','20300930.json'),JSON.stringify({races:[{raceKey:'20300930-24-1',resultAvailable:true,resultSource:'boatrace-official',resultTicket:'1-2-3',winningMethod:'逃げ'}]}));
  const r=build(root);
  assert.equal(r.diagnostics.rawValidCaptures,2);
  assert.equal(r.diagnostics.formalCaptures,1);
  assert.equal(r.diagnostics.duplicateCapturesExcluded,1);
  assert.equal(r.bySource.hiyori.captures,1);
  assert.equal(r.rows.length,1);
  assert.equal(r.rows[0].candidate,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('first-capture selection is stable by capturedAt then file',()=>{
 const rows=[
  {source:'hiyori',raceKey:'20300930-24-1',capturedAt:'2030-09-30T10:00:00+09:00',file:'b'},
  {source:'hiyori',raceKey:'20300930-24-1',capturedAt:'2030-09-30T09:00:00+09:00',file:'a'},
  {source:'macour',raceKey:'20300930-20-1',capturedAt:'2030-09-30T09:00:00+09:00',file:'c'}
 ];
 const picked=firstCapturePerSourceRace(rows);
 assert.equal(picked.length,2);
 assert.equal(picked.find(x=>x.source==='hiyori').file,'a');
});
