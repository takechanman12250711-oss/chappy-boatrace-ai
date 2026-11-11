(function (root) {
  "use strict";

  // 「今日のチャッピー」: レース画面の先頭に、今日の予想・締切までの時間・
  // 予想データの更新状況をまとめて表示する。保存済み要約（summaries）を読むだけで、
  // 予想の中身・買い目・保存データは変更しない。
  const SUMMARY_ROOT = "data/predictions/summaries";
  const RESULT_ROOT = "data/results"; // 公式結果（収集済み）。着順を見せるだけで的中判定はしない
  const LATE_HOUR_JST = 13; // この時刻を過ぎても今日の要約が無ければ遅延の可能性を出す
  const SOON_MS = 10 * 60 * 1000;
  const TICK_MS = 30 * 1000;
  const REFETCH_MS = 10 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 15000;
  const RECENT_DAYS = 7;
  const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);

  function jst(ms) {
    const d = new Date(ms + JST_OFFSET_MS);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    return {
      key: `${y}${String(m).padStart(2, "0")}${String(day).padStart(2, "0")}`,
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      label: `${m}月${day}日(${WEEK[d.getUTCDay()]})`,
      shortLabel: `${m}/${day}(${WEEK[d.getUTCDay()]})`
    };
  }

  function hhmm(ms) {
    if (!Number.isFinite(ms)) return "--:--";
    const p = jst(ms);
    return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  }

  function latestCheckedMs(summary) {
    const values = [summary?.updatedAt]
      .concat((Array.isArray(summary?.runs) ? summary.runs : []).map(run => run?.checkedAt))
      .map(value => Date.parse(value || ""))
      .filter(Number.isFinite);
    return values.length ? Math.max(...values) : NaN;
  }

  function checkedRaceCount(summary) {
    const runs = Array.isArray(summary?.runs) ? summary.runs : [];
    const latest = runs.slice().sort((a, b) =>
      (Date.parse(b?.checkedAt || "") || 0) - (Date.parse(a?.checkedAt || "") || 0))[0];
    if (Array.isArray(latest?.compared)) return latest.compared.length;
    const target = Number(latest?.collectionHealth?.targetCount);
    return Number.isFinite(target) ? target : null;
  }

  function remainText(diffMs) {
    const minutes = Math.ceil(diffMs / 60000);
    if (minutes < 60) return `あと${minutes}分`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `あと${hours}時間${rest}分` : `あと${hours}時間`;
  }

  // 収集済みの公式結果から、そのレースの着順を取り出す。
  // 的中・不的中の判定はしない（成績タブの定義を変えないため）。
  function resultOf(results, jcd, raceNo) {
    if (!results || !Array.isArray(results.races) || !jcd) return null;
    const row = results.races.find(r => String(r?.jcd || "") === jcd && Number(r?.raceNo) === raceNo);
    if (!row) return null;
    if (row.void === true || row.status === "void") return { kind: "void", text: "レース不成立（成績タブで確認）" };
    if (row.status !== "finished" || row.resultAvailable !== true) return { kind: "pending", text: "結果待ち" };
    const boats = [1, 2, 3].map(rank => {
      const hit = (Array.isArray(row.finishers) ? row.finishers : []).filter(f => Number(f?.rank) === rank);
      const boat = hit.length === 1 ? Number(hit[0].boat) : NaN;
      return Number.isInteger(boat) && boat >= 1 && boat <= 6 ? boat : null;
    });
    if (boats.some(boat => boat === null)) return { kind: "check", text: "同着などあり（成績タブで確認）" };
    return { kind: "finished", text: `公式結果 ${boats.join("-")}` };
  }

  function jcdOf(item) {
    const direct = String(item?.jcd || "").trim();
    if (/^\d{2}$/.test(direct)) return direct;
    const match = /^\d{8}-(\d{2})-\d{1,2}$/.exec(String(item?.raceKey || ""));
    return match ? match[1] : "";
  }

  function raceOf(item, nowMs, results = null) {
    const raceNo = Number(item?.raceNo);
    const place = String(item?.place || "").trim();
    if (!place || !Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12) return null;
    const deadlineMs = Date.parse(item?.deadlineAt || "");
    let state = "unknown";
    let remain = "締切時刻を確認中";
    if (Number.isFinite(deadlineMs)) {
      const diff = deadlineMs - nowMs;
      if (diff <= 0) { state = "closed"; remain = "締切済み"; }
      else if (diff <= SOON_MS) { state = "soon"; remain = `まもなく締切（${remainText(diff)}）`; }
      else { state = "open"; remain = remainText(diff); }
    }
    return {
      key: String(item?.raceKey || `${place}-${raceNo}`),
      place,
      raceNo,
      deadlineMs,
      deadlineText: hhmm(deadlineMs),
      state,
      remain,
      scenario: String(item?.selection?.scenarioLabel || "").trim(),
      result: resultOf(results, jcdOf(item), raceNo)
    };
  }

  // 表示内容を組み立てる（DOMに依存しない。テストから直接呼ぶ）。
  function usableResults(results, dateKey) {
    return results && String(results.date || "") === String(dateKey || "") ? results : null;
  }

  function buildModel({ summary = null, status = "ok", nowMs = Date.now(), results = null } = {}) {
    const today = jst(nowMs);
    const model = {
      dateLabel: today.label,
      freshness: { kind: "ok", text: "" },
      checkedCount: null,
      races: [],
      emptyText: ""
    };

    if (status === "missing") {
      const late = today.hour >= LATE_HOUR_JST;
      model.freshness = late
        ? { kind: "late", text: "今日の予想データがまだ届いていません。アプリへの反映が遅れている可能性があります。" }
        : { kind: "waiting", text: "今日の予想はまだ保存されていません。保存されると、ここに表示されます。" };
      model.emptyText = late ? "公式サイトや note の公開状況もあわせてご確認ください。" : "";
      return model;
    }
    if (status === "error" || !summary) {
      model.freshness = { kind: "error", text: "予想データを読み込めませんでした。通信状態を確認して、もう一度お試しください。" };
      return model;
    }
    if (summary.date && String(summary.date) !== today.key) {
      model.freshness = { kind: "late", text: "表示中のデータが今日の日付ではありません。反映が遅れている可能性があります。" };
      return model;
    }

    const checkedMs = latestCheckedMs(summary);
    model.freshness = {
      kind: "ok",
      text: Number.isFinite(checkedMs) ? `予想データ ${hhmm(checkedMs)} 更新` : "予想データを確認しました"
    };
    model.checkedCount = checkedRaceCount(summary);

    const order = { soon: 0, open: 1, unknown: 2, closed: 3 };
    const todayResults = usableResults(results, today.key);
    model.races = (Array.isArray(summary.predictions) ? summary.predictions : [])
      .map(item => raceOf(item, nowMs, todayResults))
      .filter(Boolean)
      .sort((a, b) => order[a.state] - order[b.state] ||
        (a.state === "closed" ? b.deadlineMs - a.deadlineMs : a.deadlineMs - b.deadlineMs));

    if (!model.races.length) {
      model.emptyText = model.checkedCount
        ? `今日は条件を満たすレースがありませんでした（最新の確認では${model.checkedCount}レースを見ました）。無理に予想を出さず見送っています。`
        : "今日は予想を出したレースがありません。";
    }
    return model;
  }

  function buildRecent(entries, nowMs = Date.now()) {
    return (Array.isArray(entries) ? entries : [])
      .filter(entry => entry && entry.summary)
      .map(entry => {
        const dayResults = usableResults(entry.results, entry.date);
        const races = (Array.isArray(entry.summary.predictions) ? entry.summary.predictions : [])
          .map(item => raceOf(item, nowMs, dayResults))
          .filter(Boolean)
          .sort((a, b) => a.deadlineMs - b.deadlineMs);
        const day = /^\d{8}$/.test(entry.date)
          ? jst(Date.UTC(+entry.date.slice(0, 4), +entry.date.slice(4, 6) - 1, +entry.date.slice(6, 8)) - JST_OFFSET_MS + 12 * 3600000)
          : null;
        return { date: entry.date, label: day ? day.shortLabel : entry.date, races };
      });
  }

  function raceCardHtml(race) {
    const scenario = race.scenario ? `<span class="ct-scenario">展開：${esc(race.scenario)}</span>` : "";
    const action = race.state === "closed" ? "成績で結果を見る ›" : "AI予想を見る ›";
    const result = race.state === "closed" && race.result
      ? `<span class="ct-result is-${race.result.kind}">${esc(race.result.text)}</span>` : "";
    return `<button type="button" class="ct-race is-${race.state}" data-ct-place="${esc(race.place)}" data-ct-race="${race.raceNo}" data-ct-state="${race.state}">` +
      `<span class="ct-race-top"><strong>${esc(race.place)} ${race.raceNo}R</strong><span class="ct-remain">${esc(race.remain)}</span></span>` +
      `<span class="ct-race-meta"><span>締切 <b>${esc(race.deadlineText)}</b></span>${scenario}</span>` +
      result + `<span class="ct-action">${action}</span></button>`;
  }

  function recentHtml(recent) {
    if (!recent.length) return "";
    const rows = recent.map(day => `<li><span class="ct-recent-date">${esc(day.label)}</span><span class="ct-recent-races">${
      day.races.length
        ? day.races.map(race => `${esc(race.place)}${race.raceNo}R${race.scenario ? `<small>（${esc(race.scenario)}）</small>` : ""}${
          race.result ? ` <span class="ct-recent-result is-${race.result.kind}">→ ${esc(race.result.text)}</span>` : ""}`).join("、")
        : "<small>見送り</small>"
    }</span></li>`).join("");
    return `<details class="ct-recent"><summary>最近の予想レース（${recent.length}日分）</summary><ul>${rows}</ul>` +
      `<p class="ct-note">的中・不的中は下の「成績」タブで確認できます。</p></details>`;
  }

  function renderHtml(model, recent = []) {
    const icon = { ok: "✅", waiting: "⏳", late: "⚠️", error: "⚠️" }[model.freshness.kind] || "";
    const races = model.races.length
      ? `<div class="ct-race-list">${model.races.map(raceCardHtml).join("")}</div>`
      : (model.emptyText ? `<p class="ct-empty">${esc(model.emptyText)}</p>` : "");
    return `<div class="ct-head"><h2>今日のチャッピー</h2><span class="ct-date">${esc(model.dateLabel)}</span></div>` +
      `<p class="ct-fresh is-${model.freshness.kind}" role="status">${icon} ${esc(model.freshness.text)}</p>` +
      races + recentHtml(recent) +
      `<p class="ct-note">参考情報です。舟券の購入は20歳以上・ご自身の判断でお願いします。</p>`;
  }

  const api = { buildModel, buildRecent, renderHtml, resultOf, jst, hhmm };

  if (typeof module === "object" && module.exports) module.exports = api;
  if (!root || !root.document) return;

  const doc = root.document;
  const state = { summary: null, status: "loading", recent: [], results: null, fetchedAt: 0, loading: null, lastHtml: "", recentResults: null, recentFetchedAt: 0 };

  function fetchJson(url) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? root.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : 0;
    return root.fetch(url, { cache: "no-store", ...(controller ? { signal: controller.signal } : {}) })
      .then(response => {
        if (response.status === 404) return { missing: true };
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json().then(data => ({ data }));
      })
      .finally(() => { if (timer) root.clearTimeout(timer); });
  }

  function ensurePanel() {
    let panel = doc.getElementById("chappyTodayPanel");
    if (panel) return panel;
    const raceSection = doc.getElementById("raceSection");
    if (!raceSection) return null;
    panel = doc.createElement("section");
    panel.id = "chappyTodayPanel";
    panel.className = "chappy-today-panel";
    panel.setAttribute("aria-label", "今日のチャッピー");
    raceSection.insertBefore(panel, raceSection.firstChild);
    panel.addEventListener("click", onClick);
    panel.addEventListener("toggle", event => {
      if (event.target?.classList?.contains("ct-recent") && event.target.open) loadRecentResults();
    }, true);
    return panel;
  }

  function render() {
    const panel = ensurePanel();
    if (!panel) return;
    if (state.status === "loading" && !state.summary) {
      const html = '<div class="ct-head"><h2>今日のチャッピー</h2></div><p class="ct-fresh is-waiting">⏳ 今日の予想を確認しています…</p>';
      if (html !== state.lastHtml) { panel.innerHTML = html; state.lastHtml = html; }
      return;
    }
    const model = buildModel({ summary: state.summary, status: state.status, nowMs: Date.now(), results: state.results });
    const html = renderHtml(model, buildRecent(state.recent));
    if (html === state.lastHtml) return;
    const recentOpen = panel.querySelector(".ct-recent")?.open === true;
    panel.innerHTML = html;
    if (recentOpen) panel.querySelector(".ct-recent")?.setAttribute("open", "");
    state.lastHtml = html;
  }

  function load() {
    if (state.loading) return state.loading;
    const nowMs = Date.now();
    const todayKey = jst(nowMs).key;
    state.loading = fetchJson(`${SUMMARY_ROOT}/${todayKey}.json?t=${nowMs}`)
      .then(result => {
        if (result.missing) { state.status = "missing"; state.summary = null; }
        else { state.status = "ok"; state.summary = result.data; }
      })
      .catch(error => {
        console.warn("今日のチャッピー: 予想データの取得エラー", error);
        if (!state.summary) state.status = "error";
      })
      .then(() => {
        state.fetchedAt = Date.now();
        render();
        return loadTodayResults(todayKey);
      })
      .then(() => {
        render();
        return loadRecent(nowMs);
      })
      .finally(() => { state.loading = null; });
    return state.loading;
  }

  // 締切済みの予想レースがあり、まだ着順がそろっていないときだけ今日の公式結果を読む。
  function loadTodayResults(todayKey) {
    const nowMs = Date.now();
    const races = state.summary && state.status === "ok"
      ? buildModel({ summary: state.summary, nowMs, results: state.results }).races : [];
    const waiting = races.some(race => race.state === "closed" && (!race.result || race.result.kind === "pending"));
    if (!waiting) return Promise.resolve();
    return fetchJson(`${RESULT_ROOT}/${todayKey}.json?t=${nowMs}`)
      .then(result => { if (!result.missing) state.results = result.data; })
      .catch(error => console.warn("今日のチャッピー: 公式結果の取得エラー", error));
  }

  // 「最近の予想レース」を開いたときだけ、その日の公式結果を読む（通信量を抑える）。
  // 着順がそろった日は読み直さない。結果待ちの日だけ、次に開いたときに読み直す。
  function needsResults(entry) {
    const predictions = Array.isArray(entry?.summary?.predictions) ? entry.summary.predictions : [];
    if (!predictions.length) return false;
    const day = buildRecent([entry])[0];
    return !day || day.races.some(race => !race.result || race.result.kind === "pending");
  }

  function loadRecentResults() {
    if (state.recentResults) return state.recentResults;
    if (Date.now() - state.recentFetchedAt < REFETCH_MS) return Promise.resolve();
    const targets = state.recent.filter(needsResults);
    if (!targets.length) return Promise.resolve();
    state.recentResults = Promise.all(targets.map(entry =>
      fetchJson(`${RESULT_ROOT}/${entry.date}.json?t=${Date.now()}`)
        .then(result => { if (!result.missing) entry.results = result.data; })
        .catch(() => {})))
      .then(() => { state.recentFetchedAt = Date.now(); render(); })
      .finally(() => { state.recentResults = null; });
    return state.recentResults;
  }

  function loadRecent(nowMs) {
    if (state.recent.length) return Promise.resolve();
    const days = [];
    for (let i = 1; i <= RECENT_DAYS; i += 1) days.push(jst(nowMs - i * 86400000).key);
    return Promise.all(days.map(date => fetchJson(`${SUMMARY_ROOT}/${date}.json`)
      .then(result => ({ date, summary: result.missing ? null : result.data }))
      .catch(() => ({ date, summary: null }))))
      .then(entries => { state.recent = entries.filter(entry => entry.summary); render(); });
  }

  function clickNav(view) {
    doc.querySelector(`.bottom-nav-item[data-view="${view}"]`)?.click();
  }

  function onClick(event) {
    const card = event.target.closest?.("[data-ct-place][data-ct-race]");
    if (!card) return;
    if (card.dataset.ctState === "closed") { clickNav("result"); return; }
    const home = root.ChappyHomeDashboardV2;
    if (typeof home?.openRace === "function") {
      home.openRace(card.dataset.ctPlace, card.dataset.ctRace);
      return;
    }
    clickNav("race");
  }

  function tick() {
    if (doc.visibilityState === "hidden") return;
    if (Date.now() - state.fetchedAt > REFETCH_MS) load();
    else render();
  }

  function init() {
    render();
    load();
    root.setInterval(tick, TICK_MS);
    doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "visible") tick(); });
  }

  root.ChappyTodayPanel = Object.freeze({ ...api, refresh: load });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(typeof window !== "undefined" ? window : null);
