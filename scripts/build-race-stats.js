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

const RACER_SKILL_OUTPUT_FILE = path.join(
  ROOT,
  "data",
  "stats",
  "racer-skill-patterns.json"
);

const COURSE_STRUCTURE_OUTPUT_FILE = path.join(
  ROOT,
  "data",
  "stats",
  "course-structure-patterns.json"
);

const RACER_VENUE_STARTS_OUTPUT_FILE = path.join(
  ROOT,
  "data",
  "stats",
  "racer-venue-starts.json"
);

const THREE_YEAR_DAYS = 1095;
const RECENT_YEAR_DAYS = 365;
const RECENT_MISSING_DAYS = 30;
const JST_OFFSET_MS =
  9 * 60 * 60 * 1000;

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

function stStandardDeviation(
  sum,
  squaredSum,
  samples
) {
  if (samples < 2) return null;

  const mean = sum / samples;
  const variance = Math.max(
    0,
    squaredSum / samples -
      mean * mean
  );

  return Number(
    Math.sqrt(variance).toFixed(3)
  );
}

function createCourseStructurePattern() {
  return {
    totalStarts: 0,
    byCourse: {}
  };
}

function addCourseStructureRace(
  pattern,
  race
) {
  const rankByBoat = new Map(
    (race.finishers || [])
      .map(item => [
        Number(item.boat),
        Number(item.rank)
      ])
      .filter(
        ([boat, rank]) =>
          Number.isInteger(boat) &&
          boat >= 1 &&
          boat <= 6 &&
          Number.isInteger(rank) &&
          rank >= 1 &&
          rank <= 6
      )
  );

  const seenCourses = new Set();
  const seenBoats = new Set();
  const starts = (race.starts || [])
    .map(item => ({
      course: Number(item.course),
      boat: Number(item.boat)
    }))
    .filter(
      item =>
        Number.isInteger(item.course) &&
        item.course >= 1 &&
        item.course <= 6 &&
        Number.isInteger(item.boat) &&
        item.boat >= 1 &&
        item.boat <= 6 &&
        rankByBoat.has(item.boat)
    );

  if (
    starts.length !== 6 ||
    starts.some(item => {
      const duplicate =
        seenCourses.has(item.course) ||
        seenBoats.has(item.boat);
      seenCourses.add(item.course);
      seenBoats.add(item.boat);
      return duplicate;
    })
  ) {
    return false;
  }

  starts.forEach(item => {
    const course =
      pattern.byCourse[item.course] ||= {
        course: item.course,
        starts: 0,
        wins: 0,
        top3: 0
      };
    const rank = rankByBoat.get(item.boat);

    course.starts += 1;
    if (rank === 1) course.wins += 1;
    if (rank <= 3) course.top3 += 1;
    pattern.totalStarts += 1;
  });

  return true;
}

function finalizeCourseStructurePattern(
  pattern
) {
  return {
    totalStarts:
      Number(pattern?.totalStarts || 0),
    byCourse: Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => {
        const courseNo = index + 1;
        const item =
          pattern?.byCourse?.[courseNo] || {
            course: courseNo,
            starts: 0,
            wins: 0,
            top3: 0
          };

        return [
          String(courseNo),
          {
            course: courseNo,
            starts: item.starts,
            reliability:
              reliability(item.starts),
            wins: item.wins,
            winRate: percent(
              item.wins,
              item.starts
            ),
            top3: item.top3,
            top3Rate: percent(
              item.top3,
              item.starts
            )
          }
        ];
      })
    )
  };
}

function createCourseStructureWindows() {
  return {
    all3Years:
      createCourseStructurePattern(),
    recent1Year:
      createCourseStructurePattern(),
    previous2Years:
      createCourseStructurePattern()
  };
}

function finalizeCourseStructureWindows(
  windows
) {
  return {
    all3Years:
      finalizeCourseStructurePattern(
        windows.all3Years
      ),
    recent1Year:
      finalizeCourseStructurePattern(
        windows.recent1Year
      ),
    previous2Years:
      finalizeCourseStructurePattern(
        windows.previous2Years
      )
  };
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

function createTrifectaPattern(
  { trackLastOccurrence = false } = {}
) {
  const pattern = {
    totalRaces: 0,
    counts: {}
  };

  if (trackLastOccurrence) {
    pattern.lastOccurrenceDates = {};
  }

  return pattern;
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

  if (pattern.lastOccurrenceDates) {
    const raceDate = String(
      race?.date || ""
    );
    const current = String(
      pattern.lastOccurrenceDates[ticket] || ""
    );

    if (
      /^\d{8}$/.test(raceDate) &&
      raceDate > current
    ) {
      pattern.lastOccurrenceDates[ticket] =
        raceDate;
    }
  }
}

function finalizeTrifectaPattern(pattern) {
  const finalized = {
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

  if (pattern.lastOccurrenceDates) {
    finalized.lastOccurrenceDates =
      Object.fromEntries(
        Object.entries(
          pattern.lastOccurrenceDates
        ).sort(([ticketA], [ticketB]) =>
          ticketA.localeCompare(ticketB)
        )
      );
  }

  return finalized;
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

function createVenueTrifectaSummary() {
  return {
    all3Years: createTrifectaPattern({
      trackLastOccurrence: true
    }),
    recent30Days: createTrifectaPattern()
  };
}

function finalizeVenueTrifectaSummary(
  summary,
  {
    asOfDate,
    dataThroughDate,
    windowStartDate,
    historyStartDate,
    continuousHistoryStartDate,
    recentWindowComplete = true,
    unresolvedRecentRaces = 0
  } = {}
) {
  return {
    asOfDate: asOfDate || "",
    dataThroughDate:
      dataThroughDate || "",
    windowDays: RECENT_MISSING_DAYS,
    windowStartDate:
      windowStartDate || "",
    historyStartDate:
      historyStartDate || "",
    continuousHistoryStartDate:
      continuousHistoryStartDate || "",
    recentWindowComplete:
      recentWindowComplete === true,
    unresolvedRecentRaces:
      Number(unresolvedRecentRaces || 0),
    recent30Days:
      finalizeTrifectaPattern(
        summary.recent30Days
      ),
    all3Years:
      finalizeTrifectaPattern(
        summary.all3Years
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
        rises: 0,
        stays: 0,
        sinks: 0,
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

    /*
      枠別浮沈率：
      枠番より着順が上なら浮上、同じなら維持、
      下なら沈下として公式着順だけから集計する。
    */
    if (rank < boatNo) {
      boat.rises += 1;
    } else if (rank === boatNo) {
      boat.stays += 1;
    } else if (rank > boatNo) {
      boat.sinks += 1;
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

          rises:
            boat.rises,

          riseRate:
            percent(
              boat.rises,
              boat.starts
            ),

          stays:
            boat.stays,

          stayRate:
            percent(
              boat.stays,
              boat.starts
            ),

          sinks:
            boat.sinks,

          sinkRate:
            percent(
              boat.sinks,
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

function addDays(date, days) {
  return new Date(
    date.getTime() +
    days * 24 * 60 * 60 * 1000
  );
}

function formatRaceDate(date) {
  return date
    ? date
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "")
    : "";
}

function isRaceDayClosed(file) {
  const raceDate = parseRaceDate(
    file?.date
  );
  const collectedAt = new Date(
    file?.collectedAt || ""
  );
  const races = Array.isArray(
    file?.races
  )
    ? file.races
    : [];
  const venues = Array.isArray(
    file?.venues
  )
    ? file.venues
    : [];

  if (
    !raceDate ||
    !Number.isFinite(
      collectedAt.getTime()
    ) ||
    venues.length === 0 ||
    Number(file?.failedRaces || 0) !== 0 ||
    Number(file?.raceCount) !==
      races.length ||
    Number(file?.venueCount) !==
      venues.length ||
    races.length !==
      venues.length * 12 ||
    Number(file?.completedRaces || 0) +
      Number(file?.pendingRaces || 0) +
      Number(file?.failedRaces || 0) !==
      races.length
  ) {
    return false;
  }

  const raceNosByVenue = new Map();

  for (const race of races) {
    const jcd = String(
      race?.jcd || ""
    ).padStart(2, "0");
    const raceNo = Number(
      race?.raceNo
    );

    if (
      !/^\d{2}$/.test(jcd) ||
      !Number.isInteger(raceNo) ||
      raceNo < 1 ||
      raceNo > 12
    ) {
      return false;
    }

    const raceNos =
      raceNosByVenue.get(jcd) ||
      new Set();
    raceNos.add(raceNo);
    raceNosByVenue.set(jcd, raceNos);
  }

  const venueCodes = new Set(
    venues.map(venue =>
      String(
        venue?.jcd || ""
      ).padStart(2, "0")
    )
  );

  if (
    venueCodes.size !== venues.length ||
    raceNosByVenue.size !==
      venueCodes.size ||
    [...raceNosByVenue.keys()].some(
      jcd => !venueCodes.has(jcd)
    ) ||
    venues.some(venue =>
      raceNosByVenue.get(
        String(
          venue?.jcd || ""
        ).padStart(2, "0")
      )?.size !== 12
    )
  ) {
    return false;
  }

  const nextDayStartJst =
    addDays(raceDate, 1).getTime() -
    JST_OFFSET_MS;

  const allResultsComplete =
    Number(file?.completedRaces || 0) ===
      races.length &&
    Number(file?.pendingRaces || 0) === 0;

  return (
    allResultsComplete ||
    collectedAt.getTime() >=
      nextDayStartJst
  );
}

function findContinuousHistoryStartDate(
  files,
  latestDate
) {
  if (!latestDate) return null;

  const collectedDates = new Set(
    (Array.isArray(files) ? files : [])
      .filter(file =>
        file?.source ===
          "boatrace-official"
      )
      .map(file =>
        formatRaceDate(
          parseRaceDate(file?.date)
        )
      )
      .filter(Boolean)
  );

  let cursor = latestDate;

  while (
    collectedDates.has(
      formatRaceDate(cursor)
    )
  ) {
    cursor = subtractDays(cursor, 1);
  }

  return addDays(cursor, 1);
}

function buildVenueHistoryQuality(
  files,
  {
    latestDate,
    baseStartDate,
    recentStartDate
  } = {}
) {
  const byVenue = Object.fromEntries(
    Array.from(
      { length: 24 },
      (_, index) => [
        String(index + 1).padStart(2, "0"),
        {
          lastUnresolvedDate: "",
          unresolvedRecentRaces: 0
        }
      ]
    )
  );

  for (const file of Array.isArray(files)
    ? files
    : []) {
    if (
      file?.source !==
        "boatrace-official"
    ) {
      continue;
    }

    const fileDate = parseRaceDate(
      file?.date
    );
    const raceDayClosed =
      isRaceDayClosed(file);

    if (
      !fileDate ||
      !latestDate ||
      !baseStartDate ||
      fileDate < baseStartDate ||
      fileDate > latestDate
    ) {
      continue;
    }

    for (const race of file.races || []) {
      const jcd = String(
        race?.jcd || ""
      ).padStart(2, "0");

      if (!byVenue[jcd]) continue;

      const settled = Boolean(
        (
          race?.resultAvailable === true &&
          normalizeTrifecta(
            race?.trifecta?.combination
          )
        ) ||
        (
          race?.resultAvailable !== true &&
          !race?.error &&
          raceDayClosed
        )
      );

      if (settled) continue;

      const dateKey = formatRaceDate(
        fileDate
      );

      if (
        dateKey >
        byVenue[jcd].lastUnresolvedDate
      ) {
        byVenue[jcd]
          .lastUnresolvedDate = dateKey;
      }

      if (
        recentStartDate &&
        fileDate >= recentStartDate
      ) {
        byVenue[jcd]
          .unresolvedRecentRaces += 1;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(byVenue).map(
      ([jcd, quality]) => {
        const continuousStartDate =
          quality.lastUnresolvedDate
            ? addDays(
                parseRaceDate(
                  quality.lastUnresolvedDate
                ),
                1
              )
            : baseStartDate;

        return [
          jcd,
          {
            continuousHistoryStartDate:
              formatRaceDate(
                continuousStartDate
              ),
            unresolvedRecentRaces:
              quality.unresolvedRecentRaces,
            recentWindowComplete:
              Boolean(
                recentStartDate &&
                continuousStartDate <=
                  recentStartDate &&
                quality
                  .unresolvedRecentRaces === 0
              )
          }
        ];
      }
    )
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

function createRacerPerformance() {
  return {
    starts: 0,
    wins: 0,
    top3: 0,
    stSum: 0,
    stSquaredSum: 0,
    stSamples: 0,
    stMin: null,
    stMax: null,
    winningMethods: {},
    byBoat: {},
    byCourse: {}
  };
}

function addRacerPerformance(
  performance,
  race,
  finisher
) {
  performance.starts += 1;

  const rank = Number(finisher.rank);

  if (rank === 1) performance.wins += 1;

  if (rank >= 1 && rank <= 3) {
    performance.top3 += 1;
  }

  const start = race.starts?.find(
    item =>
      Number(item.boat) ===
      Number(finisher.boat)
  );

  const st = Number(start?.st);

  if (Number.isFinite(st)) {
    performance.stSum += st;
    performance.stSquaredSum +=
      st * st;
    performance.stSamples += 1;
    performance.stMin =
      performance.stMin === null
        ? st
        : Math.min(
            performance.stMin,
            st
          );
    performance.stMax =
      performance.stMax === null
        ? st
        : Math.max(
            performance.stMax,
            st
          );
  }

  if (rank === 1) {
    addCount(
      performance.winningMethods,
      race.winningMethod || "不明"
    );
  }

  const boatNo = Number(finisher.boat);

  if (
    Number.isInteger(boatNo) &&
    boatNo >= 1 &&
    boatNo <= 6
  ) {
    const boatStats =
      performance.byBoat[boatNo] ||= {
        boatNo,
        starts: 0,
        wins: 0,
        top3: 0,
        stSum: 0,
        stSquaredSum: 0,
        stSamples: 0,
        stMin: null,
        stMax: null
      };

    boatStats.starts += 1;

    if (rank === 1) boatStats.wins += 1;
    if (rank >= 1 && rank <= 3) boatStats.top3 += 1;

    if (Number.isFinite(st)) {
      boatStats.stSum += st;
      boatStats.stSquaredSum +=
        st * st;
      boatStats.stSamples += 1;
      boatStats.stMin =
        boatStats.stMin === null
          ? st
          : Math.min(
              boatStats.stMin,
              st
            );
      boatStats.stMax =
        boatStats.stMax === null
          ? st
          : Math.max(
              boatStats.stMax,
              st
            );
    }
  }

  const course = Number(start?.course);

  if (
    Number.isInteger(course) &&
    course >= 1 &&
    course <= 6
  ) {
    const courseStats =
      performance.byCourse[course] ||= {
        course,
        starts: 0,
        wins: 0,
        top3: 0,
        stSum: 0,
        stSquaredSum: 0,
        stSamples: 0,
        stMin: null,
        stMax: null,
        winningMethods: {}
      };

    courseStats.starts += 1;

    if (rank === 1) {
      courseStats.wins += 1;
      addCount(
        courseStats.winningMethods,
        race.winningMethod || "不明"
      );
    }

    if (rank >= 1 && rank <= 3) {
      courseStats.top3 += 1;
    }

    if (Number.isFinite(st)) {
      courseStats.stSum += st;
      courseStats.stSquaredSum +=
        st * st;
      courseStats.stSamples += 1;
      courseStats.stMin =
        courseStats.stMin === null
          ? st
          : Math.min(
              courseStats.stMin,
              st
            );
      courseStats.stMax =
        courseStats.stMax === null
          ? st
          : Math.max(
              courseStats.stMax,
              st
            );
    }
  }
}

function addRacers(
  racers,
  race,
  periodKey
) {
  for (const finisher of race.finishers || []) {
    const registerNo = String(
      finisher.registerNo || ""
    ).trim();

    if (!registerNo) continue;

    const racer = racers[registerNo] ||= {
      registerNo,
      racerName: finisher.racerName || "",
      windows: {
        all3Years:
          createRacerPerformance(),
        recent1Year:
          createRacerPerformance(),
        previous2Years:
          createRacerPerformance()
      }
    };

    racer.racerName =
      finisher.racerName ||
      racer.racerName;

    addRacerPerformance(
      racer.windows.all3Years,
      race,
      finisher
    );

    addRacerPerformance(
      racer.windows[
        periodKey === "recent1Year"
          ? "recent1Year"
          : "previous2Years"
      ],
      race,
      finisher
    );
  }
}

function addRacerVenueStarts(
  racerVenueStarts,
  race
) {
  const jcd = String(
    race?.jcd || ""
  ).padStart(2, "0");

  if (!/^\d{2}$/.test(jcd)) return;

  for (const finisher of race.finishers || []) {
    const registerNo = String(
      finisher?.registerNo || ""
    ).trim();

    if (!/^\d{4}$/.test(registerNo)) {
      continue;
    }

    const racer =
      racerVenueStarts[registerNo] ||= {
        registerNo,
        totalStarts: 0,
        venues: {}
      };

    racer.totalStarts += 1;
    racer.venues[jcd] =
      Number(racer.venues[jcd] || 0) + 1;
  }
}

function finalizeRacerVenueStarts(
  racerVenueStarts
) {
  return Object.fromEntries(
    Object.values(racerVenueStarts)
      .sort((a, b) =>
        a.registerNo.localeCompare(
          b.registerNo
        )
      )
      .map((racer) => [
        racer.registerNo,
        {
          registerNo: racer.registerNo,
          totalStarts:
            Number(racer.totalStarts || 0),
          venues: Object.fromEntries(
            Object.entries(racer.venues || {})
              .sort(([a], [b]) =>
                a.localeCompare(b)
              )
              .map(([jcd, starts]) => [
                jcd,
                Number(starts || 0)
              ])
          )
        }
      ])
  );
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
              : null,
          stStdDev:
            stStandardDeviation(
              item.stSum,
              item.stSquaredSum,
              item.stSamples
            ),
          stRange:
            item.stSamples >= 2
              ? Number(
                  (
                    item.stMax -
                    item.stMin
                  ).toFixed(3)
                )
              : null
        }
      ])
  );
}

function finalizeRacerCourses(
  byCourse
) {
  return Object.fromEntries(
    Object.values(byCourse || {})
      .sort(
        (a, b) =>
          a.course - b.course
      )
      .map(item => [
        String(item.course),
        {
          course: item.course,
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
              : null,
          stStdDev:
            stStandardDeviation(
              item.stSum,
              item.stSquaredSum,
              item.stSamples
            ),
          stRange:
            item.stSamples >= 2
              ? Number(
                  (
                    item.stMax -
                    item.stMin
                  ).toFixed(3)
                )
              : null,
          winningMethods:
            finalizeCounts(
              item.winningMethods,
              item.wins
            )
        }
      ])
  );
}

function finalizeRacerPerformance(
  performance
) {
  const source =
    performance ||
    createRacerPerformance();

  return {
    starts: source.starts,
    reliability:
      racerReliability(
        source.starts
      ),
    wins: source.wins,
    winRate: percent(
      source.wins,
      source.starts
    ),
    top3: source.top3,
    top3Rate: percent(
      source.top3,
      source.starts
    ),
    averageSt:
      source.stSamples
        ? Number(
            (
              source.stSum /
              source.stSamples
            ).toFixed(3)
          )
        : null,
    stStdDev:
      stStandardDeviation(
        source.stSum,
        source.stSquaredSum,
        source.stSamples
      ),
    stRange:
      source.stSamples >= 2
        ? Number(
            (
              source.stMax -
              source.stMin
            ).toFixed(3)
          )
        : null,
    winningMethods:
      finalizeCounts(
        source.winningMethods,
        source.wins
      ),
    byBoat:
      finalizeRacerBoats(
        source.byBoat
      ),
    byCourse:
      finalizeRacerCourses(
        source.byCourse
      )
  };
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
        (() => {
          const all3Years =
            finalizeRacerPerformance(
              racer.windows.all3Years
            );

          return {
            registerNo: racer.registerNo,
            racerName: racer.racerName,
            starts: all3Years.starts,
            reliability:
              all3Years.reliability,
            wins: all3Years.wins,
            winRate: all3Years.winRate,
            top3: all3Years.top3,
            top3Rate: all3Years.top3Rate,
            averageSt:
              all3Years.averageSt,
            byBoat: all3Years.byBoat
          };
        })()
      ])
  );
}

function finalizeRacerSkillRacers(
  racers
) {
  return Object.fromEntries(
    Object.values(racers)
      .sort((a, b) =>
        a.registerNo.localeCompare(
          b.registerNo
        )
      )
      .map(racer => {
        const finalizeWindow =
          performance => {
            const finalized =
              finalizeRacerPerformance(
                performance
              );

            return {
              starts:
                finalized.starts,
              byCourse:
                finalized.byCourse
            };
          };

        return [
          racer.registerNo,
          {
            registerNo:
              racer.registerNo,
            racerName:
              racer.racerName,
            windows: {
              all3Years:
                finalizeWindow(
                  racer.windows.all3Years
                ),
              recent1Year:
                finalizeWindow(
                  racer.windows.recent1Year
                ),
              previous2Years:
                finalizeWindow(
                  racer.windows.previous2Years
                )
            }
          }
        ];
      })
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

function collectOfficialRaces(
  files,
  latestDate = null
) {
  const racesById = new Map();

  for (const file of Array.isArray(files)
    ? files
    : []) {
    const fileDate = parseRaceDate(
      file?.date
    );

    if (
      file.source !==
        "boatrace-official" ||
      !fileDate ||
      (
        latestDate &&
        fileDate > latestDate
      )
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

  return [
    ...racesById.values()
  ];
}

function main() {
  const files = readResultFiles();
  const latestRaceDate = files
    .filter(file =>
      file?.source ===
        "boatrace-official" &&
      isRaceDayClosed(file)
    )
    .map(file => parseRaceDate(file.date))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;

  const allRaces =
    collectOfficialRaces(
      files,
      latestRaceDate
    );

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

  const missingAsOfDate = latestRaceDate
    ? addDays(latestRaceDate, 1)
    : null;

  const recentMissingStart =
    missingAsOfDate
      ? subtractDays(
          missingAsOfDate,
          RECENT_MISSING_DAYS
        )
      : null;

  const continuousHistoryStart =
    findContinuousHistoryStartDate(
      files,
      latestRaceDate
    );

  const venueHistoryQuality =
    buildVenueHistoryQuality(
      files,
      {
        latestDate: latestRaceDate,
        baseStartDate:
          continuousHistoryStart,
        recentStartDate:
          recentMissingStart
      }
    );

  const races = allRaces.filter(race => {
    const date = parseRaceDate(race.date);
    return (
      date &&
      (!threeYearStart || date >= threeYearStart) &&
      (!latestRaceDate || date <= latestRaceDate)
    );
  });

  const overall = createPattern();
  const venuePatterns = {};
  const venueRacePatterns = {};
  const trifectaByVenueRace = {};
  const trifectaByVenue = {};
  const racers = {};
  const racerVenueStarts = {};
  const courseStructureOverall =
    createCourseStructureWindows();
  const courseStructureByVenue = {};

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

      const venueTrifecta =
        trifectaByVenue[
          race.jcd
        ] ||= createVenueTrifectaSummary();

      addTrifectaRace(
        venueTrifecta.all3Years,
        race
      );

      if (
        raceDate &&
        recentMissingStart &&
        missingAsOfDate &&
        raceDate >= recentMissingStart &&
        raceDate < missingAsOfDate
      ) {
        addTrifectaRace(
          venueTrifecta.recent30Days,
          race
        );
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

    addRacers(
      racers,
      race,
      raceDate &&
      recentYearStart &&
      raceDate >= recentYearStart
        ? "recent1Year"
        : "previous2Years"
    );
    addRacerVenueStarts(
      racerVenueStarts,
      race
    );

    const periodKey =
      raceDate &&
      recentYearStart &&
      raceDate >= recentYearStart
        ? "recent1Year"
        : "previous2Years";
    const venueCourseWindows =
      courseStructureByVenue[race.jcd] ||=
        createCourseStructureWindows();

    addCourseStructureRace(
      courseStructureOverall.all3Years,
      race
    );
    addCourseStructureRace(
      courseStructureOverall[periodKey],
      race
    );
    addCourseStructureRace(
      venueCourseWindows.all3Years,
      race
    );
    addCourseStructureRace(
      venueCourseWindows[periodKey],
      race
    );
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

  const racerSkillOutput = {
    schemaVersion: 1,
    source: "boatrace-official",
    usagePolicy:
      "実進入コース別の技量・戦法適性を補足する公式履歴。単独で印・展開・買い目を変更しない",
    generatedAt:
      new Date().toISOString(),
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
      recentYearDays:
        RECENT_YEAR_DAYS,
      totalDays:
        THREE_YEAR_DAYS
    },
    thresholds: {
      minimumSamples: 12,
      highReliabilitySamples: 30
    },
    racers:
      finalizeRacerSkillRacers(
        racers
      )
  };

  const courseStructureOutput = {
    schemaVersion: 1,
    source: "boatrace-official",
    usagePolicy:
      "場×実進入コースの構造評価専用。選手技量・ST・展示・展開を二重加算しない",
    generatedAt: output.generatedAt,
    firstDate: output.firstDate,
    lastDate: output.lastDate,
    raceCount: races.length,
    analysisWindow:
      output.analysisWindow,
    thresholds: {
      formalVenueCourseSamples: 100,
      recentTrendSamples: 30
    },
    overall:
      finalizeCourseStructureWindows(
        courseStructureOverall
      ),
    byVenue: Object.fromEntries(
      Object.entries(courseStructureByVenue)
        .sort(([a], [b]) =>
          a.localeCompare(b)
        )
        .map(([jcd, windows]) => [
          jcd,
          finalizeCourseStructureWindows(
            windows
          )
        ])
    )
  };

  const racerVenueStartsOutput = {
    schemaVersion: 1,
    source: "boatrace-official",
    usagePolicy:
      "選手×場の当地出走数のみ。12走以上で正式、30走以上で高信頼。単独加点しない",
    generatedAt: output.generatedAt,
    firstDate: output.firstDate,
    lastDate: output.lastDate,
    raceCount: races.length,
    analysisWindow:
      output.analysisWindow,
    thresholds: {
      formalStarts: 12,
      highReliabilityStarts: 30
    },
    racers:
      finalizeRacerVenueStarts(
        racerVenueStarts
      )
  };

  const venueRaceOutput = {
    schemaVersion: 1,
    source: "boatrace-official",
    usagePolicy:
      "場＋R別の参考補強のみ。買い目・予想点・60点基準は変更しない",
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
    schemaVersion: 2,
    source: "boatrace-official",
    usagePolicy:
      "参考表示のみ。買い目の作成・削除には使用しない",
    generatedAt:
      output.generatedAt,
    firstDate:
      output.firstDate,
    lastDate:
      output.lastDate,
    asOfDate:
      formatRaceDate(
        missingAsOfDate
      ),
    dataThroughDate:
      formatRaceDate(
        latestRaceDate
      ),
    recentWindowDays:
      RECENT_MISSING_DAYS,
    recentWindowStartDate:
      formatRaceDate(
        recentMissingStart
      ),
    historyStartDate:
      formatRaceDate(
        threeYearStart
      ),
    continuousHistoryStartDate:
      formatRaceDate(
        continuousHistoryStart
      ),
    trifectaByVenue:
      Object.fromEntries(
        Object.entries(
          trifectaByVenue
        )
          .sort(([jcdA], [jcdB]) =>
            jcdA.localeCompare(jcdB)
          )
          .map(([jcd, summary]) => [
            jcd,
            finalizeVenueTrifectaSummary(
              summary,
              {
                asOfDate:
                  formatRaceDate(
                    missingAsOfDate
                  ),
                dataThroughDate:
                  formatRaceDate(
                    latestRaceDate
                  ),
                windowStartDate:
                  formatRaceDate(
                    recentMissingStart
                  ),
                historyStartDate:
                  formatRaceDate(
                    threeYearStart
                  ),
                continuousHistoryStartDate:
                  venueHistoryQuality[jcd]
                    ?.continuousHistoryStartDate ||
                  formatRaceDate(
                    continuousHistoryStart
                  ),
                recentWindowComplete:
                  venueHistoryQuality[jcd]
                    ?.recentWindowComplete === true,
                unresolvedRecentRaces:
                  venueHistoryQuality[jcd]
                    ?.unresolvedRecentRaces || 0
              }
            )
          ])
      ),
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
    RACER_SKILL_OUTPUT_FILE,
    JSON.stringify(
      racerSkillOutput
    ) + "\n",
    "utf8"
  );

  fs.writeFileSync(
    COURSE_STRUCTURE_OUTPUT_FILE,
    JSON.stringify(
      courseStructureOutput
    ) + "\n",
    "utf8"
  );

  fs.writeFileSync(
    RACER_VENUE_STARTS_OUTPUT_FILE,
    JSON.stringify(
      racerVenueStartsOutput
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
  main,
  THREE_YEAR_DAYS,
  RECENT_YEAR_DAYS,
  RECENT_MISSING_DAYS,
  createPattern,
  addRace,
  finalizePattern,
  parseRaceDate,
  createVenueRaceWindows,
  finalizeVenueRaceWindows,
  createTrifectaWindows,
  createVenueTrifectaSummary,
  addTrifectaRace,
  addRacerVenueStarts,
  finalizeRacerVenueStarts,
  finalizeTrifectaWindows,
  finalizeVenueTrifectaSummary,
  findContinuousHistoryStartDate,
  buildVenueHistoryQuality,
  isRaceDayClosed,
  collectOfficialRaces,
  createCourseStructurePattern,
  addCourseStructureRace,
  finalizeCourseStructurePattern,
  createCourseStructureWindows,
  finalizeCourseStructureWindows,
  stStandardDeviation
};
