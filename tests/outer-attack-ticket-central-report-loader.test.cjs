"use strict";

const assert = require("node:assert/strict");
const loader = require("../js/outer-attack-ticket-central-report-loader.js");

function variant(status = "collecting-to-100", sampleCount = 0) {
  return {
    status,
    sampleCount,
    nextMilestone: sampleCount < 100 ? 100 : sampleCount < 250 ? 250 : 500,
    remainingToNextMilestone: sampleCount < 100 ? 100 - sampleCount : sampleCount < 250 ? 250 - sampleCount : Math.max(0, 500 - sampleCount),
    metrics: {
      hitCountDelta: 0,
      hitRatePointDelta: 0,
      roiPointDelta: 0,
      profitDeltaYen: 0,
      sameStakeCoveragePercent: sampleCount ? 100 : 0
    }
  };
}

function decision(sampleCount = 7, overrides = {}) {
  return {
    schemaVersion: 1,
    gateId: loader.GATE_ID,
    generatedAt: "2026-08-31T08:00:00.000Z",
    prospectiveStartAt: "2026-08-31T02:00:00.000Z",
    productionChanged: false,
    automaticApplication: false,
    humanApprovalRequired: true,
    thresholdSearchPerformed: false,
    primaryCohort: "prediction-before-result",
    diagnostics: {
      sourceSettlementCount: sampleCount,
      prospectiveForwardCount: sampleCount,
      exclusionCounts: {}
    },
    variants: {
      cover: variant(sampleCount < 100 ? "collecting-to-100" : "collecting-to-250", sampleCount),
      flow: variant(sampleCount < 100 ? "collecting-to-100" : "collecting-to-250", sampleCount),
      hole: variant(sampleCount < 100 ? "collecting-to-100" : "collecting-to-250", sampleCount)
    },
    recommendedVariant: null,
    recommendationStatus: "none",
    ...overrides
  };
}

function report(sampleCount = 7, overrides = {}) {
  return {
    schemaVersion: 1,
    reportId: loader.REPORT_ID,
    monitorVersion: loader.MONITOR_VERSION,
    generatedAt: "2026-08-31T08:00:00.000Z",
    productionChanged: false,
    automaticApplication: false,
    humanApprovalRequired: true,
    thresholdSearchPerformed: false,
    primaryCohort: "central-before-result-and-prediction-before-result",
    pipeline: {
      immutableSnapshotCount: sampleCount,
      settlementCount: sampleCount,
      eligibleSettlementCount: sampleCount
    },
    decision: decision(sampleCount),
    safety: {
      sourcePredictionsMustPassPreDeadlineContract: true,
      firstCentralCaptureImmutable: true,
      resultBeforeCentralCaptureExcluded: true,
      officialResultsOnly: true,
      sameTicketCountAndStakeCheckedBySourceShadow: true,
      productionTicketsChanged: false,
      oddsUsedForTicketGenerationOrDeletion: false,
      automaticApplication: false,
      userApprovalRequiredBeforeAnyProductionAdoption: true
    },
    ...overrides
  };
}

function response(value, options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status || 200,
    json: async () => value
  };
}

function fakeRoot(localDecision, fetchImpl) {
  const listeners = new Map();
  const dispatched = [];
  let localRefreshCount = 0;
  const root = {
    document: { readyState: "complete" },
    CustomEvent: class {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    fetch: fetchImpl,
    ChappyOuterAttackTicketDecisionGate: {
      VERSION: "outer-attack-ticket-decision-gate-v1",
      readDecision() {
        return localDecision;
      },
      refresh() {
        localRefreshCount += 1;
        return localDecision;
      }
    },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    dispatchEvent(event) {
      dispatched.push(event.type);
      for (const callback of listeners.get(event.type) || []) callback(event);
      return true;
    }
  };
  return {
    root,
    listeners,
    dispatched,
    localRefreshCount: () => localRefreshCount
  };
}

assert.equal(loader.VERSION, "outer-attack-ticket-central-report-loader-v1");
assert.equal(loader.REPORT_URL, "data/stats/outer-attack-ticket-central-report-v1.json");
assert.equal(loader.REPORT_ID, "outer-attack-ticket-central-report-v1");
assert.equal(loader.MONITOR_VERSION, "outer-attack-ticket-central-monitor-v1");
assert.equal(loader.GATE_ID, "outer-attack-ticket-decision-gate-v1");
assert.equal(loader.REFRESH_INTERVAL_MS, 60000);

const valid = report(12);
const validBefore = JSON.stringify(valid);
assert.equal(loader.isValidReport(valid), true);
assert.equal(JSON.stringify(valid), validBefore, "中央レポート検証で入力を変更しない");
assert.equal(loader.isValidDecision(valid.decision), true);
assert.equal(loader.isValidReport({ ...valid, reportId: "other" }), false);
assert.equal(loader.isValidReport({ ...valid, automaticApplication: true }), false);
assert.equal(loader.isValidReport({ ...valid, safety: { ...valid.safety, officialResultsOnly: false } }), false);
assert.equal(loader.isValidReport({ ...valid, decision: { ...valid.decision, productionChanged: true } }), false);
assert.equal(loader.isValidReport({ ...valid, decision: { ...valid.decision, variants: { cover: {}, flow: {} } } }), false);

async function main() {
  const localDecision = decision(0, { generatedAt: "local" });
  let resolveFirst;
  let fetchCount = 0;
  const first = fakeRoot(localDecision, (url, options) => {
    fetchCount += 1;
    assert.match(url, /^data\/stats\/outer-attack-ticket-central-report-v1\.json\?v=\d+$/);
    assert.deepEqual(options, { cache: "no-store", credentials: "same-origin" });
    return new Promise(resolve => { resolveFirst = resolve; });
  });

  assert.equal(loader.install(first.root), true);
  assert.equal(loader.install(first.root), false, "中央ローダーを二重装着しない");
  assert.equal(fetchCount, 1, "結果分析で中央レポートを一度取得する");
  assert.equal(first.root.ChappyOuterAttackTicketDecisionGate.refresh(first.root), localDecision, "中央取得前は端末内判定を維持する");
  assert.ok(first.localRefreshCount() >= 1);

  const central = report(12);
  resolveFirst(response(central));
  await loader.refresh(first.root);
  assert.equal(loader.readReport(first.root), central);
  assert.equal(loader.readDecision(first.root), central.decision);
  assert.equal(first.root.ChappyOuterAttackTicketDecisionGate.readDecision(first.root), central.decision);
  assert.equal(first.root.ChappyOuterAttackTicketDecisionGate.refresh(first.root), central.decision, "中央判定を端末内判定より優先する");
  assert.ok(first.dispatched.includes("chappy:outer-attack-central-report-ready"));
  assert.ok(first.dispatched.includes("chappy:stats-requested"));

  await loader.refresh(first.root, { now: Date.now() + 1000 });
  assert.equal(fetchCount, 1, "60秒以内は中央JSONを再取得しない");

  first.root.fetch = async () => {
    fetchCount += 1;
    return response(report(18));
  };
  await loader.refresh(first.root, { force: true, now: Date.now() + 2000 });
  assert.equal(fetchCount, 2);
  assert.equal(loader.readDecision(first.root).diagnostics.prospectiveForwardCount, 18, "強制更新で最新中央件数へ更新する");

  let invalidFetchCount = 0;
  const invalid = fakeRoot(localDecision, async () => {
    invalidFetchCount += 1;
    return response({ ...report(9), automaticApplication: true });
  });
  assert.equal(loader.install(invalid.root), true);
  await loader.refresh(invalid.root);
  assert.equal(invalidFetchCount, 1);
  assert.equal(loader.readReport(invalid.root), null, "安全契約不一致レポートを採用しない");
  assert.equal(invalid.root.ChappyOuterAttackTicketDecisionGate.refresh(invalid.root), localDecision, "不正中央レポート時は端末内判定へ戻す");

  let attempts = 0;
  const retry = fakeRoot(localDecision, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary network failure");
    return response(report(4));
  });
  loader.install(retry.root);
  await loader.refresh(retry.root);
  assert.equal(loader.readDecision(retry.root), null);
  await loader.refresh(retry.root, { force: true });
  assert.equal(attempts, 2, "一時失敗後に再試行できる");
  assert.equal(loader.readDecision(retry.root).diagnostics.prospectiveForwardCount, 4);

  const missingFetch = fakeRoot(localDecision, null);
  delete missingFetch.root.fetch;
  loader.install(missingFetch.root);
  assert.equal(await loader.refresh(missingFetch.root), null);
  assert.equal(missingFetch.root.ChappyOuterAttackTicketDecisionGate.refresh(missingFetch.root), localDecision);

  console.log("outer attack central report loader tests passed");
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
