"use strict";
const assert=require("node:assert/strict"),gate=require("./build-phase5-completion-gate");
const r=gate.build();
assert.equal(r.phase,"phase5");
assert.equal(r.implementationComplete,true);
assert.deepEqual(r.missing,[]);
for(const [k,v] of Object.entries(r.stages))assert.equal(v,true,k);
assert.equal(r.productionChanged,false);
assert.equal(r.automaticApplication,false);
assert.equal(r.failClosedOk,true);
if(!r.productionCandidateReady){assert.equal(r.adoptionAllowed,false);assert.equal(r.currentDecision,"collect-evidence");}
console.log("phase5 completion gate: ok");
