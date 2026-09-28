'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { tickets, parsePage, hash, buildCapture, saveCapture } = require('./omura-reference.cjs');
const { collect, buildReport, missCategory, loadCaptures } = require('./collect-omura-reference.cjs');
const date = '20300914', raceKey = `${date}-24-6`;
const capturedAt = '2030-09-14T19:48:00+09:00', clock = Date.parse(capturedAt);
const html = () => `<meta charset="utf-8">展示航走後の直前生予想<br>
2030年09月14日<br>6R一般<br>場外締切予定時刻 19:56<br>更新時間:19:47<br>
${[1,2,3,4,6,5].map(b => `<td rowspan='2'>${b}</td><td colspan='7'>合成テスト</td><tr><td>.12</td><td>6.80</td><td>37.00</td><td>6.30</td><td>7.40</td><td>S</td><td>4</td></tr>`).join('')}
[記者の直前予想]<br>【本命】1-26-256<br>【狙い目】2-1-6<br>【短評】合成テスト。`;
function fixture(change = () => {}) {
  const entries = [1,2,3,4,6,5];
  const bundle = { version: 'note-draft-bundle-v1', baselinePracticalTickets: ['1-2-5','1-2-6','1-6-2','1-6-5'], record: {
    publicationPolicy: 'all-races-v1', date, jcd: '24', raceNo: 6, raceKey,
    selectedAt: '2030-09-14T19:46:00+09:00', deadlineAt: '2030-09-14T19:56:00+09:00',
    reviewEvidence: { predictionMode: 'server_pre_deadline', officialResultUsedForPrediction: false },
    exhibitionSnapshot: { version: 'note-exhibition-v1', ready: true, capturedAt: '2030-09-14T19:46:00+09:00',
      entries: entries.map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
      startExhibition: entries.map((boat,i) => ({ boat, course: i+1, st: .12, mappingSource: 'official-start-image' })) },
    prediction: { practicalTickets: ['1-2-5','1-2-6','1-6-2','1-6-5'], mainSheet: { honmei: { boatNo: 1 } } } } };
  change(bundle);
  const bytes = Buffer.from(JSON.stringify(bundle));
  return { bundle, bytes, file: `data/note-drafts/${date}/${raceKey}-${hash(bytes)}.json`, responseBytes: Buffer.from(html()),
    startedAt: '2030-09-14T19:47:58+09:00', capturedAt };
}
function withRoot(fn) { const root = fs.mkdtempSync(path.join(os.tmpdir(),'omura-reference-')); return Promise.resolve().then(()=>fn(root)).finally(()=>fs.rmSync(root,{recursive:true,force:true})); }
function writeBundle(root,input) { fs.mkdirSync(path.dirname(path.join(root,input.file)),{recursive:true}); fs.writeFileSync(path.join(root,input.file),input.bytes); }
test('formation expansion keeps main/aim separate and rejects unknown notation', () => {
  assert.deepEqual(tickets('1-26-256'), ['1-2-5','1-2-6','1-6-2','1-6-5']);
  assert.deepEqual(tickets('1-2=3'), ['1-2-3','1-3-2']);
  assert.deepEqual(tickets('1=2-3'), ['1-2-3','2-1-3']);
  for (const v of ['1-2-3BOX','1-2-3 失敗','1=2=3','1-1-1']) assert.throws(()=>tickets(v));
  assert.deepEqual(tickets('なし',true),[]);
});
test('only identified exhibition-after section is parsed; no prior-day fallback', () => {
  const p = parsePage(Buffer.from(html()),{date,raceNo:6});
  assert.equal(p.raceKey,raceKey); assert.equal(p.exhibition[4].boat,6); assert.equal(p.exhibition[4].course,5);
  assert.deepEqual(p.aimTickets,['2-1-6']);
  for (const bad of [html().replace('2030年','2029年'),html().replace('6R一般','5R一般'),html().replace('展示航走後の直前生予想','前日予想'),html().replace('<td>.12</td>','<td>-</td>')])
    assert.throws(()=>parsePage(Buffer.from(bad),{date,raceNo:6}));
  const pending = `<meta charset="utf-8">展示航走後の直前生予想<div class="tinymce"></div><a href="syussou.php?day=${date}&amp;race=6">出走表へ戻る</a>`;
  assert.equal(parsePage(Buffer.from(pending),{date,raceNo:6}).status,'not_published');
});
test('immutable capture checks source SHA, actual courses, baseline and real clocks', () => {
  const input = fixture(), p = buildCapture(input);
  assert.equal(p.status,'captured'); assert.equal(p.comparison.captureGapSeconds,120);
  assert.equal(p.comparison.equalMainTicketCount,true); assert.equal(p.usableForPrediction,false);
  assert.throws(()=>buildCapture({...input,bytes:Buffer.from('modified')}),/source_invalid/);
  assert.throws(()=>buildCapture({...input,capturedAt:'2030-09-14T19:54:00+09:00'}),/capture_window/);
  assert.throws(()=>buildCapture(fixture(b=>{b.record.reviewEvidence.officialResultUsedForPrediction=true;})),/source_invalid/);
  assert.throws(()=>buildCapture(fixture(b=>{b.baselinePracticalTickets=['1-2-3'];})),/baseline_mismatch/);
  assert.throws(()=>buildCapture(fixture(b=>{b.record.exhibitionSnapshot.startExhibition=[];})),/exhibition/);
  const mismatch = fixture(b=>{b.record.exhibitionSnapshot.entries[0].exhibition.displayTime=6.9;});
  assert.equal(buildCapture(mismatch).status,'exhibition_mismatch');
  assert.equal(buildCapture({...input,responseBytes:Buffer.from(html().replace('更新時間:19:47','更新時間:20:00'))}).status,'source_time_invalid');
});
test('collector saves once, retries no accepted race, and never recaptures past deadlines', () => withRoot(async root => {
  const input = fixture(); writeBundle(root,input); let calls=0;
  const request = async()=>{calls++; return {ok:true,arrayBuffer:async()=>input.responseBytes};};
  const first = await collect({root,now:()=>clock,request});
  assert.equal(first.saved.length,1); assert.equal(first.errors.length,0);
  const original = fs.readFileSync(path.join(root,first.saved[0].file));
  assert.equal((await collect({root,now:()=>clock,request})).saved.length,0); assert.equal(calls,1);
  assert.equal((await collect({root,now:()=>clock+3600000,request})).saved.length,0); assert.equal(calls,1);
  assert.deepEqual(fs.readFileSync(path.join(root,first.saved[0].file)),original);
}));
test('fetch crossing deadline is not stored; HTTP failure is distinct from unpublished', () => withRoot(async root => {
  const input = fixture(); writeBundle(root,input);
  const failed = await collect({root,now:()=>clock,request:async()=>({ok:false,status:403})});
  assert.equal(failed.errors[0].reason,'http_403'); assert.equal(failed.saved.length,0);
  let current=clock;
  const late = await collect({root,now:()=>current,request:async()=>{current+=7*60000;return {ok:true,arrayBuffer:async()=>input.responseBytes};}});
  assert.match(late.errors[0].reason,/capture_window/); assert.equal(late.saved.length,0);
}));
test('reports keep pending null, use official results, isolate ticket-count cohort and voids', () => withRoot(async root => {
  const p=buildCapture(fixture()); saveCapture(p,root);
  assert.equal(buildReport(root,{}).descriptiveAll.chappyHitRate,null);
  const resultFile=path.join(root,'data/results',`${date}.json`); fs.mkdirSync(path.dirname(resultFile),{recursive:true});
  const result={raceKey,jcd:'24',raceNo:6,resultAvailable:true,resultSource:'boatrace-official',resultTicket:'1-2-6'};
  const put = r=>fs.writeFileSync(resultFile,JSON.stringify({races:[r]}));
  put({...result,resultSource:'unverified'}); assert.equal(buildReport(root,{}).pending,1);
  put(result); const report=buildReport(root,{});
  assert.equal(report.descriptiveAll.chappyHits,1); assert.equal(report.sameCountWithinFiveMinutes.races,1);
  assert.equal(report.rows[0].reporterAimHit,false);
  put({...result,void:true}); assert.equal(buildReport(root,{}).voidOrRefundExcluded,1);
  put({...result,refundBoats:[6]}); assert.equal(buildReport(root,{}).descriptiveAll.races,0);
  put({...result,starts:[{boat:6,falseStart:true}]}); assert.equal(buildReport(root,{}).descriptiveAll.races,0);
  const second=structuredClone(p);second.capturedAt='2030-09-14T19:49:00+09:00';second.comparison.equalMainTicketCount=false;saveCapture(second,root);
  put(result);assert.equal(buildReport(root,{}).pairedRaces,1,'no double count or result-based replacement');
  const file=loadCaptures(root).values[0].referencePath; fs.appendFileSync(path.join(root,file),' ');
  assert.equal(buildReport(root,{}).inputIntegrity.complete,false);
}));
test('miss categories identify first missing finishing position', () => {
  assert.equal(missCategory(['2-3-4'],'1-2-3'),'head_missing');
  assert.equal(missCategory(['1-3-4'],'1-2-3'),'second_missing');
  assert.equal(missCategory(['1-2-4'],'1-2-3'),'third_missing');
});
