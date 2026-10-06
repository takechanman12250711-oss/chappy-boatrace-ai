'use strict';
// Pre-race route hypotheses and official local/weather facts, never observed race tactics.
const {hash}=require('./independent-autonomous-candidate.cjs');
const flowContract=require('./independent-flow-roles-v1.cjs');
const VERSION='independent-route-water-v1',json=x=>JSON.stringify(x)+'\n';
function judge(input,context,flow){
  flowContract.validate(flow,input,context);
  const rows=[...input.rows].sort((a,b)=>a.course-b.course),head=rows.find(r=>r.boat===flow.decision.actor);
  const scenario=flow.scenarios.find(s=>s.id===flow.decision.scenarioId);
  const ref=(source,boat,field)=>{
    let value=boat===null?context:(source==='input'?input.rows:context.officialEntries).find(r=>r.boat===boat);
    for(const k of field.split('.'))value=value?.[k];
    return {source,sourceHash:source==='input'?flow.inputHash:context.contextHash,boat,field,value:value??null};
  };
  const weather=context.weather,direction=weather.windSpeed===0?'calm':
    ({'向かい風':'head','追い風':'tail','横風':'cross'})[weather.windDirection]||'unknown';
  const missing=['windSpeed','waveHeight'].filter(k=>weather[k]===null);
  if(direction==='unknown')missing.push('windDirection');
  const tideKnown=weather.liveTideAvailable&&(weather.tideLevel!==null||['満潮','干潮','上げ潮','下げ潮'].includes(weather.tideFlow));
  const water={status:missing.length?'incomplete':'available',missing,direction,
    windSpeed:weather.windSpeed,waveHeight:weather.waveHeight,
    tide:{status:tideKnown?'available':'unknown',level:tideKnown?weather.tideLevel:null,flow:tideKnown?weather.tideFlow:null},
    adaptationOrderingImplemented:false,courseSpecificTideEffectKnown:false,
    evidence:['windSpeed','waveHeight','windDirection','windDirectionCode','tideLevel','tideFlow','liveTideAvailable'].map(k=>ref('context',null,'weather.'+k))};
  const routes=rows.map(r=>{
    const inner=rows.find(x=>x.course===r.course-1),outer=rows.find(x=>x.course===r.course+1);
    let path='unresolved',zone='unknown',pressureFrom=[];
    if(scenario?.type==='escape'){
      path=r.boat===head.boat?'inside-first-turn':r.course===2?'inside-follow':'outside-follow';
      zone=r.course<=2?'inside':'outside';
    }else if(scenario?.type==='makuri'){
      path=r.boat===head.boat?'outer-sweep':r.course<head.course?'inside-recovery':r.course===head.course+1?'follow-attacker':'outside-follow';
      zone=r.course<head.course?'inside':'outside';
      if(r.course<head.course)pressureFrom=[head.boat];
    }
    return {boat:r.boat,course:r.course,status:scenario?'conditional':'unknown',path,zone,
      adjacentInside:inner?.boat??null,adjacentOutside:outer?.boat??null,pressureFrom,
      followsAttacker:path==='follow-attacker'?head.boat:null,
      required:scenario?['main-scenario-holds',path==='inside-recovery'?'recovery-space-remains':'turning-space-remains']:['main-scenario-needed'],
      unobserved:['actual-turn-entry-order','turn-opening','turn-technique'],actualTurnObserved:false,
      evidence:[ref('input',r.boat,'course'),...(inner?[ref('input',inner.boat,'course')]:[]),
        ...(outer?[ref('input',outer.boat,'course')]:[]),...(head?[ref('input',head.boat,'course')]:[])]};
  });
  // Shared intended zones identify potential competition, not proven obstruction or elimination.
  for(const r of routes)r.potentialCompetition=routes.filter(b=>b.boat!==r.boat&&r.zone!=='unknown'&&b.zone===r.zone).map(b=>b.boat);
  const local=rows.map(r=>{
    const e=context.officialEntries.find(e=>e.boat===r.boat),a=e.local2Rate,b=e.local3Rate;
    const reason=!e.registerNo?'racer-identity-missing':a===null||b===null?'local-rates-missing':a>b?'local-rates-inconsistent':
      a===0&&b===0?'zero-or-no-local-history':null;
    return {boat:r.boat,course:r.course,registerNo:e.registerNo,status:reason?'unknown':'available',reason,
      top2Rate:a,top3Rate:b,sampleCount:null,period:null,referenceOnly:true,
      interpretation:'combined-top2-top3-not-position-probabilities',
      evidence:[ref('context',r.boat,'registerNo'),ref('context',r.boat,'local2Rate'),ref('context',r.boat,'local3Rate')]};
  });
  const body={version:VERSION,raceKey:input.raceKey,observedAt:input.observedAt,inputHash:flow.inputHash,
    contextHash:context.contextHash,flowHash:hash(json(flow)),scenarioId:scenario?.id??null,sourceUrls:[...context.sourceUrls],
    routes,water,local,actualTacticsInferred:false,fullJudgmentImplemented:false,usableForPrediction:false};
  return {...body,evidenceHash:hash(json(body))};
}
function validate(value,input,context,flow){if(json(value)!==json(judge(input,context,flow)))throw Error('route_water_replay_mismatch');return true;}
module.exports={VERSION,judge,validate};
