// js/hiyori-production-rollback-panel.js
(function () {
  "use strict";

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ja-JP");
  }

  function render() {
    const api = window.ChappyHiyoriProductionRollback;
    if (!api) return;
    let root = document.getElementById("hiyori-production-rollback-panel");
    if (!root) {
      root = document.createElement("section");
      root.id = "hiyori-production-rollback-panel";
      root.className = "hiyori-rollback-panel";
      document.body.appendChild(root);
    }

    const snapshots = api.listSnapshots();
    const history = api.listHistory();
    root.innerHTML = `
      <div class="hiyori-rollback-head">
        <div>
          <h2>復元・世代管理</h2>
          <p>本番反映前後の状態を署名付きで保存。復元後も予想反映は無効のままです。</p>
        </div>
        <button type="button" data-create-snapshot>現在状態を保存</button>
      </div>
      <div class="hiyori-rollback-lock">🔒 globalProductionLock: ON ／ appliedToPrediction: false</div>
      <div class="hiyori-rollback-grid">
        ${(Array.isArray(snapshots) ? snapshots : []).slice(0, 10).map(row => {
          const valid = api.verify(row);
          const changes = api.diff(row).length;
          return `<article class="hiyori-rollback-card">
            <div class="hiyori-rollback-card-top"><strong>世代 ${esc(row.generation)}</strong><span class="${valid ? "is-valid" : "is-invalid"}">${valid ? "署名一致" : "署名不一致"}</span></div>
            <p>${esc(formatDate(row.createdAt))}</p>
            <p>理由：${esc(row.reason)}</p>
            <p>現在との差分：${esc(changes)}項目</p>
            <button type="button" data-restore="${esc(row.signature)}" ${valid ? "" : "disabled"}>この世代へ復元</button>
          </article>`;
        }).join("") || "<p>保存済み世代はありません。</p>"}
      </div>
      <h3>復元履歴</h3>
      <div class="hiyori-rollback-history">
        ${(Array.isArray(history) ? history : []).slice(0, 10).map(row => `<div>
          <strong>${row.success ? "復元成功" : "復元失敗"}</strong>
          <span>${esc(formatDate(row.createdAt))}</span>
          <span>世代 ${esc(row.restoredGeneration)}</span>
          <span>安全確認 ${row.healthCheck?.ok ? "OK" : "NG"}</span>
        </div>`).join("") || "<p>復元履歴はありません。</p>"}
      </div>`;

    root.querySelector("[data-create-snapshot]")?.addEventListener("click", () => {
      api.createSnapshot({ reason: "manual-ui" });
      render();
    });
    root.querySelectorAll("[data-restore]").forEach(button => {
      button.addEventListener("click", () => {
        const result = api.restore(button.dataset.restore, "manual-ui");
        if (!result.ok) window.alert(`復元できませんでした: ${result.error || "health-check-failed"}`);
        render();
      });
    });
  }

  function install() {
    render();
    window.addEventListener("chappy:hiyori-snapshot-created", render);
    window.addEventListener("chappy:hiyori-rollback-completed", render);
    window.setInterval(render, 60000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
