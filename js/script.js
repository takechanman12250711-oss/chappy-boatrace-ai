// js/script.js
// チャッピーボートレースAI メイン制御

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("raceForm");
  const stadiumSelect = document.getElementById("stadiumCode");
  const raceNoSelect = document.getElementById("raceNo");
  const raceDateInput = document.getElementById("raceDate");
  const loadButton = document.getElementById("loadRaceButton");
  const statusBox = document.getElementById("statusBox");

  setDefaultDate();

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadRace();
    });
  }

  if (loadButton) {
    loadButton.addEventListener("click", async () => {
      await loadRace();
    });
  }

  async function loadRace() {
    try {
      setStatus("レースデータ取得中...", "loading");

      const params = {
        jcd: stadiumSelect?.value,
        rno: raceNoSelect?.value,
        date: formatDate(raceDateInput?.value)
      };

      const raceData = await ChappyAPI.fetchRace(params);

      window.currentRaceData = raceData;

      renderAll(raceData);

      setStatus("実データ取得成功", "success");
      console.log("raceData", raceData);
    } catch (error) {
      console.error(error);
      setStatus(`取得失敗: ${error.message}`, "error");
    }
  }

  function renderAll(raceData) {
    if (typeof renderRaceFlow === "function") {
      renderRaceFlow(raceData);
    }

    if (typeof renderEntryTable === "function") {
      renderEntryTable(raceData);
    }

    if (typeof renderMaterialPanel === "function") {
      renderMaterialPanel(raceData);
    }

    if (typeof renderMainSheet === "function") {
      renderMainSheet(raceData);
    }

    if (typeof renderOdds === "function") {
      renderOdds(raceData);
    }

    if (typeof renderMissing === "function") {
      renderMissing(raceData);
    }

    if (typeof renderStats === "function") {
      renderStats(raceData);
    }

    if (typeof renderTheory === "function") {
      renderTheory(raceData);
    }

    if (typeof renderAI === "function") {
      renderAI(raceData);
    }
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
    if (!value) return "";

    return String(value).replaceAll("-", "");
  }

  function setStatus(message, type = "") {
    if (!statusBox) return;

    statusBox.textContent = message;
    statusBox.className = `status-box ${type}`;
  }
});