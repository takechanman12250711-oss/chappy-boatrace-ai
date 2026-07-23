"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "ai-core.js"),
  "utf8"
);

const sandbox = {
  window: {},
  console,
  setTimeout,
  clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const aiCore = sandbox.window.ChappyAICore;
const generatedStats = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "stats",
      "racer-skill-patterns.json"
    ),
    "utf8"
  )
);

assert.ok(aiCore, "ChappyAICoreを読み込めない");
assert.equal(
  typeof aiCore.buildRacerSkillTheory,
  "function",
  "選手技量・戦法適性の共通判定を公開する"
);
assert.equal(
  generatedStats.source,
  "boatrace-official",
  "公式結果だけから選手履歴を生成する"
);
assert.equal(
  generatedStats.thresholds.minimumSamples,
  12
);
assert.equal(
  generatedStats.thresholds.highReliabilitySamples,
  30
);
assert.ok(
  Object.keys(generatedStats.racers).length >= 1700,
  "公式3年履歴の選手別データを保持する"
);
assert.ok(
  Object.values(generatedStats.racers)
    .some(racer =>
      Object.values(
        racer.windows?.all3Years?.byCourse || {}
      ).some(course =>
        course.starts >= 30 &&
        Array.isArray(course.winningMethods) &&
        course.winningMethods.length > 0
      )
    ),
  "実進入コース別の使用数・決まり手を生成する"
);

function courseStats({
  course,
  starts,
  winRate,
  top3Rate,
  averageSt,
  method = "まくり差し",
  methodCount = 8,
  methodRate = 66.7
}) {
  return {
    course,
    starts,
    reliability:
      starts >= 30 ? "high"
        : starts >= 12 ? "medium"
          : "low",
    wins: Math.round(starts * winRate / 100),
    winRate,
    top3: Math.round(starts * top3Rate / 100),
    top3Rate,
    averageSt,
    winningMethods: [
      {
        key: method,
        count: methodCount,
        rate: methodRate
      }
    ]
  };
}

function racerHistory(
  registerNo,
  currentCourse,
  overrides = {}
) {
  const all = courseStats({
    course: currentCourse,
    starts: 36,
    winRate: 30,
    top3Rate: 70,
    averageSt: 0.13,
    ...overrides.all
  });
  const recent = courseStats({
    course: currentCourse,
    starts: 18,
    winRate: 33.3,
    top3Rate: 72.2,
    averageSt: 0.13,
    methodCount: 5,
    ...overrides.recent
  });
  const previous = courseStats({
    course: currentCourse,
    starts: 18,
    winRate: 27.8,
    top3Rate: 66.7,
    averageSt: 0.14,
    methodCount: 4,
    ...overrides.previous
  });

  return {
    registerNo,
    racerName: `${registerNo}選手`,
    starts: 100,
    windows: {
      all3Years: {
        byCourse: {
          [currentCourse]: all
        }
      },
      recent1Year: {
        byCourse: {
          [currentCourse]: recent
        }
      },
      previous2Years: {
        byCourse: {
          [currentCourse]: previous
        }
      }
    }
  };
}

function loadedRacerHistory(history) {
  return {
    registerNo: history.registerNo,
    racerName: history.racerName,
    starts: history.starts,
    usable: true,
    skillHistory: history
  };
}

function entry(boatNo, overrides = {}) {
  return {
    boatNo,
    registerNo: String(4000 + boatNo),
    racerName: `${boatNo}号艇`,
    className: boatNo === 3 ? "A1" : "B1",
    exhibitionCourse: boatNo,
    national: {
      winRate: boatNo === 3 ? 7.1 : 5.0
    },
    currentSeries: {
      results: [2, 1, 3]
    },
    ...overrides
  };
}

function analysis(boatNo) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      national: 60,
      local: 60
    },
    roleScores: {
      attack: 60,
      hold: 60,
      pickup: 60
    }
  };
}

const entries = [1, 2, 3, 4, 5, 6].map(entry);
const analyses = [1, 2, 3, 4, 5, 6].map(analysis);
const racers = entries.map((boat) =>
  racerHistory(
    boat.registerNo,
    boat.boatNo
  )
);
const scenario = {
  mainScenario: {
    type: "threeAttack",
    label: "3コース攻め",
    attacker: 3,
    outcome: {
      firstCandidates: [{ boatNo: 3 }],
      secondCandidates: [{ boatNo: 1 }, { boatNo: 2 }],
      thirdCandidates: [{ boatNo: 4 }, { boatNo: 5 }]
    },
    blockedBoats: []
  },
  blockedBoats: []
};

const formal = aiCore.buildRacerSkillTheory(
  entries,
  analyses,
  {
    historyContext: {
      ready: true,
      source: "boatrace-official",
      racers: racers.map(loadedRacerHistory)
    }
  },
  scenario
);
const formalByBoat = new Map(
  formal.roles.map((boat) => [boat.boatNo, boat])
);
const boat3 = formalByBoat.get(3);

assert.equal(
  formal.source,
  "ai-core-racer-skill-theory-v1"
);
assert.equal(formal.roles.length, 6);
assert.equal(formal.sampleThreshold, 12);
assert.equal(formal.highReliabilityThreshold, 30);
assert.equal(formal.skillWeightLimit, 0.10);
assert.equal(formal.appliedToScore, false);
assert.equal(boat3.course, 3);
assert.equal(boat3.role, "攻め");
assert.equal(boat3.samples, 36);
assert.equal(boat3.reliability, "high");
assert.equal(boat3.isFormal, true);
assert.equal(boat3.isAdopted, true);
assert.equal(boat3.status, "正式採用");
assert.equal(boat3.appliedToScore, false);
assert.match(boat3.methodLabel, /まくり差し/);
assert.deepEqual(
  Object.keys(boat3.components),
  [
    "coursePerformance",
    "courseStart",
    "methodFit",
    "recentTrend",
    "classNational",
    "seriesRoad",
    "scenarioRole"
  ]
);
assert.equal(
  Object.values(boat3.components)
    .reduce((sum, value) => sum + value, 0),
  boat3.score,
  "7項目の配点合計と技量適性点を一致させる"
);

const swappedEntries = entries.map((boat) => {
  if (boat.boatNo === 3) {
    return {
      ...boat,
      exhibitionCourse: 4
    };
  }
  if (boat.boatNo === 4) {
    return {
      ...boat,
      exhibitionCourse: 3
    };
  }
  return boat;
});
const swappedRacers = racers.map((racer) => {
  if (racer.registerNo !== "4003") return racer;
  return racerHistory("4003", 4);
});
const swapped = aiCore.buildRacerSkillTheory(
  swappedEntries,
  analyses,
  {
    historyContext: {
      ready: true,
      source: "boatrace-official",
      racers:
        swappedRacers.map(
          loadedRacerHistory
        )
    }
  },
  scenario
);

assert.equal(
  swapped.roles.find((boat) => boat.boatNo === 3).course,
  4,
  "枠番ではなく展示進入コースを使用する"
);

const lowSampleRacers = racers.map((racer) => {
  if (racer.registerNo !== "4003") return racer;
  return racerHistory("4003", 3, {
    all: {
      starts: 11,
      methodCount: 2
    },
    recent: {
      starts: 5,
      methodCount: 1
    },
    previous: {
      starts: 6,
      methodCount: 1
    }
  });
});
const provisional = aiCore.buildRacerSkillTheory(
  entries,
  analyses,
  {
    historyContext: {
      ready: true,
      source: "boatrace-official",
      racers:
        lowSampleRacers.map(
          loadedRacerHistory
        )
    }
  },
  scenario
);
const provisionalBoat3 =
  provisional.roles.find((boat) => boat.boatNo === 3);

assert.equal(provisionalBoat3.isFormal, false);
assert.equal(provisionalBoat3.isAdopted, false);
assert.equal(provisionalBoat3.status, "暫定");

const blocked = aiCore.buildRacerSkillTheory(
  entries,
  analyses,
  {
    historyContext: {
      ready: true,
      source: "boatrace-official",
      racers: racers.map(loadedRacerHistory)
    }
  },
  {
    ...scenario,
    mainScenario: {
      ...scenario.mainScenario,
      blockedBoats: [3]
    },
    blockedBoats: [3]
  }
);
const blockedBoat3 =
  blocked.roles.find((boat) => boat.boatNo === 3);

assert.equal(blockedBoat3.status, "展開除外");
assert.equal(blockedBoat3.isAdopted, false);

console.log("選手技量・戦法適性理論専用テスト: 合格");
console.log("- 公式の実進入コース別履歴を使用");
console.log("- 7項目・100点で6艇を共通評価");
console.log("- 12走以上で正式判定、30走以上で高信頼");
console.log("- 得意戦法と最有力展開の役割を照合");
console.log("- 技量適性点は既存スコアへ二重加算しない");
