"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const schedule = require("../api/schedule");

// Shape verified against the existing official daily index on 2026-10-07:
// https://www.boatrace.jp/owpc/pc/race/index?hd=20261007
// 三国 was daytime G1, 鳴門 morning, and 若松 midnight that day.
function officialRow({ jcd = "10", grade = "G1b", session = "", status = "最終Ｒ発売終了" } = {}) {
  return `<tbody><tr><td>場名</td><td colspan="3">${status}</td>
    <td rowspan="2" class="${grade ? `is-${grade}` : ""}"></td>
    <td rowspan="2"${session ? ` class="${session}"` : ""}></td>
    <td class="is-alignL"><a href="/owpc/pc/race/raceindex?jcd=${jcd}&amp;hd=20261007">検証用大会</a></td>
    <td><a href="/owpc/pc/race/racelist?rno=12&amp;jcd=${jcd}&amp;hd=20261007">出走表</a></td>
    </tr></tbody>`;
}

for (const [className, expected] of [["is-morning", "morning"], ["is-nighter", "night"], ["is-midnight", "midnight"], ["is-summer", "summer"], ["", "day"]]) {
  assert.equal(schedule.parseEventSession(officialRow({ session: className })), expected);
}
for (const session of ["is-unknown", "is-morning-extra", "is-morning is-nighter", "is-morning is-unknown"]) {
  assert.equal(schedule.parseEventSession(officialRow({ session })), "", "unknown or conflicting timeband is not daytime");
}
assert.equal(schedule.parseEventSession('<tbody><a href="/owpc/pc/race/racelist?jcd=10&rno=1">出走表</a></tbody>'), "");
assert.equal(schedule.parseEventSession(officialRow().replace('<td rowspan="2"></td>', '')), "", "missing timeband cell must not consume grade cell");
assert.equal(schedule.parseEventSession(officialRow({ grade: "" }).replace('<td rowspan="2"></td>', '')), "", "blank grade with missing timeband is not evidence of daytime");
assert.equal(schedule.parseEventSession(officialRow().replace('<td rowspan="2"></td>', '<td></td>')), "", "changed row structure fails unknown");
assert.equal(schedule.parseEventSession(officialRow().replace('<td rowspan="2"></td>', '<td rowspan="2">未発表</td>')), "");
assert.equal(schedule.parseEventSession(officialRow({ session: "is-morning" }).replace('class="is-morning"></td>', 'class="is-morning">未発表</td>')), "");
assert.equal(schedule.parseEventSession(officialRow({ session: "is-midnight" }).replace('<td colspan="3">最終Ｒ発売終了</td>', '<td rowspan="2">発売中</td><td>10R</td><td rowspan="2">投票</td>')), "midnight", "unmerged open-race status columns retain the same logical timeband column");
const nowMs = Date.parse("2026-10-07T10:00:00+09:00");
const fixture = officialRow() + officialRow({ jcd: "14", grade: "ippan", session: "is-morning" }) +
  officialRow({ jcd: "20", grade: "", session: "is-midnight" });
const parsed = schedule.parseVenues(fixture, "20261007", nowMs);
assert.deepEqual(parsed.map(v => [v.jcd, v.eventSession, v.eventGrade, v.status]), [
  ["10", "day", "G1", "closed"], ["14", "morning", "一般", "closed"], ["20", "midnight", "", "closed"]
]);
for (const [input, expected] of [["SG", "SG"], ["PG1b", "PG1"], ["G1b", "G1"], ["G2b", "G2"], ["G3b", "G3"], ["ippan", "一般"], ["unexpected", ""]]) {
  assert.equal(schedule.parseVenues(officialRow({ grade: input }), "20261007", nowMs)[0].eventGrade, expected);
}

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.className = "";
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this._text = "";
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      toggle: (name, on) => {
        const present = this.classList.contains(name);
        if (on === undefined ? !present : on) this.classList.add(name);
        else this.className = this.className.split(/\s+/).filter(v => v !== name).join(" ");
      }
    };
  }
  set innerHTML(value) { this.children = []; this._text = value; }
  get innerHTML() { return this._text; }
  set textContent(value) { this.children = []; this._text = value; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  get options() { return this.children; }
  get selectedIndex() { return this.children.findIndex(child => child.value === this.value); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  closest() { return null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(selector.startsWith(".") && child.classList.contains(selector.slice(1)) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createRuntime() {
  const ids = ["officialVenueGrid", "officialScheduleStatus", "officialRacePanel", "officialSelectedVenue", "officialEventGrade", "officialRaceGrid", "officialSelectedRace", "officialRaceLink", "placeSelect", "raceSelect", "fetchRaceBtn", "raceModeSelect", "dateInput", "statusArea"];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements.placeSelect.value = "三国";
  elements.raceModeSelect.value = "review";
  elements.dateInput.value = "2026-10-07";
  const listeners = {};
  const requests = [];
  const window = { setTimeout, clearTimeout, addEventListener(name, callback) { listeners[name] = callback; } };
  const document = {
    readyState: "loading", getElementById(id) { return elements[id] || null; },
    createElement(tagName) { return new Element(tagName); }, addEventListener() {},
    querySelectorAll() { return []; }, querySelector() { return null; }
  };
  let source = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");
  // Access private functions only inside this VM; do not expand the production API.
  source = source.replace("      venueSession,", "      venueSession, venueGrade, renderOfficialVenuePicker, loadVenueChoices, loadRaceChoices, beginRaceSelection,");
  vm.runInNewContext(source, {
    window, document, console, AbortController, setTimeout, clearTimeout,
    fetch(url) { const request = deferred(); requests.push({ url, ...request }); return request.promise; }
  });
  return { elements, listeners, requests, api: window.ChappyRaceControls, selection: window.ChappyRaceSelection };
}

async function main() {
  const { api, elements } = createRuntime();
  assert.equal(api.venueSession("三国", parsed[0]).label, "デイ", "daily official hours override usual morning venue");
  assert.equal(api.venueSession("三国").label, "通常モーニング");
  assert.equal(api.venueSession("若松", parsed[2]).key, "night", "midnight belongs to night filter group");
  assert.equal(api.venueSession("戸田", { eventSession: "summer" }).key, "day");
  assert.equal(api.venueSession("戸田", { eventSession: "toString" }).source, "usual");
  assert.equal(api.venueGrade({ eventGrade: "" }), "確認中");
  assert.equal(api.venueGrade({ eventGrade: "unknown" }), "確認中");
  assert.equal(api.venueGrade(null), "—");

  api.renderOfficialVenuePicker({ venues: parsed }, "review");
  const grid = elements.officialVenueGrid;
  assert.equal(grid.children.length, 24, "all 24 venues remain visible");
  assert.equal(new Set(grid.children.map(node => node.dataset.jcd)).size, 24);
  for (const button of grid.children) {
    assert.deepEqual(button.children.map(node => node.className), ["official-venue-name", "official-venue-meta", "official-venue-status"]);
    const tags = button.children[1].children;
    assert.equal(tags.length, 2, "same timeband then grade positions on every venue");
    assert.ok(tags[0].classList.contains("official-venue-session-tag"));
    assert.ok(tags[1].classList.contains("official-venue-grade"));
    assert.ok(button.attributes["aria-label"].includes("グレード"));
  }
  const mikuni = grid.children.find(button => button.dataset.jcd === "10");
  assert.equal(mikuni.querySelector(".official-venue-grade").textContent, "G1");
  assert.equal(mikuni.querySelector(".official-venue-status").textContent, "開催終了", "grade never hides ended state");
  assert.equal(mikuni.disabled, false, "ended venues remain selectable in review mode");
  assert.equal(mikuni.attributes["aria-pressed"], "true");
  const wakamatsu = grid.children.find(button => button.dataset.jcd === "20");
  assert.equal(wakamatsu.querySelector(".official-venue-session-tag").textContent, "ミッドナイト");
  assert.equal(wakamatsu.querySelector(".official-venue-grade").textContent, "確認中");
  const toda = grid.children.find(button => button.dataset.jcd === "02");
  assert.equal(toda.disabled, true);
  assert.equal(toda.querySelector(".official-venue-grade").textContent, "—");
  assert.equal(toda.querySelector(".official-venue-status").textContent, "開催なし");
  assert.equal(toda.dataset.sessionSource, "usual");

  api.renderOfficialVenuePicker({ venues: parsed }, "live");
  assert.ok(grid.children.every(button => button.disabled));
  assert.equal(elements.officialRacePanel.hidden, true, "no stale race panel after all venues end");
  assert.equal(elements.officialEventGrade.textContent, "—");
  const active = parsed.map(venue => ({ ...venue, status: "before_deadline", finalClosed: false, selectable: true }));
  api.renderOfficialVenuePicker({ venues: active, nextRace: { jcd: "20" } }, "live");
  assert.equal(grid.children.find(button => button.dataset.jcd === "10").attributes["aria-pressed"], "true", "highlight follows selected venue, not unrelated next race");
  assert.equal(grid.children.find(button => button.dataset.jcd === "20").attributes["aria-pressed"], "false");

  // Success and failure from an older date/navigation must not touch newer UI.
  for (const reject of [false, true]) {
    for (const navigate of [false, true]) {
      const runtime = createRuntime();
      const pending = runtime.api.loadVenueChoices();
      if (navigate) runtime.listeners["chappy:view-changed"]({ detail: { view: "stats" } });
      else runtime.elements.dateInput.value = "2026-10-06";
      runtime.elements.officialVenueGrid.textContent = "newer choice";
      const request = runtime.requests[0];
      if (reject) request.reject(new Error("old schedule failed"));
      else request.resolve({ ok: true, json: async () => ({ ok: true, venues: parsed }) });
      assert.equal(await pending, false);
      assert.equal(runtime.elements.officialVenueGrid.textContent, "newer choice");
    }
  }
  for (const reject of [false, true]) {
    const runtime = createRuntime();
    const pending = runtime.api.loadRaceChoices();
    runtime.api.beginRaceSelection();
    runtime.elements.placeSelect.value = "若松";
    runtime.elements.statusArea.textContent = "newer venue";
    if (reject) runtime.requests[0].reject(new Error("old venue failed"));
    else runtime.requests[0].resolve({ ok: true, json: async () => ({ ok: true, selectedVenue: { races: [] } }) });
    assert.equal(await pending, false);
    assert.equal(runtime.elements.statusArea.textContent, "newer venue");
  }
  for (const navigate of [false, true]) {
    const runtime = createRuntime();
    const supplied = deferred();
    const pending = runtime.selection.select({ mode: "review", date: "20261007", place: "三国", raceNo: 1, schedulePromise: supplied.promise });
    const rejected = assert.rejects(pending, error => error.name === "AbortError" && error.staleSelection === true);
    await Promise.resolve();
    if (navigate) runtime.listeners["chappy:view-changed"]({ detail: { view: "stats" } });
    else runtime.elements.dateInput.value = "2026-10-06";
    runtime.elements.placeSelect.value = "若松";
    runtime.elements.raceSelect.value = "8R";
    supplied.resolve({ ok: true, selectedVenue: { jcd: "10", races: [] } });
    await rejected;
    assert.equal(runtime.elements.placeSelect.value, "若松", "delayed explicit selection does not overwrite new venue");
    assert.equal(runtime.elements.raceSelect.value, "8R");
    assert.equal(runtime.requests.length, 0, "stale explicit selection does not restore old selection or send more requests");
  }
  {
    const runtime = createRuntime();
    const pending = runtime.api.loadVenueChoices();
    runtime.requests[0].reject(new Error("current schedule failed"));
    await assert.rejects(pending, /current schedule failed/, "current request errors still surface");
  }

  // Additive timeband parsing reuses one index request and preserves cache policy.
  const originalFetch = global.fetch;
  let fetchCount = 0;
  try {
    global.fetch = async () => { fetchCount += 1; return { ok: true, text: async () => fixture }; };
    const response = { headers: {}, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, json(value) { this.body = value; return this; } };
    await schedule({ query: { date: "20261007" } }, response);
    assert.equal(response.code, 200);
    assert.equal(fetchCount, 1, "timeband does not add per-venue HTTP calls");
    assert.equal(response.body.venues.length, 3);
    assert.equal(response.body.venues[2].eventSession, "midnight");
    assert.ok(response.headers["Cache-Control"].includes("s-maxage="));
  } finally { global.fetch = originalFetch; }
  console.log("venue metadata, fixed 24-entry markup, daily timeband, and stale selection tests passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
