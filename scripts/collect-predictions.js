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

function predictionFilePath(date) {
  return path.join(process.cwd(), "data", "predictions", `${date}.json`);
}

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

function compactMark(value) {
  if (!value || typeof value !== "object") return null;
  return {
    boatNo: Number(value.boatNo || value.no || value.boat || 0),
    name: String(value.name || value.playerName || "")
  };
}

function compactScenario(value) {
  if (!value || typeof value !== "object") return null;

  return {
    type: String(value.type || ""),
    label: String(value.label || ""),
    score: Number(value.score || 0),
    frameMovementAdjustment: Number(
      value.frameMovementAdjustment || 0
    ),
    attacker: Number(value.attacker || 0) || null,
    blockedBoats: Array.isArray(value.blockedBoats)
      ? value.blockedBoats.map(Number).filter(Boolean)
      : []
  };
}

function compactVerificationEvidence(prediction) {
  if (
    prediction?.verificationEvidence &&
    typeof prediction.verificationEvidence === "object"
  ) {
    return prediction.verificationEvidence;
  }

  const aiCore = prediction?.aiCore || {};
  const raceScenarios = aiCore.raceScenarios || {};
  const marks = aiCore.marks || {};
  const formations = aiCore.formations || {};
  const evidence = raceScenarios.evidence || {};

  if (!raceScenarios.mainScenario) return null;

  return {
    sourceCommit: String(process.env.GITHUB_SHA || ""),
    aiCoreVersion: String(
      aiCore.version || global.ChappyAICoreVersion || ""
    ),
    mainScenario: compactScenario(raceScenarios.mainScenario),
    subScenario: compactScenario(raceScenarios.subScenario),
    scenarios: Array.isArray(raceScenarios.scenarios)
      ? raceScenarios.scenarios.map(compactScenario).filter(Boolean)
      : [],
    roles: {
      attacker: Number(raceScenarios.attacker || 0) || null,
      wallBoat: Number(raceScenarios.wallBoat || 0) || null,
      remainers: [...(raceScenarios.remainers || [])],
      followers: [...(raceScenarios.followers || [])],
      pickupCandidates: [...(raceScenarios.pickupCandidates || [])],
      roadRaceBoats: [...(raceScenarios.roadRaceBoats || [])],
      localExperts: [...(raceScenarios.localExperts || [])],
      blockedBoats: [...(raceScenarios.blockedBoats || [])]
    },
    marks: {
      honmei: compactMark(marks.honmei),
      taikou: compactMark(marks.taikou),
      ana: compactMark(marks.ana),
      osae: compactMark(marks.osae)
    },
    formation: {
      mainEstablished: formations.mainEstablished === true,
      axis: formations.axis || null,
      scenarioType: String(formations?.evidence?.scenarioType || "")
    },
    relations: evidence.relations || raceScenarios.relations || null,
    frameMovement: Array.isArray(evidence.frameMovement)
      ? evidence.frameMovement
      : []
  };
}

function compactVerificationPayload(
  prediction,
  practicalTickets,
  preRaceConditions
) {
  return {
    version: prediction?.version || "",
    predictionMode: prediction?.predictionMode || "server_pre_deadline_shadow",
    raceFlow: {
      title: prediction?.raceFlow?.title || "",
      summary: prediction?.raceFlow?.summary || "",
      scenario: prediction?.raceFlow?.scenario?.title
        ? { title: prediction.raceFlow.scenario.title }
        : null
    },
    confidence: prediction?.confidence || null,
    manshuPower: prediction?.manshuPower || null,
    mainSheet: {
      honmei: compactMark(prediction?.mainSheet?.honmei),
      taikou: compactMark(prediction?.mainSheet?.taikou),
      ana: compactMark(prediction?.mainSheet?.ana),
      osae: compactMark(prediction?.mainSheet?.osae)
    },
    practicalTickets: Array.isArray(practicalTickets) ? practicalTickets : [],
    preRaceConditions: preRaceConditions || null,
    verificationEvidence: compactVerificationEvidence(prediction)
  };
}

function compactStoredVerification(record) {
  const prediction = record?.prediction || {};
  return {
    ...record,
    prediction: compactVerificationPayload(
      prediction,
      prediction.practicalTickets,
      prediction.preRaceConditions
    )
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

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))];
}

function insufficientReasons(evaluation) {
  const status = evaluation?.dataStatus || {};
  const reasons = uniqueStrings([
    ...(evaluation?.honmei?.reasons || []),
    ...(evaluation?.manshu?.reasons || [])
  ]);
  if (reasons.length) return reasons;

  if (Number(status.entryCount || 0) < 6) {
    reasons.push(`出走データ${Number(status.entryCount || 0)}/6艇`);
  }
  if (Number(status.stCount || 0) < 4) {
    reasons.push(`STデータ${Number(status.stCount || 0)}/6艇`);
  }
  if (Number(status.exhibitionCount || 0) < 4) {
    reasons.push(`展示データ${Number(status.exhibitionCount || 0)}/6艇`);
  }
  return reasons.length ? reasons : ["比較に必要な事前データが不足"];
}

function latestHealthTargets(data) {
  const latest = new Map();
  (Array.isArray(data?.runs) ? data.runs : []).forEach(run => {
    const checkedAt = String(run?.collectionHealth?.checkedAt || run?.checkedAt || "");
    (Array.isArray(run?.collectionHealth?.targets) ? run.collectionHealth.targets : [])
      .forEach(target => {
        const raceKey = String(target?.raceKey || "");
        if (!raceKey) return;
        const previous = latest.get(raceKey);
        if (!previous || checkedAt >= previous.checkedAt) {
          latest.set(raceKey, { ...target, checkedAt });
        }
      });
  });
  return latest;
}

function buildRecoveryPlan(date, liveTargets, data, now = new Date()) {
  const retryable = new Set([
    "insufficient_data",
    "fetch_failed",
    "prediction_failed",
    "not_attempted"
  ]);
  const targetMap = new Map();
  (Array.isArray(liveTargets) ? liveTargets : []).forEach(target => {
    targetMap.set(`${date}-${target.jcd}-${target.raceNo}`, { ...target });
  });
  const finalizedTargets = [];

  latestHealthTargets(data).forEach((target, raceKey) => {
    if (!raceKey.startsWith(`${date}-`) || !retryable.has(target.status)) return;
    const deadline = Date.parse(target.deadlineAt || "");
    const previous = {
      ...target,
      recoveryAttempt: true,
      previousStatus: target.status,
      attemptCount: Number(target.attemptCount || 1),
      firstDetectedAt: target.firstDetectedAt || target.checkedAt || ""
    };

    if (Number.isFinite(deadline) && deadline <= now.getTime()) {
      finalizedTargets.push({
        ...previous,
        status: "final_uncollected",
        finalAt: now.toISOString()
      });
      targetMap.delete(raceKey);
      return;
    }

    targetMap.set(raceKey, {
      ...previous,
      ...(targetMap.get(raceKey) || {})
    });
  });

  return {
    targets: [...targetMap.values()],
    finalizedTargets
  };
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
  const attempts = [];
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

        if (!evaluation?.ready) {
          const missingReasons = insufficientReasons(evaluation);
          attempts.push({
            ...target,
            status: "insufficient_data",
            error: missingReasons.join("／"),
            missingReasons
          });
          continue;
        }

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
        attempts.push({ ...target, status: "evaluated", error: "" });
      } catch (error) {
        attempts.push({
          ...target,
          status: "fetch_failed",
          error: String(error?.message || error).slice(0, 240)
        });
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

  const comparison = results.sort((a, b) =>
    b.score - a.score ||
    b.historySupport - a.historySupport ||
    b.completeness - a.completeness ||
    Date.parse(a.deadlineAt || 0) - Date.parse(b.deadlineAt || 0)
  );

  return { comparison, attempts };
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
    prediction: compactVerificationPayload(
      prediction,
      practicalTickets,
      predictionConditions.capture(item.raceData, prediction)
    )
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

function buildCollectionHealth(
  date,
  targets,
  attempts,
  verificationPredictions,
  finalizedTargets = [],
  checkedAt = new Date().toISOString()
) {
  const savedKeys = new Set(
    (Array.isArray(verificationPredictions) ? verificationPredictions : [])
      .map(item => String(item?.raceKey || ""))
      .filter(Boolean)
  );
  const attemptByKey = new Map(
    (Array.isArray(attempts) ? attempts : []).map(item => [
      `${date}-${item.jcd}-${item.raceNo}`,
      item
    ])
  );
  const monitoredTargets = [
    ...(Array.isArray(targets) ? targets : []),
    ...(Array.isArray(finalizedTargets) ? finalizedTargets : [])
  ].map(target => {
    const raceKey = `${date}-${target.jcd}-${target.raceNo}`;
    const attempt = attemptByKey.get(raceKey) || null;
    let status = target.status === "final_uncollected"
      ? "final_uncollected"
      : savedKeys.has(raceKey) ? "saved" : attempt?.status || "not_attempted";
    if (status === "evaluated") status = "prediction_failed";
    const recoveryAttempt = Boolean(target.recoveryAttempt);
    const attemptCount = Number(target.attemptCount || 0) +
      (status === "final_uncollected" ? 0 : 1);
    const missingReasons = uniqueStrings([
      ...(target.missingReasons || []),
      ...(attempt?.missingReasons || [])
    ]);
    return {
      raceKey,
      jcd: target.jcd,
      place: target.place,
      raceNo: target.raceNo,
      deadlineAt: target.deadlineAt,
      status,
      error: status === "saved" ? "" : String(attempt?.error || target.error || "").slice(0, 240),
      missingReasons,
      attemptCount,
      firstDetectedAt: target.firstDetectedAt || checkedAt,
      lastAttemptAt: status === "final_uncollected" ? target.lastAttemptAt || "" : checkedAt,
      recoveryState: status === "saved"
        ? recoveryAttempt ? "recovered" : "not_needed"
        : status === "final_uncollected" ? "final_uncollected" : "retrying",
      recoveredAt: status === "saved" && recoveryAttempt ? checkedAt : "",
      finalAt: status === "final_uncollected" ? target.finalAt || checkedAt : ""
    };
  });
  const count = status => monitoredTargets.filter(item => item.status === status).length;

  return {
    schemaVersion: 2,
    checkedAt,
    targetCount: monitoredTargets.length,
    savedCount: count("saved"),
    insufficientDataCount: count("insufficient_data"),
    failedCount: count("fetch_failed") + count("prediction_failed") + count("not_attempted"),
    recoveredCount: monitoredTargets.filter(item => item.recoveryState === "recovered").length,
    retryingCount: monitoredTargets.filter(item => item.recoveryState === "retrying").length,
    finalUncollectedCount: count("final_uncollected"),
    complete: monitoredTargets.length > 0 && count("saved") === monitoredTargets.length,
    targets: monitoredTargets
  };
}

function logCollectionHealth(health) {
  if (!health) return;
  const missing = Math.max(0, health.targetCount - health.savedCount);
  console.log(
    `収集監視：対象${health.targetCount}R／保存${health.savedCount}R／未保存${missing}R` +
    `（データ不足${health.insufficientDataCount}R／取得失敗${health.failedCount}R／` +
    `復旧${health.recoveredCount}R／最終未取得${health.finalUncollectedCount}R）`
  );
}

function saveRun(date, comparison, selectedData, verificationPredictions = [], collectionHealth = null) {
  const outputPath = predictionFilePath(date);
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
    collectionHealth,
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
  ).map(compactStoredVerification);

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
  const liveTargets = await loadTargets(date);
  const existing = loadJson(predictionFilePath(date), { runs: [] });
  const recoveryPlan = buildRecoveryPlan(date, liveTargets, existing);
  const targets = recoveryPlan.targets;

  if (!targets.length && !recoveryPlan.finalizedTargets.length) {
    console.log(`${date}は現在、締切前レースがありません`);
    return;
  }

  console.log(`${date}の締切前${targets.length}場を比較します`);
  const evaluationResult = await evaluateTargets(date, targets);
  const comparison = evaluationResult.comparison;
  const best = comparison[0] || null;

  if (!best) {
    console.log("比較に必要なデータが不足しています");
    const collectionHealth = buildCollectionHealth(
      date,
      targets,
      evaluationResult.attempts,
      [],
      recoveryPlan.finalizedTargets
    );
    logCollectionHealth(collectionHealth);
    if (!dryRun) saveRun(date, comparison, null, [], collectionHealth);
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
  const collectionHealth = buildCollectionHealth(
    date,
    targets,
    evaluationResult.attempts,
    verificationPredictions,
    recoveryPlan.finalizedTargets
  );
  logCollectionHealth(collectionHealth);
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
    saveRun(date, comparison, selectedData, verificationPredictions, collectionHealth);
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
  compactStoredVerification,
  buildCollectionHealth,
  buildRecoveryPlan,
  insufficientReasons,
  buildStoredPrediction,
  buildVerificationPredictions,
  saveRun
};
