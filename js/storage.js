// =======================================
// storage.js 完全版①
// ローカル保存・読込
// =======================================

const STORAGE_KEY = "chappy-storage-v1";

function saveLocalData(key, value) {

  const data = loadAllLocalData();

  data[key] = value;

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(data)
  );

}

function loadLocalData(key, defaultValue = null) {

  const data = loadAllLocalData();

  if (key in data) {
    return data[key];
  }

  return defaultValue;

}

function loadAllLocalData() {

  try {

    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}"
    );

  } catch {

    return {};

  }

}

function clearLocalData() {

  localStorage.removeItem(STORAGE_KEY);

}

function saveLatestRace(data) {

  saveLocalData(
    "latestRace",
    data
  );

}

function loadLatestRace() {

  return loadLocalData(
    "latestRace",
    null
  );

}

function saveLatestOdds(list) {

  saveLocalData(
    "latestOdds",
    list || []
  );

}

function loadLatestOdds() {

  return loadLocalData(
    "latestOdds",
    []
  );

}

function saveSettings(settings) {

  saveLocalData(
    "settings",
    settings || {}
  );

}

function loadSettings() {

  return loadLocalData(
    "settings",
    {}
  );

}
// =======================================
// storage.js 完全版②
// 公開関数・自動復元
// =======================================

function restoreLatestRace() {
  const race = loadLatestRace();
  const odds = loadLatestOdds();

  if (!race) return false;

  window.latestRaceData = race;
  window.latestOddsList = odds || [];

  if (typeof renderAll === "function") {
    renderAll(race);
  }

  return true;
}

function rememberCurrentRace() {
  if (window.latestRaceData) {
    saveLatestRace(window.latestRaceData);
  }

  if (window.latestOddsList) {
    saveLatestOdds(window.latestOddsList);
  }
}

function resetAppStorage() {
  clearLocalData();

  localStorage.removeItem("chappyResultHistory");

  alert("保存データを削除しました");
}

window.saveLocalData = saveLocalData;
window.loadLocalData = loadLocalData;
window.loadAllLocalData = loadAllLocalData;
window.clearLocalData = clearLocalData;

window.saveLatestRace = saveLatestRace;
window.loadLatestRace = loadLatestRace;
window.saveLatestOdds = saveLatestOdds;
window.loadLatestOdds = loadLatestOdds;

window.saveSettings = saveSettings;
window.loadSettings = loadSettings;

window.restoreLatestRace = restoreLatestRace;
window.rememberCurrentRace = rememberCurrentRace;
window.resetAppStorage = resetAppStorage;

// =======================================
// storage.js 完了
// =======================================