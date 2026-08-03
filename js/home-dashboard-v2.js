(function (root) {
  "use strict";

  const API_ROOT = "https://chappy-boatrace-api.vercel.app/api";
  const SUMMARY_ROOT = "data/predictions/summaries";
  const CACHE_KEY = "chappy-home-v2-cache";
  const CACHE_TTL = 300000;
  const PAGE_SIZE = 5;
  const TYPES = {
    morning: new Set(["三国", "鳴門", "徳山", "芦屋", "唐津", "大村"]),
    night: new Set(["桐生", "蒲郡", "住之江", "丸亀", "下関", "若松"])
  };
  const state = {
    filter: "all",
    scheduleDate: "",
    schedule: [],
    recommendations: [],
    visibleCount: PAGE_SIZE,
    selectedPlace: "",
    selectedRace: 0,
    loading: false,
    pendingSelection: null,
    selectionPromise: null,
    updatedAt: null,
    bound: false,
    refreshPromise: null,
    requestMap: new Map(),
    renderKeys: { recommendations: "", schedule: "", updatedAt: "" }
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const stable = value => JSON.stringify(value || null);

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
      const raw = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(CACHE_KEY) || "null";
      const cached = JSON.parse(raw);
      if (!cached || Date.now() - Number(cached.savedAt || 0) > CACHE_TTL) return false;
      state.schedule = Array.isArray(cached.schedule) ? cached.schedule : [];
      state.scheduleDate = /^\d{8}$/.test(String(cached.scheduleDate || ""))
        ? String(cached.scheduleDate)
        : jstDate();
      state.recommendations = Array.isArray(cached.recommendations) ? cached.recommendations : [];
      state.updatedAt = cached.updatedAt ? new Date(cached.updatedAt) : new Date(cached.savedAt);
      return state.schedule.length > 0 || state.recommendations.length > 0;
    } catch (_) {
      return false;
    }
  }

  function writeCache() {
    try {
      const payload = JSON.stringify({
        savedAt: Date.now(),
        updatedAt: state.updatedAt?.toISOString() || null,
        scheduleDate: state.scheduleDate || jstDate(),
        schedule: state.schedule,
        recommendations: state.recommendations
      });
      sessionStorage.setItem(CACHE_KEY, payload);
      localStorage.setItem(CACHE_KEY, payload);
    } catch (_) {}
  }

  function getJson(url, force = false) {
    const key = `${force ? "reload:" : "default:"}${url}`;
    if (state.requestMap.has(key)) return state.requestMap.get(key);
    const request = fetch(url, { cache: force ? "reload" : "default" })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .finally(() => state.requestMap.delete(key));
    state.requestMap.set(key, request);
    return request;
  }

  async function loadSchedule(force = false) {
    const data = await getJson(`${API_ROOT}/schedule?date=${encodeURIComponent(jstDate())}`, force);
    const next = Array.isArray(data?.venues) ? data.venues : [];
    const changed = stable(next) !== stable(state.schedule);
    state.scheduleDate = /^\d{8}$/.test(String(data?.date || ""))
      ? String(data.date)
      : jstDate();
    state.schedule = next;
    root.dispatchEvent(new CustomEvent("chappy:home-schedule", {
      detail: {
        date: state.scheduleDate,
        venues: next,
        force
      }
    }));
    return changed;
  }

  async function loadRecommendations(force = false) {
    try {
      const suffix = force ? `?t=${Date.now()}` : "";
      const data = await getJson(`${SUMMARY_ROOT}/${jstDate()}.json${suffix}`, force);
      const run = [...(Array.isArray(data?.runs) ? data.runs : [])]
        .sort((a, b) => Date.parse(b?.checkedAt || 0) - Date.parse(a?.checkedAt || 0))[0];
      const next = (Array.isArray(run?.compared) ? run.compared : [])
        .map(item => ({ ...item, decision: decisionFor(item) }))
        .filter(item => item?.place && num(item?.raceNo) > 0)
        .sort((a, b) => num(b?.decision?.score) - num(a?.decision?.score))
        .slice(0, 3);
      const changed = stable(next) !== stable(state.recommendations);
      state.recommendations = next;
      return changed;
    } catch (error) {
      console.warn("ホームおすすめ取得エラー", error);
      return false;
    }
  }

  async function performSyncAndOpen(place, raceNo) {
      await root.ChappyAppRuntime?.ensure?.("race");
      root.ChappyStartupGate?.activateRace?.();
      const fetchButton = document.getElementById("fetchRaceBtn");
      if (!fetchButton || typeof root.ChappyRaceSelection?.select !== "function") return;

      await root.ChappyRaceSelection.select({
        mode: "live",
        date: state.scheduleDate || jstDate(),
        place,
        raceNo: num(raceNo)
      });
      state.selectedPlace = place;
      state.selectedRace = num(raceNo);
      updateSelectedRace();
      fetchButton.click();
      setView("prediction");
      document.getElementById("predictionSection")?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function syncAndOpen(place, raceNo) {
    state.pendingSelection = { place, raceNo: num(raceNo) };
    if (state.selectionPromise) return state.selectionPromise;
    state.loading = true;

    state.selectionPromise = (async () => {
      while (state.pendingSelection) {
        const intent = state.pendingSelection;
        state.pendingSelection = null;
        try {
          await performSyncAndOpen(intent.place, intent.raceNo);
        } catch (error) {
          if (!state.pendingSelection) throw error;
        }
      }
    })().catch(error => {
      console.error("ホームレース選択エラー", error);
    }).finally(() => {
      state.loading = false;
      state.selectionPromise = null;
    });

    return state.selectionPromise;
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
    return `<article class="home-v2-venue" data-venue="${esc(place)}"><div class="home-v2-venue-info"><strong>${esc(place)} <span>≋</span></strong><small>${typeLabel(type)}</small></div><div class="home-v2-races">${rows.length ? rows.map(row => raceHtml(place, row)).join("") : '<span class="home-v2-no-race">1R〜12Rを読込中</span>'}</div><button class="home-v2-venue-next" type="button" data-open-venue="${esc(place)}">›</button></article>`;
  }

  function filteredVenues() {
    return state.schedule.filter(venue => {
      const place = String(venue?.place || "");
      return state.filter === "all" || venueType(place) === state.filter;
    });
  }

  function ensureShell() {
    const el = ensureHome();
    if (el.dataset.shellReady === "true") return el;
    el.innerHTML = `<section class="home-v2-recommend"><div class="home-v2-title-row"><h2>TODAY'S PICKS　🔥 今日のおすすめレース</h2><span data-home-updated>最終更新 --:--</span></div><div class="home-v2-recommend-list" data-home-recommendations></div></section><section class="home-v2-filter-shell"><div class="home-v2-filters">${[["all","🌐 全場"],["morning","☀️ モーニング"],["day","☀️ デイ"],["night","🌙 ナイター"]].map(([key,label]) => `<button type="button" data-filter="${key}" class="${state.filter === key ? "is-active" : ""}">${label}</button>`).join("")}</div></section><section class="home-v2-schedule"><div class="home-v2-title-row home-v2-schedule-title"><h2>⚑ 開催場一覧</h2><div class="home-v2-legend"><span class="is-main">勝負</span><span class="is-upset">波乱</span><span class="is-skip">見送り</span><span class="is-before">展示前</span></div></div><div class="home-v2-venue-list" data-home-venues></div><button class="home-v2-more" type="button" data-show-all hidden></button></section>`;
    el.dataset.shellReady = "true";
    return el;
  }

  function renderRecommendations(force = false) {
    const el = ensureShell().querySelector("[data-home-recommendations]");
    if (!el) return;
    const key = stable(state.recommendations);
    if (!force && key === state.renderKeys.recommendations) return;
    state.renderKeys.recommendations = key;
    el.innerHTML = state.recommendations.length
      ? state.recommendations.map(recommendationHtml).join("")
      : '<p class="home-v2-empty">本日のおすすめ判定を準備しています</p>';
  }

  function renderSchedule(force = false) {
    const shell = ensureShell();
    const list = shell.querySelector("[data-home-venues]");
    const more = shell.querySelector("[data-show-all]");
    const venues = filteredVenues();
    const shown = venues.slice(0, state.visibleCount);
    const key = `${state.filter}:${state.visibleCount}:${stable(shown)}`;
    if (list && (force || key !== state.renderKeys.schedule)) {
      state.renderKeys.schedule = key;
      list.innerHTML = shown.length ? shown.map(venueHtml).join("") : '<p class="home-v2-empty">該当する締切前レースがありません</p>';
    }
    shell.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("is-active", button.dataset.filter === state.filter));
    if (more) {
      const remains = venues.length - shown.length;
      more.hidden = remains <= 0;
      more.textContent = remains > 0 ? `他の場を見る（残り${remains}場）⌄` : "";
    }
  }

  function renderUpdatedAt() {
    const text = `最終更新 ${state.updatedAt ? timeOf(state.updatedAt) : "--:--"}`;
    if (text === state.renderKeys.updatedAt) return;
    state.renderKeys.updatedAt = text;
    const el = ensureShell().querySelector("[data-home-updated]");
    if (el) el.textContent = text;
  }

  function render(force = false) {
    renderRecommendations(force);
    renderSchedule(force);
    renderUpdatedAt();
  }

  function updateSelectedRace() {
    document.querySelectorAll(".home-v2-race.is-selected").forEach(el => el.classList.remove("is-selected"));
    if (!state.selectedPlace || !state.selectedRace) return;
    document.querySelector(`.home-v2-race[data-place="${CSS.escape(state.selectedPlace)}"][data-race="${state.selectedRace}"]`)?.classList.add("is-selected");
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
        state.visibleCount = PAGE_SIZE;
        renderSchedule(true);
        return;
      }
      if (target.matches("[data-show-all]")) {
        state.visibleCount += PAGE_SIZE;
        renderSchedule(true);
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
    if (!header || header.dataset.homeReady === "true") return;
    header.dataset.homeReady = "true";
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
    if (!nav || nav.dataset.homeReady === "true") return;
    nav.dataset.homeReady = "true";
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

  function refresh(force = false) {
    if (state.refreshPromise && !force) return state.refreshPromise;
    const el = ensureHome();
    if (force) el.classList.add("is-loading");
    const scheduleTask = loadSchedule(force).then(changed => { if (changed) renderSchedule(); return changed; });
    const recommendationTask = loadRecommendations(force).then(changed => { if (changed) renderRecommendations(); return changed; });
    state.refreshPromise = Promise.allSettled([scheduleTask, recommendationTask])
      .then(() => {
        state.updatedAt = new Date();
        writeCache();
        renderUpdatedAt();
      })
      .finally(() => {
        state.refreshPromise = null;
        el.classList.remove("is-loading");
      });
    return state.refreshPromise;
  }

  function scheduleRefresh() {
    const run = () => refresh(false);
    if ("requestIdleCallback" in root) root.requestIdleCallback(run, { timeout: 1500 });
    else root.setTimeout(run, 120);
  }

  function init() {
    ensureShell();
    installHeader();
    installNav();
    setView("home");
    readCache();
    render(true);
    scheduleRefresh();
  }

  root.ChappyHomeDashboardV2 = Object.freeze({
    refresh,
    setView,
    getSchedule: () => state.schedule.slice(),
    getDate: () => state.scheduleDate || jstDate()
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
