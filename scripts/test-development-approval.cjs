'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../js/development-approval');
const SHA = 'a'.repeat(40), OTHER = 'b'.repeat(40), MAIN = 'c'.repeat(40);
const selected = api.target('1234', SHA);
const repo = api.REPOSITORY;
const origin = 'https://example.test/chappy/index.html';
function pull(overrides = {}) {
  return { number: 1234, html_url: `https://github.com/${repo}/pull/1234`,
    url: `https://api.github.com/repos/${repo}/pulls/1234`, title: '保存診断を維持',
    body: '変更内容\n検査結果: fixture pass', state: 'open', draft: false, merged: false,
    base: { ref: 'main', sha: MAIN, repo: { full_name: repo } },
    head: { sha: SHA, repo: { full_name: repo } }, ...overrides };
}
function response(data = pull()) { return { ok: true, json: async () => data }; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(fetch = async () => response(), environment = {}) {
  const state = { values: ['1234', SHA], open: true, shown: [], cleared: [], pending: 0, requests: [] };
  const view = { values: () => state.values, isOpen: () => state.open,
    clear: text => state.cleared.push(text), pending: () => state.pending++,
    show: (...args) => state.shown.push(args) };
  const controller = api.createController(view, { href: () => origin, AbortController,
    fetch: (...args) => { state.requests.push(args); return fetch(...args); }, ...environment });
  return { state, controller };
}

test('only a positive PR number and exact 40-digit hexadecimal head identify a target', () => {
  assert.deepEqual(api.target('1234', SHA.toUpperCase()), selected);
  for (const pr of ['', '0', '-1', '1.2', '01', '1e3', '1234567890', 'https://github.com/x/y/pull/1', '<script>']) assert.equal(api.target(pr, SHA), null);
  for (const head of ['', 'a'.repeat(39), 'a'.repeat(41), 'z'.repeat(40), 'javascript:alert(1)', `${SHA}/x`]) assert.equal(api.target('1', head), null);
});
test('share links use the actual page origin/path, contain only the explicit target, and reject dangerous locations', () => {
  const shared = api.shareUrl(`${origin}?unknown=secret#raceSection`, selected);
  const url = new URL(shared);
  assert.equal(url.origin, new URL(origin).origin); assert.equal(url.pathname, '/chappy/index.html');
  assert.deepEqual([...url.searchParams], [['developmentPr', '1234'], ['developmentHead', SHA]]);
  assert.equal(url.hash, '#resultSection'); assert.deepEqual(api.queryTarget(shared), { requested: true, target: selected });
  for (const href of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/index.html', 'https://user:password@example.test/']) assert.equal(api.shareUrl(href, selected), null);
  for (const suffix of [`developmentPr=1234&developmentHead=${SHA}&developmentHead=${OTHER}`, 'developmentPr=1234', `developmentPr=javascript:alert(1)&developmentHead=${SHA}`]) {
    assert.deepEqual(api.queryTarget(`${origin}?${suffix}`), { requested: true, target: null });
  }
});
test('GitHub response identity, repository, base, state and fixed head all fail closed', () => {
  const good = api.validatePullRequest(pull(), selected);
  assert.equal(good.url, `https://github.com/${repo}/pull/1234`); assert.equal(good.main, MAIN);
  for (const mutate of [
    p => { p.number = 1235; }, p => { p.number = '1234'; },
    p => { p.html_url = 'javascript:alert(1)'; }, p => { p.html_url += '?redirect=https://evil.test'; },
    p => { p.url = 'https://api.github.com/repos/other/repo/pulls/1234'; },
    p => { p.base.repo.full_name = 'other/repo'; }, p => { p.head.repo.full_name = 'other/repo'; },
    p => { p.base.ref = 'release'; }, p => { p.base.sha = ''; },
    p => { p.head.sha = OTHER; }, p => { delete p.head; },
    p => { p.state = 'closed'; }, p => { p.merged = true; }
  ]) { const broken = pull(); mutate(broken); assert.throws(() => api.validatePullRequest(broken, selected)); }
  assert.match(api.validatePullRequest(pull({ draft: true }), selected).state, /Draft/);
  assert.match(good.state, /GitHubで確認/);
});
test('PR description is bounded text, with no CI/review or approval claim inferred', () => {
  const body = '<script>alert(1)</script>\n```mermaid\nflowchart TD\n```' + 'x'.repeat(13000);
  const result = api.validatePullRequest(pull({ title: '<img src=x onerror=alert(1)>', body }), selected);
  assert.equal(result.title, '<img src=x onerror=alert(1)>'); assert.ok(result.body.length < 12100);
  assert.ok(result.body.startsWith('<script>')); assert.match(result.body, /続きはGitHub/);
  assert.equal(Object.hasOwn(result, 'approved'), false); assert.equal(Object.hasOwn(result, 'ciPassed'), false);
});
test('controller starts without communication and checks only the fixed GitHub GET endpoint', async () => {
  const { state, controller } = harness();
  assert.equal(state.requests.length, 0); assert.equal(controller.canOpen(), false);
  assert.equal(await controller.check(), true); assert.equal(state.requests.length, 1);
  const [url, options] = state.requests[0];
  assert.equal(url, `https://api.github.com/repos/${repo}/pulls/1234`);
  assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
  assert.equal(controller.canOpen(), true); assert.equal(state.shown.length, 1);
});
test('invalid target, stale head, HTTP/JSON and network failures never enable a link', async () => {
  for (const fetch of [
    async () => response(pull({ head: { sha: OTHER, repo: { full_name: repo } } })),
    async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw Error('bad JSON'); } }),
    async () => { throw Error('network unavailable'); }
  ]) {
    const { state, controller } = harness(fetch);
    assert.equal(await controller.check(), false); assert.equal(state.shown.length, 0); assert.equal(controller.canOpen(), false);
  }
  const { state, controller } = harness(); state.values = ['javascript:1', SHA];
  assert.equal(await controller.check(), false); assert.equal(state.requests.length, 0);
});
test('editing either target value invalidates a checked link even without an input event', async () => {
  for (const values of [['1235', SHA], ['1234', OTHER]]) {
    const { state, controller } = harness(); await controller.check();
    state.values = values; assert.equal(controller.canOpen(), false);
  }
});
test('late old response cannot overwrite a newer target or restore a link after editing', async () => {
  const old = deferred(), fresh = deferred(); let count = 0;
  const { state, controller } = harness(() => count++ ? fresh.promise : old.promise);
  const first = controller.check();
  state.values = ['1235', OTHER]; controller.invalidate();
  const next = controller.check();
  const p = pull({ number: 1235, html_url: `https://github.com/${repo}/pull/1235`, url: `https://api.github.com/repos/${repo}/pulls/1235`, head: { sha: OTHER, repo: { full_name: repo } } });
  fresh.resolve(response(p)); assert.equal(await next, true);
  old.resolve(response()); assert.equal(await first, false);
  assert.equal(state.shown.length, 1); assert.equal(state.shown[0][0].pr, 1235);
  const pending = deferred(), other = harness(() => pending.promise);
  const task = other.controller.check(); other.state.values[1] = OTHER; other.controller.invalidate();
  pending.resolve(response()); assert.equal(await task, false); assert.equal(other.state.shown.length, 0);
});
test('closing during a request or after verification requires a fresh explicit check', async () => {
  const pending = deferred(), { state, controller } = harness(() => pending.promise);
  const task = controller.check(); state.open = false; controller.invalidate();
  pending.resolve(response()); assert.equal(await task, false); assert.equal(state.shown.length, 0);
  state.open = true; assert.equal(controller.canOpen(), false);
});
test('a hanging request times out at 12 seconds, aborts and permits an explicit retry', async () => {
  let timeout, duration, cleared = 0;
  const { state, controller } = harness(() => new Promise(() => {}), {
    setTimeout(callback, ms) { timeout = callback; duration = ms; return 9; },
    clearTimeout(id) { assert.equal(id, 9); cleared++; }
  });
  const task = controller.check(); assert.equal(duration, 12000); timeout();
  assert.equal(await task, false); assert.equal(state.requests[0][1].signal.aborted, true);
  assert.match(state.cleared.at(-1), /12秒/); assert.equal(cleared, 1); assert.equal(state.shown.length, 0);
  const retry = controller.check(); assert.equal(state.requests.length, 2); timeout(); assert.equal(await retry, false);
});

// Minimal DOM fixture exercises real installation/listeners; no browser package or network.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.events = {}; this.value = ''; this.open = false; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  set href(value) { this.setAttribute('href', value); } get href() { return this.getAttribute('href'); }
  set textContent(value) { this.text = String(value); this.children = []; } get textContent() { return (this.text || '') + this.children.map(c => c.textContent).join(''); }
  addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
  fire(name) { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const cb of this.events[name] || []) cb(event); return event; }
  click() { return this.fire('click'); }
  scrollIntoView() {}
  all() { return [this, ...this.children.flatMap(child => child.all())]; }
  querySelector(selector) {
    if (selector === '[data-development-approval-body]') return this.all().find(n => n.bodyMarker) || null;
    return null;
  }
}
function dom(href = origin) {
  const doc = new Element('document'); doc.head = doc.appendChild(new Element('head')); doc.body = doc.appendChild(new Element('body')); doc.readyState = 'complete';
  doc.createElement = tag => new Element(tag); doc.getElementById = id => doc.all().find(n => n.id === id) || null;
  const result = doc.body.appendChild(new Element('section')); result.id = 'resultSection'; result.hidden = true;
  const stats = result.appendChild(new Element('div')); stats.id = 'statsArea';
  const panel = result.appendChild(new Element('details')); panel.id = 'developmentApprovalPanel';
  const body = panel.appendChild(new Element('div')); body.bodyMarker = true;
  // Existing nav clicks can be captured and delayed indefinitely by stats loading.
  const nav = new Element('a'); let navClicks = 0; nav.addEventListener('click', () => { navClicks++; });
  doc.querySelector = selector => selector === '.bottom-nav-item[data-view="result"]' ? nav : null;
  let fetchCalls = 0; let responder = async () => response();
  let viewCalls = 0;
  const win = { document: doc, location: { href }, AbortController, fetch(...args) { fetchCalls++; return responder(...args); },
    ChappyHomeDashboardV2: { setView(view) { assert.equal(view, 'result'); viewCalls++; result.hidden = false; } } };
  return { win, doc, panel, body, stats, result, get fetchCalls() { return fetchCalls; }, get navClicks() { return navClicks; }, get viewCalls() { return viewCalls; }, setFetch(fn) { responder = fn; },
    open() { panel.open = true; panel.fire('toggle'); }, close() { panel.open = false; panel.fire('toggle'); } };
}
test('DOM installation and opening remain network-free, lazy, idempotent and outside stats redraws', () => {
  const d = dom(); api.install(d.win); api.install(d.win);
  assert.equal(d.fetchCalls, 0); assert.equal(d.body.children.length, 0); assert.equal(d.doc.head.children.length, 0);
  d.open(); assert.equal(d.fetchCalls, 0); assert.equal(d.doc.head.children.length, 1);
  assert.equal(d.body.all().filter(n => n.tagName === 'OL').length, 1);
  assert.equal(d.body.all().find(n => n.tagName === 'A').getAttribute('href'), null);
  const count = d.body.children.length; d.close(); d.open(); assert.equal(d.body.children.length, count);
  d.stats.textContent = 'stats rerender'; assert.equal(d.body.children.length, count);
});
test('shared iPhone target opens via existing result navigation without fetching or acting as approval', async () => {
  const d = dom(api.shareUrl(origin, selected)); api.install(d.win);
  assert.equal(d.viewCalls, 1); assert.equal(d.navClicks, 0); assert.equal(d.result.hidden, false); assert.equal(d.panel.open, true); assert.equal(d.fetchCalls, 0);
  assert.equal(d.doc.getElementById('developmentApprovalPr').value, '1234');
  assert.equal(d.doc.getElementById('developmentApprovalHead').value, SHA);
  const form = d.body.all().find(n => n.tagName === 'FORM'); form.fire('submit'); await flush();
  const link = d.body.all().find(n => n.tagName === 'A'); assert.equal(d.fetchCalls, 1);
  assert.equal(link.href, `https://github.com/${repo}/pull/1234`); assert.equal(link.click().prevented, false);
  assert.equal(d.fetchCalls, 1); assert.match(d.body.textContent, /承認・CI合格・レビュー済みを示すものではありません/);
  d.doc.getElementById('developmentApprovalHead').value = OTHER;
  assert.equal(link.click().prevented, true); assert.equal(link.href, null);
});
test('untrusted title/body render only as text and input edits immediately remove links', async () => {
  const d = dom(api.shareUrl(origin, selected)); d.setFetch(async () => response(pull({ title: '<img src=x onerror=alert(1)>', body: '<script>bad()</script>\n```mermaid\nflowchart TD\n```' })));
  api.install(d.win); d.body.all().find(n => n.tagName === 'FORM').fire('submit'); await flush();
  assert.equal(d.body.all().filter(n => ['IMG', 'SCRIPT', 'SVG'].includes(n.tagName)).length, 0);
  assert.match(d.body.textContent, /<script>bad\(\)<\/script>/);
  const input = d.doc.getElementById('developmentApprovalPr'); input.value = '1235'; input.fire('input');
  for (const link of d.body.all().filter(n => n.tagName === 'A')) assert.equal(link.href, null);
});
test('invalid shared target initializes an explanatory card without any fetch', () => {
  const d = dom(`${origin}?developmentPr=1234&developmentHead=javascript:alert(1)`); api.install(d.win);
  assert.equal(d.panel.open, true); assert.equal(d.fetchCalls, 0); assert.match(d.body.textContent, /共有リンクの対象が不正/);
});
test('HTML placement, startup and CI preserve the existing lazy public prediction surface', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="statsArea"><\/div><\/article><\/div><details id="developmentApprovalPanel">/);
  assert.match(html, /data-development-approval-body><\/div><\/details><\/section><\/main>/);
  assert.doesNotMatch(html, /<link[^>]+development-approval/);
  const script = fs.readFileSync(path.join(root, 'js/development-approval.js'), 'utf8');
  assert.doesNotMatch(script, /localStorage|sessionStorage|innerHTML|ChappyHiyori|ChappyTheory|createPrediction|\.merge\(/);
  assert.doesNotMatch(script, /api\.github\.com.*(?:check-runs|reviews|merge)/);
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/check-development-approval.yml'), 'utf8');
  assert.match(workflow, /contents: read/); assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /sparse-checkout:/);
  assert.doesNotMatch(workflow, /schedule:|cron:|pull_request_target|contents: write|secrets\./);
});
