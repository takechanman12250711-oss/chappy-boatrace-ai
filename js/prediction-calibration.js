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
    ticketPolicyVersion: "practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5-coursefailclosed1"
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
      minimum: GATES.reference,
      nextMinimum: GATES.reference
    };
  }

  function isSameGeneration(left, right) {
    const leftKey = generationKey(left);
    const rightKey = generationKey(right);
    return Boolean(leftKey) && leftKey === rightKey;
  }

  function sampleFor(
    data,
    generation,
    mode,
    score
  ) {
    const normalizedMode = normalizeMode(mode);
    const band = scoreBandFor(score);
    const key = generationKey(generation);
    if (!key || !normalizedMode || !band) return null;

    const generations = Array.isArray(data?.generations)
      ? data.generations
      : [];
    const targetGeneration = generations.find(item =>
      generationKey(item?.generation) === key
    );
    if (!targetGeneration) return null;

    const modes = Array.isArray(targetGeneration?.modes)
      ? targetGeneration.modes
      : [];
    const targetMode = modes.find(item =>
      normalizeMode(item?.mode) === normalizedMode
    );
    if (!targetMode) return null;

    const bands = Array.isArray(targetMode?.bands)
      ? targetMode.bands
      : [];
    return bands.find(item => item?.band === band.key) || null;
  }

  function calibrationFor(
    score,
    options = {}
  ) {
    const generation =
      options.generation ||
      DEFAULT_GENERATION;
    const mode = normalizeMode(options.mode);
    const normalizedScore = normalizeScore(score);
    const band = scoreBandFor(normalizedScore);
    const base = {
      schemaVersion: SCHEMA_VERSION,
      target: TARGET,
      available: false,
      status: "unavailable",
      generation: normalizeGeneration(generation),
      generationKey: generationKey(generation),
      mode,
      modeLabel: modeLabel(mode),
      score: normalizedScore,
      scoreBand: band,
      sampleSize: 0,
      mainScenarioMatchRate: null,
      minimumSample: GATES.reference,
      nextMinimum: GATES.reference,
      source: "historical-verification"
    };

    if (
      normalizedScore === null ||
      !mode ||
      !band
    ) {
      return base;
    }

    const sample = sampleFor(
      options.data || loadedData,
      generation,
      mode,
      normalizedScore
    );
    if (!sample) return base;

    const gate = sampleGate(sample?.count);
    return {
      ...base,
      available: gate.status !== "collecting",
      status: gate.status,
      sampleSize: Math.max(0, Math.floor(Number(sample?.count) || 0)),
      mainScenarioMatchRate:
        gate.status === "collecting"
          ? null
          : Number.isFinite(Number(sample?.mainScenarioMatchRate))
            ? Number(sample.mainScenarioMatchRate)
            : null,
      minimumSample: gate.minimum,
      nextMinimum: gate.nextMinimum
    };
  }

  function state() {
    return { ...loadState };
  }

  function defaultUrl() {
    return DEFAULT_URL;
  }

  async function load(options = {}) {
    const url = String(options.url || DEFAULT_URL);
    if (
      loadedData &&
      loadedUrl === url &&
      options.force !== true
    ) {
      return loadedData;
    }

    if (
      pendingLoad &&
      loadedUrl === url &&
      options.force !== true
    ) {
      return pendingLoad;
    }

    loadedUrl = url;
    setLoadState("loading", {
      url,
      message: "AI評価実績を読み込み中"
    });

    const fetcher =
      options.fetcher ||
      (typeof fetch === "function" ? fetch : null);
    if (!fetcher) {
      setLoadState("unavailable", {
        url,
        error: "fetch-unavailable"
      });
      return null;
    }

    pendingLoad = Promise.resolve()
      .then(() => fetcher(url, { cache: "no-store" }))
      .then(response => {
        if (!response?.ok) {
          throw new Error(
            `AI評価実績の取得に失敗：${response?.status || "unknown"}`
          );
        }
        return response.json();
      })
      .then(data => {
        loadedData = data;
        setLoadState("ready", {
          url,
          message: "AI評価実績を読み込み済み"
        });
        return loadedData;
      })
      .catch(error => {
        loadedData = null;
        setLoadState("unavailable", {
          url,
          error: String(error?.message || error)
        });
        return null;
      })
      .finally(() => {
        pendingLoad = null;
      });

    return pendingLoad;
  }

  function reset() {
    loadedData = null;
    loadedUrl = "";
    pendingLoad = null;
    loadState = {
      status: "idle",
      url: "",
      message: "",
      error: ""
    };
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
    normalizeScore,
    normalizeMode,
    modeLabel,
    scoreBandFor,
    sampleGate,
    isSameGeneration,
    sampleFor,
    calibrationFor,
    state,
    defaultUrl,
    load,
    reset
  };
});
