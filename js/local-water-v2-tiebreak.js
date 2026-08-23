(function(root){
  "use strict";

  const VERSION = "20260823-local-water-v2-gap3-v1";
  const MAX_GAP = 3;

  function boatNo(row){
    return Number(row?.boatNo || row?.number || row?.waku || 0) || 0;
  }

  function headOf(scenario){
    return Number(
      scenario?.headBoatNo ||
      scenario?.attackerBoatNo ||
      scenario?.attacker ||
      scenario?.outcome?.firstCandidates?.[0]?.boatNo ||
      0
    ) || 0;
  }

  function analysesOf(ai){
    for(const rows of [ai?.analyses,ai?.evaluations,ai?.boatEvaluations,ai?.boatEvaluation?.evaluations,ai?.mainSheet?.evaluations]){
      if(Array.isArray(rows) && rows.length === 6) return rows;
    }
    return null;
  }

  function counterfactualRaceScenarios(rs,v2Scenario){
    const outcome = v2Scenario?.outcome || {};
    const hp = rs?.holdPickupTheory || {};
    return {
      ...rs,
      mainScenario: v2Scenario,
      scenarios: [v2Scenario,...(rs?.scenarios || []).filter(row=>row !== v2Scenario)],
      attacker: headOf(v2Scenario),
      blockedBoats: [...(v2Scenario?.blockedBoats || [])],
      holdPickupTheory: {
        ...hp,
        secondCandidates: Array.isArray(outcome.secondCandidates) ? outcome.secondCandidates : hp.secondCandidates,
        thirdCandidates: Array.isArray(outcome.thirdCandidates) ? outcome.thirdCandidates : hp.thirdCandidates,
        remainers: Array.isArray(outcome.remainers) ? outcome.remainers : hp.remainers,
        pickupCandidates: Array.isArray(outcome.pickupCandidates) ? outcome.pickupCandidates : hp.pickupCandidates
      }
    };
  }

  function apply(ai,input,core){
    if(!ai || !input || !core) return ai;
    const theory = input.localWaterTheoryV2;
    if(theory?.isFormal !== true) return ai;

    const rows = [...(theory.rows || [])]
      .filter(row=>row?.isFormal === true)
      .sort((a,b)=>Number(b?.score || 0)-Number(a?.score || 0) || boatNo(a)-boatNo(b));
    const v2Head = boatNo(rows[0]);
    if(!v2Head) return ai;

    const rs = ai.raceScenarios || {};
    const scenarios = rs.scenarios || [];
    const current = rs.mainScenario || scenarios[0];
    const currentHead = headOf(current);
    if(!current || !currentHead || currentHead === v2Head) return ai;

    const v2Scenario = scenarios.find(row=>headOf(row) === v2Head);
    if(!v2Scenario) return ai;
    const gap = Number(current.score) - Number(v2Scenario.score);
    if(!Number.isFinite(gap) || gap < 0 || gap > MAX_GAP) return ai;

    const analyses = analysesOf(ai);
    if(!analyses) return ai;
    const nextRaceScenarios = counterfactualRaceScenarios(rs,v2Scenario);
    const nextFormations = core.buildFormations(analyses,nextRaceScenarios);
    return {
      ...ai,
      raceScenarios: nextRaceScenarios,
      formations: nextFormations,
      localWaterV2Tiebreak: {
        applied: true,
        version: VERSION,
        maxGap: MAX_GAP,
        gap,
        previousHead: currentHead,
        selectedHead: v2Head,
        previousScenario: String(current?.title || current?.label || ""),
        selectedScenario: String(v2Scenario?.title || v2Scenario?.label || "")
      }
    };
  }

  function install(core){
    if(!core || typeof core.buildPredictionData !== "function" || core.__localWaterV2TiebreakInstalled) return core;
    const original = core.buildPredictionData.bind(core);
    const wrapped = {
      ...core,
      __localWaterV2TiebreakInstalled: true,
      buildPredictionData(input){
        return apply(original(input),input,core);
      }
    };
    if(root?.ChappyAICore === core) root.ChappyAICore = wrapped;
    return wrapped;
  }

  const helper = Object.freeze({VERSION,MAX_GAP,headOf,counterfactualRaceScenarios,apply,install});
  if(root?.ChappyAICore) root.ChappyAICore = install(root.ChappyAICore);
  root.ChappyLocalWaterV2Tiebreak = helper;
  if(typeof module !== "undefined" && module.exports) module.exports = helper;
})(typeof window !== "undefined" ? window : globalThis);
