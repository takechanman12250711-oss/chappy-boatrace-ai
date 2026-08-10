#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const referenceTags = require("../js/reference-tags.js");
const inputContract = require("./analysis-input-contract");

const AGGREGATE_LABELS = {
  exhibition: "展示タイム上位艇",
  lap: "一周タイム上位艇",
  start: "ST上位艇",
  local: "当地実績上位艇",
  wind: "強風注意",
  wave: "波高注意",
  "new-engine": "新エンジン期",
  "new-fuel": "新燃料使用期",
  "combined-odds": "合成オッズ取得済み"
};

function readJsonFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    if (!targetPath.endsWith(".json")) return [];
    try {
      return [{ file: targetPath, value: JSON.parse(fs.readFileSync(targetPath, "utf8")) }];
    } catch (error) {
      console.warn(`[skip] ${targetPath}: ${error.message}`);
      return [];
    }
  }
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap(entry =>
    readJsonFiles(path.join(targetPath, entry.name))
  );
}

function flattenRecords(value, file) {
  return inputContract.flattenInputRecords(value, file);
}

function raceKey(record) {
  return inputContract.raceKey(record);
}

function normalizeTicket(value) {
  return inputContract.normalizeTicket(value);
}

function actualTicket(record) {
  return inputContract.actualTicket(record);
}

function sourceKind(record, options = {}) {
  const prediction = record?.prediction || record || {};
  const conditions = prediction?.preRaceConditions || record?.preRaceConditions || {};
  const strictFrozenInputs = options.strictFrozenInputs === true;
  const source = String(
    conditions?.source ||
    conditions?.dataSource ||
    (strictFrozenInputs ? "" : prediction?.source || prediction?.dataSource) ||
    ""
  ).trim();
  const profile = String(
    conditions?.analysisProfile ||
    (strictFrozenInputs ? "" : prediction?.analysisProfile) ||
    ""
  ).trim();
  const schemaVersion = inputContract.parseSchemaVersion(conditions?.schemaVersion);

  if (/ボートレース日和|^hiyori(?:[-_ ]?(?:api|source|data))?$/i.test(source)) {
    return "direct-hiyori";
  }
  if (/ボートレース日和|^hiyori(?:[-_ ]?(?:api|source|data))?$/i.test(profile)) {
    return "direct-hiyori";
  }
  if (!Number.isFinite(schemaVersion)) return "other-source";
  if (/^(?:boatrace[-_ ]?official|BOAT\s*RACE公式)$/i.test(source)) {
    if (schemaVersion < 4) return "official-compatible";
    return profile && !/hiyori[-_ ]?compatible/i.test(profile)
      ? "other-source"
      : "official-labeled";
  }
  if (source) {
    return schemaVersion < 4 && /hiyori[-_ ]?compatible/i.test(source)
      ? "official-compatible"
      : "other-source";
  }
  if (profile) {
    return schemaVersion < 4 && /hiyori[-_ ]?compatible/i.test(profile)
      ? "official-compatible"
      : "other-source";
  }
  if (!source && !profile) {
    return schemaVersion >= 4
      ? "other-source"
      : "legacy-unlabeled";
  }
  return "other-source";
}

function extractTags(record, options = {}) {
  let raw = [];
  if (options.strictFrozenInputs !== true) {
    const sources = [
      record.referenceTags,
      record.tags,
      record.prediction?.referenceTags,
      record.prediction?.tags,
      record.analysis?.referenceTags
    ];
    raw = sources.find(Array.isArray) || [];
  }

  if (!raw.length && referenceTags && typeof referenceTags.build === "function") {
    try {
      raw = referenceTags.build(inputContract.referenceTagInput(record, options));
    } catch (error) {
      console.warn(`[tag-skip] ${record.__file || raceKey(record)}: ${error.message}`);
      raw = [];
    }
  }

  return raw.map(item => {
    if (typeof item === "string") return { key: item, label: item, strength: 1 };
    return {
      key: item.key || item.id || item.label || "unknown",
      label: item.label || item.key || item.id || "unknown",
      strength: Number(item.strength || item.level || 1)
    };
  });
}

function predictedTickets(record) {
  const prediction = record.prediction || record;
  const lists = [
    prediction.practicalTickets,
    prediction.practicalSelection?.tickets,
    prediction.practicalSelection,
    prediction.tickets,
    prediction.ticketRanking,
    prediction.bets,
    prediction.mainTickets,
    prediction.recommendedTickets
  ].filter(Array.isArray);

  return lists.flat().map(item => normalizeTicket(
    typeof item === "string" ? item : item.ticket || item.combination || item.bet
  )).filter(Boolean);
}

function topBoatFromTag(tag) {
  const match = String(tag.label || "").match(/([1-6])号艇/);
  return match ? Number(match[1]) : null;
}

function analyze(records, options = {}) {
  const strictFrozenInputs = options.strictFrozenInputs === true;
  const allowLegacyUnlabeled =
    options.allowLegacyUnlabeled === true ||
    strictFrozenInputs !== true;
  const allSettled = records.filter(record => actualTicket(record));
  const sourceCounts = allSettled.reduce((counts, record) => {
    const kind = sourceKind(record, { strictFrozenInputs });
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});
  const settled = allSettled.filter(record => {
    const kind = sourceKind(record, { strictFrozenInputs });
    return (
      kind !== "direct-hiyori" &&
      kind !== "other-source" &&
      (
        !["legacy-unlabeled", "official-compatible"].includes(kind) ||
        allowLegacyUnlabeled
      )
    );
  });
  const matched = settled
    .map(record => ({
      record,
      tags: extractTags(record, { strictFrozenInputs })
    }))
    .filter(item => item.tags.length);
  const stats = new Map();

  for (const { record, tags } of matched) {
    const actual = actualTicket(record);
    const winner = Number(actual.split("-")[0]);
    const podium = actual.split("-").map(Number);
    const tickets = predictedTickets(record);
    const ticketHit = tickets.includes(actual);

    for (const tag of tags) {
      if (!stats.has(tag.key)) {
        stats.set(tag.key, {
          key: tag.key,
          label: AGGREGATE_LABELS[tag.key] || tag.label,
          samples: 0,
          targetSamples: 0,
          winnerHits: 0,
          top3Hits: 0,
          ticketHits: 0,
          strengthTotal: 0
        });
      }
      const item = stats.get(tag.key);
      const boat = topBoatFromTag(tag);
      item.samples += 1;
      item.strengthTotal += tag.strength;
      if (boat) {
        item.targetSamples += 1;
        if (winner === boat) item.winnerHits += 1;
        if (podium.includes(boat)) item.top3Hits += 1;
      }
      if (ticketHit) item.ticketHits += 1;
    }
  }

  const tags = Array.from(stats.values()).map(item => {
    const targetRates = item.targetSamples
      ? {
          winnerRate: Number((item.winnerHits / item.targetSamples * 100).toFixed(1)),
          top3Rate: Number((item.top3Hits / item.targetSamples * 100).toFixed(1))
        }
      : {};
    const status = item.targetSamples
      ? item.targetSamples < 20
        ? "データ不足"
        : item.top3Hits / item.targetSamples >= 0.55
          ? "参考度高"
          : item.top3Hits / item.targetSamples >= 0.35
            ? "参考"
            : "要検証"
      : item.samples < 20
        ? "データ不足"
        : "参考条件";
    return {
      ...item,
      ...targetRates,
      ticketHitRate: item.samples
        ? Number((item.ticketHits / item.samples * 100).toFixed(1))
        : 0,
      averageStrength: item.samples
        ? Number((item.strengthTotal / item.samples).toFixed(2))
        : 0,
      status
    };
  }).sort((left, right) =>
    right.samples - left.samples ||
    Number(right.top3Rate || 0) - Number(left.top3Rate || 0)
  );

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    matchedRaceCount: matched.length,
    settledRaceCount: settled.length,
    taggedRaceCount: matched.length,
    untaggedRaceCount: settled.length - matched.length,
    tagCount: tags.length,
    sourceStatus: matched.length ? "ready" : "no_tagged_races",
    dataSource: "boatrace-official",
    compatibilityProfile: "hiyori-compatible",
    directHiyoriDataUsed: false,
    legacyUnlabeledPolicy: allowLegacyUnlabeled
      ? "canonical-official-collector-before-source-schema-v4"
      : "rejected-without-schema-v4-official-source",
    sourceBreakdown: {
      officialLabeledRaceCount: sourceCounts["official-labeled"] || 0,
      officialCompatibleRaceCount: sourceCounts["official-compatible"] || 0,
      acceptedOfficialCompatibleRaceCount: allowLegacyUnlabeled
        ? sourceCounts["official-compatible"] || 0
        : 0,
      rejectedOfficialCompatibleRaceCount: allowLegacyUnlabeled
        ? 0
        : sourceCounts["official-compatible"] || 0,
      legacyUnlabeledRaceCount: sourceCounts["legacy-unlabeled"] || 0,
      acceptedLegacyUnlabeledRaceCount: allowLegacyUnlabeled
        ? sourceCounts["legacy-unlabeled"] || 0
        : 0,
      rejectedLegacyUnlabeledRaceCount: allowLegacyUnlabeled
        ? 0
        : sourceCounts["legacy-unlabeled"] || 0,
      rejectedDirectHiyoriRaceCount: sourceCounts["direct-hiyori"] || 0,
      rejectedOtherSourceRaceCount: sourceCounts["other-source"] || 0
    },
    cohort: "predictions-preferred-over-verificationPredictions",
    analysisMode: strictFrozenInputs
      ? "official-compatible-tags-from-frozen-pre-deadline-inputs"
      : "provided-or-reconstructed-records",
    inputDiagnostics: options.inputDiagnostics || null,
    causalClaim: false,
    usableForPrediction: false,
    automaticApplication: false,
    note: strictFrozenInputs
      ? allowLegacyUnlabeled
        ? "BOAT RACE公式から締切前に固定保存した入力だけで日和準拠の参考指標を再構築し、公式結果と照合した相関集計。旧schemaの無ラベル履歴は、このリポジトリの公式API収集正本だけを経路根拠に含む。日和サイトの直接取得は使わず、予想ロジック・印・買い目には自動反映しない。"
        : "明示入力では、締切前スナップショットにschema v4のBOAT RACE公式取得元・取得時刻が保存されたレースだけを日和準拠形式で集計する。旧schemaは採用せず、予想ロジック・印・買い目には自動反映しない。"
      : "入力レコードの参考タグを公式結果と照合した相関集計。因果関係の証明ではなく、予想ロジック・印・買い目には自動反映しない。",
    tags
  };
}

function semanticReportJson(report) {
  return JSON.stringify({
    ...(report || {}),
    generatedAt: ""
  });
}

function settledCohortDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") return null;
  return {
    officialResultCount: Number(diagnostics.officialResultCount || 0),
    settledJoinCount: Number(diagnostics.settledJoinCount || 0),
    deduplication: String(diagnostics.deduplication || ""),
    sourceFiles: String(diagnostics.sourceFiles || "")
  };
}

function writeReport(output, report) {
  let existing = null;
  let existingText = "";
  try {
    existingText = fs.readFileSync(output, "utf8");
    existing = JSON.parse(existingText);
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }

  const stableReport =
    existing &&
    semanticReportJson(existing) === semanticReportJson(report) &&
    String(existing.generatedAt || "").trim()
      ? { ...report, generatedAt: existing.generatedAt }
      : report;
  const nextText = `${JSON.stringify(stableReport, null, 2)}\n`;
  const changed = nextText !== existingText;

  if (changed) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, nextText, "utf8");
  }

  return { report: stableReport, changed };
}

function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  if (outputIndex >= 0 && !args[outputIndex + 1]) {
    throw new Error("--output requires a file path");
  }
  const output = outputIndex >= 0 ? args[outputIndex + 1] : "data/analysis/reference-tag-effectiveness.json";
  const inputArgs = args.filter((arg, index) =>
    outputIndex < 0 || (index !== outputIndex && index !== outputIndex + 1)
  );
  let report;
  if (inputArgs.length) {
    const records = inputArgs.flatMap(input =>
      readJsonFiles(input).flatMap(item => flattenRecords(item.value, item.file))
    );
    const cohort = inputContract.buildCohortFromRecords(records, {
      requireOfficialResultSource: true
    });
    report = analyze(cohort.records, {
      inputDiagnostics: cohort.diagnostics,
      strictFrozenInputs: true,
      allowLegacyUnlabeled: false
    });
  } else {
    const cohort = inputContract.buildDefaultCohort();
    report = analyze(cohort.records, {
      inputDiagnostics: settledCohortDiagnostics(cohort.diagnostics),
      strictFrozenInputs: true,
      allowLegacyUnlabeled: true
    });
  }
  const written = writeReport(output, report);
  console.log(
    `reference-tag analysis: ${written.report.matchedRaceCount} races / ` +
    `${written.report.tagCount} tags -> ${output}` +
    (written.changed ? "" : " (unchanged)")
  );
}

if (require.main === module) main();
module.exports = {
  analyze,
  actualTicket,
  extractTags,
  flattenRecords,
  predictedTickets,
  raceKey,
  semanticReportJson,
  settledCohortDiagnostics,
  sourceKind,
  writeReport
};
