const assert=require("assert");

global.window=global;
global.document={
  documentElement:{},
  body:{classList:{add(){}}},
  getElementById(){return null;},
  querySelector(){return null;},
  querySelectorAll(){return[];},
  createElement(){return{classList:{add(){}},dataset:{},appendChild(){},querySelector(){return null;},querySelectorAll(){return[];}};}
};
global.MutationObserver=class{observe(){}};
global.requestAnimationFrame=fn=>{fn();return 1;};
global.setInterval=()=>1;
global.clearInterval=()=>{};
global.setTimeout=fn=>{fn();return 1;};
require("../js/final-display-owner-v2.js");
const api=global.ChappyFinalDisplayOwner;
assert(api,"final display owner API missing");

// Purchase selection and formation display are different contracts.
// Formal purchase tickets must stay exact, while the approved formation display keeps its full point set.
const prediction={
  mainSheet:{
    flowTickets:[{ticket:"1-3-2"},{ticket:"1-3-4"},{ticket:"1-3-5"},{ticket:"1-3-6"}],
    flowFormations:[{notation:"12-345-全",pointCount:24}]
  },
  practicalSelection:{status:"selected",tickets:[{ticket:"1-3-4"},{ticket:"1-3-5"}]}
};
const selected=api.formalFlowTickets(prediction);
assert.deepStrictEqual(selected,["1-3-4","1-3-5"],"formal purchase selection exact tickets must be preserved");
const formal=api.formalFlowFormations(prediction);
assert.strictEqual(formal.length,1,"two compatible purchase tickets may be summarized safely for diagnostics");
assert.strictEqual(formal[0].notation,"1-3-45","diagnostic compact notation must contain only selected purchase tickets");
assert.deepStrictEqual(api.expandNotation(formal[0].notation).sort(),["1-3-4","1-3-5"],"diagnostic compact notation must not invent purchase tickets");

const display=api.authoritativeFlowFormations(prediction);
assert.strictEqual(display.length,1,"approved full formation display must remain available");
assert.strictEqual(display[0].notation,"12-345-全","practical selection must not shrink the approved formation display");
assert.strictEqual(api.expandNotation(display[0].notation).length,24,"12-345-全 must remain a 24-point display formation");
const prepared=api.prepare(prediction);
assert.strictEqual(prepared.mainSheet.flowFormations[0].notation,"12-345-全","prepared display must preserve approved full formation notation");
assert.strictEqual(prepared.formation.flowFormations[0].notation,"12-345-全","all final display sources must preserve the same full formation");
assert.deepStrictEqual(prepared.finalPurchaseRows.map(row=>row.notation),["1-3-4","1-3-5"],"final purchase rows must remain the exact practical selection");

const eight={mainSheet:{flowFormations:[{notation:"4-23-全",pointCount:8}]},practicalSelection:{tickets:[{ticket:"4-2-1"}]}};
assert.strictEqual(api.expandNotation(api.authoritativeFlowFormations(eight)[0].notation).length,8,"4-23-全 must remain an 8-point display formation");
assert.deepStrictEqual(api.practicalRows(eight).map(row=>row.notation),["4-2-1"],"8-point display must not expand the purchase target");

const noExplicit={mainSheet:{flowTickets:[{ticket:"2-1-3"},{ticket:"2-1-4"}]}};
assert.strictEqual(api.authoritativeFlowFormations(noExplicit)[0].notation,"2-1-34","fallback may compact raw flow tickets only when no explicit formation exists");
console.log("final display approved formation/purchase separation: ok");
