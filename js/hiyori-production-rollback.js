// js/hiyori-production-rollback.js
// 本番反映前後の状態を世代管理し、署名検証付きで復元する。
// このモジュール単体では予想ロジックを変更しない。
(function () {
  "use strict";

  const SNAPSHOT_KEY = "chappy_hiyori_production_snapshots_v1";
  const HISTORY_KEY = "chappy_hiyori_rollback_history_v1";
  const LIVE_KEY = "chappy_hiyori_production_config_v1";
  const MAX_SNAPSHOTS = 30;
  const MAX_HISTORY = 300;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((acc, key) => {
        acc[key] = stable(value[key]);
        return acc;
      }, {});
    }
    return value;
  }

  function hash(input) {
    const text = JSON.stringify(stable(input));
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fnv1a-${(h >>> 0).toString(16).padStart(8, "0")}`;
  }

  function currentConfig() {
    const config = read(LIVE_KEY, null);
    return config && typeof config === "object" ? config : {
      version: 0,
      enabled: false,
      adjustments: [],
      appliedToPrediction: false,
      productionApplied: false,
      globalProductionLock: true
    };
  }

  function createSnapshot(meta) {
    const config = currentConfig();
    const snapshots = read(SNAPSHOT_KEY, []);
    const generation = (Array.isArray(snapshots) ? snapshots.length : 0) + 1;
    const payload = {
      generation,
      createdAt: new Date().toISOString(),
      reason: String(meta?.reason || "manual"),
      packageId: meta?.packageId || null,
      proposalIds: Array.isArray(meta?.proposalIds) ? meta.proposalIds : [],
      config,
      productionApplied: false,
      appliedToPrediction: false,
      safetyLock: true
    };
    const row = { ...payload, signature: hash(payload) };
    const next = [row, ...(Array.isArray(snapshots) ? snapshots : [])].slice(0, MAX_SNAPSHOTS);
    write(SNAPSHOT_KEY, next);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-snapshot-created", { detail: row }));
    return row;
  }

  function verify(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    const { signature, ...payload } = snapshot;
    return Boolean(signature) && signature === hash(payload);
  }

  function diff(snapshot) {
    const before = snapshot?.config || {};
    const current = currentConfig();
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(current)])).sort();
    return keys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(current[key])).map(key => ({
      key,
      snapshotValue: before[key],
      currentValue: current[key]
    }));
  }

  function healthCheck(config) {
    const checks = [
      { id: "object", ok: Boolean(config && typeof config === "object") },
      { id: "adjustments-array", ok: Array.isArray(config?.adjustments || []) },
      { id: "lock-enabled", ok: config?.globalProductionLock !== false },
      { id: "prediction-disabled", ok: config?.appliedToPrediction !== true },
      { id: "production-disabled", ok: config?.productionApplied !== true }
    ];
    return { ok: checks.every(row => row.ok), checks };
  }

  function restore(snapshotId, reason) {
    const snapshots = read(SNAPSHOT_KEY, []);
    const snapshot = (Array.isArray(snapshots) ? snapshots : []).find(row => row.signature === snapshotId || String(row.generation) === String(snapshotId));
    if (!snapshot) return { ok: false, error: "snapshot-not-found" };
    if (!verify(snapshot)) return { ok: false, error: "signature-mismatch" };

    const backup = createSnapshot({ reason: "pre-rollback-backup", packageId: snapshot.packageId, proposalIds: snapshot.proposalIds });
    const restored = {
      ...snapshot.config,
      enabled: false,
      productionApplied: false,
      appliedToPrediction: false,
      globalProductionLock: true,
      restoredFromGeneration: snapshot.generation,
      restoredAt: new Date().toISOString()
    };
    write(LIVE_KEY, restored);
    const check = healthCheck(restored);
    const history = read(HISTORY_KEY, []);
    const record = {
      id: `rollback-${Date.now()}`,
      createdAt: new Date().toISOString(),
      fromBackupSignature: backup.signature,
      restoredSnapshotSignature: snapshot.signature,
      restoredGeneration: snapshot.generation,
      reason: String(reason || "manual"),
      diffCount: diff(snapshot).length,
      healthCheck: check,
      success: check.ok,
      productionApplied: false,
      appliedToPrediction: false,
      globalProductionLock: true
    };
    write(HISTORY_KEY, [record, ...(Array.isArray(history) ? history : [])].slice(0, MAX_HISTORY));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-rollback-completed", { detail: record }));
    return { ok: check.ok, record, restored };
  }

  function listSnapshots() {
    return read(SNAPSHOT_KEY, []);
  }

  function listHistory() {
    return read(HISTORY_KEY, []);
  }

  window.ChappyHiyoriProductionRollback = {
    createSnapshot,
    verify,
    diff,
    restore,
    healthCheck,
    listSnapshots,
    listHistory,
    currentConfig
  };
})();
