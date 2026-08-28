(function (root) {
  "use strict";

  const API_ROOT = "https://chappy-boatrace-api.vercel.app/api";
  const SUMMARY_ROOT = "data/predictions/summaries";
  const CACHE_KEY = "chappy-home-v2-cache";
  const CACHE_TTL = 300000;
  const HOME_REQUEST_TIMEOUT_MS = 30000;
  const PAGE_SIZE = 5;
  const TYPES = {
    morning: new Set(["三国", "鳴門", "徳山", "芦屋", "唐津", "大村"]),
    night: new Set(["桐生", "蒲郡", "住之江", "丸亀", "下関", "若松"])
  };
  const state = {
    filter: "all",
    scheduleDate: "",
    schedule: [],
    recommendationCandidates: [],
    recommendations: [],
    recommendationThreshold: 70,
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
    recommendationTimer: 0,
    navigationGeneration: 0,
    currentView: "home",
    initialDataReady: false,
    scheduleLoading: false,
    scheduleError: "",
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
    return minutes === null ? "is-before" : minutes <= 0 ? "is-finished" : minutes <= 2 ? "is-skip" : minutes <= 5 ? "is-upset-hot" : minutes <= 10 ? "is-upset" : "is-main";
  }

  function raceDeadlineLabel(value) {
    const time = timeOf(value);
    return deadlineClass(value) === "is-finished" ? `終了 ${time}` : time;
  }

  function venueType(place) {
    return TYPES.morning.has(place) ? "morning" : TYPES.night.has(place) ? "night" : "day";
  }

  function typeLabel(type) {
    return type === "morning" ? "モーニング" : type === "night" ? "ナイター" : "デイ";
  }

  function racesOf(venue) {
    const detailed = (Array.isArray(venue?.races) ? venue.races : [])
      .map(row => {
        const deadlineAt = row?.deadlineAt || row?.deadline || row?.closeAt || "";
        const deadlineMs = Date.parse(deadlineAt);
        return {
          raceNo: num(row?.raceNo ?? row?.rno),
          deadlineAt,
          selectable:
            row?.selectable !== false &&
            row?.closed !== true &&
            (!Number.isFinite(deadlineMs) || deadlineMs > Date.now())
        };
      })
      .filter(row => row.raceNo >= 1 && row.raceNo <= 12)
      .sort((a, b) => a.raceNo - b.raceNo);

    if (detailed.length) return detailed;

    const currentRaceNo = num(venue?.currentRaceNo);
    if (currentRaceNo < 1 || currentRaceNo > 12) return [];
    const deadlineAt = venue?.deadlineAt || "";
    const deadlineMs = Date.parse(deadlineAt);
    return [{
      raceNo: currentRaceNo,
      deadlineAt,
      selectable:
        venue?.selectable !== false &&
        venue?.finalClosed !== true &&
        (!Number.isFinite(deadlineMs) || deadlineMs > Date.now())
    }];
  }

  function decisionFor(item) {
    const type = [
      item?.legacyType,
      item?.type,
      item?.scoreType
    ].map(value => String(value || "")).join(" ");
    const scenario = String(item?.scenarioLabel || "");
    const score = num(item?.score);
    if (/見送り|skip/i.test(type)) {
      return { key: "skip", label: "見送り推奨", score };
    }
    if (
      /波乱|万舟/.test(type) ||
      (/外|カド|まくり|差し|攻め|展開突き/.test(scenario) && !/イン逃げ/.test(scenario))
    ) return { key: "upset", label: "波乱候補", score };
    if (score < 60) return { key: "skip", label: "見送り推奨", score };
    return { key: "main", label: "勝負候補", score };
  }

  function reason(item, decision) {
    if (item?.scenarioLabel) return String(item.scenarioLabel);
    const source = decision.key === "upset" ? item?.evaluation?.manshu?.reasons : item?.evaluation?.honmei?.reasons;
    if (Array.isArray(source) && source.length) return String(source[0]);
    return decision.key === "skip" ? "展開が読みにくく妙味も薄い" : decision.key === "upset" ? "外の攻めから波乱期待大" : "最有力展開の成立度が高い";
  }

  function jcdOf(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits ? digits.padStart(2, "0").slice(-2) : "";
  }

  function findScheduledRace(item, schedule, nowMs = Date.now()) {
    const place = String(item?.place || "").trim();
    const jcd = jcdOf(item?.jcd);
    const raceNo = num(item?.raceNo);
    const venue = (Array.isArray(schedule) ? schedule : []).find(row =>
      jcd
        ? jcdOf(row?.jcd) === jcd
        : String(row?.place || "").trim() === place
    );

    if (!venue || raceNo < 1 || raceNo > 12) return null;

    const detailedRace = (Array.isArray(venue?.races) ? venue.races : [])
      .find(row => num(row?.raceNo ?? row?.rno) === raceNo);
    const overviewRace = num(venue?.currentRaceNo) === raceNo
      ? {
          raceNo,
          deadlineAt: venue?.deadlineAt || "",
          selectable: venue?.selectable,
          status: venue?.status || "",
          closed: venue?.finalClosed === true
        }
      : null;
    const race = detailedRace || overviewRace;

    if (!race || race.selectable !== true) return null;
    if (
      race.closed === true ||
      race.finished === true ||
      race.ended === true ||
      venue?.finalClosed === true ||
      ["closed", "finished", "ended"].includes(String(race.status || "").toLowerCase())
    ) {
      return null;
    }

    const deadlineAt = race?.deadlineAt || race?.deadline || race?.closeAt || "";
    const deadlineMs = Date.parse(deadlineAt);
    if (!Number.isFinite(deadlineMs) || deadlineMs <= nowMs) return null;

    return {
      jcd: jcdOf(venue?.jcd),
      place: String(venue?.place || place).trim(),
      raceNo,
      deadlineAt,
      selectable: true,
      status: race?.status || "before_deadline"
    };
  }

  function selectRecommendations(run, schedule, nowMs = Date.now()) {
    const thresholdValue = Number(run?.threshold);
    const threshold = Number.isFinite(thresholdValue) && thresholdValue > 0
      ? thresholdValue
      : 70;

    return (Array.isArray(run?.compared) ? run.compared : [])
      .map(item => {
        const score = Number(item?.score);
        if (item?.selectionReady !== true || !Number.isFinite(score) || score < threshold) {
          return null;
        }

        const scheduledRace = findScheduledRace(item, schedule, nowMs);
        if (!scheduledRace) return null;

        const next = {
          ...item,
          jcd: scheduledRace.jcd,
          place: scheduledRace.place,
          deadlineAt: scheduledRace.deadlineAt,
          selectable: true
        };
        const decision = decisionFor(next);
        if (decision.key === "skip") return null;

        return {
          ...next,
          decision
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        num(b?.score) - num(a?.score) ||
        num(b?.decision?.score) - num(a?.decision?.score)
      )
      .slice(0, 3);
  }

  function summaryCheckedAt(data, run) {
    const raw = run?.checkedAt || data?.updatedAt || "";
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
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
      state.recommendationThreshold = num(cached.recommendationThreshold, 70) || 70;
      state.recommendationCandidates = Array.isArray(cached.recommendationCandidates)
        ? cached.recommendationCandidates
        : Array.isArray(cached.recommendations)
          ? cached.recommendations
          : [];
      state.recommendations = selectRecommendations(
        {
          threshold: state.recommendationThreshold,
          compared: state.recommendationCandidates
        },
        state.schedule
      );
      state.updatedAt = cached.summaryCheckedAt
        ? summaryCheckedAt({ updatedAt: cached.summaryCheckedAt }, null)
        : null;
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
        summaryCheckedAt: state.updatedAt?.toISOString() || null,
        scheduleDate: state.scheduleDate || jstDate(),
        schedule: state.schedule,
        recommendationCandidates: state.recommendationCandidates,
        recommendations: state.recommendations,
        recommendationThreshold: state.recommendationThreshold
      });
      sessionStorage.setItem(CACHE_KEY, payload);
      localStorage.setItem(CACHE_KEY, payload);
    } catch (_) {}
  }

  function getJson(url, force = false) {
    const key = `${force ? "reload:" : "default:"}${url}`;
    if (state.requestMap.has(key)) return state.requestMap.get(key);
    const controller = typeof AbortController === "function"
      ? new AbortController()
      : null;
    const timer = controller
      ? root.setTimeout(() => controller.abort(), HOME_REQUEST_TIMEOUT_MS)
      : 0;
    const request = fetch(url, {
      cache: force ? "reload" : "default",
      ...(controller ? { signal: controller.signal } : {})
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .catch(error => {
        if (error?.name === "AbortError") {
          throw new Error("開催情報の応答が30秒を超えました");
        }
        throw error;
      })
      .finally(() => {
        if (timer) root.clearTimeout(timer);
        state.requestMap.delete(key);
      });
    state.requestMap.set(key, request);
    return request;
  }

  async function loadSchedule(force = false) {
    try {
      const data = await getJson(`${API_ROOT}/schedule?date=${encodeURIComponent(jstDate())}`, force);
      const next = Array.isArray(data?.venues) ? data.venues : [];
      const changed = stable(next) !== stable(state.schedule);
      state.scheduleDate = /^\d{8}$/.test(String(data?.date || ""))
        ? String(data.date)
        : jstDate();
      state.schedule = next;
      state.scheduleError = "";
      root.dispatchEvent(new CustomEvent("chappy:home-schedule", {
        detail: {
          date: state.scheduleDate,
          venues: next,
          force
        }
      }));
      return changed;
    } catch (error) {
      state.scheduleError = error?.message || "開催情報を取得できませんでした";
      throw error;
    }
  }

  async function loadRecommendations(force = false, scheduleReady = null) {
    const suffix = force ? `?t=${Date.now()}` : "";

    try {
      const [data] = await Promise.all([
        getJson(`${SUMMARY_ROOT}/${jstDate()}.json${suffix}`, force),
        Promise.resolve(scheduleReady).catch(() => null)
      ]);
      const run = [...(Array.isArray(data?.runs) ? data.runs : [])]
        .sort((a, b) => Date.parse(b?.checkedAt || 0) - Date.parse(a?.checkedAt || 0))[0];
      state.recommendationCandidates = Array.isArray(run?.compared)
        ? run.compared
        : [];
      const next = selectRecommendations({
        threshold: run?.threshold,
        compared: state.recommendationCandidates
      }, state.schedule);
      const changed = stable(next) !== stable(state.recommendations);
      state.recommendationThreshold = num(run?.threshold, 70) || 70;
      state.recommendations = next;
      state.updatedAt = summaryCheckedAt(data, run);
      return changed;
    } catch (error) {
      console.warn("ホームおすすめ取得エラー", error);
      const next = selectRecommendations(
        {
          threshold: state.recommendationThreshold,
          compared: state.recommendationCandidates
        },
        state.schedule
      );
      const changed = stable(next) !== stable(state.recommendations);
      state.recommendations = next;
      return changed;
    }
  }

  function scheduleRecommendationExpiry() {
    if (state.recommendationTimer) root.clearTimeout(state.recommendationTimer);
    state.recommendationTimer = 0;
    if (document.visibilityState === "hidden") return;
    const now = Date.now();
    const nearest = state.recommendations
      .map(item => Date.parse(item?.deadlineAt || ""))
      .filter(value => Number.isFinite(value) && value > now)
      .sort((a, b) => a - b)[0];
    if (!nearest) return;
    const delay = Math.max(100, Math.min(2147483647, nearest - now + 100));
    state.recommendationTimer = root.setTimeout(() => {
      state.recommendationTimer = 0;
      revalidateRecommendations();
    }, delay);
  }

  function revalidateRecommendations() {
    const next = selectRecommendations({
      threshold: state.recommendationThreshold,
      compared: state.recommendationCandidates
    }, state.schedule);
    const changed = stable(next) !== stable(state.recommendations);
    state.recommendations = next;
    if (changed) {
      renderRecommendations(true);
      writeCache();
    } else {
      scheduleRecommendationExpiry();
    }
    return changed;
  }

  function showPredictionLoading(place, raceNo) {
    const resultArea = document.getElementById("resultArea");
    if (resultArea) {
      resultArea.dataset.raceLoading = "true";
      resultArea.innerHTML = `<div class="prediction-loading-state" role="status" aria-live="polite"><span class="prediction-loading-spinner" aria-hidden="true"></span><strong>${esc(place)} ${num(raceNo)}Rを読み込み中</strong><small>出走表とAI予想を先に表示し、オッズは取得でき次第反映します。</small></div>`;
    }
    const oddsStatus = document.getElementById("predictionOddsStatus");
    if (oddsStatus) {
      oddsStatus.textContent = "オッズ待機中";
      oddsStatus.dataset.state = "loading";
    }
    setView("prediction");
    root.requestAnimationFrame?.(() => {
      document.getElementById("predictionSection")?.scrollIntoView({ behavior: "auto", block: "start" });
    });
    return state.navigationGeneration;
  }

  function showPredictionError(message) {
    const resultArea = document.getElementById("resultArea");
    if (!resultArea) return;
    resultArea.dataset.raceLoading = "error";
    resultArea.innerHTML = `<div class="prediction-loading-state is-error" role="alert"><strong>レースを読み込めませんでした</strong><small>${esc(message || "通信状態を確認して、もう一度レースを選んでください。")}</small></div>`;
    const oddsStatus = document.getElementById("predictionOddsStatus");
    if (oddsStatus) {
      oddsStatus.textContent = "取得失敗";
      oddsStatus.dataset.state = "error";
    }
  }

  function buildSelectionSchedule(place, raceNo) {
    const venue = state.schedule.find(item => String(item?.place || "") === String(place || ""));
    const race = racesOf(venue).find(item => num(item?.raceNo) === num(raceNo));
    if (!venue || !race) return null;
    return {
      ...venue,
      races: [{
        ...race,
        raceNo: num(race.raceNo),
        deadline: timeOf(race.deadlineAt),
        deadlineAt: race.deadlineAt || "",
        selectable: race.selectable !== false,
        status: race.status || "before_deadline"
      }]
    };
  }

  function cancelPredictionLoading() {
    state.pendingSelection = null;
    const resultArea = document.getElementById("resultArea");
    if (!resultArea || resultArea.dataset.raceLoading !== "true") return;
    delete resultArea.dataset.raceLoading;
    resultArea.innerHTML = '<div class="prediction-empty-state">レースの読み込みを中止しました。ホームからレースを選び直してください。</div>';
    const oddsStatus = document.getElementById("predictionOddsStatus");
    if (oddsStatus) {
      oddsStatus.textContent = "読込中止";
      oddsStatus.dataset.state = "pending";
    }
  }

  async function performSyncAndOpen(place, raceNo, navigationGeneration) {
      const scheduleData = buildSelectionSchedule(place, raceNo);
      const resultPanelReady = Promise.resolve(
        root.ChappyRaceFlowResultPanel ||
        root.ChappyTodayResultsHome?.load?.()
      ).catch(() => null);
      void resultPanelReady;
      await root.ChappyAppRuntime?.ensure?.("race");
      root.ChappyStartupGate?.activateRace?.();
      const fetchButton = document.getElementById("fetchRaceBtn");
      if (!fetchButton || typeof root.ChappyRaceSelection?.select !== "function") return;

      await root.ChappyRaceSelection.select({
        mode: "live",
        date: state.scheduleDate || jstDate(),
        place,
        raceNo: num(raceNo),
        scheduleData
      });
      if (
        navigationGeneration !== state.navigationGeneration ||
        state.currentView !== "prediction" ||
        state.pendingSelection
      ) {
        return false;
      }
      state.selectedPlace = place;
      state.selectedRace = num(raceNo);
      updateSelectedRace();
      fetchButton.click();
  }

  function syncAndOpen(place, raceNo) {
    const navigationGeneration = showPredictionLoading(place, raceNo);
    state.pendingSelection = { place, raceNo: num(raceNo), navigationGeneration };
    state.selectedPlace = place;
    state.selectedRace = num(raceNo);
    updateSelectedRace();
    if (state.selectionPromise) return state.selectionPromise;
    state.loading = true;

    state.selectionPromise = (async () => {
      while (state.pendingSelection) {
        const intent = state.pendingSelection;
        state.pendingSelection = null;
        try {
          await performSyncAndOpen(intent.place, intent.raceNo, intent.navigationGeneration);
        } catch (error) {
          if (!state.pendingSelection) throw error;
        }
      }
    })().catch(error => {
      console.error("ホームレース選択エラー", error);
      showPredictionError(error?.message);
    }).finally(() => {
      state.loading = false;
      state.selectionPromise = null;
    });

    return state.selectionPromise;
  }

  function recommendationHtml(item, index) {
    const decision = item.decision || decisionFor(item);
    const selectionScore = Math.round(num(item?.score));
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
    const deadline = item?.deadlineAt || item?.deadline || item?.closeAt || "";
    return `<button class="home-v2-recommend-card is-${decision.key}" type="button" data-place="${esc(item.place)}" data-race="${num(item.raceNo)}"><div class="home-v2-card-top"><span class="home-v2-medal">${medal}</span><span class="home-v2-decision">${esc(decision.label)}</span><span class="home-v2-arrow">›</span></div><strong>${esc(item.place)} ${num(item.raceNo)}R</strong><span class="home-v2-deadline">締切 <b>${esc(timeOf(deadline))}</b></span><span class="home-v2-score-row is-single"><span>勝負レース評価<b>${selectionScore}</b><small>点</small></span></span><small class="home-v2-reason">${esc(reason(item, decision))}</small></button>`;
  }

  function raceHtml(place, race) {
    const selected = state.selectedPlace === place && state.selectedRace === num(race.raceNo);
    const deadlineLabel = raceDeadlineLabel(race.deadlineAt);
    return `<button class="home-v2-race ${deadlineClass(race.deadlineAt)} ${selected ? "is-selected" : ""}" type="button" data-place="${esc(place)}" data-race="${num(race.raceNo)}" aria-label="${esc(place)} ${num(race.raceNo)}R ${esc(deadlineLabel)}" ${race.selectable === false ? "disabled" : ""}><strong>${num(race.raceNo)}R</strong><span><i></i>${esc(deadlineLabel)}</span></button>`;
  }

  function venueHtml(venue) {
    const place = String(venue?.place || "");
    const type = venueType(place);
    const rows = racesOf(venue).filter(row => row.selectable !== false).slice(0, 4);
    return `<article class="home-v2-venue" data-venue="${esc(place)}"><div class="home-v2-venue-info"><strong>${esc(place)} <span>≋</span></strong><small>${typeLabel(type)}</small></div><div class="home-v2-races">${rows.length ? rows.map(row => raceHtml(place, row)).join("") : '<span class="home-v2-no-race">› を押して1R〜12Rを表示</span>'}</div><button class="home-v2-venue-next" type="button" data-open-venue="${esc(place)}" aria-label="${esc(place)}の1Rから12Rを表示">›</button></article>`;
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
    el.innerHTML = `<section class="home-v2-recommend"><div class="home-v2-title-row"><h2>TODAY'S PICKS　🔥 今日のおすすめレース</h2><span data-home-updated>最終更新 --:--</span></div><div class="home-v2-recommend-list" data-home-recommendations></div></section><section class="home-v2-filter-shell"><div class="home-v2-filters">${[["all","🌐 全場"],["morning","☀️ モーニング"],["day","☀️ デイ"],["night","🌙 ナイター"]].map(([key,label]) => `<button type="button" data-filter="${key}" class="${state.filter === key ? "is-active" : ""}" aria-pressed="${state.filter === key}">${label}</button>`).join("")}</div></section><section class="home-v2-schedule"><div class="home-v2-title-row home-v2-schedule-title"><h2>⚑ 開催場一覧</h2><div class="home-v2-legend"><span class="is-main">余裕あり</span><span class="is-upset">締切間近</span><span class="is-skip">2分以内</span><span class="is-before">時刻未定</span></div></div><div class="home-v2-venue-list" data-home-venues></div><button class="home-v2-more" type="button" data-show-all hidden></button></section>`;
    el.dataset.shellReady = "true";
    return el;
  }

  function renderRecommendations(force = false) {
    scheduleRecommendationExpiry();
    const el = ensureShell().querySelector("[data-home-recommendations]");
    if (!el) return;
    const key = stable(state.recommendations);
    if (!force && key === state.renderKeys.recommendations) return;
    state.renderKeys.recommendations = key;
    el.innerHTML = !state.initialDataReady && !state.recommendations.length
      ? '<p class="home-v2-empty">おすすめレースを確認しています…</p>'
      : state.recommendations.length
      ? state.recommendations.map(recommendationHtml).join("")
      : '<p class="home-v2-empty">現在、締切前の勝負対象レースはありません</p>';
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
      list.innerHTML = shown.length
        ? shown.map(venueHtml).join("")
        : state.scheduleLoading || !state.initialDataReady
          ? '<p class="home-v2-empty">本日の開催情報を読み込んでいます…</p>'
          : state.scheduleError
            ? '<div class="home-v2-empty home-v2-load-error"><span>開催情報を取得できませんでした</span><button type="button" data-home-retry>再試行</button></div>'
          : '<p class="home-v2-empty">該当する開催場がありません</p>';
    }
    shell.querySelectorAll("[data-filter]").forEach(button => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
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
      if (target.matches("[data-home-retry]")) {
        void refresh(true);
        return;
      }
      if (target.matches("[data-open-venue]")) {
        const panel = root.ChappyRaceFlowResultPanel;
        if (typeof panel?.expandVenue === "function") {
          void panel.expandVenue(target);
          return;
        }

        target.setAttribute("aria-busy", "true");
        root.ChappyTodayResultsHome?.load?.().then(loadedPanel => {
          target.removeAttribute("aria-busy");
          return loadedPanel?.expandVenue?.(target);
        }).catch(error => {
          target.removeAttribute("aria-busy");
          console.error("開催場レース一覧の読み込みエラー", error);
        });
      }
    });
  }

  function installHeader() {
    const header = document.querySelector(".app-header");
    if (!header || header.dataset.homeReady === "true") return;
    header.dataset.homeReady = "true";
    header.innerHTML = `<div class="header-brand"><div class="header-logo">🚤</div><div class="header-copy"><h1>チャッピーボートレースAI</h1><p class="header-description">展開を読む、勝つためのAI予想</p></div></div><div class="home-header-actions"><button type="button" id="homeRefreshBtn"><b>↻</b><small>更新</small></button></div>`;
    document.getElementById("homeRefreshBtn")?.addEventListener("click", () => refresh(true));
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
    const changed = state.currentView !== view;
    const map = {
      home: document.getElementById("homeDashboardV2"),
      race: document.getElementById("raceSection"),
      prediction: document.getElementById("predictionSection"),
      result: document.getElementById("resultSection")
    };
    Object.entries(map).forEach(([key, section]) => { if (section) section.hidden = key !== view; });
    const auto = document.getElementById("autoSelectionSection");
    if (auto) auto.hidden = true;
    document.querySelectorAll(".bottom-nav-item").forEach(item => {
      const active = item.dataset.view === view;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    state.currentView = view;
    if (changed) {
      root.dispatchEvent(new CustomEvent("chappy:view-changed", { detail: { view } }));
    }
    return changed;
  }

  function installNav() {
    const nav = document.querySelector(".bottom-nav");
    if (!nav || nav.dataset.homeReady === "true") return;
    nav.dataset.homeReady = "true";
    nav.addEventListener("click", event => {
      const item = event.target.closest("[data-view]");
      if (!item) return;
      event.preventDefault();
      const view = item.dataset.view;
      if (view !== state.currentView) {
        state.navigationGeneration += 1;
      }
      if (view !== "prediction") cancelPredictionLoading();
      setView(view);
      if (view === "home") revalidateRecommendations();
      const section = view === "home"
        ? document.getElementById("homeDashboardV2")
        : document.getElementById(`${view}Section`);
      root.requestAnimationFrame?.(() => section?.scrollIntoView?.({ behavior: "auto", block: "start" }));

      if (view === "result") {
        const status = document.getElementById("resultSyncStatus");
        if (status) {
          status.hidden = false;
          status.textContent = "結果分析を読み込んでいます…";
        }
        root.ChappyAppRuntime?.ensure?.("stats").catch(error => {
          console.error("結果分析の読み込みエラー", error);
          if (status) status.textContent = "結果分析を読み込めませんでした。もう一度お試しください。";
        });
      }
    });
  }

  function refresh(force = false) {
    if (state.refreshPromise) return state.refreshPromise;
    const el = ensureHome();
    const refreshButton = document.getElementById("homeRefreshBtn");
    if (refreshButton) refreshButton.disabled = true;
    if (force) el.classList.add("is-loading");
    state.scheduleLoading = true;
    renderSchedule(true);
    const scheduleLoad = loadSchedule(force);
    const scheduleTask = scheduleLoad.then(changed => { if (changed) renderSchedule(); return changed; });
    const recommendationTask = loadRecommendations(force, scheduleLoad).then(changed => { if (changed) renderRecommendations(); return changed; });
    state.refreshPromise = Promise.allSettled([scheduleTask, recommendationTask])
      .then(results => {
        state.scheduleLoading = false;
        if (results[0]?.status === "rejected" && !state.scheduleError) {
          state.scheduleError = results[0].reason?.message || "開催情報を取得できませんでした";
        }
        state.initialDataReady = true;
        renderRecommendations(true);
        renderSchedule(true);
        writeCache();
        renderUpdatedAt();
      })
      .finally(() => {
        state.scheduleLoading = false;
        state.refreshPromise = null;
        el.classList.remove("is-loading");
        if (refreshButton) refreshButton.disabled = false;
      });
    return state.refreshPromise;
  }

  function scheduleRefresh() {
    const run = () => refresh(false);
    if (typeof root.requestAnimationFrame === "function") {
      root.requestAnimationFrame(() => root.setTimeout(run, 0));
    } else {
      root.setTimeout(run, 50);
    }
  }

  function init() {
    ensureShell();
    installHeader();
    installNav();
    setView("home");
    state.initialDataReady = readCache();
    render(true);
    scheduleRefresh();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        revalidateRecommendations();
      } else {
        scheduleRecommendationExpiry();
      }
    });
  }

  root.ChappyHomeDashboardV2 = Object.freeze({
    refresh,
    setView,
    getSchedule: () => state.schedule.slice(),
    getDate: () => state.scheduleDate || jstDate(),
    showPredictionLoading,
    showPredictionError,
    isViewIntentCurrent: (generation, view = "prediction") =>
      generation === state.navigationGeneration && state.currentView === view,
    selectRecommendations,
    summaryCheckedAt,
    buildSelectionSchedule
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
