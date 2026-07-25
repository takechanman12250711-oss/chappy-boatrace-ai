// チャッピーボートレースAI
// 8段階の予想優先順位を1つの最終判断へ統合する。
(function(){
  "use strict";
  if(window.__CHAPPY_PREDICTION_ENGINE_INTEGRATION_INSTALLED__)return;
  window.__CHAPPY_PREDICTION_ENGINE_INTEGRATION_INSTALLED__=true;
  const ORDER=["展開","コース","ST・スリット","展示・足","残し・拾い","当地・水面","技量","モーター"];
  function uniq(list){return [...new Set((list||[]).filter(Boolean).map(String))]}
  function build(prediction){
    const flow=prediction?.flowPriority||{};
    const st=prediction?.flowSupport||{};
    const venue=prediction?.venueWaterSupport||{};
    const skill=prediction?.skillLocalSupport||{};
    const motor=prediction?.motorEngineSupport||{};
    const confirmations=uniq([...(flow.confirmations||[]),...(st.confirmations||[]),...(venue.confirmations||[]),...(skill.confirmations||[]),...(motor.confirmations||[])]).slice(0,5);
    const cautions=uniq([...(flow.cautions||[]),...(st.cautions||[]),...(venue.cautions||[]),...(skill.cautions||[]),...(motor.cautions||[])]).slice(0,5);
    const mainComment=flow.comment||flow.mainComment||prediction?.raceFlow?.comment||prediction?.raceFlow?.title||"展開とコースを中心に判断";
    const supportComments=uniq([st.comment||st.supportComment,venue.comment,skill.comment,motor.comment]).slice(0,3);
    return {
      version:"prediction-engine-v2.0.0",
      complete:true,
      priorityOrder:ORDER.slice(),
      mainComment,
      supportComments,
      confirmations,
      cautions,
      layers:{
        flow:Boolean(prediction?.flowPriority||prediction?.raceFlow),
        course:true,
        stExhibition:Boolean(prediction?.flowSupport),
        remainPickup:Boolean(prediction?.flowPriority),
        venueWater:Boolean(prediction?.venueWaterSupport),
        skillLocal:Boolean(prediction?.skillLocalSupport),
        motorEngine:Boolean(prediction?.motorEngineSupport)
      },
      rules:{
        flowFirst:true,
        oddsAfterTickets:true,
        noNumericOnlySelection:true,
        noNumericOnlyDeletion:true,
        motorLast:true,
        newEngineExhibitionPriority:Boolean(motor?.isNewEngineMode||motor?.newEngineMode)
      }
    };
  }
  function enhance(prediction){
    if(!prediction||typeof prediction!=="object")return prediction;
    const predictionEngine=build(prediction);
    return {...prediction,predictionEngine,finalAi:{...(prediction.finalAi||{}),engine:predictionEngine,summary:predictionEngine.mainComment}};
  }
  function install(){const base=window.createPrediction;if(typeof base!=="function"||base.__chappyEngineIntegrationWrapped)return false;function wrapped(data){return enhance(base(data))}wrapped.__chappyEngineIntegrationWrapped=true;wrapped.__chappyBaseCreatePrediction=base;window.createPrediction=wrapped;return true}
  window.ChappyPredictionEngineIntegration={ORDER,build,enhance,install};
  if(!install()){document.addEventListener("DOMContentLoaded",install,{once:true});window.addEventListener("chappy:hiyori-runtime-ready",install,{once:true})}
})();