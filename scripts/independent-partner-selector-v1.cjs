'use strict';
const {hash}=require('./independent-autonomous-candidate.cjs');
const flowContract=require('./independent-flow-roles-v1.cjs'),supportContract=require('./independent-partner-context-v1.cjs');
const VERSION='independent-partner-selector-v1',json=x=>JSON.stringify(x)+'\n';
// -1: a dominates, 1: b dominates, 0: exact tie, null: conflicting evidence.
function pareto(deltas){const better=deltas.some(v=>v<0),worse=deltas.some(v=>v>0);return better&&worse?null:better?-1:worse?1:0;}
const skillDelta=(a,b)=>(b.top3-b.wins)*(a.starts-a.wins)-(a.top3-a.wins)*(b.starts-b.wins);
function judge(input,context,flow,support){
  flowContract.validate(flow,input,context);supportContract.validate(support,input,context);
  const scenario=flow.scenarios.find(s=>s.id===flow.decision.scenarioId),head=flow.decision.actor;
  const rows=[...input.rows].sort((a,b)=>a.course-b.course);
  const proof=(source,boat,field)=>{
    let value=(source==='input'?input.rows:source==='context'?context.officialEntries:support.rows).find(r=>r.boat===boat);
    for(const k of field.split('.'))value=value?.[k];
    return {source,sourceHash:source==='input'?flow.inputHash:source==='context'?flow.contextHash:support.supportHash,boat,field,value:value??null};
  };
  const rank=r=>{const p=context.officialEntries.find(e=>e.boat===r.boat)?.officialStartRank,age=Date.parse(input.observedAt)-Date.parse(p?.fetchedAt);
    return Number.isFinite(age)&&age>=0&&age<=21600000? p?.byCourse?.[r.course]??null:null;};
  const actor=rows.find(r=>r.boat===head);
  const roles=rows.map(r=>{
    const s=support.rows.find(x=>x.boat===r.boat),known=s.recent?.starts>=12&&s.previous?.starts>=12&&s.recent.starts>s.recent.wins&&s.previous.starts>s.previous.wins;
    let role='unresolved';
    if(scenario){if(r.boat===head)role='head';else if(scenario.type==='escape')role=r.course===2?'inside-follow':'outside-follow';
      else if(scenario.type==='makuri')role=r.course<actor.course?'inside-recovery':r.course===actor.course+1?'adjacent-pickup':'outside-follow';}
    return {boat:r.boat,course:r.course,role,positions:r.boat===head?[1]:[2,3],conditional:true,
      historyStatus:known?'available':'insufficient',turnOpeningObserved:false,
      evidence:[proof('input',r.boat,'course'),proof('support',r.boat,'recent'),proof('support',r.boat,'previous')]};
  });
  const comparisons=[],tiers={second:[],third:[]},pool=[];
  const base={version:VERSION,inputHash:flow.inputHash,contextHash:flow.contextHash,flowHash:hash(json(flow)),supportHash:support.supportHash,
    raceKey:input.raceKey,head,scenarioId:scenario?.id||null,roles,comparisons,tiers,pool,
    stageOrder:flowContract.STAGES,unimplemented:['actual-turn-openings','local-water-ordering','motor-ordering'],
    selectionImplemented:true,fullJudgmentImplemented:false,usableForPrediction:false,automaticApplication:false,chatEquivalent:false};
  const skip=reason=>({...base,status:'skipped',reason,tickets:[]});
  if(flow.decision.status!=='reference'||!scenario||!['escape','makuri'].includes(scenario.type))return skip('main-scenario-unresolved');
  if(support.history.status!=='available'||roles.some(r=>r.historyStatus!=='available'))return skip('course-history-insufficient');
  if(new Set(support.rows.map(r=>r.registerNo)).size!==6)return skip('racer-identity-not-unique');
  if(rows.some(r=>rank(r)===null))return skip('course-start-rank-missing');
  const partners=rows.filter(r=>r.boat!==head),matrix=new Map();
  function compare(a,b,position){
    const sa=support.rows.find(r=>r.boat===a.boat),sb=support.rows.find(r=>r.boat===b.boat);
    const ra=roles.find(r=>r.boat===a.boat),rb=roles.find(r=>r.boat===b.boat);
    // Actual course establishes the route and selects its history, never a boat-number tie-break.
    const stages=[{stage:'start',deltas:[a.st-b.st,rank(a)-rank(b)],
      evidence:[proof('input',a.boat,'st'),proof('input',b.boat,'st'),proof('context',a.boat,'officialStartRank'),proof('context',b.boat,'officialStartRank')]},
      {stage:'exhibition',deltas:[a.displayTime-b.displayTime,...(support.lap.status==='available'?[sa.lapTime-sb.lapTime]:[])],
        evidence:[proof('input',a.boat,'displayTime'),proof('input',b.boat,'displayTime'),proof('support',a.boat,'lapTime'),proof('support',b.boat,'lapTime')]},
      {stage:'remainPickup',deltas:[(position===2&&!['inside-follow','adjacent-pickup'].includes(ra.role)?1:0)-(position===2&&!['inside-follow','adjacent-pickup'].includes(rb.role)?1:0)],
        roles:[ra.role,rb.role],evidence:[proof('input',a.boat,'course'),proof('input',b.boat,'course')]},
      {stage:'skill',deltas:[skillDelta(sa.recent,sb.recent),skillDelta(sa.previous,sb.previous)],
        evidence:[proof('support',a.boat,'recent'),proof('support',b.boat,'recent'),proof('support',a.boat,'previous'),proof('support',b.boat,'previous')]}];
    let outcome=0,decidingStage='tie';const evaluated=[];
    for(const s of stages){outcome=pareto(s.deltas);evaluated.push({...s,outcome});if(outcome!==0){decidingStage=s.stage;break;}}
    comparisons.push({position,a:a.boat,b:b.boat,outcome,decidingStage,evaluated});
    return outcome;
  }
  for(const position of [2,3]){
    for(let a=0;a<partners.length;a++)for(let b=a+1;b<partners.length;b++){
      const result=compare(partners[a],partners[b],position);matrix.set(`${position}:${partners[a].boat}:${partners[b].boat}`,result);
      matrix.set(`${position}:${partners[b].boat}:${partners[a].boat}`,result===null?null:-result);
    }
    let remaining=[...partners];
    while(remaining.length){const front=remaining.filter(a=>!remaining.some(b=>matrix.get(`${position}:${b.boat}:${a.boat}`)===-1));
      if(!front.length)throw Error('partner_comparison_cycle');
      tiers[position===2?'second':'third'].push(front.map(r=>r.boat));const ids=new Set(front.map(r=>r.boat));remaining=remaining.filter(r=>!ids.has(r.boat));}
  }
  for(const second of partners)for(const third of partners)if(second.boat!==third.boat)
    pool.push({ticket:`${head}-${second.boat}-${third.boat}`,second:second.boat,third:third.boat,scenarioId:scenario.id,
      secondRole:roles.find(r=>r.boat===second.boat).role,thirdRole:roles.find(r=>r.boat===third.boat).role,dominatedBy:[]});
  const cmp=(position,a,b)=>a===b?0:matrix.get(`${position}:${a}:${b}`);
  for(const a of pool)for(const b of pool){const ds=[cmp(2,b.second,a.second),cmp(3,b.third,a.third)];
    if(ds.every(v=>v===0||v===-1)&&ds.includes(-1))a.dominatedBy.push(b.ticket);}
  const front=pool.filter(r=>!r.dominatedBy.length);
  // Keep the whole partial-order frontier. Never truncate an unresolved tie to seven.
  if(!front.length||front.length>7)return skip('ticket-frontier-exceeds-limit');
  return {...base,status:'selected',reason:'supported-route-and-complete-ticket-frontier',tickets:front.map(r=>r.ticket)};
}
function validate(value,input,context,flow,support){if(json(value)!==json(judge(input,context,flow,support)))throw Error('partner_judgment_replay_mismatch');return true;}
module.exports={VERSION,judge,validate,pareto};
