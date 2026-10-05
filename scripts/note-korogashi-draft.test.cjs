'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { VERSION, buildDraft, renderDraft } = require('./note-korogashi-draft.cjs');
const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'korogashi-test-'));
test.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
const now = Date.parse('2030-09-28T14:00:00+09:00');
const iso = n => new Date(n).toISOString();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const picks = ['1-2-3', '1-2-4'];

// Synthetic inputs only; no fixtures go into a live note queue.
function fixture(rno = 1, tickets = picks, payout = 1001) {
  const planned = Date.parse(`2030-09-28T${10 + rno}:00:00+09:00`), deadline = planned + 600000;
  const raceKey = `20300928-15-${rno}`, capturedAt = iso(planned - 180000);
  const bundle = { version: 'note-draft-bundle-v1', capturedAt,
    baselinePracticalTickets: tickets.map(ticket => ({ ticket, odds: 20 })),
    record: { raceKey, date: '20300928', jcd: '15', place: '丸亀', raceNo: rno,
      selectedAt: capturedAt, deadlineAt: iso(deadline), prediction: { practicalTickets: tickets },
      exhibitionSnapshot: { version: 'note-exhibition-v1', ready: true, capturedAt,
        entries: [1,2,3,4,5,6].map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
        startExhibition: [1,2,3,4,5,6].map(boat => ({ boat, course: boat, st: 0.12, mappingSource: 'official-start-image' })) } } };
  const bytes = JSON.stringify(bundle), sourceSha256 = sha(bytes);
  const sourcePath = `data/note-drafts/20300928/${raceKey}-${sourceSha256}.json`;
  fs.mkdirSync(path.dirname(path.join(rootDir, sourcePath)), { recursive: true });
  fs.writeFileSync(path.join(rootDir, sourcePath), bytes);
  return { sourcePath, plannedAt: iso(planned), receipt: { version: 'note-publication-receipt-v1',
    price: 200, raceKey, sourceSha256, url: `https://note.com/great_robin3243/n/nabc${rno}`,
    publishedAt: iso(planned - 120000), verifiedAt: iso(planned - 60000) },
  result: { ok: true, source: 'boatrace-official', date: '20300928', jcd: '15', raceNo: rno,
    checkedAt: iso(deadline + 600000), resultAvailable: true, status: 'finished', void: false,
    resultUrl: `https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20300928&jcd=15&rno=${rno}`,
    trifecta: { combination: '1-2-3', payout },
    finishers: [{ rank: 1, boat: 1 }, { rank: 2, boat: 2 }, { rank: 3, boat: 3 }], starts: [] } };
}
const plan = (legs, more = {}) => ({ version: VERSION, targetYen: 100000, maxLegs: 3, legs, ...more });
const build = input => buildDraft(input, { rootDir, now });

test('exact funds across changing ticket counts; original order, cents, sources and inputs survive', () => {
  const input = plan([fixture(), fixture(2, [...picks, '1-3-2'])]), before = JSON.stringify(input);
  const sources = input.legs.map(l => fs.readFileSync(path.join(rootDir, l.sourcePath), 'utf8'));
  const out = build(input);
  assert.equal(out.initialYen, 2000);
  assert.equal(out.legs[0].payoutYen, 10010);
  assert.deepEqual(out.legs[1].allocations.map(a => a.stakeYen), [3400,3300,3300]);
  assert.equal(out.legs[1].remainderYen, 10);
  assert.equal(out.balanceYen, 34044);
  assert.equal(out.netBeforeFeesYen, 32044);
  assert.equal(out.status, 'ready_for_next');
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(input.legs.map(l => fs.readFileSync(path.join(rootDir, l.sourcePath), 'utf8')), sources);
  for (const leg of out.legs) assert.equal(leg.allocations.reduce((n,a) => n + a.stakeYen,0) + leg.remainderYen, leg.openingYen);
});
test('10/20/30万円 are separate fixed targets; no goal change or continuation after attainment', () => {
  for (const targetYen of [100000,200000,300000]) {
    const first = fixture(1,picks,targetYen/10), out = build(plan([first], {targetYen}));
    assert.equal(out.balanceYen,targetYen);
    assert.equal(out.status,'target_reached');
    assert.equal(out.netBeforeFeesYen,targetYen-2000);
    assert.throws(() => build(plan([first,fixture(2)],{targetYen})), /continuation_blocked/);
  }
});
test('all first tickets cost 1,000 yen; miss stops even with saved cash remainder', () => {
  const first=fixture(), second=fixture(2,['2-1-3','2-1-4']);
  const out=build(plan([first,second]));
  assert.equal(out.status,'stopped_miss');
  assert.equal(out.balanceYen,10);
  assert.equal(out.netBeforeFeesYen,-1990);
  assert.throws(()=>build(plan([first,second,fixture(3)])),/continuation_blocked/);
});
test('2 or 3 includes the first race; an explicit no-candidate ending keeps the balance', () => {
  const out=build(plan([fixture(),fixture(2)],{maxLegs:2,targetYen:1000000}));
  assert.equal(out.status,'stopped_max_legs');
  const stopped=build(plan([fixture()],{stopReason:'no_suitable_race'}));
  assert.equal(stopped.status,'stopped_no_suitable_race');
  assert.equal(stopped.balanceYen,10010);
  const three=build(plan([fixture(),fixture(2),fixture(3)],{targetYen:1000000}));
  assert.equal(three.status,'stopped_max_legs');
  assert.throws(()=>build(plan([fixture(),fixture(2),fixture(3)],{maxLegs:2})),/leg_count/);
});
test('unresolved, void, refund, dead heat and foreign evidence never become zero payout or fund the next race', () => {
  for (const [mutate,expected] of [
    [l=>delete l.result,'waiting_result'],
    [l=>{l.result.void=true;l.result.status='void';},'stopped_void'],
    [l=>{l.result.refunds=[6];},'review_required'],
    [l=>{l.result.finishers.push({rank:3,boat:4});},'review_required'],
    [l=>{l.result.jcd='24';},'review_required'],
    [l=>{l.result.checkedAt=l.plannedAt;},'review_required'],
    [l=>{l.result.trifecta.payout=Number.MAX_SAFE_INTEGER;},'amount_invalid']
  ]) {
    const first=fixture(); mutate(first);
    if(expected==='amount_invalid') { assert.throws(()=>build(plan([first])),/amount_invalid/); continue; }
    const out=build(plan([first]));
    assert.equal(out.status,expected);assert.equal(out.balanceYen,null);assert.equal(out.legs[0].payoutYen,null);
    assert.throws(()=>build(plan([first,fixture(2)])),/continuation_blocked/);
  }
});
test('chronology, duplicate races, changed receipt, amount limits and deadline protection cannot be bypassed', () => {
  const first=fixture(), second=fixture(2);
  first.result.checkedAt=iso(Date.parse(second.plannedAt)+1);
  assert.throws(()=>build(plan([first,second])),/previous_result_not_available/);
  assert.throws(()=>build(plan([fixture(),fixture()])),/duplicate_race/);
  for(const mutate of [
    l=>{l.sourcePath='../outside.json';},
    l=>{l.receipt.sourceSha256='a'.repeat(64);},
    l=>{l.receipt.articleSeries='manshu';},
    l=>{l.plannedAt='2030-09-28T15:00:00+09:00';},
    l=>{l.plannedAt='2030-09-28T11:08:00+09:00';},
    l=>{l.receipt.verifiedAt='2030-09-28T11:01:00+09:00';}
  ]) {const leg=fixture();mutate(leg);assert.throws(()=>build(plan([leg])));}
  for(const change of [{targetYen:0},{targetYen:NaN},{targetYen:150000},{maxLegs:4},{legs:[]},{stopReason:'restart_after_loss'}]) {
    assert.throws(()=>build(plan([fixture()],change)));
  }
});
test('no arbitrary reduction of saved picks to fit the budget or seven-ticket limit', () => {
  assert.throws(()=>build(plan([fixture(1,picks,10),fixture(2)])),/insufficient_funds/);
  const eight=['1-2-3','1-2-4','1-2-5','1-2-6','1-3-2','1-3-4','1-3-5','1-3-6'];
  assert.throws(()=>build(plan([fixture(1,eight)])),/ticket_count/);
});
test('review label, full-risk notice and fees accompany amounts; it cannot claim publication or purchases', () => {
  const leg=fixture();delete leg.result;
  const out=build(plan([leg])), text=renderDraft(out);
  assert.equal(out.canPublish,false);assert.equal(out.preRaceCommitVerified,false);assert.equal(out.purchaseExecuted,false);
  assert(text.indexOf('全額再投入') < text.indexOf('1 → 2 → 3'));
  for(const phrase of ['目標 100,000円','開始資金 2,000円','1 → 2 → 3：1,000円','未確定',
    '利益額ではありません','記事代','全額再投入','追加入金はしません','実購入・運用実績を証明するものではありません']) assert(text.includes(phrase),phrase);
  assert.throws(()=>require('./note-github-ui-transport').requirePublicationGate(out,rootDir,now));
});
test('CLI uses the actual clock, rejects future input and exposes no publication switch', () => {
  const leg=fixture();leg.plannedAt=iso(Date.now()+86400000);
  const file=path.join(rootDir,'session.json');fs.writeFileSync(file,JSON.stringify(plan([leg])));
  const cli=path.join(__dirname,'note-korogashi-draft.cjs');
  const run=spawnSync(process.execPath,[cli,'--input',file],{cwd:rootDir,encoding:'utf8'});
  assert.equal(run.status,1);assert.match(run.stderr,/future_plan/);assert.equal(run.stdout,'');
  const override=spawnSync(process.execPath,[cli,'--input',file,'--now','2030-09-28'],{cwd:rootDir,encoding:'utf8'});
  assert.equal(override.status,1);assert.match(override.stderr,/usage/);
});
