'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {specification,run}=require('./setup-line-menu.cjs');
const image=Buffer.alloc(32);Buffer.from('89504e470d0a1a0a','hex').copy(image);image.writeUInt32BE(2500,16);image.writeUInt32BE(843,20);
const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',LINE_CHANNEL_ACCESS_TOKEN:'test'};
const id='richmenu-'+'a'.repeat(32);
function fixture(){let current=null,content=null,menu=null;const calls=[];return {calls,env,image,request:async(url,opts)=>{
  calls.push([url,opts.method]);assert(!url.includes('/message/'));assert.equal(opts.redirect,'error');let body;
  if(url.endsWith('/info'))body={basicId:'@009mdbvr'};
  else if(url.endsWith('/validate'))body={};
  else if(url.endsWith('/list'))body={richmenus:menu?[{richMenuId:id,...menu}]:[]};
  else if(url.endsWith('/user/all/richmenu/'+id)){current=id;body={};}
  else if(url.endsWith('/user/all/richmenu'))body=current?{richMenuId:current}:null;
  else if(url.endsWith('/content')){if(opts.method==='POST'){content=opts.body;body={};}else body=content;}
  else if(url.endsWith('/richmenu')&&opts.method==='POST'){menu=JSON.parse(opts.body);body={richMenuId:id};}
  else if(url.endsWith('/richmenu/'+id))body={richMenuId:id,...menu};
  else throw Error(url);
  return {ok:body!==null,status:body===null?404:200,json:async()=>body,arrayBuffer:async()=>body};
}};}
test('two URI buttons, verified default, zero broadcasts; repeated setup reuses image and menu',async()=>{
 const f=fixture(),r=await run(f);assert.equal(r.status,'default_menu_verified');assert.equal(r.messagesSent,0);
 const count=f.calls.filter(x=>x[1]==='POST').length;await run(f);
 assert.equal(f.calls.filter(x=>x[1]==='POST').length,count+1); // validation only
 const s=specification(image);assert.deepEqual(s.areas.map(x=>x.action.label),['今日の予想','結果を見る']);assert(s.areas.every(x=>x.action.type==='uri'));
});
test('wrong account, main branch, bad image stop before menu creation',async()=>{
 await assert.rejects(run({...fixture(),env:{...env,GITHUB_REF:'refs/heads/other'}}),/main_only/);
 await assert.rejects(run({...fixture(),image:Buffer.alloc(32)}),/image_invalid/);
 const f=fixture(),original=f.request;f.request=async(u,o)=>u.endsWith('/info')?{ok:true,json:async()=>({basicId:'@wrong'})}:original(u,o);
 await assert.rejects(run(f),/account_mismatch/);assert.equal(f.calls.length,0);
});
