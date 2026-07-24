// scripts/build-frame-rise-sink-stats.js
// 公式結果から枠別浮沈率と進入変化別の成績を作成する。
// 分析専用。予想ロジック・配点・買い目は変更しない。

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const RESULTS_DIR = path.join(ROOT, "data", "results");
const OUTPUT_FILE = path.join(
  ROOT,
  "data",
  "stats",
  "frame-rise-sink-patterns.json"
);

function percent(value, total) {
  return total ? Number((value * 100 / total).toFixed(1)) : 0;
}

function reliability(samples) {
  if (samples >= 100) return "high";
  if (samples >= 30) return "medium";
  return "low";
}

function createFrameStats(frameNo) {
  return {
    frameNo,
    starts: 0,
    wins: 0,
    top3: 0,
    rises: 0,
    stays: 0,
    sinks: 0,
    courseInside: 0,
    courseSame: 0,
    courseOutside: 0,
    byCourseMovement: {
      inside: { starts: 0, wins: 0, top3: 0, rises: 0, stays: 0, sinks: 0 },
      same: { starts: 0, wins: 0, top3: 0, rises: 0, stays: 0, sinks: 0 },
      outside: { starts: 0, wins: 0, top3: 0, rises: 0, stays: 0, sinks: 0 }
    }
  };
}

function createPattern() {
  return {
    raceCount: 0,
    frames: Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => {
        const frameNo = index + 1;
        return [String(frameNo), createFrameStats(frameNo)];
      })
    )
  };
}

function getMovement(frameNo, courseNo) {
  if (courseNo < frameNo) return "inside";
  if (courseNo > frameNo) return "outside";
  return "same";
}

function addOutcome(target, rank) {
  target.starts += 1;
  if (rank === 1) target.wins += 1;
  if (rank >= 1 && rank <= 3) target.top3 += 1;
  if (rank < target.frameNo) target.rises += 1;
  else if (rank === target.frameNo) target.stays += 1;
  else if (rank > target.frameNo) target.sinks += 1;
}

function addMovementOutcome(target, rank, frameNo) {
  target.starts += 1;
  if (rank === 1) target.wins += 1;
  if (rank >= 1 && rank <= 3) target.top3 += 1;
  if (rank < frameNo) target.rises += 1;
  else if (rank === frameNo) target.stays += 1;
  else if (rank > frameNo) target.sinks += 1;
}

function addRace(pattern, race) {
  if (!race?.resultAvailable) return false;

  const rankByBoat = new Map(
    (race.finishers || [])
      .map(item => [Number(item.boat), Number(item.rank)])
      .filter(([boat, rank]) =>
        Number.isInteger(boat) && boat >= 1 && boat <= 6 &&
        Number.isInteger(rank) && rank >= 1 && rank <= 6
      )
  );
  const courseByBoat = new Map(
    (race.starts || [])
      .map(item => [Number(item.boat), Number(item.course)])
      .filter(([boat, course]) =>
        Number.isInteger(boat) && boat >= 1 && boat <= 6 &&
        Number.isInteger(course) && course >= 1 && course <= 6
      )
  );

  if (rankByBoat.size !== 6 || courseByBoat.size !== 6) return false;

  pattern.raceCount += 1;

  for (let frameNo = 1; frameNo <= 6; frameNo += 1) {
    const rank = rankByBoat.get(frameNo);
    const courseNo = courseByBoat.get(frameNo);
    const frame = pattern.frames[String(frameNo)];
    const movement = getMovement(frameNo, courseNo);

    addOutcome(frame, rank);
    frame[`course${movement[0].toUpperCase()}${movement.slice(1)}`] += 1;
    addMovementOutcome(frame.byCourseMovement[movement], rank, frameNo);
  }

  return true;
}

function finalizeBucket(bucket) {
  return {
    starts: bucket.starts,
    reliability: reliability(bucket.starts),
    wins: bucket.wins,
    winRate: percent(bucket.wins, bucket.starts),
    top3: bucket.top3,
    top3Rate: percent(bucket.top3, bucket.starts),
    rises: bucket.rises,
    riseRate: percent(bucket.rises, bucket.starts),
    stays: bucket.stays,
    stayRate: percent(bucket.stays, bucket.starts),
    sinks: bucket.sinks,
    sinkRate: percent(bucket.sinks, bucket.starts)
  };
}

function finalizePattern(pattern) {
  return {
    raceCount: pattern.raceCount,
    reliability: reliability(pattern.raceCount),
    frames: Object.fromEntries(
      Object.entries(pattern.frames).map(([frameNo, frame]) => [
        frameNo,
        {
          frameNo: frame.frameNo,
          ...finalizeBucket(frame),
          entryMovement: {
            inside: {
              count: frame.courseInside,
              rate: percent(frame.courseInside, frame.starts)
            },
            same: {
              count: frame.courseSame,
              rate: percent(frame.courseSame, frame.starts)
            },
            outside: {
              count: frame.courseOutside,
              rate: percent(frame.courseOutside, frame.starts)
            }
          },
          byCourseMovement: {
            inside: finalizeBucket(frame.byCourseMovement.inside),
            same: finalizeBucket(frame.byCourseMovement.same),
            outside: finalizeBucket(frame.byCourseMovement.outside)
          }
        }
      ])
    )
  };
}

function readResultFiles() {
  if (!fs.existsSync(RESULTS_DIR)) return [];

  return fs.readdirSync(RESULTS_DIR)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .map(name => {
      const filePath = path.join(RESULTS_DIR, name);
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (error) {
        console.warn(`${name}を読み込めません：${error?.message || error}`);
        return null;
      }
    })
    .filter(Boolean);
}

function main() {
  const files = readResultFiles();
  const overall = createPattern();
  const byVenue = {};
  let firstDate = null;
  let lastDate = null;

  for (const file of files) {
    const date = String(file?.date || "");
    if (/^\d{8}$/.test(date)) {
      firstDate = firstDate || date;
      lastDate = date;
    }

    for (const race of file?.races || []) {
      if (!race?.resultAvailable) continue;
      const jcd = String(race.jcd || "").padStart(2, "0");
      const venue = byVenue[jcd] ||= {
        jcd,
        place: String(
          file?.venues?.find(item => String(item.jcd).padStart(2, "0") === jcd)?.place || ""
        ),
        pattern: createPattern()
      };

      addRace(overall, race);
      addRace(venue.pattern, race);
    }
  }

  const output = {
    schemaVersion: 1,
    source: "boatrace-official",
    usagePolicy:
      "枠番と公式着順・実進入の関係を分析する参考統計。単独で予想、配点、印、買い目を変更しない",
    definition: {
      rise: "着順が枠番より上",
      stay: "着順と枠番が同じ",
      sink: "着順が枠番より下",
      entryInside: "実進入コースが枠番より内",
      entrySame: "実進入コースと枠番が同じ",
      entryOutside: "実進入コースが枠番より外"
    },
    generatedAt: new Date().toISOString(),
    sourceFileCount: files.length,
    firstDate,
    lastDate,
    overall: finalizePattern(overall),
    byVenue: Object.fromEntries(
      Object.values(byVenue)
        .sort((a, b) => a.jcd.localeCompare(b.jcd))
        .map(venue => [
          venue.jcd,
          {
            jcd: venue.jcd,
            place: venue.place,
            ...finalizePattern(venue.pattern)
          }
        ])
    )
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(
    `枠別浮沈率を${output.sourceFileCount}日分・${output.overall.raceCount}レース集計しました`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  percent,
  reliability,
  createPattern,
  getMovement,
  addRace,
  finalizePattern
};
