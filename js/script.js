/* ==========================================================
   チャッピーボートレースAI
   script.js 完全版 Part1/3
   全体制御・データ統合
========================================================== */

let appState = {
  raceData: null,
  predictionData: null,
  theoryData: null,
  aiData: null
};

function getValue(id, fallback = ""){
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}

function setStatus(message){
  const el = document.getElementById("statusText");
  if(el){
    el.textContent = message;
  }
}

function getSelectedRaceInfo(){
  return {
    place: getValue("placeSelect", "大村"),
    raceNo: getValue("raceSelect", "1"),
    date: getValue("dateInput", new Date().toISOString().slice(0,10))
  };
}

function createFallbackRaceData(){
  const info = getSelectedRaceInfo();

  return {
    race: {
      place: info.place,
      raceNo: info.raceNo,
      deadline: "-",
      grade: "一般"
    },

    weather: {
      weather: "-",
      windDirection: "-",
      windSpeed: 0,
      waveHeight: 0,
      waterTemp: "-",
      airTemp: "-"
    },

    entries: [
      { boat:1, name:"1号艇", class:"A1", branch:"-", age:"-", weight:"-", nationalWinRate:6.5, localWinRate:6.5, avgST:0.15, motorNo:"-", motorRate:35, boatRate:35, exhibitionTime:6.80, lapTime:37.4, exhibitionST:0.12 },
      { boat:2, name:"2号艇", class:"A2", branch:"-", age:"-", weight:"-", nationalWinRate:5.8, localWinRate:5.7, avgST:0.16, motorNo:"-", motorRate:34, boatRate:34, exhibitionTime:6.82, lapTime:37.5, exhibitionST:0.14 },
      { boat:3, name:"3号艇", class:"A2", branch:"-", age:"-", weight:"-", nationalWinRate:5.7, localWinRate:5.6, avgST:0.15, motorNo:"-", motorRate:33, boatRate:33, exhibitionTime:6.81, lapTime:37.3, exhibitionST:0.11 },
      { boat:4, name:"4号艇", class:"B1", branch:"-", age:"-", weight:"-", nationalWinRate:5.0, localWinRate:5.2, avgST:0.17, motorNo:"-", motorRate:32, boatRate:32, exhibitionTime:6.85, lapTime:37.7, exhibitionST:0.16 },
      { boat:5, name:"5号艇", class:"B1", branch:"-", age:"-", weight:"-", nationalWinRate:4.8, localWinRate:5.0, avgST:0.16, motorNo:"-", motorRate:31, boatRate:31, exhibitionTime:6.86, lapTime:37.8, exhibitionST:0.15 },
      { boat:6, name:"6号艇", class:"B1", branch:"-", age:"-", weight:"-", nationalWinRate:4.7, localWinRate:5.1, avgST:0.18, motorNo:"-", motorRate:30, boatRate:30, exhibitionTime:6.88, lapTime:37.9, exhibitionST:0.17 }
    ],

    odds: {
      topOdds: [],
      synthetic: []
    },

    missing: {
      list: []
    },

    stats: {
      totalPredictions: 0,
      hitCount: 0,
      hitRate: 0,
      totalBet: 0,
      totalPayout: 0,
      returnRate: 0
    },

    result: {
      message: "結果未入力"
    }
  };
}
async function fetchRaceData(){
  const info = getSelectedRaceInfo();

  setStatus("データ取得中...");

  try{
    if(typeof fetchRaceFromAPI === "function"){
      const apiData = await fetchRaceFromAPI(info.place, info.raceNo, info.date);

      if(apiData && apiData.entries && apiData.entries.length){
        setStatus("APIデータ取得成功");
        return apiData;
      }
    }

    setStatus("APIデータなし。仮データで表示します");
    return createFallbackRaceData();

  }catch(error){
    console.error(error);
    setStatus("API取得エラー。仮データで表示します");
    return createFallbackRaceData();
  }
}

function mergePredictionResult(raceData){
  const predictionData = buildPredictionData(raceData);
  const ranked = rankRacers(raceData);

  const theoryData =
    typeof buildTheoryData === "function"
      ? buildTheoryData(raceData, ranked)
      : null;

  const aiData =
    typeof buildAIData === "function"
      ? buildAIData(raceData)
      : { comments: ["AIデータがありません"] };

  return {
    ...predictionData,
    theories: convertTheoryForRender(theoryData),
    ai: aiData
  };
}

function convertTheoryForRender(theoryData){
  if(!theoryData || !theoryData.theoryResult){
    return [];
  }

  return theoryData.theoryResult.map(item => ({
    name: `${item.boat}号艇 理論評価`,
    detail: [
      item.alerts && item.alerts.length
        ? `アラート：${item.alerts.join(" / ")}`
        : "大きなアラートなし",
      item.buffs && item.buffs.length
        ? `バフ：${item.buffs.join(" / ")}`
        : "強調バフなし",
      item.debuffs && item.debuffs.length
        ? `デバフ：${item.debuffs.join(" / ")}`
        : "大きなデバフなし"
    ].join("　"),
    score: item.totalTheoryScore,
    target: `${item.boat}号艇`
  }));
}

function createMissingFromOdds(raceData){
  const odds = raceData?.odds?.topOdds || [];

  if(!odds.length){
    return {
      list: [
        { ticket:"6-1-2", odds:"万舟候補" },
        { ticket:"6-2-1", odds:"万舟候補" },
        { ticket:"5-1-2", odds:"万舟候補" },
        { ticket:"5-2-1", odds:"万舟候補" },
        { ticket:"4-5-6", odds:"万舟候補" }
      ]
    };
  }

  return {
    list: odds
      .filter(item => Number(item.odds) >= 80)
      .slice(0, 30)
      .map(item => ({
        ticket: item.ticket,
        odds: item.odds
      }))
  };
}

function attachAutoData(appData){
  return {
    ...appData,
    missing: appData.missing && appData.missing.list && appData.missing.list.length
      ? appData.missing
      : createMissingFromOdds(appData)
  };
}
/* ==========================================================
   script.js 完全版 Part3/3
   初期化・イベント・描画
========================================================== */

async function runPrediction(){

  renderLoading("mainSheetArea", "予想を計算しています...");

  try{

    const raceData = await fetchRaceData();

    const merged = mergePredictionResult(raceData);

    const appData = attachAutoData(merged);

    appState.raceData = raceData;
    appState.predictionData = merged.prediction;
    appState.theoryData = merged.theories;
    appState.aiData = merged.ai;

    renderComplete(appData);

    setStatus("予想を更新しました");

  }catch(error){

    console.error(error);

    setStatus("予想生成に失敗しました");

    const area = document.getElementById("mainSheetArea");

    if(area){
      area.innerHTML = renderError("予想生成中にエラーが発生しました。");
    }

  }

}

function resetScreen(){

  clearAllAreas();

  appState = {
    raceData:null,
    predictionData:null,
    theoryData:null,
    aiData:null
  };

  setStatus("リセットしました");

}

document.addEventListener("DOMContentLoaded", ()=>{

  const predictBtn = document.getElementById("predictBtn");
  const resetBtn = document.getElementById("resetBtn");

  if(predictBtn){

    predictBtn.addEventListener("click", runPrediction);

  }

  if(resetBtn){

    resetBtn.addEventListener("click", resetScreen);

  }

  // 初回表示
  runPrediction();

});

/* ==========================================================
   結果保存（仮実装）
========================================================== */

function saveRaceResult(){

  alert("結果保存機能は次のバージョンで実装します。");

}

function clearRaceResult(){

  const ticket = document.getElementById("resultTicketInput");
  const payout = document.getElementById("payoutInput");

  if(ticket) ticket.value = "";
  if(payout) payout.value = "";

  const text = document.getElementById("autoPayoutText");

  if(text){
    text.textContent = "結果未入力";
  }

}

window.runPrediction = runPrediction;
window.resetScreen = resetScreen;
window.saveRaceResult = saveRaceResult;
window.clearRaceResult = clearRaceResult;