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

const TRIFECTA_OUTPUT_FILE = path.join(
  ROOT,
  "data",
  "stats",
  "trifecta-by-venue-race.json"
);

const VENUE_RACE_OUTPUT_FILE = path.join(
  ROOT,
  "data",
  "stats",
  "venue-race-patterns.json"
);

const THREE_YEAR_DAYS = 1095;
const RECENT_YEAR_DAYS = 365;

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

    boatPerformance: {},

    winningBoats: {},
    winningCourses: {},
    winningMethods: {},
    payoutBands: {
      under3000: 0,
      from3000To9999: 0,
      over10000: 0
    },
    roughRaces: 0,
    outsideWins: 0,
    boatOneOutsideTop3: 0,
    winningStSum: 0,
    winningStSamples: 0
  };
}

function createTrifectaPattern() {
  return {
    totalRaces: 0,
    counts: {}
  };
}

function normalizeTrifecta(value) {
  const match = String(value || "")
    .match(/^([1-6])-([1-6])-([1-6])$/);

  if (!match) return "";

  const boats = match.slice(1).map(Number);

  return new Set(boats).size === 3
    ? boats.join("-")
    : "";
}

function addTrifectaRace(pattern, race) {
  const ticket = normalizeTrifecta(
    race.trifecta?.combination
  );

  if (!ticket) return;

  pattern.totalRaces += 1;
  addCount(pattern.counts, ticket);
}

function finalizeTrifectaPattern(pattern) {
  return {
    totalRaces: pattern.totalRaces,
    reliability: reliability(
      pattern.totalRaces
    ),
    counts: Object.fromEntries(
      Object.entries(pattern.counts)
        .sort(([ticketA], [ticketB]) =>
          ticketA.localeCompare(ticketB)
        )
    )
  };
}

function createTrifectaWindows() {
  return {
    all3Years: createTrifectaPattern(),
    recent1Year: createTrifectaPattern(),
    previous2Years: createTrifectaPattern()
  };
}

function finalizeTrifectaWindows(windows) {
  const all3Years =
    finalizeTrifectaPattern(
      windows.all3Years
    );

  return {
    ...all3Years,
    all3Years,
    recent1Year:
      finalizeTrifectaPattern(
        windows.recent1Year
      ),
    previous2Years:
      finalizeTrifectaPattern(
        windows.previous2Years
      )
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
function addBoatPerformance(
  pattern,
  race
) {
  for (
    const finisher of
    race.finishers || []
  ) {
    const boatNo =
      Number(finisher.boat);

    if (
      !Number.isInteger(boatNo) ||
      boatNo < 1 ||
      boatNo > 6
    ) {
      continue;
    }

    const boat =
      pattern.boatPerformance[
        boatNo
      ] ||= {
        boatNo,
        starts: 0,
        wins: 0,
        seconds: 0,
        thirds: 0,
        top3: 0,
        stSum: 0,
        stSamples: 0
      };

    boat.starts += 1;

    const rank =
      Number(finisher.rank);

    if (rank === 1) {
      boat.wins += 1;
    }

    if (rank === 2) {
      boat.seconds += 1;
    }

    if (rank === 3) {
      boat.thirds += 1;
    }

    if (
      rank >= 1 &&
      rank <= 3
    ) {
      boat.top3 += 1;
    }

    const start =
      race.starts?.find(
        item =>
          Number(item.boat) ===
          boatNo
      );

    const rawSt = start?.st;

    const st =
      rawSt === null ||
      rawSt === undefined ||
      rawSt === ""
        ? NaN
        : Number(rawSt);

    if (Number.isFinite(st)) {
      boat.stSum += st;
      boat.stSamples += 1;
    }
  }
}
function addRace(pattern, race) {
  const winner = race.finishers?.find(
    item => Number(item.rank) === 1
  );

    if (!winner) return;

  addBoatPerformance(
    pattern,
    race
  );

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

  const boatOneRank = Number(
    race.finishers?.find(
      item => Number(item.boat) === 1
    )?.rank
  );

  const outsideWin =
    winnerBoat >= 4 && winnerBoat <= 6;

  const boatOneMiss =
    Number.isFinite(boatOneRank) &&
    boatOneRank > 3;

  const manshu =
    Number.isFinite(payout) &&
    payout >= 10000;

  if (outsideWin) {
    pattern.outsideWins += 1;
  }

  if (boatOneMiss) {
    pattern.boatOneOutsideTop3 += 1;
  }

  if (manshu || outsideWin || boatOneMiss) {
    pattern.roughRaces += 1;
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
function finalizeBoatPerformance(
  boatPerformance
) {
  return Object.fromEntries(
    Object.values(
      boatPerformance || {}
    )
      .sort(
        (a, b) =>
          a.boatNo - b.boatNo
      )
      .map(boat => [
        String(boat.boatNo),
        {
          boatNo:
            boat.boatNo,

          starts:
            boat.starts,

          reliability:
            racerReliability(
              boat.starts
            ),

          wins:
            boat.wins,

          winRate:
            percent(
              boat.wins,
              boat.starts
            ),

          seconds:
            boat.seconds,

          secondRate:
            percent(
              boat.seconds,
              boat.starts
            ),

          thirds:
            boat.thirds,

          thirdRate:
            percent(
              boat.thirds,
              boat.starts
            ),

          top3:
            boat.top3,

          top3Rate:
            percent(
              boat.top3,
              boat.starts
            ),

          outsideTop3:
            Math.max(
              0,
              boat.starts - boat.top3
            ),

          outsideTop3Rate:
            percent(
              Math.max(
                0,
                boat.starts - boat.top3
              ),
              boat.starts
            ),

          averageSt:
            boat.stSamples
              ? Number(
                  (
                    boat.stSum /
                    boat.stSamples
                  ).toFixed(3)
                )
              : null
        }
      ])
  );
}
function finalizePattern(pattern) {
  const total = pattern.totalRaces;

    return {
    totalRaces: total,
    reliability: reliability(total),

    boatPerformance:
      finalizeBoatPerformance(
        pattern.boatPerformance
      ),

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
    },

    turbulence: {
      definition:
        "3連単1万円以上・4〜6号艇1着・1号艇着外のいずれか",
      roughRaces: {
        count: pattern.roughRaces,
        rate: percent(
          pattern.roughRaces,
          total
        )
      },
      outsideWins: {
        count: pattern.outsideWins,
        rate: percent(
          pattern.outsideWins,
          total
        )
      },
      boatOneOutsideTop3: {
        count:
          pattern.boatOneOutsideTop3,
        rate: percent(
          pattern.boatOneOutsideTop3,
          total
        )
      }
    }
  };
}

function parseRaceDate(value) {
  const text = String(value || "");

  if (!/^\d{8}$/.test(text)) {
    return null;
  }

  return new Date(Date.UTC(
    Number(text.slice(0, 4)),
    Number(text.slice(4, 6)) - 1,
    Number(text.slice(6, 8))
  ));
}

function subtractDays(date, days) {
  return new Date(
    date.getTime() -
    days * 24 * 60 * 60 * 1000
  );
}

function createVenueRaceWindows() {
  return {
    all3Years: createPattern(),
    recent1Year: createPattern(),
    previous2Years: createPattern()
  };
}

function finalizeVenueRaceWindows(windows) {
  return {
    all3Years:
      finalizePattern(windows.all3Years),
    recent1Year:
      finalizePattern(windows.recent1Year),
    previous2Years:
      finalizePattern(windows.previous2Years)
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

  const allRaces = [
    ...racesById.values()
  ];

  const latestRaceDate = allRaces
    .map(race => parseRaceDate(race.date))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;

  const threeYearStart = latestRaceDate
    ? subtractDays(
        latestRaceDate,
        THREE_YEAR_DAYS - 1
      )
    : null;

  const recentYearStart = latestRaceDate
    ? subtractDays(
        latestRaceDate,
        RECENT_YEAR_DAYS - 1
      )
    : null;

  const races = allRaces.filter(race => {
    const date = parseRaceDate(race.date);
    return (
      date &&
      (!threeYearStart || date >= threeYearStart)
    );
  });

  const overall = createPattern();
  const venuePatterns = {};
  const venueRacePatterns = {};
  const trifectaByVenueRace = {};
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

    const raceDate =
      parseRaceDate(race.date);

    const raceNo = Number(
      race.raceNo
    );

    if (
      Number.isInteger(raceNo) &&
      raceNo >= 1 &&
      raceNo <= 12
    ) {
      const venueRace =
        venueRacePatterns[race.jcd] ||= {};

      const windows =
        venueRace[raceNo] ||=
          createVenueRaceWindows();

      addRace(windows.all3Years, race);

      if (
        raceDate &&
        recentYearStart &&
        raceDate >= recentYearStart
      ) {
        addRace(windows.recent1Year, race);
      } else {
        addRace(windows.previous2Years, race);
      }
    }

    if (
      Number.isInteger(raceNo) &&
      raceNo >= 1 &&
      raceNo <= 12
    ) {
      const venueRace =
        trifectaByVenueRace[
          race.jcd
        ] ||= {};

      const trifectaPattern =
        venueRace[raceNo] ||=
          createTrifectaWindows();

      addTrifectaRace(
        trifectaPattern.all3Years,
        race
      );

      if (
        raceDate &&
        recentYearStart &&
        raceDate >= recentYearStart
      ) {
        addTrifectaRace(
          trifectaPattern.recent1Year,
          race
        );
      } else {
        addTrifectaRace(
          trifectaPattern.previous2Years,
          race
        );
      }
    }

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

    analysisWindow: {
      policy:
        "直近1年を優先し、過去2年を裏付けに使用",
      latestDate:
        latestRaceDate
          ? latestRaceDate
              .toISOString()
              .slice(0, 10)
              .replaceAll("-", "")
          : null,
      firstDate:
        threeYearStart
          ? threeYearStart
              .toISOString()
              .slice(0, 10)
              .replaceAll("-", "")
          : null,
      recentYearDays:
        RECENT_YEAR_DAYS,
      totalDays:
        THREE_YEAR_DAYS
    },

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

  const venueRaceOutput = {
    schemaVersion: 1,
    source: "boatrace-official",
    usagePolicy:
      "場＋R別の参考補強のみ。買い目・予想点・70点基準は変更しない",
    generatedAt: output.generatedAt,
    firstDate: output.firstDate,
    lastDate: output.lastDate,
    analysisWindow: output.analysisWindow,
    byVenueRace:
      Object.fromEntries(
        Object.entries(venueRacePatterns)
          .sort(([a], [b]) =>
            a.localeCompare(b)
          )
          .map(([jcd, raceMap]) => [
            jcd,
            Object.fromEntries(
              Object.entries(raceMap)
                .sort(
                  ([a], [b]) =>
                    Number(a) - Number(b)
                )
                .map(([raceNo, windows]) => [
                  raceNo,
                  finalizeVenueRaceWindows(
                    windows
                  )
                ])
            )
          ])
      )
  };

  const trifectaOutput = {
    schemaVersion: 1,
    source: "boatrace-official",
    usagePolicy:
      "参考表示のみ。買い目の作成・削除には使用しない",
    generatedAt:
      output.generatedAt,
    firstDate:
      output.firstDate,
    lastDate:
      output.lastDate,
    trifectaByVenueRace:
      Object.fromEntries(
        Object.entries(
          trifectaByVenueRace
        )
          .sort(([jcdA], [jcdB]) =>
            jcdA.localeCompare(jcdB)
          )
          .map(([jcd, races]) => [
            jcd,
            Object.fromEntries(
              Object.entries(races)
                .sort(
                  ([raceA], [raceB]) =>
                    Number(raceA) -
                    Number(raceB)
                )
                .map(
                  ([raceNo, pattern]) => [
                    raceNo,
                    finalizeTrifectaWindows(
                      pattern
                    )
                  ]
                )
            )
          ])
      )
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

  fs.writeFileSync(
    TRIFECTA_OUTPUT_FILE,
    JSON.stringify(
      trifectaOutput
    ) + "\n",
    "utf8"
  );

  fs.writeFileSync(
    VENUE_RACE_OUTPUT_FILE,
    JSON.stringify(
      venueRaceOutput
    ) + "\n",
    "utf8"
  );

  console.log(
    `公式結果${files.length}日分・` +
    `${races.length}レースを集計しました`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  THREE_YEAR_DAYS,
  RECENT_YEAR_DAYS,
  createPattern,
  addRace,
  finalizePattern,
  parseRaceDate,
  createVenueRaceWindows,
  finalizeVenueRaceWindows,
  createTrifectaWindows,
  finalizeTrifectaWindows
};
