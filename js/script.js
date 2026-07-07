// js/script.js
// ボタン反応確認つき API接続版

document.addEventListener("DOMContentLoaded", () => {
  const statusBox =
    document.getElementById("statusBox") ||
    document.querySelector(".status-box");

  const stadiumSelect =
    document.getElementById("stadiumCode") ||
    document.getElementById("jcd") ||
    document.querySelector("select");

  const raceNoSelect =
    document.getElementById("raceNo") ||
    document.getElementById("rno") ||
    document.querySelectorAll("select")[1];

  const raceDateInput =
    document.getElementById("raceDate") ||
    document.getElementById("date") ||
    document.querySelector('input[type="date"]');

  const mainButton =
    document.getElementById("loadRaceButton") ||
    document.getElementById("fetchRaceButton") ||
    document.querySelector("button");

  setDefaultDate();

  if (mainButton) {
    mainButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await loadRace();
    });
  }

  async function loadRace() {
    setStatus("取得ボタン押された！API通信中...", "loading");

    try {
      const params = {
        jcd: stadiumSelect?.value || "24",
        rno: raceNoSelect?.value || "1",
        date: formatDate(raceDateInput?.value)
      };

      console.log("API params", params);

      const raceData = await ChappyAPI.fetchRace(params);

      window.currentRaceData = raceData;
      console.log("API raceData", raceData);

      renderAll(raceData);

      setStatus("✅ 実データ取得成功！", "success");
    } catch (error) {
      console.error("API error", error);
      setStatus(`❌ 取得失敗：${error.message}`, "error");
    }
  }

  function renderAll(raceData) {
    if (typeof renderRaceFlow === "function") renderRaceFlow(raceData);
    if (typeof renderEntryTable === "function") renderEntryTable(raceData);
    if (typeof renderMaterialPanel === "function") renderMaterialPanel(raceData);
    if (typeof renderMainSheet === "function") renderMainSheet(raceData);
    if (typeof renderOdds === "function") renderOdds(raceData);
    if (typeof renderMissing === "function") renderMissing(raceData);
    if (typeof renderStats === "function") renderStats(raceData);
    if (typeof renderTheory === "function") renderTheory(raceData);
    if (typeof renderAI === "function") renderAI(raceData);
  }

  function setDefaultDate() {
    if (!raceDateInput || raceDateInput.value) return;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    raceDateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  function formatDate(value) {
    if (!value) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      return `${yyyy}${mm}${dd}`;
    }

    return String(value).replaceAll("-", "");
  }

  function setStatus(message, type = "") {
    if (!statusBox) {
      alert(message);
      return;
    }

    statusBox.textContent = message;
    statusBox.className = `status-box ${type}`;
  }

  console.log("script.js 起動OK", {
    statusBox,
    stadiumSelect,
    raceNoSelect,
    raceDateInput,
    mainButton
  });

  setStatus("待機中：ボタン接続OK", "");
});