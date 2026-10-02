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

  const rawDate = String(
    argument?.split("=")[1] ||
    process.env.COLLECT_DATE ||
    ""
  ).trim();

  const isEmpty =
    !rawDate ||
    rawDate.toLowerCase() === "null" ||
    rawDate.toLowerCase() === "undefined";

  const date = isEmpty
    ? getJstDate()
    : rawDate
        .replaceAll("-", "")
        .replaceAll("/", "");

  if (!/^\d{8}$/.test(date)) {
    throw new Error(
      `日付はYYYYMMDD形式で指定してください：${rawDate}`
    );
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

function resultRaceKey(race) {
  const jcd =
    String(race?.jcd || "")
      .replace(/\D/g, "")
      .padStart(2, "0")
      .slice(-2);
  const raceNo =
    Number(race?.raceNo || 0);

  return (
    /^\d{2}$/.test(jcd) &&
    raceNo >= 1 &&
    raceNo <= 12
  )
    ? `${jcd}-${raceNo}`
    : "";
}

function isVoidRace(race) {
  if (
    !race ||
    race?.resultAvailable === true ||
    race?.trifecta
  ) {
    return false;
  }

  const starts =
    Array.isArray(race?.starts)
      ? race.starts
      : [];

  return (
    starts.length === 6 &&
    starts.every(start =>
      start?.falseStart === true ||
      start?.lateStart === true
    )
  );
}

function normalizeResolvedRace(race) {
  if (!isVoidRace(race)) {
    return race;
  }

  return {
    ...race,
    status: "void",
    void: true,
    resultAvailable: false
  };
}

function mergeOfficialResults(
  existing,
  collected
) {
  const previous =
    existing &&
    typeof existing === "object"
      ? existing
      : {};
  const next =
    collected &&
    typeof collected === "object"
      ? collected
      : {};
  const raceMap =
    new Map();

  (
    Array.isArray(previous.races)
      ? previous.races
      : []
  ).forEach(race => {
    const normalizedRace =
      normalizeResolvedRace(race);
    const key =
      resultRaceKey(normalizedRace);
    if (key) {
      raceMap.set(key, normalizedRace);
    }
  });

  (
    Array.isArray(next.races)
      ? next.races
      : []
  ).forEach(race => {
    const normalizedRace =
      normalizeResolvedRace(race);
    const key =
      resultRaceKey(normalizedRace);
    if (!key) return;

    const known =
      raceMap.get(key);
    if (
      known?.resultAvailable ===
        true &&
      normalizedRace?.resultAvailable !==
        true
    ) {
      raceMap.set(key, {
        ...known,
        place:
          normalizedRace?.place ||
          known?.place ||
          "",
        eventTitle:
          normalizedRace?.eventTitle ||
          known?.eventTitle ||
          "",
        eventGrade:
          normalizedRace?.eventGrade ||
          known?.eventGrade ||
          ""
      });
      return;
    }

    raceMap.set(key, normalizedRace);
  });

  const races =
    Array.from(
      raceMap.values()
    ).sort((left, right) =>
      Number(left?.jcd || 0) -
        Number(right?.jcd || 0) ||
      Number(left?.raceNo || 0) -
        Number(right?.raceNo || 0)
    );
  const venueMap =
    new Map();

  [
    ...(Array.isArray(
      previous.venues
    )
      ? previous.venues
      : []),
    ...(Array.isArray(
      next.venues
    )
      ? next.venues
      : [])
  ].forEach(venue => {
    const jcd =
      String(
        venue?.jcd || ""
      )
        .replace(/\D/g, "")
        .padStart(2, "0")
        .slice(-2);
    if (!/^\d{2}$/.test(jcd)) {
      return;
    }
    venueMap.set(jcd, {
      ...(venueMap.get(jcd) || {}),
      ...venue,
      jcd
    });
  });

  races.forEach(race => {
    const jcd =
      String(
        race?.jcd || ""
      )
        .replace(/\D/g, "")
        .padStart(2, "0")
        .slice(-2);
    if (
      /^\d{2}$/.test(jcd) &&
      !venueMap.has(jcd)
    ) {
      venueMap.set(jcd, {
        jcd,
        place:
          String(
            race?.place || ""
          ),
        eventTitle:
          String(
            race?.eventTitle ||
            ""
          ),
        eventGrade:
          String(
            race?.eventGrade ||
            ""
          )
      });
    }
  });

  const completedRaces =
    races.filter(
      race =>
        race?.resultAvailable ===
          true
    ).length;
  const voidRaces =
    races.filter(
      race =>
        race?.void === true ||
        race?.status === "void"
    ).length;
  const failedRaces =
    races.filter(
      race =>
        race?.resultAvailable !==
          true &&
        race?.void !== true &&
        race?.status !== "void" &&
        Boolean(race?.error)
    ).length;
  const resolvedRaces =
    completedRaces + voidRaces;
  const pendingRaces =
    races.length -
    resolvedRaces -
    failedRaces;
  const pendingRaceKeys =
    races
      .filter(race =>
        race?.resultAvailable !== true &&
        race?.void !== true &&
        race?.status !== "void" &&
        !race?.error
      )
      .map(resultRaceKey)
      .filter(Boolean);
  const voidRaceKeys =
    races
      .filter(race =>
        race?.void === true ||
        race?.status === "void"
      )
      .map(resultRaceKey)
      .filter(Boolean);

  return {
    ...previous,
    ...next,
    schemaVersion:
      Math.max(
        Number(
          previous
            ?.schemaVersion || 0
        ),
        Number(
          next?.schemaVersion || 0
        ),
        1
      ),
    source:
      next.source ||
      previous.source ||
      "boatrace-official",
    sourcePolicy:
      "公式結果を正として保存し、再取得失敗時も取得済み結果を保持",
    venueCount:
      venueMap.size,
    raceCount:
      races.length,
    completedRaces,
    voidRaces,
    resolvedRaces,
    pendingRaces,
    failedRaces,
    pendingRaceKeys,
    voidRaceKeys,
    complete:
      races.length > 0 &&
      resolvedRaces ===
        races.length &&
      failedRaces === 0,
    venues:
      Array.from(
        venueMap.values()
      ).sort(
        (left, right) =>
          Number(left.jcd) -
          Number(right.jcd)
      ),
    races
  };
}

function readExistingResults(
  outputPath
) {
  if (
    !fs.existsSync(outputPath)
  ) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        outputPath,
        "utf8"
      )
    );
  } catch (error) {
    console.warn(
      `既存結果を読み込めないため再構築します：${error?.message || error}`
    );
    return null;
  }
}

function normalizeForComparison(
  value
) {
  if (Array.isArray(value)) {
    return value.map(
      normalizeForComparison
    );
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [
        key,
        normalizeForComparison(
          value[key]
        )
      ])
  );
}

function hasMaterialResultChange(
  existing,
  next
) {
  if (
    !existing ||
    typeof existing !== "object"
  ) {
    return true;
  }

  const previousComparable = {
    ...existing
  };
  const nextComparable = {
    ...next
  };
  delete previousComparable
    .collectedAt;
  delete nextComparable
    .collectedAt;

  return (
    JSON.stringify(
      normalizeForComparison(
        previousComparable
      )
    ) !==
    JSON.stringify(
      normalizeForComparison(
        nextComparable
      )
    )
  );
}

function writeJsonAtomic(
  outputPath,
  value
) {
  const temporaryPath =
    `${outputPath}.` +
    `${process.pid}.tmp`;

  fs.mkdirSync(
    path.dirname(outputPath),
    { recursive: true }
  );
  try {
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(
        value,
        null,
        2
      ) + "\n",
      "utf8"
    );
    fs.renameSync(
      temporaryPath,
      outputPath
    );
  } finally {
    if (
      fs.existsSync(
        temporaryPath
      )
    ) {
      fs.unlinkSync(
        temporaryPath
      );
    }
  }
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

  const collected = {
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

  const existing =
    readExistingResults(
      outputPath
    );
  const data =
    mergeOfficialResults(
      existing,
      collected
    );

  if (
    !hasMaterialResultChange(
      existing,
      data
    )
  ) {
    console.log(
      "公式結果に変更はありません"
    );
    return;
  }

  writeJsonAtomic(
    outputPath,
    data
  );

  console.log(
    `保存完了：${data.resolvedRaces}/${data.raceCount}レース解決済み` +
    `（完走${data.completedRaces}・不成立${data.voidRaces}・未確定${data.pendingRaces}・失敗${data.failedRaces}）`
  );

  if (data.pendingRaceKeys.length) {
    console.log(
      `未確定：${data.pendingRaceKeys.join(", ")}`
    );
  }
  if (data.voidRaceKeys.length) {
    console.log(
      `不成立：${data.voidRaceKeys.join(", ")}`
    );
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      error?.message ||
      error
    );
    process.exitCode = 1;
  });
}

module.exports = {
  getJstDate,
  getTargetDate,
  callApi,
  collectOneRace,
  collectAllRaces,
  resultRaceKey,
  isVoidRace,
  normalizeResolvedRace,
  mergeOfficialResults,
  normalizeForComparison,
  hasMaterialResultChange,
  readExistingResults,
  writeJsonAtomic,
  main
};
