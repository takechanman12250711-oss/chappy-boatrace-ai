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