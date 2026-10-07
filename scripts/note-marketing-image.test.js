'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {publishCard}=require('./note-marketing-image');
const REPO='takechanman12250711-oss/chappy-boatrace-ai';
const {renderCard}=require('./note-result-card.cjs');
const now=Date.parse('2026-10-06T20:00:00Z');
const row={raceKey:'20261006-01-1',publicationKey:'20261006-01-1:normal',articleSeries:'normal',place:'桐生',raceNo:1,ticketCount:3,
  sourceSha256:'a'.repeat(64),url:'https://note.com/great_robin3243/n/nabcdef',deadlineAt:'2026-10-06T15:00:00+09:00',publishedAt:'2026-10-06T14:30:00+09:00',
  settlement:{status:'hit',combination:'1-2-3',payoutPer100Yen:1720,resultUrl:'https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261006&jcd=01&rno=1'}};
row.settlement.evidenceId=createHash('sha256').update([row.publicationKey,row.sourceSha256,'1-2-3',1720].join('|')).digest('hex');
let card,png;
test.before(async()=>{card=await renderCard(row,{now});png=card.png;});
function fixture(){
  const writes=[];let record;
  const store={revision:'1'.repeat(40),file:async()=>JSON.stringify(record),api:async(route,method='GET',body)=>{
    if(!route)return {full_name:REPO,private:false};
    if(route.startsWith('/git/ref/tags/'))return record?{object:{sha:'4'.repeat(40)}}:null;
    writes.push({route,body});
    if(route==='/git/blobs')return {sha:'2'.repeat(40)};
    if(route==='/git/trees'){record=JSON.parse(body.tree.find(t=>t.path==='receipt.json').content);return {sha:'3'.repeat(40)};}
    if(route==='/git/commits')return {sha:'4'.repeat(40)};
    if(route==='/git/refs')return {object:{sha:'4'.repeat(40)}};
    throw Error(route);
  }};
  const request=async(url,options)=>{assert.equal(url,`https://raw.githubusercontent.com/${REPO}/${'4'.repeat(40)}/result-card.png`);assert(!options.headers);assert.equal(options.redirect,'error');return {ok:true,headers:new Map([['content-type','image/png']]),arrayBuffer:async()=>png};};
  return {store,writes,request};
}
test('public immutable image is byte-verified anonymously and reused without rewriting',async()=>{
  const f=fixture();const result=await publishCard(f.store,row,card,f.request,now);
  assert.equal(result.imageSha256,card.sha256);assert.equal(result.assets[0].image.url,result.url);
  const n=f.writes.length;assert.equal(n,4);await publishCard(f.store,row,card,f.request,now);assert.equal(f.writes.length,n);
  assert(!JSON.stringify(f.writes).includes('tickets'));
});
test('private repo, non-PNG, wrong bytes and failed public read stop image delivery',async()=>{
  const f=fixture();f.store.api=async()=>({full_name:REPO,private:true});
  await assert.rejects(publishCard(f.store,row,card,f.request,now),/public_repository_required/);
  await assert.rejects(publishCard(f.store,row,{...card,png:Buffer.from('private')},f.request,now),/card_invalid/);
  for(const response of [
    {ok:false,headers:new Map()},
    {ok:true,headers:new Map([['content-type','text/html']])},
    {ok:true,headers:new Map([['content-type','image/png']]),arrayBuffer:async()=>Buffer.from('wrong')}
  ]){const g=fixture();await assert.rejects(publishCard(g.store,row,card,async()=>response,now),/public_(unavailable|mismatch)/);}
});

test('upload boundary rechecks safe display projection and actual image dimensions',async()=>{
 const f=fixture();for(const corrupt of [{...card,content:{...card.content,privateText:'secret'}},{...card,altText:'private note'},
   {...card,width:1},{...card,png:Buffer.from('89504e470d0a1a0a010203','hex')}]) {
   await assert.rejects(publishCard(f.store,row,corrupt,f.request,now),/card_invalid/);
 }
 assert.equal(f.writes.length,0);
});
