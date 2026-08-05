"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "js/ticket-accordion-bootstrap-v2.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "js/ticket-accordion-render.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "js/prediction-runtime-loader.js"), "utf8");

assert.match(index, /ticket-accordion-bootstrap-v2\.js\?v=20260805-ticket-accordion-render2/);
assert.doesNotMatch(index, /<script src="js\/ticket-accordion-ui\.js/);
assert.match(bootstrap, /MutationObserver/);
assert.match(bootstrap, /ticket-accordion-render\.js\?v=/);
assert.match(renderer, /findFormationGroup\(container, "本線"\)/);
assert.match(renderer, /findFormationGroup\(container, "押さえ"\)/);
assert.match(renderer, /findFormationGroup\(container, "流し"\)/);
assert.match(renderer, /querySelectorAll\("\.v3-main-newspaper \.v3-formation-group"\)/);
assert.doesNotMatch(renderer, /nth-of-type/);
assert.match(renderer, /買い目の狙い/);
assert.match(renderer, /説明・買い目・オッズ/);
assert.match(renderer, /item !== current\) item\.open = false/);
assert.match(loader, /"js\/render\.js",\s*\n\s*"js\/ticket-accordion-render\.js"/);

console.log("Ticket accordion render path: OK");
