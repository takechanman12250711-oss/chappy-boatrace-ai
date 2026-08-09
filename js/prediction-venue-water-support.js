// チャッピーボートレースAI
// 24場特性・風・波・潮を展開の補正として整理する。
(function(){
  "use strict";
  if(window.__CHAPPY_VENUE_WATER_SUPPORT_INSTALLED__)return;
  window.__CHAPPY_VENUE_WATER_SUPPORT_INSTALLED__=true;

  const VENUE_NOTES={
    大村:{main:"イン有利を強く評価",cautions:["2差しは頭まで届きにくい傾向","3攻め時は4号艇の攻め場が狭くなる"]},
    福岡:{main:"河口水面で2マーク逆転に注意",cautions:["風と波で道中順位が変わりやすい"]},
    宮島:{main:"潮位と風向きを展開補正に使用",cautions:["潮の変化が大きい時間帯は過信注意"]},
    多摩川:{main:"静水面でスピードと展示気配を評価",cautions:[]},
    江戸川:{main:"難水面のため当地・乗り心地を重視",cautions:["風波が強い場合は内外とも過信注意"]},
    住之江:{main:"インと差し残りを評価",cautions:[]},
    若松:{main:"ナイターの展示・伸びを補助評価",cautions:[]}
  };

  function num(v){const raw=String(v??"").trim();if(!raw)return null;const normalized=raw.replace(/[^\d.-]/g,"");if(!normalized||normalized==="-"||normalized==="."||normalized==="-.")return null;const n=Number(normalized);return Number.isFinite(n)?n:null}
  function venueName(prediction,data){return data?.place||data?.venue||prediction?.venue?.name||prediction?.race?.place||prediction?.race?.venue||""}
  function build(prediction,data){
    const venue=venueName(prediction,data);
    const weather=data?.weather||prediction?.weather||prediction?.race?.weather||{};
    const wind=num(weather.windSpeed??weather.wind);
    const wave=num(weather.waveHeight??weather.wave);
    const tide=weather.tide||weather.tideLevel||"";
    const fixed=VENUE_NOTES[venue]||{main:`${venue||"開催場"}の水面特性を補助評価`,cautions:[]};
    const confirmations=[fixed.main];
    const cautions=[...fixed.cautions];
    if(wind!==null&&wind>=5)cautions.push(`風速${wind}m前後で進入・ターンのズレに注意`);
    if(wave!==null&&wave>=5)cautions.push(`波高${wave}cm前後で乗り心地を重視`);
    if(tide)confirmations.push(`潮汐情報（${tide}）を展開補正に使用`);
    return {venue,wind,wave,tide,confirmations:[...new Set(confirmations)].slice(0,3),cautions:[...new Set(cautions)].slice(0,3),comment:[...new Set([...confirmations,...cautions])].slice(0,2).join("。")};
  }
  function enhance(prediction,data){if(!prediction||typeof prediction!=="object")return prediction;const venueWaterSupport=build(prediction,data);return {...prediction,venueWaterSupport,flowPriority:{...(prediction.flowPriority||{}),venueComment:venueWaterSupport.comment,confirmations:[...new Set([...(prediction.flowPriority?.confirmations||[]),...venueWaterSupport.confirmations])],cautions:[...new Set([...(prediction.flowPriority?.cautions||[]),...venueWaterSupport.cautions])]}}}
  function install(){const base=window.createPrediction;if(typeof base!=="function"||base.__chappyVenueWaterWrapped)return false;function wrapped(data){return enhance(base(data),data)}wrapped.__chappyVenueWaterWrapped=true;wrapped.__chappyBaseCreatePrediction=base;window.createPrediction=wrapped;return true}
  window.ChappyPredictionVenueWaterSupport={build,enhance,install};
  if(!install()){document.addEventListener("DOMContentLoaded",install,{once:true});window.addEventListener("chappy:hiyori-runtime-ready",install,{once:true})}
})();
