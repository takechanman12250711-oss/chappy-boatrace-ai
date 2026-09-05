"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/final-ticket-reason-fix.js", "utf8");
const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const api = sandbox.ChappyTicketSpecificReason;
assert.ok(api, "ticket-specific reason helper is exposed");

const prediction = {
  indexes: {
    byBoat: {
      1: { course: 1 },
      2: { course: 2 },
      3: { course: 3 },
      4: { course: 4 },
      5: { course: 5 }
    }
  },
  mainSheet: {
    tickets: [
      { ticket: "1-2-3", scenarioSummary: "generic flow summary" },
      { ticket: "1-2-4", scenarioSummary: "generic flow summary" }
    ],
    flowTickets: ["1-2-3", "1-2-4", "1-3-2"]
  },
  manshuSheet: {
    tickets: [
      { ticket: "5-1-2", odds: 120.4 },
      { ticket: "5-1-3", odds: 135.2 },
      { ticket: "5-1-4", odds: 98.8 },
      { ticket: "4-1-2", odds: 150.0 }
    ]
  },
  ticketSheets: {
    main: [
      { ticket: "1-2-3", scenarioSummary: "generic flow summary" },
      { ticket: "1-2-4", scenarioSummary: "generic flow summary" }
    ]
  },
  practicalSelection: {
    status: "selected",
    tickets: [
      { ticket: "1-2-3", amountYen: 500 },
      { ticket: "1-2-3", amountYen: 500 },
      { ticket: "1-2-4", units: 3 }
    ]
  }
};

assert.equal(
  api.reasonFor("1-2-3", prediction),
  "1号艇のイン先マイを軸に、2号艇の差し残りを2着、3号艇のセンターの3着を3着で評価。"
);
assert.equal(
  api.reasonFor("1-2-4", prediction),
  "1号艇のイン先マイを軸に、2号艇の差し残りを2着、4号艇のカドの3着を3着で評価。"
);
assert.notEqual(
  api.reasonFor("1-2-3", prediction),
  api.reasonFor("1-2-4", prediction),
  "different exact tickets must not share one generic explanation"
);

const prepared = api.prepare(prediction);
assert.match(prepared.mainSheet.tickets[0].reason, /1号艇のイン先マイ/);
assert.match(prepared.mainSheet.tickets[0].reason, /3号艇/);
assert.match(prepared.mainSheet.tickets[1].reason, /4号艇/);
assert.equal(prediction.mainSheet.tickets[0].scenarioSummary, "generic flow summary");

const flow = prepared.mainSheet.flowFormations.find(row => row.notation === "1-2-34");
assert.ok(flow, "flow exact tickets should be restored as a formation");
assert.equal(flow.pointCount, 2);
assert.equal(flow.expandedTickets.join(","), "1-2-3,1-2-4");

const manshu = api.buildManshuFormations(prediction);
assert.equal(manshu.length, 1, "only a multi-point true manshu group should be shown");
assert.equal(manshu[0].notation, "5-1-23");
assert.equal(manshu[0].pointCount, 2);
assert.equal(manshu[0].minOdds, 120.4);
assert.equal(manshu[0].maxOdds, 135.2);
assert.ok(!manshu[0].expandedTickets.includes("5-1-4"), "sub-100x ticket must not enter manshu formation");
assert.ok(!manshu.some(row => row.notation === "4-1-2"), "single exact manshu ticket must not be rendered as the manshu board");

const practical = api.practicalRows(prediction);
assert.equal(practical.length, 2, "final purchase summary should dedupe repeated tickets");
assert.equal(practical[0].notation, "1-2-3");
assert.equal(practical[0].amount, 500);
assert.equal(practical[1].notation, "1-2-4");
assert.equal(practical[1].amount, 300);

assert.match(loader, /final-ticket-reason-fix\.js/);
assert.match(loader, /20260905-ticket-reason3-unified/);

console.log("ticket-specific reasons + unified formations: ok");
