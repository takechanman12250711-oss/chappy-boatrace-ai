(function (root) {
  "use strict";

  if (root.ChappyTodayResultsHome) return;

  const API_ROOT = "https://chappy-boatrace-api.vercel.app/api";
  const MAX_RESULTS = 12;

  function jstDate() {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date()).replaceAll("-", "");
  }

  function numberOf(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
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

  function isFinished(race) {
    if (!race) return false;
    if (race.finished === true || race.ended === true || race.closed === true) return true;
    if (race.selectable === false && race.cancelled !== true) return true;
    const value = race.deadlineAt || race.deadline || race.closeAt || "";
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp < Date.now();
  }

  function resultText(race) {
    const result = race?.result || race?.officialResult || race?.finish || null;
    const order = result?.order || result?.trifecta || result?.combination || race?.trifecta || race?.combination;
    if (Array.isArray(order)) return order.slice(0, 3).join("-");
    if (typeof order === "string" && order.trim()) return order.trim();
    return "結果を見る";
  }

  function collectFinished(venues) {
    const rows = [];
    (Array.isArray(venues) ? venues : []).forEach(venue => {
      const place = String(venue?.place || venue?.name || "").trim();
      (Array.isArray(venue?.races) ? venue.races : []).forEach(race => {
        const raceNo = numberOf(race?.raceNo ?? race?.rno);
        if (!place || raceNo < 1 || raceNo > 12 || !isFinished(race)) return;
        rows.push({
          place,
          raceNo,
          deadlineAt: race?.deadlineAt || race?.deadline || race?.closeAt || "",
          result: resultText(race)
        });
      });
    });
    return rows
      .sort((a, b) => {
        const timeDiff = Date.parse(b.deadlineAt || 0) - Date.parse(a.deadlineAt || 0);
        return Number.isFinite(timeDiff) && timeDiff !== 0 ? timeDiff : b.raceNo - a.raceNo;
      })
      .slice(0, MAX_RESULTS);
  }

  function ensureStyle() {
    if (document.getElementById("todayResultsHomeStyle")) return;
    const style = document.createElement("style");
    style.id = "todayResultsHomeStyle";
    style.textContent = `
      .today-results-home{margin:14px 0 88px;padding:0 14px}
      .today-results-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .today-results-head h2{margin:0;font-size:17px}
      .today-results-head small{color:#6b7280}
      .today-results-list{display:grid;gap:8px}
      .today-result-card{width:100%;display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;border:1px solid #dbe4ef;background:#fff;border-radius:14px;padding:12px 14px;text-align:left;box-shadow:0 2px 10px rgba(15,23,42,.05)}
      .today-result-card strong{display:block;font-size:15px;color:#111827}
      .today-result-card small{display:block;margin-top:3px;color:#6b7280}
      .today-result-card b{font-size:14px;color:#0878f9}
      .today-results-empty{margin:0;padding:12px;border-radius:12px;background:#f8fafc;color:#64748b;text-align:center}
      @media (min-width:700px){.today-results-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    let section = document.getElementById("todayResultsHome");
    if (section) return section;
    section = document.createElement("section");
    section.id = "todayResultsHome";
    section.className = "today-results-home";
    section.innerHTML = `
      <div class="today-results-head">
        <h2>🏁 今日の結果</h2>
        <small data-today-results-status>取得中</small>
      </div>
      <div class="today-results-list" data-today-results-list>
        <p class="today-results-empty">結果を確認しています</p>
      </div>
    `;
    const home = document.getElementById("homeDashboardV2");
    if (home) home.appendChild(section);
    else document.querySelector(".dashboard-app")?.prepend(section);
    return section;
  }

  async function waitForRaceOption(select, value, timeout = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if ([...(select?.options || [])].some(option => option.value === value)) return true;
      await new Promise(resolve => root.setTimeout(resolve, 100));
    }
    throw new Error("終了レース情報を取得できませんでした");
  }

  async function openResult(place, raceNo) {
    await root.ChappyAppRuntime?.ensure?.("race");
    const mode = document.getElementById("raceModeSelect");
    const placeSelect = document.getElementById("placeSelect");
    const raceSelect = document.getElementById("raceSelect");
    const fetchButton = document.getElementById("fetchRaceBtn");
    if (!placeSelect || !raceSelect || !fetchButton) return;

    if (mode) {
      mode.value = "review";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    }
    placeSelect.value = place;
    placeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const raceValue = `${numberOf(raceNo)}R`;
    await waitForRaceOption(raceSelect, raceValue);
    raceSelect.value = raceValue;
    raceSelect.dispatchEvent(new Event("change", { bubbles: true }));

    document.querySelector('.bottom-nav-item[data-view="race"]')?.click();
    fetchButton.click();
    document.getElementById("raceSection")?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function render(rows) {
    const section = ensureSection();
    const list = section.querySelector("[data-today-results-list]");
    const status = section.querySelector("[data-today-results-status]");
    if (!list || !status) return;
    status.textContent = `${rows.length}件`;
    list.innerHTML = rows.length
      ? rows.map(row => `
          <button class="today-result-card" type="button" data-result-place="${row.place}" data-result-race="${row.raceNo}">
            <span><strong>${row.place} ${row.raceNo}R</strong><small>締切 ${timeOf(row.deadlineAt)}</small></span>
            <b>${row.result} ›</b>
          </button>
        `).join("")
      : '<p class="today-results-empty">終了したレースはまだありません</p>';
  }

  async function refresh() {
    try {
      const response = await fetch(`${API_ROOT}/schedule?date=${encodeURIComponent(jstDate())}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      render(collectFinished(data?.venues));
    } catch (error) {
      console.error("今日の結果取得エラー", error);
      const section = ensureSection();
      const status = section.querySelector("[data-today-results-status]");
      const list = section.querySelector("[data-today-results-list]");
      if (status) status.textContent = "取得失敗";
      if (list) list.innerHTML = '<p class="today-results-empty">結果を取得できませんでした</p>';
    }
  }

  function init() {
    ensureStyle();
    ensureSection();
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-result-place][data-result-race]");
      if (!button) return;
      event.preventDefault();
      openResult(button.dataset.resultPlace, button.dataset.resultRace).catch(error => {
        console.error("今日の結果遷移エラー", error);
      });
    });
    refresh();
  }

  root.ChappyTodayResultsHome = Object.freeze({ refresh, openResult });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
