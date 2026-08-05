"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "ticket-accordion-render.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "js", "ticket-accordion-bootstrap-v2.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(source, /chappy-ticket-accordion-item/);
assert.match(source, /data-ticket-kind=|dataset\.ticketKind/);
assert.match(source, /label: "本命"/);
assert.match(source, /label: "押さえ"/);
assert.match(source, /label: "流し"/);
assert.match(source, /wrapManshu/);
assert.match(source, /買い目の狙い/);
assert.match(source, /説明・買い目・オッズ/);
assert.match(source, /querySelectorAll\(`\.\$\{ITEM\}\[open\]`\)/);
assert.match(source, /open: true/);
assert.match(source, /open: false/);
assert.match(bootstrap, /MutationObserver/);
assert.match(index, /js\/ticket-accordion-bootstrap-v2\.js\?v=20260805-ticket-accordion-render2/);
assert.doesNotMatch(index, /<script src="js\/ticket-accordion-ui\.js/);

for (const forbidden of [
  "createFormation(",
  "calcRaceFlowIndex(",
  "maximumCount",
  "practicalSelection.tickets ="
]) {
  assert.equal(source.includes(forbidden), false, `表示専用ファイルに予想変更処理が混入: ${forbidden}`);
}

console.log("Ticket accordion UI regression checks: OK");
