"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "home-venue-tap-hotfix.js"),
  "utf8"
);

assert.match(source, /function firstRaceButton\(venue\)/);
assert.match(source, /\.home-v2-race\[data-place\]\[data-race\]:not\(:disabled\)/);
assert.match(source, /function openVenue\(event\)/);
assert.match(source, /target\.closest\("\.home-v2-race\[data-place\]\[data-race\]"\)/);
assert.match(source, /target\.closest\("\[data-open-venue\]"\)/);
assert.match(source, /target\.closest\("\.home-v2-venue\[data-venue\]"\)/);
assert.match(source, /if \(!raceButton\) return/);
assert.match(source, /raceButton\.click\(\)/);
assert.match(source, /document\.addEventListener\("click", openVenue, true\)/);
assert.match(source, /function decorateOfficialVenueSessions\(\)/);
assert.match(source, /official-venue-session-tag/);
assert.match(source, /venueTypeLabel/);
assert.match(source, /ChappyHomeVenueTapHotfix = Object\.freeze\(\{/);
assert.match(source, /openVenue,/);
assert.match(source, /decorateOfficialVenueSessions,/);

console.log("home venue tap hotfix contract passed");
