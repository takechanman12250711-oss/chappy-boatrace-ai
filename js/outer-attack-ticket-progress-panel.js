/* チャッピーボートレースAI: 外攻め買い目A/B進捗表示（読取専用・自動採用なし） */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (root) root.ChappyOuterAttackTicketProgressPanel = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "outer-attack-ticket-progress-panel-v1";
  const GATE_ID = "outer-attack-ticket-decision-gate-v1";
  const AREA_ID = "outerAttackTicketProgressArea";
  const STYLE_ID = "outerAttackTicketProgressStyle";
  const HOOK_MARK = "__chappyOuterAttackTicketProgressPanelV1";
  const VARIANTS = Object.freeze([
    Object.freeze({ key: "cover", label: "押さえB" }),
    Object.freeze({ key: "flow", label: "フォーメーションB" }),
    Object.freeze({ key: "hole", label: "万舟B" })
  ]);
  const STATUS_LABELS = Object.freeze({
    "collecting-to-100": "100Rまで収集中",
    "collecting-to-250": "250Rまで収集中",
    "collecting-to-500": "500Rまで収集中",
    "harm-review": "害の確認が必要",
    "interim-candidate-hold-to-500": "中間通過・500Rまで継続",
    "approval-candidate-human-review": "承認候補・未採用",
    "continue-monitoring-no-approval": "条件未達・監視継続"
  });

  const finite = value => Number.isFinite(Number(value));
  const number = (value, fallback = 0) => finite(value) ? Number(value) : fallback;
  const round = (value, digits = 1) => Math.round(number(value) * 10 ** digits) / 10 ** digits;
  const integer = value => Math.max(0, Math.trunc(number(value)));

  function signed(value, digits, suffix) {
    if (!finite(value)) return "—";
    const rounded = round(value, digits);
    const prefix = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    const absolute = Math.abs(rounded).toFixed(digits);
    return `${prefix}${absolute}${suffix}`;
  }

  function signedYen(value) {
    if (!finite(value)) return "—";
    const rounded = Math.round(Number(value));
    const prefix = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    return `${prefix}${Math.abs(rounded).toLocaleString("ja-JP")}円`;
  }

  function jstLabel(value) {
    const timestamp = Date.parse(String(value || ""));
    if (!Number.isFinite(timestamp)) return "開始時刻不明";
    const date = new Date(timestamp + 9 * 60 * 60 * 1000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");
    return `${year}年${month}月${day}日 ${hour}:${minute} JST`;
  }

  function defaultMilestone(sampleCount) {
    if (sampleCount < 100) return 100;
    if (sampleCount < 250) return 250;
    return 500;
  }

  function statusLabel(status) {
    return STATUS_LABELS[String(status || "")] || "判定情報を確認中";
  }

  function statusTone(status) {
    if (status === "harm-review") return "danger";
    if (status === "approval-candidate-human-review") return "success";
    if (status === "interim-candidate-hold-to-500") return "attention";
    return "neutral";
  }

  function variantView(report, definition) {
    const row = report?.variants?.[definition.key] || {};
    const metrics = row?.metrics || {};
    const sampleCount = integer(row.sampleCount);
    const nextMilestone = Math.max(1, integer(row.nextMilestone) || defaultMilestone(sampleCount));
    const remaining = Math.max(
      0,
      finite(row.remainingToNextMilestone)
        ? Math.trunc(Number(row.remainingToNextMilestone))
        : nextMilestone - sampleCount
    );
    const progressPercent = Math.min(100, round(sampleCount / nextMilestone * 100, 1));
    const status = String(row.status || "collecting-to-100");
    const reachedFinal = sampleCount >= 500;
    let milestoneText = `${nextMilestone}Rまで残り${remaining}R`;
    if (reachedFinal && status === "approval-candidate-human-review") {
      milestoneText = "500R到達・人の確認待ち";
    } else if (reachedFinal) {
      milestoneText = "500R到達・監視継続";
    }

    return {
      key: definition.key,
      label: definition.label,
      status,
      statusLabel: statusLabel(status),
      tone: statusTone(status),
      sampleCount,
      nextMilestone,
      remaining,
      progressPercent,
      milestoneText,
      isRecommended: report?.recommendedVariant === definition.key,
      hitDeltaLabel: sampleCount ? signed(metrics.hitCountDelta, 0, "R") : "—",
      hitRateDeltaLabel: sampleCount ? signed(metrics.hitRatePointDelta, 1, "pt") : "—",
      roiDeltaLabel: sampleCount ? signed(metrics.roiPointDelta, 1, "pt") : "—",
      profitDeltaLabel: sampleCount ? signedYen(metrics.profitDeltaYen) : "—",
      sameStakeLabel: sampleCount
        ? `${round(metrics.sameStakeCoveragePercent, 1).toFixed(1)}%`
        : "—"
    };
  }

  function overallStatus(variants) {
    if (variants.some(row => row.status === "harm-review")) return {
      label: "害の確認が必要",
      tone: "danger"
    };
    if (variants.some(row => row.status === "approval-candidate-human-review")) return {
      label: "承認候補あり・未採用",
      tone: "success"
    };
    if (variants.some(row => row.status === "interim-candidate-hold-to-500")) return {
      label: "中間候補あり・収集継続",
      tone: "attention"
    };
    return { label: "前向きデータ収集中", tone: "neutral" };
  }

  function buildViewModel(report) {
    const available = Boolean(report && report.gateId === GATE_ID);
    const variants = VARIANTS.map(definition => variantView(available ? report : {}, definition));
    const status = overallStatus(variants);
    const recommended = VARIANTS.find(item => item.key === report?.recommendedVariant) || null;
    return {
      available,
      gateId: String(report?.gateId || ""),
      prospectiveStartAt: String(report?.prospectiveStartAt || ""),
      prospectiveStartLabel: jstLabel(report?.prospectiveStartAt),
      prospectiveForwardCount: integer(report?.diagnostics?.prospectiveForwardCount),
      sourceSettlementCount: integer(report?.diagnostics?.sourceSettlementCount),
      primaryCohort: String(report?.primaryCohort || ""),
      automaticApplication: report?.automaticApplication === true,
      recommendedVariant: recommended?.key || null,
      recommendedVariantLabel: recommended?.label || "",
      overallStatusLabel: status.label,
      overallTone: status.tone,
      variants
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderMarkup(view) {
    if (!view?.available) return "";
    const recommendation = view.recommendedVariantLabel
      ? `<span class="outer-attack-progress-recommendation">確認候補：${escapeHtml(view.recommendedVariantLabel)}</span>`
      : "";
    const cards = view.variants.map(row => `
      <article class="outer-attack-progress-card is-${escapeHtml(row.tone)}" data-variant="${escapeHtml(row.key)}">
        <div class="outer-attack-progress-card-head">
          <strong>${escapeHtml(row.label)}</strong>
          <span>${escapeHtml(row.statusLabel)}</span>
        </div>
        <div class="outer-attack-progress-count">
          <b>${row.sampleCount.toLocaleString("ja-JP")}R</b>
          <small>${escapeHtml(row.milestoneText)}</small>
        </div>
        <div class="outer-attack-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${row.nextMilestone}" aria-valuenow="${row.sampleCount}">
          <span style="width:${row.progressPercent}%"></span>
        </div>
        <dl class="outer-attack-progress-metrics">
          <div><dt>的中純増</dt><dd>${escapeHtml(row.hitDeltaLabel)}</dd></div>
          <div><dt>的中率差</dt><dd>${escapeHtml(row.hitRateDeltaLabel)}</dd></div>
          <div><dt>回収率差</dt><dd>${escapeHtml(row.roiDeltaLabel)}</dd></div>
          <div><dt>利益差</dt><dd>${escapeHtml(row.profitDeltaLabel)}</dd></div>
        </dl>
        <p class="outer-attack-progress-stake">同資金一致率 ${escapeHtml(row.sameStakeLabel)}</p>
      </article>
    `).join("");

    return `
      <div class="outer-attack-progress-head">
        <div>
          <p class="outer-attack-progress-eyebrow">OUTER ATTACK A/B</p>
          <h3>外攻め買い目の検証進捗</h3>
        </div>
        <span class="outer-attack-progress-status is-${escapeHtml(view.overallTone)}">${escapeHtml(view.overallStatusLabel)}</span>
      </div>
      <p class="outer-attack-progress-note">${escapeHtml(view.prospectiveStartLabel)}以降の、結果前に保存した予想だけを集計。同点数・同資金で比較し、自動採用はしません。</p>
      <div class="outer-attack-progress-summary">
        <span>前向き確定 <strong>${view.prospectiveForwardCount.toLocaleString("ja-JP")}R</strong></span>
        <span>全確定 <strong>${view.sourceSettlementCount.toLocaleString("ja-JP")}R</strong></span>
        ${recommendation}
      </div>
      <div class="outer-attack-progress-grid">${cards}</div>
      <p class="outer-attack-progress-foot">結果後の振り返り予想・時刻順不明・開始前データは正式判定から除外します。500Rの全条件を通過しても、買い目へは自動反映しません。</p>
    `;
  }

  function ensureStyle(rootObject) {
    const documentObject = rootObject?.document;
    if (!documentObject || documentObject.getElementById(STYLE_ID)) return;
    const style = documentObject.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${AREA_ID}{margin:14px 0 16px;padding:14px;border:1px solid #dfe8f2;border-radius:17px;background:#f8fbff;box-shadow:0 6px 18px rgba(31,62,96,.06)}
      #${AREA_ID}[hidden]{display:none!important}
      .outer-attack-progress-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .outer-attack-progress-head h3{margin:0;color:#17324d;font-size:1rem}
      .outer-attack-progress-eyebrow{margin:0 0 2px;color:#0878f9;font-size:.68rem;font-weight:900;letter-spacing:.11em}
      .outer-attack-progress-status{flex:0 0 auto;border-radius:999px;padding:6px 10px;background:#eaf2fb;color:#456078;font-size:.72rem;font-weight:900}
      .outer-attack-progress-status.is-success{background:#e8f8ee;color:#176a37}
      .outer-attack-progress-status.is-attention{background:#fff4dd;color:#895b00}
      .outer-attack-progress-status.is-danger{background:#ffebee;color:#a9202b}
      .outer-attack-progress-note{margin:8px 0 10px;color:#5b6f82;font-size:.76rem;line-height:1.55}
      .outer-attack-progress-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}
      .outer-attack-progress-summary>span{border:1px solid #dce7f2;border-radius:999px;background:#fff;padding:5px 9px;color:#526a80;font-size:.72rem}
      .outer-attack-progress-summary strong{color:#17324d}
      .outer-attack-progress-recommendation{border-color:#b9ddc6!important;background:#edf9f1!important;color:#176a37!important;font-weight:900}
      .outer-attack-progress-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .outer-attack-progress-card{min-width:0;border:1px solid #dfe8f2;border-radius:14px;background:#fff;padding:11px}
      .outer-attack-progress-card.is-success{border-color:#b9ddc6;background:#fbfffc}
      .outer-attack-progress-card.is-attention{border-color:#efd49d;background:#fffdf7}
      .outer-attack-progress-card.is-danger{border-color:#f1bbc1;background:#fffafb}
      .outer-attack-progress-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .outer-attack-progress-card-head strong{color:#17324d;font-size:.84rem}
      .outer-attack-progress-card-head span{max-width:58%;text-align:right;color:#60778d;font-size:.66rem;font-weight:800;line-height:1.35}
      .outer-attack-progress-count{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:8px}
      .outer-attack-progress-count b{color:#0878f9;font-size:1.05rem}
      .outer-attack-progress-count small{color:#6b7f91;font-size:.64rem;text-align:right}
      .outer-attack-progress-track{height:7px;margin:6px 0 9px;overflow:hidden;border-radius:999px;background:#e8eef5}
      .outer-attack-progress-track span{display:block;height:100%;border-radius:inherit;background:#0878f9;transition:width .2s ease}
      .outer-attack-progress-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:0}
      .outer-attack-progress-metrics div{min-width:0;border-radius:9px;background:#f5f8fb;padding:7px}
      .outer-attack-progress-metrics dt{color:#718497;font-size:.62rem}
      .outer-attack-progress-metrics dd{margin:1px 0 0;color:#213c56;font-size:.78rem;font-weight:900}
      .outer-attack-progress-stake{margin:7px 0 0;color:#718497;font-size:.64rem}
      .outer-attack-progress-foot{margin:10px 0 0;color:#718497;font-size:.68rem;line-height:1.5}
      @media(max-width:760px){.outer-attack-progress-grid{grid-template-columns:1fr}.outer-attack-progress-card-head span{max-width:62%}}
      @media(max-width:390px){#${AREA_ID}{padding:12px}.outer-attack-progress-head{display:block}.outer-attack-progress-status{display:inline-flex;margin-top:7px}.outer-attack-progress-summary{gap:6px}}
    `;
    documentObject.head?.appendChild(style);
  }

  function ensureArea(rootObject) {
    const documentObject = rootObject?.document;
    if (!documentObject) return null;
    const existing = documentObject.getElementById(AREA_ID);
    if (existing) return existing;
    const statsArea = documentObject.getElementById("statsArea");
    const shell = statsArea?.parentElement;
    if (!statsArea || !shell) return null;
    const area = documentObject.createElement("section");
    area.id = AREA_ID;
    area.className = "outer-attack-progress-panel";
    area.hidden = true;
    area.setAttribute?.("aria-live", "polite");
    shell.insertBefore(area, statsArea);
    return area;
  }

  function readReport(rootObject) {
    const gate = rootObject?.ChappyOuterAttackTicketDecisionGate;
    if (!gate) return null;
    try {
      if (typeof gate.refresh === "function") return gate.refresh(rootObject);
      if (typeof gate.readDecision === "function") return gate.readDecision(rootObject);
    } catch (error) {
      console.warn("[outer-attack-ticket-progress-panel] 判定結果を読み込めません", error);
    }
    return null;
  }

  function render(rootObject) {
    ensureStyle(rootObject);
    const area = ensureArea(rootObject);
    if (!area) return null;
    const view = buildViewModel(readReport(rootObject));
    if (!view.available) {
      area.hidden = true;
      area.innerHTML = "";
      return view;
    }
    area.innerHTML = renderMarkup(view);
    area.hidden = false;
    return view;
  }

  function install(rootObject) {
    if (!rootObject || rootObject[HOOK_MARK]) return false;
    Object.defineProperty(rootObject, HOOK_MARK, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    const update = () => {
      try { render(rootObject); }
      catch (error) { console.warn("[outer-attack-ticket-progress-panel] 進捗表示を更新できません", error); }
    };
    rootObject.addEventListener?.("chappy:stats-requested", update);
    rootObject.addEventListener?.("chappy:stats-runtime-ready", update);
    rootObject.addEventListener?.("storage", event => {
      const key = String(event?.key || "");
      if (
        key === "chappy_outer_attack_ticket_settlements_v1" ||
        key === "chappy_outer_attack_ticket_decision_gate_v1"
      ) update();
    });
    if (rootObject.document?.readyState === "loading") {
      rootObject.document.addEventListener?.("DOMContentLoaded", update, { once: true });
    } else update();
    return true;
  }

  return Object.freeze({
    VERSION,
    GATE_ID,
    AREA_ID,
    STYLE_ID,
    VARIANTS,
    STATUS_LABELS,
    signed,
    signedYen,
    jstLabel,
    statusLabel,
    statusTone,
    buildViewModel,
    renderMarkup,
    render,
    install
  });
});
