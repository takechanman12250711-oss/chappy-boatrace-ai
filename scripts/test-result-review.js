"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const review = require("./build-result-review");

assert.equal(
  review.classifyMiss(["1-2-3"], "1-2-3"),
  "的中"
);
assert.equal(
  review.classifyMiss(["1-2-3"], "2-1-3"),
  "頭外れ"
);
assert.equal(
  review.classifyMiss(["1-2-3"], "1-3-2"),
  "着順違い"
);
assert.equal(
  review.classifyMiss(["1-2-4"], "1-2-3"),
  "相手抜け"
);
assert.equal(
  review.classifyMiss(["1-4-5"], "1-2-3"),
  "完全抜け"
);

const hit = review.buildReview({
  prediction: {
    mainSheet: {
      honmei: { boatNo: 1 },
      taikou: { boatNo: 2 },
      ana: { boatNo: 3 },
      osae: { boatNo: 4 }
    },
    practicalTickets: [
      { ticket: "1-2-3" }
    ]
  },
  result: {
    settled: true,
    resultTicket: "1-2-3",
    practicalHit: true,
    verification: {
      structuredScenarioMatch: true
    }
  }
});

assert.equal(hit.practicalHit, true);
assert.equal(hit.missType, "的中");
assert.equal(hit.scenarioMatch, true);
assert.ok(hit.causeCodes.includes("mark.honmei.first"));
assert.ok(hit.summary.includes("的中"));

const miss = review.buildReview({
  prediction: {
    mainSheet: {
      honmei: { boatNo: 1 },
      taikou: { boatNo: 3 },
      ana: { boatNo: 4 },
      osae: { boatNo: 5 }
    },
    practicalTickets: [
      { ticket: "1-2-4" }
    ]
  },
  result: {
    settled: true,
    resultTicket: "2-3-6",
    practicalHit: false,
    verification: {
      structuredScenarioMatch: false
    }
  }
});

assert.equal(miss.missType, "頭外れ");
assert.equal(miss.scenarioMatch, false);
assert.ok(miss.weaknesses.some(text => text.includes("◎1号艇")));
assert.ok(miss.summary.includes("不的中"));

assert.equal(
  review.scenarioMatchOf({ verification: { scenarioMatched: true } }),
  true,
  "公式照合が保存するscenarioMatchedを読む"
);
assert.equal(
  review.scenarioMatchOf({ scenarioMatched: false }),
  false,
  "結果直下のscenarioMatchedを読む"
);
assert.equal(
  review.scenarioMatchOf({
    scenarioMatched: true,
    scenarioVerification: { status: "missed" }
  }),
  false,
  "1着艇と決まり手の正式判定を汎用scenarioMatchedより優先する"
);
assert.equal(
  review.scenarioMatchOf({
    verification: { scenarioVerification: { status: "matched" } }
  }),
  true,
  "verification配下の正式判定も読む"
);
assert.equal(
  review.scenarioMatchOf({
    scenarioMatched: true,
    scenarioVerification: { status: "not_comparable" }
  }),
  null,
  "比較不能を汎用一致値で上書きしない"
);
assert.equal(
  review.scenarioMatchOf({ scenarioVerification: { status: "matched" } }),
  true,
  "旧保存データは照合statusから補完する"
);
assert.equal(
  review.scenarioMatchOf({ scenarioVerification: { status: "not_comparable" } }),
  null,
  "比較不能を展開不一致へ変換しない"
);

const unknownScenario = review.buildReview({
  prediction: {
    mainSheet: { honmei: { boatNo: 1 } },
    practicalTickets: [{ ticket: "1-2-3" }]
  },
  result: {
    settled: true,
    resultTicket: "2-1-3",
    practicalHit: false,
    scenarioVerification: { status: "not_comparable" }
  }
});
assert.equal(unknownScenario.scenarioMatch, null);
assert.ok(!unknownScenario.causeCodes.includes("scenario.miss"));

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "result-review-idempotency-")
);
const fixturePath = path.join(temporaryRoot, "20260813.json");
const fixture = {
  predictions: [{
    raceKey: "20260813-01-1",
    prediction: {
      mainSheet: {
        honmei: { boatNo: 1 },
        taikou: { boatNo: 2 },
        ana: { boatNo: 3 },
        osae: { boatNo: 4 }
      },
      practicalTickets: [{ ticket: "1-2-3" }]
    },
    result: {
      settled: true,
      resultTicket: "1-2-3",
      practicalHit: true,
      verification: {
        structuredScenarioMatch: true
      }
    }
  }],
  verificationPredictions: []
};
fixture.predictions[0].result.review = {
  ...review.buildReview(fixture.predictions[0]),
  generatedAt: "2026-08-13T00:00:00.000Z"
};

try {
  fs.writeFileSync(
    fixturePath,
    `${JSON.stringify(fixture, null, 2)}\n`,
    "utf8"
  );
  const originalBytes = fs.readFileSync(fixturePath, "utf8");

  assert.equal(
    review.updateFile(fixturePath),
    false,
    "意味内容が同じレビューはgeneratedAtだけで更新しない"
  );
  assert.equal(
    fs.readFileSync(fixturePath, "utf8"),
    originalBytes,
    "意味内容が同じ日次予想JSONをbyte単位で維持する"
  );

  const changed = JSON.parse(originalBytes);
  changed.predictions[0].result.resultTicket = "2-1-3";
  changed.predictions[0].result.practicalHit = false;
  fs.writeFileSync(
    fixturePath,
    `${JSON.stringify(changed, null, 2)}\n`,
    "utf8"
  );

  assert.equal(
    review.updateFile(fixturePath),
    true,
    "公式結果の意味内容が変わった時だけレビューを更新する"
  );
  const updatedBytes = fs.readFileSync(fixturePath, "utf8");
  const updated = JSON.parse(updatedBytes);
  assert.equal(
    updated.predictions[0].result.review.resultTicket,
    "2-1-3"
  );
  assert.notEqual(
    updated.predictions[0].result.review.generatedAt,
    "2026-08-13T00:00:00.000Z"
  );

  assert.equal(
    review.updateFile(fixturePath),
    false,
    "更新後の同一レビューも再保存しない"
  );
  assert.equal(
    fs.readFileSync(fixturePath, "utf8"),
    updatedBytes,
    "2回目実行で更新済みJSONをbyte単位で維持する"
  );
} finally {
  fs.rmSync(temporaryRoot, {
    recursive: true,
    force: true
  });
}

console.log("result review tests passed");
