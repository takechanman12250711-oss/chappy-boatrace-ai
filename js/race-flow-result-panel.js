(function (root, factory) {
  "use strict";

  const core = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = core;
  }

  if (!root || !root.document || root.ChappyRaceFlowResultPanel) return;
  root.ChappyRaceFlowResultPanel = core.install(root);
  root.dispatchEvent(new CustomEvent("chappy:race-flow-ready"));
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const API_ROOT = "https://chappy-boatrace-api.vercel.app/api";
  const ACTUAL_PURCHASE_KEY = "chappy_actual_purchases_v1";
  const MAX_DETAIL_REQUESTS = 3;
  const RESULT_RETRY_MS = 30000;
  const RESULT_MAX_RETRIES = 10;
  const REQUEST_TIMEOUT_MS = 30000;
  const PLACE_TO_JCD = Object.freeze({
    "桐生": "01", "戸田": "02", "江戸川": "03", "平和島": "04",
    "多摩川": "05", "浜名湖": "06", "蒲郡": "07", "常滑": "08",
    "津": "09", "三国": "10", "びわこ": "11", "住之江": "12",
    "尼崎": "13", "鳴門": "14", "丸亀": "15", "児島": "16",
    "宮島": "17", "徳山": "18", "下関": "19", "若松": "20",
    "芦屋": "21", "福岡": "22", "唐津": "23", "大村": "24"
  });

  const numberOf = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);

  function jstDate(now = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now).replaceAll("-", "");
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

  function normalizeJcd(value, place = "") {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits) return digits.padStart(2, "0").slice(-2);
    return PLACE_TO_JCD[String(place || "").trim()] || "";
  }

  function buildRaceKey(input = {}) {
    const date = String(input.date || "").replace(/\D/g, "").slice(0, 8);
    const jcd = normalizeJcd(input.jcd, input.place);
    const raceNo = numberOf(input.raceNo ?? input.rno);
    return /^\d{8}$/.test(date) && /^\d{2}$/.test(jcd) && raceNo >= 1 && raceNo <= 12
      ? `${date}-${jcd}-${raceNo}`
      : "";
  }

  function normalizeRace(raw = {}) {
    return {
      ...raw,
      raceNo: numberOf(raw.raceNo ?? raw.rno),
      deadlineAt: raw.deadlineAt || raw.deadline || raw.closeAt || ""
    };
  }

  function racesOf(venue) {
    return (Array.isArray(venue?.races) ? venue.races : [])
      .map(normalizeRace)
      .filter(race => race.raceNo >= 1 && race.raceNo <= 12)
      .sort((a, b) => a.raceNo - b.raceNo);
  }

  function isFinished(race, nowMs = Date.now()) {
    if (!race) return false;
    if (race.finished === true || race.ended === true || race.closed === true) return true;
    if (["closed", "finished", "ended"].includes(String(race.status || "").toLowerCase())) return true;
    const deadlineMs = Date.parse(race.deadlineAt || race.deadline || race.closeAt || "");
    if (Number.isFinite(deadlineMs)) return deadlineMs <= nowMs;
    return race.selectable === false && race.cancelled !== true;
  }

  function resultCombination(result) {
    const value = result?.trifecta?.combination
      || result?.combination
      || result?.resultTicket
      || result?.result
      || "";
    if (Array.isArray(value)) return value.slice(0, 3).join("-");
    const boats = String(value).match(/[1-6]/g) || [];
    return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
  }

  function purchaseTickets(purchases) {
    return [...new Set((Array.isArray(purchases) ? purchases : [])
      .map(item => {
        const boats = String(item?.ticket || item?.combination || "").match(/[1-6]/g) || [];
        return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
      })
      .filter(Boolean))];
  }

  function createStatus({ race, result, purchases = [], nowMs = Date.now() } = {}) {
    if (!isFinished(race, nowMs)) {
      return {
        key: "waiting",
        label: "結果待ち",
        detail: "レース終了後に公式結果と照合します"
      };
    }

    const combination = resultCombination(result);
    if (!result || result.resultAvailable === false || !combination) {
      return {
        key: "checking",
        label: "結果確認中",
        detail: "公式結果の反映を待っています"
      };
    }

    const tickets = purchaseTickets(purchases);
    if (!tickets.length) {
      return {
        key: "not-purchased",
        label: "購入していない",
        detail: `公式結果 ${combination}`
      };
    }

    const hit = tickets.includes(combination);
    return {
      key: hit ? "hit" : "miss",
      label: hit ? "的中" : "不的中",
      detail: `公式結果 ${combination} ／ 購入 ${tickets.join("・")}`
    };
  }

  function install(root) {
    const state = {
      date: jstDate(),
      overview: new Map(),
      details: new Map(),
      detailPromises: new Map(),
      detailQueue: [],
      activeDetailRequests: 0,
      detailGeneration: 0,
      resultByRace: new Map(),
      resultPromises: new Map(),
      predictionSyncGeneration: 0,
      overviewVersion: 0,
      current: null,
      resultTimer: 0,
      resultRetryCount: 0,
      pendingOpen: null,
      openPromise: null
    };

    async function requestJson(url, options = {}) {
      const Controller = root.AbortController;
      const controller = typeof Controller === "function"
        ? new Controller()
        : null;
      const timer = controller
        ? root.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : 0;

      try {
        const response = await root.fetch(url, {
          ...options,
          ...(controller ? { signal: controller.signal } : {})
        });
        return { response, payload: await response.json() };
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error("公式データAPIの応答が30秒を超えました");
        }
        throw error;
      } finally {
        if (timer) root.clearTimeout(timer);
      }
    }

    function ensureStyle() {
      if (root.document.getElementById("raceFlowResultStyle")) return;
      const style = root.document.createElement("style");
      style.id = "raceFlowResultStyle";
      style.textContent = `
        .home-v2-races{overflow-x:auto;display:flex!important;gap:6px;-webkit-overflow-scrolling:touch;padding-bottom:3px}
        .home-v2-race{flex:0 0 68px}
        .home-v2-race.is-finished{background:#f1f5f9!important;border-color:#cbd5e1!important;color:#475569!important}
        .home-v2-race.is-selected{border-color:#0878f9!important;background:#eef6ff!important;box-shadow:0 0 0 1px #0878f9 inset!important}
        .home-v2-race-loading,.home-v2-race-error{display:grid;place-items:center;min-height:50px;min-width:100%;border-radius:10px;background:#f8fafc;color:#64748b;font-size:.69rem;font-weight:800}
        .home-v2-race-error{border:0;color:#b45309;cursor:pointer}
        .race-result-status{margin:18px 0 0;border:1px solid #dbe4ef;border-radius:16px;background:#fff;padding:15px;box-shadow:0 3px 12px rgba(15,23,42,.06)}
        .race-result-status h3{margin:0 0 10px;font-size:16px}
        .race-result-status-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .race-result-status-row strong{font-size:18px}
        .race-result-status-row small{color:#64748b;text-align:right}
        .race-result-status.is-hit strong{color:#dc2626}
        .race-result-status.is-miss strong{color:#334155}
        .race-result-status.is-not-purchased strong{color:#7c3aed}
        .race-result-status.is-waiting strong,.race-result-status.is-checking strong{color:#0878f9}
      `;
      root.document.head.appendChild(style);
    }

    function overviewVenue(place, jcd = "") {
      const normalizedPlace = String(place || "").trim();
      const byPlace = state.overview.get(normalizedPlace);
      if (byPlace) return byPlace;
      const normalizedJcd = normalizeJcd(jcd, normalizedPlace);
      return [...state.overview.values()].find(item => normalizeJcd(item?.jcd, item?.place) === normalizedJcd) || null;
    }

    function staleDetailError() {
      const error = new Error("開催情報が更新されました");
      error.name = "AbortError";
      return error;
    }

    function cancelQueuedDetails() {
      const error = staleDetailError();
      while (state.detailQueue.length) {
        state.detailQueue.shift().reject(error);
      }
    }

    function setOverview(venues, date = state.date, force = false) {
      const nextDate = /^\d{8}$/.test(String(date || "")) ? String(date) : jstDate();
      const resetDetails = force || nextDate !== state.date;
      state.date = nextDate;
      state.overview = new Map((Array.isArray(venues) ? venues : [])
        .filter(item => item?.place)
        .map(item => [String(item.place).trim(), {
          ...item,
          jcd: normalizeJcd(item.jcd, item.place)
        }]));
      state.overviewVersion += 1;
      if (resetDetails) {
        state.detailGeneration += 1;
        cancelQueuedDetails();
        state.details.clear();
        state.detailPromises.clear();
      }
      decorateVisibleVenues();
    }

    function runDetailQueue() {
      while (state.activeDetailRequests < MAX_DETAIL_REQUESTS && state.detailQueue.length) {
        const task = state.detailQueue.shift();
        state.activeDetailRequests += 1;
        task.run()
          .then(task.resolve, task.reject)
          .finally(() => {
            state.activeDetailRequests -= 1;
            runDetailQueue();
          });
      }
    }

    function queued(run) {
      return new Promise((resolve, reject) => {
        state.detailQueue.push({ run, resolve, reject });
        runDetailQueue();
      });
    }

    function loadVenueDetail(place, jcd = "", force = false) {
      const summary = overviewVenue(place, jcd) || { place, jcd };
      const code = normalizeJcd(summary.jcd || jcd, summary.place || place);
      if (!code) return Promise.reject(new Error("場コードを確認できません"));
      if (!force && state.details.has(code)) return Promise.resolve(state.details.get(code));
      if (!force && state.detailPromises.has(code)) return state.detailPromises.get(code);

      const detailGeneration = state.detailGeneration;
      const requestDate = state.date;
      const promise = queued(async () => {
        const { response, payload } = await requestJson(
          `${API_ROOT}/schedule?date=${encodeURIComponent(requestDate)}&jcd=${encodeURIComponent(code)}`,
          { cache: force ? "reload" : "default" }
        );
        if (!response.ok || payload?.ok === false || !payload?.selectedVenue) {
          throw new Error(payload?.error || `開催情報APIエラー：${response.status}`);
        }
        if (detailGeneration !== state.detailGeneration || requestDate !== state.date) {
          throw staleDetailError();
        }
        const detail = {
          ...summary,
          ...payload.selectedVenue,
          place: payload.selectedVenue.place || summary.place || place,
          jcd: normalizeJcd(payload.selectedVenue.jcd || code, payload.selectedVenue.place || place)
        };
        if (!racesOf(detail).length) throw new Error("レース一覧を取得できませんでした");
        state.details.set(code, detail);
        return detail;
      }).finally(() => {
        if (state.detailPromises.get(code) === promise) {
          state.detailPromises.delete(code);
        }
      });

      state.detailPromises.set(code, promise);
      return promise;
    }

    function deadlineClass(race) {
      if (isFinished(race)) return "is-finished";
      const deadlineMs = Date.parse(race?.deadlineAt || "");
      if (!Number.isFinite(deadlineMs)) return "is-before";
      const minutes = Math.floor((deadlineMs - Date.now()) / 60000);
      return minutes <= 2 ? "is-skip" : minutes <= 5 ? "is-upset-hot" : minutes <= 10 ? "is-upset" : "is-main";
    }

    function raceDeadlineLabel(race) {
      const time = timeOf(race?.deadlineAt);
      return isFinished(race) ? `終了 ${time}` : time;
    }

    function renderVenue(card, detail) {
      const host = card.querySelector(".home-v2-races");
      if (!host) return;
      const place = String(detail?.place || card.dataset.venue || "").trim();
      const jcd = normalizeJcd(detail?.jcd, place);
      const races = racesOf(detail);
      const signature = JSON.stringify({
        date: state.date,
        jcd,
        selected: state.current?.raceKey || "",
        races: races.map(race => [race.raceNo, race.deadlineAt, race.status, race.selectable])
      });
      if (host.dataset.flowSignature === signature) return;

      host.dataset.flowSignature = signature;
      host.innerHTML = races.map(race => {
        const raceKey = buildRaceKey({ date: state.date, jcd, raceNo: race.raceNo });
        const selected = raceKey && raceKey === state.current?.raceKey;
        const deadlineLabel = raceDeadlineLabel(race);
        return `<button class="home-v2-race ${deadlineClass(race)} ${selected ? "is-selected" : ""}" type="button" data-place="${escapeHtml(place)}" data-race="${race.raceNo}" data-flow-place="${escapeHtml(place)}" data-flow-jcd="${jcd}" data-flow-race="${race.raceNo}" aria-label="${escapeHtml(place)} ${race.raceNo}R ${escapeHtml(deadlineLabel)}"><strong>${race.raceNo}R</strong><span><i></i>${escapeHtml(deadlineLabel)}</span></button>`;
      }).join("");
    }

    function renderVenueLoading(card, jcd) {
      const host = card.querySelector(".home-v2-races");
      if (!host) return;
      const signature = `loading:${state.date}:${jcd}`;
      if (host.dataset.flowSignature === signature) return;
      host.dataset.flowSignature = signature;
      host.innerHTML = '<span class="home-v2-race-loading">1R〜12Rを読込中</span>';
    }

    function renderVenueError(card, place, jcd) {
      const host = card.querySelector(".home-v2-races");
      if (!host) return;
      const signature = `error:${state.date}:${jcd}`;
      if (host.dataset.flowSignature === signature) return;
      host.dataset.flowSignature = signature;
      host.innerHTML = `<button class="home-v2-race-error" type="button" data-flow-retry="${escapeHtml(jcd)}" data-flow-place="${escapeHtml(place)}">再読込</button>`;
    }

    function decorateVisibleVenues() {
      root.document.querySelectorAll(".home-v2-venue[data-venue]").forEach(card => {
        const place = String(card.dataset.venue || "").trim();
        const summary = overviewVenue(place);
        const jcd = normalizeJcd(summary?.jcd, place);
        const detail = state.details.get(jcd);
        if (detail) {
          renderVenue(card, detail);
        }
      });
    }

    function expandVenue(venueButton) {
      const place = String(venueButton?.dataset?.openVenue || "").trim();
      const card = venueButton?.closest?.(".home-v2-venue[data-venue]");
      const summary = overviewVenue(place);
      const jcd = normalizeJcd(summary?.jcd, place);
      if (!card || !jcd) return Promise.resolve(false);

      const detail = state.details.get(jcd);
      if (detail) {
        renderVenue(card, detail);
        return Promise.resolve(true);
      }

      renderVenueLoading(card, jcd);
      return loadVenueDetail(place, jcd)
        .then(loaded => {
          const currentCard = card.isConnected
            ? card
            : [...root.document.querySelectorAll(
                ".home-v2-venue[data-venue]"
              )].find(item => item.dataset.venue === place);
          if (currentCard) renderVenue(currentCard, loaded);
          return true;
        })
        .catch(error => {
          if (error?.name === "AbortError" || !card.isConnected) return false;
          console.error("開催場レース取得エラー", error);
          renderVenueError(card, place, jcd);
          return false;
        });
    }

    function getVenueDetail(value, place = "") {
      const jcd = normalizeJcd(value, place || value);
      return jcd ? state.details.get(jcd) || null : null;
    }

    function prefetchVenue(place, suppliedJcd = "") {
      const summary = overviewVenue(place, suppliedJcd);
      const jcd = normalizeJcd(suppliedJcd || summary?.jcd, place);
      if (!jcd) return Promise.resolve(null);
      const detail = state.details.get(jcd);
      return detail
        ? Promise.resolve(detail)
        : loadVenueDetail(place, jcd);
    }

    function canonicalPurchases(raceKey) {
      const storage = root.ChappyStorage;
      if (storage && typeof storage.findActualPurchasesByRaceKey === "function") {
        return storage.findActualPurchasesByRaceKey(raceKey);
      }
      try {
        const rows = JSON.parse(root.localStorage.getItem(ACTUAL_PURCHASE_KEY) || "[]");
        return (Array.isArray(rows) ? rows : []).filter(item => {
          const key = String(item?.raceKey || buildRaceKey(item));
          return key === raceKey;
        });
      } catch (_) {
        return [];
      }
    }

    function selectedRaceKey() {
      const placeSelect = root.document.getElementById("placeSelect");
      const raceSelect = root.document.getElementById("raceSelect");
      const dateInput = root.document.getElementById("dateInput");
      if (!placeSelect || !raceSelect || !dateInput) return "";
      const option = placeSelect.options[placeSelect.selectedIndex];
      return buildRaceKey({
        date: dateInput.value,
        jcd: option?.dataset?.jcd,
        place: placeSelect.value,
        raceNo: String(raceSelect.value || "").replace(/\D/g, "")
      });
    }

    function isPredictionActive() {
      const section = root.document.getElementById("predictionSection");
      const area = root.document.getElementById("resultArea");
      return root.document.visibilityState !== "hidden" &&
        (!section || section.hidden === false) &&
        !area?.dataset?.raceLoading;
    }

    function ensureResultPanel() {
      const area = root.document.getElementById("resultArea");
      if (!area || !state.current) return null;
      let panel = area.querySelector("#raceResultStatus");
      if (!panel) {
        panel = root.document.createElement("section");
        panel.id = "raceResultStatus";
        panel.className = "race-result-status";
        area.appendChild(panel);
      }
      return panel;
    }

    function render() {
      const area = root.document.getElementById("resultArea");
      if (!area || !state.current) return;
      if (area.dataset.raceLoading) {
        area.querySelector("#raceResultStatus")?.remove();
        return;
      }
      const controlRaceKey = selectedRaceKey();
      if (controlRaceKey && controlRaceKey !== state.current.raceKey) {
        area.querySelector("#raceResultStatus")?.remove();
        return;
      }
      const panel = ensureResultPanel();
      if (!panel) return;
      const result = state.resultByRace.get(state.current.raceKey) || null;
      const status = createStatus({
        race: state.current.race,
        result,
        purchases: canonicalPurchases(state.current.raceKey)
      });
      const signature = JSON.stringify(status);
      if (panel.dataset.statusSignature === signature) return;
      panel.dataset.statusSignature = signature;
      panel.className = `race-result-status is-${status.key}`;
      panel.innerHTML = `<h3>🏁 結果・購入状況</h3><div class="race-result-status-row"><strong>${escapeHtml(status.label)}</strong><small>${escapeHtml(status.detail)}</small></div>`;
    }

    function scheduleResultRefresh() {
      if (state.resultTimer) root.clearTimeout(state.resultTimer);
      state.resultTimer = 0;
      if (!state.current || !isPredictionActive()) return;
      const deadlineMs = Date.parse(state.current.race?.deadlineAt || "");
      const finished = isFinished(state.current.race);
      const currentResult = state.resultByRace.get(state.current.raceKey);
      if (!finished && Number.isFinite(deadlineMs)) {
        const delay = Math.max(1000, Math.min(2147483647, deadlineMs - Date.now() + 15000));
        state.resultTimer = root.setTimeout(refreshCurrentResult, delay);
      } else if (
        finished &&
        (!currentResult || currentResult.resultAvailable === false) &&
        state.resultRetryCount < RESULT_MAX_RETRIES &&
        root.document.visibilityState !== "hidden"
      ) {
        state.resultRetryCount += 1;
        state.resultTimer = root.setTimeout(refreshCurrentResult, RESULT_RETRY_MS);
      }
    }

    function loadOfficialResult(current, force = false) {
      if (!current?.raceKey || !isFinished(current.race)) return Promise.resolve(null);
      const cached = state.resultByRace.get(current.raceKey);
      if (cached?.resultAvailable) {
        return Promise.resolve(cached);
      }
      if (state.resultPromises.has(current.raceKey)) {
        return state.resultPromises.get(current.raceKey);
      }
      const promise = requestJson(
        `${API_ROOT}/result?date=${encodeURIComponent(current.date)}&jcd=${encodeURIComponent(current.jcd)}&rno=${encodeURIComponent(current.raceNo)}`,
        { cache: "no-store" }
      ).then(({ response, payload }) => {
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.error || `公式結果APIエラー：${response.status}`);
        }
        state.resultByRace.set(current.raceKey, payload);
        return payload;
      }).finally(() => state.resultPromises.delete(current.raceKey));
      state.resultPromises.set(current.raceKey, promise);
      return promise;
    }

    function refreshCurrentResult(force = false) {
      if (!state.current || !isPredictionActive()) return Promise.resolve(null);
      if (!isFinished(state.current.race)) {
        render();
        scheduleResultRefresh();
        return Promise.resolve(null);
      }
      const current = state.current;
      return loadOfficialResult(current, force)
        .catch(error => {
          console.error("公式結果取得エラー", error);
          return null;
        })
        .finally(() => {
          if (state.current?.raceKey === current.raceKey) {
            render();
            scheduleResultRefresh();
          }
        });
    }

    async function syncCurrentFromPrediction(detail = {}) {
      const syncGeneration = ++state.predictionSyncGeneration;
      const date = String(detail.date || "").replace(/\D/g, "").slice(0, 8);
      const place = String(detail.place || "").trim();
      const jcd = normalizeJcd(detail.jcd, place);
      const raceNo = numberOf(detail.raceNo ?? detail.rno);
      const raceKey = buildRaceKey({ date, jcd, place, raceNo });
      if (!raceKey) return;
      const controlRaceKey = selectedRaceKey();
      if (controlRaceKey && controlRaceKey !== raceKey) return;

      if (state.current?.raceKey === raceKey) {
        render();
        void refreshCurrentResult();
        return;
      }

      let venue = date === state.date ? state.details.get(jcd) : null;
      if (!venue && date === state.date) {
        const summary = overviewVenue(place, jcd);
        const summaryRace = racesOf(summary).find(item => item.raceNo === raceNo)
          || (numberOf(summary?.currentRaceNo) === raceNo
            ? normalizeRace({
                raceNo,
                deadline: summary?.nextDeadline || "",
                deadlineAt: summary?.deadlineAt || "",
                status: summary?.status || "before_deadline",
                selectable: summary?.selectable !== false
              })
            : null);
        if (summary && summaryRace) {
          venue = { ...summary, races: [summaryRace] };
        }
      }
      if (!venue) {
        if (date === state.date) {
          venue = await loadVenueDetail(place, jcd);
        } else {
          const { response, payload } = await requestJson(
            `${API_ROOT}/schedule?date=${encodeURIComponent(date)}&jcd=${encodeURIComponent(jcd)}`,
            { cache: "default" }
          );
          if (!response.ok || payload?.ok === false || !payload?.selectedVenue) {
            throw new Error(payload?.error || `開催情報APIエラー：${response.status}`);
          }
          venue = payload.selectedVenue;
        }
      }

      if (syncGeneration !== state.predictionSyncGeneration) return;
      const race = racesOf(venue).find(item => item.raceNo === raceNo);
      if (!race) throw new Error("予想したレースの開催情報を確認できませんでした");

      state.current = {
        date,
        jcd,
        place: place || venue.place || "",
        raceNo,
        raceKey,
        race
      };
      state.resultRetryCount = 0;
      decorateVisibleVenues();
      render();
      void refreshCurrentResult();
    }

    function clearCurrentIfMismatched() {
      if (!state.current || selectedRaceKey() === state.current.raceKey) return;
      if (state.resultTimer) root.clearTimeout(state.resultTimer);
      state.resultTimer = 0;
      state.current = null;
      root.document.getElementById("raceResultStatus")?.remove();
      decorateVisibleVenues();
    }

    async function performOpen(place, raceNo, suppliedJcd = "", navigationGeneration = null) {
        const summary = overviewVenue(place, suppliedJcd);
        const jcd = normalizeJcd(suppliedJcd || summary?.jcd, place);
        const detailPromise = prefetchVenue(place, jcd);
        const runtimePromise = root.ChappyAppRuntime?.ensure?.("race");
        const [detail] = await Promise.all([detailPromise, runtimePromise]);
        const race = racesOf(detail).find(item => item.raceNo === numberOf(raceNo));
        if (!race) throw new Error("選択したレースを確認できませんでした");

        root.ChappyStartupGate?.activateRace?.();
        const placeSelect = root.document.getElementById("placeSelect");
        const raceSelect = root.document.getElementById("raceSelect");
        const fetchButton = root.document.getElementById("fetchRaceBtn");
        if (!placeSelect || !raceSelect || !fetchButton) throw new Error("レース選択画面を読み込めませんでした");
        if (typeof root.ChappyRaceSelection?.select !== "function") {
          throw new Error("レース選択機能を読み込めませんでした");
        }

        const raceKey = buildRaceKey({ date: state.date, jcd, raceNo: race.raceNo });
        const nextCurrent = {
          date: state.date,
          jcd,
          place,
          raceNo: race.raceNo,
          raceKey,
          race
        };

        await root.ChappyRaceSelection.select({
          mode: isFinished(race) ? "review" : "live",
          date: state.date,
          place,
          jcd,
          raceNo: race.raceNo,
          scheduleData: detail
        });

        const selectedJcd = normalizeJcd(
          placeSelect.options[placeSelect.selectedIndex]?.dataset?.jcd,
          placeSelect.value
        );
        if (
          placeSelect.value !== place ||
          selectedJcd !== jcd ||
          raceSelect.value !== `${race.raceNo}R`
        ) {
          throw new Error("選択したレースを確定できませんでした");
        }

        if (
          state.pendingOpen ||
          (
            navigationGeneration !== null &&
            !root.ChappyHomeDashboardV2
              ?.isViewIntentCurrent?.(
                navigationGeneration,
                "prediction"
              )
          )
        ) {
          return false;
        }

        state.current = nextCurrent;
        state.resultRetryCount = 0;
        decorateVisibleVenues();
        render();
        void refreshCurrentResult();
        fetchButton.click();
    }

    function open(place, raceNo, suppliedJcd = "") {
      let navigationGeneration = null;
      if (typeof root.ChappyHomeDashboardV2?.showPredictionLoading === "function") {
        navigationGeneration = root.ChappyHomeDashboardV2.showPredictionLoading(place, raceNo);
      } else {
        root.document.querySelector('.bottom-nav-item[data-view="prediction"]')?.click();
      }
      state.pendingOpen = { place, raceNo, suppliedJcd, navigationGeneration };
      if (state.openPromise) return state.openPromise;

      state.openPromise = (async () => {
        while (state.pendingOpen) {
          const intent = state.pendingOpen;
          state.pendingOpen = null;
          try {
            await performOpen(intent.place, intent.raceNo, intent.suppliedJcd, intent.navigationGeneration);
          } catch (error) {
            clearCurrentIfMismatched();
            if (!state.pendingOpen) throw error;
          }
        }
      })().catch(error => {
        root.ChappyHomeDashboardV2?.showPredictionError?.(error?.message);
        throw error;
      }).finally(() => {
        state.openPromise = null;
      });

      return state.openPromise;
    }

    async function load(force = false) {
      const home = root.ChappyHomeDashboardV2;
      if (home && typeof home.refresh === "function" && typeof home.getSchedule === "function") {
        const currentSchedule = home.getSchedule();
        if (!force && currentSchedule.length) {
          setOverview(
            currentSchedule,
            home.getDate?.() || jstDate(),
            false
          );
          return;
        }
        const overviewVersion = state.overviewVersion;
        await home.refresh(force);
        if (state.overviewVersion === overviewVersion) {
          setOverview(home.getSchedule(), home.getDate?.() || jstDate(), force);
        }
        return;
      }
      const { response, payload } = await requestJson(
        `${API_ROOT}/schedule?date=${encodeURIComponent(state.date)}`,
        { cache: force ? "reload" : "default" }
      );
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `開催情報APIエラー：${response.status}`);
      setOverview(payload?.venues, payload?.date || state.date, force);
    }

    function init() {
      ensureStyle();
      root.addEventListener("chappy:home-schedule", event => {
        setOverview(event.detail?.venues, event.detail?.date, event.detail?.force === true);
      });

      root.addEventListener("chappy:prediction-rendered", event => {
        syncCurrentFromPrediction(event.detail).catch(error => {
          if (error?.name !== "AbortError") {
            console.error("予想レース結果同期エラー", error);
          }
        });
      });

      const homeList = root.document.querySelector("[data-home-venues]");
      if (homeList) {
        new MutationObserver(decorateVisibleVenues).observe(homeList, { childList: true });
      }

      const resultArea = root.document.getElementById("resultArea");
      if (resultArea) {
        new MutationObserver(render).observe(resultArea, { childList: true });
      }

      root.document.addEventListener("click", event => {
        const venueButton = event.target.closest("[data-open-venue]");
        if (venueButton) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void expandVenue(venueButton);
          return;
        }

        const retry = event.target.closest("[data-flow-retry]");
        if (retry) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const place = retry.dataset.flowPlace || "";
          const jcd = retry.dataset.flowRetry || "";
          loadVenueDetail(place, jcd, true).then(decorateVisibleVenues).catch(error => console.error("開催場再取得エラー", error));
          return;
        }

        const button = event.target.closest("[data-flow-place][data-flow-race]");
        if (!button) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        open(button.dataset.flowPlace, button.dataset.flowRace, button.dataset.flowJcd)
          .catch(error => console.error("レース選択エラー", error));
      }, true);

      root.document.addEventListener("visibilitychange", () => {
        if (root.document.visibilityState === "visible" && isPredictionActive()) {
          state.resultRetryCount = 0;
          void refreshCurrentResult(true);
        } else if (state.resultTimer) {
          root.clearTimeout(state.resultTimer);
          state.resultTimer = 0;
        }
      });

      root.addEventListener("chappy:view-changed", event => {
        if (event?.detail?.view === "prediction") {
          state.resultRetryCount = 0;
          void refreshCurrentResult(true);
        } else if (state.resultTimer) {
          root.clearTimeout(state.resultTimer);
          state.resultTimer = 0;
        }
      });

      const homeSchedule = root.ChappyHomeDashboardV2?.getSchedule?.() || [];
      if (homeSchedule.length) {
        setOverview(
          homeSchedule,
          root.ChappyHomeDashboardV2?.getDate?.() || state.date,
          false
        );
      } else {
        load().catch(error => console.error("開催一覧取得エラー", error));
      }
    }

    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }

    return Object.freeze({
      load,
      open,
      expandVenue,
      prefetchVenue,
      getVenueDetail,
      render,
      refreshCurrentResult,
      getCurrent: () => state.current ? { ...state.current } : null
    });
  }

  return Object.freeze({
    ACTUAL_PURCHASE_KEY,
    PLACE_TO_JCD,
    jstDate,
    normalizeJcd,
    buildRaceKey,
    normalizeRace,
    racesOf,
    isFinished,
    resultCombination,
    purchaseTickets,
    createStatus,
    install
  });
});
