/* =========================================================
  チャッピーボートレースAI
  js/stats.js 完全版
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;
  const S = window.ChappyStorage;

  function calcPayout(odds, amount) {
    const o = U.safeNumber(odds, 0);
    const a = U.safeNumber(amount, 0);
    return Math.floor(o * a);
  }

    function buildResultRecord({
    result,
    odds,
    amount
  }) {
    const normalizedResult =
      (
        String(result || "")
          .match(/[1-6]/g) || []
      )
        .slice(0, 3)
        .join("-");

    let predictionSnapshot = null;

    try {
      const raw =
        localStorage.getItem(
          "chappy_latest_prediction_v1"
        );

      predictionSnapshot =
        raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn(
        "保存予想の読み込みに失敗",
        error
      );
    }

    const predictionTickets =
      Array.isArray(
        predictionSnapshot?.ticketRanks
      )
        ? predictionSnapshot.ticketRanks
        : [];

    const matchedTicket =
      predictionTickets.find(item => {
        const normalizedTicket =
          (
            String(item?.ticket || "")
              .match(/[1-6]/g) || []
          )
            .slice(0, 3)
            .join("-");

        return (
          normalizedResult &&
          normalizedTicket ===
            normalizedResult
        );
      }) || null;

    return {
      result:
        U.safeText(result),
      odds:
        U.safeNumber(odds, 0),
      amount:
        U.safeNumber(amount, 0),
      payout:
        calcPayout(odds, amount),

      predictionChecked:
        Boolean(predictionSnapshot),
      predictionHit:
        Boolean(matchedTicket),
      predictionRank:
        matchedTicket?.rank || "",
      predictionScore:
        matchedTicket?.score || 0,
      predictionOdds:
        matchedTicket?.odds ?? null,
      predictionOddsValue:
        matchedTicket?.oddsValue || "",

      predictionRaceKey:
        predictionSnapshot?.raceKey || "",
      predictionPlace:
        predictionSnapshot?.place || "",
      predictionRaceNo:
        predictionSnapshot?.raceNo || 0,
      predictionDate:
        predictionSnapshot?.date || "",

      predictionTickets
    };
  }
  
  function calcStats(results) {
    const list = Array.isArray(results) ? results : [];
    const count = list.length;
    const totalBet = list.reduce((sum, r) => sum + U.safeNumber(r.amount, 0), 0);
    const totalPayout = list.reduce((sum, r) => sum + U.safeNumber(r.payout, 0), 0);
    const profit = totalPayout - totalBet;
    const recoveryRate = totalBet > 0 ? (totalPayout / totalBet) * 100 : 0;

    return {
      count,
      totalBet,
      totalPayout,
      profit,
      recoveryRate
    };
  }

  function renderStats() {
    const results = S.loadResults();
    const stats = calcStats(results);

    U.setHtml("statsArea", `
      <div class="v3-final-grid">
        <div class="v3-final-block">
          <h3>購入数</h3>
          <p>${stats.count}件</p>
        </div>
        <div class="v3-final-block">
          <h3>総購入</h3>
          <p>${U.formatMoney(stats.totalBet)}</p>
        </div>
        <div class="v3-final-block">
          <h3>総払戻</h3>
          <p>${U.formatMoney(stats.totalPayout)}</p>
        </div>
        <div class="v3-final-block">
          <h3>収支</h3>
          <p>${U.formatMoney(stats.profit)}</p>
        </div>
        <div class="v3-final-block">
          <h3>回収率</h3>
          <p>${U.round(stats.recoveryRate, 1)}%</p>
        </div>
      </div>
    `);
  }

  function updateAutoPayout() {
    const odds = U.byId("oddsInput")?.value;
    const amount = U.byId("betAmountInput")?.value;
    const payout = calcPayout(odds, amount);
    U.setText("autoPayoutText", `払戻金：${U.formatMoney(payout)}`);
  }

  function saveCurrentResult() {
    const result = U.byId("raceResultInput")?.value;
    const odds = U.byId("oddsInput")?.value;
    const amount = U.byId("betAmountInput")?.value;

    if (!result) {
      alert("結果を入力してください");
      return;
    }

    const record = buildResultRecord({ result, odds, amount });
    S.addResult(record);

    U.byId("raceResultInput").value = "";
    U.byId("oddsInput").value = "";
    U.byId("betAmountInput").value = "100";

    updateAutoPayout();
    renderStats();
  }

  function undoLatestResult() {
    S.removeLatestResult();
    renderStats();
  }

  function initStatsEvents() {
    U.byId("oddsInput")?.addEventListener("input", updateAutoPayout);
    U.byId("betAmountInput")?.addEventListener("input", updateAutoPayout);
    U.byId("saveResultBtn")?.addEventListener("click", saveCurrentResult);
    U.byId("undoResultBtn")?.addEventListener("click", undoLatestResult);

    updateAutoPayout();
    renderStats();
  }

  window.ChappyStats = {
    calcPayout,
    buildResultRecord,
    calcStats,
    renderStats,
    updateAutoPayout,
    saveCurrentResult,
    undoLatestResult,
    initStatsEvents
  };
})();