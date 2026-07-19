// scripts/collect-results.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const scheduleApi = require("../api/schedule");
const resultApi = require("../api/result");

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo"
  })
    .format(new Date())
    .replaceAll("-", "");
}

function getTargetDate() {
  const argument = process.argv.find(
    value => value.startsWith("--date=")
  );

  const date =
    argument?.split("=")[1] ||
    process.env.COLLECT_DATE ||
    getJstDate();

  if (!/^\d{8}$/.test(date)) {
    throw new Error("日付はYYYYMMDD形式で指定してください");
  }

  return date;
}

function callApi(handler, query) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;

    const req = { query };

    const res = {
      setHeader() {},

      status(code) {
        statusCode = code;
        return this;
      },

      json(data) {
        if (statusCode >= 400 || !data?.ok) {
          reject(
            new Error(
              data?.error || `APIエラー：${statusCode}`
            )
          );
          return;
        }

        resolve(data);
      }
    };

    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function wait(milliseconds) {
  return new Promise(resolve =>
    setTimeout(resolve, milliseconds)
  );
}

async function collectOneRace(date, venue, raceNo) {
  try {
    const result = await callApi(resultApi, {
      date,
      jcd: venue.jcd,
      rno: String(raceNo)
    });

    return {
      ...result,
      place: venue.place,
      eventTitle: venue.eventTitle || "",
      eventGrade: venue.eventGrade || ""
    };
  } catch (error) {
    return {
      ok: false,
      source: "boatrace-official",
      date,
      jcd: venue.jcd,
      place: venue.place,
      raceNo,
      resultAvailable: false,
      error: error?.message || String(error)
    };
  }
}

async function collectAllRaces(date, venues) {
  const targets = venues.flatMap(venue =>
    Array.from({ length: 12 }, (_, index) => ({
      venue,
      raceNo: index + 1
    }))
  );

  const results = new Array(targets.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < targets.length) {
      const index = nextIndex++;
      const target = targets[index];

      results[index] = await collectOneRace(
        date,
        target.venue,
        target.raceNo
      );

      await wait(250);
    }
  }

  await Promise.all([
    worker(),
    worker(),
    worker()
  ]);

  return results;
}

async function main() {
  const date = getTargetDate();

  console.log(`${date}の公式結果を収集します`);

  const schedule = await callApi(scheduleApi, { date });
  const venues = schedule.venues || [];

  if (!venues.length) {
    throw new Error("開催場を確認できませんでした");
  }

  const races = await collectAllRaces(date, venues);

  const completedRaces = races.filter(
    race => race.resultAvailable
  ).length;

  const failedRaces = races.filter(
    race => race.error
  ).length;

  const data = {
    schemaVersion: 1,
    source: "boatrace-official",
    sourcePolicy: "公式結果を正として保存",
    date,
    collectedAt: new Date().toISOString(),
    venueCount: venues.length,
    raceCount: races.length,
    completedRaces,
    pendingRaces:
      races.length - completedRaces - failedRaces,
    failedRaces,
    complete:
      completedRaces === races.length &&
      failedRaces === 0,

    venues: venues.map(venue => ({
      jcd: venue.jcd,
      place: venue.place,
      eventTitle: venue.eventTitle || "",
      eventGrade: venue.eventGrade || ""
    })),

    races
  };

  const outputPath = path.join(
    process.cwd(),
    "data",
    "results",
    `${date}.json`
  );

  fs.mkdirSync(
    path.dirname(outputPath),
    { recursive: true }
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `保存完了：${completedRaces}/${races.length}レース`
  );
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
});