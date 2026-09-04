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
      4: { course: 4 }
    }
  },
  mainSheet: {
    tickets: [
      { ticket: "1-2-3", scenarioSummary: "generic flow summary" },
      { ticket: "1-2-4", scenarioSummary: "generic flow summary" }
    ]
  },
  ticketSheets: {
    main: [
      { ticket: "1-2-3", scenarioSummary: "generic flow summary" },
      { ticket: "1-2-4", scenarioSummary: "generic flow summary" }
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

assert.match(loader, /final-ticket-reason-fix\.js/);
assert.match(loader, /20260905-ticket-reason1/);

console.log("ticket-specific reasons: ok");
