"use strict";
const assert=require("node:assert/strict");global.window=global;global.ChappyAICore=Object.freeze({buildPredictionData:x=>x});require("../js/third-13-4to6-st-rescue");const mod=global.ChappyThird134To136StRescue;
function boat(no,st,pickup,hold,raceFlow){return{boatNo:no,indexes:{st,raceFlow},roleScores:{pickup,hold}};}
function prediction(overrides={}){return{analyses:[boat(1,0,0,0,0),boat(2,0,0,0,0),boat(3,0,0,0,0),boat(4,10,40,50,50),boat(5,0,0,0,0),boat(6,13,60,70,40)],formations:{main:["1-3-4","1-2-3","2-1-3"],safety:["1-4-3","3-1-2"]},...overrides};}
let p=prediction();let out=mod.apply(p);assert.equal(out.formations.main[0],"1-3-6");assert.equal(out.formations.third134To136StRescue.applied,true);assert.equal(out.formations.third134To136StRescue.stMargin,3);assert.deepEqual(out.formations.third134To136StRescue.agreements,["pickup","hold"]);
p=prediction({formations:{main:["1-2-3","2-1-3","3-1-2"],safety:["1-3-4","1-4-3"]}});out=mod.apply(p);assert.equal(out.formations.safety[0],"1-3-6");assert.equal(out.formations.third134To136StRescue.location,"safety");
p=prediction({formations:{main:["1-3-4","1-2-3","2-1-3"],safety:["1-3-6","3-1-2"]}});assert.equal(mod.apply(p),p);
p=prediction({formations:{main:["1-3-4","1-2-3","2-1-3"],safety:["1-4-3","3-1-2"],thirdSixRescueFixed5:{applied:true}}});assert.equal(mod.apply(p),p);
p=prediction({analyses:[boat(1,0,0,0,0),boat(2,0,0,0,0),boat(3,0,0,0,0),boat(4,10,40,50,50),boat(5,0,0,0,0),boat(6,11,60,70,80)],formations:{main:["1-3-4","1-2-3","2-1-3"],safety:["1-4-3","3-1-2"]}});assert.equal(mod.apply(p),p);
p=prediction({analyses:[boat(1,0,0,0,0),boat(2,0,0,0,0),boat(3,0,0,0,0),boat(4,10,40,50,50),boat(5,0,0,0,0),boat(6,13,60,40,40)],formations:{main:["1-3-4","1-2-3","2-1-3"],safety:["1-4-3","3-1-2"]}});assert.equal(mod.apply(p),p);
console.log("third-13-4to6-st-rescue tests passed");
