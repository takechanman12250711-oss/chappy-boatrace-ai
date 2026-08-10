"use strict";

const fs = require("node:fs");

function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker not found`);
  const end = text.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${label}: end marker not found`);
  if (text.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`${label}: start marker is not unique`);
  }
  return text.slice(0, start) + replacement + text.slice(end);
}

const corePath = "js/ai-core.js";
let core = fs.readFileSync(corePath, "utf8");
const functionStart = "  function generateDiversifiedMainTickets(\n";
const functionEnd = "\n\n  if (preservedScenarioBranches.length) {";
const replacement = `  function generateDiversifiedMainTickets(
    target,
    heads,
    secondCandidates,
    thirdCandidates,
    limit
  ) {
    if (target.length >= limit) {
      return;
    }

    for (const head of heads) {
      const seconds = secondCandidates
        .filter(
          (boat) => boatNo(boat) !== boatNo(head)
        )
        .slice(0, 3);
      const usedThirdsBySecond = new Map();

      for (let round = 0; round < 2; round += 1) {
        for (const second of seconds) {
          const secondNo = boatNo(second);
          const usedThirds =
            usedThirdsBySecond.get(secondNo) || new Set();
          const third = thirdCandidates.find(
            (candidate) => {
              const thirdNo = boatNo(candidate);
              return (
                thirdNo !== boatNo(head) &&
                thirdNo !== secondNo &&
                !usedThirds.has(thirdNo)
              );
            }
          );

          if (!third) continue;

          addTicket(target, head, second, third);
          usedThirds.add(boatNo(third));
          usedThirdsBySecond.set(secondNo, usedThirds);

          if (target.length >= limit) return;
        }
      }
    }

    generateTickets(
      target,
      heads,
      secondCandidates,
      thirdCandidates,
      limit
    );
  }`;
core = replaceBetween(core, functionStart, functionEnd, replacement, "ai-core diversified main");
fs.writeFileSync(corePath, core);

const testPath = "scripts/test-scenario-formations.js";
let test = fs.readFileSync(testPath, "utf8");
const testStart = "assert.equal(\n  practicalMain[0][1],";
const testEnd = "\nassert.equal(\n  connected.main.includes(\"3-1-5\"),";
const testReplacement = `assert.notEqual(
  practicalMain[0][1],
  practicalMain[1][1],
  "本線の先頭枠は2着候補を1艇ずつ分散する"
);
assert.deepEqual(
  new Set(practicalMain.slice(0, 2).map((parts) => parts[1])),
  new Set(connected.rankings.second.slice(0, 2).map((row) => row.boatNo)),
  "正式2着候補の上位艇を先に1点ずつ確保する"
);
assert.equal(
  practicalMain[2][1],
  practicalMain[0][1],
  "2着候補を一巡した後に上位艇の別3着を追加する"
);
assert.notEqual(
  practicalMain[2][2],
  practicalMain[0][2],
  "同じ2着艇では3着候補を重複させない"
);`;
test = replaceBetween(test, testStart, testEnd, testReplacement, "scenario formation regression");
fs.writeFileSync(testPath, test);

console.log("core ticket balance patch applied");
