(function (root) {
  "use strict";

  const DATA_ROOT = "data/predictions";

  function jstDate(now = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now).replaceAll("-", "");
  }

  function formatJstTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function text(value, fallback = "-") {
    return value === null || value === undefined || value === ""
      ? fallback
      : String(value);
  }

  function escapeHtml(value) {
    return text(value, "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function latest(items, key) {
    return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
      Date.parse(b?.[key] || 0) - Date.parse(a?.[key] || 0)
    )[0] || null;
  }

  function ticketLabel(item) {
    return text(
      item?.ticket || item?.bet || item?.mark || item?.combination,
      "買い目未取得"
    );
  }

  function buildViewModel(data) {
    const run = latest(data?.runs, "checkedAt");
    const saved = latest(data?.predictions, "selectedAt");
    const best = run?.best || null;
    const threshold = number(run?.threshold, 70);
    const score = number(best?.score, 0);
    const scoreType = text(best?.type, "評価");
    const scoreDetails = best?.evaluation?.[
      scoreType === "波乱" ? "manshu" : "honmei"
    ] || null;
    const compared = Array.isArray(run?.compared) ? run.compared : [];
    const venues = new Set(compared.map(item => item?.jcd).filter(Boolean)).size;
    const tickets = Array.isArray(saved?.prediction?.practicalTickets)
      ? saved.prediction.practicalTickets.slice(0, 7)
      : [];

    return {
      run,
      saved,
      best,
      threshold,
      score,
      scoreType,
      scoreDetails,
      venues,
      races: compared.length,
      tickets,
      gap: Math.max(0, threshold - score)
    };
  }

  function reasonsHtml(view) {
    const reasons = Array.isArray(view.scoreDetails?.reasons)
      ? view.scoreDetails.reasons.slice(0, 4)
      : [];
    if (!reasons.length) {
      return '<p class="auto-selection-empty">判定根拠を確認中です</p>';
    }
    return `<ul class="auto-selection-reasons">${reasons
      .map(reason => `<li>${escapeHtml(reason)}</li>`)
      .join("")}</ul>`;
  }

  function ticketsHtml(view) {
    if (!view.saved) return "";
    const ticketRows = view.tickets.length
      ? `<div class="auto-selection-tickets">${view.tickets.map(item => `
          <span>
            <strong>${escapeHtml(ticketLabel(item))}</strong>
            <small>${escapeHtml(item?.category || item?.type || "厳選")}</small>
          </span>
        `).join("")}</div>`
      : '<p class="auto-selection-empty">厳選買い目は保存データを確認中です</p>';
    const notePath = text(view.saved?.note?.path, "");
    return `
      <div class="auto-selection-saved">
        <div class="auto-selection-saved-head">
          <div>
            <small>本日の保存済み予想</small>
            <strong>${escapeHtml(view.saved.place)} ${number(view.saved.raceNo)}R</strong>
          </div>
          <span>${escapeHtml(view.saved.selection?.type || "採用")} ${number(view.saved.selection?.score).toFixed(1)}点</span>
        </div>
        ${ticketRows}
        <div class="auto-selection-actions">
          <button id="autoOpenPredictionBtn" type="button">AI予想を開く</button>
          ${notePath ? `<a href="${escapeHtml(notePath)}" target="_blank" rel="noopener noreferrer">note原稿を見る</a>` : ""}
        </div>
      </div>`;
  }

  function renderData(area, data) {
    const view = buildViewModel(data);
    if (!view.run) {
      area.innerHTML = '<p class="auto-selection-empty">本日の初回自動比較を待っています</p>';
      return;
    }
    const selected = Boolean(view.run.selected);
    const statusClass = selected ? "is-selected" : "is-skipped";
    const statusText = selected ? "予想採用" : "見送り";
    const reason = selected
      ? `${view.threshold}点以上のため予想を保存しました`
      : `基準${view.threshold}点まであと${view.gap.toFixed(1)}点`;
    const dataStatus = text(view.best?.evaluation?.dataStatus?.label, "判定データ確認中");

    area.innerHTML = `
      <div class="auto-selection-summary ${statusClass}">
        <div class="auto-selection-status-line">
          <span class="auto-selection-status">${statusText}</span>
          <small>最終実行 ${escapeHtml(formatJstTime(view.run.checkedAt))}</small>
        </div>
        <div class="auto-selection-grid">
          <div><small>比較対象</small><strong>${view.venues}場・${view.races}レース</strong></div>
          <div><small>最高評価</small><strong>${escapeHtml(view.best?.place)} ${number(view.best?.raceNo)}R</strong></div>
          <div><small>${escapeHtml(view.scoreType)}評価</small><strong>${view.score.toFixed(1)}点</strong></div>
          <div><small>データ状態</small><strong>${escapeHtml(dataStatus)}</strong></div>
        </div>
        <p class="auto-selection-judgement">${escapeHtml(reason)}</p>
        ${reasonsHtml(view)}
      </div>
      ${ticketsHtml(view)}`;

    const openButton = document.getElementById("autoOpenPredictionBtn");
    if (openButton && view.saved) {
      openButton.addEventListener("click", () => openSavedPrediction(view.saved));
    }
  }

  function openSavedPrediction(saved) {
    const place = document.getElementById("placeSelect");
    const race = document.getElementById("raceSelect");
    const date = document.getElementById("dateInput");
    if (place && saved?.place) place.value = saved.place;
    if (race && saved?.raceNo) race.value = `${number(saved.raceNo)}R`;
    if (date && saved?.date) {
      const raw = String(saved.date);
      date.value = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    }
    document.getElementById("fetchRaceBtn")?.click();
    document.getElementById("predictionSection")?.scrollIntoView({ behavior: "smooth" });
  }

  async function loadAutoSelection() {
    const area = document.getElementById("autoSelectionArea");
    const badge = document.getElementById("autoSelectionBadge");
    if (!area) return;
    area.innerHTML = '<p class="auto-selection-empty">自動選定結果を取得しています…</p>';
    if (badge) badge.textContent = "更新中";
    try {
      const date = jstDate();
      const response = await fetch(`${DATA_ROOT}/${date}.json?t=${Date.now()}`, {
        cache: "no-store"
      });
      if (response.status === 404) {
        area.innerHTML = '<p class="auto-selection-empty">本日の初回自動比較を待っています</p>';
        if (badge) badge.textContent = "実行待ち";
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderData(area, data);
      if (badge) badge.textContent = "自動更新済み";
    } catch (error) {
      area.innerHTML = `<p class="auto-selection-error">取得できませんでした。更新ボタンでもう一度確認できます。<small>${escapeHtml(error?.message)}</small></p>`;
      if (badge) badge.textContent = "取得失敗";
    }
  }

  function start() {
    document.getElementById("autoSelectionRefreshBtn")
      ?.addEventListener("click", loadAutoSelection);
    loadAutoSelection();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildViewModel, jstDate, ticketLabel };
  }
  if (root.document) {
    root.document.addEventListener("DOMContentLoaded", start);
  }
})(typeof window !== "undefined" ? window : globalThis);
