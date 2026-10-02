"use strict";

const fs = require("node:fs");
const path = require("node:path");
const calibration = require("../js/prediction-calibration");
const boatIdentity = require(
  "../js/boat-identity"
);

function isBoatIdentityQuarantined(record) {
  const inspection =
    boatIdentity.inspectPrediction(record);
  return (
    inspection.checked === true &&
    inspection.valid === false
  );
}

function compactObject(value, fields) {
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    fields.map(field => [
      field,
      value[field]
    ])
  );
}

function compactGeneration(value) {
  return compactObject(
    value,
    [
      "logicFingerprint",
      "confidenceDefinitionVersion",
      "ticketPolicyVersion"
    ]
  );
}

function compactVerificationEvidence(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  return {
    roleSchemaVersion:
      value.roleSchemaVersion,
    generation:
      compactGeneration(
        value.generation
      )
  };
}

function compactScenarioVerification(value) {
  return compactObject(value, ["status"]);
}

function compactResult(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  return {
    settled: value.settled,
    verification:
      value.verification &&
      typeof value.verification === "object"
        ? {
            scenarioVerification:
              compactScenarioVerification(
                value.verification
                  .scenarioVerification
              )
          }
        : value.verification,
    automaticVerification:
      value.automaticVerification &&
      typeof value.automaticVerification === "object"
        ? {
            scenarioVerification:
              compactScenarioVerification(
                value.automaticVerification
                  .scenarioVerification
              )
          }
        : value.automaticVerification,
    scenarioVerification:
      compactScenarioVerification(
        value.scenarioVerification
      )
  };
}

function compactPrediction(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  return {
    predictionMode:
      value.predictionMode,
    isRetrospective:
      value.isRetrospective,
    officialResultUsedForEvaluation:
      value.officialResultUsedForEvaluation,
    officialResultUsedForPrediction:
      value.officialResultUsedForPrediction,
    preRaceConditions:
      compactObject(
        value.preRaceConditions,
        ["officialResultUsed"]
      ),
    timing:
      compactObject(
        value.timing,
        [
          "beforeDeadline",
          "preDeadline"
        ]
      ),
    internalEvaluation:
      compactObject(
        value.internalEvaluation,
        ["score", "mode"]
      ),
    verificationEvidence:
      compactVerificationEvidence(
        value.verificationEvidence
      ),
    practicalSelection:
      value.practicalSelection &&
      typeof value.practicalSelection === "object"
        ? {
            verificationEvidence:
              compactVerificationEvidence(
                value.practicalSelection
                  .verificationEvidence
              )
          }
        : value.practicalSelection
  };
}

function compactCalibrationRecord(record) {
  return {
    raceKey: record?.raceKey,
    date: record?.date,
    jcd: record?.jcd,
    raceNo: record?.raceNo,
    selectedAt: record?.selectedAt,
    capturedAt: record?.capturedAt,
    deadlineAt: record?.deadlineAt,
    verificationMode:
      record?.verificationMode,
    predictionMode:
      record?.predictionMode,
    isRetrospective:
      record?.isRetrospective,
    officialResultUsedForEvaluation:
      record
        ?.officialResultUsedForEvaluation,
    officialResultUsedForPrediction:
      record
        ?.officialResultUsedForPrediction,
    preRaceConditions:
      compactObject(
        record?.preRaceConditions,
        ["officialResultUsed"]
      ),
    timing:
      compactObject(
        record?.timing,
        [
          "beforeDeadline",
          "preDeadline"
        ]
      ),
    selection:
      compactObject(
        record?.selection,
        [
          "ready",
          "selected",
          "status"
        ]
      ),
    internalEvaluation:
      compactObject(
        record?.internalEvaluation,
        ["score", "mode"]
      ),
    verificationEvidence:
      compactVerificationEvidence(
        record?.verificationEvidence
      ),
    practicalSelection:
      record?.practicalSelection &&
      typeof record.practicalSelection ===
        "object"
        ? {
            verificationEvidence:
              compactVerificationEvidence(
                record.practicalSelection
                  .verificationEvidence
              )
          }
        : record?.practicalSelection,
    prediction:
      compactPrediction(
        record?.prediction
      ),
    result:
      compactResult(record?.result),
    officialResult:
      compactResult(
        record?.officialResult
      )
  };
}

const DAILY_FILE_PATTERN = /^\d{8}\.json$/;
const MAX_CALIBRATION_BYTES = 10 * 1024;

function getArgument(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim() : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  const temporaryPath =
    `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(directory, { recursive: true });

  try {
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(value) + "\n",
      "utf8"
    );
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

function calibrationByteSize(value) {
  return Buffer.byteLength(
    JSON.stringify(value) + "\n",
    "utf8"
  );
}

function assertCalibrationSize(value) {
  const byteSize =
    calibrationByteSize(value);
  if (
    byteSize >
    MAX_CALIBRATION_BYTES
  ) {
    throw new Error(
      "校正JSONが配信上限を超えました：" +
      `${byteSize}/${MAX_CALIBRATION_BYTES} bytes`
    );
  }
  return value;
}

function preserveGeneratedAtWhenUnchanged(
  outputPath,
  next
) {
  if (!fs.existsSync(outputPath)) {
    return next;
  }

  let current;
  try {
    current = readJson(outputPath);
  } catch (_) {
    return next;
  }

  const withoutGeneratedAt =
    value => ({
      ...value,
      generatedAt: ""
    });

  return (
    JSON.stringify(
      withoutGeneratedAt(current)
    ) ===
    JSON.stringify(
      withoutGeneratedAt(next)
    )
  )
    ? current
    : next;
}

function assertModeSeparatedCalibration(value) {
  const expectedModes =
    calibration.MODES.map(
      item => item.key
    );
  const generations =
    Array.isArray(
      value?.generations
    )
      ? value.generations
      : [];
  const valid =
    Array.isArray(
      value?.cohortDimensions
    ) &&
    value?.selectionCohort?.key ===
      calibration
        .SELECTION_COHORT
        .key &&
    value.cohortDimensions
      .includes(
        "selectionCohort"
      ) &&
    value.cohortDimensions
      .includes("mode") &&
    generations.length <= 1 &&
    generations.every(generation => {
      const actualModes =
        (
          Array.isArray(
            generation?.modes
          )
            ? generation.modes
            : []
        ).map(item =>
          String(item?.mode || "")
        );
      return expectedModes.every(
        mode =>
          actualModes.includes(mode)
      );
    }) &&
    (
      generations.length === 0 ||
      generations[0]?.key ===
        value?.activeGenerationKey
    );

  if (!valid) {
    throw new Error(
      "校正JSONをgeneration・mode・scoreBandで分離できません"
    );
  }
  return value;
}

function collectPredictionRecords(inputDirectory) {
  if (!fs.existsSync(inputDirectory)) {
    return {
      files: [],
      records: []
    };
  }

  const files = fs.readdirSync(inputDirectory)
    .filter(fileName => DAILY_FILE_PATTERN.test(fileName))
    .sort();
  const records = [];

  files.forEach(fileName => {
    const filePath = path.join(inputDirectory, fileName);
    const data = readJson(filePath);

    [
      ["predictions", data?.predictions],
      ["verificationPredictions", data?.verificationPredictions]
    ].forEach(([collection, source]) => {
      if (!Array.isArray(source)) return;
      source.forEach(record => {
        if (
          isBoatIdentityQuarantined(
            record
          )
        ) {
          return;
        }
        records.push({
          ...compactCalibrationRecord(
            record
          ),
          calibrationSource: {
            fileName,
            collection
          }
        });
      });
    });
  });

  return {
    files,
    records
  };
}

function buildFromDirectory(options = {}) {
  const inputDirectory = path.resolve(
    options.inputDirectory ||
    path.join(process.cwd(), "data", "predictions")
  );
  const outputPath = path.resolve(
    options.outputPath ||
    path.join(inputDirectory, "calibration.json")
  );
  const collected = collectPredictionRecords(inputDirectory);
  const builtResult =
    assertModeSeparatedCalibration(
      calibration.buildCalibration(
        collected.records,
        {
          activeGeneration:
            options.activeGeneration ||
            calibration.DEFAULT_GENERATION,
          generatedAt:
            options.generatedAt ||
            new Date().toISOString(),
          fileCount:
            collected.files.length,
          includeEmptyActive: true
        }
      )
  );
  const result =
    assertCalibrationSize(
      preserveGeneratedAtWhenUnchanged(
        outputPath,
        builtResult
      )
    );

  writeJsonAtomic(outputPath, result);

  return {
    inputDirectory,
    outputPath,
    files: collected.files,
    result
  };
}

function main() {
  const inputDirectory =
    getArgument("input-dir") ||
    path.join(process.cwd(), "data", "predictions");
  const outputPath =
    getArgument("output") ||
    path.join(inputDirectory, "calibration.json");
  const generatedAt =
    getArgument("generated-at") ||
    new Date().toISOString();
  const built = buildFromDirectory({
    inputDirectory,
    outputPath,
    generatedAt
  });
  const source = built.result.source;

  console.log(
    "AI評価校正JSONを更新：" +
    `${source.eligibleRecordCount}/${source.recordCount}件、` +
    `${built.result.generations.length}世代、` +
    `${path.relative(process.cwd(), built.outputPath)}`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  DAILY_FILE_PATTERN,
  MAX_CALIBRATION_BYTES,
  calibrationByteSize,
  assertCalibrationSize,
  assertModeSeparatedCalibration,
  preserveGeneratedAtWhenUnchanged,
  compactCalibrationRecord,
  collectPredictionRecords,
  buildFromDirectory
};
