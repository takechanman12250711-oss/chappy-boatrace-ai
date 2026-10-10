'use strict';
// Reference-only projection. No ranking, eligibility decision, or result input.
const {hash}=require('./independent-autonomous-candidate.cjs');
const selector=require('./independent-partner-selector-v2.cjs');
const VERSION='independent-pair-route-diagnostic-v1',json=x=>JSON.stringify(x)+'\n';
const SAFETY=Object.freeze({selectionImplemented:false,usedForSelection:false,productionChanged:false,
  automaticApplication:false,usableForPrediction:false,actualTacticsInferred:false,fullJudgmentImplemented:false,
  resultUsedForGeneration:false,adoptionGate:null});
const copy=x=>JSON.parse(JSON.stringify(x));
function judge(input,context,flow,support,routeWater,selection){
  // Also validates flow, support and route-water using their existing exact replay contracts.
  selector.validate(selection,input,context,flow,support,routeWater);
  const hashes={input:flow.inputHash,context:context.contextHash,flow:hash(json(flow)),support:support.supportHash,
    routeWater:routeWater.evidenceHash,selection:hash(json(selection))};
  const sources={input,context,flow,support,routeWater,selection};
  const ref=(source,pointer)=>{
    let value=sources[source];for(const part of pointer.slice(1).split('/'))value=value?.[part];
    if(value===undefined)throw Error('pair_route_reference_missing');
    return {source,sourceHash:hashes[source],pointer,value:copy(value)};
  };
  const scenarioIndex=flow.scenarios.findIndex(s=>s.id===flow.decision.scenarioId);
  const scenario=flow.scenarios[scenarioIndex];
  const available=flow.decision.status==='reference'&&scenario&&['escape','makuri'].includes(scenario.type);
  const head=available?flow.decision.actor:null;
  const base={version:VERSION,raceKey:input.raceKey,observedAt:input.observedAt,inputHash:hashes.input,
    contextHash:hashes.context,flowHash:hashes.flow,supportHash:hashes.support,routeWaterHash:hashes.routeWater,
    selectionHash:hashes.selection,status:available?'available':'unavailable',reason:available?null:'main-scenario-unresolved',
    scenarioId:available?scenario.id:null,head,scenarioRef:available?ref('flow',`/scenarios/${scenarioIndex}`):null,
    expectedPairCount:available?20:null,sourceSelectionStatus:selection.status,sourceSelectionReason:selection.reason,
    sourceTickets:copy(selection.tickets),pairs:[],...SAFETY};
  if(available){
    const rows=[...input.rows].sort((a,b)=>a.course-b.course);
    if(rows.length!==6||new Set(rows.map(r=>r.boat)).size!==6||new Set(rows.map(r=>r.course)).size!==6||
      !rows.some(r=>r.boat===head)||routeWater.scenarioId!==scenario.id||selection.scenarioId!==scenario.id||selection.head!==head)
      throw Error('pair_route_identity_mismatch');
    const routeIndex=boat=>routeWater.routes.findIndex(r=>r.boat===boat);
    const roleIndex=boat=>selection.roles.findIndex(r=>r.boat===boat);
    for(const row of rows){
      const ri=routeIndex(row.boat),si=roleIndex(row.boat);
      if(ri<0||si<0||routeWater.routes[ri].course!==row.course||selection.roles[si].course!==row.course)
        throw Error('pair_route_boat_course_mismatch');
    }
    const routeRef=(boat,field='')=>ref('routeWater',`/routes/${routeIndex(boat)}${field?'/'+field:''}`);
    const project=boat=>{
      const fields=['status','path','zone','pressureFrom','followsAttacker','potentialCompetition','required','unobserved','actualTurnObserved'];
      const fieldRefs=Object.fromEntries(fields.map(k=>[k,routeRef(boat,k)]));
      return {...Object.fromEntries(fields.map(k=>[k,copy(fieldRefs[k].value)])),fieldRefs};
    };
    const partners=rows.filter(r=>r.boat!==head);
    for(const second of partners)for(const third of partners)if(second.boat!==third.boat){
      const a=routeWater.routes[routeIndex(second.boat)],b=routeWater.routes[routeIndex(third.boat)];
      const known=a.status==='conditional'&&b.status==='conditional';
      const rel=(value,refs)=>({value:known?value:null,evidenceRefs:refs});
      const pairField=(field)=>[routeRef(second.boat,field),routeRef(third.boat,field)];
      const ticket=`${head}-${second.boat}-${third.boat}`,pi=selection.pool.findIndex(p=>p.ticket===ticket);
      if(selection.pool.length!==0&&(selection.pool.length!==20||pi<0))throw Error('pair_route_pool_mismatch');
      base.pairs.push({pairKey:`${input.raceKey}:${scenario.id}:${ticket}`,head,second:second.boat,third:third.boat,
        secondCourse:second.course,thirdCourse:third.course,scenarioId:scenario.id,
        secondRouteRef:routeRef(second.boat),thirdRouteRef:routeRef(third.boat),
        secondRoleRef:ref('selection',`/roles/${roleIndex(second.boat)}`),thirdRoleRef:ref('selection',`/roles/${roleIndex(third.boat)}`),
        selectionPoolMembership:pi<0?'not-evaluated':'evaluated',selectionPoolRef:pi<0?null:ref('selection',`/pool/${pi}`),
        selectedBySource:selection.tickets.includes(ticket),secondRoute:project(second.boat),thirdRoute:project(third.boat),
        relations:{sameScenario:{value:true,evidenceRefs:[ref('flow','/decision/scenarioId'),ref('routeWater','/scenarioId'),ref('selection','/scenarioId')]},
          sameZone:rel(a.zone==='unknown'||b.zone==='unknown'?null:a.zone===b.zone,pairField('zone')),
          secondListsThirdAsCompetition:rel(a.potentialCompetition.includes(third.boat),[routeRef(second.boat,'potentialCompetition')]),
          thirdListsSecondAsCompetition:rel(b.potentialCompetition.includes(second.boat),[routeRef(third.boat,'potentialCompetition')]),
          secondUnderPressureFromThird:rel(a.pressureFrom.includes(third.boat),[routeRef(second.boat,'pressureFrom')]),
          thirdUnderPressureFromSecond:rel(b.pressureFrom.includes(second.boat),[routeRef(third.boat,'pressureFrom')]),
          secondFollowsThird:rel(a.followsAttacker===third.boat,[routeRef(second.boat,'followsAttacker')]),
          thirdFollowsSecond:rel(b.followsAttacker===second.boat,[routeRef(third.boat,'followsAttacker')]),
          sharedPressureSources:rel(a.pressureFrom.filter(boat=>b.pressureFrom.includes(boat)),pairField('pressureFrom'))},
        compatibility:'unknown',actualTurnObserved:false});
    }
  }
  return {...base,diagnosticHash:hash(json(base))};
}
function validate(value,...inputs){if(json(value)!==json(judge(...inputs)))throw Error('pair_route_diagnostic_replay_mismatch');return true;}
module.exports={VERSION,SAFETY,judge,validate};
