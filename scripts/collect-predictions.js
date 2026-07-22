// scripts/collect-predictions.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const scheduleApi = require("../api/schedule");
const raceApi = require("../api/race");

global.window = global;
require("../js/ai-core");
require("../js/prediction");
require("../js/practical-selection");
require("../js/note-generator");

const historyStats = require(
  "../data/stats/venue-race-patterns.json"
);
const historyInsights = require(
  "../js/history-insights"
);
const predictionConditions = require(
  "../js/prediction-conditions"
);

const MIN_SCORE = 70;
const MAX_RUNS_PER_DAY = 100;

function getArgument(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo"
  })
    .format(new Date())
    .replaceAll("-", "");
}

function getTargetDate() {
  const rawDate = getArgument("date") || process.env.PREDICT_DATE || getJstDate();
  const date = rawDate.replaceAll("-", "").replaceAll("/", "");

  if (!/^\d{8}$/.test(date)) {
    throw new Error(`日付はYYYYMMDD形式で指定してください：${rawDate}`);
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
          reject(new Error(data?.error || `APIエラー：${statusCode}`));
          return;
        }
        resolve(data);
      }
    };

    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function compactEvaluation(evaluation) {
  return {
    ready: Boolean(evaluation?.ready),
    honmei: evaluation?.honmei || null,
    manshu: evaluation?.manshu || null,
    dataStatus: evaluation?.dataStatus || null
  };
}

function compactPrediction(prediction, practicalTickets, raceData) {
  return {
    version: prediction?.version || "",
    predictionMode: prediction?.predictionMode || "server_pre_deadline",
    raceFlow: prediction?.raceFlow || null,
    confidence: prediction?.confidence || null,
    manshuPower: prediction?.manshuPower || null,
    mainSheet: prediction?.mainSheet || null,
    manshuSheet: prediction?.manshuSheet || null,
    ticketRanks: Array.isArray(prediction?.ticketRanks)
      ? prediction.ticketRanks
      : [],
    practicalTickets,
    preRaceConditions: predictionConditions.capture(raceData, prediction)
  };
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function loadTargets(date) {
  const forcedJcd = getArgument("jcd");
  const forcedRaceNo = Number(getArgument("rno"));

  if (forcedJcd && forcedRaceNo) {
    return [{
      jcd: forcedJcd.padStart(2, "0"),
      place: forcedJcd.padStart(2, "0"),
      raceNo: forcedRaceNo,
      deadlineAt: "",
      forced: true
    }];
  }

  const schedule = await callApi(scheduleApi, { date });
  return (schedule.liveVenues || [])
    .map(venue => ({
      jcd: String(venue.jcd || "").padStart(2, "0"),
      place: String(venue.place || ""),
      raceNo: Number(venue.currentRaceNo || 0),
      deadlineAt: String(venue.deadlineAt || ""),
      forced: false
    }))
    .filter(target => target.jcd && target.raceNo);
}

async function evaluateTargets(date, targets) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < targets.length) {
      const target = targets[nextIndex++];

      try {
        const raceData = await callApi(raceApi, {
          date,
          jcd: target.jcd,
          rno: String(target.raceNo)
        });
        const evaluation = global.ChappyAICore.buildRaceTrendEvaluation(raceData);

        if (!evaluation?.ready) continue;

        const honmei = Number(evaluation.honmei?.score || 0);
        const manshu = Number(evaluation.manshu?.score || 0);
        const type =
          honmei >= manshu ? "本線" : "波乱";
        const historyPattern =
          historyInsights.getPattern(
            historyStats,
            target.jcd,
            target.raceNo
          );
        const historyTrend =
          historyInsights.buildTrend(
            historyPattern
          );
        const historySupport =
          historyInsights.supportForType(
            historyTrend,
            type
          );

        results.push({
          ...target,
          raceData,
          evaluation,
          score: Math.max(honmei, manshu),
          type,
          historySupport,
          historyTrend,
          completeness: Number(evaluation.dataStatus?.completeness || 0)
        });
      } catch (error) {
        console.warn(
          `${target.place || target.jcd} ${target.raceNo}Rの比較失敗：${error?.message || error}`
        );
      }

      await wait(250);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(3, targets.length) }, () => worker())
  );

  return results.sort((a, b) =>
    b.score - a.score ||
    b.historySupport - a.historySupport ||
    b.completeness - a.completeness ||
    Date.parse(a.deadlineAt || 0) - Date.parse(b.deadlineAt || 0)
  );
}

function upsertByRaceKey(list, records) {
  const output = Array.isArray(list) ? [...list] : [];
  (Array.isArray(records) ? records : []).forEach(record => {
    if (!record?.raceKey) return;
    const index = output.findIndex(item => item?.raceKey === record.raceKey);
    if (index >= 0) output[index] = record;
    else output.push(record);
  });
  return output;
}

function buildStoredPrediction(date, item, selected = false) {
  const prediction = global.createPrediction(item.raceData);
  prediction.predictionMode = selected
    ? "server_pre_deadline"
    : "server_pre_deadline_shadow";
  prediction.officialResultUsedForPrediction = false;

  const practicalTickets =
    global.ChappyNoteGenerator.createPracticalSelection(prediction);
  const raceKey = `${date}-${item.jcd}-${item.raceNo}`;

  return {
    raceKey,
    date,
    jcd: item.jcd,
    place: item.place,
    raceNo: item.raceNo,
    deadlineAt: item.deadlineAt,
    selectedAt: new Date().toISOString(),
    verificationMode: selected ? "selected" : "shadow",
    scoreBand: item.score >= MIN_SCORE ? "70_plus" : "under_70",
    selection: {
      type: item.type,
      score: item.score,
      threshold: MIN_SCORE,
      qualified: item.score >= MIN_SCORE,
      selected,
      evaluation: compactEvaluation(item.evaluation)
    },
    prediction: compactPrediction(prediction, practicalTickets, item.raceData)
  };
}

function buildVerificationPredictions(date, comparison, selectedRaceKey = "") {
  const records = [];

  comparison.forEach(item => {
    const raceKey = `${date}-${item.jcd}-${item.raceNo}`;
    try {
      records.push(buildStoredPrediction(date, item, raceKey === selectedRaceKey));
    } catch (error) {
      console.warn(
        `${item.place || item.jcd} ${item.raceNo}Rの検証予想生成失敗：${error?.message || error}`
      );
    }
  });

  return records;
}

function saveRun(date, comparison, selectedData, verificationPredictions = []) {
  const outputPath = path.join(
    process.cwd(),
    "data",
    "predictions",
    `${date}.json`
  );
  const existing = loadJson(outputPath, {
    schemaVersion: 2,
    date,
    runs: [],
    predictions: [],
    verificationPredictions: []
  });

  const best = comparison[0] || null;
  const selected = Boolean(selectedData);
  const runKey = best
    ? `${date}-${best.jcd}-${best.raceNo}-${best.evaluation?.dataStatus?.stage || "unknown"}-${selected ? "selected" : "skipped"}`
    : `${date}-no-targets`;
  const run = {
    runKey,
    checkedAt: new Date().toISOString(),
    threshold: MIN_SCORE,
    selected,
    best: best
      ? {
          jcd: best.jcd,
          place: best.place,
          raceNo: best.raceNo,
          deadlineAt: best.deadlineAt,
          type: best.type,
          score: best.score,
          historySupport:
            best.historySupport || 0,
          historyTrend:
            best.historyTrend || null,
          evaluation: compactEvaluation(best.evaluation)
        }
      : null,
    compared: comparison.map(item => ({
      jcd: item.jcd,
      place: item.place,
      raceNo: item.raceNo,
      type: item.type,
      score: item.score,
      historySupport:
        item.historySupport || 0,
      historyTrend:
        item.historyTrend || null,
      evaluation: compactEvaluation(item.evaluation)
    }))
  };

  const runIndex = existing.runs.findIndex(item => item.runKey === runKey);
  if (runIndex >= 0) existing.runs[runIndex] = run;
  else existing.runs.push(run);

  if (selectedData) {
    const predictionIndex = existing.predictions.findIndex(
      item => item.raceKey === selectedData.raceKey
    );
    if (predictionIndex >= 0) existing.predictions[predictionIndex] = selectedData;
    else existing.predictions.push(selectedData);
  }

  existing.schemaVersion = 2;
  existing.verificationPredictions = upsertByRaceKey(
    existing.verificationPredictions,
    verificationPredictions
  );

  existing.updatedAt = new Date().toISOString();
  existing.runs = existing.runs.slice(-MAX_RUNS_PER_DAY);
  writeJson(outputPath, existing);
}

function saveNote(date, selected, article) {
  if (!article?.publishable || !article?.fullText) return "";

  const fileName = `${date}-${selected.jcd}-${String(selected.raceNo).padStart(2, "0")}R.md`;
  const outputPath = path.join(process.cwd(), "data", "notes", fileName);
  const markdown = `# ${article.title}\n\n${article.fullText}\n`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, "utf8");
  return path.relative(process.cwd(), outputPath);
}

async function main() {
  const date = getTargetDate();
  const dryRun = hasFlag("dry-run");
  const targets = await loadTargets(date);

  if (!targets.length) {
    console.log(`${date}は現在、締切前レースがありません`);
    return;
  }

  console.log(`${date}の締切前${targets.length}場を比較します`);
  const comparison = await evaluateTargets(date, targets);
  const best = comparison[0] || null;

  if (!best) {
    console.log("比較に必要なデータが不足しています");
    if (!dryRun) saveRun(date, comparison, null, []);
    return;
  }

  const selectedRaceKey = best.score >= MIN_SCORE
    ? `${date}-${best.jcd}-${best.raceNo}`
    : "";
  const verificationPredictions = buildVerificationPredictions(
    date,
    comparison,
    selectedRaceKey
  );
  const selectedBase = verificationPredictions.find(
    item => item.raceKey === selectedRaceKey
  ) || null;
  let selectedData = null;
  let article = null;

  if (selectedBase) {
    const selectedPrediction = global.createPrediction(best.raceData);
    selectedPrediction.predictionMode = "server_pre_deadline";
    selectedPrediction.officialResultUsedForPrediction = false;
    article = global.ChappyNoteGenerator.generateArticle(selectedPrediction);
    const practicalTickets = article?.practicalTickets ||
      global.ChappyNoteGenerator.createPracticalSelection(selectedPrediction);
    selectedData = {
      ...selectedBase,
      prediction: compactPrediction(
        selectedPrediction,
        practicalTickets,
        best.raceData
      ),
      note: {
        publishable: Boolean(article?.publishable),
        title: article?.title || "",
        rejectionReasons: article?.rejectionReasons || []
      }
    };
  }

  if (!dryRun) {
    if (selectedData) selectedData.note.path = saveNote(date, best, article);
    saveRun(date, comparison, selectedData, verificationPredictions);
  }

  console.log(
    `検証保存：${verificationPredictions.length}R（70点以上${verificationPredictions.filter(item => item.scoreBand === "70_plus").length}R／70点未満${verificationPredictions.filter(item => item.scoreBand === "under_70").length}R）`
  );

  if (!selectedData) {
    console.log(
      `見送り：最高${Math.round(best.score)}点／基準${MIN_SCORE}点`
    );
    return;
  }

  console.log(
    `自動選定：${best.place || best.jcd} ${best.raceNo}R（${best.type}${Math.round(best.score)}点）`
  );
  console.log(`実戦厳選：${selectedData.prediction.practicalTickets.length}点`);
  console.log(
    article?.publishable
      ? "note下書き：生成可能"
      : `note下書き：販売見送り（${(article?.rejectionReasons || []).join("／")}）`
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  MIN_SCORE,
  upsertByRaceKey,
  buildStoredPrediction,
  buildVerificationPredictions,
  saveRun
};
