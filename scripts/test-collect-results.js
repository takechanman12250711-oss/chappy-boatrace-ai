"use strict";

const assert =
  require("node:assert/strict");
const fs =
  require("node:fs");
const os =
  require("node:os");
const path =
  require("node:path");
const {
  isVoidRace,
  normalizeResolvedRace,
  mergeOfficialResults,
  hasMaterialResultChange,
  readExistingResults,
  writeJsonAtomic
} = require(
  "./collect-results"
);

function race(
  jcd,
  raceNo,
  options = {}
) {
  return {
    ok:
      options.ok ??
      true,
    source:
      "boatrace-official",
    date:
      "20260728",
    jcd,
    place:
      options.place ||
      "江戸川",
    raceNo,
    resultAvailable:
      options.resultAvailable ??
      false,
    status:
      options.status,
    starts:
      options.starts,
    trifecta:
      options.trifecta,
    error:
      options.error
  };
}

const known =
  race("03", 1, {
    resultAvailable: true,
    trifecta: {
      combination: "1-2-3",
      payout: 1230
    }
  });
const existing = {
  schemaVersion: 1,
  source:
    "boatrace-official",
  date: "20260728",
  collectedAt:
    "2026-07-28T15:00:00.000Z",
  venueCount: 1,
  raceCount: 2,
  completedRaces: 1,
  pendingRaces: 1,
  failedRaces: 0,
  complete: false,
  venues: [{
    jcd: "03",
    place: "江戸川"
  }],
  races: [
    known,
    race("03", 2)
  ]
};
const retry = {
  schemaVersion: 1,
  source:
    "boatrace-official",
  date: "20260728",
  collectedAt:
    "2026-07-28T15:15:00.000Z",
  venues: [{
    jcd: "03",
    place: "江戸川"
  }, {
    jcd: "24",
    place: "大村"
  }],
  races: [
    race("03", 1, {
      ok: false,
      error:
        "一時的な取得失敗"
    }),
    race("03", 2, {
      resultAvailable: true,
      trifecta: {
        combination:
          "2-1-3",
        payout: 980
      }
    }),
    race("24", 12, {
      place: "大村",
      error: ""
    })
  ]
};

const merged =
  mergeOfficialResults(
    existing,
    retry
  );
const preserved =
  merged.races.find(
    item =>
      item.jcd === "03" &&
      item.raceNo === 1
  );

assert.equal(
  preserved.resultAvailable,
  true,
  "再取得失敗で取得済み結果を消さない"
);
assert.equal(
  preserved
    .trifecta
    .combination,
  "1-2-3"
);
assert.equal(
  preserved.error,
  undefined,
  "再取得失敗のエラーを確定済み結果へ混ぜない"
);
assert.equal(
  merged.completedRaces,
  2
);
assert.equal(
  merged.voidRaces,
  0
);
assert.equal(
  merged.resolvedRaces,
  2
);
assert.equal(
  merged.pendingRaces,
  1
);
assert.deepEqual(
  merged.pendingRaceKeys,
  ["24-12"]
);
assert.equal(
  merged.failedRaces,
  0
);
assert.equal(
  merged.raceCount,
  3
);
assert.equal(
  merged.venueCount,
  2
);
assert.equal(
  merged.complete,
  false
);
assert.match(
  merged.sourcePolicy,
  /取得済み結果を保持/
);

const corrected =
  mergeOfficialResults(
    merged,
    {
      ...retry,
      races: [
        race("03", 1, {
          resultAvailable:
            true,
          trifecta: {
            combination:
              "1-3-2",
            payout: 1500
          }
        }),
        race("24", 12, {
          place: "大村",
          resultAvailable:
            true,
          trifecta: {
            combination:
              "1-2-4",
            payout: 640
          }
        })
      ]
    }
  );
assert.equal(
  corrected.races.find(
    item =>
      item.jcd === "03" &&
      item.raceNo === 1
  ).trifecta.combination,
  "1-3-2",
  "新しい公式確定値は既存値を更新する"
);
assert.equal(
  corrected.completedRaces,
  3
);
assert.equal(
  corrected.resolvedRaces,
  3
);
assert.equal(
  corrected.complete,
  true
);
assert.equal(
  hasMaterialResultChange(
    corrected,
    {
      ...corrected,
      collectedAt:
        "2026-07-28T16:00:00.000Z"
    }
  ),
  false,
  "確認時刻だけの差で結果ファイルを書き換えない"
);
assert.equal(
  hasMaterialResultChange(
    corrected,
    {
      ...corrected,
      races:
        corrected.races.map(
          item =>
            item.jcd === "03" &&
            item.raceNo === 1
              ? {
                  ...item,
                  trifecta: {
                    ...item.trifecta,
                    payout:
                      1600
                  }
                }
              : item
        )
    }
  ),
  true,
  "公式訂正は実質変更として保存する"
);

const allFalseStarts =
  Array.from(
    { length: 6 },
    (_, index) => ({
      course: index + 1,
      boat: index + 1,
      marker: "F",
      falseStart: true,
      lateStart: false,
      raw: "F.01"
    })
  );
const voidCandidate =
  race("24", 1, {
    place: "大村",
    resultAvailable: false,
    status: "not_finished",
    starts: allFalseStarts,
    trifecta: null
  });

assert.equal(
  isVoidRace(voidCandidate),
  true,
  "6艇すべてF/Lで着順・3連単がないレースを不成立と判定する"
);
const normalizedVoid =
  normalizeResolvedRace(voidCandidate);
assert.equal(
  normalizedVoid.status,
  "void"
);
assert.equal(
  normalizedVoid.resultAvailable,
  false,
  "不成立は通常の的中評価対象へ昇格させない"
);
const voidMerged =
  mergeOfficialResults(
    null,
    {
      schemaVersion: 1,
      source: "boatrace-official",
      date: "20260807",
      venues: [{
        jcd: "24",
        place: "大村"
      }],
      races: [voidCandidate]
    }
  );
assert.equal(
  voidMerged.completedRaces,
  0,
  "不成立レースを通常完走へ混ぜない"
);
assert.equal(
  voidMerged.voidRaces,
  1
);
assert.equal(
  voidMerged.resolvedRaces,
  1
);
assert.equal(
  voidMerged.pendingRaces,
  0,
  "不成立を未確定扱いしない"
);
assert.equal(
  voidMerged.failedRaces,
  0
);
assert.deepEqual(
  voidMerged.pendingRaceKeys,
  []
);
assert.deepEqual(
  voidMerged.voidRaceKeys,
  ["24-1"]
);
assert.equal(
  voidMerged.complete,
  true,
  "不成立を含め全レースが解決済みならcompleteにする"
);

const tempDirectory =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "collect-results-"
    )
  );
const outputPath =
  path.join(
    tempDirectory,
    "results.json"
  );
writeJsonAtomic(
  outputPath,
  corrected
);
assert.deepEqual(
  readExistingResults(
    outputPath
  ),
  JSON.parse(
    JSON.stringify(
      corrected
    )
  ),
  "結果JSONを原子的に保存して再読込できる"
);
fs.rmSync(
  tempDirectory,
  {
    recursive: true,
    force: true
  }
);

console.log(
  "公式結果の部分取得保持・不成立分類テスト: 合格"
);
