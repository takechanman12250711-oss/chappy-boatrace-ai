'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { observeSources, captureSources, validateSources } = require('../api/_official-source-capture');
const { captureIndependentOfficialInput } = require('./capture-independent-official-input.cjs');
const at = '2026-01-01T01:00:00.000Z', now = () => Date.parse(at);
const target = { date: '20260101', jcd: '01', raceNo: 1, deadlineAt: '2026-01-01T01:10:00.000Z' };
const text = '<html>公式の原文を空白・改行も含めて保存します。\r\n　６艇展示</html>';
function sources() {
  return ['entry', 'exhibition'].map((role, i) => ({ role, observedAt: at, text,
    url: `https://www.boatrace.jp/owpc/pc/race/${i ? 'beforeinfo' : 'racelist'}?hd=20260101&jcd=01&rno=1` }));
}
function data() { return { ok: true, source: 'boatrace-official', date: target.date, stadiumCode: target.jcd,
  raceNo: 1, fetchedAt: at, historyContext: { mustNotBeCopied: true },
  entries: Array.from({ length: 6 }, (_, i) => ({ boat: i + 1, exhibition: { displayTime: 6.7 + i / 100 } })),
  startExhibition: Array.from({ length: 6 }, (_, i) => ({ boat: i + 1, course: i + 1, st: i / 100,
    mappingSource: 'official-start-image', marker: i === 0 ? 'F' : '' })) }; }
function handler(change = () => {}, changeSources = () => {}) {
  return async (req, res) => { const originals = sources(); changeSources(originals); captureSources(req, originals);
    const response = data(); change(response); res.json(response); };
}
test('exact UTF-8 bytes and SHA survive, with no publication or prediction claim', async () => {
  const out = await captureIndependentOfficialInput(target, { handler: handler(), now });
  assert.equal(out.sources[0].text, text);
  assert.equal(out.sources[0].sha256, createHash('sha256').update(text).digest('hex'));
  assert.equal(out.automaticReady, false); assert.equal(out.publicationReady, false);
  assert.equal(out.historyContext, undefined); assert.equal(out.tickets, undefined);
  assert.equal(out.startExhibition[0].marker, 'F', 'capture does not impose a new F exclusion');
});
test('source observation is opt-in by request identity, never query flags', () => {
  const req = { query: { date: target.date, jcd: '01', rno: '1', captureSources: true } };
  captureSources(req, sources());
  const read = observeSources(req);
  assert.equal(read().status, 'not_captured');
  captureSources({ ...req }, sources()); assert.equal(read().status, 'not_captured');
  captureSources(req, sources()); assert.equal(read().status, 'captured');
  const copy = read(); copy.sources[0].text = 'changed'; assert.equal(read().sources[0].text, text);
  captureSources(req, sources()); assert.equal(read().status, 'capture_failed');
});
for (const [name, mutate] of [
  ['wrong date', s => { s[0].url = s[0].url.replace('20260101', '20260102'); }],
  ['wrong race', s => { s[1].url = s[1].url.replace('rno=1', 'rno=2'); }],
  ['wrong page', s => { s[1].url = s[1].url.replace('beforeinfo', 'racelist'); }],
  ['wrong host', s => { s[0].url = s[0].url.replace('www.boatrace.jp', 'example.com'); }],
  ['duplicate query', s => { s[0].url += '&rno=1'; }],
  ['missing exhibition body', s => { s[1].text = ''; }],
  ['future source time', s => { s[0].observedAt = '2099-01-01T00:00:00Z'; }]
]) test(name + ' fails only the independent capture', async () => {
  await assert.rejects(captureIndependentOfficialInput(target, { handler: handler(() => {}, mutate), now }), /capture_failed/);
});
test('tampered bytes never validate against the original SHA', async () => {
  const out = await captureIndependentOfficialInput(target, { handler: handler(), now });
  out.sources[0].text += ' ';
  assert.throws(() => validateSources(out.sources, target, now()), /source_bytes_invalid/);
});
for (const [name, mutate] of [
  ['incomplete exhibition', d => d.startExhibition.pop()],
  ['wrong response race', d => { d.raceNo = 2; }],
  ['future response', d => { d.fetchedAt = '2026-01-01T01:01:00Z'; }]
]) test(name + ' cannot produce an input packet', async () => {
  await assert.rejects(captureIndependentOfficialInput(target, { handler: handler(mutate), now }), /independent_official_/);
});
test('missing capture and elapsed deadline fail closed without another fetch', async () => {
  await assert.rejects(captureIndependentOfficialInput(target, { handler: async (_req, res) => res.json(data()), now }), /not_captured/);
  let calls = 0;
  await assert.rejects(captureIndependentOfficialInput(target, { handler: async (req, res) => { calls++; await handler()(req, res); },
    now: () => calls ? Date.parse(target.deadlineAt) - 120000 : now() }), /current_deadline_required/);
  assert.equal(calls, 1);
  await assert.rejects(captureIndependentOfficialInput({ ...target, deadlineAt: '2026-01-01T01:02:00Z' }, {
    handler: async () => { calls++; }, now }), /current_deadline_required/);
  assert.equal(calls, 1);
});

// Exercise the real API handler with only its existing I/O dependencies stubbed.
// No network calls, production data writes, model execution or publication.
function apiFixture({ missingBefore = false } = {}) {
  const calls = [], exports = { exports: {} };
  const parsed = data(); delete parsed.ok; delete parsed.source; delete parsed.date;
  delete parsed.stadiumCode; delete parsed.raceNo; delete parsed.fetchedAt; delete parsed.historyContext;
  const dependencies = {
    './_parser': { parseOfficialRaceHtml: () => structuredClone(parsed) },
    './_history': { buildHistoryContext: () => ({ preserved: true }) },
    './_official-start-rank': { attachOfficialStartRanks: async d => d },
    './_original-exhibition': { fetchOriginalExhibition: async () => { calls.push('original-exhibition'); return {}; }, attachOriginalLapTimes: d => d },
    './_official-source-capture': require('../api/_official-source-capture')
  };
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [at])); } static now() { return now(); } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/race.js'), 'utf8'), {
    module: exports, require: name => { assert.ok(dependencies[name], name); return dependencies[name]; },
    Date: FixedDate, Intl, AbortSignal,
    fetch: async url => { calls.push(url); return { ok: !(missingBefore && url.includes('beforeinfo')), status: 503, text: async () => text }; }
  });
  return { handler: exports.exports, calls };
}
test('real API opt-in reuses the same requests and leaves its JSON response unchanged', async () => {
  const normal = apiFixture(); let response;
  await normal.handler({ query: { date: target.date, jcd: '01', rno: '1' } }, {
    setHeader() {}, status() { return this; }, json(value) { response = value; }
  });
  const captured = apiFixture();
  let optInResponse;
  const wrapper = async (req, res) => captured.handler(req, { ...res, json(value) { optInResponse = value; return res.json(value); } });
  const out = await captureIndependentOfficialInput(target, { handler: wrapper, now });
  assert.deepEqual(captured.calls, normal.calls);
  assert.equal(captured.calls.length, 3, 'two existing central pages and the existing original-exhibition helper');
  assert.deepEqual(JSON.parse(JSON.stringify(optInResponse)), JSON.parse(JSON.stringify(response)));
  assert.equal(response.sources, undefined); assert.equal(response.officialSources, undefined);
  assert.equal(out.sources[1].text, text);
});
test('real API partial beforeinfo response still works normally but independent packet is blocked', async () => {
  const fixture = apiFixture({ missingBefore: true }); let response;
  await fixture.handler({ query: { date: target.date, jcd: '01', rno: '1' } }, {
    setHeader() {}, status() { return this; }, json(value) { response = value; }
  });
  assert.equal(response.ok, true); assert.equal(response.beforeInfoAvailable, false);
  await assert.rejects(captureIndependentOfficialInput(target, { handler: fixture.handler, now }), /capture_failed/);
});
