"use strict";
const assert=require("node:assert/strict");
const collector=require("./collect-predictions");
const snapshot=require("../js/theory-tag-snapshot");
const prediction={
  aiCore:{
    version:"test",
    wallTheory:{attackerNo:3,wallCandidateNo:2,wallBoat:2,state:"壁成立",score:82,grade:"A"},
    raceScenarios:{
      attacker:3,
      mainScenario:{type:"threeAttack",score:80,attacker:3,attackerBoatNo:3},
      subScenario:null,
      scenarios:[{type:"threeAttack",score:80,attacker:3,attackerBoatNo:3}],
      evidence:{}
    },
    marks:{},formations:{},stSlitTheory:{roles:[]}
  }
};
const evidence=collector.compactVerificationEvidence(prediction);
assert.equal(evidence.wallTheory.formal,true);
assert.equal(evidence.wallTheory.state,"壁成立");
assert.equal(evidence.wallTheory.score,82);
assert.equal(evidence.wallTheory.grade,"A");
const compactPrediction={verificationEvidence:evidence};
const recovered=snapshot.wallEvidence(compactPrediction);
assert.equal(recovered.formal,true);
assert.equal(recovered.attackerNo,3);
assert.equal(recovered.wallCandidateNo,2);
assert.equal(recovered.state,"壁成立");
console.log("wall evidence storage test: ok");
