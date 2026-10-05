'use strict';
const k = require('./note-korogashi-lifecycle.cjs');
const { draftClaimRef } = require('./note-github-ui-transport');
const BRANCH = 'note-korogashi-state';
function repository(store) {
  async function load() {
    const ref=await store.api(`/git/ref/heads/${BRANCH}`,'GET',null,true);
    if(!ref)return {state:k.initialState(),head:null};
    if(!/^[a-f0-9]{40}$/.test(ref.object?.sha||''))throw Error('korogashi_state_ref_invalid');
    return {state:k.validateState(JSON.parse(await store.file('state.json',ref.object.sha))),head:ref.object.sha};
  }
  async function save(before,next) {
    k.assertAppendOnly(before.state,next);
    if(k.json(before.state)===k.json(next))return before.head;
    const tree=await store.api('/git/trees','POST',{tree:[{path:'state.json',mode:'100644',type:'blob',content:k.json(next)+'\n'}]});
    const commit=await store.api('/git/commits','POST',{message:'Append note korogashi model course evidence',tree:tree.sha,parents:[before.head||store.revision]});
    const out=before.head?await store.api(`/git/refs/heads/${BRANCH}`,'PATCH',{sha:commit.sha,force:false}):
      await store.api('/git/refs','POST',{ref:`refs/heads/${BRANCH}`,sha:commit.sha});
    if(out.object?.sha!==commit.sha)throw Error('korogashi_state_save_unverified');
    return commit.sha;
  }
  const sources=new Map(),results=new Map();
  async function source(row) {
    if(!/^[a-f0-9]{64}$/.test(row.sourceSha256||''))throw Error('korogashi_source_hash_invalid');
    const key=`${row.raceKey}:${row.articleSeries}:${row.sourceSha256}`;
    if(!sources.has(key))sources.set(key,(async()=>{
      const tag=draftClaimRef(row).replace('refs/tags/note-draft-claim/','note-published/');
      const receipt=JSON.parse(await store.file('receipt.json',tag));
      if(receipt.sourceSha256!==row.sourceSha256)throw Error('korogashi_published_source_changed');
      const file=`data/note-drafts/${row.raceKey.slice(0,8)}/${row.raceKey}-${row.sourceSha256}.json`;
      return {receipt,bytes:await store.file(file,'main')};
    })());
    return sources.get(key);
  }
  function officialLoader(marketingState) {
    return async raceKey=>{
      const date=raceKey.slice(0,8);
      if(!results.has(date))results.set(date,(async()=>{
        const raw=await store.file(`data/results/${date}.json`,'main',true);
        if(!raw)return new Map();
        const data=JSON.parse(raw);
        if(data.source!=='boatrace-official'||data.date!==date||!Array.isArray(data.races))throw Error('korogashi_results_source_invalid');
        const rows=new Map();for(const r of data.races){const key=`${r.date}-${r.jcd}-${Number(r.raceNo)}`;
          if(rows.has(key))throw Error('korogashi_duplicate_result');rows.set(key,r);}
        return rows;
      })());
      const daily=(await results.get(date)).get(raceKey), cached=marketingState.officialResults?.[raceKey];
      const resolved=r=>r?.resultAvailable===true||r?.status==='void';
      const identity=r=>[r.status,r.trifecta?.combination,r.trifecta?.payout,r.void===true];
      if(resolved(daily)&&resolved(cached) && k.json(identity(daily))!==k.json(identity(cached)))throw Error('korogashi_official_result_conflict');
      return resolved(daily)?daily:cached||daily||null;
    };
  }
  return {load,save,source,officialLoader};
}
module.exports={BRANCH,repository};
