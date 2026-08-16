"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "home-venue-tap-hotfix.js"),
  "utf8"
);

assert.doesNotMatch(source, /prediction\.js/);
assert.doesNotMatch(source, /ai-core\.js/);
assert.doesNotMatch(source, /style\.css/);
assert.doesNotMatch(source, /MutationObserver/);
assert.doesNotMatch(source, /venueObserver/);
assert.doesNotMatch(source, /ChappyTodayResultsHome/);
assert.doesNotMatch(source, /activeFilter/);
assert.doesNotMatch(source, /OHMURA/);
assert.match(source, /function firstRaceButton\(venue\)/);
assert.match(source, /document\.addEventListener\("click", openVenue, true\)/);
assert.match(source, /raceButton\.click\(\)/);

console.log("home venue tap hotfix keeps the restored entry path minimal and UI-neutral");
