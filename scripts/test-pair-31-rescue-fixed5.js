"use strict";
const assert=require("node:assert/strict");
global.window=global;
function prediction(){return{analyses:[
{boatNo:1,indexes:{st:0,exhibition:0,raceFlow:80},roleScores:{attack:2,hold:80,pickup:60}},
{boatNo:2,indexes:{st:0,exhibition:0,raceFlow:60},roleScores:{attack:0,hold:50,pickup:50}},
{boatNo:3,indexes:{st:1,exhibition:1,raceFlow:62},roleScores:{attack:2,hold:56,pickup:56}},
{boatNo:4,indexes:{st:0,exhibition:0,raceFlow:55},roleScores:{attack:0,hold:40,pickup:45}},
{boatNo:5,indexes:{st:0,exhibition:0,raceFlow:54},roleScores:{attack:0,hold:39,pickup:44}},
{boatNo:6,indexes:{st:0,exhibition:0,raceFlow:53},roleScores:{attack:0,hold:38,pickup:43}}],formations:{main:["1-2-3","1-3-2","1-4-3"],safety:["2-1-4","1-5-2"]}};}
global.ChappyAICore=Object.freeze({buildPredictionData:()=>prediction()});
require("../js/pair-31-rescue-fixed5");
const out=global.ChappyAICore.buildPredictionData({});
assert.equal(out.formations.pair31RescueFixed5.applied,true);
assert.equal(out.formations.pair31RescueFixed5.rule,"fourOf6_replace_last_2-1");
assert.equal(out.formations.safety[0],"3-1-2");
assert.equal(out.formations.main.length,3);
assert.equal(out.formations.safety.length,2);

// A/B contract: among the 5 selected tickets, replace the LAST 2-1 slot.
const multiple=prediction();
multiple.formations.main=["1-2-3","2-1-3","1-4-3"];
multiple.formations.safety=["2-1-4","1-5-2"];
const multiOut=global.ChappyPair31RescueFixed5.apply(multiple);
assert.equal(multiOut.formations.main[1],"2-1-3");
assert.equal(multiOut.formations.safety[0],"3-1-2");
assert.equal(multiOut.formations.pair31RescueFixed5.replaced,"2-1-4");
assert.equal(multiOut.formations.pair31RescueFixed5.location,"safety");
assert.equal(multiOut.formations.pair31RescueFixed5.index,0);

const mainOnly=prediction();
mainOnly.formations.main=["2-1-3","1-3-2","2-1-4"];
mainOnly.formations.safety=["1-5-2","1-6-2"];
const mainOut=global.ChappyPair31RescueFixed5.apply(mainOnly);
assert.equal(mainOut.formations.main[0],"2-1-3");
assert.equal(mainOut.formations.main[2],"3-1-2");
assert.equal(mainOut.formations.pair31RescueFixed5.replaced,"2-1-4");
assert.equal(mainOut.formations.pair31RescueFixed5.location,"main");
assert.equal(mainOut.formations.pair31RescueFixed5.index,2);

const weak=prediction();const b3=weak.analyses.find(x=>x.boatNo===3);b3.indexes.st=-1;b3.indexes.exhibition=-1;b3.indexes.raceFlow=39;b3.roleScores.attack=-2;b3.roleScores.hold=20;b3.roleScores.pickup=20;assert.equal(global.ChappyPair31RescueFixed5.apply(weak),weak);
const duplicate=prediction();duplicate.formations.main[1]="3-1-4";assert.equal(global.ChappyPair31RescueFixed5.apply(duplicate),duplicate);
console.log("pair 3-1 rescue fixed5 tests passed");