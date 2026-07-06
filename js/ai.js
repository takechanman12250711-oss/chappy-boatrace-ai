// ================================
// api.js 完全版①
// API通信・データ取得
// ================================

const API_BASE = "/api/race";

const PLACE_CODES = {
  桐生:"01",
  戸田:"02",
  江戸川:"03",
  平和島:"04",
  多摩川:"05",
  浜名湖:"06",
  蒲郡:"07",
  常滑:"08",
  津:"09",
  三国:"10",
  びわこ:"11",
  住之江:"12",
  尼崎:"13",
  鳴門:"14",
  丸亀:"15",
  児島:"16",
  宮島:"17",
  徳山:"18",
  下関:"19",
  若松:"20",
  芦屋:"21",
  福岡:"22",
  唐津:"23",
  大村:"24"
};

async function runPrediction() {

  const place = val("#placeSelect");
  const race = String(val("#raceSelect")).replace("R","");
  const date = normalizeDate(val("#dateInput")) || todayYmd();

  window.currentVenue = place;

  const jcd = PLACE_CODES[place] || place;

  setStatus("取得中...");
  clearAreas();

  setHTML(
    "#raceListArea",
    `<div class="loading">出走表取得中...</div>`
  );

  try {

    const raceData = await fetchRaceData(jcd,race,date);

    if(!raceData.ok){
      throw new Error(raceData.message || "取得失敗");
    }

    latestRaceData = raceData;

    latestOddsList =
      raceData.odds ||
      [];

    renderAll(raceData);

    setStatus("取得完了");

  }catch(err){

    console.error(err);

    showError(err.message);

    setStatus("取得失敗");

  }

}

async function fetchRaceData(jcd,rno,date){

  const race =
    await safeJson(
      `${API_BASE}?jcd=${jcd}&rno=${rno}&date=${date}`,
      {}
    );

  const odds =
    await safeJson(
      `/api/odds?jcd=${jcd}&rno=${rno}&date=${date}`,
      {ok:false,odds:[]}
    );

  const missing =
    await safeJson(
      `/api/missing?jcd=${jcd}&rno=${rno}&date=${date}`,
      {ok:false,missing:[]}
    );

  const weather =
    await safeJson(
      `/api/weather?jcd=${jcd}&rno=${rno}&date=${date}`,
      {ok:false}
    );

  race.odds =
    odds.ok
      ? (odds.odds || odds.list || [])
      : [];

  race.missing =
    missing.ok
      ? missing.missing || []
      : [];

  race.weather =
    weather.ok
      ? weather.weather || weather
      : {};

  return race;

}

async function safeJson(url,fallback={}){

  try{

    const res = await fetch(url);

    if(!res.ok){

      return fallback;

    }

    return await res.json();

  }catch(e){

    console.error(e);

    return fallback;

  }

}

async function reloadRace(){

  if(!latestRaceData){

    return;

  }

  await runPrediction();

}

async function refreshOdds(){

  if(!latestRaceData){

    return;

  }

  const place =
    val("#placeSelect");

  const race =
    String(val("#raceSelect"))
      .replace("R","");

  const date =
    normalizeDate(
      val("#dateInput")
    ) || todayYmd();

  const jcd =
    PLACE_CODES[place] || place;

  const odds =
    await safeJson(
      `/api/odds?jcd=${jcd}&rno=${race}&date=${date}`,
      {ok:false,odds:[]}
    );

  latestOddsList =
    odds.ok
      ? odds.odds || odds.list || []
      : [];

  setHTML(
    "#oddsArea",
    renderOdds(latestOddsList)
  );

}
// ================================
// api.js 完全版②
// API通信・自動更新・取得補助
// ================================

async function fetchRaceOnly(jcd, rno, date) {

  return await safeJson(
    `${API_BASE}?jcd=${jcd}&rno=${rno}&date=${date}`,
    { ok:false }
  );

}

async function fetchOddsOnly(jcd, rno, date) {

  const data = await safeJson(
    `/api/odds?jcd=${jcd}&rno=${rno}&date=${date}`,
    { ok:false, odds:[] }
  );

  return data.ok
    ? (data.odds || data.list || [])
    : [];

}

async function fetchMissingOnly(jcd, rno, date) {

  const data = await safeJson(
    `/api/missing?jcd=${jcd}&rno=${rno}&date=${date}`,
    { ok:false, missing:[] }
  );

  return data.ok
    ? data.missing || []
    : [];

}

async function fetchWeatherOnly(jcd, rno, date) {

  const data = await safeJson(
    `/api/weather?jcd=${jcd}&rno=${rno}&date=${date}`,
    { ok:false }
  );

  return data.ok
    ? (data.weather || data)
    : {};

}

async function refreshAllData() {

  if (!latestRaceData) return;

  const place = val("#placeSelect");
  const race = String(val("#raceSelect")).replace("R", "");
  const date = normalizeDate(val("#dateInput")) || todayYmd();

  const jcd = PLACE_CODES[place] || place;

  latestOddsList = await fetchOddsOnly(jcd, race, date);

  latestRaceData.odds = latestOddsList;

  latestRaceData.missing =
    await fetchMissingOnly(jcd, race, date);

  latestRaceData.weather =
    await fetchWeatherOnly(jcd, race, date);

  renderAll(latestRaceData);

}

async function autoRefreshOdds() {

  if (!latestRaceData) return;

  try {

    await refreshOdds();

    autoFillOdds();

  } catch (e) {

    console.error(e);

  }

}

function startAutoRefresh() {

  stopAutoRefresh();

  window.chappyRefreshTimer = setInterval(() => {

    autoRefreshOdds();

  }, 30000);

}

function stopAutoRefresh() {

  if (window.chappyRefreshTimer) {

    clearInterval(window.chappyRefreshTimer);

    window.chappyRefreshTimer = null;

  }

}

function loadRaceFromCurrentForm() {

  return runPrediction();

}

function hasRaceLoaded() {

  return !!latestRaceData;

}

window.runPrediction = runPrediction;
window.reloadRace = reloadRace;
window.refreshOdds = refreshOdds;
window.refreshAllData = refreshAllData;
window.fetchRaceData = fetchRaceData;
window.fetchRaceOnly = fetchRaceOnly;
window.fetchOddsOnly = fetchOddsOnly;
window.fetchMissingOnly = fetchMissingOnly;
window.fetchWeatherOnly = fetchWeatherOnly;
window.startAutoRefresh = startAutoRefresh;
window.stopAutoRefresh = stopAutoRefresh;
window.loadRaceFromCurrentForm = loadRaceFromCurrentForm;
window.hasRaceLoaded = hasRaceLoaded;
// ================================
// api.js 完全版③（最終）
// 初期化・イベント・公開関数
// ================================

document.addEventListener("DOMContentLoaded", () => {

  $("#fetchRaceBtn")?.addEventListener(
    "click",
    runPrediction
  );

  $("#refreshOddsBtn")?.addEventListener(
    "click",
    refreshOdds
  );

  $("#reloadRaceBtn")?.addEventListener(
    "click",
    reloadRace
  );

  $("#placeSelect")?.addEventListener(
    "change",
    stopAutoRefresh
  );

  $("#raceSelect")?.addEventListener(
    "change",
    stopAutoRefresh
  );

});

async function preloadRace() {

  const place = val("#placeSelect");

  if (!place) return;

  try {

    await runPrediction();

  } catch (e) {

    console.error(e);

  }

}

async function fetchCurrentRaceResult() {

  if (!latestRaceData) return null;

  const place = val("#placeSelect");
  const race = String(val("#raceSelect")).replace("R", "");
  const date = normalizeDate(val("#dateInput")) || todayYmd();

  const jcd = PLACE_CODES[place] || place;

  return await safeJson(
    `/api/result?jcd=${jcd}&rno=${race}&date=${date}`,
    {}
  );

}

async function waitForOfficialResult() {

  const result = await fetchCurrentRaceResult();

  if (!result?.result) return;

  $("#raceResultInput").value = result.result;

  autoFillOdds();
  autoJudgeResult();

}

async function autoWatchResult() {

  stopResultWatcher();

  window.chappyResultTimer = setInterval(async () => {

    try {

      await waitForOfficialResult();

    } catch (e) {

      console.error(e);

    }

  },60000);

}

function stopResultWatcher(){

  if(window.chappyResultTimer){

    clearInterval(window.chappyResultTimer);

    window.chappyResultTimer=null;

  }

}

window.fetchCurrentRaceResult=fetchCurrentRaceResult;
window.waitForOfficialResult=waitForOfficialResult;
window.autoWatchResult=autoWatchResult;
window.stopResultWatcher=stopResultWatcher;
window.preloadRace=preloadRace;

// ================================
// api.js 完了
// ================================