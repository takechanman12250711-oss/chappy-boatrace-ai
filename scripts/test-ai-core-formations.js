"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");
const aiCore = global.ChappyAICore;

function boat(boatNo, total, raceFlow, attack, hold, pickup, road = 65) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: { total, raceFlow, attack, turn: road, local: 60 },
    roleScores: { attack, hold, pickup, road }
  };
}

const unclear = [
  boat(1, 68, 58, 55, 70, 55),
  boat(2, 67, 60, 58, 69, 58),
  boat(3, 66, 70, 68, 58, 62),
  boat(4, 65, 69, 67, 61, 65),
  boat(5, 62, 64, 63, 55, 69),
  boat(6, 60, 62, 60, 52, 70)
];

const unclearFormation = aiCore.buildFormations(unclear);
assert.equal(unclearFormation.mainEstablished, false);
assert.deepEqual(unclearFormation.main, []);

const established = [
  boat(1, 82, 76, 62, 86, 68),
  boat(2, 78, 73, 67, 82, 70),
  boat(3, 73, 80, 76, 62, 72),
  boat(4, 70, 72, 70, 74, 71),
  boat(5, 68, 70, 68, 59, 78),
  boat(6, 64, 68, 64, 56, 73)
];

const establishedFormation = aiCore.buildFormations(established);
assert.equal(establishedFormation.mainEstablished, true);
assert.equal(establishedFormation.evidence.oneEscape, true);
assert.equal(establishedFormation.evidence.twoSashi, true);
assert.equal(establishedFormation.evidence.flow, true);
assert.ok(establishedFormation.main.length >= 3);
assert.ok(establishedFormation.safety.length >= 2);
assert.ok(establishedFormation.flow.length >= 1);

for (const ticket of [
  ...establishedFormation.main,
  ...establishedFormation.safety,
  ...establishedFormation.flow,
  ...establishedFormation.longshot
]) {
  assert.match(ticket, /^[1-6]-[1-6]-[1-6]$/);
  assert.equal(new Set(ticket.split("-")).size, 3);
}

function assertScenarioHead(analyses, expectedHead, evidenceKey) {
  const formation = aiCore.buildFormations(analyses);

  assert.equal(formation.mainEstablished, true);
  assert.equal(formation.evidence[evidenceKey], true);
  assert.ok(formation.main.length >= 3);
  assert.ok(
    formation.main.every(ticket => ticket.startsWith(`${expectedHead}-`))
  );
}

assertScenarioHead([
  boat(1, 68, 60, 55, 74, 58),
  boat(2, 80, 74, 68, 82, 72),
  boat(3, 68, 70, 66, 60, 66),
  boat(4, 66, 69, 67, 64, 68),
  boat(5, 63, 65, 62, 56, 70),
  boat(6, 61, 64, 61, 54, 71)
], 2, "twoSashi");

assertScenarioHead([
  boat(1, 68, 60, 56, 74, 58),
  boat(2, 69, 63, 61, 72, 62),
  boat(3, 82, 82, 80, 63, 74),
  boat(4, 68, 71, 69, 67, 70),
  boat(5, 66, 69, 66, 58, 73),
  boat(6, 62, 66, 63, 55, 72)
], 3, "threeAttack");

assertScenarioHead([
  boat(1, 68, 60, 56, 74, 58),
  boat(2, 69, 63, 61, 72, 62),
  boat(3, 69, 72, 68, 63, 70),
  boat(4, 82, 82, 80, 70, 76),
  boat(5, 68, 73, 70, 60, 76),
  boat(6, 63, 67, 64, 56, 73)
], 4, "fourAttack");

console.log("AIコア買い目接続テスト: 合格");
console.log("- 本線不成立: 本線買い目0点");
console.log("- 本線成立: AIコアから本線・押さえを生成");
console.log("- 対抗展開あり: 流し候補を生成");
console.log("- 2差し・3攻め・4カド: 各展開艇を本線頭に固定");
