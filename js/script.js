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
    if (window.ChappyAPI && typeof window.ChappyAPI.getRace === "function") {
      return await window.ChappyAPI.getRace(params);
    }

    if (window.ChappyAPI && typeof window.ChappyAPI.fetchRace === "function") {
      return await window.ChappyAPI.fetchRace(params);
    }

    if (typeof window.fetchRace === "function") {
      return await window.fetchRace(params);
    }

    const url = `/api/race?jcd=${encodeURIComponent(params.jcd)}&rno=${encodeURIComponent(params.rno)}&date=${encodeURIComponent(params.date)}`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`APIエラー：${res.status}`);
    }

    return await res.json();
  }

function createPredictionSafe(data) {
  try {
    if (typeof window.createPrediction === "function") {
      return window.createPrediction(data);
    }
  } catch (error) {
  console.error("prediction.js error", error);
  throw error;
}

return null;
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

  function refreshOddsOnly() {
    if (!lastRaceData) {
      updateStatus("先に出走表を取得してください");
      return;
    }

    try {
      if (typeof window.renderOdds === "function") {
        window.renderOdds(lastRaceData, lastRaceData.odds || null);
      }

      updateStatus("オッズ更新完了");
    } catch (error) {
      console.error(error);
      showError("オッズ更新に失敗しました");
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