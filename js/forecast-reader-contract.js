(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.ChappyForecastReaderContract=Object.freeze(api);
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const VERSION="forecast-reader-contract-v1";
  const MAIN="🎯 本命",ADDITIONAL="追加候補",HOLE="穴候補（配当未確認）",REFERENCE="参考予想（別集計）";
  const valid=t=>typeof t==="string"&&/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split("-")).size===3;
  const unique=values=>[...new Set(values)];
  function tickets(rows){
    if(!Array.isArray(rows))throw Error("reader_contract_source_missing");
    const values=rows.map(row=>typeof row==="string"?row:row?.ticket);
    if(!values.every(valid))throw Error("reader_contract_ticket_invalid");
    return unique(values);
  }
  function groupTickets({centralTickets,additionalTickets,holeTickets,referenceTickets=[]}){
    const central=tickets(centralTickets);
    if(!central.length||central.length>10||central.length!==centralTickets.length)throw Error("reader_contract_center_invalid");
    const additional=tickets(additionalTickets),hole=tickets(holeTickets),reference=tickets(referenceTickets);
    const seen=new Set(central),groups=[{label:MAIN,tickets:[...central]}];
    function add(label,values){
      const remaining=values.filter(t=>!seen.has(t));remaining.forEach(t=>seen.add(t));
      if(remaining.length)groups.push({label,tickets:remaining});
    }
    add(ADDITIONAL,additional);add(HOLE,hole);
    const primaryTickets=[...seen],primaryCount=seen.size;
    add(REFERENCE,reference);
    const expected=new Set([...central,...additional,...hole,...reference]);
    if(seen.size!==expected.size||[...seen].some(t=>!expected.has(t)))throw Error("reader_contract_union_changed");
    return {version:VERSION,groups,centralTickets:[...central],primaryTickets,primaryCount,
      allTickets:[...seen],allCount:seen.size,referenceOriginalCount:reference.length,
      referenceOverlapCount:reference.filter(t=>primaryTickets.includes(t)).length};
  }
  function verifiedHead(prediction){
    const rows=prediction?.mainSheet?.tickets;
    if(!Array.isArray(rows)||!rows.length)return null;
    let main;try{main=tickets(rows);}catch{return null;}
    const head=Number(prediction?.mainSheet?.honmei?.boatNo);
    if(!Number.isInteger(head)||head<1||head>6||main.some(t=>Number(t[0])!==head))return null;
    const scenario=prediction?.verificationEvidence?.mainScenario,raw=scenario?.headBoatNo;
    if(!(typeof raw==="number"||(typeof raw==="string"&&/^[1-6]$/.test(raw)))||Number(raw)!==head)return null;
    if(scenario.attackerBoatNo!==undefined&&Number(scenario.attackerBoatNo)!==head)return null;
    return head;
  }
  function explanation(prediction){
    const head=verifiedHead(prediction),s=prediction?.verificationEvidence?.mainScenario;
    const labels={escape:head+"号艇逃げ",sashi:"2コース差し",threeAttack:"3コース攻め",fourAttack:"4カド攻め"};
    const unknown={verified:false,text:"展開の根拠は確認中です。"};
    if(!head||!labels[s?.type]||s.label!==labels[s.type])return unknown;
    const boats=Array.isArray(prediction?.preRaceConditions?.boats)?prediction.preRaceConditions.boats:[];
    const matching=boats.filter(b=>Number(b.boatNo)===head),boat=matching.length===1?matching[0]:null;
    const expectedCourse={escape:1,sashi:2,threeAttack:3,fourAttack:4}[s.type];
    if(!boat||boat.courseOfficial!==true||Number(boat.course)!==expectedCourse||
        Number(s.attackerCourse)!==expectedCourse||Number(s.attackerBoatNo)!==head||
        boats.filter(b=>b.courseOfficial===true&&Number(b.course)===expectedCourse).length!==1)return unknown;
    const numeric=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
    const facts=[];
    if(numeric(boat?.avgST,0,1))facts.push("平均STは"+boat.avgST.toFixed(2));
    if(numeric(boat?.exhibitionST,0,1))facts.push("展示STは"+boat.exhibitionST.toFixed(2));
    if(numeric(boat?.exhibitionTime,5,9))facts.push("展示タイムは"+boat.exhibitionTime.toFixed(2)+"秒");
    const neighbors=boats.filter(b=>Number(b.course)===Number(boat?.course)+1&&Number(b.boatNo)!==head);
    const other=neighbors.length===1?neighbors[0]:null;
    const comparison=boat?.courseOfficial===true&&other?.courseOfficial===true&&numeric(other.exhibitionST,0,1)&&numeric(boat?.exhibitionST,0,1)
      ? "\n隣の"+other.boatNo+"号艇の展示STは"+other.exhibitionST.toFixed(2)+"。展示STと平均STは分けて確認します。":"";
    return {verified:true,text:"中心となる展開は"+s.label+"。"+(facts.length?"\n"+head+"号艇の"+facts.join("、")+"。":"")+comparison};
  }
  function referenceSummary(model){
    const original=model.referenceOriginalCount,overlap=model.referenceOverlapCount;
    if(!original)return "";
    if(!overlap)return "参考予想は"+original+"点で別集計です。上記と同じ券は再掲していません。";
    return "参考予想は元の台帳で"+original+"点（上記と重複"+overlap+"点、追加表示"+(original-overlap)+"点）。別集計です。";
  }
  // Read the complete snapshot before display-only clipping. Never select by odds/results.
  function fromPrediction(prediction, selection=prediction?.practicalSelection) {
    if(!prediction||typeof prediction!=="object")return null;
    const state=(status,reason)=>({version:VERSION,status,reason,groups:[],centralTickets:[],
      primaryTickets:[],allTickets:[],primaryCount:0,allCount:0,
      referenceOriginalCount:0,referenceOverlapCount:0,explanation:explanation(prediction)});
    if(selection?.purchaseDecision?.status==="skip")
      return state("skipped",String(selection.purchaseDecision.reason||"購入を見送ります。"));
    const central=Array.isArray(selection?.tickets)?selection.tickets:prediction.practicalTickets;
    if(!Array.isArray(central))return state("unavailable","買い目の選定を確認中です。");
    if(!central.length)return state("empty","選定された買い目はありません。");
    try {
      const main=tickets(prediction.mainSheet?.tickets),cover=tickets(prediction.mainSheet?.coverTickets),
        flow=tickets(prediction.mainSheet?.flowTickets),hole=tickets(prediction.manshuSheet?.tickets);
      const selected=tickets(central),pool=new Set([...main,...cover,...flow,...hole]);
      for(const row of central) {
        const ticket=typeof row==="string"?row:row.ticket;
        if(pool.has(ticket))continue;
        const allowed=r=>r&&r.category==="独立展開"&&r.candidateKind==="independent-scenario"&&
          (r.displayCategory===undefined||r.displayCategory==="独立展開")&&
          ["別頭の独立展開","残し艇を使う押さえ展開"].includes(r.scenarioClassificationReason);
        if(!allowed(row))throw Error("reader_contract_center_membership_missing");
        if(Array.isArray(prediction.practicalTickets)&&!prediction.practicalTickets.some(r=>r.ticket===ticket&&allowed(r)))
          throw Error("reader_contract_center_copy_mismatch");
      }
      if(Array.isArray(selection?.tickets)&&Array.isArray(prediction.practicalTickets)&&
          JSON.stringify(selected)!==JSON.stringify(tickets(prediction.practicalTickets)))
        throw Error("reader_contract_center_copy_mismatch");
      const ledger=prediction.manshuForecastLedger||prediction.manshuSheet?.forecastLedger||
        prediction.aiCore?.manshuForecastLedger;
      const references=ledger===undefined?[]:tickets(ledger.forecasts.flatMap(f=>f.formation.expandedTickets));
      const model=groupTickets({centralTickets:central,additionalTickets:[...main,...cover,...flow],
        holeTickets:hole,referenceTickets:references});
      return {...model,status:"selected",explanation:explanation(prediction)};
    } catch(error) {
      return {...state("unavailable","保存された買い目の整合性を確認中です。"),error:error.message};
    }
  }
  return {VERSION,MAIN,ADDITIONAL,HOLE,REFERENCE,valid,tickets,groupTickets,verifiedHead,explanation,referenceSummary,fromPrediction};
});
