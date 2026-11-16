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
  return {VERSION,MAIN,ADDITIONAL,HOLE,REFERENCE,valid,tickets,groupTickets,verifiedHead,explanation};
});
