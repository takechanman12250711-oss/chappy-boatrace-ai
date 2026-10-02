(function (root) {
  "use strict";

  if (root.ChappyPredictionLoadingWatchdog) return;

  const FIRST_TIMEOUT_MS = 20000;
  let token = 0;
  let timer = 0;
  let expected = null;

  function clearTimer() {
    if (timer) root.clearTimeout(timer);
    timer = 0;
  }

  function normalizeRace(value) {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function stillLoading() {
    const area = root.document?.getElementById?.("resultArea");
    return area?.dataset?.raceLoading === "true";
  }

  function selectedMatches() {
    if (!expected) return false;
    const place = root.document?.getElementById?.("placeSelect")?.value || "";
    const race = normalizeRace(root.document?.getElementById?.("raceSelect")?.value);
    return String(place) === expected.place && race === expected.raceNo;
  }

  function fail(message) {
    clearTimer();
    if (!stillLoading()) return;
    if (typeof root.ChappyHomeDashboardV2?.showPredictionError === "function") {
      root.ChappyHomeDashboardV2.showPredictionError(message);
      return;
    }
    const area = root.document?.getElementById?.("resultArea");
    if (area) {
      area.dataset.raceLoading = "error";
      area.innerHTML = '<div class="prediction-loading-state is-error" role="alert"><strong>レースを読み込めませんでした</strong><small>通信状態を確認して、ホームからもう一度レースを選んでください。</small></div>';
    }
  }

  function start(place, raceNo) {
    token += 1;
    clearTimer();
    expected = {
      place: String(place || "").trim(),
      raceNo: normalizeRace(raceNo)
    };
    const currentToken = token;
    timer = root.setTimeout(() => {
      if (currentToken !== token || !stillLoading() || !selectedMatches()) return;
      fail("AI予想の準備が20秒を超えました。自動再開始はせず、この画面で停止しました。もう一度レースを選んでください。");
    }, FIRST_TIMEOUT_MS);
  }

  function handleRaceIntent(event) {
    const button = event?.target?.closest?.(".home-v2-race[data-place][data-race],.home-v2-recommend-card[data-place][data-race]");
    if (!button || button.disabled === true) return;
    start(button.dataset.place, button.dataset.race);
  }

  root.document?.addEventListener?.("click", handleRaceIntent, true);
  root.addEventListener?.("chappy:prediction-rendered", () => {
    token += 1;
    clearTimer();
    expected = null;
  });
  root.addEventListener?.("chappy:view-changed", event => {
    if (event?.detail?.view !== "prediction") {
      token += 1;
      clearTimer();
      expected = null;
    }
  });

  root.ChappyPredictionLoadingWatchdog = Object.freeze({
    start,
    isLoading: stillLoading,
    firstTimeoutMs: FIRST_TIMEOUT_MS
  });
})(window);
