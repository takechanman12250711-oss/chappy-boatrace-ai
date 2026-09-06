"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("js/final-display-owner-v2.js", "utf8");
const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const window = {
  document: { documentElement: {} },
  setInterval() { return 1; },
  clearInterval() {}
};
vm.runInNewContext(source, { window });
const api = window.ChappyFinalDisplayOwner;
assert.ok(api, "test the actively loaded owner, not the retired renderer");
const prediction = {
  indexes: { byBoat: { 1:{course:1}, 2:{course:2}, 3:{course:3}, 4:{course:4}, 5:{course:5} } },
  mainSheet: {
    tickets: [
      {ticket:"1-2-3", scenarioSummary:"generic flow summary", priorityScore:82},
      {ticket:"1-2-4", scenarioSummary:"generic flow summary", priorityScore:79}
    ],
    flowTickets:["1-2-3","1-2-4","1-3-2"]
  },
  manshuSheet: {tickets:[
    {ticket:"5-1-2",odds:120.4}, {ticket:"5-1-3",odds:135.2},
    {ticket:"5-1-4",odds:98.8}, {ticket:"4-1-2",odds:150}
  ]},
  ticketSheets: { main:[
    {ticket:"1-2-3",scenarioSummary:"generic flow summary"},
    {ticket:"1-2-4",scenarioSummary:"generic flow summary"}
  ]},
  practicalSelection: {status:"selected",tickets:[
    {ticket:"1-2-3",amountYen:500}, {ticket:"1-2-3",amountYen:500},
    {ticket:"1-2-4",units:3}
  ]}
};
const before = JSON.stringify(prediction);
assert.equal(api.reasonFor("1-2-3",prediction), "1号艇のイン先マイを軸に、2号艇の差し残りを2着、3号艇のセンターの3着を3着で評価。");
assert.equal(api.reasonFor("1-2-4",prediction), "1号艇のイン先マイを軸に、2号艇の差し残りを2着、4号艇のカドの3着を3着で評価。");
assert.notEqual(api.reasonFor("1-2-3",prediction),api.reasonFor("1-2-4",prediction));
const prepared = api.prepare(prediction);
assert.match(prepared.mainSheet.tickets[0].reason,/1号艇のイン先マイ/);
assert.match(prepared.mainSheet.tickets[0].reason,/3号艇/);
assert.match(prepared.mainSheet.tickets[1].reason,/4号艇/);
assert.match(prepared.ticketSheets.main[1].scenarioSummary,/4号艇/);
assert.equal(prepared.mainSheet.tickets[0].priorityScore,82);
assert.equal(prepared.mainSheet.tickets[1].priorityScore,79);
assert.equal(prepared.practicalSelection,prediction.practicalSelection,"display must not rewrite selected purchases");
assert.equal(JSON.stringify(prediction),before,"the complete input must remain unchanged");
const flow = prepared.mainSheet.flowFormations.find(r=>r.notation==="1-2-34");
assert.ok(flow);
assert.equal(flow.pointCount,2);
assert.equal(flow.expandedTickets.join(","),"1-2-3,1-2-4");
const manshu = api.buildManshuFormations(prediction);
assert.equal(manshu.length,1);
assert.equal(manshu[0].notation,"5-1-23");
assert.equal(manshu[0].pointCount,2);
assert.equal(manshu[0].minOdds,120.4);
assert.equal(manshu[0].maxOdds,135.2);
assert.ok(!manshu[0].expandedTickets.includes("5-1-4"));
assert.ok(!manshu.some(r=>r.notation==="4-1-2"));
const practical = api.practicalRows(prediction);
assert.equal(practical.length,2);
assert.equal(practical[0].notation,"1-2-3");
assert.equal(practical[0].amount,500);
assert.equal(practical[1].notation,"1-2-4");
assert.equal(practical[1].amount,300);
for (const value of ["12-3-4","1-2-34","1-1-2","x1-2-3x"]) {
  assert.equal(api.exactTicket(value),"",`${value} must not be misread as one exact ticket`);
  assert.equal(api.reasonFor(value,prediction),"");
}
assert.equal(api.exactTicket(" 1 → 2 → 3 "),"1-2-3");
const full = {notation:"12-345-全",pointCount:24,expandedTickets:api.expandNotation("12-345-全")};
const fullPrediction = {...prediction,mainSheet:{...prediction.mainSheet,flowFormations:[full]}};
assert.equal(api.prepare(fullPrediction).mainSheet.flowFormations[0],full);
assert.equal(api.expandNotation("12-345-全").length,24);
assert.equal(api.expandNotation("4-23-全").length,8);
assert.match(loader,/final-display-owner-v2\.js/);
assert.doesNotMatch(loader,/js\/final-ticket-reason-fix\.js/);
console.log("active owner ticket-specific reasons + full formation/purchase separation: ok");
