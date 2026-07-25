// js/hiyori-final-approval-ui.js
// 最終プレゼンの確認と最終承認記録。承認と本番適用は完全に分離する。
(function () {
  "use strict";

  const PRESENTATION_KEY = "chappy_hiyori_final_presentations_v1";
  const APPROVAL_KEY = "chappy_hiyori_final_approvals_v1";
  const ROOT_ID = "hiyori-final-approval-root";
  const MAX_ROWS = 300;

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

  function listOf(value) {
    return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
  }

  function fmt(value, suffix) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)}${suffix || ""}` : "-";
  }

  function approvalFor(packageId) {
    return listOf(read(APPROVAL_KEY, [])).find(row => row.packageId === packageId) || null;
  }

  function approve(packageId, note) {
    const presentations = listOf(read(PRESENTATION_KEY, []));
    const presentation = presentations.find(row => row.packageId === packageId);
    if (!presentation) throw new Error("最終プレゼンが見つかりません");

    const verify = window.ChappyHiyoriFinalPresentation?.verify;
    const signatureValid = typeof verify === "function" ? verify(presentation) : presentation.packageSignatureValid !== false;
    if (!signatureValid) throw new Error("署名不一致のため承認できません");
    if (!presentation.finalApprovalEligible || !presentation.checklistPassed) {
      throw new Error("最終チェックリスト未合格のため承認できません");
    }
    if (presentation.productionApplied === true || presentation.appliedToPrediction === true) {
      throw new Error("安全状態が不正です");
    }

    const row = {
      id: `final-approval-${Date.now()}`,
      packageId,
      proposalId: presentation.proposalId,
      presentationSignature: presentation.signature,
      status: "final-approved",
      note: String(note || "").trim(),
      approvedAt: new Date().toISOString(),
      productionApplyAuthorized: false,
      productionApplied: false,
      appliedToPrediction: false,
      applicationLock: true,
      globalProductionLock: true
    };

    const rows = listOf(read(APPROVAL_KEY, []));
    write(APPROVAL_KEY, [row, ...rows.filter(item => item.packageId !== packageId)].slice(0, MAX_ROWS));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-final-approved", { detail: row }));
    render();
    return row;
  }

  function revoke(packageId, reason) {
    const rows = listOf(read(APPROVAL_KEY, []));
    const current = rows.find(row => row.packageId === packageId);
    const next = {
      ...(current || {}),
      id: current?.id || `final-approval-${Date.now()}`,
      packageId,
      status: "revoked",
      revokeReason: String(reason || "").trim(),
      revokedAt: new Date().toISOString(),
      productionApplyAuthorized: false,
      productionApplied: false,
      appliedToPrediction: false,
      applicationLock: true,
      globalProductionLock: true
    };
    write(APPROVAL_KEY, [next, ...rows.filter(row => row.packageId !== packageId)].slice(0, MAX_ROWS));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-final-approval-revoked", { detail: next }));
    render();
    return next;
  }

  function card(row) {
    const approval = approvalFor(row.packageId);
    const approved = approval?.status === "final-approved";
    const eligible = Boolean(row.finalApprovalEligible && row.checklistPassed && row.packageSignatureValid !== false);
    const benefits = (row.benefits || []).map(item => `<li>${esc(item)}</li>`).join("");
    const risks = (row.risks || []).map(item => `<li>${esc(item)}</li>`).join("");
    const stops = (row.stopConditions || []).map(item => `<li>${esc(item)}</li>`).join("");

    return `
      <article class="hiyori-final-card" data-package-id="${esc(row.packageId)}">
        <header>
          <div>
            <p class="hiyori-final-kicker">最終承認プレゼン</p>
            <h3>${esc(row.title)}</h3>
          </div>
          <span class="hiyori-final-status ${approved ? "is-approved" : eligible ? "is-ready" : "is-blocked"}">
            ${approved ? "最終承認済み" : eligible ? "承認可能" : "承認不可"}
          </span>
        </header>
        <div class="hiyori-final-grid">
          <div><strong>対象</strong><span>${esc(row.target)}</span></div>
          <div><strong>条件</strong><span>${esc(row.condition)}</span></div>
          <div><strong>補正方向</strong><span>${esc(row.direction)}</span></div>
          <div><strong>補正上限</strong><span>${fmt(row.maxAdjustment, "点")}</span></div>
          <div><strong>相関信頼度</strong><span>${fmt(row.correlationConfidence, "点")}</span></div>
          <div><strong>相関サンプル</strong><span>${Number(row.correlationSamples || 0)}件</span></div>
          <div><strong>シャドー検証</strong><span>${Number(row.shadowSamples || 0)}件</span></div>
          <div><strong>改善−悪化</strong><span>${fmt(row.netEffectRate, "%")}</span></div>
          <div><strong>平均順位上昇</strong><span>${fmt(row.averageRankGain, "位")}</span></div>
          <div><strong>準備度</strong><span>${fmt(row.readinessScore, "点")}</span></div>
        </div>
        <section><h4>根拠</h4><p>${esc(row.rationale)}</p></section>
        <div class="hiyori-final-columns">
          <section><h4>期待効果</h4><ul>${benefits}</ul></section>
          <section><h4>リスク</h4><ul>${risks}</ul></section>
          <section><h4>中止条件</h4><ul>${stops}</ul></section>
        </div>
        <section class="hiyori-final-locks">
          <strong>安全状態</strong>
          <span>本番適用：未実施</span>
          <span>予想反映：なし</span>
          <span>本番ロック：有効</span>
          <span>復元：利用可能</span>
        </section>
        <footer>
          <input class="hiyori-final-note" type="text" maxlength="200" placeholder="承認理由・注意点（任意）" value="${esc(approval?.note || "")}">
          ${approved
            ? `<button type="button" class="hiyori-final-revoke">承認を取り消す</button>`
            : `<button type="button" class="hiyori-final-approve" ${eligible ? "" : "disabled"}>内容を確認して最終承認</button>`}
        </footer>
        <p class="hiyori-final-warning">最終承認は本番適用ではありません。本番反映は別工程・別操作です。</p>
      </article>`;
  }

  function render() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      root.className = "hiyori-final-approval";
      const host = document.querySelector("main") || document.body;
      host.appendChild(root);
    }

    const rows = listOf(read(PRESENTATION_KEY, []));
    root.innerHTML = `
      <div class="hiyori-final-heading">
        <div><p>日和学習・本番反映前</p><h2>最終プレゼンと承認</h2></div>
        <span>承認と本番適用は分離</span>
      </div>
      ${rows.length ? rows.slice(0, 10).map(card).join("") : `<p class="hiyori-final-empty">承認可能な最終プレゼンはまだありません。</p>`}`;

    root.querySelectorAll(".hiyori-final-approve").forEach(button => {
      button.addEventListener("click", () => {
        const cardNode = button.closest("[data-package-id]");
        const packageId = cardNode?.dataset.packageId;
        const note = cardNode?.querySelector(".hiyori-final-note")?.value || "";
        try {
          approve(packageId, note);
        } catch (error) {
          alert(error.message || "承認できませんでした");
        }
      });
    });

    root.querySelectorAll(".hiyori-final-revoke").forEach(button => {
      button.addEventListener("click", () => {
        const cardNode = button.closest("[data-package-id]");
        const packageId = cardNode?.dataset.packageId;
        const reason = cardNode?.querySelector(".hiyori-final-note")?.value || "承認取消";
        revoke(packageId, reason);
      });
    });
  }

  function install() {
    render();
    window.addEventListener("chappy:hiyori-final-presentation-ready", render);
    window.addEventListener("chappy:hiyori-final-checklist-updated", render);
    setInterval(render, 60000);
  }

  window.ChappyHiyoriFinalApproval = { approve, revoke, render, approvalFor };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();