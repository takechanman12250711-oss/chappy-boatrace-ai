'use strict';
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const INDEX='https://note.com/great_robin3243/n/na76b6c6c18ff';
const digest=x=>createHash('sha256').update(x).digest('hex');
function specification(image) {
  if(image.length>1000000||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||image.readUInt32BE(16)!==2500||image.readUInt32BE(20)!==843)throw Error('menu_image_invalid');
  return {size:{width:2500,height:843},selected:true,name:'chappy-note-navigation-v1-'+digest(image).slice(0,16),chatBarText:'予想・結果を見る',areas:['今日の予想','結果を見る'].map((label,i)=>({bounds:{x:i*1250,y:0,width:1250,height:843},action:{type:'uri',label,uri:INDEX}}))};
}
function same(actual,wanted) {return Object.keys(wanted).every(k=>isDeepStrictEqual(actual[k],wanted[k]));}
async function run({env=process.env,image=fs.readFileSync('/tmp/line-menu.png'),request=fetch}={}) {
  if(env.GITHUB_REPOSITORY!=='takechanman12250711-oss/chappy-boatrace-ai'||env.GITHUB_REF!=='refs/heads/main')throw Error('menu_main_only');
  if(!env.LINE_CHANNEL_ACCESS_TOKEN||/\s/.test(env.LINE_CHANNEL_ACCESS_TOKEN))throw Error('line_token_missing');
  const wanted=specification(image);
  async function api(path,method='GET',body,content=false,missing=false) {
    // Fixed hosts and paths; never use message endpoints or a user recipient.
    const url=(content?'https://api-data.line.me':'https://api.line.me')+'/v2/bot/'+path;
    const r=await request(url,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':content?'image/png':'application/json'},...(body?{body:content?body:JSON.stringify(body)}:{})});
    if(missing&&r.status===404)return null;
    if(!r.ok)throw Error('line_menu_http_'+r.status);
    return content&&method==='GET'?Buffer.from(await r.arrayBuffer()):r.json();
  }
  const bot=await api('info');if(bot.basicId!=='@009mdbvr')throw Error('line_account_mismatch');
  await api('richmenu/validate','POST',wanted);
  const list=await api('richmenu/list');if(!Array.isArray(list.richmenus))throw Error('menu_list_invalid');
  const matching=list.richmenus.filter(x=>same(x,wanted));if(matching.length>1)throw Error('menu_duplicate_review_required');
  const previous=await api('user/all/richmenu','GET',undefined,false,true);
  let id=matching[0]?.richMenuId;
  if(!id)id=(await api('richmenu','POST',wanted)).richMenuId;
  if(!/^richmenu-[a-f0-9]{32}$/.test(id||''))throw Error('menu_id_invalid');
  let content=await api('richmenu/'+id+'/content','GET',undefined,true,true);
  if(content===null) {await api('richmenu/'+id+'/content','POST',image,true);content=await api('richmenu/'+id+'/content','GET',undefined,true);}
  if(digest(content)!==digest(image))throw Error('menu_image_mismatch');
  if(!same(await api('richmenu/'+id),wanted))throw Error('menu_specification_mismatch');
  if(previous?.richMenuId!==id)await api('user/all/richmenu/'+id,'POST');
  if((await api('user/all/richmenu')).richMenuId!==id)throw Error('default_menu_unverified');
  return {status:'default_menu_verified',basicId:bot.basicId,richMenuId:id,previousRichMenuId:previous?.richMenuId||null,imageSha256:digest(image),labels:wanted.areas.map(x=>x.action.label),url:INDEX,messagesSent:0,phoneDisplayConfirmed:false};
}
if(require.main===module)run().then(result=>{const text=JSON.stringify(result);console.log('LINE_MENU='+text);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\nLINE navigation menu\n```json\n'+text+'\n```\n');}).catch(()=>{console.error('LINE_MENU_FAILED=check_account_menu_or_image_no_messages_sent');process.exitCode=1;});
module.exports={specification,same,run};
