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