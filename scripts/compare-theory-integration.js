"use strict";

const fs = require("node:fs");
const path = require("node:path");
const raceApi = require("../api/race");
const {
  attachVenueRaceHistory
} = require("./collect-predictions");
const theoryInput = require(
  "../js/theory-input"
);

const predictionDir = path.join(
  __dirname,
  "..",
  "data",
  "predictions"
);

function callRaceApi(query) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
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
              data?.error ||
              `APIエラー：${statusCode}`
            )
          );
          return;
        }
        resolve(data);
      }
    };

    Promise.resolve(
      raceApi({ query }, res)
    ).catch(reject);
  });
}

function readFirstTen() {
  return fs.readdirSync(predictionDir)
    .filter((name) =>
      /^\d{8}\.json$/.test(name)
    )
    .sort()
    .flatMap((name) => {
      const data = JSON.parse(
        fs.readFileSync(
          path.join(
            predictionDir,
            name
          ),
          "utf8"
        )
      );
      return Array.isArray(
        data.verificationPredictions
      )
        ? data.verificationPredictions
        : [];
    })
    .slice(0, 10);
}

function markSnapshot(prediction) {
  return [
    prediction?.mainSheet
      ?.honmei?.boatNo || 0,
    prediction?.mainSheet
      ?.taikou?.boatNo || 0,
    prediction?.mainSheet
      ?.ana?.boatNo || 0,
    prediction?.mainSheet
      ?.osae?.boatNo || 0
  ];
}

function ticketSnapshot(prediction) {
  return (
    Array.isArray(
      prediction?.practicalTickets
    )
      ? prediction.practicalTickets
      : []
  ).map((item) =>
    String(
      item?.ticket ||
      item?.combination ||
      ""
    )
  ).filter(Boolean);
}

async function compareRecord(record) {
  const date = String(record?.date || "");
  const jcd = String(
    record?.jcd || ""
  ).padStart(2, "0");
  const raceNo = Number(
    record?.raceNo || 0
  );
  const raceData =
    await callRaceApi({
      date,
      jcd,
      rno: String(raceNo)
    });
  const history =
    attachVenueRaceHistory(
      raceData,
      jcd,
      raceNo
    );
  const prepared =
    theoryInput.prepare(
      history.raceData,
      global.ChappyAICore
    );
  const prediction =
    global.createPrediction(
      prepared
    );
  const practical =
    global.ChappyNoteGenerator
      .createPracticalSelection(
        prediction
      );
  const nextPrediction = {
    ...prediction,
    practicalTickets: practical
  };
  const oldMarks =
    markSnapshot(record.prediction);
  const newMarks =
    markSnapshot(nextPrediction);
  const oldTickets =
    ticketSnapshot(record.prediction);
  const newTickets =
    ticketSnapshot(nextPrediction);
  const oldAvailability =
    record?.prediction
      ?.preRaceConditions
      ?.dataAvailability || {};

  return {
    raceKey: record.raceKey,
    oldMarks,
    newMarks,
    marksMatch:
      JSON.stringify(oldMarks) ===
      JSON.stringify(newMarks),
    oldTickets,
    newTickets,
    ticketsMatch:
      JSON.stringify(oldTickets) ===
      JSON.stringify(newTickets),
    oldEntryCount:
      Number(
        oldAvailability.entries || 0
      ),
    newEntryCount:
      Array.isArray(prepared?.entries)
        ? prepared.entries.filter(
            (entry) =>
              entry?.registerNo
          ).length
        : 0,
    oldWindDirectionAvailable:
      Boolean(
        record?.prediction
          ?.preRaceConditions
          ?.weather?.windDirection
      ),
    localStartsCount:
      Number(
        prepared?.theoryInput
          ?.localStartsCount || 0
      ),
    windDirection:
      prepared?.weather
        ?.windDirection || "",
    liveTideAvailable:
      prepared?.weather
        ?.liveTideAvailable === true,
    resultUsedForPrediction: false
  };
}

async function main() {
  const records = readFirstTen();
  const rows = Array(
    records.length
  );
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < records.length) {
      const index = nextIndex++;
      const record = records[index];
      try {
        rows[index] =
          await compareRecord(record);
      } catch (error) {
        rows[index] = {
          raceKey:
            record?.raceKey || "",
          error:
            error?.message ||
            String(error),
          resultUsedForPrediction: false
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            3,
            records.length
          )
      },
      () => worker()
    )
  );

  const completed = rows.filter(
    (row) => !row.error
  );
  console.log(
    JSON.stringify(
      {
        comparisonPolicy:
          "保存済み事前予想と、同じレースの公式出走表・展示を共通入力へ通した新予想を比較。公式結果は入力しない。",
        total: rows.length,
        completed: completed.length,
        marksMatched:
          completed.filter(
            (row) => row.marksMatch
          ).length,
        ticketsMatched:
          completed.filter(
            (row) => row.ticketsMatch
          ).length,
        localStartsReady:
          completed.filter(
            (row) =>
              row.localStartsCount === 6
          ).length,
        oldEntriesReady:
          completed.filter(
            (row) =>
              row.oldEntryCount === 6
          ).length,
        newEntriesReady:
          completed.filter(
            (row) =>
              row.newEntryCount === 6
          ).length,
        oldWindDirectionReady:
          completed.filter(
            (row) =>
              row.oldWindDirectionAvailable
          ).length,
        windDirectionReady:
          completed.filter(
            (row) =>
              Boolean(row.windDirection)
          ).length,
        liveTideReady:
          completed.filter(
            (row) =>
              row.liveTideAvailable
          ).length,
        rows
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error?.stack ||
    error?.message ||
    error
  );
  process.exitCode = 1;
});
