"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");

const aiCore = global.ChappyAICore;
const predictionDir = path.join(__dirname, "..", "data", "predictions");

function readVerificationPredictions() {
  return fs.readdirSync(predictionDir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort()
    .flatMap((name) => {
      const source = JSON.parse(
        fs.readFileSync(path.join(predictionDir, name), "utf8")
      );
      return Array.isArray(source.verificationPredictions)
        ? source.verificationPredictions
        : [];
    })
    .filter((record) => record?.result?.settled === true);
}

function parseCandidateBoats(summary, label) {
  const match = String(summary || "").match(
    new RegExp(`${label}は([^。]+)`)
  );
  if (!match) return [];

  return [...match[1].matchAll(/([1-6])号艇/g)]
    .map((item) => Number(item[1]));
}

function scenarioFromSummary(summary) {
  const text = String(summary || "");

  if (text.includes("最有力展開は2コース差し")) {
    return { type: "sashi", label: "2コース差し", attacker: 2 };
  }
  if (text.includes("最有力展開は3コース攻め")) {
    return {
      type: "threeAttack",
      label: "3コース攻め",
      attacker: 3,
      blockedBoats: [4]
    };
  }
  if (text.includes("最有力展開は4カド攻め")) {
    return {
      type: "fourAttack",
      label: "4カド攻め",
      attacker: 4
    };
  }
  if (text.includes("最有力展開は1号艇逃げ")) {
    return { type: "escape", label: "1号艇逃げ", attacker: 1 };
  }

  return null;
}

function buildEntries(record) {
  const preRaceBoats =
    record?.prediction?.preRaceConditions?.boats || [];
  const courseByBoat = new Map(
    preRaceBoats.map((boat) => [
      Number(boat.boatNo),
      Number(boat.course)
    ])
  );

  return [1, 2, 3, 4, 5, 6].map((boatNo) => ({
    boatNo,
    course: courseByBoat.get(boatNo) || boatNo
  }));
}

function compareRecord(record) {
  const summary = record?.prediction?.raceFlow?.summary || "";
  const scenario = scenarioFromSummary(summary);
  const oldSecond = parseCandidateBoats(summary, "2着残し候補");
  const oldThird = parseCandidateBoats(summary, "3着拾い候補");
  const oldHead = Number(
    record?.prediction?.mainSheet?.honmei?.boatNo || 0
  );
  const finishers = record?.result?.finishers || [];
  const actualSecond = Number(
    finishers.find((boat) => Number(boat.rank) === 2)?.boat || 0
  );
  const actualThird = Number(
    finishers.find((boat) => Number(boat.rank) === 3)?.boat || 0
  );

  if (!scenario || !oldHead || !actualSecond || !actualThird) {
    return null;
  }

  const entries = buildEntries(record);
  const analyses = entries.map((entry) => ({
    boatNo: entry.boatNo,
    playerName: `${entry.boatNo}号艇`
  }));
  const theory = aiCore.buildHoldPickupTheory(
    entries,
    analyses,
    scenario,
    {
      wallBoat: null,
      wallCandidateNo: null,
      state: "暫定"
    }
  );
  const newSecond = theory.secondCandidates.map((boat) => boat.boatNo);
  const newThird = theory.thirdCandidates.map((boat) => boat.boatNo);
  const newHead = theory.attackerBoatNo;

  return {
    raceKey: record.raceKey,
    scenario: scenario.label,
    oldHead,
    newHead,
    actualSecond,
    actualThird,
    oldSecond,
    oldThird,
    newSecond,
    newThird,
    oldHeadInSecond: oldSecond.includes(oldHead),
    oldHeadInThird: oldThird.includes(oldHead),
    newHeadInSecond: newSecond.includes(newHead),
    newHeadInThird: newThird.includes(newHead),
    oldSecondCovered: oldSecond.includes(actualSecond),
    oldThirdCovered: oldThird.includes(actualThird),
    newSecondCovered: newSecond.includes(actualSecond),
    newThirdCovered: newThird.includes(actualThird)
  };
}

function summarize(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      for (const key of [
        "oldHeadInSecond",
        "oldHeadInThird",
        "newHeadInSecond",
        "newHeadInThird",
        "oldSecondCovered",
        "oldThirdCovered",
        "newSecondCovered",
        "newThirdCovered"
      ]) {
        if (row[key]) summary[key] += 1;
      }
      if (row.oldSecondCovered && row.oldThirdCovered) {
        summary.oldBothCovered += 1;
      }
      if (row.newSecondCovered && row.newThirdCovered) {
        summary.newBothCovered += 1;
      }
      return summary;
    },
    {
      total: 0,
      oldHeadInSecond: 0,
      oldHeadInThird: 0,
      newHeadInSecond: 0,
      newHeadInThird: 0,
      oldSecondCovered: 0,
      oldThirdCovered: 0,
      newSecondCovered: 0,
      newThirdCovered: 0,
      oldBothCovered: 0,
      newBothCovered: 0
    }
  );
}

const rows = readVerificationPredictions()
  .map(compareRecord)
  .filter(Boolean);
const firstTen = rows.slice(0, 10);

console.log(JSON.stringify({
  comparisonPolicy:
    "保存済み事前予想を旧版とし、結果は候補包含の検証だけに使用。結果情報はVer2候補生成へ入力しない。",
  firstTen: {
    summary: summarize(firstTen),
    races: firstTen
  },
  allSaved: {
    summary: summarize(rows)
  }
}, null, 2));
