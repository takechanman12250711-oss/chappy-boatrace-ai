// チャッピーボートレースAI
// 8段階の予想優先順位を1つの最終判断へ統合する。
(function(){
  "use strict";
  if(window.__CHAPPY_PREDICTION_ENGINE_INTEGRATION_INSTALLED__)return;
  window.__CHAPPY_PREDICTION_ENGINE_INTEGRATION_INSTALLED__=true;

  const ORDER=["展開","コース","ST・スリット","展示・足","残し・拾い","当地・水面","技量","モーター"];

  function uniq(list){
    return [...new Set((list||[]).filter(Boolean).map(String))];
  }

  function hasCourseLayer(prediction,flow){
    const course=Number(
      flow?.attackCourse ??
      flow?.course ??
      prediction?.raceFlow?.attackCourse ??
      prediction?.raceFlow?.course ??
      prediction?.mainSheet?.honmei?.course ??
      0
    );
    return course>=1&&course<=6;
  }

  function buildFinalComment(mainComment,supportComments,cautions){
    const parts=uniq([
      mainComment,
      ...(supportComments||[]),
      ...(cautions||[]).slice(0,2).map(v=>`注意：${v}`)
    ]);
    return parts.join("。").replace(/。+/g,"。").replace(/。?$/,"。");
  }

  function build(prediction){
    const flow=prediction?.flowPriority||{};
    const st=prediction?.flowSupport||{};
    const venue=prediction?.venueWaterSupport||{};
    const skill=prediction?.skillLocalSupport||{};
    const motor=prediction?.motorEngineSupport||{};

    const confirmations=uniq([
      ...(flow.confirmations||[]),
      ...(st.confirmations||[]),
      ...(venue.confirmations||[]),
      ...(skill.confirmations||[]),
      ...(motor.confirmations||[])
    ]).slice(0,5);

    const cautions=uniq([
      ...(flow.cautions||[]),
      ...(st.cautions||[]),
      ...(venue.cautions||[]),
      ...(skill.cautions||[]),
      ...(motor.cautions||[])
    ]).slice(0,5);

    const mainComment=
      flow.comment||
      flow.mainComment||
      prediction?.raceFlow?.comment||
      prediction?.raceFlow?.title||
      "展開とコースを中心に判断";

    const supportComments=uniq([
      st.comment||st.supportComment,
      venue.comment,
      skill.comment,
      motor.comment
    ]).slice(0,3);

    const layers={
      flow:Boolean(prediction?.flowPriority||prediction?.raceFlow),
      course:hasCourseLayer(prediction,flow),
      stExhibition:Boolean(prediction?.flowSupport),
      remainPickup:Boolean(
        prediction?.flowPriority&&(
          Array.isArray(flow.remainCandidates)||
          Array.isArray(flow.pickupCandidates)||
          Array.isArray(flow.remain)||
          Array.isArray(flow.pickup)
        )
      ),
      venueWater:Boolean(prediction?.venueWaterSupport),
      skillLocal:Boolean(prediction?.skillLocalSupport),
      motorEngine:Boolean(prediction?.motorEngineSupport)
    };

    const missingLayers=Object.entries(layers)
      .filter(([,ready])=>!ready)
      .map(([name])=>name);

    const complete=missingLayers.length===0;
    const finalComment=buildFinalComment(mainComment,supportComments,cautions);

    return {
      version:"prediction-engine-v2.0.1",
      complete,
      status:complete?"complete":"incomplete",
      missingLayers,
      priorityOrder:ORDER.slice(),
      mainComment,
      supportComments,
      finalComment,
      confirmations,
      cautions,
      layers,
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
    return {
      ...prediction,
      predictionEngine,
      finalAi:{
        ...(prediction.finalAi||{}),
        engine:predictionEngine,
        engineSummary:predictionEngine.finalComment,
        summary:predictionEngine.finalComment
      }
    };
  }

  function install(){
    const base=window.createPrediction;
    if(typeof base!=="function"||base.__chappyEngineIntegrationWrapped)return false;
    function wrapped(data){return enhance(base(data));}
    wrapped.__chappyEngineIntegrationWrapped=true;
    wrapped.__chappyBaseCreatePrediction=base;
    window.createPrediction=wrapped;
    return true;
  }

  window.ChappyPredictionEngineIntegration={ORDER,build,enhance,install};
  if(!install()){
    document.addEventListener("DOMContentLoaded",install,{once:true});
    window.addEventListener("chappy:hiyori-runtime-ready",install,{once:true});
  }
})();