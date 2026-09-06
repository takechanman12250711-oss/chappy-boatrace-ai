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
// Regression: the base renderer must receive the prepared copy, regardless
// of the different installation timers used by the base and final owner.
{
  let tick,received,paintQueries=0;
  const queued=[];
  const original=()=>"unwrapped";
  const paintWindow={
    document:{documentElement:{},querySelector(){paintQueries++;return null;},getElementById(){return null;}},
    ChappyFinalMobileUi:{},renderAll:original,
    setInterval(callback){tick=callback;return 1;},clearInterval(){},
    setTimeout(callback){queued.push(callback);return queued.length;}
  };
  vm.runInNewContext(source,{window:paintWindow});
  tick();
  assert.equal(paintWindow.renderAll,original,"do not install inside a not-yet-ready base renderer");
  const base=function(input){received=input;return "rendered";};
  base.__chappyFinalMobileUiWrapped=true;
  paintWindow.renderAll=base;
  tick();
  assert.equal(paintWindow.renderAll(prediction),"rendered");
  assert.match(received.mainSheet.tickets[0].reason,/3号艇/);
  assert.match(received.mainSheet.tickets[1].reason,/4号艇/);
  assert.notEqual(received,prediction);
  assert.equal(received.practicalSelection,prediction.practicalSelection);
  paintWindow.renderAll({...prediction,raceKey:"newer-race"});
  queued.shift()();
  assert.equal(paintQueries,0,"a previous race must not repaint after a newer render");
  queued.shift()();
  assert.ok(paintQueries>0,"the current race must still finish painting");

  const paintApi=paintWindow.ChappyFinalDisplayOwner;
  const formation={notation:"12-345-全",pointCount:24,reason:"既存の根拠を保持。"};
  const display={mainSheet:{flowFormations:[formation]},odds:{"1-3-2":31.6,"1-4-2":44.2}};
  let rewritten=0,inserted="";
  const card={querySelector(selector){return {textContent:selector === ".chappy-final-buy-formation" ? "12-345-全" : "24点"};}};
  const existing={open:false,querySelectorAll(){return [card];},set outerHTML(value){rewritten++;inserted=value;}};
  const box={querySelector(){return existing;},insertAdjacentHTML(_where,value){inserted=value;}};
  paintWindow.document.querySelector=()=>box;
  paintApi.ensureFormationGroup(display);
  assert.equal(rewritten,0,"preserve matching full formation DOM, odds, reasons and listeners");
  assert.equal(existing.open,false,"do not force the formation accordion open");
  box.querySelector=()=>null;
  paintApi.ensureFormationGroup(display);
  assert.match(inserted,/12-345-全/);
  assert.match(inserted,/24点/);
  assert.match(inserted,/chappy-final-buy-odds[^>]*>31\.6倍/);
  assert.match(inserted,/既存の根拠を保持。/);
  assert.doesNotMatch(inserted,/<details[^>]*\bopen\b/);
  paintApi.ensureFormationGroup({mainSheet:{flowFormations:[formation]}});
  assert.match(inserted,/オッズ未取得/);
  assert.equal(display.mainSheet.flowFormations[0],formation);
}
console.log("active owner ticket-specific reasons + full formation/purchase separation: ok");
