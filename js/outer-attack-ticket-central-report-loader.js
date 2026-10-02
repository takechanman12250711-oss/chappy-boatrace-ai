/* チャッピーボートレースAI: 外攻め買い目A/B中央レポート読込（読取専用・本番変更なし） */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (root) root.ChappyOuterAttackTicketCentralReport = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "outer-attack-ticket-central-report-loader-v1";
  const REPORT_URL = "data/stats/outer-attack-ticket-central-report-v1.json";
  const REPORT_ID = "outer-attack-ticket-central-report-v1";
  const MONITOR_VERSION = "outer-attack-ticket-central-monitor-v1";
  const GATE_ID = "outer-attack-ticket-decision-gate-v1";
  const REFRESH_INTERVAL_MS = 60 * 1000;
  const HOOK_MARK = "__chappyOuterAttackTicketCentralReportLoaderV1";
  const FACADE_MARK = "__chappyCentralReportFacadeV1";
  const states = new WeakMap();

  const nowMs = value => Number.isFinite(Number(value)) ? Number(value) : Date.now();

  function stateFor(rootObject) {
    let state = states.get(rootObject);
    if (!state) {
      state = {
        report: null,
        fetchedAt: 0,
        promise: null,
        error: null,
        originalGate: null,
        facade: null
      };
      states.set(rootObject, state);
    }
    return state;
  }

  function isValidDecision(decision) {
    if (!decision || decision.gateId !== GATE_ID) return false;
    if (decision.productionChanged !== false) return false;
    if (decision.automaticApplication !== false) return false;
    if (decision.humanApprovalRequired !== true) return false;
    if (decision.thresholdSearchPerformed !== false) return false;
    const variants = decision.variants || {};
    return ["cover", "flow", "hole"].every(key => variants[key] && typeof variants[key] === "object");
  }

  function isValidReport(report) {
    if (!report || report.reportId !== REPORT_ID) return false;
    if (report.monitorVersion !== MONITOR_VERSION) return false;
    if (report.productionChanged !== false) return false;
    if (report.automaticApplication !== false) return false;
    if (report.humanApprovalRequired !== true) return false;
    if (report.thresholdSearchPerformed !== false) return false;
    if (!isValidDecision(report.decision)) return false;
    const safety = report.safety || {};
    return safety.officialResultsOnly === true &&
      safety.firstCentralCaptureImmutable === true &&
      safety.resultBeforeCentralCaptureExcluded === true &&
      safety.productionTicketsChanged === false &&
      safety.oddsUsedForTicketGenerationOrDeletion === false &&
      safety.automaticApplication === false &&
      safety.userApprovalRequiredBeforeAnyProductionAdoption === true;
  }

  function readReport(rootObject) {
    return stateFor(rootObject).report;
  }

  function readDecision(rootObject) {
    const report = readReport(rootObject);
    return isValidReport(report) ? report.decision : null;
  }

  function event(rootObject, name, detail) {
    const EventCtor = rootObject?.CustomEvent ||
      (typeof CustomEvent === "function" ? CustomEvent : null);
    if (EventCtor) return new EventCtor(name, { detail });
    return { type: name, detail };
  }

  function notify(rootObject, report) {
    rootObject?.dispatchEvent?.(event(rootObject, "chappy:outer-attack-central-report-ready", {
      version: VERSION,
      reportId: report.reportId,
      generatedAt: report.generatedAt || ""
    }));
    rootObject?.dispatchEvent?.(event(rootObject, "chappy:stats-requested", {
      source: VERSION,
      centralReportReady: true
    }));
  }

  function responseJson(response) {
    if (!response || response.ok === false) {
      throw new Error(`中央A/Bレポートを取得できません: HTTP ${response?.status || "unknown"}`);
    }
    if (typeof response.json !== "function") {
      throw new Error("中央A/BレポートのJSON応答がありません");
    }
    return response.json();
  }

  function refresh(rootObject, options = {}) {
    if (!rootObject || typeof rootObject.fetch !== "function") return Promise.resolve(null);
    const state = stateFor(rootObject);
    const checkedAt = nowMs(options.now);
    const force = options.force === true;
    if (!force && state.report && checkedAt - state.fetchedAt < REFRESH_INTERVAL_MS) {
      return Promise.resolve(state.report);
    }
    if (state.promise) return state.promise;

    const separator = REPORT_URL.includes("?") ? "&" : "?";
    const url = `${REPORT_URL}${separator}v=${checkedAt}`;
    state.promise = Promise.resolve(rootObject.fetch(url, {
      cache: "no-store",
      credentials: "same-origin"
    }))
      .then(responseJson)
      .then(report => {
        if (!isValidReport(report)) {
          throw new Error("中央A/Bレポートの固定安全契約が一致しません");
        }
        state.report = report;
        state.fetchedAt = checkedAt;
        state.error = null;
        notify(rootObject, report);
        return report;
      })
      .catch(error => {
        state.error = error;
        console.warn("[outer-attack-ticket-central-report] 中央レポートを読めないため端末内判定を維持します", error);
        return null;
      })
      .finally(() => {
        state.promise = null;
      });
    return state.promise;
  }

  function attachGateFacade(rootObject) {
    const state = stateFor(rootObject);
    const current = rootObject?.ChappyOuterAttackTicketDecisionGate;
    if (!current) return false;
    if (current[FACADE_MARK] === true) {
      state.facade = current;
      return true;
    }

    const original = current;
    const fallback = target => {
      if (typeof original.refresh === "function") return original.refresh(target);
      if (typeof original.readDecision === "function") return original.readDecision(target);
      return null;
    };
    const facade = Object.freeze({
      ...original,
      [FACADE_MARK]: true,
      centralReportVersion: VERSION,
      readDecision(target = rootObject) {
        return readDecision(target) ||
          (typeof original.readDecision === "function" ? original.readDecision(target) : null);
      },
      refresh(target = rootObject, options = {}) {
        void refresh(target, options);
        return readDecision(target) || fallback(target);
      }
    });
    rootObject.ChappyOuterAttackTicketDecisionGate = facade;
    state.originalGate = original;
    state.facade = facade;
    return true;
  }

  function install(rootObject) {
    if (!rootObject || rootObject[HOOK_MARK]) return false;
    Object.defineProperty(rootObject, HOOK_MARK, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    attachGateFacade(rootObject);
    const update = () => {
      attachGateFacade(rootObject);
      void refresh(rootObject);
    };
    rootObject.addEventListener?.("chappy:stats-requested", update);
    rootObject.addEventListener?.("chappy:stats-runtime-ready", update);
    update();
    return true;
  }

  return Object.freeze({
    VERSION,
    REPORT_URL,
    REPORT_ID,
    MONITOR_VERSION,
    GATE_ID,
    REFRESH_INTERVAL_MS,
    isValidDecision,
    isValidReport,
    readReport,
    readDecision,
    refresh,
    attachGateFacade,
    install
  });
});
