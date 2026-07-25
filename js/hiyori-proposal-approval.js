// js/hiyori-proposal-approval.js
// 学習データ変更提案の承認・保留・却下を記録する。
// 承認されても予想ロジックへは自動適用しない（二重ロック）。
(function () {
  "use strict";

  const PROPOSAL_KEY = "chappy_hiyori_change_proposals_v1";
  const APPROVAL_KEY = "chappy_hiyori_proposal_approvals_v1";
  const HISTORY_KEY = "chappy_hiyori_proposal_approval_history_v1";
  const MAX_HISTORY = 500;
  const EXPIRE_DAYS = 30;

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

  function proposalId(proposal) {
    return String(proposal?.id || `${proposal?.group || "unknown"}:${proposal?.label || "unknown"}`);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isExpired(record) {
    if (!record?.decidedAt) return false;
    const age = Date.now() - new Date(record.decidedAt).getTime();
    return age > EXPIRE_DAYS * 86400000;
  }

  function getApprovals() {
    return read(APPROVAL_KEY, {});
  }

  function getHistory() {
    return read(HISTORY_KEY, []);
  }

  function setDecision(id, status, reason) {
    const allowed = ["approved", "held", "rejected", "pending"];
    if (!allowed.includes(status)) return false;
    const approvals = getApprovals();
    const previous = approvals[id] || null;
    const record = {
      id,
      status,
      reason: String(reason || ""),
      decidedAt: nowIso(),
      applied: false,
      applicationLock: true,
      expiresAt: new Date(Date.now() + EXPIRE_DAYS * 86400000).toISOString()
    };
    approvals[id] = record;
    write(APPROVAL_KEY, approvals);
    const history = [{ ...record, previousStatus: previous?.status || null }, ...getHistory()].slice(0, MAX_HISTORY);
    write(HISTORY_KEY, history);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-proposal-approval-updated", { detail: record }));
    render();
    return true;
  }

  function normalizeExpired() {
    const approvals = getApprovals();
    let changed = false;
    Object.keys(approvals).forEach(id => {
      const row = approvals[id];
      if (row?.status === "approved" && isExpired(row)) {
        approvals[id] = { ...row, status: "held", reason: "承認から30日経過したため再確認待ち", expiredAt: nowIso(), applied: false, applicationLock: true };
        changed = true;
      }
    });
    if (changed) write(APPROVAL_KEY, approvals);
    return approvals;
  }

  function proposals() {
    const raw = read(PROPOSAL_KEY, []);
    return Array.isArray(raw) ? raw : Array.isArray(raw?.rows) ? raw.rows : [];
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriProposalApproval");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriChangeProposal") || document.getElementById("hiyoriAdoptionCandidates") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriProposalApproval";
    holder.className = "hiyori-proposal-approval";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function statusLabel(status) {
    return ({ approved: "承認", held: "保留", rejected: "却下", pending: "未判断" })[status] || "未判断";
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;
    const approvalMap = normalizeExpired();
    const rows = proposals();
    holder.innerHTML = `
      <div class="hpa-head"><div><h3>🔐 変更提案 承認管理</h3><p>判断を記録します。承認しても予想へは自動適用されません。</p></div><strong>二重ロック中</strong></div>
      <div class="hpa-list">
        ${rows.length ? rows.map(p => {
          const id = proposalId(p);
          const a = approvalMap[id] || { status: "pending", applied: false, applicationLock: true };
          return `<div class="hpa-row status-${a.status}">
            <div><b>${p.group || "項目"}｜${p.label || "-"}</b><small>${p.target || "反映先未設定"}・上限 ${p.maxAdjustment ?? 0}点</small></div>
            <span>${statusLabel(a.status)}</span>
            <small>${a.reason || "判断理由なし"}</small>
            <div class="hpa-lock">適用状態：無効／自動適用ロック：ON</div>
          </div>`;
        }).join("") : `<p class="hpa-empty">変更提案はまだありません。</p>`}
      </div>
      <p class="hpa-note">承認・保留・却下は記録専用です。予想ロジック、印、配点、買い目は変更しません。</p>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-proposal-approval-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-proposal-approval-style";
    style.textContent = `.hiyori-proposal-approval{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hpa-head{display:flex;justify-content:space-between;gap:12px}.hpa-head h3{margin:0 0 4px;font-size:17px}.hpa-head p{margin:0;color:#64748b;font-size:12px}.hpa-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#fef2f2;color:#991b1b;font-size:12px}.hpa-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.hpa-row{padding:10px;border:1px solid #e2e8f0;border-radius:12px}.hpa-row b,.hpa-row small{display:block}.hpa-row small{margin-top:4px;color:#64748b;font-size:11px}.hpa-row>span{display:inline-block;margin-top:7px;padding:3px 7px;border-radius:999px;background:#f1f5f9;font-size:11px}.hpa-lock{margin-top:7px;padding:6px;border-radius:8px;background:#f8fafc;font-size:11px}.status-approved{background:#f0fdf4}.status-held{background:#fffbeb}.status-rejected{background:#fef2f2}.hpa-note,.hpa-empty{margin:10px 0 0;color:#64748b;font-size:11px}@media(max-width:720px){.hpa-list{grid-template-columns:1fr}.hpa-head{display:block}.hpa-head>strong{display:inline-block;margin-top:8px}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    render();
    ["chappy:hiyori-change-proposals-updated", "storage"].forEach(name => window.addEventListener(name, render));
    setInterval(render, 60000);
  }

  window.ChappyHiyoriProposalApproval = { setDecision, getApprovals, getHistory, render, proposalId };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();