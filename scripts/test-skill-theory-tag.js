"use strict";
const assert=require("node:assert/strict");
const snapshot=require("../js/theory-tag-snapshot");
const prediction={
  flowPriority:{attackBoatNo:4},
  skillLocalSupport:{
    attackBoatNo:4,
    confirmations:["A1級の技量","全国勝率上位"],
    cautions:[],
    boats:[{boatNo:4,grade:"A1",nationalWinRate:7.1,localWinRate:6.8,avgST:0.13,localST:0.14,firstRate:31}]
  }
};
const evidence=snapshot.skillEvidence(prediction);
assert.equal(evidence.formal,true);
assert.ok(snapshot.skillClaimForTicket(prediction,"1-4-3"));
assert.equal(snapshot.skillClaimForTicket(prediction,"1-2-3"),null);
assert.equal(snapshot.skillEvidence({flowPriority:{attackBoatNo:4},skillLocalSupport:{attackBoatNo:4,confirmations:["当地実績上位"],boats:[{boatNo:4,grade:"A1",nationalWinRate:7.1}]}}).formal,false,"当地だけの根拠を技量へ二重帰属しない");
const built=snapshot.build(prediction,[{ticket:"1-4-3",category:"本線"}]);
const skill=built.theories.find(row=>row.theoryKey==="skill");
assert.ok(skill);
assert.deepEqual(skill.tickets,["1-4-3"]);
assert.equal(built.usableForPrediction,false);
assert.equal(built.automaticApplication,false);
console.log("skill theory tag tests passed");
