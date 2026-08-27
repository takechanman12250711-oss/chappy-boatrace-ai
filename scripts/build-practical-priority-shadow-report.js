"use strict";

const fs = require("node:fs");
const path = require("node:path");
const reportApi = require(
  "../js/practical-priority-shadow-report"
);

const ROOT = path.resolve(__dirname, "..");
const PREDICTION_DIRECTORY = path.join(
  ROOT,
  "data",
  "predictions"
);
const RESULT_DIRECTORY = path.join(
  ROOT,
  "data",
  "results"
);
const OUTPUT = path.join(
  ROOT,
  "data",
  "stats",
  "practical-priority-shadow-report.json"
);

function predictionRows() {
  const rows = [];
  fs.readdirSync(PREDICTION_DIRECTORY)
    .filter(name => /^\d{8}\.json$/.test(name))
    .filter(name =>
      name.slice(0, 8) >=
      reportApi.CONTRACT_START_DATE
    )
    .sort()
    .forEach(name => {
      const data = JSON.parse(
        fs.readFileSync(
          path.join(PREDICTION_DIRECTORY, name),
          "utf8"
        )
      );
      const resultPath = path.join(
        RESULT_DIRECTORY,
        name
      );
      const resultData = fs.existsSync(resultPath)
        ? JSON.parse(
          fs.readFileSync(resultPath, "utf8")
        )
        : {};
      rows.push(
        ...rowsFromPredictionData(data, resultData)
      );
    });
  return rows;
}

function officialVoidKeys(resultData = {}) {
  return new Set(
    (Array.isArray(resultData?.races)
      ? resultData.races
      : [])
      .filter(row =>
        row?.void === true || row?.status === "void"
      )
      .map(row => {
        const date = String(
          row?.date || resultData?.date || ""
        );
        const jcd = String(row?.jcd || "")
          .replace(/\D/g, "")
          .padStart(2, "0")
          .slice(-2);
        const raceNo = Number(row?.raceNo || 0);
        return date &&
          /^\d{2}$/.test(jcd) &&
          raceNo >= 1 &&
          raceNo <= 12
          ? `${date}-${jcd}-${raceNo}`
          : "";
      })
      .filter(Boolean)
  );
}

function officialResultMap(resultData = {}) {
  const map = new Map();
  for (const row of Array.isArray(resultData?.races)
    ? resultData.races
    : []) {
    const date = String(row?.date || resultData?.date || "");
    const jcd = String(row?.jcd || "")
      .replace(/\D/g, "")
      .padStart(2, "0")
      .slice(-2);
    const raceNo = Number(row?.raceNo || 0);
    if (date && /^\d{2}$/.test(jcd) && raceNo >= 1 && raceNo <= 12) {
      map.set(`${date}-${jcd}-${raceNo}`, row);
    }
  }
  return map;
}

function attachOfficialResults(rows, resultData = {}) {
  const results = officialResultMap(resultData);
  return rows.map(row => {
    const official = results.get(String(row?.raceKey || ""));
    if (!official) return row;
    if (official?.void === true || official?.status === "void") {
      return {
        ...row,
        result: {
          ...(row?.result || {}),
          settled: false,
          status: "void",
          void: true,
          resolvedVoid: true
        }
      };
    }
    const resultTicket = String(
      official?.trifecta?.combination || ""
    ).trim();
    const payout = Math.max(
      0,
      Number(official?.trifecta?.payout || 0)
    );
    if (
      official?.resultAvailable !== true ||
      official?.status !== "finished" ||
      !resultTicket ||
      payout <= 0
    ) {
      return row;
    }
    return {
      ...row,
      result: {
        ...(row?.result || {}),
        settled: true,
        status: "finished",
        void: false,
        resolvedVoid: false,
        resultTicket,
        payout,
        payoutPer100: payout,
        popularity: Number(
          official?.trifecta?.popularity || 0
        ),
        finishers: Array.isArray(official?.finishers)
          ? official.finishers
          : [],
        starts: Array.isArray(official?.starts)
          ? official.starts
          : []
      }
    };
  });
}

function attachOfficialVoid(rows, resultData = {}) {
  const voidKeys = officialVoidKeys(resultData);
  return rows.map(row => {
    if (!voidKeys.has(String(row?.raceKey || ""))) {
      return row;
    }
    return {
      ...row,
      result: {
        ...(row?.result || {}),
        settled: false,
        status: "void",
        void: true,
        resolvedVoid: true
      }
    };
  });
}

function rowsFromPredictionData(
  data = {},
  resultData = {}
) {
  const selected = Array.isArray(data?.predictions)
    ? data.predictions
    : [];
  const selectedKeys = new Set(
    selected
      .map(row => String(row?.raceKey || ""))
      .filter(Boolean)
  );
  const verification = Array.isArray(
    data?.verificationPredictions
  )
    ? data.verificationPredictions
    : [];
  return attachOfficialResults([
    ...selected,
    ...verification.filter(row =>
      !selectedKeys.has(String(row?.raceKey || ""))
    )
  ], resultData);
}

function buildReport(
  generatedAt = new Date().toISOString()
) {
  return {
    generatedAt,
    ...reportApi.build(predictionRows())
  };
}

function withoutGeneratedAt(report = {}) {
  const { generatedAt: _generatedAt, ...rest } = report;
  return rest;
}

function reportForWrite(
  generatedAt = new Date().toISOString()
) {
  const report = buildReport(generatedAt);
  if (!fs.existsSync(OUTPUT)) return report;

  const current = JSON.parse(
    fs.readFileSync(OUTPUT, "utf8")
  );
  return JSON.stringify(withoutGeneratedAt(current)) ===
    JSON.stringify(withoutGeneratedAt(report))
    ? { ...report, generatedAt: current.generatedAt }
    : report;
}

function main() {
  const report = reportForWrite();
  fs.mkdirSync(path.dirname(OUTPUT), {
    recursive: true
  });
  fs.writeFileSync(
    OUTPUT,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  console.log(
    `順位候補シャドー検証：${report.status}` +
    `（${report.cohortCount}/${report.contract.targetReplacementCount}件）`
  );
}

if (require.main === module) main();

module.exports = {
  ROOT,
  PREDICTION_DIRECTORY,
  RESULT_DIRECTORY,
  OUTPUT,
  officialVoidKeys,
  officialResultMap,
  attachOfficialResults,
  attachOfficialVoid,
  rowsFromPredictionData,
  predictionRows,
  buildReport,
  withoutGeneratedAt,
  reportForWrite,
  main
};
