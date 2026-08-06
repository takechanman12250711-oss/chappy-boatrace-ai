"use strict";
const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const notApplied = snapshot.frameRiseSinkEvidence({
  frameRiseSinkSupport: { approved: true, applied: false, frameNo: 4, type: "rise", samples: 20, rate: 65, source: "venue-frame-validation" }
});
assert.equal(notApplied.formal, false, "承認済みでも実際に使っていなければ正式証拠にしない");

const notApproved = snapshot.frameRiseSinkEvidence({
  frameRiseSinkSupport: { approved: false, applied: true, frameNo: 4, type: "rise", samples: 20, rate: 65, source: "venue-frame-validation" }
});
assert.equal(notApproved.formal, false, "未承認の枠傾向を正式証拠にしない");

const insufficient = snapshot.frameRiseSinkEvidence({
  frameRiseSinkSupport: { approved: true, applied: true, frameNo: 4, type: "rise", samples: 9, rate: 65, source: "venue-frame-validation" }
});
assert.equal(insufficient.formal, false, "10件未満は蓄積中として正式証拠にしない");

const prediction = {
  frameRiseSinkSupport: { approved: true, applied: true, frameNo: 4, type: "rise", samples: 12, rate: 66.7, source: "venue-frame-validation-approved" }
};
const claim = snapshot.frameRiseSinkClaimForTicket(prediction, "1-4-3");
assert.ok(claim);
assert.equal(claim.theoryKey, "frameRiseSink");
assert.equal(snapshot.frameRiseSinkClaimForTicket(prediction, "1-2-3"), null, "対象枠を含まない買い目へ帰属しない");

const built = snapshot.build(prediction, [{ ticket: "1-4-3", category: "本線" }]);
const theory = built.theories.find(row => row.theoryKey === "frameRiseSink");
assert.ok(theory);
assert.equal(theory.formal, true);
assert.equal(built.usableForPrediction, false);
assert.equal(built.automaticApplication, false);
console.log("frame rise sink formal evidence tests passed");
