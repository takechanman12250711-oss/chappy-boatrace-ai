"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const bootstrap = fs.readFileSync(path.join(root, "js/ticket-accordion-bootstrap-v2.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "js/prediction-runtime-loader.js"), "utf8");
const accordionRender = fs.readFileSync(path.join(root, "js/ticket-accordion-render.js"), "utf8");

assert.doesNotMatch(loader, /"js\/ticket-accordion-render\.js"/);
assert.match(loader, /20260823-three-course-134-v1/);
assert.match(bootstrap, /disabled:\s*true/);
assert.doesNotMatch(bootstrap, /MutationObserver/);
assert.doesNotMatch(bootstrap, /ticket-accordion-render\.js\?v=/);
assert.match(
  accordionRender,
  /kind:\s*"flow",[\s\S]*?label:\s*"フォーメーション"/
);
assert.doesNotMatch(
  accordionRender,
  /kind:\s*"flow",[\s\S]*?label:\s*"流し"/
);
assert.match(
  accordionRender,
  /findFormationGroup\(container,\s*"流し"\)/,
  "旧保存表示の見出し探索だけは互換fallbackとして残す"
);

console.log("Prediction runtime recovery path: OK");
