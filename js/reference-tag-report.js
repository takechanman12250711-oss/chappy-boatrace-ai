// BOAT RACE公式の締切前データから作る日和準拠の参考分析を表示する。
// 相関確認専用で、予想ロジック・印・配点・買い目には接続しない。
(function (root) {
  "use strict";

  if (root.ChappyReferenceTagReport) return;

  const REPORT_URL = "data/analysis/reference-tag-effectiveness.json";
  const REPORT_LOAD_TIMEOUT_MS = 15000;
  const PANEL_ID = "officialReferenceTagReport";
  const state = {
    report: null,
    loading: false,
    loaded: false,
    error: "",
    opened: false,
    promise: null
  };
  let installed = false;
  let statsObserver = null;
  let observedStatsArea = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function rate(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : "-";
  }

  function isOfficialCompatible(report) {
    return Boolean(
      report &&
      report.dataSource === "boatrace-official" &&
      report.compatibilityProfile === "hiyori-compatible" &&
      report.directHiyoriDataUsed === false
    );
  }

  function isResultActive() {
    if (typeof document === "undefined") return false;
    const section = document.getElementById("resultSection");
    return Boolean(section && section.hidden === false);
  }

  function normalizeRows(report) {
    if (!isOfficialCompatible(report) || !Array.isArray(report.tags)) return [];
    return report.tags
      .map(item => ({
        key: String(item?.key || ""),
        label: String(item?.label || item?.key || "参考項目"),
        samples: number(item?.samples),
        winnerRate: item?.winnerRate,
        top3Rate: item?.top3Rate,
        ticketHitRate: item?.ticketHitRate,
        status: String(item?.status || "蓄積中")
      }))
      .filter(item => item.key && item.samples > 0)
      .slice(0, 8);
  }

  function renderRow(item) {
    return `
      <article class="official-reference-item">
        <header>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.status)}</span>
        </header>
        <dl>
          <div><dt>対象</dt><dd>${item.samples}R</dd></div>
          <div><dt>1着率</dt><dd>${escapeHtml(rate(item.winnerRate))}</dd></div>
          <div><dt>3着内率</dt><dd>${escapeHtml(rate(item.top3Rate))}</dd></div>
          <div><dt>厳選的中率</dt><dd>${escapeHtml(rate(item.ticketHitRate))}</dd></div>
        </dl>
      </article>
    `;
  }

  function renderHtml(report, options = {}) {
    const valid = isOfficialCompatible(report);
    const rows = normalizeRows(report);
    const loading = options.loading === true;
    const error = String(options.error || "");
    const matched = valid ? number(report.matchedRaceCount) : 0;
    const settled = valid ? number(report.settledRaceCount) : 0;
    const legacy = valid
      ? number(
          report.sourceBreakdown?.acceptedLegacyUnlabeledRaceCount ??
          report.sourceBreakdown?.legacyUnlabeledRaceCount
        )
      : 0;
    const meta = loading
      ? "読込中"
      : error || !valid
        ? "確認待ち"
        : `${matched}R`;
    const body = loading
      ? '<p class="official-reference-empty" role="status" aria-live="polite">公式データの分析結果を読み込んでいます…</p>'
      : error || !valid
        ? `<div class="official-reference-empty" role="alert" aria-live="assertive">
            <p>公式データの参考分析を確認できませんでした。通信状態を確認して、もう一度お試しください。</p>
            <button type="button" class="official-reference-retry" data-reference-tag-retry>再読み込み</button>
          </div>`
        : rows.length
          ? `
              <div class="official-reference-lead">
                <strong>BOAT RACE公式 ${settled}Rを照合</strong>
                <p>締切前に固定した展示・ST・当地実績・風・波を、日和準拠形式で${matched}R分析しています。</p>
              </div>
              <div class="official-reference-grid">
                ${rows.map(renderRow).join("")}
              </div>
              <p class="result-panel-note">相関確認の参考値です。ボートレース日和の直接取得は使わず、予想・印・買い目へ自動反映しません。${legacy ? `旧保存分${legacy}Rは公式API収集経路を根拠に含みます。` : ""}</p>
            `
          : '<p class="official-reference-empty">公式データを蓄積中です。</p>';

    return `
      <details
        id="${PANEL_ID}"
        class="result-accordion official-reference-report"
        data-result-panel="official-reference-tags"
        aria-busy="${loading ? "true" : "false"}"
        ${options.opened === true ? "open" : ""}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">📎</span>
          <span class="result-accordion-title">
            <span class="result-accordion-name">公式データ参考分析</span>
            <small>展示・ST・当地・風・波の相関</small>
          </span>
          <span class="result-accordion-meta">${escapeHtml(meta)}</span>
        </summary>
        <div class="result-accordion-body official-reference-body" aria-live="polite" aria-busy="${loading ? "true" : "false"}">
          ${body}
        </div>
      </details>
    `;
  }

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("officialReferenceTagReportStyle")) return;
    const style = document.createElement("style");
    style.id = "officialReferenceTagReportStyle";
    style.textContent = `
      .official-reference-body{display:grid;gap:12px}
      .official-reference-lead{padding:12px;border:1px solid #dbeafe;border-radius:13px;background:#f7fbff}
      .official-reference-lead strong{display:block;color:#17324d}.official-reference-lead p{margin:5px 0 0;color:#64748b;line-height:1.55}
      .official-reference-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .official-reference-item{min-width:0;padding:11px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
      .official-reference-item header{display:flex;justify-content:space-between;align-items:center;gap:8px}.official-reference-item header strong{font-size:.88rem;color:#17324d}.official-reference-item header span{flex:0 0 auto;padding:3px 7px;border-radius:999px;background:#ecfdf5;color:#166534;font-size:.68rem;font-weight:800}
      .official-reference-item dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0 0}.official-reference-item dl div{min-width:0;padding:7px;border-radius:9px;background:#f8fafc}.official-reference-item dt{font-size:.68rem;color:#64748b}.official-reference-item dd{margin:2px 0 0;font-size:.84rem;font-weight:900;color:#1e3a5f}
      .official-reference-empty{margin:0;padding:13px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;background:#f8fafc}
      .official-reference-empty p{margin:0}.official-reference-retry{margin-top:10px;padding:7px 11px;border:1px solid #93c5fd;border-radius:9px;background:#eff6ff;color:#1d4ed8;font:inherit;font-size:.78rem;font-weight:800;cursor:pointer}.official-reference-retry:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}
      @media(max-width:640px){.official-reference-grid{grid-template-columns:1fr}.official-reference-item{padding:10px}}
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    const holder = document.createElement("div");
    holder.innerHTML = renderHtml(state.report, {
      loading: state.loading,
      error: state.error,
      opened: state.opened
    }).trim();
    return holder.firstElementChild;
  }

  function bindPanel(panel) {
    panel.addEventListener("toggle", () => {
      state.opened = panel.open === true;
    });
    panel.querySelector("[data-reference-tag-retry]")?.addEventListener("click", () => {
      if (!isResultActive()) return;
      void load();
    });
  }

  function render() {
    if (typeof document === "undefined" || !isResultActive()) return false;
    const dashboard = document.querySelector("#statsArea .results-analysis-dashboard");
    if (!dashboard) return false;

    ensureStyles();
    const current = document.getElementById(PANEL_ID);
    const mounted = current && dashboard.contains(current) ? current : null;
    const restoreFocus = Boolean(mounted && mounted.contains(document.activeElement));
    if (mounted) state.opened = mounted.open === true;

    const panel = createPanel();
    bindPanel(panel);
    if (mounted) {
      mounted.replaceWith(panel);
    } else {
      current?.remove();
      const recent = dashboard.querySelector('[data-result-panel="recent-results"]');
      dashboard.insertBefore(panel, recent || null);
    }

    if (restoreFocus) {
      const summary = panel.querySelector("summary");
      try {
        summary?.focus({ preventScroll: true });
      } catch {
        summary?.focus();
      }
    }
    return true;
  }

  function ensureMounted() {
    if (typeof document === "undefined" || !isResultActive()) return false;
    const dashboard = document.querySelector("#statsArea .results-analysis-dashboard");
    if (!dashboard) return false;
    const panel = document.getElementById(PANEL_ID);
    if (panel && dashboard.contains(panel)) return true;
    return render();
  }

  function observeStatsArea() {
    if (typeof document === "undefined" || typeof root.MutationObserver !== "function") return false;
    const statsArea = document.getElementById("statsArea");
    if (!statsArea) return false;
    if (statsObserver && observedStatsArea === statsArea) return true;

    statsObserver?.disconnect();
    statsObserver = new root.MutationObserver(() => {
      if (isResultActive()) ensureMounted();
    });
    statsObserver.observe(statsArea, { childList: true, subtree: true });
    observedStatsArea = statsArea;
    return true;
  }

  function load() {
    if (!isResultActive()) return Promise.resolve(null);
    if (state.promise) return state.promise;
    state.loading = true;
    state.error = "";
    render();
    const controller = typeof root.AbortController === "function"
      ? new root.AbortController()
      : null;
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = root.setTimeout(() => {
        controller?.abort();
        reject(new Error("公式データ参考分析の読込が15秒を超えました"));
      }, REPORT_LOAD_TIMEOUT_MS);
    });
    const request = fetch(`${REPORT_URL}?v=20260810-official-compatible1`, {
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {})
    }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    state.promise = Promise.race([request, timeout])
      .then(report => {
        if (!isOfficialCompatible(report)) {
          throw new Error("公式データ参考分析の入力契約が一致しません");
        }
        state.report = report;
        state.loaded = true;
        return report;
      })
      .catch(error => {
        state.error = String(error?.message || error);
        state.loaded = false;
        return null;
      })
      .finally(() => {
        root.clearTimeout(timeoutId);
        state.loading = false;
        if (!state.loaded) state.promise = null;
        if (isResultActive()) render();
      });
    return state.promise;
  }

  function install() {
    if (installed) return;
    installed = true;
    ensureStyles();
    observeStatsArea();
    const requestWhenActive = () => {
      if (!isResultActive()) return;
      observeStatsArea();
      if (state.loaded) {
        render();
        return;
      }
      void load();
    };
    root.addEventListener("chappy:stats-runtime-ready", () => {
      requestWhenActive();
    });
    root.addEventListener("chappy:stats-requested", () => {
      requestWhenActive();
    });
    root.addEventListener("chappy:stats-updated", () => {
      if (!isResultActive()) return;
      observeStatsArea();
      if (!state.loaded && !state.loading) {
        void load();
        return;
      }
      ensureMounted();
    });
    root.addEventListener("chappy:view-changed", event => {
      if (event?.detail?.view !== "result" || !isResultActive()) return;
      requestWhenActive();
    });
    requestWhenActive();
  }

  root.ChappyReferenceTagReport = Object.freeze({
    REPORT_LOAD_TIMEOUT_MS,
    REPORT_URL,
    install,
    isOfficialCompatible,
    isResultActive,
    load,
    normalizeRows,
    ensureMounted,
    render,
    renderHtml
  });

  if (typeof document !== "undefined") install();
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = globalThis.ChappyReferenceTagReport;
}
