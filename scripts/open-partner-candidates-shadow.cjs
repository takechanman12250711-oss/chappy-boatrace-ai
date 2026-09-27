"use strict";
/* Research only. These are the original PR1087 experimental weights, not
 * production probabilities. This changes eligibility AND ranking. A separate
 * gate-only replay is required. Correlated source scores may overlap. */
const FIELDS=[['roleScores','hold'],['roleScores','flow'],['roleScores','road'],['roleScores','pickup'],['indexes','total']];
const boatNo=row=>Number(row?.boatNo??row?.number??row?.waku??row?.boat??0);
const presentFinite=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v));
function roleScore(row,role){
  if(!FIELDS.every(([a,b])=>presentFinite(row?.[a]?.[b])))throw new TypeError('Missing pre-race role score');
  const s=row.roleScores,i=row.indexes;
  if(role==='second')return Number(s.hold)*.34+Number(s.flow)*.24+Number(s.road)*.16+Number(i.total)*.16+Number(s.pickup)*.10;
  if(role==='third')return Number(s.pickup)*.34+Number(s.road)*.24+Number(s.hold)*.16+Number(s.flow)*.16+Number(i.total)*.10;
  throw new TypeError('Unknown role');
}
function buildOpenPartnerCandidates({analyses,attackerBoatNo,blockedBoats=[],secondLimit=3,thirdLimit=4}={}){
  const list=Array.isArray(analyses)?analyses:[],head=Number(attackerBoatNo),ids=list.map(boatNo),errors=[];
  if(list.length!==6||new Set(ids).size!==6||ids.some(n=>!Number.isInteger(n)||n<1||n>6))errors.push('invalid-six-boat-identity');
  if(!Number.isInteger(head)||head<1||head>6)errors.push('invalid-head');
  if(!Array.isArray(blockedBoats)||blockedBoats.some(n=>!Number.isInteger(Number(n))||Number(n)<1||Number(n)>6))errors.push('invalid-blocked-boats');
  if(![secondLimit,thirdLimit].every(n=>Number.isInteger(n)&&n>=1&&n<=5))errors.push('invalid-limit');
  if(list.some(row=>!FIELDS.every(([a,b])=>presentFinite(row?.[a]?.[b]))))errors.push('missing-pre-race-role-scores');
  const common={ready:errors.length===0,reasonCodes:errors,policy:'open-partner-candidates-shadow-v1-validated',constraints:{excludesOnly:['attacker','explicit-blocked-boats'],fixedCourseGate:false,resultUsed:false,oddsUsed:false,rankingChanged:true}};
  if(errors.length)return {...common,secondCandidates:[],thirdCandidates:[]};
  const blocked=new Set(blockedBoats.map(Number));
  const eligible=list.filter(row=>boatNo(row)!==head&&!blocked.has(boatNo(row)));
  function rank(role,limit){return eligible.map(row=>({boatNo:boatNo(row),score:Number(roleScore(row,role).toFixed(3)),source:'experimental-recombination-of-pre-race-role-scores'})).sort((a,b)=>b.score-a.score||a.boatNo-b.boatNo).slice(0,limit).map((row,i)=>({...row,rank:i+1}));}
  return {...common,secondCandidates:rank('second',secondLimit),thirdCandidates:rank('third',thirdLimit)};
}
module.exports={buildOpenPartnerCandidates,roleScore};
