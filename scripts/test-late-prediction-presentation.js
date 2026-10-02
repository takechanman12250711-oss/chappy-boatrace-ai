"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const intervals = new Map(), events = new Map(), timeouts = [];
let nextId = 0;
const empty = () => null;
const doc = {
  head: { appendChild() {} }, documentElement: {},
  body: { classList: { add() {} } },
  getElementById: empty, querySelector: empty, querySelectorAll: () => [],
  addEventListener() {}, createElement: () => ({})
};
class Observer { observe() {} }
const window = {
  document: doc, MutationObserver: Observer,
  setInterval(fn) { const id=++nextId; intervals.set(id,fn); return id; },
  clearInterval(id) { intervals.delete(id); },
  setTimeout(fn) { timeouts.push(fn); return timeouts.length; },
  addEventListener(name,fn) { if(!events.has(name))events.set(name,[]); events.get(name).push(fn); }
};
const context=vm.createContext({window,MutationObserver:Observer});
for(const file of ["final-mobile-ui.js","final-display-owner-v2.js","final-practical-visible-panel.js"])
  vm.runInContext(fs.readFileSync("js/"+file,"utf8"),context);
// Exhaust every startup poll before the user opens a prediction.
for(let tick=0;tick<300;tick++)for(const fn of [...intervals.values()])fn();
assert.equal(intervals.size,0);
let calls=0;
window.renderAll=prediction=>{calls++;return prediction;};
for(const fn of events.get("chappy:prediction-runtime-ready")||[])fn();
const hooks=new Set();
for(let fn=window.renderAll;fn;fn=fn.__original)
  for(const name of ["__chappyFinalMobileUiWrapped","__chappyFinalDisplayOwnerV2Wrapped","__chappyPracticalVisiblePanelWrapped"])
    if(fn[name])hooks.add(name);
assert.equal(hooks.size,3,"Late prediction must retain compact tickets, formation ownership and practical panel");
window.renderAll({mainSheet:{tickets:[],flowFormations:[]}});
assert.equal(calls,1,"Prediction renderer must run once");
assert.equal(timeouts.length,4,"All presentation stages must run after a delayed first prediction");
console.log("late first prediction retains all three approved presentation stages");
