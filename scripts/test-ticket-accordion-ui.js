"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bootstrap = fs.readFileSync(path.join(root, "js", "ticket-accordion-bootstrap-v2.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "js", "prediction-runtime-loader.js"), "utf8");
const accordionUi = fs.readFileSync(path.join(root, "js", "ticket-accordion-ui.js"), "utf8");

assert.match(bootstrap, /disabled:\s*true/);
assert.match(bootstrap, /prediction runtime recovery/);
assert.doesNotMatch(loader, /ticket-accordion-render\.js/);
assert.match(loader, /"js\/render\.js"/);
assert.match(loader, /"js\/final-odds-display\.js"/);
assert.match(loader, /"js\/main-cover-display-boundary\.js"/);
assert.match(
  accordionUi,
  /kind:\s*"flow",[\s\S]*?label:\s*"フォーメーション"/
);
assert.doesNotMatch(
  accordionUi,
  /kind:\s*"flow",[\s\S]*?label:\s*"流し"/
);

console.log("Ticket accordion disabled for recovery: OK");
