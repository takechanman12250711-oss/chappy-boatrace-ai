(function (root) {
  "use strict";

  const API_ROOT = "https://chappy-boatrace-api.vercel.app/api";
  const SUMMARY_ROOT = "data/predictions/summaries";
  const CACHE_KEY = "chappy-home-v2-cache";
  const CACHE_TTL = 60000;
  const TYPES = {
    morning: new Set(["三国", "鳴門", "徳山", "芦屋", "唐津", "大村"]),
    night: new Set(["桐生", "蒲郡", "住之江", "丸亀", "下関", "若松"])
  };
  const state = {
    filter: "all",
    schedule: [],
    recommendations: [],
    showAll: false,
    selectedPlace: "",
    selectedRace: 0,
    loading: false,
    updatedAt: null,
    bound: false
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function jstDate() {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date()).replaceAll("-", "");
  }

  function timeOf(value) {
    if (!value) return "--:--";
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit"
      }).format(date);
    }
    const match = String(value).match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "--:--";
  }

  function minutesUntil(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? Math.floor((date.getTime() - Date.now()) / 60000) : null;
  }

  function deadlineClass(value) {
    const minutes = minutesUntil(value);
    return minutes === null ? "is-before" : minutes <= 2 ? "is-skip" : minutes <= 5 ? "is-upset-hot" : minutes <= 10 ? "is-upset" : "is-main";
  }

  function venueType(place) {
    return TYPES.morning.has(place) ? "morning" : TYPES.night.has(place) ? "night" : "day";
  }

  function typeLabel(type) {
    return type === "morning" ? "モーニング" : type === "night" ? "ナイター" : "デイ";
  }

  function racesOf(venue) {
    return (Array.isArray(venue?.races) ? venue.races : [])
      .map(row => ({
        raceNo: num(row?.raceNo ?? row?.rno),
        deadlineAt: row?.deadlineAt || row?.deadline || row?.closeAt || "",
        selectable: row?.selectable !== false && row?.closed !== true
      }))
      .filter(row => row.raceNo >= 1 && row.raceNo <= 12)
      .sort((a, b) => a.raceNo - b.raceNo);
  }

  function decisionFor(item) {
    const type = String(item?.type || item?.scoreType || "");
    const score = num(item?.score);
    const honmei = num(item?.evaluation?.honmei?.score);
    const manshu = num(item?.evaluation?.manshu?.score);
    if (/波乱|万舟/.test(type) || manshu >= Math.max(65, honmei + 8)) return { key: "upset", label: "波乱狙い", score: manshu || score };
    if (score < 60 && honmei < 60) return { key: "skip", label: "見送り推奨", score: Math.max(score, honmei) };
    return { key: "main", label: "本命勝負", score: honmei || score };
  }

  function reason(item, decision) {
    const source = decision.key === "upset" ? item?.evaluation?.manshu?.reasons : item?.evaluation?.honmei?.reasons;
    if (Array.isArray(source) && source.length) return String(source[0]);
    return decision.key === "skip" ? "展開が読みにくく妙味も薄い" : decision.key === "upset" ? "外の攻めから波乱期待大" : "最有力展開の成立度が高い";
  }

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (!cached || Date.now() - Number(cached.savedAt || 0) > CACHE_TTL) return false;
      state.schedule = Array.isArray(cached.schedule) ? cached.schedule : [];
      state.recommendations = Array.isArray(cached.recommendations) ? cached.recommendations : [];
      state.updatedAt = cached.updatedAt ? new Date(cached.updatedAt) : new Date(cached.savedAt);
      return state.schedule.length > 0;
    } catch (_) {
      return false;
    }
  }

  function writeCache() {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        updatedAt: state.updatedAt?.toISOString() || null,
        schedule: state.schedule,
        recommendations: state.recommendations
      }));
    } catch (_) {}
  }

  async function getJson(url, force = false) {
    const response = await fetch(url, { cache: force ? "reload" : "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadSchedule(force = false) {
    const data = await getJson(`${API_ROOT}/schedule?date=${encodeURIComponent(jstDate())}`, force);
    state.schedule = Array.isArray(data?.venues) ? data.venues : [];
  }

  async function loadRecommendations(force = false) {
    try {
      const suffix = force ? `?t=${Date.now()}` : "";
      const data = await getJson(`${SUMMARY_ROOT}/${jstDate()}.json${suffix}`, force);
      const run = [...(Array.isArray(data?.runs) ? data.runs : [])]
        .sort((a, b) => Date.parse(b?.checkedAt || 0) - Date.parse(a?.checkedAt || 0))[0];
      state.recommendations = (Array.isArray(run?.compared) ? run.compared : [])
        .map(item => ({ ...item, decision: decisionFor(item) }))
        .filter(item => item?.place && num(item?.raceNo) > 0)
        .sort((a, b) => num(b?.decision?.score) - num(a?.decision?.score))
        .slice(0, 3);
    } catch (error) {
      if (!state.recommendations.length) state.recommendations = [];
      console.warn("ホームおすすめ取得エラー", error);
    }
  }

  function waitForRaceOption(select, value, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if ([...(select?.options || [])].some(option => option.value === value)) return resolve(true);
        if (Date.now() - started >= timeout) return reject(new Error("選択したレース情報を取得できませんでした"));
        root.setTimeout(check, 100);
      };
      check();
    });
  }

  async function syncAndOpen(place, raceNo) {
    if (state.loading) return;
    const raceValue = `${num(raceNo)}R`;
    const mode = document.getElementById("raceModeSelect");
    const placeSelect = document.getElementById("placeSelect");
    const raceSelect = document.getElementById("raceSelect");
    const fetchButton = document.getElementById("fetchRaceBtn");
    if (!placeSelect || !raceSelect || !fetchButton) return;

    state.loading = true;
    state.selectedPlace = place;
    state.selectedRace = num(raceNo);
    document.querySelectorAll(".home-v2-race.is-selected").forEach(el => el.classList.remove("is-selected"));
    document.querySelector(`.home-v2-race[data-place="${CSS.escape(place)}"][data-race="${num(raceNo)}"]`)?.classList.add("is-selected");

    try {
      if (mode) mode.value = "live";
      placeSelect.value = place;
      placeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForRaceOption(raceSelect, raceValue);
      raceSelect.value = raceValue;
      raceSelect.dispatchEvent(new Event("change", { bubbles: true }));
      fetchButton.click();
      setView("prediction");
      document.getElementById("predictionSection")?.scrollIntoView({ behavior: "auto", block: "start" });
    } catch (error) {
      console.error("ホームレース選択エラー", error);
    } finally {
      state.loading = false;
    }
  }

  function recommendationHtml(item, index) {
    const decision = item.decision || decisionFor(item);
    const honmei = Math.round(num(item?.evaluation?.honmei?.score) || num(item.score));
    const manshu = Math.round(num(item?.evaluation?.manshu?.score));
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
    const deadline = item?.deadlineAt || item?.deadline || item?.closeAt || "";
    return `<button class="home-v2-recommend-card is-${decision.key}" type="button" data-place="${esc(item.place)}" data-race="${num(item.raceNo)}"><div class="home-v2-card-top"><span class="home-v2-medal">${medal}</span><span class="home-v2-decision">${esc(decision.label)}</span><span class="home-v2-arrow">›</span></div><strong>${esc(item.place)} ${num(item.raceNo)}R</strong><span class="home-v2-deadline">締切 <b>${esc(timeOf(deadline))}</b></span><span class="home-v2-score-row"><span>本線信頼度<b>${honmei}</b><small>点</small></span><span>波乱入口<b>${manshu}</b><small>点</small></span></span><small class="home-v2-reason">${esc(reason(item, decision))}</small></button>`;
  }

  function raceHtml(place, race) {
    const selected = state.selectedPlace === place && state.selectedRace === num(race.raceNo);
    return `<button class="home-v2-race ${deadlineClass(race.deadlineAt)} ${selected ? "is-selected" : ""}" type="button" data-place="${esc(place)}" data-race="${num(race.raceNo)}" ${race.selectable === false ? "disabled" : ""}><strong>${num(race.raceNo)}R</strong><span><i></i>${esc(timeOf(race.deadlineAt))}</span></button>`;
  }

  function venueHtml(venue) {
    const place = String(venue?.place || "");
    const type = venueType(place);
    const rows = racesOf(venue).filter(row => row.selectable !== false).slice(0, 4);
    return `<article class="home-v2-venue"><div class="home-v2-venue-info"><strong>${esc(place)} <span>≋</span></strong><small>${typeLabel(type)}</small></div><div class="home-v2-races">${rows.length ? rows.map(row => raceHtml(place, row)).join("") : '<span class="home-v2-no-race">締切前なし</span>'}</div><button class="home-v2-venue-next" type="button" data-open-venue="${esc(place)}">›</button></article>`;
  }

  function filteredVenues() {
    return state.schedule.filter(venue => {
      const place = String(venue?.place || "");
      return racesOf(venue).some(row => row.selectable !== false) && (state.filter === "all" || venueType(place) === state.filter);
    });
  }

  function render() {
    const el = document.getElementById("homeDashboardV2");
    if (!el) return;
    const recommendations = state.recommendations.length
      ? state.recommendations.map(recommendationHtml).join("")
      : '<p class="home-v2-empty">本日のおすすめ判定を準備しています</p>';
    const venues = filteredVenues();
    const shown = state.showAll ? venues : venues.slice(0, 5);

    el.innerHTML = `<section class="home-v2-recommend"><div class="home-v2-title-row"><h2>TODAY'S PICKS　🔥 今日のおすすめレース</h2><span>最終更新 ${state.updatedAt ? timeOf(state.updatedAt) : "--:--"}</span></div><div class="home-v2-recommend-list">${recommendations}</div></section><section class="home-v2-filter-shell"><div class="home-v2-filters">${[["all","🌐 全場"],["morning","☀️ モーニング"],["day","☀️ デイ"],["night","🌙 ナイター"]].map(([key,label]) => `<button type="button" data-filter="${key}" class="${state.filter === key ? "is-active" : ""}">${label}</button>`).join("")}</div></section><section class="home-v2-schedule"><div class="home-v2-title-row home-v2-schedule-title"><h2>⚑ 開催場一覧</h2><div class="home-v2-legend"><span class="is-main">勝負</span><span class="is-upset">波乱</span><span class="is-skip">見送り</span><span class="is-before">展示前</span></div></div><div class="home-v2-venue-list">${shown.length ? shown.map(venueHtml).join("") : '<p class="home-v2-empty">該当する締切前レースがありません</p>'}</div>${venues.length > 5 ? `<button class="home-v2-more" type="button" data-show-all>${state.showAll ? "表示を戻す" : `他の場を見る（全${venues.length}場）`}⌄</button>` : ""}</section>`;
  }

  function bindOnce(el) {
    if (state.bound) return;
    state.bound = true;
    el.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.matches("[data-place][data-race]")) return syncAndOpen(target.dataset.place, target.dataset.race);
      if (target.matches("[data-filter]")) {
        state.filter = target.dataset.filter || "all";
        state.showAll = false;
        render();
        return;
      }
      if (target.matches("[data-show-all]")) {
        state.showAll = !state.showAll;
        render();
        return;
      }
      if (target.matches("[data-open-venue]")) {
        const venue = state.schedule.find(item => String(item?.place || "") === target.dataset.openVenue);
        const first = racesOf(venue).find(row => row.selectable !== false);
        if (first) syncAndOpen(target.dataset.openVenue, first.raceNo);
      }
    });
  }

  function installHeader() {
    const header = document.querySelector(".app-header");
    if (!header) return;
    header.innerHTML = `<div class="header-brand"><div class="header-logo">🚤</div><div class="header-copy"><h1>チャッピーボートレースAI</h1><p class="header-description">展開を読む、勝つためのAI予想</p></div></div><div class="home-header-actions"><button type="button" id="homeFavoriteBtn"><b>☆</b><small>お気に入り</small></button><button type="button" id="homeRefreshBtn"><b>↻</b><small>更新</small></button></div>`;
    document.getElementById("homeRefreshBtn")?.addEventListener("click", () => refresh(true));
    document.getElementById("homeFavoriteBtn")?.addEventListener("click", event => {
      event.currentTarget.classList.toggle("is-active");
      event.currentTarget.querySelector("b").textContent = event.currentTarget.classList.contains("is-active") ? "★" : "☆";
    });
  }

  function ensureHome() {
    let el = document.getElementById("homeDashboardV2");
    if (!el) {
      el = document.createElement("section");
      el.id = "homeDashboardV2";
      el.className = "home-dashboard-v2";
      document.querySelector(".dashboard-app")?.prepend(el);
    }
    bindOnce(el);
    return el;
  }

  function setView(view) {
    const map = {
      home: document.getElementById("homeDashboardV2"),
      race: document.getElementById("raceSection"),
      prediction: document.getElementById("predictionSection"),
      result: document.getElementById("resultSection")
    };
    Object.entries(map).forEach(([key, section]) => { if (section) section.hidden = key !== view; });
    const auto = document.getElementById("autoSelectionSection");
    if (auto) auto.hidden = true;
    document.querySelectorAll(".bottom-nav-item").forEach(item => item.classList.toggle("is-active", item.dataset.view === view));
    if (view === "prediction") root.ChappyPredictionPhase4?.install?.();
  }

  function installNav() {
    const nav = document.querySelector(".bottom-nav");
    if (!nav) return;
    nav.innerHTML = `<a href="#" class="bottom-nav-item is-active" data-view="home"><span>⌂</span><small>ホーム</small></a><a href="#raceSection" class="bottom-nav-item" data-view="race"><span>⚡</span><small>レース検索</small></a><a href="#predictionSection" class="bottom-nav-item" data-view="prediction"><span>◎</span><small>AI予想</small></a><a href="#resultSection" class="bottom-nav-item" data-view="result"><span>▥</span><small>成績分析</small></a><a href="#" class="bottom-nav-item" data-view="menu"><span>☰</span><small>メニュー</small></a>`;
    nav.addEventListener("click", event => {
      const item = event.target.closest("[data-view]");
      if (!item) return;
      event.preventDefault();
      if (item.dataset.view !== "menu") {
        setView(item.dataset.view);
        root.scrollTo({ top: 0, behavior: "auto" });
      }
    });
  }

  async function refresh(force = false) {
    const el = ensureHome();
    if (force) el.classList.add("is-loading");
    try {
      await Promise.allSettled([loadSchedule(force), loadRecommendations(force)]);
      state.updatedAt = new Date();
      writeCache();
      render();
    } finally {
      el.classList.remove("is-loading");
    }
  }

  function scheduleRefresh() {
    const run = () => refresh(false);
    if ("requestIdleCallback" in root) root.requestIdleCallback(run, { timeout: 1200 });
    else root.setTimeout(run, 80);
  }

  function init() {
    ensureHome();
    installHeader();
    installNav();
    setView("home");
    if (readCache()) render();
    else render();
    scheduleRefresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
