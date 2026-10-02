'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const box = { window: {}, console: { log() {}, warn() {}, error() {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/ai-core.js'), 'utf8'), box);
const core = box.window.ChappyAICore;
function run(courseOneBoat, first = [courseOneBoat, 3], samples = 60) {
  const entries = [1, 2, 3, 4, 5, 6].map(boatNo => ({ boatNo, registerNo: String(4000 + boatNo), className: 'A1', national: { winRate: 7 },
    startExhibition: { boat: boatNo, course: boatNo === courseOneBoat ? 1 : boatNo === 1 ? courseOneBoat : boatNo, isOfficialCourse: true, mappingSource: 'official-start-image' } }));
  const analyses = entries.map(e => ({ boatNo: e.boatNo, roleScores: {}, indexes: {} }));
  const racers = entries.map(e => ({ registerNo: e.registerNo, byCourse: { [e.startExhibition.course]: {
    starts: samples, winRate: 70, top3Rate: 90, averageSt: 0.13,
    winningMethods: [{ key: '逃げ', count: 40, rate: 90 }, { key: 'まくり', count: 4, rate: 10 }]
  } } }));
  const scenario = { mainScenario: { type: 'threeAttack', attacker: 3, outcome: {
    firstCandidates: first.map(boatNo => ({ boatNo })), secondCandidates: [{ boatNo: 1 }], thirdCandidates: [] } }, blockedBoats: [] };
  const original = JSON.stringify({ entries, analyses, racers, scenario });
  const result = core.buildRacerSkillTheory(entries, analyses, { historyContext: { racers } }, scenario);
  assert.equal(JSON.stringify({ entries, analyses, racers, scenario }), original);
  return result;
}
for (const inside of [1, 2, 4, 5, 6]) {
  const r = run(inside), b = r.roles.find(x => x.boatNo === inside);
  assert.equal(b.role, '逃げ');
  assert.equal(b.components.methodFit, 18);
  assert.match(b.methodLabel, /逃げ/);
  assert.equal(r.roles.find(x => x.boatNo === 3).role, '攻め');
}
assert.equal(run(1, [3]).roles.find(x => x.boatNo === 1).role, '残し');
assert.equal(run(2, [1, 3]).roles.find(x => x.boatNo === 1).role, '攻め');
assert.equal(run(1, [1, 3], 11).roles.find(x => x.boatNo === 1).isAdopted, false);
console.log('escape skill role: actual entry, alternate win, non-winner and sample gates passed');
