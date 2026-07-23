"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  parseOfficialRaceHtml
} = require("../api/_parser.js");
const {
  createCourseStructurePattern,
  addCourseStructureRace,
  finalizeCourseStructurePattern
} = require("./build-race-stats.js");

const sandbox = {
  window: {},
  console,
  setTimeout,
  clearTimeout
};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "js",
      "ai-core.js"
    ),
    "utf8"
  ),
  sandbox
);
const core =
  sandbox.window.ChappyAICore;

function startRow(
  course,
  boat,
  st
) {
  return (
    `<div>${course}` +
    `<img src="/static_extra/pc/images/img_boat2_${boat}.png">` +
    `${st}</div>`
  );
}

const officialBeforeHtml = [
  "<main>スタート展示",
  startRow(1, 1, ".08"),
  startRow(2, 2, ".11"),
  startRow(3, 4, ".05"),
  startRow(4, 3, "F.01"),
  startRow(5, 5, ".13"),
  startRow(6, 6, ".16"),
  "水面気象情報</main>"
].join("");

const parsed = parseOfficialRaceHtml(
  "",
  officialBeforeHtml
);

assert.deepEqual(
  parsed.startExhibition.map(
    item => [
      item.course,
      item.boat
    ]
  ),
  [
    [1, 1],
    [2, 2],
    [3, 4],
    [4, 3],
    [5, 5],
    [6, 6]
  ],
  "公式の艇番画像から展示進入の入れ替わりを取得する"
);
assert.ok(
  parsed.startExhibition.every(
    item =>
      item.isOfficialCourse === true &&
      item.mappingSource ===
        "official-start-image"
  ),
  "6艇の公式進入取得を明示する"
);

const fallback = parseOfficialRaceHtml(
  "",
  "スタート展示 1 .08 2 .11 3 .05 4 .09 5 .13 6 .16 水面気象情報"
);
assert.ok(
  fallback.startExhibition.every(
    item =>
      item.isOfficialCourse === false &&
      item.boat === item.course
  ),
  "艇番画像がない場合は現行の枠なり解析を暫定で維持する"
);

const pattern =
  createCourseStructurePattern();
const race = {
  starts:
    parsed.startExhibition,
  finishers: [
    { boat: 4, rank: 1 },
    { boat: 1, rank: 2 },
    { boat: 3, rank: 3 },
    { boat: 2, rank: 4 },
    { boat: 5, rank: 5 },
    { boat: 6, rank: 6 }
  ]
};

assert.equal(
  addCourseStructureRace(
    pattern,
    race
  ),
  true,
  "実進入6艇がそろった公式結果だけを集計する"
);
const finalized =
  finalizeCourseStructurePattern(
    pattern
  );
assert.equal(
  finalized.byCourse["3"].wins,
  1,
  "艇番ではなく実進入3コースの勝利として集計する"
);
assert.equal(
  finalized.byCourse["4"].top3,
  1,
  "入れ替わった3号艇を実進入4コースの3連対として集計する"
);

function windows(
  rates
) {
  return {
    all3Years: {
      byCourse: rates
    },
    recent1Year: {
      byCourse: rates
    },
    previous2Years: {
      byCourse: rates
    }
  };
}

const rates = Object.fromEntries(
  Array.from(
    { length: 6 },
    (_, index) => {
      const course = index + 1;
      return [
        String(course),
        {
          course,
          starts: 300,
          winRate:
            [55, 14, 12, 10, 6, 3][
              index
            ],
          top3Rate:
            [88, 65, 57, 48, 30, 20][
              index
            ]
        }
      ];
    }
  )
);
const entries =
  parsed.startExhibition.map(item => ({
    boatNo: item.boat,
    startExhibition: item
  }));
const formalData = {
  historyContext: {
    courseStructure: {
      venue: windows(rates),
      overall: windows(rates),
      thresholds: {
        formalVenueCourseSamples: 100,
        recentTrendSamples: 30
      }
    }
  }
};
const boat3 = entries.find(
  item => item.boatNo === 3
);
const formal =
  core.buildCourseStructureEvaluation(
    boat3,
    entries,
    formalData,
    { legacyAdjustment: 1 }
  );

assert.equal(
  formal.course,
  4,
  "正式判定では展示進入コースを総合コース評価へ接続する"
);
assert.equal(
  formal.isFormal,
  true,
  "6艇公式進入と場×コース100走以上で正式成立する"
);
assert.equal(
  formal.appliedToScore,
  true,
  "正式成立時だけ既存24％枠へ反映する"
);

const fullPrediction =
  core.buildPredictionData({
    ...formalData,
    stadiumCode: "12",
    raceNo: 1,
    entries: Array.from(
      { length: 6 },
      (_, index) => ({
        boatNo: index + 1,
        racerName:
          `選手${index + 1}`,
        avgSt:
          0.12 + index * 0.01,
        exhibitionTime:
          6.7 + index * 0.02,
        localWinRate:
          5.5 - index * 0.2,
        nationalWinRate:
          5.8 - index * 0.2,
        motor2Rate: 35
      })
    ),
    startExhibition:
      parsed.startExhibition
  });
const integratedBoat3 =
  fullPrediction.analyses.find(
    item => item.boatNo === 3
  );

assert.equal(
  integratedBoat3
    .courseStructureTheory.course,
  4,
  "APIの展示進入を艇別解析と総合指数へ接続する"
);
assert.equal(
  fullPrediction
    .courseStructureTheory.isFormal,
  true,
  "6艇すべて正式なとき共通理論も正式成立する"
);

const provisionalEntries =
  entries.map(item => ({
    ...item,
    startExhibition: {
      ...item.startExhibition,
      isOfficialCourse: false,
      mappingSource:
        "legacy-course-order"
    }
  }));
const provisional =
  core.buildCourseStructureEvaluation(
    provisionalEntries.find(
      item => item.boatNo === 3
    ),
    provisionalEntries,
    formalData,
    { legacyAdjustment: 2 }
  );

assert.equal(
  provisional.course,
  3,
  "進入未確定時は艇番をコースとして維持する"
);
assert.equal(
  provisional.isFormal,
  false,
  "進入の取得信頼度不足では正式反映しない"
);
assert.equal(
  provisional.appliedToScore,
  false,
  "暫定評価を新しい加点に使わない"
);

console.log(
  "進入・コース構造理論Ver2テスト：合格"
);
console.log(
  "- 公式艇番画像から6艇の実進入を取得"
);
console.log(
  "- 場×実進入コースを枠番と分離して集計"
);
console.log(
  "- 100走基準・30走推移基準・暫定維持を確認"
);
