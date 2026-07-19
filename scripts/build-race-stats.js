// scripts/build-race-stats.js
// 公式結果から展開予測用の参考統計を作成する。
// 統計だけで予想やAIの重みを自動変更しない。

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const RESULTS_DIR = path.join(ROOT, "data", "results");
const OUTPUT_FILE = path.join(
  ROOT,
  "data",
  "stats",
  "race-patterns.json"
);

function percent(value, total) {
  return total
    ? Number((value * 100 / total).toFixed(1))
    : 0;
}

function reliability(samples) {
  if (samples >= 100) return "high";
  if (samples >= 30) return "medium";
  return "low";
}

function racerReliability(samples) {
  if (samples >= 30) return "high";
  if (samples >= 12) return "medium";
  return "low";
}

function createPattern() {
  return {
    totalRaces: 0,
    winningBoats: {},
    winningCourses: {},
    winningMethods: {},
    payoutBands: {
      under3000: 0,
      from3000To9999: 0,
      over10000: 0
    },
    winningStSum: 0,
    winningStSamples: 0
  };
}

function addCount(target, key) {
  if (
    key === undefined ||
    key === null ||
    key === ""
  ) {
    return;
  }

  target[key] = (target[key] || 0) + 1;
}

function addRace(pattern, race) {
  const winner = race.finishers?.find(
    item => Number(item.rank) === 1
  );

  if (!winner) return;

  const winnerBoat = Number(winner.boat);

  const start = race.starts?.find(
    item => Number(item.boat) === winnerBoat
  );

  const winnerCourse = Number(start?.course);
  const winnerSt = Number(start?.st);
  const payout = Number(race.trifecta?.payout);

  pattern.totalRaces += 1;
  addCount(pattern.winningBoats, winnerBoat);

  if (
    winnerCourse >= 1 &&
    winnerCourse <= 6
  ) {
    addCount(
      pattern.winningCourses,
      winnerCourse
    );
  }

  addCount(
    pattern.winningMethods,
    race.winningMethod || "不明"
  );

  if (Number.isFinite(winnerSt)) {
    pattern.winningStSum += winnerSt;
    pattern.winningStSamples += 1;
  }

  if (Number.isFinite(payout)) {
    if (payout >= 10000) {
      pattern.payoutBands.over10000 += 1;
    } else if (payout >= 3000) {
      pattern.payoutBands.from3000To9999 += 1;
    } else {
      pattern.payoutBands.under3000 += 1;
    }
  }
}

function finalizeCounts(counts, total) {
  return Object.entries(counts)
    .map(([key, count]) => ({
      key,
      count,
      rate: percent(count, total)
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        String(a.key).localeCompare(
          String(b.key)
        )
    );
}

function finalizePattern(pattern) {
  const total = pattern.totalRaces;

  return {
    totalRaces: total,
    reliability: reliability(total),

    winningBoats: finalizeCounts(
      pattern.winningBoats,
      total
    ),

    winningCourses: finalizeCounts(
      pattern.winningCourses,
      total
    ),

    winningMethods: finalizeCounts(
      pattern.winningMethods,
      total
    ),

    averageWinningSt:
      pattern.winningStSamples
        ? Number(
            (
              pattern.winningStSum /
              pattern.winningStSamples
            ).toFixed(3)
          )
        : null,

    payoutBands: {
      under3000: {
        count:
          pattern.payoutBands.under3000,
        rate: percent(
          pattern.payoutBands.under3000,
          total
        )
      },

      from3000To9999: {
        count:
          pattern.payoutBands
            .from3000To9999,
        rate: percent(
          pattern.payoutBands
            .from3000To9999,
          total
        )
      },

      over10000: {
        count:
          pattern.payoutBands.over10000,
        rate: percent(
          pattern.payoutBands.over10000,
          total
        )
      }
    }
  };
}

function addRacers(racers, race) {
  for (const finisher of race.finishers || []) {
    const registerNo = String(
      finisher.registerNo || ""
    ).trim();

    if (!registerNo) continue;

    const racer = racers[registerNo] ||= {
      registerNo,
      racerName: finisher.racerName || "",
      starts: 0,
      wins: 0,
      top3: 0,
      stSum: 0,
      stSamples: 0,
      byBoat: {}
    };

    racer.racerName =
      finisher.racerName ||
      racer.racerName;

    racer.starts += 1;

    const rank = Number(finisher.rank);

    if (rank === 1) racer.wins += 1;

    if (rank >= 1 && rank <= 3) {
      racer.top3 += 1;
    }

    const start = race.starts?.find(
      item =>
        Number(item.boat) ===
        Number(finisher.boat)
    );

    const st = Number(start?.st);

    if (Number.isFinite(st)) {
      racer.stSum += st;
      racer.stSamples += 1;
    }

    const boatNo =
      Number(finisher.boat);

    if (
      Number.isInteger(boatNo) &&
      boatNo >= 1 &&
      boatNo <= 6
    ) {
      const boatStats =
        racer.byBoat[boatNo] ||= {
          boatNo,
          starts: 0,
          wins: 0,
          top3: 0,
          stSum: 0,
          stSamples: 0
        };

      boatStats.starts += 1;

      if (rank === 1) {
        boatStats.wins += 1;
      }

      if (rank >= 1 && rank <= 3) {
        boatStats.top3 += 1;
      }

      if (Number.isFinite(st)) {
        boatStats.stSum += st;
        boatStats.stSamples += 1;
      }
    }
  }
}

function finalizeRacerBoats(
  byBoat
) {
  return Object.fromEntries(
    Object.values(byBoat || {})
      .sort(
        (a, b) =>
          a.boatNo - b.boatNo
      )
      .map(item => [
        String(item.boatNo),
        {
          boatNo: item.boatNo,
          starts: item.starts,

          reliability:
            racerReliability(
              item.starts
            ),

          wins: item.wins,

          winRate: percent(
            item.wins,
            item.starts
          ),

          top3: item.top3,

          top3Rate: percent(
            item.top3,
            item.starts
          ),

          averageSt:
            item.stSamples
              ? Number(
                  (
                    item.stSum /
                    item.stSamples
                  ).toFixed(3)
                )
              : null
        }
      ])
  );
}

function finalizeRacers(racers) {
  return Object.fromEntries(
    Object.values(racers)
      .sort((a, b) =>
        a.registerNo.localeCompare(
          b.registerNo
        )
      )
      .map(racer => [
        racer.registerNo,
        {
          registerNo: racer.registerNo,
          racerName: racer.racerName,
          starts: racer.starts,

          reliability:
            racerReliability(
              racer.starts
            ),

          wins: racer.wins,

          winRate: percent(
            racer.wins,
            racer.starts
          ),

          top3: racer.top3,

          top3Rate: percent(
            racer.top3,
            racer.starts
          ),

          averageSt:
            racer.stSamples
              ? Number(
                  (
                    racer.stSum /
                    racer.stSamples
                  ).toFixed(3)
                )
              : null,

          byBoat:
            finalizeRacerBoats(
              racer.byBoat
            )
        }
      ])
  );
}

function readResultFiles() {
  if (!fs.existsSync(RESULTS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(RESULTS_DIR)
    .filter(name =>
      /^\d{8}\.json$/.test(name)
    )
    .sort()
    .map(name => {
      const filePath = path.join(
        RESULTS_DIR,
        name
      );

      return JSON.parse(
        fs.readFileSync(
          filePath,
          "utf8"
        )
      );
    });
}

function main() {
  const files = readResultFiles();
  const racesById = new Map();

  for (const file of files) {
    if (
      file.source !==
      "boatrace-official"
    ) {
      continue;
    }

    for (const race of file.races || []) {
      if (
        !race.resultAvailable ||
        race.source !==
          "boatrace-official"
      ) {
        continue;
      }

      const id =
        `${race.date}-` +
        `${race.jcd}-` +
        `${race.raceNo}`;

      racesById.set(id, race);
    }
  }

  const races = [
    ...racesById.values()
  ];

  const overall = createPattern();
  const venuePatterns = {};
  const racers = {};

  for (const race of races) {
    addRace(overall, race);

    const venue =
      venuePatterns[race.jcd] ||= {
        jcd: race.jcd,
        place:
          race.place || race.jcd,
        pattern: createPattern()
      };

    addRace(venue.pattern, race);
    addRacers(racers, race);
  }

  const output = {
    schemaVersion: 1,
    source: "boatrace-official",

    usagePolicy:
      "固定評価順を補助する参考統計。単独で予想や重み変更を行わない",

    generatedAt:
      new Date().toISOString(),

    sourceFileCount:
      files.length,

    firstDate:
      files[0]?.date || null,

    lastDate:
      files.at(-1)?.date || null,

    raceCount:
      races.length,

    overall:
      finalizePattern(overall),

    byVenue:
      Object.fromEntries(
        Object.values(venuePatterns)
          .sort((a, b) =>
            a.jcd.localeCompare(
              b.jcd
            )
          )
          .map(venue => [
            venue.jcd,
            {
              jcd: venue.jcd,
              place: venue.place,
              ...finalizePattern(
                venue.pattern
              )
            }
          ])
      ),

    racers:
      finalizeRacers(racers)
  };

  fs.mkdirSync(
    path.dirname(OUTPUT_FILE),
    { recursive: true }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `公式結果${files.length}日分・` +
    `${races.length}レースを集計しました`
  );
}

main();