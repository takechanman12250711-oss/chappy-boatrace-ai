"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "tmp-analysis-output");
const MODE = process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1] || "parent";

function ticketOf(value) {
  const m = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return m.length >= 3 ? m.slice(0, 3).join("-") : "";
}

function rowsOf(doc) {
  return [
    ...(doc.predictions || []),
    ...(doc.verificationPredictions || [])
  ];
}

function dataOf(record) {
  const source = record?.prediction?.preRaceConditions || record?.preRaceConditions;
  if (!source || !Array.isArray(source.boats) || source.boats.length < 5) return null;
  return {
    ...source,
    entries: source.boats,
    boats: source.boats,
    jcd: record.jcd,
    stadiumCode: record.jcd,
    venueCode: record.jcd,
    placeName: record.place,
    venueName: record.place,
    raceNo: record.raceNo,
    rno: record.raceNo,
    weather: source.weather || {}
  };
}

function periodOf(dateNumber) {
  return dateNumber < 20260807 ? "pre" : dateNumber <= 20260810 ? "mid" : "recent";
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`patch target missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`patch target duplicated: ${label}`);
  }
  return source.replace(before, after);
}

function loadPatchedAiCore() {
  const filename = path.join(ROOT, "js", "ai-core.js");
  let source = fs.readFileSync(filename, "utf8");

  const tiebreakBlock = `  sashiSkillTiebreak.applied =\n    rawEscapeIsMain &&\n    sashiSkillTiebreak.scoreGap <= 2.5 &&\n    sashiSkillTiebreak.nationalSkillGap >= 10;\n`;
  const tiebreakWithPhysical = `${tiebreakBlock}\n  /*\n    TEMP VALIDATION ONLY — PR #332で見つかった物理条件。\n    #305の2差し技量タイブレークを優先し、その条件が未発動の時だけ\n    1逃げ主展開から3攻めへ昇格する。score自体は変更しない。\n  */\n  const boat1AverageSt = getOptionalAverageSt(getEntry(1));\n  const boat2AverageSt = getOptionalAverageSt(getEntry(2));\n  const boat3AverageSt = getOptionalAverageSt(getEntry(3));\n  const physicalThreeAttackPromotion = {\n    applied: false,\n    boat1AverageSt,\n    boat2AverageSt,\n    boat3AverageSt,\n    fasterThanOne: null,\n    fasterThanTwo: null,\n    threeAttackScore\n  };\n\n  if (\n    boat1AverageSt !== null &&\n    boat2AverageSt !== null &&\n    boat3AverageSt !== null\n  ) {\n    physicalThreeAttackPromotion.fasterThanOne =\n      round(boat1AverageSt - boat3AverageSt, 3);\n    physicalThreeAttackPromotion.fasterThanTwo =\n      round(boat2AverageSt - boat3AverageSt, 3);\n  }\n\n  physicalThreeAttackPromotion.applied =\n    rawEscapeIsMain &&\n    !sashiSkillTiebreak.applied &&\n    physicalThreeAttackPromotion.fasterThanOne !== null &&\n    physicalThreeAttackPromotion.fasterThanTwo !== null &&\n    physicalThreeAttackPromotion.fasterThanOne >= 0.01 - 1e-9 &&\n    physicalThreeAttackPromotion.fasterThanTwo >= 0.05 - 1e-9 &&\n    threeAttackScore >= 60;\n`;
  source = replaceExactlyOnce(source, tiebreakBlock, tiebreakWithPhysical, "physical gate insertion");

  const mainCheck = `  const threeAttackIsMain =\n    threeAttackScore > escapeScore &&\n    threeAttackScore > sashiScore &&\n    threeAttackScore >= fourAttackScore;`;
  const mainCheckPatched = `  const threeAttackIsMain =\n    physicalThreeAttackPromotion.applied ||\n    (\n      threeAttackScore > escapeScore &&\n      threeAttackScore > sashiScore &&\n      threeAttackScore >= fourAttackScore\n    );`;
  source = replaceExactlyOnce(source, mainCheck, mainCheckPatched, "threeAttack main-state integration");

  const sortBlock = `  ].sort((a, b) => {\n    if (sashiSkillTiebreak.applied) {\n      if (a.type === "sashi") return -1;\n      if (b.type === "sashi") return 1;\n    }\n\n    return b.score - a.score;\n  });`;
  const sortBlockPatched = `  ].sort((a, b) => {\n    if (sashiSkillTiebreak.applied) {\n      if (a.type === "sashi") return -1;\n      if (b.type === "sashi") return 1;\n    }\n\n    if (physicalThreeAttackPromotion.applied) {\n      if (a.type === "threeAttack") return -1;\n      if (b.type === "threeAttack") return 1;\n    }\n\n    return b.score - a.score;\n  });`;
  source = replaceExactlyOnce(source, sortBlock, sortBlockPatched, "scenario promotion sort");

  const evidenceBlock = `    sashiSkillTiebreak: {\n      applied: sashiSkillTiebreak.applied,\n      scoreGap: sashiSkillTiebreak.scoreGap,\n      nationalSkillGap:\n        sashiSkillTiebreak.nationalSkillGap,\n      reason: sashiSkillTiebreak.applied\n        ? "1逃げと2差しが2.5点以内で、2号艇の全国技量指数が1号艇を10点以上上回るため2差しを最終採用"\n        : ""\n    },`;
  const evidencePatched = `${evidenceBlock}\n    physicalThreeAttackPromotion: {\n      ...physicalThreeAttackPromotion,\n      reason: physicalThreeAttackPromotion.applied\n        ? "3号艇平均STが1号艇より0.01以上、2号艇より0.05以上速く、3攻め成立度60以上のため3攻めを最終採用"\n        : ""\n    },`;
  source = replaceExactlyOnce(source, evidenceBlock, evidencePatched, "promotion evidence");

  vm.runInThisContext(source, { filename: `${filename}:tmp-physical-three-promotion` });
}

function runWorker(mode) {
  global.window = global;
  require(path.join(ROOT, "js", "boat-identity"));
  if (mode === "patched") loadPatchedAiCore();
  else require(path.join(ROOT, "js", "ai-core"));
  require(path.join(ROOT, "js", "prediction"));
  const selector = require(path.join(ROOT, "js", "practical-selection"));

  const dir = path.join(ROOT, "data", "predictions");
  const seen = new Set();
  const races = [];

  for (const file of fs.readdirSync(dir).filter((name) => /^\d{8}\.json$/.test(name)).sort()) {
    const date = file.slice(0, 8);
    const dateNumber = Number(date);
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const record of rowsOf(doc)) {
      if (record?.result?.settled !== true) continue;
      const key = record.raceKey || `${date}-${record.jcd}-${record.raceNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const data = dataOf(record);
      const actual = ticketOf(record?.result?.resultTicket || record?.result?.review?.resultTicket);
      if (!data || !actual) continue;

      const prediction = global.createPrediction(data);
      const practical = selector.select(prediction);
      const selected = (practical?.tickets || []).map((row) => ticketOf(row?.ticket || row)).filter(Boolean);
      const analytical = prediction?.aiCore?.analysisRaceScenarios || prediction?.aiCore?.raceScenarios || {};
      const main = analytical?.mainScenario || {};
      const physical = analytical?.evidence?.physicalThreeAttackPromotion || null;
      const scenarioScores = Object.fromEntries(
        (analytical?.scenarios || []).map((scenario) => [scenario.type, Number(scenario.score || 0)])
      );

      races.push({
        key,
        date,
        period: periodOf(dateNumber),
        jcd: record.jcd,
        place: record.place,
        raceNo: record.raceNo,
        actual,
        actualHead: Number(actual[0]),
        hit: selected.includes(actual),
        selected,
        selectedCount: selected.length,
        mainType: main.type || "",
        mainHead: Number(main.headBoatNo || main.attackerBoatNo || main.attacker || prediction?.mainSheet?.honmei?.boatNo || 0),
        scenarioScores,
        physical
      });
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `physical-three-${mode}.json`),
    JSON.stringify({ mode, total: races.length, races }, null, 2)
  );
  console.log(JSON.stringify({ mode, total: races.length, hits: races.filter((race) => race.hit).length }));
}

function runChild(mode) {
  const child = spawnSync(process.execPath, [__filename, `--mode=${mode}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (child.status !== 0) {
    process.stderr.write(child.stdout || "");
    process.stderr.write(child.stderr || "");
    throw new Error(`${mode} worker failed (${child.status})`);
  }
  process.stdout.write(child.stdout || "");
}

function summarizePeriod(rows, baselineMap, patchedMap) {
  const result = { races: rows.length, baselineHits: 0, patchedHits: 0, gains: 0, losses: 0, net: 0, triggers: 0 };
  for (const row of rows) {
    const base = baselineMap.get(row.key);
    const patch = patchedMap.get(row.key);
    if (!base || !patch) continue;
    if (base.hit) result.baselineHits += 1;
    if (patch.hit) result.patchedHits += 1;
    if (!base.hit && patch.hit) result.gains += 1;
    if (base.hit && !patch.hit) result.losses += 1;
    if (patch.physical?.applied === true) result.triggers += 1;
  }
  result.net = result.patchedHits - result.baselineHits;
  return result;
}

function runParent() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  runChild("baseline");
  runChild("patched");

  const baseline = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "physical-three-baseline.json"), "utf8"));
  const patched = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "physical-three-patched.json"), "utf8"));
  const baselineMap = new Map(baseline.races.map((race) => [race.key, race]));
  const patchedMap = new Map(patched.races.map((race) => [race.key, race]));
  const common = baseline.races.filter((race) => patchedMap.has(race.key));
  const changed = [];

  for (const base of common) {
    const patch = patchedMap.get(base.key);
    if (
      base.hit !== patch.hit ||
      base.mainHead !== patch.mainHead ||
      base.selected.join(",") !== patch.selected.join(",")
    ) {
      changed.push({
        key: base.key,
        period: base.period,
        actual: base.actual,
        actualHead: base.actualHead,
        baseline: {
          hit: base.hit,
          mainHead: base.mainHead,
          mainType: base.mainType,
          selected: base.selected
        },
        patched: {
          hit: patch.hit,
          mainHead: patch.mainHead,
          mainType: patch.mainType,
          selected: patch.selected,
          physical: patch.physical
        }
      });
    }
  }

  const totalBaselineTickets = common.reduce((sum, race) => sum + race.selectedCount, 0);
  const totalPatchedTickets = common.reduce((sum, race) => sum + patchedMap.get(race.key).selectedCount, 0);
  const triggerRows = common
    .map((base) => ({ base, patch: patchedMap.get(base.key) }))
    .filter(({ patch }) => patch.physical?.applied === true);
  const triggerSummary = {
    count: triggerRows.length,
    actual1: triggerRows.filter(({ base }) => base.actualHead === 1).length,
    actual3: triggerRows.filter(({ base }) => base.actualHead === 3).length,
    otherHeads: triggerRows.filter(({ base }) => ![1, 3].includes(base.actualHead)).length,
    baselineHits: triggerRows.filter(({ base }) => base.hit).length,
    patchedHits: triggerRows.filter(({ patch }) => patch.hit).length,
    gains: triggerRows.filter(({ base, patch }) => !base.hit && patch.hit).length,
    losses: triggerRows.filter(({ base, patch }) => base.hit && !patch.hit).length
  };
  triggerSummary.net = triggerSummary.patchedHits - triggerSummary.baselineHits;

  const report = {
    sourceMainExpected: "a6751df60caba8ae0d82a0ff7ad3654b370cc9da",
    baselineRaceCount: baseline.total,
    patchedRaceCount: patched.total,
    commonRaceCount: common.length,
    expectedHandoffRaceCount: 867,
    sameRaceUniverseAsHandoff: common.length === 867,
    total: summarizePeriod(common, baselineMap, patchedMap),
    periods: Object.fromEntries(
      ["pre", "mid", "recent"].map((period) => [
        period,
        summarizePeriod(common.filter((race) => race.period === period), baselineMap, patchedMap)
      ])
    ),
    selectedTicketCount: {
      baseline: totalBaselineTickets,
      patched: totalPatchedTickets,
      delta: totalPatchedTickets - totalBaselineTickets
    },
    triggerSummary,
    gains: changed.filter((row) => !row.baseline.hit && row.patched.hit),
    losses: changed.filter((row) => row.baseline.hit && !row.patched.hit),
    changedRaceCount: changed.length,
    changed
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "physical-three-final-validation.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify({
    raceCount: report.commonRaceCount,
    same867: report.sameRaceUniverseAsHandoff,
    total: report.total,
    periods: report.periods,
    tickets: report.selectedTicketCount,
    triggers: report.triggerSummary
  }, null, 2));

  if (baseline.total !== patched.total || common.length !== baseline.total) {
    throw new Error("baseline/patched race universe mismatch");
  }
}

if (MODE === "baseline" || MODE === "patched") runWorker(MODE);
else runParent();
