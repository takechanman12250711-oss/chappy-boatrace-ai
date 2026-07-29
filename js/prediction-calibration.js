/* =========================================================
  AI評価の実績校正

  重要：
  - AI評価点そのものは変更しない。
  - 同一ロジック世代・同一評価mode・同一10点帯だけを参照する。
  - 主シナリオ成立率との対応が定義済みのmainだけを校正する。
  - 30件未満では成立率を表示しない。
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyPredictionCalibration = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const TARGET = "structured-main-scenario-v1";
  const DEFAULT_URL = "data/predictions/calibration.json";
  const SELECTION_COHORT = Object.freeze({
    key: "auto-selected-complete-v1",
    label: "自動厳選・完成入力",
    metricLabel:
      "同点数帯における本線展開一致率"
  });
  const DEFAULT_GENERATION = Object.freeze({
    logicFingerprint: "evaluated-scenarios-v1",
    confidenceDefinitionVersion: "internal-score-v1",
    ticketPolicyVersion: "practical-5-7-10-v1"
  });
  const GATES = Object.freeze({
    reference: 30,
    trend: 50,
    ready: 100
  });
  const MODES = Object.freeze([
    Object.freeze({
      key: "main",
      label: "通常評価"
    }),
    Object.freeze({
      key: "chaos",
      label: "波乱評価"
    })
  ]);
  const SCORE_BANDS = Object.freeze(
    Array.from({ length: 10 }, (_, index) => {
      const minScore = index * 10;
      const maxScore = index === 9 ? 100 : minScore + 9;
      return Object.freeze({
        key: `${minScore}-${maxScore}`,
        minScore,
        maxScore,
        label: `${minScore}〜${maxScore}点`
      });
    })
  );

  let loadedData = null;
  let loadedUrl = "";
  let pendingLoad = null;
  let loadState = {
    status: "idle",
    url: "",
    message: "",
    error: ""
  };

  function round1(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function dispatchCalibrationEvent(
    name,
    detail
  ) {
    if (
      typeof window === "undefined" ||
      typeof window.dispatchEvent !==
        "function" ||
      typeof CustomEvent !== "function"
    ) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(
        name,
        {
          detail: clone(detail)
        }
      )
    );
  }

  function setLoadState(
    status,
    details = {}
  ) {
    loadState = {
      status,
      url:
        String(
          details.url ??
          loadState.url ??
          ""
        ),
      message:
        String(
          details.message || ""
        ),
      error:
        String(
          details.error || ""
        )
    };
    dispatchCalibrationEvent(
      "chappy:prediction-calibration-state",
      loadState
    );
    if (status === "unavailable") {
      dispatchCalibrationEvent(
        "chappy:prediction-calibration-unavailable",
        loadState
      );
    }
  }

  function normalizeGeneration(value) {
    const generation =
      value && typeof value === "object"
        ? value
        : {};

    return {
      logicFingerprint: String(
        generation.logicFingerprint || ""
      ).trim(),
      confidenceDefinitionVersion: String(
        generation.confidenceDefinitionVersion || ""
      ).trim(),
      ticketPolicyVersion: String(
        generation.ticketPolicyVersion || ""
      ).trim()
    };
  }

  function generationKey(value) {
    const generation = normalizeGeneration(value);
    if (
      !generation.logicFingerprint ||
      !generation.confidenceDefinitionVersion ||
      !generation.ticketPolicyVersion
    ) {
      return "";
    }

    return JSON.stringify([
      generation.logicFingerprint,
      generation.confidenceDefinitionVersion,
      generation.ticketPolicyVersion
    ]);
  }

  function normalizeScore(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }
    const score = Number(value);
    if (!Number.isFinite(score)) return null;
    return Math.min(100, Math.max(0, score));
  }

  function normalizeMode(value) {
    const mode = String(value || "")
      .trim()
      .toLowerCase();
    return MODES.some(item => item.key === mode)
      ? mode
      : "";
  }

  function modeLabel(value) {
    const mode = normalizeMode(value);
    return (
      MODES.find(item => item.key === mode)
        ?.label ||
      ""
    );
  }

  function scoreBandFor(value) {
    const score = normalizeScore(value);
    if (score === null) return null;
    const index =
      score >= 100
        ? SCORE_BANDS.length - 1
        : Math.floor(score / 10);
    return { ...SCORE_BANDS[index] };
  }

  function sampleGate(value) {
    const sampleSize = Math.max(0, Math.floor(Number(value) || 0));
    if (sampleSize >= GATES.ready) {
      return {
        status: "ready",
        minimum: GATES.ready,
        nextMinimum: null
      };
    }
    if (sampleSize >= GATES.trend) {
      return {
        status: "trend",
        minimum: GATES.trend,
        nextMinimum: GATES.ready
      };
    }
    if (sampleSize >= GATES.reference) {
      return {
        status: "reference",
        minimum: GATES.reference,
        nextMinimum: GATES.trend
      };
    }
    return {
      status: "collecting",
      minimum: 0,
      nextMinimum: GATES.reference
    };
  }

  function wilsonInterval(hitCount, sampleSize, z = 1.96) {
    const count = Math.max(0, Math.floor(Number(sampleSize) || 0));
    const hits = Math.min(
      count,
      Math.max(0, Math.floor(Number(hitCount) || 0))
    );
    const zValue =
      Number.isFinite(Number(z)) && Number(z) > 0
        ? Number(z)
        : 1.96;

    if (!count) return null;

    const probability = hits / count;
    const zSquared = zValue * zValue;
    const denominator = 1 + zSquared / count;
    const center =
      (probability + zSquared / (2 * count)) /
      denominator;
    const margin =
      (
        zValue *
        Math.sqrt(
          (
            probability * (1 - probability) +
            zSquared / (4 * count)
          ) / count
        )
      ) / denominator;

    return {
      low: round1(Math.max(0, center - margin) * 100),
      high: round1(Math.min(1, center + margin) * 100),
      confidenceLevel: 95,
      unit: "percent"
    };
  }

  function verificationEvidenceOf(record) {
    const prediction = record?.prediction || record || {};
    return (
      prediction.verificationEvidence ||
      prediction.practicalSelection?.verificationEvidence ||
      null
    );
  }

  function resultOf(record) {
    return (
      record?.result ||
      record?.officialResult ||
      null
    );
  }

  function scenarioVerificationOf(record) {
    const result = resultOf(record);
    return (
      result?.verification?.scenarioVerification ||
      result?.automaticVerification?.scenarioVerification ||
      result?.scenarioVerification ||
      null
    );
  }

  function evaluationScoreOf(record) {
    const prediction = record?.prediction || record || {};
    return normalizeScore(
      prediction?.internalEvaluation?.score
    );
  }

  function evaluationModeOf(record) {
    const prediction = record?.prediction || record || {};
    return normalizeMode(
      prediction?.internalEvaluation?.mode
    );
  }

  function raceKeyOf(record) {
    const direct = String(record?.raceKey || "").trim();
    if (direct) return direct;

    const date = String(record?.date || "").replace(/\D/g, "");
    const jcd = String(record?.jcd || "").padStart(2, "0");
    const raceNo = Number(record?.raceNo || 0);
    return date && /^\d{2}$/.test(jcd) && raceNo > 0
      ? `${date}-${jcd}-${raceNo}`
      : "";
  }

  function confirmedPreDeadline(record) {
    const timing =
      record?.timing ||
      record?.prediction?.timing ||
      {};
    const selectedAt = [
      record?.selectedAt,
      record?.capturedAt
    ]
      .map(value => Date.parse(value || ""))
      .find(Number.isFinite);
    const deadlineAt = Date.parse(record?.deadlineAt || "");
    if (
      Number.isFinite(selectedAt) &&
      Number.isFinite(deadlineAt)
    ) {
      return selectedAt < deadlineAt;
    }

    return (
      timing.beforeDeadline === true ||
      timing.preDeadline === true
    );
  }

  function isRetrospectiveRecord(record) {
    const prediction = record?.prediction || {};
    const modes = [
      record?.predictionMode,
      prediction?.predictionMode
    ]
      .map(value =>
        String(value || "")
          .trim()
          .toLowerCase()
      );

    return (
      record?.isRetrospective === true ||
      prediction?.isRetrospective === true ||
      modes.includes(
        "retrospective_reference"
      )
    );
  }

  function officialResultWasUsed(record) {
    const prediction = record?.prediction || {};
    const conditions = [
      record?.preRaceConditions,
      prediction?.preRaceConditions
    ];

    return (
      record?.officialResultUsedForEvaluation === true ||
      prediction?.officialResultUsedForEvaluation === true ||
      record?.officialResultUsedForPrediction === true ||
      prediction?.officialResultUsedForPrediction === true ||
      conditions.some(
        value =>
          value?.officialResultUsed === true
      )
    );
  }

  function completedInputReason(record) {
    const verificationMode =
      String(
        record?.verificationMode || ""
      )
        .trim()
        .toLowerCase();
    const predictionMode =
      String(
        record
          ?.prediction
          ?.predictionMode ||
        ""
      )
        .trim()
        .toLowerCase();
    const selection =
      record?.selection || {};

    if (
      verificationMode !==
        "selected" ||
      predictionMode !==
        "server_pre_deadline"
    ) {
      return "nonSelectedPrediction";
    }

    if (
      selection.ready !== true ||
      selection.selected !== true ||
      String(
        selection.status || ""
      )
        .trim()
        .toLowerCase() !==
        "ready"
    ) {
      return "incompleteInput";
    }

    return "";
  }

  function assessRecord(record) {
    const result = resultOf(record);
    if (!result || result.settled !== true) {
      return {
        eligible: false,
        reason: "notSettled"
      };
    }

    const evidence = verificationEvidenceOf(record);
    if (Number(evidence?.roleSchemaVersion || 0) < 1) {
      return {
        eligible: false,
        reason: "legacySchema"
      };
    }

    if (isRetrospectiveRecord(record)) {
      return {
        eligible: false,
        reason: "retrospectiveReference"
      };
    }

    if (officialResultWasUsed(record)) {
      return {
        eligible: false,
        reason: "officialResultLeakage"
      };
    }

    const inputReason =
      completedInputReason(record);
    if (inputReason) {
      return {
        eligible: false,
        reason: inputReason
      };
    }

    if (!confirmedPreDeadline(record)) {
      return {
        eligible: false,
        reason: "preDeadlineUnconfirmed"
      };
    }

    const raceKey = raceKeyOf(record);
    if (!raceKey) {
      return {
        eligible: false,
        reason: "missingRaceKey"
      };
    }

    const generation = normalizeGeneration(evidence?.generation);
    const key = generationKey(generation);
    if (!key) {
      return {
        eligible: false,
        reason: "missingGeneration"
      };
    }

    const score = evaluationScoreOf(record);
    if (score === null) {
      return {
        eligible: false,
        reason: "missingScore"
      };
    }

    const mode = evaluationModeOf(record);
    if (!mode) {
      return {
        eligible: false,
        reason: "missingMode"
      };
    }
    if (mode !== "main") {
      return {
        eligible: false,
        reason: "unsupportedMode"
      };
    }

    const scenarioVerification = scenarioVerificationOf(record);
    const status = String(scenarioVerification?.status || "");
    if (status !== "matched" && status !== "missed") {
      return {
        eligible: false,
        reason: "scenarioNotComparable"
      };
    }

    return {
      eligible: true,
      sample: {
        raceKey,
        generation,
        generationKey: key,
        mode,
        score,
        band: scoreBandFor(score),
        matched: status === "matched"
      }
    };
  }

  function createEmptyExclusions() {
    return {
      notSettled: 0,
      legacySchema: 0,
      retrospectiveReference: 0,
      officialResultLeakage: 0,
      nonSelectedPrediction: 0,
      incompleteInput: 0,
      preDeadlineUnconfirmed: 0,
      missingRaceKey: 0,
      missingGeneration: 0,
      missingScore: 0,
      missingMode: 0,
      unsupportedMode: 0,
      scenarioNotComparable: 0,
      duplicateRace: 0,
      nonActiveGeneration: 0
    };
  }

  function createBandResult(definition, samples) {
    const bandSamples = samples.filter(
      sample => sample.band?.key === definition.key
    );
    const sampleSize = bandSamples.length;
    const hitCount = bandSamples.filter(sample => sample.matched).length;
    const gate = sampleGate(sampleSize);
    const rate =
      gate.status === "collecting"
        ? null
        : round1(hitCount / sampleSize * 100);
    const interval =
      gate.status === "collecting"
        ? null
        : wilsonInterval(hitCount, sampleSize);

    return {
      ...definition,
      sampleSize,
      hitCount,
      status: gate.status,
      rate,
      interval
    };
  }

  function buildCalibration(records, options = {}) {
    const sourceRecords = Array.isArray(records) ? records : [];
    const exclusions = createEmptyExclusions();
    const uniqueSamples = new Map();

    sourceRecords.forEach(record => {
      const assessment = assessRecord(record);
      if (!assessment.eligible) {
        if (Object.hasOwn(exclusions, assessment.reason)) {
          exclusions[assessment.reason] += 1;
        }
        return;
      }

      const sample = assessment.sample;
      const duplicateKey =
        `${sample.generationKey}\u001f${sample.raceKey}`;
      if (uniqueSamples.has(duplicateKey)) {
        exclusions.duplicateRace += 1;
        return;
      }
      uniqueSamples.set(duplicateKey, sample);
    });

    const allSamples = [
      ...uniqueSamples.values()
    ];
    const requestedActiveGeneration =
      normalizeGeneration(
        options.activeGeneration ||
        DEFAULT_GENERATION
      );
    const requestedActiveKey =
      generationKey(requestedActiveGeneration);
    const samples =
      allSamples.filter(
        sample =>
          sample.generationKey ===
          requestedActiveKey
      );
    exclusions.nonActiveGeneration =
      allSamples.length -
      samples.length;
    const byGeneration = new Map();
    samples.forEach(sample => {
      if (!byGeneration.has(sample.generationKey)) {
        byGeneration.set(sample.generationKey, {
          generation: sample.generation,
          samples: []
        });
      }
      byGeneration.get(sample.generationKey).samples.push(sample);
    });

    if (
      options.includeEmptyActive !== false &&
      requestedActiveKey &&
      !byGeneration.has(requestedActiveKey)
    ) {
      byGeneration.set(requestedActiveKey, {
        generation: requestedActiveGeneration,
        samples: []
      });
    }

    const generations = [...byGeneration.entries()]
      .map(([key, cohort]) => {
        const cohortSamples = cohort.samples;
        const modes = MODES.map(definition => {
          const modeSamples =
            cohortSamples.filter(
              sample =>
                sample.mode ===
                definition.key
            );
          return {
            mode: definition.key,
            label: definition.label,
            sampleSize:
              modeSamples.length,
            hitCount:
              modeSamples.filter(
                sample =>
                  sample.matched
              ).length,
            bands:
              SCORE_BANDS.map(
                band =>
                  createBandResult(
                    band,
                    modeSamples
                  )
              )
          };
        });

        return {
          key,
          generation: cohort.generation,
          sampleSize: cohortSamples.length,
          hitCount: cohortSamples.filter(sample => sample.matched).length,
          modes
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key));

    const activeGenerationKey =
      generations.some(item => item.key === requestedActiveKey)
        ? requestedActiveKey
        : generations[0]?.key || "";

    return {
      schemaVersion: SCHEMA_VERSION,
      target: TARGET,
      selectionCohort: {
        ...SELECTION_COHORT
      },
      cohortDimensions: [
        "selectionCohort",
        "generation",
        "mode",
        "scoreBand"
      ],
      generatedAt:
        String(options.generatedAt || new Date().toISOString()),
      activeGenerationKey,
      gates: { ...GATES },
      scoreBands: SCORE_BANDS.map(item => ({ ...item })),
      source: {
        fileCount: Math.max(0, Number(options.fileCount || 0)),
        recordCount: sourceRecords.length,
        eligibleRecordCount: samples.length,
        excluded: exclusions
      },
      generations
    };
  }

  function findCohort(data, generation) {
    const generations = Array.isArray(data?.generations)
      ? data.generations
      : [];
    const requestedKey =
      typeof generation === "string"
        ? generation
        : generationKey(generation);
    const key =
      requestedKey ||
      String(data?.activeGenerationKey || "");
    return {
      key,
      cohort:
        generations.find(item => item?.key === key) ||
        null
    };
  }

  function collectingMessage(
    sampleSize,
    bandLabel,
    generationFound,
    modeLabelText = ""
  ) {
    const modeText =
      modeLabelText
        ? `・${modeLabelText}`
        : "";
    if (!generationFound) {
      return (
        `${SELECTION_COHORT.label}の${SELECTION_COHORT.metricLabel}を収集中です` +
        `（${bandLabel}、0/${GATES.reference}件）。` +
        "任意レースの的中確率ではありません。"
      );
    }
    return (
      `${SELECTION_COHORT.label}の${SELECTION_COHORT.metricLabel}を収集中です` +
      `（同一世代${modeText}・${bandLabel}、` +
      `${sampleSize}/${GATES.reference}件）。` +
      "任意レースの的中確率ではありません。"
    );
  }

  function displayFor(input = {}) {
    const data = input.calibration || loadedData;
    const band = scoreBandFor(input.score);
    const mode = normalizeMode(input.mode);
    const generationProvided =
      Object.hasOwn(input, "generation") ||
      Object.hasOwn(input, "generationKey");
    const requestedGeneration =
      input.generation ||
      input.generationKey ||
      null;
    const requestedGenerationKey =
      typeof requestedGeneration === "string"
        ? requestedGeneration.trim()
        : generationKey(requestedGeneration);
    const retrospective =
      input.isRetrospective === true ||
      String(
        input.predictionMode || ""
      )
        .trim()
        .toLowerCase() ===
        "retrospective_reference";

    if (!band) {
      return {
        status: "unavailable",
        sampleSize: 0,
        rate: null,
        interval: null,
        message: "AI評価点を確認できないため、実績成立率は表示できません。",
        band: null,
        generationKey: "",
        mode
      };
    }

    if (retrospective) {
      return {
        status: "unavailable",
        sampleSize: 0,
        rate: null,
        interval: null,
        message:
          "振り返り予想のため校正対象外です。",
        band,
        generationKey:
          requestedGenerationKey,
        mode,
        cohortKey:
          SELECTION_COHORT.key,
        metricLabel:
          SELECTION_COHORT.metricLabel
      };
    }

    if (mode === "chaos") {
      return {
        status: "unavailable",
        sampleSize: 0,
        rate: null,
        interval: null,
        message:
          "波乱評価の実績成立率は定義整備中です。現在の内部指数を的中確率としては表示しません。",
        band,
        generationKey:
          requestedGenerationKey,
        mode,
        cohortKey:
          SELECTION_COHORT.key,
        metricLabel:
          SELECTION_COHORT.metricLabel
      };
    }

    if (!data) {
      if (
        loadState.status ===
        "unavailable"
      ) {
        return {
          status: "unavailable",
          sampleSize: 0,
          rate: null,
          interval: null,
          message:
            "実績校正データを取得できません。予想はそのまま確認できます。",
          band,
          generationKey:
            requestedGenerationKey,
          mode,
          cohortKey:
            SELECTION_COHORT.key,
          metricLabel:
            SELECTION_COHORT.metricLabel
        };
      }
      if (typeof document !== "undefined") {
        load().catch(() => null);
      }
      return {
        status: "collecting",
        sampleSize: 0,
        rate: null,
        interval: null,
        message: collectingMessage(
          0,
          band.label,
          false,
          modeLabel(mode)
        ),
        band,
        generationKey: requestedGenerationKey,
        mode,
        cohortKey:
          SELECTION_COHORT.key,
        metricLabel:
          SELECTION_COHORT.metricLabel
      };
    }

    const found =
      generationProvided &&
      !requestedGenerationKey
        ? {
            key: "",
            cohort: null
          }
        : findCohort(
            data,
            requestedGenerationKey ||
            requestedGeneration
          );
    const modeCohort =
      mode
        ? found.cohort?.modes?.find(
            item =>
              item?.mode === mode
          ) || null
        : null;
    const row = modeCohort?.bands?.find(
      item => item?.key === band.key
    );
    const sampleSize = Math.max(0, Number(row?.sampleSize || 0));
    const hitCount = Math.min(
      sampleSize,
      Math.max(0, Number(row?.hitCount || 0))
    );
    const gate = sampleGate(sampleSize);

    if (gate.status === "collecting") {
      return {
        status: gate.status,
        sampleSize,
        rate: null,
        interval: null,
        message: collectingMessage(
          sampleSize,
          band.label,
          Boolean(
            found.cohort &&
            modeCohort
          ),
          modeLabel(mode)
        ),
        band,
        generationKey: found.key,
        mode,
        cohortKey:
          SELECTION_COHORT.key,
        metricLabel:
          SELECTION_COHORT.metricLabel
      };
    }

    const rate =
      Number.isFinite(Number(row?.rate))
        ? Number(row.rate)
        : round1(hitCount / sampleSize * 100);
    const interval =
      row?.interval ||
      wilsonInterval(hitCount, sampleSize);
    const label = {
      reference: "参考成立率",
      trend: "傾向成立率",
      ready: "成立率"
    }[gate.status];
    const intervalText =
      interval
        ? `、95%区間 ${interval.low}〜${interval.high}%`
        : "";

    return {
      status: gate.status,
      sampleSize,
      rate,
      interval,
      message:
        `${SELECTION_COHORT.label}の${SELECTION_COHORT.metricLabel}` +
        `（${label}） ${rate}%` +
        `（同一世代・${modeLabel(mode)}・${band.label}、` +
        `n=${sampleSize}${intervalText}）。` +
        "任意レースの的中確率ではありません。",
      band,
      generationKey: found.key,
      mode,
      cohortKey:
        SELECTION_COHORT.key,
      metricLabel:
        SELECTION_COHORT.metricLabel
    };
  }

  function validateCalibration(data) {
    return Boolean(
      data &&
      Number(data.schemaVersion) === SCHEMA_VERSION &&
      data.target === TARGET &&
      data?.selectionCohort?.key ===
        SELECTION_COHORT.key &&
      Array.isArray(data.generations) &&
      Array.isArray(data.cohortDimensions) &&
      data.cohortDimensions.includes(
        "selectionCohort"
      ) &&
      data.cohortDimensions.includes("mode") &&
      data.generations.every(
        generation =>
          Array.isArray(generation?.modes)
      )
    );
  }

  function setData(data) {
    if (!validateCalibration(data)) {
      throw new Error("校正JSONの形式が正しくありません");
    }
    loadedData = clone(data);
    setLoadState(
      "ready",
      {
        url: loadedUrl,
        message:
          "実績校正データを取得しました"
      }
    );
    return getData();
  }

  function getData() {
    return loadedData ? clone(loadedData) : null;
  }

  function getState() {
    return clone(loadState);
  }

  async function load(url = DEFAULT_URL, options = {}) {
    if (url && typeof url === "object") {
      options = url;
      url = options.url || DEFAULT_URL;
    }
    const targetUrl = String(url || DEFAULT_URL);
    const force = options.force === true;

    if (!force && loadedData && loadedUrl === targetUrl) {
      return getData();
    }
    if (!force && pendingLoad && loadedUrl === targetUrl) {
      return pendingLoad;
    }

    const fetchImpl =
      options.fetchImpl ||
      (
        typeof fetch === "function"
          ? fetch.bind(globalThis)
          : null
      );
    if (!fetchImpl) {
      const error =
        new Error(
          "校正JSONを取得するfetchがありません"
        );
      loadedData = null;
      setLoadState(
        "unavailable",
        {
          url: targetUrl,
          message:
            "実績校正データを取得できません",
          error: error.message
        }
      );
      return Promise.reject(error);
    }

    loadedUrl = targetUrl;
    setLoadState(
      "loading",
      {
        url: targetUrl,
        message:
          "実績校正データを取得中です"
      }
    );
    pendingLoad = Promise.resolve()
      .then(() => fetchImpl(targetUrl, { cache: "no-cache" }))
      .then(response => {
        if (!response || response.ok === false) {
          throw new Error(
            `校正JSONを取得できませんでした（${response?.status || "network"}）`
          );
        }
        return typeof response.json === "function"
          ? response.json()
          : response;
      })
      .then(data => {
        setData(data);
        dispatchCalibrationEvent(
          "chappy:prediction-calibration-loaded",
          getData()
        );
        return getData();
      })
      .catch(error => {
        loadedData = null;
        setLoadState(
          "unavailable",
          {
            url: targetUrl,
            message:
              "実績校正データを取得できません",
            error:
              error?.message ||
              String(error || "")
          }
        );
        throw error;
      })
      .finally(() => {
        pendingLoad = null;
      });

    return pendingLoad;
  }

  function autoLoad() {
    load().catch(() => null);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoLoad, { once: true });
    } else {
      Promise.resolve().then(autoLoad);
    }
  }

  return {
    SCHEMA_VERSION,
    TARGET,
    DEFAULT_URL,
    SELECTION_COHORT,
    DEFAULT_GENERATION,
    GATES,
    MODES,
    SCORE_BANDS,
    normalizeGeneration,
    generationKey,
    normalizeMode,
    modeLabel,
    isRetrospectiveRecord,
    officialResultWasUsed,
    completedInputReason,
    scoreBandFor,
    sampleGate,
    wilsonInterval,
    assessRecord,
    buildCalibration,
    displayFor,
    load,
    setData,
    getData,
    getState
  };
});
