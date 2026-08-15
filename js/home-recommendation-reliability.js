/* =========================================================
  チャッピーボートレースAI
  「本日のおすすめレース」表示の信頼性補強

  当日要約を必ず再検証し、最新runが暫定でも、直前に正式選定され
  まだ締切前のレースを軽量要約のpredictionsから復元する。
  予想ロジック、選定基準、買い目は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyHomeRecommendationReliability = Object.freeze(api);
    api.install(root);
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const SUMMARY_ROOT = "data/predictions/summaries";
  const REQUEST_TIMEOUT_MS = 20000;
  const RETRY_INTERVAL_MS = 60000;
  const INSTALL_FLAG = "__chappyHomeRecommendationReliabilityInstalled";

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function number(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function jstDate(now = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .format(now)
      .replaceAll("-", "");
  }

  function jcdOf(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits ? digits.padStart(2, "0").slice(-2) : "";
  }

  function raceKey(item) {
    const jcd = jcdOf(item?.jcd);
    const place = String(item?.place || "").trim();
    const raceNo = number(item?.raceNo);
    return raceNo ? `${jcd || place}-${raceNo}` : "";
  }

  function sourceTime(item) {
    const parsed = Date.parse(
      String(
        item?.recommendationCheckedAt ||
        item?.selectedAt ||
        item?.checkedAt ||
        ""
      )
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function candidateFromCompared(item, run) {
    if (!item || typeof item !== "object") return null;
    return {
      ...item,
      recommendationThreshold: number(run?.threshold, 70) || 70,
      recommendationCheckedAt: String(run?.checkedAt || ""),
      recommendationSource: "run"
    };
  }

  function candidateFromPrediction(record) {
    if (!record || typeof record !== "object") return null;
    const selection = record.selection || {};
    const score = Number(selection.score);
    if (!Number.isFinite(score)) return null;

    return {
      jcd: String(record.jcd || ""),
      place: String(record.place || ""),
      raceNo: number(record.raceNo),
      deadlineAt: String(record.deadlineAt || ""),
      type: String(selection.type || selection.label || ""),
      score,
      scoreSource: "summary.predictions.selection.score",
      scenarioLabel: String(selection.scenarioLabel || ""),
      selectionReady:
        selection.ready === true &&
        selection.qualified !== false &&
        selection.selected !== false,
      selectionStatus: String(selection.status || ""),
      legacyType: String(selection.type || ""),
      recommendationThreshold: number(selection.threshold, 70) || 70,
      recommendationCheckedAt: String(record.selectedAt || ""),
      recommendationSource: "selected-prediction"
    };
  }

  function preferCandidate(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    const existingReady = existing.selectionReady === true;
    const incomingReady = incoming.selectionReady === true;
    const existingTime = sourceTime(existing);
    const incomingTime = sourceTime(incoming);
    const preferred = existingReady !== incomingReady
      ? incomingReady ? incoming : existing
      : incomingTime > existingTime ? incoming : existing;
    const fallback = preferred === incoming ? existing : incoming;

    return {
      ...fallback,
      ...preferred,
      evaluation: preferred.evaluation || fallback.evaluation,
      deadlineAt: preferred.deadlineAt || fallback.deadlineAt,
      recommendationThreshold:
        number(preferred.recommendationThreshold, 0) ||
        number(fallback.recommendationThreshold, 70) ||
        70
    };
  }

  function collectSummaryCandidates(data) {
    const byRace = new Map();

    rows(data?.runs).forEach(run => {
      const candidates = [
        ...rows(run?.compared),
        ...(run?.best ? [run.best] : [])
      ];
      candidates.forEach(item => {
        const candidate = candidateFromCompared(item, run);
        const key = raceKey(candidate);
        if (!key) return;
        byRace.set(key, preferCandidate(byRace.get(key), candidate));
      });
    });

    rows(data?.predictions).forEach(record => {
      const candidate = candidateFromPrediction(record);
      const key = raceKey(candidate);
      if (!key) return;
      byRace.set(key, preferCandidate(byRace.get(key), candidate));
    });

    return [...byRace.values()];
  }

  function findScheduledRace(item, schedule, nowMs = Date.now()) {
    const place = String(item?.place || "").trim();
    const jcd = jcdOf(item?.jcd);
    const raceNo = number(item?.raceNo);
    const venue = rows(schedule).find(row =>
      jcd
        ? jcdOf(row?.jcd) === jcd
        : String(row?.place || "").trim() === place
    );
    if (!venue || raceNo < 1 || raceNo > 12) return null;

    const detailedRace = rows(venue?.races).find(row =>
      number(row?.raceNo ?? row?.rno) === raceNo
    );
    const overviewRace = number(venue?.currentRaceNo) === raceNo
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

    const status = String(race.status || "").toLowerCase();
    if (
      race.closed === true ||
      race.finished === true ||
      race.ended === true ||
      venue?.finalClosed === true ||
      ["closed", "finished", "ended"].includes(status)
    ) {
      return null;
    }

    const deadlineAt = String(
      race.deadlineAt || race.deadline || race.closeAt || ""
    );
    const deadlineMs = Date.parse(deadlineAt);
    if (!Number.isFinite(deadlineMs) || deadlineMs <= nowMs) return null;

    return {
      jcd: jcdOf(venue?.jcd),
      place: String(venue?.place || place).trim(),
      raceNo,
      deadlineAt,
      selectable: true
    };
  }

  function decisionFor(item) {
    const type = [item?.legacyType, item?.type, item?.scoreType]
      .map(value => String(value || ""))
      .join(" ");
    const scenario = String(item?.scenarioLabel || "");
    const score = number(item?.score);

    if (/見送り|skip/i.test(type)) {
      return { key: "skip", label: "見送り推奨", score };
    }
    if (
      /波乱|万舟/.test(type) ||
      (/外|カド|まくり|差し|攻め|展開突き/.test(scenario) && !/イン逃げ/.test(scenario))
    ) {
      return { key: "upset", label: "波乱候補", score };
    }
    if (score < 60) {
      return { key: "skip", label: "見送り推奨", score };
    }
    return { key: "main", label: "勝負候補", score };
  }

  function selectSummaryRecommendations(data, schedule, nowMs = Date.now()) {
    return collectSummaryCandidates(data)
      .map(item => {
        const score = Number(item?.score);
        const threshold = number(item?.recommendationThreshold, 70) || 70;
        if (
          item?.selectionReady !== true ||
          !Number.isFinite(score) ||
          score < threshold
        ) {
          return null;
        }

        const scheduledRace = findScheduledRace(item, schedule, nowMs);
        if (!scheduledRace) return null;

        const next = {
          ...item,
          ...scheduledRace
        };
        const decision = decisionFor(next);
        if (decision.key === "skip") return null;
        return { ...next, decision };
      })
      .filter(Boolean)
      .sort((a, b) =>
        number(b?.score) - number(a?.score) ||
        Date.parse(a?.deadlineAt || 0) - Date.parse(b?.deadlineAt || 0)
      )
      .slice(0, 3);
  }

  function summaryCheckedAt(data) {
    const values = [
      data?.updatedAt,
      ...rows(data?.runs).map(run => run?.checkedAt),
      ...rows(data?.predictions).map(record => record?.selectedAt)
    ]
      .map(value => Date.parse(String(value || "")))
      .filter(Number.isFinite);
    return values.length ? new Date(Math.max(...values)) : null;
  }

  async function fetchSummary({
    date = jstDate(),
    fetchImpl = typeof fetch === "function" ? fetch : null,
    now = Date.now,
    timeoutMs = REQUEST_TIMEOUT_MS
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new Error("当日おすすめ要約を取得できません");
    }

    const controller = typeof AbortController === "function"
      ? new AbortController()
      : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : 0;
    const url = `${SUMMARY_ROOT}/${date}.json?t=${Number(now())}`;

    try {
      const response = await fetchImpl(url, {
        cache: "no-store",
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!response?.ok) {
        throw new Error(`当日おすすめ要約 HTTP ${response?.status || 0}`);
      }
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function timeOf(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "--:--";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function reason(item) {
    if (item?.scenarioLabel) return String(item.scenarioLabel);
    const source = item?.decision?.key === "upset"
      ? item?.evaluation?.manshu?.reasons
      : item?.evaluation?.honmei?.reasons;
    if (rows(source).length) return String(source[0]);
    return item?.decision?.key === "upset"
      ? "外の攻めから波乱を狙う"
      : "最有力展開の成立度が高い";
  }

  function recommendationHtml(item, index) {
    const decision = item.decision || decisionFor(item);
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
    return `<button class="home-v2-recommend-card is-${escapeHtml(decision.key)}" type="button" data-place="${escapeHtml(item.place)}" data-race="${number(item.raceNo)}" data-reliable-recommendation="true"><div class="home-v2-card-top"><span class="home-v2-medal">${medal}</span><span class="home-v2-decision">${escapeHtml(decision.label)}</span><span class="home-v2-arrow">›</span></div><strong>${escapeHtml(item.place)} ${number(item.raceNo)}R</strong><span class="home-v2-deadline">締切 <b>${escapeHtml(timeOf(item.deadlineAt))}</b></span><span class="home-v2-score-row is-single"><span>勝負レース評価<b>${Math.round(number(item.score))}</b><small>点</small></span></span><small class="home-v2-reason">${escapeHtml(reason(item))}</small></button>`;
  }

  function renderRecommendations(items, checkedAt, documentObject) {
    if (!rows(items).length || !documentObject) return false;
    const container = documentObject.querySelector?.("[data-home-recommendations]");
    if (!container) return false;

    const nextKey = items.map(item => raceKey(item)).join("|");
    if (
      container.dataset.reliableRecommendationKey === nextKey &&
      container.querySelector?.("[data-reliable-recommendation]")
    ) {
      return false;
    }

    container.innerHTML = items.map(recommendationHtml).join("");
    container.dataset.reliableRecommendationKey = nextKey;
    container.dataset.reliableRecommendations = "true";

    const updated = documentObject.querySelector?.("[data-home-updated]");
    if (updated && checkedAt instanceof Date && Number.isFinite(checkedAt.getTime())) {
      updated.textContent = `最終更新 ${timeOf(checkedAt)}`;
    }
    return true;
  }

  function install(root) {
    if (!root || root[INSTALL_FLAG]) return false;
    root[INSTALL_FLAG] = true;

    const documentObject = root.document || (typeof document !== "undefined" ? document : null);
    let latestSchedule = [];
    let syncPromise = null;
    let expiryTimer = 0;
    let lastAttemptAt = 0;

    const scheduleExpiry = items => {
      if (expiryTimer) root.clearTimeout(expiryTimer);
      expiryTimer = 0;
      const nearest = rows(items)
        .map(item => Date.parse(item?.deadlineAt || ""))
        .filter(value => Number.isFinite(value) && value > Date.now())
        .sort((a, b) => a - b)[0];
      if (!nearest) return;
      expiryTimer = root.setTimeout(() => {
        expiryTimer = 0;
        void sync(true);
      }, Math.max(250, nearest - Date.now() + 250));
    };

    const resolveSchedule = () => {
      const fromHome = root.ChappyHomeDashboardV2?.getSchedule?.();
      if (rows(fromHome).length) latestSchedule = fromHome;
      return latestSchedule;
    };

    const sync = (force = false) => {
      if (syncPromise) return syncPromise;
      if (!force && Date.now() - lastAttemptAt < 5000) return Promise.resolve(false);
      const schedule = resolveSchedule();
      if (!schedule.length) return Promise.resolve(false);
      lastAttemptAt = Date.now();

      syncPromise = fetchSummary({ date: jstDate() })
        .then(data => {
          const items = selectSummaryRecommendations(data, resolveSchedule(), Date.now());
          if (items.length) {
            renderRecommendations(items, summaryCheckedAt(data), documentObject);
            scheduleExpiry(items);
            return true;
          }
          return false;
        })
        .catch(error => {
          console.warn("本日のおすすめ再検証エラー", error);
          return false;
        })
        .finally(() => {
          syncPromise = null;
        });
      return syncPromise;
    };

    root.addEventListener?.("chappy:home-schedule", event => {
      latestSchedule = rows(event?.detail?.venues);
      root.setTimeout(() => void sync(true), 0);
    });
    root.addEventListener?.("pageshow", () => void sync(true));

    documentObject?.addEventListener?.("visibilitychange", () => {
      if (documentObject.visibilityState === "visible") void sync(true);
    });

    const start = () => {
      root.setTimeout(() => void sync(true), 250);
      root.setInterval?.(() => void sync(true), RETRY_INTERVAL_MS);

      const homeRoot = documentObject?.getElementById?.("homeDashboardV2");
      if (homeRoot && typeof root.MutationObserver === "function") {
        const observer = new root.MutationObserver(() => {
          const container = documentObject.querySelector?.("[data-home-recommendations]");
          const hasCard = Boolean(container?.querySelector?.(".home-v2-recommend-card"));
          if (!hasCard) root.setTimeout(() => void sync(false), 50);
        });
        observer.observe(homeRoot, { childList: true, subtree: true });
      }
    };

    if (documentObject?.readyState === "loading") {
      documentObject.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }

    root.ChappyHomeRecommendationReliabilitySync = sync;
    return true;
  }

  return {
    rows,
    number,
    jstDate,
    jcdOf,
    raceKey,
    candidateFromCompared,
    candidateFromPrediction,
    preferCandidate,
    collectSummaryCandidates,
    findScheduledRace,
    decisionFor,
    selectSummaryRecommendations,
    summaryCheckedAt,
    fetchSummary,
    reason,
    recommendationHtml,
    renderRecommendations,
    install
  };
});
