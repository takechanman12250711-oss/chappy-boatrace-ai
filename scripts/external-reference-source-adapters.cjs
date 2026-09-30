'use strict';
const { sha256 } = require('./external-reference-three-source.cjs');

const VENUES = new Map([
 ['桐生','01'],['戸田','02'],['江戸川','03'],['平和島','04'],['多摩川','05'],['浜名湖','06'],
 ['蒲郡','07'],['常滑','08'],['津','09'],['三国','10'],['びわこ','11'],['住之江','12'],
 ['尼崎','13'],['鳴門','14'],['丸亀','15'],['児島','16'],['宮島','17'],['徳山','18'],
 ['下関','19'],['若松','20'],['芦屋','21'],['福岡','22'],['唐津','23'],['大村','24']
]);
const strip = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').normalize('NFKC').trim();

function hiyoriDailySignals(html,date){
 const t=strip(html), out=[];
 const venuePattern=[...VENUES.keys()].join('|');
 const sections=[
  {kind:'escape70_release50', re:new RegExp(`(${venuePattern})\\s+(\\d{1,2})R(?:\\s+([1-6]))?`,'gu')},
  {kind:'makuri25', re:new RegExp(`(${venuePattern})\\s+(\\d{1,2})R\\s+([1-6])\\s+(\\d{1,2}(?:\\.\\d)?)%`,'gu')}
 ];
 const escape=t.match(/逃げ70%以上[\s\S]*?(?=まくり率25%以上|$)/)?.[0]||'';
 const makuri=t.match(/まくり率25%以上[\s\S]*$/)?.[0]||'';
 for(const [cfg,body] of [[sections[0],escape],[sections[1],makuri]]){
  for(const m of body.matchAll(cfg.re)){
   const venue=m[1];
   const features={signal:cfg.kind,boat:m[3]?Number(m[3]):null};
   if(cfg.kind==='makuri25') features.makuriRate=Number(m[4]);
   out.push({raceKey:`${date}-${VENUES.get(venue)}-${Number(m[2])}`,features});
  }
 }
 return dedupe(out);
}
function macourWakamatsuSignals(html,date){
 const t=strip(html), out=[];
 const races=[...t.matchAll(/(\d{1,2})R/g)];
 for(let i=0;i<races.length;i++){
  const race=races[i], start=race.index||0, end=i+1<races.length?(races[i+1].index||t.length):t.length;
  const segment=t.slice(start,end), frame=segment.match(/([1-6])枠/);
  const tags=[];
  if(/カド/.test(segment)) tags.push('kado');
  if(/攻め/.test(segment)) tags.push('attack');
  if(/スタート展示/.test(segment)) tags.push('start_exhibition_attention');
  if(/伸び/.test(segment)) tags.push('stretch');
  if(/足(?:は|が)?いい|舟足.*良|レース足.*いい/.test(segment)) tags.push('foot_positive');
  if(!tags.length) continue;
  out.push({raceKey:`${date}-20-${Number(race[1])}`,features:{signal:'public_preview',frame:frame?Number(frame[1]):null,tags}});
 }
 return dedupe(out);
}
function macourWakamatsuRaceSignal(html,date,raceNo){
 const markers={'①':1,'②':2,'③':3,'④':4,'⑤':5,'⑥':6};
 const marked=String(html).replace(/[①②③④⑤⑥]/g,m=>` BOAT${markers[m]} `);
 const t=strip(marked), mentions=[];
 for(const m of t.matchAll(/BOAT([1-6])\s*([^。！？]{0,80})/g)){
  const boat=Number(m[1]), phrase=m[2], tags=[];
  if(/逃げ|速攻|先マイ/.test(phrase)) tags.push('escape_or_fast_attack');
  if(/差し/.test(phrase)) tags.push('sashi');
  if(/まくり|捲り|握/.test(phrase)) tags.push('makuri_or_full_turn');
  if(/カド/.test(phrase)) tags.push('kado');
  if(/スタート/.test(phrase)) tags.push('start_attention');
  if(/出足|伸び|舟足|足/.test(phrase)) tags.push('foot');
  if(tags.length) mentions.push({boat,tags});
 }
 if(!mentions.length) return null;
 return {raceKey:`${date}-20-${Number(raceNo)}`,features:{signal:'public_race_preview',boat:mentions[0].boat,mentions}};
}
function brPublicCapability(html){
 const t=strip(html);
 const keys=['B','E','S','A','G','K','L','W'];
 const hasEight=keys.every(k=>new RegExp(`(?:^|[^A-Z])${k}(?:[^A-Z]|$)`).test(t));
 return {raceLevelPublic:false,methodologyAvailable:hasEight,
   indexKeys:hasEight?keys:[],reason:'public_site_explains_methodology_but_race_level_indices_are_sold_on_note_or_regimag'};
}
function dedupe(rows){
 const seen=new Set(); return rows.filter(r=>{const k=r.raceKey+JSON.stringify(r.features);if(seen.has(k))return false;seen.add(k);return true;});
}
function captureFromSignal(source,signal,{capturedAt,sourceUrl,rawBytes}){
 return {version:'external-reference-v1',raceKey:signal.raceKey,source,capturedAt,beforeResult:true,
  sourceUrl,sourceSha256:sha256(rawBytes),features:signal.features,
  productionChanged:false,automaticApplication:false,usableForPrediction:false};
}
module.exports={VENUES,strip,hiyoriDailySignals,macourWakamatsuSignals,macourWakamatsuRaceSignal,brPublicCapability,captureFromSignal};
