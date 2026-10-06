'use strict';
// Versioned research hypotheses. No normal-AI scores, odds, tickets or results.
// Supported means supported by this limited pre-race rule, not a proven turn.
const {createHash}=require('node:crypto');
const contextContract=require('./independent-judgment-context.cjs');
const VERSION='independent-flow-roles-v1';
const STAGES=['flow','course','start','exhibition','remainPickup','localWater','skill','motor'];
const hash=x=>createHash('sha256').update(JSON.stringify(x)+'\n').digest('hex');
const round=x=>Math.round(x*1e6)/1e6;
const and=xs=>xs.includes(false)?false:xs.includes(null)?null:true;
function judge(input,context){
  contextContract.validate(context,input);
  const rows=[...input.rows].sort((a,b)=>a.course-b.course);
  if(rows.length!==6||rows.some((r,i)=>r.course!==i+1||typeof r.st!=='number'||!Number.isFinite(r.st)||r.st<0||
    typeof r.displayTime!=='number'||!Number.isFinite(r.displayTime)||r.displayTime<=0))throw Error('flow_facts_invalid');
  const inputHash=hash(input),contextHash=context.contextHash;
  const fact=(source,boat,field)=>{
    const collection=source==='input'?input.rows:context.officialEntries;
    let value=collection.find(r=>r.boat===boat);
    for(const key of field.split('.'))value=value?.[key];
    return {source,sourceHash:source==='input'?inputHash:contextHash,boat,field,value:value===undefined?null:JSON.parse(JSON.stringify(value))};
  };
  const courseFacts=boats=>boats.map(boat=>fact('input',boat,'course'));
  const rank=row=>{
    const p=context.officialEntries.find(e=>e.boat===row.boat)?.officialStartRank;
    const age=Date.parse(input.observedAt)-Date.parse(p?.fetchedAt);
    const value=p?.byCourse?.[row.course];
    return Number.isFinite(age)&&age>=0&&age<=6*3600000&&typeof value==='number'?value:null;
  };
  const markers=rows.filter(r=>r.marker).map(r=>r.boat);
  const pressures=rows.slice(1).map(own=>{
    const inner=rows[own.course-2],ownRank=rank(own),innerRank=rank(inner);
    const displayGap=round(inner.displayTime-own.displayTime),stGap=round(inner.st-own.st);
    const rankGap=ownRank===null||innerRank===null?null:round(innerRank-ownRank);
    const signal=markers.length?null:and([stGap>0,displayGap>=0.10,rankGap===null?null:rankGap>=0.5]);
    const walls=rows.filter(r=>r.course<own.course).map(r=>({boat:r.boat,course:r.course,
      stGap:round(r.st-own.st),wallCandidate:r.st<=own.st,
      evidence:[fact('input',r.boat,'course'),fact('input',r.boat,'st'),fact('input',own.boat,'st')]}));
    return {boat:own.boat,course:own.course,insideBoat:inner.boat,displayGap,stGap,rankGap,signal,
      generalRaceOnlyConfirmed:false,walls,evidence:[...courseFacts([own.boat,inner.boat]),
        fact('input',own.boat,'displayTime'),fact('input',inner.boat,'displayTime'),
        fact('input',own.boat,'st'),fact('input',inner.boat,'st'),
        fact('context',own.boat,'officialStartRank'),fact('context',inner.boat,'officialStartRank')]};
  });
  const attacks=pressures.filter(p=>p.signal===true&&!p.walls.some(w=>w.wallCandidate));
  const unresolved=pressures.some(p=>p.signal===null);
  const inside=rows[0],second=rows[1],scenarios=[];
  const add=(type,actor,status,reason,evidence,extra={})=>{
    const s={id:`${type}:${actor}`,type,actor,status,reason,evidence,unobserved:['actual-first-turn'],...extra};
    scenarios.push(s);return s;
  };
  add('escape',inside.boat,markers.length||unresolved?'unknown':attacks.length?'contested':inside.st<=second.st?'supported':'conditional',
    markers.length?'exhibition-start-marker':unresolved?'unresolved-outside-pressure':attacks.length?'outside-pressure-present':
      inside.st<=second.st?'first-course-without-detected-pressure':'second-course-ahead-in-exhibition',
    [...courseFacts([inside.boat,second.boat]),fact('input',inside.boat,'st'),fact('input',second.boat,'st')],
    {pressureBoats:attacks.map(p=>p.boat)});
  for(const p of pressures)add('makuri',p.boat,markers.length||p.signal===null?'unknown':!p.signal?'unsupported':
    p.walls.some(w=>w.wallCandidate)?'blocked':'supported',
    markers.length?'exhibition-start-marker':p.signal===null?'rank-reference-missing':!p.signal?'adjacent-pressure-not-supported':
      p.walls.some(w=>w.wallCandidate)?'inner-exhibition-wall':'outer-route-without-exhibition-wall',p.evidence,
    {wallBoats:p.walls.filter(w=>w.wallCandidate).map(w=>w.boat),pressuredBoats:rows.filter(r=>r.course<p.course).map(r=>r.boat)});
  // A gap during the turn is not observable in a start/display-time snapshot.
  // Keep these routes explicit, but never promote them from numeric gaps alone.
  add('sashi',second.boat,markers.length?'unknown':'conditional','inside-turn-opening-unobserved',courseFacts([inside.boat,second.boat]),
    {leadingBoat:inside.boat,unobserved:['inside-turn-opening','turn-technique']});
  for(const own of rows.slice(2)){
    const lead=attacks.find(p=>p.course===own.course-1);
    add('makuri-sashi',own.boat,markers.length?'unknown':'conditional',lead?'follow-attacker-opening-unobserved':'turn-route-unobserved',
      courseFacts([own.boat,...(lead?[lead.boat]:[])]),
      {leadAttacker:lead?.boat||null,unobserved:['pass-and-inside-turn-opening','turn-technique']});
  }
  for(const s of scenarios){
    const actor=rows.find(r=>r.boat===s.actor);
    s.roles=rows.map(row=>{
      let role='unresolved',reason='finishing-position-not-supported';
      if(row.boat===s.actor){role='scenario-actor';reason='conditional-on-this-scenario';}
      else if(s.type==='escape'&&row.course===2){role='inside-remain';reason='inside-following-position';}
      else if(s.type==='makuri'&&row.course<actor.course){
        role=s.wallBoats.includes(row.boat)?'wall-remain':row.course===1?'inside-recovery':'pressured-inside';
        reason='inside-boat-is-pressured-not-eliminated';
      }else if(s.type==='makuri'&&row.course===actor.course+1){role='pickup-outside-attacker';reason='adjacent-outside-following-route';}
      else if(s.type==='sashi'&&row.boat===s.leadingBoat){role='remain-after-leading-turn';reason='leading-boat-can-remain';}
      else if(s.type==='makuri-sashi'&&row.boat===s.leadAttacker){role='attack-remain';reason='lead-attacker-can-remain';}
      else if(s.type==='makuri-sashi'&&row.course===1){role='inside-remain';reason='first-course-recovery-possible';}
      return {boat:row.boat,course:row.course,role,reason,status:role==='unresolved'||role==='pressured-inside'?'unknown':'conditional',
        positions:row.boat===s.actor?[1]:[2,3],evidence:courseFacts([s.actor,row.boat])};
    });
  }
  const supported=scenarios.filter(s=>s.status==='supported');
  const primary=!markers.length&&!unresolved&&supported.length===1?supported[0]:null;
  const decision={status:primary?'reference':'unresolved',scenarioId:primary?.id||null,actor:primary?.actor||null,
    reason:markers.length?'exhibition-start-marker':unresolved?'incomplete-pressure-evidence':supported.length>1?'competing-supported-scenarios':
      primary?'unique-supported-research-scenario':'no-supported-main-scenario'};
  return {version:VERSION,inputHash,contextHash,raceKey:input.raceKey,observedAt:input.observedAt,
    decision,pressures,scenarios,stages:STAGES.map(stage=>({stage,status:['localWater','skill','motor'].includes(stage)?'unimplemented':
      stage==='start'&&markers.length?'unknown':'implemented',
      scope:stage==='remainPickup'?'conditional-roles-not-second-third-ranking':stage==='flow'?'limited-escape-makuri-hypothesis':null})),
    tickets:[],fullJudgmentImplemented:false,selectionImplemented:false,usableForPrediction:false,
    automaticApplication:false,chatEquivalent:false,strictSuperConfirmed:false};
}
function validate(value,input,context){
  if(JSON.stringify(value)!==JSON.stringify(judge(input,context)))throw Error('flow_judgment_replay_mismatch');
  return true;
}
module.exports={VERSION,STAGES,judge,validate};
