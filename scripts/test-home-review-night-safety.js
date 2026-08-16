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
assert.match(source, /chappy:home-schedule/);
assert.match(source, /queueClassificationPatch/);

console.log("home review/night hotfix keeps UI untouched without continuous DOM observation");
