"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "js", "ai-core.js"), "utf8");
const dir = path.join(root, "data", "predictions");
const rows = (d) => [
  ...(d.predictions || []),
  ...(d.verificationPredictions || [])
];

const variants = [
  { name: "current" },
  { name: "score75_plus6", min: 75, bonus: 6, edge: false },
  { name: "score75_plus8", min: 75, bonus: 8, edge: false },
  { name: "score75_edge_plus8", min: 75, bonus: 8, edge: true },
  { name: "score78_edge_plus10", min: 78, bonus: 10, edge: true }
];

function sourceFor(v) {
  if (v.name === "current") return src;
  const anchor = "  fourAttackScore += fourAttackNewSam;";
  const edgeCondition = v.edge ? " && fourVsThree > 0" : "";
  const extra = `\n  {\n    const modernFourAttack = attackTheoryForCourse(4);\n    if (\n      modernFourAttack?.isAdopted === true &&\n      toNumber(modernFourAttack?.score, 0) >= ${v.min}${edgeCondition}\n    ) {\n      fourAttackScore += ${v.bonus};\n    }\n  }`;
  if (!src.includes(anchor)) throw new Error("anchor missing");
  return src.replace(anchor, anchor + extra);
}

function loadCore(v) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    window: {},
    module: { exports: {} },
    exports: {},
    require,
    Number,
    Math,
    Map,
    Set,
    Array,
    Object,
    String,
    Boolean,
    RegExp,
    Date,
    JSON
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(sourceFor(v), sandbox);
  return sandbox.ChappyAICore;
}

function dataOf(r) {
  const p = r?.prediction?.preRaceConditions || r?.preRaceConditions;
  if (!p || !Array.isArray(p.boats) || p.boats.length < 5) return null;
  return {
    ...p,
    entries: p.boats,
    boats: p.boats,
    jcd: r.jcd,
    stadiumCode: r.jcd,
    venueCode: r.jcd,
    placeName: r.place,
    venueName: r.place,
    raceNo: r.raceNo,
    rno: r.raceNo,
    weather: p.weather || {}
  };
}

function ticketKey(v) {
  const m = String(v?.ticket || v || "").match(/[1-6]/g) || [];
  return m.length >= 3 ? m.slice(0, 3).join("-") : "";
}

function list(v) {
  return (Array.isArray(v) ? v : []).map(ticketKey).filter(Boolean);
}

const records = [];
for (const file of fs.readdirSync(dir).filter((x) => /^202608(0[7-9]|10)\.json$/.test(x))) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  for (const r of rows(data)) {
    if (r?.result?.settled !== true) continue;
    const replay = dataOf(r);
    const actual = ticketKey(r?.result?.resultTicket || r?.result?.review?.resultTicket);
    if (replay && actual) records.push({ r, replay, actual });
  }
}

const cores = Object.fromEntries(variants.map((v) => [v.name, loadCore(v)]));
const out = {};
for (const v of variants) {
  out[v.name] = {
    scenario: { escape: 0, sashi: 0, threeAttack: 0, fourAttack: 0 },
    headCorrect: 0,
    fourHeadCorrect: 0,
    fourSelected: 0,
    mainHit: 0,
    mainSafetyHit: 0,
    allHit: 0,
    gainedMain: 0,
    lostMain: 0
  };
}

const base = new Map();
for (const x of records) {
  for (const v of variants) {
    const ai = cores[v.name].buildPredictionData(x.replay);
    const z = out[v.name];
    const type = ai?.raceScenarios?.mainScenario?.type || "unknown";
    const head = Number(
      ai?.raceScenarios?.mainScenario?.outcome?.firstCandidates?.[0]?.boatNo ||
      ai?.raceScenarios?.mainScenario?.attacker ||
      0
    );
    const fm = ai?.formations || {};
    const main = list(fm.main);
    const safety = list(fm.safety);
    const flow = list(fm.flow);
    const hole = list(fm.longshot);
    const actualHead = Number(x.actual[0]);

    z.scenario[type] = (z.scenario[type] || 0) + 1;
    if (head === actualHead) z.headCorrect += 1;
    if (type === "fourAttack") z.fourSelected += 1;
    if (type === "fourAttack" && actualHead === 4) z.fourHeadCorrect += 1;

    const mainHit = main.includes(x.actual);
    const mainSafetyHit = [...main, ...safety].includes(x.actual);
    const allHit = [...main, ...safety, ...flow, ...hole].includes(x.actual);
    if (mainHit) z.mainHit += 1;
    if (mainSafetyHit) z.mainSafetyHit += 1;
    if (allHit) z.allHit += 1;

    const key = x.r.raceKey || `${x.r.jcd}-${x.r.raceNo}`;
    if (v.name === "current") {
      base.set(key, { mainHit });
    } else {
      const b = base.get(key);
      if (b && !b.mainHit && mainHit) z.gainedMain += 1;
      if (b && b.mainHit && !mainHit) z.lostMain += 1;
    }
  }
}

for (const v of variants.slice(1)) {
  const z = out[v.name];
  const c = out.current;
  z.delta = {
    headCorrect: z.headCorrect - c.headCorrect,
    mainHit: z.mainHit - c.mainHit,
    mainSafetyHit: z.mainSafetyHit - c.mainSafetyHit,
    allHit: z.allHit - c.allHit
  };
}

console.log(JSON.stringify({ records: records.length, out }, null, 2));