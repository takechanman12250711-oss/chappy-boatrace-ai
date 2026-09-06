"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const refresh = fs.readFileSync("js/final-display-owner-v2.js", "utf8");
const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
let observerCallback, install;
let frameQueue = [];
function missingRow(ticket) {
  const badges = [];
  return {
    badges,
    querySelector(selector) {
      if (selector === ".v3-formation-ticket") return {textContent:ticket};
      if (selector === ".chappy-missing-odds") return badges[0] || null;
      if (selector === ".v3-formation-tags") return {appendChild(node){badges.push(node);}};
      return null;
    }
  };
}
let currentRows = [missingRow("1-2-3"), missingRow("1-2-4")];
const area = {
  querySelector(){return null;},
  querySelectorAll(selector){return selector === ".v3-missing-numbers .v3-formation-row" ? currentRows : [];}
};
const window = {
  document: {
    documentElement: {},
    body:{classList:{add(){}}},
    getElementById(id){return id === "resultArea" ? area : null;},
    querySelector(){return null;},
    createElement(){return {dataset:{}};}
  },
  MutationObserver: function(callback){observerCallback=callback;this.observe=function(){};},
  setInterval(callback){install=callback;return 1;},
  clearInterval(){},
  setTimeout(){return 1;},
  requestAnimationFrame(callback){frameQueue.push(callback);},
  renderAll(prediction){return prediction;}
};
vm.runInNewContext(refresh,{window});
install();
const api = window.ChappyFinalDisplayOwner;
const first = {odds:{"1-2-3":31.6}};
window.renderAll(first);
const mutation = [{addedNodes:[{nodeType:1,matches(){return true;}}]}];
observerCallback(mutation);
observerCallback(mutation);
assert.equal(frameQueue.length,1,"async DOM replacements must share one scheduled refresh");
frameQueue.shift()();
assert.equal(currentRows[0].badges[0].textContent,"31.6倍");
assert.equal(currentRows[0].badges[0].dataset.ticket,"1-2-3");
assert.equal(currentRows[1].badges[0].textContent,"オッズ未取得");
assert.match(currentRows[1].badges[0].className,/is-missing/);
api.decorateMissingOdds(first);
assert.equal(currentRows[0].badges.length,1,"repeated refresh must not duplicate odds badges");
currentRows = [missingRow("1-2-3")];
window.renderAll({odds:{"1-2-3":44.2}});
observerCallback(mutation);
frameQueue.shift()();
assert.equal(currentRows[0].badges[0].textContent,"44.2倍","async replacement must use the latest race prediction");
api.decorateMissingOdds({});
assert.equal(currentRows[0].badges[0].textContent,"オッズ未取得","stale odds must be cleared when unavailable");
window.ChappyFinalMobileUi={buildOddsMap(){return new Map([["1-2-3",58.8]]);}};
api.decorateMissingOdds({});
assert.equal(currentRows[0].badges[0].textContent,"58.8倍","use the shared odds resolver when available");
observerCallback([{addedNodes:[{nodeType:1,matches(){return false;},querySelector(){return null;}}]}]);
assert.equal(frameQueue.length,0,"unrelated DOM updates must not schedule a refresh");
assert.match(loader,/final-display-owner-v2\.js/);
assert.doesNotMatch(loader,/js\/final-missing-odds-refresh\.js/);
console.log("active owner async missing-number odds refresh: ok");
