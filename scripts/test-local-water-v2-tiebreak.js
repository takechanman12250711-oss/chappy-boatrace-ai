"use strict";
const assert = require("node:assert/strict");
const helper = require("../js/local-water-v2-tiebreak");

function scenario(head,score,label){
  return {
    headBoatNo: head,
    score,
    label,
    blockedBoats: [],
    outcome: {
      firstCandidates:[{boatNo:head}],
      secondCandidates:[{boatNo: head === 1 ? 2 : 1}],
      thirdCandidates:[{boatNo:3}],
      remainers:[{boatNo:1}],
      pickupCandidates:[{boatNo:5}]
    }
  };
}
const s1=scenario(1,80,"1号艇逃げ");
const s2=scenario(2,78,"2コース差し");
const base={
  analyses:[1,2,3,4,5,6].map(boatNo=>({boatNo})),
  raceScenarios:{mainScenario:s1,scenarios:[s1,s2],holdPickupTheory:{}},
  formations:{main:[{ticket:"1-2-3"}],safety:[]}
};
let rebuilt=null;
const core={buildFormations(analyses,rs){rebuilt={analyses,rs};return {main:[{ticket:"2-1-3"}],safety:[{ticket:"2-3-1"}]};}};
const formal={localWaterTheoryV2:{isFormal:true,rows:[{boatNo:2,score:90,isFormal:true},{boatNo:1,score:80,isFormal:true}]}};
const applied=helper.apply(base,formal,core);
assert.equal(applied.localWaterV2Tiebreak.applied,true);
assert.equal(applied.localWaterV2Tiebreak.gap,2);
assert.equal(helper.headOf(applied.raceScenarios.mainScenario),2);
assert.deepEqual(applied.formations,{main:[{ticket:"2-1-3"}],safety:[{ticket:"2-3-1"}]});
assert.equal(rebuilt.rs.holdPickupTheory.secondCandidates[0].boatNo,1);

const gap4={...base,raceScenarios:{...base.raceScenarios,mainScenario:{...s1,score:82},scenarios:[{...s1,score:82},s2]}};
assert.equal(helper.apply(gap4,formal,core).localWaterV2Tiebreak,undefined,"gap>3は現行維持");
assert.equal(helper.apply(base,{localWaterTheoryV2:{isFormal:false,rows:formal.localWaterTheoryV2.rows}},core).localWaterV2Tiebreak,undefined,"正式判定なしは現行維持");
const sameHead={...formal,localWaterTheoryV2:{isFormal:true,rows:[{boatNo:1,score:99,isFormal:true}]}};
assert.equal(helper.apply(base,sameHead,core).localWaterV2Tiebreak,undefined,"同一頭は変更しない");
console.log("Local/Water V2 gap<=3 tiebreak test passed");
