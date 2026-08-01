// scripts/collect-predictions.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function loadOptionalV2Dependency(
  loader,
  fallback,
  label
) {
  try {
    return loader();
  } catch (error) {
    console.warn(
      `V2シャドー専用${label}読込失敗：${error?.message || error}`
    );
    return fallback;
  }
}

const scheduleApi = require("../api/schedule");
const raceApi = require("../api/race");
const boatIdentity = require(
  "../js/boat-identity"
);

global.window = global;
require("../js/ai-core");
require("../js/history-insights");
require("../js/motor-maintenance-insights");
const theoryInput = require(
  "../js/theory-input"
);
require("../js/prediction");
require("../js/prediction-simple-evaluation");
const practicalSelectionApi =
  require("../js/practical-selection");
require("../js/note-generator");

const historyStats = require(
  "../data/stats/venue-race-patterns.json"
);
const officialHistoryStats = require(
  "../data/stats/race-patterns.json"
);
const racerVenueStarts = require(
  "../data/stats/racer-venue-starts.json"
);
const racerSkillStats =
  loadOptionalV2Dependency(
    () => require(
      "../data/stats/racer-skill-patterns.json"
    ),
    { racers: {} },
    "選手履歴"
  );
const courseStructureStats =
  loadOptionalV2Dependency(
    () => require(
      "../data/stats/course-structure-patterns.json"
    ),
    {
      overall: null,
      byVenue: {},
      thresholds: null
    },
    "進入履歴"
  );
const historyInsights = require(
  "../js/history-insights"
);
const predictionConditions = require(
  "../js/prediction-conditions"
);
const shadowSelectionV2 =
  loadOptionalV2Dependency(
    () => require(
      "../js/shadow-selection-v2"
    ),
    null,
    "評価器"
  );
const scenarioLikelihoodV5 =
  loadOptionalV2Dependency(
    () => require(
      "../js/scenario-likelihood-v5"
    ),
    null,
    "展開相対成立度"
  );
const scenarioLikelihoodV5Ab =
  loadOptionalV2Dependency(
    () => require(
      "../js/scenario-likelihood-v5-ab"
    ),
    null,
    "展開A/B比較"
  );
const scenarioLikelihoodV5Calibration =
  loadOptionalV2Dependency(
    () => require(
      "../data/stats/scenario-likelihood-v5-calibration.json"
    ),
    { approvalGate: { approvedCandidates: [] } },
    "展開校正レポート"
  );

const MIN_SCORE = 70;
const MAX_RUNS_PER_DAY = 100;
const REPOSITORY_ROOT = path.resolve(__dirname, "..");

function fingerprintFiles(relativePaths) {
  const hash = crypto.createHash("sha256");
  relativePaths.forEach(relativePath => {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(
      fs.readFileSync(
        path.join(REPOSITORY_ROOT, relativePath)
      )
    );
    hash.update("\0");
  });
  return hash.digest("hex").slice(0, 20);
}

function safeFingerprintFiles(
  relativePaths,
  label,
  fingerprinter = fingerprintFiles
) {
  try {
    return fingerprinter(relativePaths);
  } catch (error) {
    console.warn(
      `V2シャドー${label}識別失敗：${error?.message || error}`
    );
    return "unavailable";
  }
}

const SHADOW_LOGIC_FINGERPRINT = safeFingerprintFiles([
  "config/chappy-charter.json",
  "api/_parser.js",
  "js/ai-core.js",
  "js/history-insights-base.js",
  "js/motor-maintenance-insights.js",
  "js/history-insights.js",
  "js/boat-identity.js",
  "js/prediction.js",
  "js/practical-selection.js",
  "js/theory-input.js",
  "js/prediction-conditions.js",
  "js/shadow-selection-v2.js",
  "js/scenario-likelihood-v5.js",
  "js/scenario-likelihood-v5-ab.js"
], "ロジック");
const SHADOW_REFERENCE_GENERATION_ID = safeFingerprintFiles([
  "scripts/build-race-stats.js"
], "参照データ生成世代");
const SHADOW_REFERENCE_DATA_FINGERPRINT = safeFingerprintFiles([
  "data/stats/venue-race-patterns.json",
  "data/stats/race-patterns.json",
  "data/stats/racer-venue-starts.json",
  "data/stats/racer-skill-patterns.json",
  "data/stats/course-structure-patterns.json"
], "参照データ");

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

function attachVenueRaceHistory(raceData, jcd, raceNo) {
  const historyPattern =
    historyInsights.getPattern(
      historyStats,
      jcd,
      raceNo
    );
  const historyTrend =
    historyInsights.buildTrend(
      historyPattern,
      officialHistoryStats.overall || null
    );
  const racers = (
    Array.isArray(raceData?.entries)
      ? raceData.entries
      : []
  ).map((entry) => {
    const registerNo = String(
      entry?.registerNo || ""
    ).trim();
    const stats =
      (
        officialHistoryStats.racers ||
        {}
      )[registerNo] || null;
    const venueStats =
      (
        racerVenueStarts.racers ||
        {}
      )[registerNo] || null;
    if (!stats && !venueStats) {
      return null;
    }
    const localStarts = Number(
      venueStats?.venues?.[
          String(jcd).padStart(2, "0")
        ] ?? 0
    );

    return {
      registerNo,
      racerName:
        stats?.racerName ||
        entry?.racerName ||
        "",
      samples:
        Number(stats?.starts || 0),
      localStarts,
      currentVenueStarts:
        localStarts,
      localReliability:
        localStarts >= 30
          ? "high"
          : localStarts >= 12
            ? "medium"
            : "low"
    };
  }).filter((racer) => racer?.registerNo);

  return {
    raceData: {
      ...raceData,
      historyContext: {
        ready: Boolean(historyPattern),
        source: officialHistoryStats.source || "",
        generatedAt:
          officialHistoryStats.generatedAt || "",
        racers,
        venueRace: historyPattern
          ? {
              ...historyPattern,
              trend: historyTrend
            }
          : null
      }
    },
    historyTrend
  };
}

function attachShadowReferenceHistory(
  raceData,
  jcd
) {
  const code = String(jcd || "").padStart(2, "0");
  const context = raceData?.historyContext || {};
  const starts = new Map(
    (
      Array.isArray(raceData?.startExhibition)
        ? raceData.startExhibition
        : []
    ).map(row => [
      Number(row?.boat),
      row
    ])
  );
  const entries = (
    Array.isArray(raceData?.entries)
      ? raceData.entries
      : []
  );
  const identity =
    boatIdentity.inspectEntries(
      entries,
      { allowBoatNoFallback: false }
    );
  const normalizedEntries = entries.map((entry, index) => {
    const boatNo = Number(
      identity.boatNos[index] || 0
    );
    const start = starts.get(boatNo) || {};
    return {
      ...entry,
      boatNo,
      startExhibition: {
        ...(entry?.startExhibition || {}),
        ...start
      }
    };
  });
  const racers = (
    Array.isArray(context.racers)
      ? context.racers
      : []
  ).map(racer => {
    const registerNo = String(
      racer?.registerNo || ""
    ).trim();
    return {
      ...racer,
      skillHistory:
        racerSkillStats?.racers?.[
          registerNo
        ] || null
    };
  });

  return {
    ...raceData,
    entries: normalizedEntries,
    historyContext: {
      ...context,
      racers,
      courseStructure: {
        overall:
          courseStructureStats?.overall || null,
        venue:
          courseStructureStats?.byVenue?.[
            code
          ] || null,
        thresholds:
          courseStructureStats?.thresholds || null
      },
      shadowReferenceOnly: true
    }
  };
}

function compactEvaluation(evaluation) {
  return {
    ready: Boolean(evaluation?.ready),
    honmei: evaluation?.honmei || null,
    manshu: evaluation?.manshu || null,
    dataStatus: evaluation?.dataStatus || null
  };
}

function compactPracticalSelection(
  selection
) {
  return practicalSelectionApi
    .compactAudit(selection);
}

function compactPrediction(prediction, practicalTickets, raceData) {
  const practicalSelection =
    global.ChappyPracticalSelection &&
    typeof global
      .ChappyPracticalSelection
      .select === "function"
      ? global
          .ChappyPracticalSelection
          .select(prediction)
      : prediction
          ?.practicalSelection ||
        null;

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
    practicalSelection:
      compactPracticalSelection(
        practicalSelection
      ),
    verificationEvidence:
      practicalSelection
        ?.verificationEvidence ||
      prediction
        ?.verificationEvidence ||
      null,
    internalEvaluation: {
      mode:
        String(
          prediction
            ?.simpleEvaluation
            ?.mode ||
          ""
        ),
      label:
        String(
          prediction
            ?.simpleEvaluation
            ?.label ||
          "AI評価"
        ),
      score:
        Number(
          prediction
            ?.simpleEvaluation
            ?.score ??
          prediction
            ?.confidence
            ?.score ??
          prediction
            ?.confidence ??
          0
        ) || 0,
      probability: false
    },
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
    prediction?.practicalSelection
      ?.verificationEvidence &&
    typeof prediction
      .practicalSelection
      .verificationEvidence ===
      "object"
  ) {
    return prediction
      .practicalSelection
      .verificationEvidence;
  }
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
      aiCore.version ||
      global.ChappyAICore?.version ||
      global.ChappyAICoreVersion ||
      ""
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
    practicalSelection:
      compactPracticalSelection(
        prediction
          ?.practicalSelection
      ),
    internalEvaluation:
      prediction
        ?.internalEvaluation ||
      {
        mode:
          String(
            prediction
              ?.simpleEvaluation
              ?.mode ||
            ""
          ),
        label:
          String(
            prediction
              ?.simpleEvaluation
              ?.label ||
            "AI評価"
          ),
        score:
          Number(
            prediction
              ?.simpleEvaluation
              ?.score ??
            prediction
              ?.confidence
              ?.score ??
            prediction
              ?.confidence ??
            0
          ) || 0,
        probability: false
      },
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
  const directory = path.dirname(filePath);
  const temporaryPath =
    `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(directory, { recursive: true });

  try {
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(data, null, 2) + "\n",
      "utf8"
    );
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
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
    "invalid_boat_identity",
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
        const identity =
          boatIdentity.inspectEntries(
            raceData?.entries,
            {
              allowBoatNoFallback: false
            }
          );

        if (!identity.valid) {
          const reason =
            boatIdentity.reasonText(
              identity
            ) ||
            "1〜6号艇を一意に確認できません";
          attempts.push({
            ...target,
            status:
              "invalid_boat_identity",
            error:
              `艇番不整合：${reason}`,
            missingReasons: [
              `艇番不整合：${reason}`
            ]
          });
          continue;
        }
        const history = attachVenueRaceHistory(
          raceData,
          target.jcd,
          target.raceNo
        );
        const preparedRaceData =
          theoryInput.prepare(
            history.raceData,
            global.ChappyAICore
          );
        let shadowPreparedRaceData = null;
        try {
          shadowPreparedRaceData =
            theoryInput.prepare(
              attachShadowReferenceHistory(
                history.raceData,
                target.jcd
              ),
              global.ChappyAICore
            );
        } catch (shadowError) {
          console.warn(
            `V2専用入力生成失敗：${shadowError?.message || shadowError}`
          );
        }
        const evaluation =
          global.ChappyAICore
            .buildRaceTrendEvaluation(
              preparedRaceData
            );

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
        const historyTrend = history.historyTrend;
        const historySupport =
          historyInsights.supportForType(
            historyTrend,
            type
          );

        results.push({
          ...target,
          capturedAt:
            String(raceData?.fetchedAt || "") ||
            new Date().toISOString(),
          rawRaceData: history.raceData,
          raceData: preparedRaceData,
          shadowRaceData:
            shadowPreparedRaceData,
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

function safelyBuildShadowV2(
  options,
  builder = null
) {
  try {
    const activeBuilder =
      builder ||
      shadowSelectionV2?.buildRecord;

    if (
      typeof activeBuilder !== "function"
    ) {
      return null;
    }

    return activeBuilder(options);
  } catch (error) {
    console.warn(
      `V2シャドー生成失敗：${error?.message || error}`
    );
    return null;
  }
}

function safelyAnalyzeScenarioLikelihoodV5(
  prediction,
  analyzer = null
) {
  try {
    const activeAnalyzer =
      analyzer ||
      scenarioLikelihoodV5?.analyze;

    if (typeof activeAnalyzer !== "function") {
      return {
        status: "unavailable",
        usableForPurchase: false,
        scenarios: []
      };
    }

    return activeAnalyzer(
      prediction?.aiCore?.raceScenarios ||
      prediction?.raceFlow ||
      {}
    );
  } catch (error) {
    console.warn(
      "展開AI v5シャドー生成失敗：" +
      (error?.message || error)
    );
    return {
      status: "analysis-failed",
      usableForPurchase: false,
      scenarios: [],
      error: String(error?.message || error)
    };
  }
}

function safelyUpsertShadowSnapshots(
  existing,
  incoming,
  upserter = null
) {
  try {
    const activeUpserter =
      upserter ||
      shadowSelectionV2?.upsertSnapshots;

    if (
      typeof activeUpserter !== "function"
    ) {
      return Array.isArray(existing)
        ? existing
        : [];
    }

    return activeUpserter(
      existing,
      incoming
    );
  } catch (error) {
    console.warn(
      `V2シャドー保存統合失敗：${error?.message || error}`
    );
    return Array.isArray(existing)
      ? existing
      : [];
  }
}

function captureStoredConditions(
  item,
  prediction
) {
  let shadow = {};

  try {
    shadow = predictionConditions.capture(
      item?.rawRaceData ||
        item?.raceData ||
        {},
      {}
    );
  } catch (error) {
    console.warn(
      `V2シャドー取得条件保存失敗：${error?.message || error}`
    );
  }

  return {
    legacy: predictionConditions.capture(
      item?.raceData || {},
      prediction
    ),
    shadow
  };
}

function selectedRaceKeyFor(
  date,
  best
) {
  const selection = best?.selection || null;
  const ready = selection
    ? selection.ready === true
    : best?.selectionReady === true;
  const rawScore = selection
    ? selection.score
    : best?.score;
  const score =
    rawScore === null ||
    rawScore === undefined ||
    rawScore === ""
      ? Number.NaN
      : Number(rawScore);

  if (
    !ready ||
    !Number.isFinite(score) ||
    score < MIN_SCORE
  ) {
    return "";
  }

  return (
    String(best?.raceKey || "") ||
    `${date}-${best.jcd}-${best.raceNo}`
  );
}

function buildActiveV2Selection(
  shadowV2,
  legacySelection,
  selected = false
) {
  const rawScore =
    shadowV2?.evaluation?.totalScore;
  const score =
    rawScore === null ||
    rawScore === undefined ||
    rawScore === ""
      ? null
      : Number(rawScore);
  const ready =
    shadowV2?.calibrationEligible === true &&
    Number.isFinite(score);
  const qualified =
    ready &&
    score >= MIN_SCORE;

  return {
    evaluator: "shadow-selection-v2",
    label: "8項目V2",
    type: "8項目V2",
    scenarioLabel: String(
      shadowV2?.evaluation?.scenario?.label ||
      ""
    ),
    score: ready ? score : null,
    threshold: MIN_SCORE,
    ready,
    qualified,
    selected:
      selected === true &&
      qualified,
    status:
      ready
        ? "ready"
        : String(
            shadowV2?.status ||
            "unavailable"
          ),
    eligibilityReasonCodes:
      Array.isArray(
        shadowV2?.eligibilityReasonCodes
      )
        ? shadowV2.eligibilityReasonCodes
        : [],
    legacy: {
      ...legacySelection
    }
  };
}

function buildStoredPrediction(
  date,
  item,
  selected = false,
  capturedAt =
    item?.capturedAt ||
    new Date().toISOString(),
  dependencies = {}
) {
  const createPrediction =
    dependencies.createPrediction ||
    global.createPrediction;
  const createPracticalSelection =
    dependencies.createPracticalSelection ||
    global.ChappyNoteGenerator
      .createPracticalSelection;
  const prediction = createPrediction(
    item.raceData
  );
  prediction.predictionMode = selected
    ? "server_pre_deadline"
    : "server_pre_deadline_shadow";
  prediction.officialResultUsedForPrediction = false;

  const practicalSelection =
    !dependencies
      .createPracticalSelection &&
    global.ChappyPracticalSelection &&
    typeof global
      .ChappyPracticalSelection
      .select === "function"
      ? global
          .ChappyPracticalSelection
          .select(prediction)
      : null;
  const practicalTickets =
    practicalSelection?.tickets ||
    createPracticalSelection(prediction);
  prediction.practicalSelection =
    practicalSelection;
  const raceKey = `${date}-${item.jcd}-${item.raceNo}`;
  const capturedConditions =
    captureStoredConditions(
      item,
      prediction
    );
  const legacyPreRaceConditions =
    capturedConditions.legacy;
  const shadowPreRaceConditions =
    capturedConditions.shadow;
  const legacySelection = {
    type: item.type,
    score: item.score,
    threshold: MIN_SCORE,
    qualified: item.score >= MIN_SCORE,
    selected: false,
    usedForAutomaticSelection: false,
    evaluation: compactEvaluation(item.evaluation)
  };
  const shadowV2 = safelyBuildShadowV2({
    raceKey,
    date,
    jcd: item.jcd,
    place: item.place,
    raceNo: item.raceNo,
    deadlineAt: item.deadlineAt,
    capturedAt,
    sourceCommit: process.env.GITHUB_SHA || "",
    logicFingerprint: SHADOW_LOGIC_FINGERPRINT,
    referenceDataFingerprint:
      SHADOW_REFERENCE_DATA_FINGERPRINT,
    referenceGenerationId:
      SHADOW_REFERENCE_GENERATION_ID,
    theoryInputVersion: theoryInput.VERSION || "",
    selection: legacySelection,
    preRaceConditions: shadowPreRaceConditions,
    preparedRaceData:
      item.shadowRaceData ||
      item.raceData,
    practicalTickets,
    prediction,
    coreApi:
      dependencies.coreApi ||
      global.ChappyAICore
  }, dependencies.shadowBuilder);
  const scenarioLikelihood =
    safelyAnalyzeScenarioLikelihoodV5(
      prediction,
      dependencies.scenarioLikelihoodAnalyzer
    );
  const scenarioLikelihoodAb =
    typeof scenarioLikelihoodV5Ab?.build === "function"
      ? scenarioLikelihoodV5Ab.build(
          scenarioLikelihood,
          scenarioLikelihoodV5Calibration,
          { jcd: item.jcd }
        )
      : {
          status: "unavailable",
          usableForPrediction: false,
          automaticApplication: false,
          a: null,
          b: null
        };
  const selection =
    buildActiveV2Selection(
      shadowV2,
      legacySelection,
      selected
    );
  prediction.predictionMode =
    selection.selected
      ? "server_pre_deadline"
      : "server_pre_deadline_shadow";

  return {
    raceKey,
    date,
    jcd: item.jcd,
    place: item.place,
    raceNo: item.raceNo,
    deadlineAt: item.deadlineAt,
    selectedAt: capturedAt,
    verificationMode:
      selection.selected
        ? "selected"
        : "shadow",
    scoreBand:
      selection.qualified
        ? "70_plus"
        : "under_70",
    selection,
    shadowV2,
    scenarioLikelihoodV5:
      scenarioLikelihood,
    scenarioLikelihoodV5Ab:
      scenarioLikelihoodAb,
    prediction: compactVerificationPayload(
      prediction,
      practicalTickets,
      legacyPreRaceConditions
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

function detachShadowV2(
  item
) {
  const {
    shadowV2,
    ...record
  } = item || {};

  return {
    ...record,
    shadowV2Reference:
      shadowV2
        ? {
            recordKey:
              String(
                shadowV2
                  .recordKey || ""
              ),
            cohortKey:
              String(
                shadowV2
                  .cohortKey || ""
              ),
            capturedAt:
              String(
                shadowV2
                  .capturedAt || ""
              ),
            evaluatorVersion:
              String(
                shadowV2
                  .evaluatorVersion ||
                ""
              ),
            logicFingerprint:
              String(
                shadowV2
                  ?.versions
                  ?.logicFingerprint ||
                ""
              ),
            theoryInputVersion:
              String(
                shadowV2
                  ?.versions
                  ?.theoryInput ||
                ""
              ),
            totalScore:
              shadowV2
                ?.evaluation
                ?.totalScore ??
              null
          }
        : null
  };
}

function buildActiveV2Comparison(
  date,
  comparison,
  records
) {
  const recordByRaceKey = new Map(
    (Array.isArray(records) ? records : [])
      .map(record => [
        String(record?.raceKey || ""),
        record
      ])
      .filter(([raceKey]) => raceKey)
  );

  return (
    Array.isArray(comparison)
      ? comparison
      : []
  )
    .map(item => {
      const raceKey =
        `${date}-${item.jcd}-${item.raceNo}`;
      const record =
        recordByRaceKey.get(raceKey) ||
        null;
      const selection =
        record?.selection ||
        null;

      return {
        ...item,
        raceKey,
        type: "8項目V2",
        scenarioLabel:
          String(
            selection?.scenarioLabel ||
            ""
          ),
        score:
          selection?.ready === true
            ? selection.score
            : null,
        scoreSource:
          "shadowSelectionV2.evaluation.totalScore",
        selectionReady:
          selection?.ready === true,
        selectionStatus:
          String(
            selection?.status ||
            "unavailable"
          ),
        legacyType:
          String(item?.type || ""),
        legacyScore:
          Number(item?.score || 0)
      };
    })
    .sort((a, b) => {
      if (
        a.selectionReady !==
        b.selectionReady
      ) {
        return a.selectionReady
          ? -1
          : 1;
      }

      if (
        a.selectionReady &&
        b.selectionReady
      ) {
        const scoreDifference =
          Number(b.score) -
          Number(a.score);
        if (scoreDifference) {
          return scoreDifference;
        }
      }

      return String(a.raceKey)
        .localeCompare(
          String(b.raceKey)
        );
    });
}

function applySelectedRaceKey(
  records,
  selectedRaceKey
) {
  return (
    Array.isArray(records)
      ? records
      : []
  ).map(record => {
    const selected =
      Boolean(selectedRaceKey) &&
      record?.raceKey ===
        selectedRaceKey &&
      record?.selection?.qualified ===
        true;

    return {
      ...record,
      verificationMode:
        selected
          ? "selected"
          : "shadow",
      selection: {
        ...(record?.selection || {}),
        selected
      },
      prediction: {
        ...(record?.prediction || {}),
        predictionMode:
          selected
            ? "server_pre_deadline"
            : "server_pre_deadline_shadow"
      }
    };
  });
}

function buildCollectionHealth(
  date,
  targets,
  attempts,
  verificationPredictions,
  finalizedTargets = [],
  checkedAt = new Date().toISOString()
) {
  const verificationRows =
    Array.isArray(
      verificationPredictions
    )
      ? verificationPredictions
          .filter(Boolean)
      : [];
  const savedKeys = new Set(
    verificationRows
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
  const readyRows =
    verificationRows.filter(
      item =>
        item?.selection?.ready ===
          true &&
        String(
          item?.selection?.status ||
          ""
        )
          .trim()
          .toLowerCase() ===
          "ready"
    );
  const reasonSummary =
    new Map();
  verificationRows.forEach(item => {
    const shadow =
      item?.shadowV2 || {};
    const reasons = [
      ...(
        Array.isArray(
          shadow?.missingReasons
        )
          ? shadow.missingReasons
          : []
      ),
      ...(
        Array.isArray(
          shadow?.eligibilityReasons
        )
          ? shadow
              .eligibilityReasons
          : []
      )
    ];
    const reasonCodes =
      uniqueStrings([
        ...(
          Array.isArray(
            shadow
              ?.missingReasonCodes
          )
            ? shadow
                .missingReasonCodes
            : []
        ),
        ...(
          Array.isArray(
            shadow
              ?.eligibilityReasonCodes
          )
            ? shadow
                .eligibilityReasonCodes
            : []
        ),
        ...(
          Array.isArray(
            item
              ?.selection
              ?.eligibilityReasonCodes
          )
            ? item
                .selection
                .eligibilityReasonCodes
            : []
        )
      ]);
    const labelByCode =
      new Map(
        reasons
          .map(reason => [
            String(
              reason?.code || ""
            ),
            String(
              reason?.label || ""
            )
          ])
          .filter(([code]) =>
            code
          )
      );

    reasonCodes.forEach(code => {
      const previous =
        reasonSummary.get(code) || {
          code,
          label:
            labelByCode.get(code) ||
            code,
          count: 0
        };
      previous.count += 1;
      if (
        previous.label ===
          previous.code &&
        labelByCode.get(code)
      ) {
        previous.label =
          labelByCode.get(code);
      }
      reasonSummary.set(
        code,
        previous
      );
    });
  });

  return {
    schemaVersion: 3,
    checkedAt,
    targetCount: monitoredTargets.length,
    savedCount: count("saved"),
    insufficientDataCount: count("insufficient_data"),
    failedCount:
      count("fetch_failed") +
      count("prediction_failed") +
      count("invalid_boat_identity") +
      count("not_attempted"),
    invalidBoatIdentityCount:
      count("invalid_boat_identity"),
    recoveredCount: monitoredTargets.filter(item => item.recoveryState === "recovered").length,
    retryingCount: monitoredTargets.filter(item => item.recoveryState === "retrying").length,
    finalUncollectedCount: count("final_uncollected"),
    complete: monitoredTargets.length > 0 && count("saved") === monitoredTargets.length,
    v2: {
      evaluatedCount:
        verificationRows.length,
      readyCount:
        readyRows.length,
      qualifiedCount:
        readyRows.filter(
          item =>
            item
              ?.selection
              ?.qualified === true
        ).length,
      selectedCount:
        readyRows.filter(
          item =>
            item
              ?.selection
              ?.selected === true
        ).length,
      belowThresholdCount:
        readyRows.filter(
          item =>
            item
              ?.selection
              ?.qualified !== true
        ).length,
      notReadyCount:
        Math.max(
          0,
          verificationRows.length -
          readyRows.length
        ),
      readinessRate:
        verificationRows.length
          ? Math.round(
              readyRows.length /
              verificationRows.length *
              1000
            ) / 10
          : 0,
      missingReasons:
        [
          ...reasonSummary
            .values()
        ].sort(
          (left, right) =>
            right.count -
              left.count ||
            left.code.localeCompare(
              right.code
            )
        )
    },
    targets: monitoredTargets
  };
}

function logCollectionHealth(health) {
  if (!health) return;
  const missing = Math.max(0, health.targetCount - health.savedCount);
  console.log(
    `収集監視：対象${health.targetCount}R／保存${health.savedCount}R／未保存${missing}R` +
    `（データ不足${health.insufficientDataCount}R／失敗計${health.failedCount}R／` +
    `うち艇番不整合${Number(health.invalidBoatIdentityCount || 0)}R／` +
    `復旧${health.recoveredCount}R／最終未取得${health.finalUncollectedCount}R）` +
    `／V2判定可能${Number(health?.v2?.readyCount || 0)}` +
    `/${Number(health?.v2?.evaluatedCount || 0)}R`
  );
}

function saveRun(
  date,
  comparison,
  selectedData,
  verificationPredictions = [],
  shadowV2Predictions = [],
  collectionHealth = null
) {
  const outputPath = predictionFilePath(date);
  const existing = loadJson(outputPath, {
    schemaVersion: 3,
    date,
    runs: [],
    predictions: [],
    verificationPredictions: [],
    shadowV2Predictions: []
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
          scoreSource:
            best.scoreSource ||
            "",
          scenarioLabel:
            best.scenarioLabel ||
            "",
          selectionReady:
            best.selectionReady === true,
          selectionStatus:
            best.selectionStatus ||
            "",
          legacyType:
            best.legacyType ||
            "",
          legacyScore:
            Number(best.legacyScore || 0),
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
      scoreSource:
        item.scoreSource ||
        "",
      scenarioLabel:
        item.scenarioLabel ||
        "",
      selectionReady:
        item.selectionReady === true,
      selectionStatus:
        item.selectionStatus ||
        "",
      legacyType:
        item.legacyType ||
        "",
      legacyScore:
        Number(item.legacyScore || 0),
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

  existing.schemaVersion = 3;
  existing.verificationPredictions = upsertByRaceKey(
    existing.verificationPredictions,
    verificationPredictions
  ).map(compactStoredVerification);
  existing.shadowV2Predictions =
    safelyUpsertShadowSnapshots(
      existing.shadowV2Predictions,
      shadowV2Predictions
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
  const legacyComparison =
    evaluationResult.comparison;

  if (!legacyComparison.length) {
    console.log("比較に必要なデータが不足しています");
    const collectionHealth = buildCollectionHealth(
      date,
      targets,
      evaluationResult.attempts,
      [],
      recoveryPlan.finalizedTargets
    );
    logCollectionHealth(collectionHealth);
    if (!dryRun) {
      saveRun(
        date,
        [],
        null,
        [],
        [],
        collectionHealth
      );
    }
    return;
  }

  const provisionalPredictions =
    buildVerificationPredictions(
      date,
      legacyComparison
    );
  const comparison =
    buildActiveV2Comparison(
      date,
      legacyComparison,
      provisionalPredictions
    );
  const best =
    comparison.find(
      item =>
        item.selectionReady === true
    ) ||
    null;
  const selectedRaceKey =
    selectedRaceKeyFor(
      date,
      best
    );
  const builtVerificationPredictions =
    applySelectedRaceKey(
      provisionalPredictions,
      selectedRaceKey
    );
  const shadowV2Predictions =
    builtVerificationPredictions
      .map(item => item?.shadowV2)
      .filter(Boolean);
  const verificationPredictions =
    builtVerificationPredictions
      .map(detachShadowV2);
  const collectionHealth = buildCollectionHealth(
    date,
    targets,
    evaluationResult.attempts,
    builtVerificationPredictions,
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
    saveRun(
      date,
      comparison,
      selectedData,
      verificationPredictions,
      shadowV2Predictions,
      collectionHealth
    );
  }

  console.log(
    `検証保存：${verificationPredictions.length}R（70点以上${verificationPredictions.filter(item => item.scoreBand === "70_plus").length}R／70点未満${verificationPredictions.filter(item => item.scoreBand === "under_70").length}R）`
  );
  console.log(
    `V2自動選定対象：${shadowV2Predictions.filter(item => item.calibrationEligible).length}/${shadowV2Predictions.length}R` +
    `（完全データ${shadowV2Predictions.filter(item => item.complete).length}R・基準${MIN_SCORE}点）`
  );

  if (!selectedData) {
    if (best) {
      console.log(
        `見送り：V2最高${Math.round(best.score)}点／基準${MIN_SCORE}点`
      );
    } else {
      console.log(
        "見送り：8項目V2の完全データがありません"
      );
    }
    return;
  }

  console.log(
    `自動選定：${best.place || best.jcd} ${best.raceNo}R（${best.scenarioLabel || best.type}・V2 ${Math.round(best.score)}点）`
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
  SHADOW_LOGIC_FINGERPRINT,
  SHADOW_REFERENCE_GENERATION_ID,
  SHADOW_REFERENCE_DATA_FINGERPRINT,
  loadOptionalV2Dependency,
  fingerprintFiles,
  safeFingerprintFiles,
  attachVenueRaceHistory,
  attachShadowReferenceHistory,
  safelyBuildShadowV2,
  safelyAnalyzeScenarioLikelihoodV5,
  safelyUpsertShadowSnapshots,
  captureStoredConditions,
  selectedRaceKeyFor,
  buildActiveV2Selection,
  buildActiveV2Comparison,
  applySelectedRaceKey,
  upsertByRaceKey,
  compactStoredVerification,
  buildCollectionHealth,
  buildRecoveryPlan,
  insufficientReasons,
  buildStoredPrediction,
  buildVerificationPredictions,
  detachShadowV2,
  saveRun
};
