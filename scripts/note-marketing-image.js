'use strict';
const {createHash}=require('node:crypto');
const {REPO}=require('./note-marketing-store');
const {publicContent,altText}=require('./note-result-card.cjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
const sha=value=>/^[a-f0-9]{40}$/.test(value||'');
// Only a completed, public result card goes into the existing public repo.
// Never upload originals, tickets, credentials, or arbitrary local files.
async function publishCard(store,row,card,request=fetch,now=Date.now()) {
  const expected=publicContent(row,{now});
  if((row.version==='published-main-race-result-v1'?row.status:row.settlement?.status)!=='hit'||!Buffer.isBuffer(card.png)||card.png.length<1000||card.png.length>2*1024*1024||
    card.png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||digest(card.png)!==card.sha256||
    card.mimeType!=='image/png'||card.width!==1200||card.height!==675||
    card.png.toString('ascii',12,16)!=='IHDR'||card.png.readUInt32BE(16)!==1200||card.png.readUInt32BE(20)!==675||
    JSON.stringify(card.content)!==JSON.stringify(expected)||card.altText!==altText(expected))throw Error('marketing_card_invalid');
  const repository=await store.api('');
  if(repository.full_name!==REPO||repository.private!==false)throw Error('marketing_card_public_repository_required');
  const identity={version:'note-result-card-asset-v1',publicationKey:row.publicationKey,
    evidenceId:row.evidenceId||row.settlement.evidenceId,sourceSha256:row.sourceSha256,imageSha256:card.sha256};
  const name='note-result-card/'+row.raceKey.slice(0,8)+'/'+digest(JSON.stringify(identity));
  const refPath='/git/ref/tags/'+name;
  let ref=await store.api(refPath,'GET',null,true),commitSha;
  if(ref) {
    commitSha=ref.object?.sha;
    if(!sha(commitSha))throw Error('marketing_card_ref_invalid');
    const saved=JSON.parse(await store.file('receipt.json',commitSha));
    if(JSON.stringify(saved)!==JSON.stringify(identity))throw Error('marketing_card_identity_mismatch');
  } else {
    const blob=await store.api('/git/blobs','POST',{content:card.png.toString('base64'),encoding:'base64'});
    if(!sha(blob.sha))throw Error('marketing_card_blob_invalid');
    const tree=await store.api('/git/trees','POST',{tree:[
      {path:'result-card.png',mode:'100644',type:'blob',sha:blob.sha},
      {path:'receipt.json',mode:'100644',type:'blob',content:JSON.stringify(identity)+'\n'}]});
    if(!sha(tree.sha))throw Error('marketing_card_tree_invalid');
    const commit=await store.api('/git/commits','POST',{message:'Store public verified result card',tree:tree.sha,parents:[store.revision]});
    if(!sha(commit.sha))throw Error('marketing_card_commit_invalid');
    ref=await store.api('/git/refs','POST',{ref:'refs/tags/'+name,sha:commit.sha});
    if(ref.object?.sha!==commit.sha)throw Error('marketing_card_save_unverified');
    commitSha=commit.sha;
  }
  const url=`https://raw.githubusercontent.com/${REPO}/${commitSha}/result-card.png`;
  // Buffer fetches anonymously. Authenticated GitHub reads alone do not prove
  // it can download this file. No create-post/claim happens before this check.
  const response=await request(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='image/png')throw Error('marketing_card_public_unavailable');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length!==card.png.length||digest(bytes)!==card.sha256)throw Error('marketing_card_public_mismatch');
  return {url,imageSha256:card.sha256,assetCommit:commitSha,width:card.width,height:card.height,
    mimeType:card.mimeType,assets:[{image:{url,metadata:{altText:card.altText}}}]};
}
module.exports={publishCard};
