(function (root) {
  "use strict";

  const DATA_ROOT = "data/predictions";
  const SUMMARY_ROOT = `${DATA_ROOT}/summaries`;
  const NOTE_NEW_URL = "https://note.com/notes/new";
  const dateDataPromises = new Map();

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

  async function fetchJson(url, cache) {
    const response = await fetch(url, { cache });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function loadDateData(date, options = {}) {
    const key = String(date || "");
    const force = options.force === true;

    if (!force && dateDataPromises.has(key)) {
      return dateDataPromises.get(key);
    }

    const request = fetchJson(
      `${SUMMARY_ROOT}/${key}.json?v=1`,
      force ? "reload" : "default"
    ).catch(error => {
      if (error?.status !== 404) throw error;
      return fetchJson(
        `${DATA_ROOT}/${key}.json`,
        force ? "reload" : "default"
      );
    });

    dateDataPromises.set(key, request);
    request.catch(() => {
      if (dateDataPromises.get(key) === request) {
        dateDataPromises.delete(key);
      }
    });
    return request;
  }

  function ticketLabel(item) {
    return text(
      item?.ticket || item?.bet || item?.mark || item?.combination,
      "買い目未取得"
    );
  }

  function parseNoteDraft(markdown, fallbackTitle = "") {
    const source = text(markdown, "").replace(/^\uFEFF/, "").trim();
    const match = source.match(/^#\s+(.+?)(?:\r?\n|$)/);
    const title = match ? match[1].trim() : text(fallbackTitle, "");
    const body = match ? source.slice(match[0].length).trim() : source;
    return { title, body };
  }

  function buildNotePackage(draft) {
    const title = text(draft?.title, "");
    const body = text(draft?.body, "");
    return [
      title ? `# ${title}` : "",
      body
    ].filter(Boolean).join("\n\n");
  }

  async function copyText(value) {
    const source = text(value, "");
    if (!source) throw new Error("コピーする内容がありません");
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(source);
      return;
    }
    const temporary = document.createElement("textarea");
    temporary.value = source;
    temporary.setAttribute("readonly", "");
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.appendChild(temporary);
    temporary.select();
    document.execCommand("copy");
    temporary.remove();
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
    const notePath = text(view.saved?.note?.path, "");
    const noteTitle = text(view.saved?.note?.title, "");
    return `
      <div class="auto-selection-saved">
        <div class="auto-selection-actions">
          <button id="autoOpenPredictionBtn" type="button">予想を見る</button>
          ${notePath ? `
            <button id="autoNotePreviewBtn" type="button">note原稿を確認</button>
            <button id="autoNoteCopyTitleBtn" type="button" data-note-title="${escapeHtml(noteTitle)}" hidden>タイトルをコピー</button>
            <button id="autoNoteCopyFullBtn" type="button" disabled hidden>全文をコピー</button>
            <a
              id="autoNotePrepareBtn"
              href="${NOTE_NEW_URL}"
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled="true"
              tabindex="-1"
              hidden
            >確認後、note投稿準備</a>
          ` : ""}
        </div>
        ${notePath ? `
          <div id="autoNotePreview" class="auto-note-preview" hidden>
            <div class="auto-note-preview-head">
              <strong>${escapeHtml(noteTitle || "note原稿")}</strong>
              <span id="autoNotePreviewStatus">原稿を読み込んでいます</span>
            </div>
            <textarea id="autoNotePreviewText" rows="18" readonly aria-label="自動生成されたnote原稿"></textarea>
            <label class="auto-note-confirm">
              <input id="autoNoteConfirmCheck" type="checkbox" disabled />
              <span>タイトル・無料部分・有料部分・買い目を確認しました</span>
            </label>
            <p>確認後のボタンで原稿一式をコピーしてnoteを開きます。公開はされません。</p>
          </div>
        ` : ""}
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
      ? `基準${view.threshold}点を通過`
      : `基準まであと${view.gap.toFixed(1)}点`;

    area.innerHTML = `
      <div class="auto-selection-summary ${statusClass}">
        <div class="auto-selection-status-line">
          <span class="auto-selection-status">${statusText}</span>
          <small>最終実行 ${escapeHtml(formatJstTime(view.run.checkedAt))}</small>
        </div>
        <div class="auto-selection-grid">
          <div><small>候補レース</small><strong>${escapeHtml(view.best?.place)} ${number(view.best?.raceNo)}R</strong></div>
          <div><small>${escapeHtml(view.scoreType)}評価</small><strong>${view.score.toFixed(1)} / ${view.threshold}点</strong></div>
        </div>
        <p class="auto-selection-judgement">${escapeHtml(reason)}</p>
      </div>
      ${ticketsHtml(view)}`;

    const openButton = document.getElementById("autoOpenPredictionBtn");
    if (openButton && view.saved) {
      openButton.addEventListener("click", () => openSavedPrediction(view.saved));
    }
    setupNoteDraft(view);
  }

  function setupNoteDraft(view) {
    const notePath = text(view.saved?.note?.path, "");
    if (!notePath) return;

    const previewButton = document.getElementById("autoNotePreviewBtn");
    const titleButton = document.getElementById("autoNoteCopyTitleBtn");
    const fullButton = document.getElementById("autoNoteCopyFullBtn");
    const prepareButton = document.getElementById("autoNotePrepareBtn");
    const confirmCheck = document.getElementById("autoNoteConfirmCheck");
    const preview = document.getElementById("autoNotePreview");
    const previewText = document.getElementById("autoNotePreviewText");
    const status = document.getElementById("autoNotePreviewStatus");
    let draft = null;
    let loading = null;

    async function loadDraft() {
      if (draft) return draft;
      if (loading) return loading;
      loading = fetch(`${notePath}?t=${Date.now()}`, { cache: "no-store" })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        })
        .then(markdown => {
          draft = parseNoteDraft(markdown, view.saved?.note?.title);
          if (previewText) previewText.value = draft.body;
          if (status) status.textContent = "原稿を取得しました。内容を確認してください";
          if (fullButton) fullButton.disabled = !draft.body;
          if (confirmCheck) confirmCheck.disabled = !draft.body;
          return draft;
        })
        .catch(error => {
          if (status) status.textContent = `取得失敗：${error?.message || error}`;
          throw error;
        })
        .finally(() => {
          loading = null;
        });
      return loading;
    }

    previewButton?.addEventListener("click", async () => {
      if (preview) preview.hidden = false;
      if (status) status.textContent = "原稿を読み込んでいます";
      try {
        await loadDraft();
        if (titleButton) titleButton.hidden = false;
        if (fullButton) fullButton.hidden = false;
        if (prepareButton) prepareButton.hidden = false;
        preview?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) {
        console.error("note原稿取得エラー", error);
      }
    });

    titleButton?.addEventListener("click", async () => {
      try {
        if (preview) preview.hidden = false;
        const current = await loadDraft();
        const title = titleButton.dataset.noteTitle || current.title;
        await copyText(title);
        if (status) status.textContent = "タイトルをコピーしました";
      } catch (error) {
        if (status) status.textContent = error?.message || "コピーできませんでした";
      }
    });

    fullButton?.addEventListener("click", async () => {
      try {
        if (preview) preview.hidden = false;
        const current = await loadDraft();
        await copyText(current.body);
        if (status) status.textContent = "記事全文をコピーしました";
      } catch (error) {
        if (status) status.textContent = error?.message || "コピーできませんでした";
      }
    });

    confirmCheck?.addEventListener("change", () => {
      const ready = Boolean(confirmCheck.checked && draft?.body);
      if (prepareButton) {
        prepareButton.setAttribute("aria-disabled", ready ? "false" : "true");
        prepareButton.tabIndex = ready ? 0 : -1;
      }
      if (status) {
        status.textContent = ready
          ? "確認済みです。note投稿準備へ進めます"
          : "内容を確認してチェックしてください";
      }
    });

    prepareButton?.addEventListener("click", event => {
      const ready = Boolean(confirmCheck?.checked && draft?.body);
      if (!ready) {
        event.preventDefault();
        if (status) status.textContent = "先に原稿を確認してチェックしてください";
        return;
      }

      copyText(buildNotePackage(draft))
        .then(() => {
          if (status) status.textContent = "原稿一式をコピーしてnoteを開きました";
        })
        .catch(error => {
          if (status) status.textContent = error?.message || "コピーできませんでした";
        });
    });
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

  async function loadAutoSelection(options = {}) {
    const area = document.getElementById("autoSelectionArea");
    const badge = document.getElementById("autoSelectionBadge");
    if (!area) return;
    area.innerHTML = '<p class="auto-selection-empty">自動選定結果を取得しています…</p>';
    if (badge) badge.textContent = "更新中";
    try {
      const date = jstDate();
      let data;
      try {
        data = await loadDateData(date, {
          force: options.force === true
        });
      } catch (error) {
        if (error?.status !== 404) throw error;
        area.innerHTML = '<p class="auto-selection-empty">本日の初回自動比較を待っています</p>';
        if (badge) badge.textContent = "実行待ち";
        return;
      }
      renderData(area, data);
      if (badge) badge.textContent = "自動更新済み";
    } catch (error) {
      area.innerHTML = `<p class="auto-selection-error">取得できませんでした。更新ボタンでもう一度確認できます。<small>${escapeHtml(error?.message)}</small></p>`;
      if (badge) badge.textContent = "取得失敗";
    }
  }

  function start() {
    document.getElementById("autoSelectionRefreshBtn")
      ?.addEventListener("click", () =>
        loadAutoSelection({ force: true })
      );
    loadAutoSelection();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildViewModel,
      jstDate,
      ticketLabel,
      parseNoteDraft,
      buildNotePackage,
      loadDateData
    };
  }
  root.ChappyAutoSelection = Object.freeze({
    loadDateData,
    loadAutoSelection,
    buildViewModel
  });
  if (root.document) {
    root.document.addEventListener("DOMContentLoaded", start);
  }
})(typeof window !== "undefined" ? window : globalThis);
