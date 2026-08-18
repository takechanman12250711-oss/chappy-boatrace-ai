"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const selector = require("../js/practical-selection");

const ROOT = path.resolve(__dirname, "..");
const FROZEN_DATE = "20260813";
const FORBIDDEN_USER_TEXT = /流し|2連単/;
const DISPLAY_FIELDS = [
  "displayCategory",
  "scenarioType",
  "scenarioTitle",
  "scenarioSummary",
  "title",
  "summary",
  "reason",
  "comment"
];
const COURSE2_PRUNE_REASON = "SECOND_COURSE_HEAD_CANDIDATE_PROMOTION_PRUNED";

function source(file) { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
function runtimeVersion(text, label) { const match = text.match(/const VERSION = "([^"]+)"/); assert.ok(match?.[1], `${label}: runtime VERSIONを持つ`); return match[1]; }
const predictionRuntimeSource = source("js/prediction-runtime-loader.js");
const appRuntimeSource = source("js/app-runtime-loader.js");
const indexSource = source("index.html");
const predictionRuntimeVersion = runtimeVersion(predictionRuntimeSource, "prediction runtime");
runtimeVersion(appRuntimeSource, "app runtime");
assert.match(indexSource,new RegExp(`js/prediction-runtime-loader\\.js\\?v=${predictionRuntimeVersion.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`),"HTMLから現在のprediction runtime世代へ到達する");
assert.match(indexSource,/js\/app-runtime-loader\.js\?v=[^"']+/,"HTMLからapp runtimeへversion付きで到達する");
const frozenDay = JSON.parse(source(`data/predictions/${FROZEN_DATE}.json`));
const frozenRows = [...(frozenDay.predictions || []),...(frozenDay.verificationPredictions || [])];
const REPLAY_CASES = [
  {
    raceKey: "20260813-23-5",
    expectedTickets: ["1-2-3","1-4-3","1-3-4","2-1-5","2-1-6","1-2-4","1-2-6","1-2-5"],
    expectedPrunedCandidates: ["2-3-1"]
  },
  {
    raceKey: "20260813-23-2",
    expectedTickets: ["1-2-3","1-4-3","1-3-4","2-1-5","2-1-6","1-2-4","1-2-5","1-2-6"],
    expectedPrunedCandidates: ["2-1-3", "2-1-4"]
  }
];
function replayInput(record) {
  const frozen = record?.prediction?.preRaceConditions;
  assert.ok(frozen && Array.isArray(frozen.boats) && frozen.boats.length === 6,`${record?.raceKey}: 6艇の締切前凍結入力`);
  assert.equal(frozen.officialResultUsed, false, `${record.raceKey}: 結果を再生入力へ混ぜない`);
  return {...frozen,entries:frozen.boats.map(boat => ({ ...boat, waku: boat.boatNo })),boats:frozen.boats,date:record.date,jcd:record.jcd,stadiumCode:record.jcd,venueCode:record.jcd,place:record.place,stadiumName:record.place,placeName:record.place,venueName:record.place,raceNo:record.raceNo,rno:record.raceNo,deadlineAt:record.deadlineAt,weather:frozen.weather || {}};
}
function ticketValues(rows) { return rows.map(row => String(row?.ticket || row || "")); }
for (const replayCase of REPLAY_CASES) {
  const record = frozenRows.find(row => row.raceKey === replayCase.raceKey);
  assert.ok(record, `${replayCase.raceKey}: 凍結行`);
  const prediction = global.createPrediction(replayInput(record));
  assert.equal(prediction?.raceScenarios?.evidence?.sashiSkillTiebreak?.applied,false,`${record.raceKey}: #305強制タイブレーク停止を固定`);
  const selection = selector.select(prediction);
  const rows = selection.tickets || [];
  assert.equal(selection.status, "selected", `${record.raceKey}: production型再生`);
  assert.deepEqual(ticketValues(rows),replayCase.expectedTickets,`${record.raceKey}: 買い目配列・順番・点数を固定`);
  for (const ticket of replayCase.expectedPrunedCandidates || []) {
    const decision = (selection.candidateDecisions || []).find(row => row.ticket === ticket && row.reasonCode === COURSE2_PRUNE_REASON);
    assert.ok(decision,`${record.raceKey}: ${ticket}を承認済み実2コースcandidate90除外として監査保存`);
    assert.equal(decision.selected, false, `${record.raceKey}: ${ticket}は購入しない`);
  }
  rows.forEach(row => {
    DISPLAY_FIELDS.forEach(field => assert.doesNotMatch(String(row?.[field] || ""),FORBIDDEN_USER_TEXT,`${record.raceKey} ${row.ticket}: ${field}の禁則語`));
    assert.ok(String(row.displayCategory || ""), `${record.raceKey} ${row.ticket}: 表示カテゴリ必須`);
  });
  const formationRows = rows.filter(row => row.category === "流し");
  assert.equal(formationRows.length, 2, `${record.raceKey}: 正規フォーメーションは2券一組`);
  assert.ok(formationRows.every(row => row.displayCategory === "フォーメーション"),`${record.raceKey}: 正規2券の表示カテゴリ`);
}
console.log("formation display current production contract: OK",JSON.stringify({predictionRuntimeVersion,date:FROZEN_DATE,races:REPLAY_CASES.map(item => item.raceKey),pointCounts:REPLAY_CASES.map(item => item.expectedTickets.length),prunedCandidateCount:REPLAY_CASES.reduce((sum, item) => sum + (item.expectedPrunedCandidates || []).length, 0)}));
