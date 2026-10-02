"use strict";
const assert=require("node:assert/strict");
const snapshot=require("../js/theory-tag-snapshot");
const prediction={
  aiCore:{
    wallTheory:{attackerNo:3,wallCandidateNo:2,wallBoat:2,state:"壁成立",score:82,grade:"A"},
    raceScenarios:{attacker:3}
  },
  verificationEvidence:{tickets:[{ticket:"3-1-2",category:"本線",theoryClaims:[]},{ticket:"1-2-4",category:"押さえ",theoryClaims:[]}]}
};
const evidence=snapshot.wallEvidence(prediction);
assert.equal(evidence.formal,true);
assert.equal(evidence.attackerNo,3);
assert.equal(evidence.wallCandidateNo,2);
const claim=snapshot.wallClaimForTicket(prediction,"3-1-2");
assert.ok(claim);
assert.equal(claim.theoryKey,"wallBoat");
assert.equal(snapshot.wallClaimForTicket(prediction,"1-2-4"),null,"攻め艇を含まない買い目へ壁艇理論を水増ししない");
assert.equal(snapshot.wallEvidence({aiCore:{wallTheory:{attackerNo:3,wallCandidateNo:2,state:"暫定",score:60,grade:"C"}}}).formal,false,"暫定評価は正式証拠にしない");
assert.equal(snapshot.wallEvidence({aiCore:{wallTheory:{attackerNo:1,wallCandidateNo:0,state:"対象外",score:0,grade:"D"}}}).formal,false,"対象外は正式証拠にしない");
const result=snapshot.build(prediction,[{ticket:"3-1-2",category:"本線"},{ticket:"1-2-4",category:"押さえ"}]);
const wall=result.theories.find(row=>row.theoryKey==="wallBoat");
assert.ok(wall);
assert.deepEqual(wall.tickets,["3-1-2"]);
assert.equal(result.usableForPrediction,false);
assert.equal(result.automaticApplication,false);
console.log("wall formal evidence tests passed");
