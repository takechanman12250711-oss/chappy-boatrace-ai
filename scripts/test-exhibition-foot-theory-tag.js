"use strict";
const assert=require("node:assert/strict");
const snapshot=require("../js/theory-tag-snapshot");
const prediction={
  flowPriority:{attackBoatNo:4},
  flowSupport:{attackBoatNo:4,attackExhibitionRank:1,dataCoverage:{exhibition:6},confirms:["4号艇は展示上位で展開を補強"],alerts:[]},
  verificationEvidence:{tickets:[{ticket:"1-4-3",category:"本線",theoryClaims:[]},{ticket:"1-2-3",category:"押さえ",theoryClaims:[]}]}
};
const result=snapshot.build(prediction,[{ticket:"1-4-3",category:"本線"},{ticket:"1-2-3",category:"押さえ"}]);
const row=result.theories.find(x=>x.theoryKey==="exhibitionFoot");
assert.ok(row);
assert.deepEqual(row.tickets,["1-4-3"]);
assert.equal(snapshot.exhibitionFootEvidence({flowSupport:{attackBoatNo:4,attackExhibitionRank:1,dataCoverage:{exhibition:3},confirms:["4号艇は展示上位"]}}).formal,false);
assert.equal(snapshot.exhibitionFootClaimForTicket(prediction,"1-2-3"),null);
assert.equal(result.usableForPrediction,false);
assert.equal(result.automaticApplication,false);
console.log("exhibition foot theory tag tests passed");
