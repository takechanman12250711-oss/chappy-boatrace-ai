"use strict";

const assert = require("node:assert/strict");
const candidates = require("../js/evaluated-scenario-candidates");

const evaluations = [1, 2, 3, 4, 5, 6].map((boatNo) => ({
  boatNo,
  course: boatNo,
  score: boatNo === 4 ? 84 : 70,
  total: boatNo === 4 ? 84 : 70,
  attack: boatNo === 1 ? 80 : boatNo === 4 ? 78 : 0,
  hold: boatNo === 4 ? 82 : boatNo === 2 ? 72 : 0,
  pickup: boatNo === 4 ? 76 : boatNo === 3 ? 72 : 0,
  comment: boatNo === 4 ? "4号艇を相手本線・残し・拾いで評価" : `${boatNo}号艇評価`
}));

const row = (boatNo, score, reason) => ({
  boatNo,
  course: boatNo,
  score,
  reason,
  qualified: true,
  isAdopted: true
});

const built = candidates.build({
  mainSheet: {
    honmei: evaluations[0],
    taikou: evaluations[3],
    ana: evaluations[2],
    osae: evaluations[1],
    evaluations,
    tickets: ["1-4-3", "1-4-2"],
    coverTickets: ["1-2-4"]
  },
  boatEvaluation: {
    honmei: evaluations[0],
    taikou: evaluations[3],
    ana: evaluations[2],
    osae: evaluations[1],
    evaluations
  },
  formation: {
    main: ["1-4-3", "1-4-2"],
    cover: ["1-2-4"]
  },
  raceFlow: {
    title: "江戸川1R型・4号艇評価反映確認",
    summary: "1号艇主筋で4号艇の2着残しと3着拾いを評価",
    attackBoats: [row(1, 80, "1号艇の主筋"), row(4, 78, "4号艇の攻め候補")],
    holdBoats: [row(2, 72, "2号艇の内残し"), row(4, 82, "4号艇の2着残し")],
    pickupBoats: [row(3, 72, "3号艇の3着拾い"), row(4, 76, "4号艇の3着拾い")],
    phases: {
      firstMark: {
        mainAttack: row(1, 80, "1号艇の主筋"),
        mainHold: row(4, 82, "4号艇が残す")
      },
      back: {
        leader: row(1, 80, "1号艇先頭"),
        hold: row(4, 82, "4号艇が追走")
      },
      secondMark: {
        mainHold: row(4, 82, "4号艇が残す")
      },
      goal: {
        expectedOrder: [1, 4, 3]
      }
    }
  }
});

const boat4Target = built.targets.find((target) => target.boatNo === 4);
assert.ok(boat4Target, "4号艇の評価対象が消えてはいけない");
assert.ok(boat4Target.candidateTickets.length > 0, "4号艇を含む物理候補が最低1点必要");
assert.ok(boat4Target.qualifiedCandidateTickets.length > 0, "4号艇を含む構造化候補が最低1点必要");
assert.equal(built.integrity.missingPhysicalCandidateTargetIds.includes(boat4Target.id), false);
assert.equal(built.integrity.missingStructuredEvidenceTargetIds.includes(boat4Target.id), false);

const boat4Tickets = built.candidatePool
  .filter((candidate) => candidate.ticket.split("-").includes("4"))
  .map((candidate) => candidate.ticket);

assert.ok(boat4Tickets.includes("1-4-3"), "4号艇2着残しの本線候補を保持する");
assert.ok(boat4Tickets.includes("1-2-4"), "4号艇3着拾いの押さえ候補を保持する");

console.log(JSON.stringify({
  ok: true,
  boat4Status: boat4Target.status,
  candidateCount: boat4Target.candidateTickets.length,
  qualifiedCount: boat4Target.qualifiedCandidateTickets.length,
  checkedTickets: ["1-4-3", "1-2-4"]
}));
