"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const owner = fs.readFileSync("js/final-display-owner-v2.js", "utf8");
const ownerCss = fs.readFileSync("css/final-display-controller.css", "utf8");
const structureCss = fs.readFileSync("css/final-mobile-structure11.css", "utf8");
const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const readabilityCss = fs.readFileSync("css/final-readability-fix.css", "utf8");
const manshuCss = fs.readFileSync("css/manshu-formation-fix.css", "utf8");

const nodes = new Map();
const appended = [];
const document = {
  getElementById: id => nodes.get(id) || null,
  createElement(tagName) {
    return { tagName, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } };
  },
  head: { appendChild(node) { nodes.set(node.id, node); appended.push(node); } }
};
const window = { document };
vm.runInNewContext(loader, { window }, { filename: "js/result-void-compat.js" });
const base = nodes.get("chappy-final-mobile-ui-script");
assert.ok(base, "base mobile renderer must be requested");
assert.equal(nodes.has("chappy-final-display-owner"), false, "owner must wait for base renderer load");
base.listeners.load();
const active = nodes.get("chappy-final-display-owner");
assert.ok(active, "single display owner must load after the base renderer");
assert.match(active.src, /^js\/final-display-owner-v2\.js\?v=20260906-practical-tags-manshu-visible1$/);
assert.equal(active.async, false, "owner must preserve script execution order");
assert.deepEqual(appended.filter(n => n.tagName === "script").map(n => n.src.split("?")[0]), [
  "js/final-mobile-ui.js", "js/final-display-owner-v2.js"
], "retired competing renderers must not be loaded");
window.ChappyFinalMobileUi = {};
vm.runInNewContext(loader, { window }, { filename: "js/result-void-compat.js" });
assert.equal(appended.filter(n => n.id === "chappy-final-display-owner").length, 1, "reloading bootstrap must not duplicate the owner");
for (const filename of ["final-mobile-structure11.css", "manshu-formation-fix.css", "final-display-controller.css"]) {
  assert.ok(appended.some(n => n.tagName === "link" && n.href.split("?")[0] === `css/${filename}`), `${filename} must be actively loaded`);
}
for (const hook of ["ensureFormationGroup", "rewritePractical", "rewriteManshu", "decoratePracticalTags", "applyLayout", "decorateMissingOdds"]) {
  assert.ok(owner.includes(hook), `${hook} is required in the active owner`);
}
assert.ok(owner.includes("buildManshuRows"), "exact manshu ticket display source missing");
assert.ok(owner.includes("現在、取得オッズで100倍以上の万舟買い目はありません"), "explicit empty manshu state missing");
assert.ok(owner.includes("実戦厳選"), "practical selection tag missing");
assert.doesNotMatch(owner, /単券1点は万舟欄に表示しません/,
  "single 100x ticket must no longer be suppressed from the manshu display");
assert.match(ownerCss, /\.v3-practical-section\{display:none!important;\}/,
  "duplicated standalone practical section must be hidden");
assert.ok(ownerCss.includes(".chappy-practical-tag"), "practical tag styling missing");

for (const selector of [".v3-race-section", ".v3-boat-evaluation", ".chappy-final-buy-lines", ".v3-missing-numbers"]) {
  assert.ok(structureCss.includes(selector), `${selector} compact styling missing`);
}
assert.ok(structureCss.includes(".chappy-final-buy-reason{display:none!important;}"), "duplicate buy explanation suppression missing");
assert.ok(structureCss.includes(".v3-missing-numbers .v3-formation-reason{display:none!important;}"), "duplicate missing-number explanation suppression missing");
assert.ok(readabilityCss.includes("chappy-race-info-visible"), "race information visibility styling missing");
assert.ok(readabilityCss.includes("chappy-missing-odds"), "missing-number odds visibility styling missing");
for (const selector of [".chappy-manshu-formation-grid", ".chappy-manshu-formation-row", ".chappy-manshu-formation-meta"]) {
  assert.ok(manshuCss.includes(selector), `${selector} styling missing`);
}
require("./test-final-display-ownership.js");
require("./test-final-display-semantics.js");
console.log("active single-owner mobile structure contract: ok");
