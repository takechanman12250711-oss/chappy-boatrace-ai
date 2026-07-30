"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const evaluatedScenarioCandidates = require("../js/evaluated-scenario-candidates");

const practicalSource = fs.readFileSync(
  "js/practical-selection.js",
  "utf8"
);
const renderSource = fs.readFileSync(
  "js/render.js",
  "utf8"
);

function evaluation(boatNo, extra = {}) {
  return {
    boatNo,
    course: boatNo,
    score: 80 - boatNo,
    total: 80 - boatNo,
    attack: boatNo === 2 ? 72 : 0,
    hold: boatNo === 1 || boatNo === 3 ? 70 : 0,
    pickup: boatNo === 4 ? 68 : 0,
    comment: `${boatNo}号艇の構造化評価`,
    ...extra
  };
}

const evaluations = [1, 2, 3, 4, 5, 6].map((boatNo) =>
  evaluation(boatNo)
);
const byBoat = new Map(
  evaluations.map((row) => [row.boatNo, row])
);

const prediction = {
  boatEvaluation: {
    evaluations,
    honmei: byBoat.get(1),
    taikou: byBoat.get(2),
    ana: byBoat.get(3),
    osae: byBoat.get(4)
  },
  mainSheet: {
    evaluations,
    honmei: byBoat.get(1),
    taikou: byBoat.get(2),
    ana: byBoat.get(3),
    osae: byBoat.get(4),
    reason: "1号艇中心の構造化展開",
    tickets: ["1-2-3"],
    coverTickets: ["1-3-2"],
    flowTickets: ["1-2-4"]
  },
  manshuSheet: {
    tickets: ["2-1-3"]
  },
  formation: {
    main: ["1-2-3"],
    cover: ["1-3-2"],
    flow: ["1-2-4"],
    hole: ["2-1-3"]
  },
  raceFlow: {
    title: "1逃げ中心",
    summary: "1号艇先マイ、2号艇追走、3・4号艇が残しと拾い。",
    attackBoats: [
      {
        boatNo: 2,
        course: 2,
        score: 72,
        reason: "2号艇が差しで攻める",
        qualified: true
      }
    ],
    holdBoats: [
      {
        boatNo: 3,
        course: 3,
        score: 70,
        reason: "3号艇が残す",
        qualified: true
      }
    ],
    pickupBoats: [
      {
        boatNo: 4,
        course: 4,
        score: 68,
        reason: "4号艇が3着を拾う",
        qualified: true
      }
    ],
    phases: {
      firstMark: {
        mainAttack: {
          boatNo: 2,
          score: 72,
          reason: "2号艇が差しで攻める",
          qualified: true
        },
        mainHold: {
          boatNo: 3,
          score: 70,
          reason: "3号艇が残す",
          qualified: true
        }
      },
      back: {
        leader: {
          boatNo: 1,
          score: 79,
          reason: "1号艇が先頭を維持",
          qualified: true
        },
        hold: {
          boatNo: 3,
          score: 70,
          reason: "3号艇がバックで残す",
          qualified: true
        }
      },
      secondMark: {
        mainHold: {
          boatNo: 3,
          score: 70,
          reason: "3号艇が2マークで残す",
          qualified: true
        }
      },
      goal: {
        expectedOrder: [1, 2, 3]
      }
    }
  }
};

const result = evaluatedScenarioCandidates.build(prediction);
const candidates = new Map(
  result.candidatePool.map((row) => [row.ticket, row])
);

const expected = {
  "1-2-3": ["main", "本線"],
  "1-3-2": ["cover", "押さえ"],
  "1-2-4": ["flow", "流し"],
  "2-1-3": ["hole", "万舟・穴"]
};

Object.entries(expected).forEach(([ticket, [key, label]]) => {
  const candidate = candidates.get(ticket);

  assert.ok(candidate, `${ticket}: 候補プールに存在する`);
  assert.equal(candidate.sourceCategory, key, `${ticket}: 分類キー`);
  assert.equal(candidate.category, label, `${ticket}: category表示`);
  assert.equal(
    candidate.displayCategory,
    label,
    `${ticket}: displayCategory表示`
  );
  assert.match(
    candidate.comment,
    new RegExp(`^【${label}】`),
    `${ticket}: コメントと分類が同期する`
  );
  assert.ok(
    String(candidate.scenarioClassificationReason || "").trim(),
    `${ticket}: 分類理由を保持する`
  );
});

assert.ok(
  result.candidatePool.every(
    (candidate) => candidate.category !== "展開候補"
  ),
  "旧固定分類『展開候補』を出力しない"
);
assert.ok(
  practicalSource.includes("displayCategory:") &&
    practicalSource.includes("categoryKey(category)"),
  "実戦厳選へ正規化分類を引き継ぐ"
);
assert.ok(
  !practicalSource.includes("CATEGORY_LABELS[sourceCategory]"),
  "旧分類ラベルの直接参照を復活させない"
);
assert.ok(
  renderSource.includes(
    '.replace(/independent-scenario/g, "独立展開")'
  ),
  "内部名を利用者向け表示へ露出させない"
);

console.log(
  `scenario category sync regression: passed (${Object.keys(expected).length} categories)`
);
