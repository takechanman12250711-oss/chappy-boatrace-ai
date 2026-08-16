"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "home-venue-tap-hotfix.js"),
  "utf8"
);

assert.match(source, /const OHMURA = "大村"/);
assert.match(source, /const NIGHT_LABEL = "ナイター"/);
assert.match(source, /activeFilter === "morning"/);
assert.match(source, /activeFilter === "night"/);
assert.match(source, /buildOhmuraCard/);
assert.match(source, /ChappyTodayResultsHome\?\.load/);
assert.match(source, /expandVenueForReview/);
assert.match(source, /panel\?\.expandVenue/);
assert.match(source, /firstRaceButton/);
assert.match(source, /if \(raceButton\)/);

console.log("home review/night hotfix contract passed");
