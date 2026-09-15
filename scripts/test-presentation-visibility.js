"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Same practical-only 4-1-2 as the reported screen: all ten selections must
// remain in the dedicated panel, including tickets absent from normal bets.
let fallback = null, panel = null;
const box = {
  querySelector: () => fallback,
  insertAdjacentHTML(_where, html) { fallback = { html, remove() { fallback = null; } }; }
};
const area = {
  querySelector(selector) { return selector === ".chappy-practical-visible-panel" ? panel : selector === ".chappy-final-buy-summary" ? box : null; },
  querySelectorAll(selector) {
    if (selector === ".chappy-practical-visible-panel") return panel ? [panel] : [];
    if (selector === ".chappy-final-buy-group.is-practical-fallback") return fallback ? [fallback] : [];
    return [];
  }
};
box.insertAdjacentHTML = function(where, html) {
  if (where === "afterend") panel = { html, remove() { panel = null; } };
  else fallback = { html, remove() { fallback = null; } };
};
const document = {
  getElementById: id => id === "resultArea" ? area : {},
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, body: {classList:{add(){}}}
};
const window = {document, addEventListener(){}, setInterval(){}, clearInterval(){}, setTimeout(){}};
const context = vm.createContext({window});
vm.runInContext(fs.readFileSync("js/final-display-owner-v2.js","utf8"),context);
vm.runInContext(fs.readFileSync("js/final-practical-visible-panel.js","utf8"),context);
const tickets = ["3-1-2","3-1-5","3-1-6","3-2-1","3-2-5","1-2-3","1-2-4","1-3-4","4-1-2","3-1-4"];
const prediction = {practicalSelection:{tickets:tickets.map(ticket=>({ticket}))}};
const snapshot = JSON.stringify(prediction);
window.ChappyFinalDisplayOwner.ensurePracticalFallback(prediction);
assert.ok(fallback, "Retain fallback if the dedicated panel has not rendered");
window.ChappyPracticalVisiblePanel.render(prediction);
assert.equal(fallback,null,"Dedicated panel removes previously rendered fallback");
assert.ok(panel.html.includes("10点"));
for(const ticket of tickets) assert.ok(panel.html.includes(">"+ticket+"</strong>"),ticket);
window.ChappyFinalDisplayOwner.ensurePracticalFallback(prediction);
assert.equal(fallback,null,"Later owner/observer callbacks must not reinsert the duplicate");
window.ChappyPracticalVisiblePanel.render(prediction);
assert.ok(panel.html.includes("10点"));
assert.equal(fallback,null);
assert.equal(JSON.stringify(prediction),snapshot);

// Exercise the actual home renderer before/after asynchronous collection.
const home = fs.readFileSync("js/home-dashboard-v2.js","utf8");
const start = home.indexOf("  function renderRecommendations(");
const end = home.indexOf("  function renderUpdatedAt",start);
const section = {}, list = {}, shell = {querySelector:s=>s === ".home-v2-recommend" ? section : list};
const state = {recommendations:[],initialDataReady:false,renderKeys:{recommendations:""}};
const homeContext = vm.createContext({
  state, scheduleRecommendationExpiry(){}, ensureShell:()=>shell,
  stable:JSON.stringify, recommendationHtml:item=>item.place
});
vm.runInContext(home.slice(start,end)+"\nthis.render=renderRecommendations;",homeContext);
homeContext.render(true);
assert.equal(shell.hidden,true,"No empty recommendation heading during initial load");
state.initialDataReady=true;
homeContext.render(true);
assert.equal(shell.hidden,true,"No heading flash when collection finishes empty");
state.recommendations=[{place:"鳴門"}];
homeContext.render();
assert.equal(shell.hidden,false,"Real candidates must remain available");
assert.equal(list.innerHTML,"鳴門");
state.recommendations=[];
homeContext.render();
assert.equal(shell.hidden,true,"Expired or removed candidates hide the empty section");
console.log("Practical-only tickets retained once; empty recommendations never flash");
