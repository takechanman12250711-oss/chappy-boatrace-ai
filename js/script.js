/* =========================================================
  チャッピーボートレースAI
  script.js 完全版

  役割：
  - ボタン処理
  - API取得
  - renderAll()接続
========================================================= */

(function () {
  "use strict";

  const PLACE_CODE_MAP = {
    桐生: "01",
    戸田: "02",
    江戸川: "03",
    平和島: "04",
    多摩川: "05",
    浜名湖: "06",
    蒲郡: "07",
    常滑: "08",
    津: "09",
    三国: "10",
    びわこ: "11",
    住之江: "12",
    尼崎: "13",
    鳴門: "14",
    丸亀: "15",
    児島: "16",
    宮島: "17",
    徳山: "18",
    下関: "19",
    若松: "20",
    芦屋: "21",
    福岡: "22",
    唐津: "23",
    大村: "24"
  };

  let lastRaceData = null;

  document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ script.js 読み込みOK");
    setDefaultDate();

    const fetchBtn = document.getElementById("fetchRaceBtn");
    const reloadBtn = document.getElementById("reloadRaceBtn");
    const oddsBtn = document.getElementById("refreshOddsBtn");

    if (fetchBtn) fetchBtn.addEventListener("click", fetchAndRenderRace);
    if (reloadBtn) reloadBtn.addEventListener("click", fetchAndRenderRace);
    if (oddsBtn) oddsBtn.addEventListener("click", refreshOddsOnly);

    updateStatus("待機中");
  });

  function setDefaultDate() {
    const input = document.getElementById("dateInput");
    if (!input || input.value) return;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    input.value = `${yyyy}-${mm}-${dd}`;
  }

  async function fetchAndRenderRace() {
    try {
      clearErrorArea();
      updateStatus("取得中...");

      const params = getRaceParams();

      console.log("🚤 race params", params);

      const data = await fetchRaceData(params);

      lastRaceData = data;

      console.log("✅ API成功 entries=", data?.entries?.length || 0, data);

      const prediction = createPredictionSafe(data) || createEmergencyPrediction(data);
      function createEmergencyPrediction(data) {
  return {
    ok: true,
    version: "emergency",
    race: data,
    indexes: { scores: [], totalRanking: [] },
    mainSheet: { evaluations: [], formation: {} },
    manshuSheet: { candidates: [], formation: [] },
    formation: {},
    finalComment: {
      title: "緊急表示",
      comment: "prediction.jsが失敗したため、取得データのみ表示します。"
    }
  };
}
      const theory = createTheorySafe(data);
      const ai = createAISafe(data);
      const odds = data?.odds || null;

      console.log("✅ prediction確認", prediction);
　　　　
      if (!prediction || typeof prediction !== "object") {
        throw new Error("prediction.js から有効な予想データが返っていません。");
      }

      if (typeof window.renderAll === "function") {
        window.renderAll(prediction);
      } else {
        throw new Error("renderAll() が見つかりません。render.jsを確認してください。");
      }

      updateStatus("取得完了");

    } catch (error) {
      console.error("❌ fetchAndRenderRace error", error);
      updateStatus("エラー");
      showError(
  `${error.message || "取得に失敗しました"}

${error.stack || "スタック情報を取得できません"}`
);
    }
  }

  function getRaceParams() {
    const place = document.getElementById("placeSelect")?.value || "大村";
    const raceText = document.getElementById("raceSelect")?.value || "1R";
    const dateValue = document.getElementById("dateInput")?.value;

    const jcd = PLACE_CODE_MAP[place];

    if (!jcd) {
      throw new Error(`場コードが見つかりません：${place}`);
    }

    const rno = Number(String(raceText).replace("R", ""));
    const date = String(dateValue || "").replaceAll("-", "");

    if (!rno) {
      throw new Error("レース番号が不正です");
    }

    if (!date || date.length !== 8) {
      throw new Error("日付を入力してください");
    }

    return {
      place,
      jcd,
      rno,
      date
    };
  }

    async function fetchRaceData(params) {
    if (
      window.ChappyAPI &&
      typeof window.ChappyAPI.getRace === "function"
    ) {
      return await window.ChappyAPI.getRace(params);
    }

    if (
      window.ChappyAPI &&
      typeof window.ChappyAPI.fetchRace === "function"
    ) {
      return await window.ChappyAPI.fetchRace(params);
    }

    if (typeof window.fetchRace === "function") {
      return await window.fetchRace(params);
    }

    const url =
      `/api/race?jcd=${encodeURIComponent(params.jcd)}` +
      `&rno=${encodeURIComponent(params.rno)}` +
      `&date=${encodeURIComponent(params.date)}`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`APIエラー：${res.status}`);
    }

    return await res.json();
  }

  function createPredictionSafe(data) {
    try {
      if (typeof window.createPrediction !== "function") {
        throw new Error(
          "window.createPrediction が見つかりません"
        );
      }

      return window.createPrediction(data);

    } catch (error) {
      console.error("prediction.js error", error);

      return {
        ok: false,
        version: "prediction-error",
        race: data,

        indexes: {
          scores: [],
          totalRanking: []
        },

        mainSheet: {
          evaluations: [],
          formation: {}
        },

        manshuSheet: {
          candidates: [],
          formation: []
        },

        formation: {},

        finalComment: {
          title: "prediction.jsエラー詳細",
          comment:
            `${error?.name || "Error"}：` +
            `${error?.message || String(error)}`
        }
      };
    }
  }


  function createTheorySafe(data) {
    try {
      if (typeof window.createTheory === "function") {
        return window.createTheory(data);
      }

      if (typeof window.analyzeTheory === "function") {
        return window.analyzeTheory(data);
      }
    } catch (error) {
      console.warn("theory.js error", error);
    }

    return null;
  }

  function createAISafe(data) {
    try {
      if (typeof window.createAI === "function") {
        return window.createAI(data);
      }

      if (typeof window.createAIIndex === "function") {
        return window.createAIIndex(data);
      }
    } catch (error) {
      console.warn("ai.js error", error);
    }

    return null;
  }

  async function refreshOddsOnly() {
  if (!lastRaceData) {
    updateStatus(
      "先に出走表を取得してください"
    );
    return;
  }

  try {
    clearErrorArea();
    updateStatus("オッズ取得中...");

    const params = getRaceParams();

    const url =
      `/api/odds` +
      `?jcd=${encodeURIComponent(params.jcd)}` +
      `&rno=${encodeURIComponent(params.rno)}` +
      `&date=${encodeURIComponent(params.date)}`;

    const response = await fetch(url);
    const oddsData = await response.json();

    if (
      !response.ok ||
      !oddsData ||
      oddsData.ok === false
    ) {
      throw new Error(
        oddsData?.error ||
        `オッズAPIエラー：${response.status}`
      );
    }

    lastRaceData = {
      ...lastRaceData,
      odds: oddsData
    };

    const prediction =
      createPredictionSafe(lastRaceData);

    if (
      !prediction ||
      typeof prediction !== "object"
    ) {
      throw new Error(
        "予想データを再作成できませんでした"
      );
    }

        const byTicket =
      oddsData.byTicket || {};

    const oddsHistoryKey =
      `chappy_odds_history_` +
      `${params.date}_` +
      `${params.jcd}_` +
      `${params.rno}`;

    let previousByTicket = {};

    try {
      const previousRaw =
        localStorage.getItem(
          oddsHistoryKey
        );

      if (previousRaw) {
        const previousData =
          JSON.parse(previousRaw);

        previousByTicket =
          previousData?.byTicket ||
          previousData ||
          {};
      }
    } catch (historyError) {
      console.warn(
        "前回オッズの読み込みに失敗",
        historyError
      );
    }

    const oddsMovements =
      Object.entries(byTicket)
        .map(
          ([
            ticket,
            currentRaw
          ]) => {
            const currentOdds =
              Number(currentRaw);

            const previousOdds =
              Number(
                previousByTicket[
                  ticket
                ]
              );

            if (
              !Number.isFinite(
                currentOdds
              ) ||
              !Number.isFinite(
                previousOdds
              ) ||
              currentOdds <= 0 ||
              previousOdds <= 0
            ) {
              return null;
            }

            const changeRate =
              (
                (
                  currentOdds -
                  previousOdds
                ) /
                previousOdds
              ) * 100;

            if (
              Math.abs(changeRate) <
              20
            ) {
              return null;
            }

            return {
              ticket,
              previousOdds,
              currentOdds,
              changeRate,
              direction:
                changeRate < 0
                  ? "急落"
                  : "上昇"
            };
          }
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            Math.abs(
              b.changeRate
            ) -
            Math.abs(
              a.changeRate
            )
        )
        .slice(0, 10);

    prediction.oddsMovements =
      oddsMovements;

    try {
      localStorage.setItem(
        oddsHistoryKey,
        JSON.stringify({
          savedAt:
            new Date()
              .toISOString(),
          byTicket
        })
      );
    } catch (historyError) {
      console.warn(
        "今回オッズの保存に失敗",
        historyError
      );
    }

    const attachOdds = list =>
  Array.isArray(list)
    ? list.map(item => {
        const odds =
          byTicket[item?.ticket];

        if (
          odds === undefined ||
          odds === null
        ) {
          return item;
        }

        const numericOdds =
          Number(odds);

        const aiScore =
          Number(item?.score || 0);

        let oddsValue = "標準";

        if (
          aiScore < 65 &&
          numericOdds >= 10
        ) {
          oddsValue = "高配当注意";
        } else if (
          aiScore >= 65 &&
          numericOdds >= 100
        ) {
          oddsValue = "大穴妙味";
        } else if (
          aiScore >= 65 &&
          numericOdds >= 30
        ) {
          oddsValue = "穴妙味";
        } else if (
          aiScore >= 75 &&
          numericOdds >= 10
        ) {
          oddsValue = "妙味あり";
        } else if (
          numericOdds < 5
        ) {
          oddsValue = "低配当";
        }

        return {
          ...item,
          odds: numericOdds,
          oddsValue
        };
      })
    : [];

        const ticketRanksWithOdds =
      attachOdds(
        prediction.ticketRanks
      );

    const budgetInput =
      document.getElementById(
        "allocationBudgetInput"
      );

    const requestedBudget =
      Number(
        budgetInput?.value || 1000
      );

    const totalBudget =
      Math.max(
        100,
        Math.floor(
          (
            Number.isFinite(
              requestedBudget
            )
              ? requestedBudget
              : 1000
          ) / 100
        ) * 100
      );

    const valueMultiplier = {
      低配当: 0.55,
      標準: 0.9,
      妙味あり: 1.2,
      穴妙味: 1.1,
      大穴妙味: 0.8,
      高配当注意: 0.4,
      未判定: 0.7
    };

    const weightedTickets =
      ticketRanksWithOdds.map(
        (item, index) => {
          const score =
            Math.max(
              1,
              Number(
                item?.score || 1
              )
            );

          const multiplier =
            valueMultiplier[
              item?.oddsValue
            ] ?? 0.8;

          return {
            ticket:
              String(
                item?.ticket || ""
              ),
            index,
            weight:
              score * multiplier
          };
        }
      );

    const totalWeight =
      weightedTickets.reduce(
        (sum, item) =>
          sum + item.weight,
        0
      );

    const budgetUnits =
      Math.floor(
        totalBudget / 100
      );

    const allocationRows =
      weightedTickets.map(item => {
        const exactUnits =
          totalWeight > 0
            ? (
                budgetUnits *
                item.weight
              ) / totalWeight
            : 0;

        const units =
          Math.floor(exactUnits);

        return {
          ...item,
          units,
          remainder:
            exactUnits - units
        };
      });

    const usedUnits =
      allocationRows.reduce(
        (sum, item) =>
          sum + item.units,
        0
      );

    const remainingUnits =
      budgetUnits - usedUnits;

    allocationRows.sort(
      (a, b) =>
        b.remainder -
          a.remainder ||
        a.index - b.index
    );

    for (
      let index = 0;
      index < remainingUnits;
      index += 1
    ) {
      if (!allocationRows.length) {
        break;
      }

      allocationRows[
        index %
        allocationRows.length
      ].units += 1;
    }

    const allocationByTicket =
      new Map(
        allocationRows.map(
          item => [
            item.ticket,
            item.units * 100
          ]
        )
      );

    const applyAllocation =
      list =>
        attachOdds(list).map(
          item => ({
            ...item,
            recommendedAmount:
              allocationByTicket.get(
                String(
                  item?.ticket || ""
                )
              ) || 0
          })
        );

    prediction.ticketRanks =
      applyAllocation(
        prediction.ticketRanks
      );

    prediction.allocationBudget =
      totalBudget;

    prediction.allocatedTotal =
      prediction.ticketRanks.reduce(
        (sum, item) =>
          sum +
          Number(
            item?.recommendedAmount ||
            0
          ),
        0
      );

    if (prediction.finalAi) {
      prediction.finalAi = {
        ...prediction.finalAi,
        ticketRanks:
          applyAllocation(
            prediction.finalAi
              .ticketRanks
          ),
        topTickets:
          applyAllocation(
            prediction.finalAi
              .topTickets
          ),
        manshuTickets:
          applyAllocation(
            prediction.finalAi
              .manshuTickets
          )
      };
    }

        try {
      const predictionSnapshot = {
        raceKey:
          `${params.date}-` +
          `${params.jcd}-` +
          `${params.rno}`,
        place: params.place,
        jcd: params.jcd,
        raceNo: params.rno,
        date: params.date,
        savedAt:
          new Date().toISOString(),
        ticketRanks:
          Array.isArray(
            prediction.ticketRanks
          )
            ? prediction.ticketRanks.map(
                item => ({
                  ticket:
                    String(
                      item?.ticket || ""
                    ),
                  rank:
                    String(
                      item?.rank || ""
                    ),
                  score:
                    Number(
                      item?.score || 0
                    ),
                  odds:
                    item?.odds ?? null,
                  oddsValue:
                    String(
                      item?.oddsValue || ""
                    )
                })
              )
            : []
      };

      localStorage.setItem(
        "chappy_latest_prediction_v1",
        JSON.stringify(
          predictionSnapshot
        )
      );
    } catch (storageError) {
      console.warn(
        "予想履歴の一時保存に失敗",
        storageError
      );
    }

    if (
      typeof window.renderAll ===
      "function"
    ) {
      window.renderAll(prediction);
    }

    updateStatus(
      `オッズ更新完了（` +
      `${oddsData.count || 0}通り）`
    );
  } catch (error) {
    console.error(error);

    updateStatus(
      "オッズ更新エラー"
    );

    showError(
      error?.message ||
      "オッズ更新に失敗しました"
    );
  }
}

  function updateStatus(message) {
    const el = document.getElementById("statusArea");
    if (el) el.textContent = message;
  }

  function showError(message) {
    const el = document.getElementById("errorArea");
    if (!el) return;

    el.innerHTML = `
      <div class="panel error-panel">
        <h2>⚠️ エラー</h2>
        <p>${escapeHTML(message)}</p>
      </div>
    `;
  }

  function clearErrorArea() {
    const el = document.getElementById("errorArea");
    if (el) el.innerHTML = "";
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadStatsSafe() {
    try {
      if (typeof window.getStats === "function") {
        return window.getStats();
      }

      const raw = localStorage.getItem("chappy_stats");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function loadHistorySafe() {
    try {
      if (typeof window.getRaceHistory === "function") {
        return window.getRaceHistory();
      }

      const raw = localStorage.getItem("chappy_history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

})();