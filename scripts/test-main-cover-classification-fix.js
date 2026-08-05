const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/main-cover-classification-fix.js", "utf8");
const context = {
  window: {
    createPrediction() {
      return {
        formation: {
          main: ["3-1-5", "3-1-6"],
          cover: ["1-2-5", "1-2-6"]
        },
        ticketSheets: {
          main: [
            { ticket: "3-1-5", role: "本命", roleLabels: ["本命", "中心展開", "流し"], reason: "本線候補" }
          ],
          cover: [
            { ticket: "1-2-5", role: "押さえ", roleLabels: ["押さえ", "安全押さえ"], reason: "押さえ候補" }
          ],
          flow: [{ ticket: "3-1-5", roleLabels: ["流し"] }],
          hole: []
        },
        mainSheet: {
          tickets: [{ ticket: "3-1-5", role: "本命" }],
          coverTickets: [{ ticket: "1-2-5", role: "押さえ" }]
        },
        aiTicketList: [
          { ticket: "3-1-5", role: "本命", roleLabels: ["本命", "流し"] },
          { ticket: "1-2-5", role: "押さえ", roleLabels: ["押さえ"] }
        ]
      };
    }
  }
};
context.globalThis = context.window;
vm.createContext(context);
vm.runInContext(source, context);

const result = context.window.createPrediction();
assert.deepStrictEqual(Array.from(result.formation.main), ["1-2-5", "1-2-6"]);
assert.deepStrictEqual(Array.from(result.formation.cover), ["3-1-5", "3-1-6"]);
assert.strictEqual(result.ticketSheets.main[0].ticket, "1-2-5");
assert.strictEqual(result.ticketSheets.main[0].role, "本命");
assert.strictEqual(result.ticketSheets.cover[0].ticket, "3-1-5");
assert.strictEqual(result.ticketSheets.cover[0].role, "押さえ");
assert.strictEqual(result.mainSheet.tickets[0].ticket, "1-2-5");
assert.strictEqual(result.mainSheet.coverTickets[0].ticket, "3-1-5");
const aiMain = result.aiTicketList.find(item => item.ticket === "1-2-5");
const aiCover = result.aiTicketList.find(item => item.ticket === "3-1-5");
assert.strictEqual(aiMain.role, "本命");
assert.strictEqual(aiCover.role, "押さえ");
assert(!aiCover.roleLabels.includes("流し"));
console.log("main-cover classification fix: ok");
