"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const home = read("js/home-dashboard-v2.js");
const race = read("js/script.js");
const runtime = read("js/app-runtime-loader.js");
const style = read("style.css");
const mobile = read("css/final-mobile-ui.css");
const reference = read("css/final-reference-layout.css");

assert.doesNotMatch(html, /home-venue-tap-hotfix|outer-attack-ticket-shadow-guard/);
assert.match(html, /id="officialRacePicker" class="official-race-picker">/);
assert.equal((html.match(/class="select-field legacy-race-select-field" hidden/g) || []).length, 2);

const shellSource = home.slice(home.indexOf("function ensureShell"), home.indexOf("function renderRecommendations"));
assert.match(shellSource, /home-v2-recommend/);
assert.doesNotMatch(shellSource, /home-v2-filter-shell|home-v2-schedule|data-home-venues|data-open-venue/);
assert.match(home, /setView\("home"\)/);
assert.doesNotMatch(reference, /home-v2-recommend[^{]*\{[^}]*display\s*:\s*none/is);

const requiredGroup = runtime.slice(runtime.indexOf("function requiredGroup"), runtime.indexOf("function preloadGroupForTarget"));
assert.doesNotMatch(requiredGroup, /matches\("\.bottom-nav-item"\)\)return""/);
assert.match(requiredGroup, /view==="race"/);
assert.match(race, /view === "race"[\s\S]*applyRaceMode\(\)/);
assert.match(race, /official-venue-session-tag/);
const loadVenues = race.slice(race.indexOf("async function loadVenueChoices"), race.indexOf("async function loadRaceChoices"));
const emptyVenues = loadVenues.indexOf("if (!venues.length)");
assert.ok(emptyVenues >= 0 && loadVenues.indexOf("renderOfficialVenuePicker", emptyVenues) >= 0);
assert.match(style, /official-venue-session-tag\[data-session="morning"\]/);
assert.match(style, /official-venue-session-tag\[data-session="night"\]/);
assert.match(mobile, /official-race-grid\s*\{\s*display:grid;\s*grid-template-columns:repeat\(4/is);

const window = { addEventListener() {} };
window.window = window;
const document = {
  readyState: "loading",
  addEventListener() {},
  getElementById() { return null; }
};
vm.runInNewContext(race, { window, document, console }, { filename: "js/script.js" });

const controls = window.ChappyRaceControls;
assert.deepEqual({ ...controls.venueSession("三国") }, { key: "morning", label: "モーニング" });
assert.deepEqual({ ...controls.venueSession("大村") }, { key: "night", label: "ナイター" });
assert.deepEqual({ ...controls.venueSession("戸田") }, { key: "day", label: "デイ" });

const rows = controls.officialRaceRows({
  selectedVenue: { races: [{ raceNo: 3, status: "closed", deadline: "10:10" }] }
});
assert.equal(rows.length, 12);
assert.deepEqual(Array.from(rows, row => row.raceNo), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
assert.equal(rows[2].deadline, "10:10");
assert.equal(rows[0].selectable, false);

console.log("home/race root contract tests passed");
