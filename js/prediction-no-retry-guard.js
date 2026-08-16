(function (root) {
  "use strict";

  const FIRST_TIMEOUT_MS = 20000;
  let timer = 0;
  let token = 0;

  function clearTimer() {
    if (timer) root.clearTimeout(timer);
    timer = 0;
  }

  function normalizeRace(value) {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function stillLoading() {
    return root.document?.getElementById?.("resultArea")?.dataset?.raceLoading === "true";
  }

  function fail(message) {
    clearTimer();
    if (!stillLoading()) return;
    root.ChappyHomeDashboardV2?.showPredictionError?.(message);
  }

  function start(place, raceNo) {
    token += 1;
    clearTimer();
    const currentToken = token;
    const expectedPlace = String(place || "").trim();
    const expectedRace = normalizeRace(raceNo);
    timer = root.setTimeout(() => {
      if (currentToken !== token || !stillLoading()) return;
      const placeNow = root.document?.getElementById?.("placeSelect")?.value || "";
      const raceNow = normalizeRace(root.document?.getElementById?.("raceSelect")?.value);
      if (String(placeNow) !== expectedPlace || raceNow !== expectedRace) return;
      fail("AI予想の準備が20秒を超えました。自動再開始はせず、この画面で停止しました。もう一度レースを選んでください。");
    }, FIRST_TIMEOUT_MS);
  }

  root.document?.addEventListener?.("click", event => {
    const button = event?.target?.closest?.(".home-v2-race[data-place][data-race],.home-v2-recommend-card[data-place][data-race]");
    if (!button || button.disabled === true) return;
    start(button.dataset.place, button.dataset.race);
  }, true);

  root.addEventListener?.("chappy:prediction-rendered", () => {
    token += 1;
    clearTimer();
  });
  root.addEventListener?.("chappy:view-changed", event => {
    if (event?.detail?.view !== "prediction") {
      token += 1;
      clearTimer();
    }
  });

  root.ChappyPredictionNoRetryGuard = Object.freeze({ start, firstTimeoutMs: FIRST_TIMEOUT_MS });
})(window);
