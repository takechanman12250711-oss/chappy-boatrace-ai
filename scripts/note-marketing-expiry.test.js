'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const e = require('./note-marketing-expiry');
const now = Date.parse('2026-10-06T12:00:00+09:00');
const url = n => `https://note.com/great_robin3243/n/n${n}`;
const expired = {url:url('aa'),deadlineAt:'2026-10-06T11:59:59+09:00'};
const future = {url:url('bb'),deadlineAt:'2026-10-06T12:00:01+09:00'};
test('saved absolute deadline closes the link at equality, never before it',()=>{
  assert.equal(e.deadlineState('2026-10-06T12:00:00+09:00',now-1),'before_deadline');
  assert.equal(e.deadlineState('2026-10-06T12:00:00+09:00',now),'expired');
  assert.equal(e.deadlineState('2026-10-06T12:00:00+09:00',now+1),'expired');
  assert.equal(e.purchaseLinkText(expired,now),e.EXPIRED);
  assert.equal(e.purchaseLinkText(future,now),future.url);
});
test('JST and UTC timestamps describe the same instant, including midnight rollover',()=>{
  const midnight=Date.parse('2026-10-07T00:00:00+09:00');
  for(const deadline of ['2026-10-07T00:00:00+09:00','2026-10-06T15:00:00Z']) {
    assert.equal(e.deadlineState(deadline,midnight-1),'before_deadline');
    assert.equal(e.deadlineState(deadline,midnight),'expired');
  }
  assert.equal(e.deadlineState('2026-10-06T03:00:00.001Z',now),'before_deadline');
});
test('missing, invalid and timezone-less deadlines never generate a purchase link',()=>{
  for (const deadlineAt of [null,undefined,'','12:00','bad','2026-10-06','2026-10-06T12:00:00','2026-99-06T12:00:00+09:00','2026-02-30T12:00:00+09:00','2026-10-06T24:00:00+09:00']) {
    assert.equal(e.purchaseLinkText({url:future.url,deadlineAt},now),e.UNKNOWN);
  }
  assert.equal(e.purchaseLinkText({...future,url:'https://note.com/someone/n/naa'},now),e.UNKNOWN);
  assert.throws(()=>e.purchaseLinkText(future,NaN),/clock_invalid/);
});
test('all expired occurrences disappear, with future and free links retained',()=>{
  const free=url('cc'), official='https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261006&jcd=18&rno=8';
  const text=['期限前',future.url,'結果',expired.url,`元記事 ${expired.url}?x=1`,'公式結果',official,free].join('\n');
  const result=e.indexPurchaseLinks(text,[expired,future],now,{freeUrls:[free]});
  assert(!result.includes(expired.url));assert.equal(result.split(e.EXPIRED).length-1,2);
  assert(result.includes(future.url));assert(result.includes(official));assert(result.includes(free));
  assert.equal(e.indexPurchaseLinks(result,[expired,future],now,{freeUrls:[free]}),result);
});
test('stored course text cannot resurrect an expired or unknown paid article link',()=>{
  const old=url('dd');const text=`コロがしコース\n${expired.url}\n${old}\n${future.url}`;
  const result=e.indexPurchaseLinks(text,[expired,future],now);
  assert(!result.includes(expired.url));assert(!result.includes(old));assert(result.includes(future.url));
  assert(result.includes(e.EXPIRED));assert(result.includes(e.UNKNOWN));
});
test('conflicting row evidence is withheld regardless of row order',()=>{
  const conflict={...expired,deadlineAt:future.deadlineAt};
  for(const rows of [[expired,conflict],[conflict,expired]]) assert.equal(e.indexPurchaseLinks(expired.url,rows,now),e.UNKNOWN);
});
test('rendering is read-only and explains the remaining direct-purchase risk',()=>{
  const rows=[expired,future], before=JSON.stringify(rows);
  e.indexPurchaseLinks(`${expired.url}\n${future.url}`,rows,now);
  assert.equal(JSON.stringify(rows),before);
  assert(e.NOTICE.includes('定期更新'));assert(e.NOTICE.includes('直接URL'));assert(e.NOTICE.includes('販売停止ではない'));
});
// Integration checks run beside the existing marketing renderer.
const c = require('./note-marketing-content');
const config = require('../config/note-marketing.json');
const row = { ...expired, raceKey:'20261006-18-8', articleSeries:'normal', place:'徳山', raceNo:8,
  publishedAt:'2026-10-06T11:50:00+09:00', ticketCount:6, price:200,
  resultUrl:'https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261006&jcd=18&rno=8' };
test('index drops expired purchase URL while retaining race, count and official results',()=>{
  const before=JSON.stringify(row), body=c.indexBody([row],config,now);
  assert(!body.includes(row.url));assert(body.includes('締切済み'));assert(body.includes(row.resultUrl));
  assert(body.includes('徳山8R'));assert(body.includes('実戦厳選6点'));assert(body.includes(e.NOTICE));
  assert.equal(JSON.stringify(row),before);
});
test('index link remains until exact saved deadline and changes without new source data',()=>{
  const deadline=Date.parse(row.deadlineAt);
  const state={rows:[row]}, before=c.publishedIndexBody(state,config,deadline-1), after=c.publishedIndexBody(state,config,deadline);
  assert(before.includes(row.url));assert(!after.includes(row.url));assert.notEqual(c.hash(before),c.hash(after));
});
test('full public index removes paid links inside saved course snapshots without altering snapshot',()=>{
  const state={rows:[row],korogashiIndex:{version:'note-korogashi-index-v1',text:`コロがしコース\n${row.url}\n${url('dd')}\n${config.index.url}`}};
  const before=JSON.stringify(state),body=c.publishedIndexBody(state,config,now);
  assert(!body.includes(row.url));assert(!body.includes(url('dd')));assert(body.includes(config.index.url));
  assert.equal(JSON.stringify(state),before);
});
