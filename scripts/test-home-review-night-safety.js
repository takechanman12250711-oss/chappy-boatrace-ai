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
assert.match(source, /MutationObserver\(queueClassificationPatch\)/);
assert.match(source, /venueObserver\.observe\(host, \{ childList: true, subtree: true \}\)/);

console.log("home review/night hotfix keeps prediction and global UI untouched");
