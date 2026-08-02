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
    expanded: new Set()
  };

  function jstDate(now = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now).replaceAll("-", "");
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }
    const match = String(value).match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "--:--";
  }

  function minutesUntil(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? Math.floor((date.getTime() - Date.now()) / 60000)
      : null;
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
        selectable: row?.selectable !== false && row?.closed !== true
      })).filter(row => row.raceNo >= 1 && row.raceNo <= 12);
    }
    const current = number(venue?.currentRaceNo || venue?.nextRaceNo);
    return current ? [{
      raceNo: current,
      deadlineAt: venue?.deadlineAt || "",
      selectable: venue?.selectable !== false
    }] : [];
  }

  function decisionFor(item) {
    const type = String(item?.type || item?.scoreType || "");
    const score = number(item?.score);
    const honmei = number(item?.evaluation?.honmei?.score);
    const manshu = number(item?.evaluation?.manshu?.score);
    if (/波乱|万舟/.test(type) || manshu >= Math.max(65, honmei + 8)) {
      return { key: "upset", label: "波乱狙い", score: manshu || score };
    }
    if (score < 60 && honmei < 60) {
      return { key: "skip", label: "見送り推奨", score: Math.max(score, honmei) };
    }
    return { key: "main", label: "本命勝負", score: honmei || score };
  }

  function recommendationReason(item, decision) {
    const source = decision.key === "upset"
      ? item?.evaluation?.manshu?.reasons
      : item?.evaluation?.honmei?.reasons;
    return Array.isArray(source) && source.length
      ? String(source[0])
      : decision.key === "skip"
        ? "成立度が基準に届かず慎重判断"
        : decision.key === "upset"
          ? "本線以外の展開余地を評価"
          : "最有力展開の成立度を評価";
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadSchedule() {
    const date = jstDate();
    const data = await fetchJson(`${API_ROOT}/schedule?date=${encodeURIComponent(date)}`);
    state.schedule = Array.isArray(data?.venues) ? data.venues : [];
  }

  async function loadRecommendations() {
    const date = jstDate();
    try {
      const data = await fetchJson(`${SUMMARY_ROOT}/${date}.json?t=${Date.now()}`);
      const run = [...(Array.isArray(data?.runs) ? data.runs : [])]
        .sort((a, b) => Date.parse(b?.checkedAt || 0) - Date.parse(a?.checkedAt || 0))[0];
      const compared = Array.isArray(run?.compared) ? run.compared : [];
      state.recommendations = compared
        .map(item => ({ ...item, decision: decisionFor(item) }))
        .filter(item => item?.place && number(item?.raceNo) > 0)
        .sort((a, b) => number(b?.decision?.score) - number(a?.decision?.score))
        .slice(0, 5);
    } catch (error) {
      state.recommendations = [];
      console.warn("ホームおすすめ取得エラー", error);
    }
  }

  function syncAndOpen(place, raceNo) {
    const mode = document.getElementById("raceModeSelect");
    const placeSelect = document.getElementById("placeSelect");
    const raceSelect = document.getElementById("raceSelect");
    const fetchButton = document.getElementById("fetchRaceBtn");
    if (mode) mode.value = "live";
    if (placeSelect) {
      placeSelect.value = place;
      placeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const applyRace = () => {
      if (raceSelect) {
        raceSelect.value = `${number(raceNo)}R`;
        raceSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      fetchButton?.click();
      document.getElementById("predictionSection")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    };
    window.setTimeout(applyRace, 450);
  }

  function recommendationHtml(item, index) {
    const decision = item.decision || decisionFor(item);
    const honmei = number(item?.evaluation?.honmei?.score);
    const manshu = number(item?.evaluation?.manshu?.score);
    return `
      <button class="home-v2-recommend-card is-${decision.key}" type="button"
        data-place="${esc(item.place)}" data-race="${number(item.raceNo)}">
        <span class="home-v2-rank">${index + 1}</span>
        <span class="home-v2-decision">${esc(decision.label)}</span>
        <strong>${esc(item.place)} ${number(item.raceNo)}R</strong>
        <span class="home-v2-score-row">
          <span>本線 <b>${Math.round(honmei || number(item.score))}</b>点</span>
          <span>波乱 <b>${Math.round(manshu)}</b>点</span>
        </span>
        <small>${esc(recommendationReason(item, decision))}</small>
      </button>`;
  }

  function raceButtonHtml(place, race) {
    const deadline = race?.deadlineAt || "";
    return `
      <button class="home-v2-race ${deadlineClass(deadline)}" type="button"
        data-place="${esc(place)}" data-race="${number(race.raceNo)}"
        ${race.selectable === false ? "disabled" : ""}>
        <strong>${number(race.raceNo)}R</strong>
        <span>${esc(timeOf(deadline))}</span>
      </button>`;
  }

  function venueHtml(venue) {
    const place = String(venue?.place || "");
    const type = venueType(place);
    const races = racesOf(venue).filter(row => row.selectable !== false);
    const expanded = state.expanded.has(place);
    const visible = expanded ? races : races.slice(0, 4);
    return `
      <article class="home-v2-venue" data-type="${type}">
        <div class="home-v2-venue-head">
          <div><strong>${esc(place)}</strong><span>${typeLabel(type)}</span></div>
          <button class="home-v2-expand" type="button" data-expand="${esc(place)}">
            ${expanded ? "閉じる" : "全レース"}
          </button>
        </div>
        <div class="home-v2-races">
          ${visible.length
            ? visible.map(race => raceButtonHtml(place, race)).join("")
            : '<span class="home-v2-no-race">締切前レースなし</span>'}
        </div>
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
    const rootElement = document.getElementById("homeDashboardV2");
    if (!rootElement) return;
    const recommendations = state.recommendations.length
      ? state.recommendations.map(recommendationHtml).join("")
      : '<p class="home-v2-empty">本日のおすすめ判定を準備しています</p>';
    const venues = filteredVenues();
    rootElement.innerHTML = `
      <section class="home-v2-recommend">
        <div class="home-v2-title-row">
          <div><p>TODAY'S PICKS</p><h2>🔥 今日のおすすめレース</h2></div>
          <button id="homeV2Refresh" type="button">更新</button>
        </div>
        <div class="home-v2-recommend-list">${recommendations}</div>
        <p class="home-v2-note">条件を満たすレースだけを表示します。無理に件数を増やしません。</p>
      </section>
      <section class="home-v2-schedule">
        <div class="home-v2-title-row"><div><p>TODAY'S RACES</p><h2>🚩 本日の開催</h2></div><span>${venues.length}場</span></div>
        <div class="home-v2-filters" role="tablist">
          ${[
            ["all", "全場"], ["morning", "モーニング"], ["day", "デイ"], ["night", "ナイター"]
          ].map(([key, label]) => `<button type="button" data-filter="${key}" class="${state.filter === key ? "is-active" : ""}">${label}</button>`).join("")}
        </div>
        <div class="home-v2-legend"><span class="is-deadline-green">20分超</span><span class="is-deadline-yellow">10分以内</span><span class="is-deadline-orange">5分以内</span><span class="is-deadline-red">2分以内</span></div>
        <div class="home-v2-venue-list">${venues.length ? venues.map(venueHtml).join("") : '<p class="home-v2-empty">該当する締切前レースがありません</p>'}</div>
      </section>`;
    bind(rootElement);
  }

  function bind(rootElement) {
    rootElement.querySelectorAll("[data-place][data-race]").forEach(button => {
      button.addEventListener("click", () => syncAndOpen(
        button.dataset.place,
        button.dataset.race
      ));
    });
    rootElement.querySelectorAll("[data-filter]").forEach(button => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter || "all";
        render();
      });
    });
    rootElement.querySelectorAll("[data-expand]").forEach(button => {
      button.addEventListener("click", () => {
        const place = button.dataset.expand;
        state.expanded.has(place) ? state.expanded.delete(place) : state.expanded.add(place);
        render();
      });
    });
    document.getElementById("homeV2Refresh")?.addEventListener("click", refresh);
  }

  function ensureMount() {
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
    const rootElement = document.getElementById("homeDashboardV2");
    if (rootElement) rootElement.innerHTML = '<p class="home-v2-empty">公式開催情報とおすすめを更新しています…</p>';
    await Promise.allSettled([loadSchedule(), loadRecommendations()]);
    render();
  }

  document.addEventListener("DOMContentLoaded", refresh);
  root.ChappyHomeDashboardV2 = Object.freeze({ refresh, syncAndOpen });
})(window);
