"use strict";
const assert=require("node:assert/strict");
global.window=global;
function prediction(){return{analyses:[
{boatNo:1,indexes:{st:0,exhibition:0,raceFlow:60},roleScores:{attack:0,hold:50,pickup:60}},
{boatNo:2,indexes:{st:0,exhibition:0,raceFlow:55},roleScores:{attack:0,hold:45,pickup:50}},
{boatNo:3,indexes:{st:1,exhibition:1,raceFlow:62},roleScores:{attack:2,hold:56,pickup:56}},
{boatNo:4,indexes:{st:0,exhibition:0,raceFlow:54},roleScores:{attack:0,hold:40,pickup:45}},
{boatNo:5,indexes:{st:0,exhibition:0,raceFlow:53},roleScores:{attack:0,hold:39,pickup:44}},
{boatNo:6,indexes:{st:0,exhibition:0,raceFlow:52},roleScores:{attack:0,hold:38,pickup:43}}],formations:{main:["1-2-3","1-3-2","1-4-3"],safety:["1-2-4","1-5-2"]}};}
global.ChappyAICore=Object.freeze({buildPredictionData:()=>prediction()});
require("../js/pair-32-rescue-fixed5");
const out=global.ChappyAICore.buildPredictionData({});
assert.equal(out.formations.pair32RescueFixed5.applied,true);
assert.equal(out.formations.pair32RescueFixed5.rule,"sixOf6_replace_one_1-2");
assert.equal(out.formations.safety[0],"3-2-1");
assert.equal(out.formations.pair32RescueFixed5.replaced,"1-2-4");
assert.equal(out.formations.main.length,3);
assert.equal(out.formations.safety.length,2);
const weak=prediction();const b3=weak.analyses.find(x=>x.boatNo===3);b3.indexes.st=-1;b3.indexes.exhibition=-5;b3.indexes.raceFlow=40;b3.roleScores.attack=-3;b3.roleScores.hold=20;b3.roleScores.pickup=20;assert.equal(global.ChappyPair32RescueFixed5.apply(weak),weak);
const duplicate=prediction();duplicate.formations.main[1]="3-2-4";assert.equal(global.ChappyPair32RescueFixed5.apply(duplicate),duplicate);
console.log("pair 3-2 rescue fixed5 tests passed");
