// js/venue-frame-data-health.js
// 場別枠傾向データの重複・欠損・矛盾・偏り・古さ・保存破損を確認する。
// 予想ロジック・印・配点・買い目には反映しない。
(function () {
  "use strict";

  const VALIDATION_KEY = "chappy_venue_frame_validation_v1";
  const AUDIT_KEY = "chappy_venue_frame_comment_audit_v1";
  const RECHECK_KEY = "chappy_venue_frame_comment_recheck_v1";
  const REPORT_KEY = "chappy_venue_frame_data_health_v1";

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return { value: fallback, broken: false, bytes: 0 };
      return { value: JSON.parse(raw), broken: false, bytes: new Blob([raw]).size };
    } catch (_) {
      return { value: fallback, broken: true, bytes: 0 };
    }
  }

  function arr(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.items)) return value.items;
    return [];
  }

  function normalizeDate(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  function raceKey(row) {
    if (row?.raceKey) return String(row.raceKey);
    const date = normalizeDate(row?.date);
    const jcd = String(row?.jcd || "").padStart(2, "0");
    const raceNo = Number(row?.raceNo || row?.rno || 0);
    return date && /^\d{2}$/.test(jcd) && raceNo >= 1 && raceNo <= 12 ? `${date}-${jcd}-${raceNo}` : "";
  }

  function rankCount(row) {
    const finishers = row?.result?.finishers || row?.finishers || row?.outcome?.finishers || [];
    if (Array.isArray(finishers) && finishers.length) {
      return new Set(finishers.map(item => Number(item?.boat ?? item?.boatNo ?? item?.frameNo)).filter(n => n >= 1 && n <= 6)).size;
    }
    const order = row?.result?.order || row?.order || row?.resultOrder;
    return Array.isArray(order) ? new Set(order.map(Number).filter(n => n >= 1 && n <= 6)).size : 0;
  }

  function ageDays(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function issue(level, code, title, detail, count, excluded) {
    return { level, code, title, detail, count: Number(count || 0), excluded: !!excluded };
  }

  function analyze() {
    const validationRead = safeRead(VALIDATION_KEY, []);
    const auditRead = safeRead(AUDIT_KEY, []);
    const recheckRead = safeRead(RECHECK_KEY, []);
    const validation = arr(validationRead.value);
    const audit = arr(auditRead.value);
    const recheck = arr(recheckRead.value);
    const issues = [];

    [
      [VALIDATION_KEY, validationRead],
      [AUDIT_KEY, auditRead],
      [RECHECK_KEY, recheckRead]
    ].forEach(([key, item]) => {
      if (item.broken) issues.push(issue("repair", "broken-json", "保存データ破損", `${key} をJSONとして読み込めません。`, 1, true));
      if (item.bytes > 3500000) issues.push(issue("warning", "large-storage", "保存容量が大きい", `${key} が約${Math.round(item.bytes / 1024)}KBです。`, 1, false));
    });

    const seen = new Map();
    validation.forEach(row => {
      const key = raceKey(row);
      if (!key) return;
      seen.set(key, (seen.get(key) || 0) + 1);
    });
    const duplicateCount = Array.from(seen.values()).reduce((sum, n) => sum + Math.max(0, n - 1), 0);
    if (duplicateCount) issues.push(issue("exclude", "duplicate-race", "重複レース", `${duplicateCount}件の重複を集計対象外候補にします。`, duplicateCount, true));

    const missingMeta = validation.filter(row => !raceKey(row)).length;
    if (missingMeta) issues.push(issue("repair", "missing-meta", "日付・場コード・レース番号の欠損", `${missingMeta}件はレースを一意に特定できません。`, missingMeta, true));

    const incompleteResults = validation.filter(row => row?.status === "evaluated" && rankCount(row) > 0 && rankCount(row) < 6).length;
    if (incompleteResults) issues.push(issue("repair", "incomplete-result", "結果6艇分が未完了", `${incompleteResults}件は着順が6艇分揃っていません。`, incompleteResults, true));

    const sameFrame = validation.filter(row => {
      const rise = Number(row?.signals?.rising?.frameNo);
      const sink = Number(row?.signals?.sinking?.frameNo);
      return rise >= 1 && rise <= 6 && rise === sink;
    }).length;
    if (sameFrame) issues.push(issue("repair", "same-rise-sink", "浮上枠と沈下枠が同一", `${sameFrame}件で同じ枠が浮上・沈下の両方になっています。`, sameFrame, true));

    const signalCounts = new Map();
    validation.forEach(row => {
      [
        ["rise", Number(row?.signals?.rising?.frameNo)],
        ["sink", Number(row?.signals?.sinking?.frameNo)]
      ].forEach(([type, frameNo]) => {
        if (!(frameNo >= 1 && frameNo <= 6)) return;
        const key = `${row?.jcd || "--"}-${type}-${frameNo}`;
        signalCounts.set(key, (signalCounts.get(key) || 0) + 1);
      });
    });
    const totalSignals = Array.from(signalCounts.values()).reduce((a, b) => a + b, 0);
    const topCount = Math.max(0, ...signalCounts.values());
    if (totalSignals >= 20 && topCount / totalSignals >= 0.35) {
      issues.push(issue("warning", "concentration", "場・枠データの偏り", `最多の場・枠組み合わせが全体の${Math.round(topCount * 100 / totalSignals)}%を占めています。`, topCount, false));
    }

    const stale = validation.filter(row => {
      const days = ageDays(row?.evaluatedAt || row?.updatedAt || row?.capturedAt);
      return days !== null && days > 180;
    }).length;
    if (stale) issues.push(issue("warning", "stale-data", "古い検証データ", `${stale}件が180日より古いデータです。`, stale, false));

    const validationEvaluated = validation.filter(row => row?.status === "evaluated").length;
    const auditEvaluated = audit.filter(row => row?.status === "evaluated").length;
    const recheckSamples = recheck.reduce((sum, row) => sum + Number(row?.samples || row?.auditSamples || 0), 0);
    if (auditEvaluated > validationEvaluated || recheckSamples > auditEvaluated * 12) {
      issues.push(issue("warning", "count-mismatch", "集計件数の不整合", `検証${validationEvaluated}件・コメント照合${auditEvaluated}件・再評価サンプル合計${recheckSamples}件です。`, 1, false));
    }

    if (!issues.length) issues.push(issue("normal", "all-clear", "正常", "現在確認できる重大なデータ異常はありません。", validation.length, false));

    const severity = { repair: 3, exclude: 3, warning: 2, normal: 1 };
    const highest = issues.reduce((max, item) => Math.max(max, severity[item.level] || 0), 0);
    const status = highest >= 3 ? "要修正" : highest === 2 ? "注意" : "正常";
    const report = {
      checkedAt: new Date().toISOString(),
      status,
      totals: {
        validation: validation.length,
        validationEvaluated,
        audit: audit.length,
        auditEvaluated,
        recheck: recheck.length
      },
      excludedCount: issues.filter(item => item.excluded).reduce((sum, item) => sum + item.count, 0),
      issues
    };
    localStorage.setItem(REPORT_KEY, JSON.stringify(report));
    return report;
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameDataHealth");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameOperationsDashboard") || document.getElementById("venueFrameStatusHistory") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameDataHealth";
    holder.className = "venue-frame-data-health";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function render(input) {
    const holder = ensureHolder();
    if (!holder) return;
    const report = input || analyze();
    const labels = { normal: "正常", warning: "注意", repair: "要修正", exclude: "集計対象外" };
    holder.innerHTML = `
      <div class="data-health-head"><div><h3>🩺 場別枠傾向 データ健全性</h3><p>検証から再評価までの保存データを監査します。</p></div><strong class="health-${report.status}">${report.status}</strong></div>
      <div class="data-health-summary">
        <span>検証 ${report.totals.validation}件</span><span>照合 ${report.totals.auditEvaluated}件</span><span>再評価 ${report.totals.recheck}傾向</span><span>対象外候補 ${report.excludedCount}件</span>
      </div>
      <div class="data-health-list">${report.issues.map(item => `
        <div class="health-row level-${item.level}"><b>${labels[item.level] || item.level}｜${esc(item.title)}</b><small>${esc(item.detail)}</small></div>
      `).join("")}</div>
      <p class="data-health-note">要修正・集計対象外のデータは監査対象として表示します。予想ロジック・印・配点・買い目には使用しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-data-health-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-data-health-style";
    style.textContent = `
      .venue-frame-data-health{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.data-health-head{display:flex;justify-content:space-between;gap:12px}.data-health-head h3{margin:0 0 4px;font-size:17px}.data-health-head p,.data-health-note{margin:0;color:#64748b;font-size:12px;line-height:1.6}.data-health-head>strong{height:max-content;padding:6px 10px;border-radius:999px;font-size:12px}.health-正常{background:#ecfdf5}.health-注意{background:#fff7ed}.health-要修正{background:#fef2f2}.data-health-summary{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.data-health-summary span{padding:5px 8px;border-radius:999px;background:#f1f5f9;font-size:12px}.data-health-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.health-row{padding:9px;border:1px solid #e2e8f0;border-radius:11px}.health-row b,.health-row small{display:block}.health-row small{margin-top:4px;color:#64748b;line-height:1.5}.level-normal{background:#f2fbf6}.level-warning{background:#fffaf0}.level-repair,.level-exclude{background:#fff7f7}.data-health-note{margin-top:10px}@media(max-width:640px){.data-health-head{display:block}.data-health-head>strong{display:inline-block;margin-top:8px}.data-health-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function run() {
    const report = analyze();
    render(report);
    return report;
  }

  function install() {
    ensureStyle();
    run();
    window.addEventListener("storage", run);
    document.getElementById("placeSelect")?.addEventListener("change", run);
    setInterval(run, 60000);
  }

  window.ChappyVenueFrameDataHealth = { analyze, render, run };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
