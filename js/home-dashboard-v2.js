(function (root) {
  "use strict";

  const API_ROOT = "https://chappy-boatrace-api.vercel.app/api";
  const SUMMARY_ROOT = "data/predictions/summaries";
  const VENUE_TYPES = {
    morning: new Set(["三国", "鳴門", "徳山", "芦屋", "唐津", "大村"]),
    night: new Set(["桐生", "蒲郡", "住之江", "丸亀", "下関", "若松"])
  };
  const state = {
    filter: "all",
    schedule: [],
    recommendations: [],
    expanded: new Set(),
    selectedPlace: "",
    selectedRace: 0,
    loading: false,
    message: "場とレースを選んでください"
  };

  function jstDate(now = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(now).replaceAll("-", "");
  }

  function esc(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
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
    if (minutes === null) return "is-unknown";
    if (minutes <= 2) return "is-deadline-red";
    if (minutes <= 5) return "is-deadline-orange";
    if (minutes <= 10) return "is-deadline-yellow";
    return "is-deadline-green";
  }

  function venueType(place) {
    if (VENUE_TYPES.morning.has(place)) return "morning";
    if (VENUE_TYPES.night.has(place)) return "night";
    return "day";
  }

  function typeLabel(type) {
    return type === "morning" ? "モーニング" : type === "night" ? "ナイター" : "デイ";
  }

  function racesOf(venue) {
    const rows = Array.isArray(venue?.races) ? venue.races : [];
    if (rows.length) {
      return rows.map(row => ({
        raceNo: number(row?.raceNo ?? row?.rno),
        deadlineAt: row?.deadlineAt || row?.deadline || row?.closeAt || "",
        selectable: row?.selectable !== false && row?.closed !== true,
        closed: row?.closed === true || row?.selectable === false
      })).filter(row => row.raceNo >= 1 && row.raceNo <= 12)
        .sort((a, b) => a.raceNo - b.raceNo);
    }
    const current = number(venue?.currentRaceNo || venue?.nextRaceNo);
    return current ? [{ raceNo: current, deadlineAt: venue?.deadlineAt || "", selectable: venue?.selectable !== false }] : [];
  }

  function decisionFor(item) {
    const type = String(item?.type || item?.scoreType || "");
    const score = number(item?.score);
    const honmei = number(item?.evaluation?.honmei?.score);
    const manshu = number(item?.evaluation?.manshu?.score);
    if (/波乱|万舟/.test(type) || manshu >= Math.max(65, honmei + 8)) return { key: "upset", label: "波乱狙い", score: manshu || score };
    if (score < 60 && honmei < 60) return { key: "skip", label: "見送り推奨", score: Math.max(score, honmei) };
    return { key: "main", label: "本命勝負", score: honmei || score };
  }

  function recommendationReason(item, decision) {
    const source = decision.key === "upset" ? item?.evaluation?.manshu?.reasons : item?.evaluation?.honmei?.reasons;
    return Array.isArray(source) && source.length ? String(source[0])
      : decision.key === "skip" ? "成立度が基準に届かず慎重判断"
      : decision.key === "upset" ? "本線以外の展開余地を評価" : "最有力展開の成立度を評価";
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadSchedule() {
    const data = await fetchJson(`${API_ROOT}/schedule?date=${encodeURIComponent(jstDate())}`);
    state.schedule = Array.isArray(data?.venues) ? data.venues : [];
  }

  async function loadRecommendations() {
    try {
      const data = await fetchJson(`${SUMMARY_ROOT}/${jstDate()}.json?t=${Date.now()}`);
      const run = [...(Array.isArray(data?.runs) ? data.runs : [])]
        .sort((a, b) => Date.parse(b?.checkedAt || 0) - Date.parse(a?.checkedAt || 0))[0];
      state.recommendations = (Array.isArray(run?.compared) ? run.compared : [])
        .map(item => ({ ...item, decision: decisionFor(item) }))
        .filter(item => item?.place && number(item?.raceNo) > 0)
        .sort((a, b) => number(b?.decision?.score) - number(a?.decision?.score)).slice(0, 5);
    } catch (error) {
      state.recommendations = [];
      console.warn("ホームおすすめ取得エラー", error);
    }
  }

  function waitForRaceOption(select, value, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const found = [...(select?.options || [])].some(option => option.value === value);
        if (found) return resolve(true);
        if (Date.now() - started >= timeout) return reject(new Error("選択したレース情報を取得できませんでした"));
        window.setTimeout(check, 100);
      };
      check();
    });
  }

  async function syncAndOpen(place, raceNo) {
    if (state.loading) return;
    const raceValue = `${number(raceNo)}R`;
    const mode = document.getElementById("raceModeSelect");
    const placeSelect = document.getElementById("placeSelect");
    const raceSelect = document.getElementById("raceSelect");
    const fetchButton = document.getElementById("fetchRaceBtn");
    if (!placeSelect || !raceSelect || !fetchButton) return;

    state.loading = true;
    state.selectedPlace = place;
    state.selectedRace = number(raceNo);
    state.message = `${place} ${raceValue} の出走表・展示・オッズ・AI予想を取得中`;
    render();

    try {
      if (mode) mode.value = "live";
      placeSelect.value = place;
      placeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForRaceOption(raceSelect, raceValue);
      raceSelect.value = raceValue;
      raceSelect.dispatchEvent(new Event("change", { bubbles: true }));
      fetchButton.click();
      state.message = `${place} ${raceValue} を選択しました。オッズを含む最新情報を自動取得しています`;
      document.getElementById("predictionSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      state.message = error?.message || "レース選択に失敗しました";
      console.error("ホームレース選択エラー", error);
    } finally {
      state.loading = false;
      render();
    }
  }

  function recommendationHtml(item, index) {
    const decision = item.decision || decisionFor(item);
    const honmei = number(item?.evaluation?.honmei?.score);
    const manshu = number(item?.evaluation?.manshu?.score);
    return `<button class="home-v2-recommend-card is-${decision.key}" type="button" data-place="${esc(item.place)}" data-race="${number(item.raceNo)}">
      <span class="home-v2-rank">${index + 1}</span><span class="home-v2-decision">${esc(decision.label)}</span>
      <strong>${esc(item.place)} ${number(item.raceNo)}R</strong>
      <span class="home-v2-score-row"><span>本線 <b>${Math.round(honmei || number(item.score))}</b>点</span><span>波乱 <b>${Math.round(manshu)}</b>点</span></span>
      <small>${esc(recommendationReason(item, decision))}</small></button>`;
  }

  function raceButtonHtml(place, race) {
    const deadline = race?.deadlineAt || "";
    const selected = state.selectedPlace === place && state.selectedRace === number(race.raceNo);
    return `<button class="home-v2-race ${deadlineClass(deadline)} ${selected ? "is-selected" : ""} ${race.closed ? "is-closed" : ""}" type="button"
      data-place="${esc(place)}" data-race="${number(race.raceNo)}" ${race.selectable === false ? "disabled" : ""}>
      <strong>${number(race.raceNo)}R</strong><span>${esc(timeOf(deadline))}</span>${race.closed ? "<small>終了</small>" : ""}</button>`;
  }

  function venueHtml(venue) {
    const place = String(venue?.place || "");
    const type = venueType(place);
    const races = racesOf(venue);
    const expanded = state.expanded.has(place);
    const upcoming = races.filter(row => row.selectable !== false);
    const visible = expanded ? races : upcoming.slice(0, 4);
    return `<article class="home-v2-venue ${expanded ? "is-expanded" : ""}" data-type="${type}">
      <button class="home-v2-venue-head" type="button" data-expand="${esc(place)}" aria-expanded="${expanded}">
        <div><strong>${esc(place)}</strong><span>${typeLabel(type)}</span></div><span class="home-v2-expand-label">${expanded ? "閉じる" : "1R〜12R"}⌄</span>
      </button>
      <div class="home-v2-races">${visible.length ? visible.map(race => raceButtonHtml(place, race)).join("") : '<span class="home-v2-no-race">締切前レースなし</span>'}</div>
    </article>`;
  }

  function filteredVenues() {
    return state.schedule.filter(venue => {
      const place = String(venue?.place || "");
      const hasRace = racesOf(venue).some(row => row.selectable !== false);
      return hasRace && (state.filter === "all" || venueType(place) === state.filter);
    });
  }

  function render() {
    const el = document.getElementById("homeDashboardV2");
    if (!el) return;
    const recommendations = state.recommendations.length ? state.recommendations.map(recommendationHtml).join("") : '<p class="home-v2-empty">本日のおすすめ判定を準備しています</p>';
    const venues = filteredVenues();
    el.innerHTML = `<section class="home-v2-recommend">
      <div class="home-v2-title-row"><div><p>TODAY'S PICKS</p><h2>🔥 今日のおすすめレース</h2></div><button id="homeV2Refresh" type="button">更新</button></div>
      <div class="home-v2-recommend-list">${recommendations}</div><p class="home-v2-note">条件を満たすレースだけを表示します。無理に件数を増やしません。</p>
    </section>
    <section class="home-v2-schedule">
      <div class="home-v2-title-row"><div><p>TODAY'S RACES</p><h2>🚩 本日の開催</h2></div><span>${venues.length}場</span></div>
      <div class="home-v2-selection-status ${state.loading ? "is-loading" : ""}" aria-live="polite"><strong>${state.loading ? "取得中" : state.selectedPlace ? `${esc(state.selectedPlace)} ${state.selectedRace}R` : "レース未選択"}</strong><span>${esc(state.message)}</span></div>
      <div class="home-v2-filters" role="tablist">${[["all","全場"],["morning","モーニング"],["day","デイ"],["night","ナイター"]].map(([key,label]) => `<button type="button" data-filter="${key}" class="${state.filter === key ? "is-active" : ""}">${label}</button>`).join("")}</div>
      <div class="home-v2-legend"><span class="is-deadline-green">20分超</span><span class="is-deadline-yellow">10分以内</span><span class="is-deadline-orange">5分以内</span><span class="is-deadline-red">2分以内</span></div>
      <div class="home-v2-venue-list">${venues.length ? venues.map(venueHtml).join("") : '<p class="home-v2-empty">該当する締切前レースがありません</p>'}</div>
    </section>`;
    bind(el);
  }

  function bind(el) {
    el.querySelectorAll("[data-place][data-race]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      syncAndOpen(button.dataset.place, button.dataset.race);
    }));
    el.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => { state.filter = button.dataset.filter || "all"; render(); }));
    el.querySelectorAll("[data-expand]").forEach(button => button.addEventListener("click", () => {
      const place = button.dataset.expand;
      state.expanded.has(place) ? state.expanded.delete(place) : state.expanded.add(place);
      render();
    }));
    document.getElementById("homeV2Refresh")?.addEventListener("click", refresh);
  }

  function ensureStyle() {
    if (document.getElementById("homeV2Phase2Style")) return;
    const style = document.createElement("style");
    style.id = "homeV2Phase2Style";
    style.textContent = `.home-v2-selection-status{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:10px 0 12px;padding:11px 13px;border-radius:13px;background:#eef6ff;border:1px solid #cfe2fb;font-size:.82rem}.home-v2-selection-status strong{color:#086fdd;white-space:nowrap}.home-v2-selection-status span{color:#53657b;text-align:right}.home-v2-selection-status.is-loading{animation:homeV2Pulse 1.2s infinite}.home-v2-venue-head{width:100%;border:0;background:transparent;display:flex;justify-content:space-between;align-items:center;padding:0;text-align:left;color:inherit}.home-v2-expand-label{font-size:.75rem;color:#0878f9;font-weight:800}.home-v2-race.is-selected{box-shadow:0 0 0 3px rgba(8,120,249,.18);border-color:#0878f9!important}.home-v2-race.is-closed{opacity:.42}.home-v2-race small{font-size:.65rem;color:#7b8794}@keyframes homeV2Pulse{50%{opacity:.58}}@media(max-width:640px){.home-v2-selection-status{align-items:flex-start;flex-direction:column}.home-v2-selection-status span{text-align:left}}`;
    document.head.appendChild(style);
  }

  function ensureMount() {
    ensureStyle();
    if (document.getElementById("homeDashboardV2")) return;
    const main = document.querySelector("main.dashboard-app");
    const race = document.getElementById("raceSection");
    if (!main || !race) return;
    const section = document.createElement("section");
    section.id = "homeDashboardV2";
    section.className = "dashboard-section home-dashboard-v2";
    section.innerHTML = '<p class="home-v2-empty">ホーム画面を準備しています…</p>';
    main.insertBefore(section, race);
  }

  async function refresh() {
    ensureMount();
    const el = document.getElementById("homeDashboardV2");
    if (el) el.innerHTML = '<p class="home-v2-empty">公式開催情報とおすすめを更新しています…</p>';
    await Promise.allSettled([loadSchedule(), loadRecommendations()]);
    render();
  }

  document.addEventListener("DOMContentLoaded", refresh);
  root.ChappyHomeDashboardV2 = Object.freeze({ refresh, syncAndOpen });
})(window);

(function (root) {
  "use strict";

  const NAV_ITEMS = [
    { key: "main", label: "本命", patterns: [/本命/, /本線/] },
    { key: "upset", label: "万舟", patterns: [/万舟/, /波乱/] },
    { key: "tickets", label: "買い目", patterns: [/買い目一覧/, /買い目ランキング/, /AI買い目/] },
    { key: "reason", label: "AI根拠", patterns: [/AI総合/, /AI評価/, /展開AI/, /見送りAI/] },
    { key: "practical", label: "実戦厳選", patterns: [/実戦厳選/] }
  ];

  let observer = null;
  let mutationObserver = null;
  let scheduled = false;

  function ensurePhase4Style() {
    if (document.getElementById("predictionPhase4Style")) return;
    const style = document.createElement("style");
    style.id = "predictionPhase4Style";
    style.textContent = `
      .prediction-phase4-nav{position:sticky;top:0;z-index:45;display:flex;gap:7px;overflow-x:auto;padding:9px 8px;margin:0 0 14px;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border:1px solid #dce7f3;border-radius:14px;box-shadow:0 7px 18px rgba(17,52,88,.09);scrollbar-width:none}
      .prediction-phase4-nav::-webkit-scrollbar{display:none}
      .prediction-phase4-nav button{flex:0 0 auto;border:1px solid #cedceb;background:#fff;color:#38536f;border-radius:999px;padding:9px 13px;font-size:.78rem;font-weight:800;white-space:nowrap}
      .prediction-phase4-nav button.is-active{background:#0878f9;border-color:#0878f9;color:#fff;box-shadow:0 5px 12px rgba(8,120,249,.22)}
      .prediction-phase4-target{scroll-margin-top:72px}
      .prediction-phase4-reason-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;border:0;background:transparent;padding:0;color:inherit;text-align:left;font:inherit}
      .prediction-phase4-reason-toggle::after{content:"⌄";font-size:1rem;color:#0878f9;transition:transform .2s ease}
      .prediction-phase4-reason-toggle[aria-expanded="true"]::after{transform:rotate(180deg)}
      .prediction-phase4-collapsible>.v3-section-body{display:none}
      .prediction-phase4-collapsible.is-open>.v3-section-body{display:block}
      .prediction-phase4-ticket-space .ticket-row,.prediction-phase4-ticket-space .v3-ticket-row{margin-bottom:10px}
      @media(max-width:640px){.prediction-phase4-nav{top:0;border-radius:12px;margin-left:-4px;margin-right:-4px}.prediction-phase4-nav button{padding:9px 12px;font-size:.76rem}.prediction-phase4-target{scroll-margin-top:66px}}
    `;
    document.head.appendChild(style);
  }

  function normalizeTitle(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function locateSections(rootElement) {
    const sections = [...rootElement.querySelectorAll(".v3-section")];
    const used = new Set();
    return NAV_ITEMS.map(item => {
      const section = sections.find(candidate => {
        if (used.has(candidate)) return false;
        const title = normalizeTitle(candidate.querySelector(".v3-section-head h2")?.textContent);
        return item.patterns.some(pattern => pattern.test(title));
      });
      if (section) used.add(section);
      return { ...item, section: section || null };
    }).filter(item => item.section);
  }

  function setupReasonCollapse(item) {
    if (item.key !== "reason") return;
    const section = item.section;
    const heading = section.querySelector(".v3-section-head h2");
    const body = section.querySelector(":scope > .v3-section-body");
    if (!heading || !body || section.dataset.phase4CollapseReady === "true") return;
    section.dataset.phase4CollapseReady = "true";
    section.classList.add("prediction-phase4-collapsible");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "prediction-phase4-reason-toggle";
    button.setAttribute("aria-expanded", "false");
    while (heading.firstChild) button.appendChild(heading.firstChild);
    heading.appendChild(button);
    button.addEventListener("click", () => {
      const open = !section.classList.contains("is-open");
      section.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
    });
  }

  function mountNavigation() {
    const result = document.getElementById("resultArea");
    const rootElement = result?.querySelector(".v3-root");
    if (!result || !rootElement) return;

    const items = locateSections(rootElement);
    if (!items.length) return;

    result.querySelector(".prediction-phase4-nav")?.remove();
    observer?.disconnect();

    const nav = document.createElement("nav");
    nav.className = "prediction-phase4-nav";
    nav.setAttribute("aria-label", "AI予想内ナビゲーション");

    items.forEach((item, index) => {
      item.section.id = `predictionPhase4-${item.key}`;
      item.section.classList.add("prediction-phase4-target");
      if (item.key === "tickets") item.section.classList.add("prediction-phase4-ticket-space");
      setupReasonCollapse(item);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.dataset.target = item.section.id;
      if (index === 0) button.classList.add("is-active");
      button.addEventListener("click", () => {
        item.section.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.appendChild(button);
    });

    rootElement.insertBefore(nav, rootElement.firstChild);

    observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      nav.querySelectorAll("button").forEach(button => {
        button.classList.toggle("is-active", button.dataset.target === visible.target.id);
      });
    }, { rootMargin: "-72px 0px -55% 0px", threshold: [0.05, 0.25, 0.5] });

    items.forEach(item => observer.observe(item.section));
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      mountNavigation();
    });
  }

  function start() {
    ensurePhase4Style();
    const result = document.getElementById("resultArea");
    if (!result) return;
    mutationObserver?.disconnect();
    mutationObserver = new MutationObserver(scheduleMount);
    mutationObserver.observe(result, { childList: true, subtree: false });
    scheduleMount();
  }

  document.addEventListener("DOMContentLoaded", start);
  root.ChappyPredictionPhase4 = Object.freeze({ refresh: scheduleMount });
})(window);
