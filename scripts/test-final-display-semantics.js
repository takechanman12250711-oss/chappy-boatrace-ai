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

const prediction={
  mainSheet:{
    flowTickets:[{ticket:"1-3-2"},{ticket:"1-3-4"},{ticket:"1-3-5"},{ticket:"1-3-6"}],
    flowFormations:[{notation:"1-3-全",pointCount:4,expandedTickets:["1-3-2","1-3-4","1-3-5","1-3-6"]}]
  },
  practicalSelection:{status:"selected",tickets:[{ticket:"1-3-4"},{ticket:"1-3-5"}]}
};
const selected=api.formalFlowTickets(prediction);
assert.deepStrictEqual(selected,["1-3-4","1-3-5"],"formal selection exact tickets must be preserved");
const formations=api.formalFlowFormations(prediction);
assert.strictEqual(formations.length,1,"two compatible selected tickets should compact into one safe formation");
assert.strictEqual(formations[0].notation,"1-3-45","safe formation must contain only selected thirds");
assert.strictEqual(formations[0].pointCount,2,"safe formation point count must stay two");
assert.deepStrictEqual([...formations[0].expandedTickets].sort(),["1-3-4","1-3-5"],"safe formation must expand to formal selection only");
const expanded=api.expandNotation(formations[0].notation).sort();
assert.deepStrictEqual(expanded,["1-3-4","1-3-5"],"formation notation must not introduce unselected tickets");
assert(!expanded.includes("1-3-2")&&!expanded.includes("1-3-6"),"excluded tickets must never reappear in final formation");
const prepared=api.prepare(prediction);
assert.strictEqual(prepared.mainSheet.flowFormations[0].notation,"1-3-45","prepared final view must override broad legacy formation with formal-safe formation");
assert.strictEqual(prepared.formation.flowFormations[0].notation,"1-3-45","all final formation sources must share the same owner result");

const noFormal={mainSheet:{flowTickets:[{ticket:"2-1-3"},{ticket:"2-1-4"}]}};
assert.strictEqual(api.authoritativeFlowFormations(noFormal)[0].notation,"2-1-34","fallback must still compact raw flow tickets when no formal selection exists");
console.log("final display formal-selection semantics: ok");
