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
  function exhibitionStText(boat){
    if(!boat||typeof boat!=="object")return null;
    const markers=[boat.exhibitionStartMarker,boat.startExhibition?.marker].filter(v=>v!==undefined);
    if(!markers.length||markers.some(v=>typeof v!=="string"||!["","F","L"].includes(v.trim().toUpperCase())))return null;
    const flags=[...new Set(markers.map(v=>v.trim().toUpperCase()))];
    if(flags.length!==1)return null;
    const flag=flags[0],values=[boat.exhibitionST,boat.startExhibition?.st].filter(v=>v!==undefined&&v!==null);
    if(values.some(v=>typeof v!=="number"||!Number.isFinite(v)||v<(flag==="F"?-1:0)||v>1))return null;
    const magnitude=values.map(v=>flag==="F"?Math.abs(v):v);
    if(magnitude.length>1&&magnitude.some(v=>v!==magnitude[0]))return null;
    if(!magnitude.length)return flag?flag+"（数値未取得）":null;
    return flag+magnitude[0].toFixed(2);
  }
  // A display-only view of facts already present in the current input.
  // The caller supplies the existing capture projector; no import, selection,
  // timing claim, official flag, course or scenario is invented here.
  function explanationView(prediction,captureConditions){
    if(!prediction||typeof prediction!=="object"||prediction.readerExplanationUnavailable===true)return prediction;
    const own=(value,key)=>value&&Object.hasOwn(value,key);
    const boat=v=>(typeof v==="number"&&Number.isInteger(v)||typeof v==="string"&&/^[1-6]$/.test(v))&&Number(v)>=1&&Number(v)<=6;
    const identity=row=>row?.boatNo??row?.boat;
    const validIdentity=row=>boat(identity(row))&&!(boat(row?.boatNo)&&boat(row?.boat)&&Number(row.boatNo)!==Number(row.boat));
    const numericScalar=value=>typeof value==="number"?Number.isFinite(value):
      typeof value==="string"&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())&&Number.isFinite(Number(value));
    const validStart=s=>validIdentity(s)&&boat(s.course)&&s.isOfficialCourse===true&&
      typeof s.marker==="string"&&["","F","L"].includes(s.marker.trim().toUpperCase())&&numericScalar(s.st)&&
      Number(s.st)>=(s.marker.trim().toUpperCase()==="F"?-1:0)&&Number(s.st)<=1;
    const numericKeys=["avgST","avgSt","averageST","averageSt","st","exhibitionST","exhibitionSt","exhibitionTime","displayST","displayTime"];
    const validFacts=row=>!row||numericKeys.every(k=>!own(row,k)||row[k]===undefined||row[k]===null||row[k]===""||numericScalar(row[k]));
    const fact=(row,keys)=>{const v=keys.map(k=>row?.[k]).find(v=>v!==undefined&&v!==null&&v!=="");return v===undefined?null:numericScalar(v)?Number(v):NaN;};
    const fixed=["boatNo","course","courseOfficial","courseMappingSource","avgST","exhibitionST","exhibitionStartMarker","exhibitionTime"];
    const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>own(value,k)).map(k=>[k,value[k]]));
    let view=prediction;
    const neutral=()=>({...view,readerExplanationUnavailable:true});
    const race=prediction.race;
    // normalizeRaceData retains the original API object. Use that same input
    // schema as Node capture (normalized boat statistics use another shape).
    const raw=own(race,"raw")?race.raw:race;
    const hasRaw=Array.isArray(race?.entries)||Array.isArray(raw?.entries)||Array.isArray(raw?.startExhibition);
    if(hasRaw){
      // capture's compatibility fallback may use the frame number. It must
      // never become an official entry fact without the original full mapping.
      const starts=raw?.startExhibition;
      if(!Array.isArray(raw?.entries)||raw.entries.length!==6||!raw.entries.every(validIdentity)||
        new Set(raw.entries.map(e=>Number(identity(e)))).size!==6)return neutral();
      // Validate original scalar facts even when this is already a raw-schema
      // input. Legacy capture turns whitespace and booleans into zero.
      if(!raw.entries.every(e=>validFacts(e)&&validFacts(e.exhibition))||
        Array.isArray(raw.beforeInfo)&&!raw.beforeInfo.every(e=>validFacts(e)&&validFacts(e.exhibition)))return neutral();
      if(raw!==race){
        if(!race||["date","stadiumCode","raceNo"].some(k=>!own(race,k)||!own(raw,k)||String(race[k])!==String(raw[k])))return neutral();
        if(!Array.isArray(race.entries)||race.entries.length!==6||new Set(race.entries.map(e=>Number(identity(e)))).size!==6)return neutral();
        for(const e of race.entries){
          const original=raw.entries.find(o=>Number(identity(o))===Number(identity(e)));
          if(!validIdentity(e)||!original||!validFacts(e)||!validFacts(e.exhibition))return neutral();
          for(const keys of [["avgST","avgSt","averageST","st"],["exhibitionTime","displayTime"],["exhibitionST","exhibitionSt"]]){
            const a=fact(e,keys),b=fact(original,keys);
            if(a!==null&&!Number.isFinite(a)||b!==null&&!Number.isFinite(b)||a!==null&&b!==null&&a!==b)return neutral();
          }
        }
        const normalized=race.startExhibition;
        if(!Array.isArray(normalized)||normalized.length!==6||new Set(normalized.map(s=>Number(identity(s)))).size!==6||
          !normalized.every(s=>{
            const original=Array.isArray(starts)?starts.find(t=>Number(identity(t))===Number(identity(s))):null;
            return validStart(s)&&validStart(original)&&Number(original.course)===Number(s.course)&&original.isOfficialCourse===s.isOfficialCourse&&
              original.marker===s.marker&&Number(original.st)===Number(s.st);
          }))return neutral();
      }
      if(!Array.isArray(starts)||starts.length!==6||
        !starts.every(validStart)||
        new Set(starts.map(s=>Number(identity(s)))).size!==6||new Set(starts.map(s=>Number(s.course))).size!==6)return neutral();
      if(typeof captureConditions!=="function")return neutral();
      let captured;
      try{captured=captureConditions(raw,prediction);}catch(_){return neutral();}
      if(!Array.isArray(captured?.boats)||captured.boats.length!==6)return neutral();
      const boats=captured.boats.map(value=>({
        ...pick(value,fixed),
        ...(value.startExhibition?{startExhibition:pick(value.startExhibition,["st","marker"])}:{})
      }));
      if(new Set(boats.map(b=>b.boatNo)).size!==6||!boats.every(b=>{
        const start=starts.find(s=>Number(identity(s))===Number(b.boatNo));
        return boat(b.boatNo)&&start&&Number(start.course)===Number(b.course)&&b.courseOfficial===true;
      }))return neutral();
      if(!own(prediction,"preRaceConditions")){
        // Copy only explanation facts. In particular, capture's pre_deadline
        // label and result/timing evidence do not describe historical review.
        view={...view,preRaceConditions:{boats}};
      }else{
        const existing=prediction.preRaceConditions?.boats;
        if(!Array.isArray(existing))return neutral();
        for(const old of existing){
          const matches=boats.filter(b=>Number(b.boatNo)===Number(old?.boatNo));
          if(matches.length!==1)return neutral();
          const fresh=matches[0];
          // Existing values (including null/unknown) are never repaired.
          if(fixed.filter(k=>k!=="courseMappingSource").some(k=>own(old,k)&&old[k]!==fresh[k]))return neutral();
          if(old.startExhibition&&["st","marker"].some(k=>own(old.startExhibition,k)&&old.startExhibition[k]!==fresh.startExhibition?.[k]))return neutral();
        }
      }
    }
    const scenario=view.verificationEvidence?.mainScenario,core=view.aiCore?.raceScenarios?.mainScenario;
    if(scenario&&core){
      const keys=["type","label","headBoatNo","attackerBoatNo"];
      const same=(key,a,b)=>["headBoatNo","attackerBoatNo"].includes(key)?boat(a)&&boat(b)&&Number(a)===Number(b):a===b;
      if(keys.some(k=>own(scenario,k)&&own(core,k)&&!same(k,scenario[k],core[k])))return neutral();
      if(own(scenario,"attackerCourse")){
        if(own(core,"attackerCourse")&&scenario.attackerCourse!==core.attackerCourse)return neutral();
      }else if(keys.every(k=>own(scenario,k)&&own(core,k)&&same(k,scenario[k],core[k]))&&
        typeof core.attackerCourse==="number"&&boat(core.attackerCourse)){
        view={...view,verificationEvidence:{...view.verificationEvidence,
          mainScenario:{...scenario,attackerCourse:core.attackerCourse}}};
      }
    }
    return view;
  }

  function explanation(prediction){
    if(prediction?.readerExplanationUnavailable===true)return {verified:false,text:"展開の根拠は確認中です。"};
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
    const mainStart=exhibitionStText(boat);
    if(mainStart)facts.push("展示STは"+mainStart);
    if(numeric(boat?.exhibitionTime,5,9))facts.push("展示タイムは"+boat.exhibitionTime.toFixed(2)+"秒");
    const neighbors=boats.filter(b=>Number(b.course)===Number(boat?.course)+1&&Number(b.boatNo)!==head);
    const other=neighbors.length===1?neighbors[0]:null;
    const otherStart=exhibitionStText(other);
    const comparison=boat?.courseOfficial===true&&other?.courseOfficial===true&&mainStart&&otherStart
      ? "\n隣の"+other.boatNo+"号艇の展示STは"+otherStart+"。展示STと平均STは分けて確認します。":"";
    return {verified:true,text:"中心となる展開は"+s.label+"。"+(facts.length?"\n"+head+"号艇の"+facts.join("、")+"。":"")+comparison};
  }
  function referenceSummary(model){
    const original=model.referenceOriginalCount,overlap=model.referenceOverlapCount;
    if(!original)return "";
    if(!overlap)return "参考予想は"+original+"点で別集計です。上記と同じ券は再掲していません。";
    return "参考予想は元の台帳で"+original+"点（上記と重複"+overlap+"点、追加表示"+(original-overlap)+"点）。別集計です。";
  }
  // These two already-adopted post-selector replacements are display provenance,
  // not a new selection rule or final qualification of the replacement ticket.
  const RESCUES=[
    ["threeCourseEscapeRescueFixed5","20260823-three-course-134-v1","3コース攻め","1-3-4"],
    ["fourKadoEscapeRescueFixed5","20260823-four-kado-124-v1","4カド攻め","1-2-4"]
  ];
  const RESCUE_KEYS=["applied","version","targetLabel","ticket","replacedTicket","index"];
  const EMPTY_RESCUE_FIELDS=["branchIds","requirementIds","validBranchIds","validPurchaseBranchIds",
    "validIndependentBranchIds","validScenarioIds","validRequirementIds","coverage","coveredEvaluationIds","coveredBoatNos"];
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const rescueCheck=(ok,detail)=>{if(!ok)throw Error("reader_saved_rescue_"+detail);};
  const projectMeta=meta=>RESCUE_KEYS.map(key=>meta?.[key]);
  const rowClaims=row=>row&&typeof row==="object"&&
    (RESCUES.some(([key])=>Object.hasOwn(row,key))||row.category==="検証済み救済"||row.selectionTier==="検証済み1点置換");
  function savedRescueProof({prediction,selection,finalRows,record,evidence,copies=[]}){
    const summary=selection?.expansionSummary,wrapped=evidence?.candidateValidationEvidence;
    const claimed=finalRows.some(rowClaims)||RESCUES.some(([key])=>summary&&Object.hasOwn(summary,key))||
      wrapped?.diagnostic?.transformations?.some(t=>RESCUES.some(([key])=>t?.kind===key));
    if(!claimed)return null;
    const final=tickets(finalRows);
    const validList=(rows,max)=>Array.isArray(rows)&&rows.length>0&&rows.length<=max&&
      rows.every(valid)&&new Set(rows).size===rows.length;
    rescueCheck(validList(final,10)&&final.length===finalRows.length,"final_invalid");
    function pathProof(validation,meta,kind){
      const spec=RESCUES.find(([key])=>key===kind);
      rescueCheck(spec,"kind_unknown");
      const [key,version,label,ticket]=spec;
      rescueCheck(meta?.applied===true&&meta.version===version&&meta.targetLabel===label&&meta.ticket===ticket,"metadata_invalid");
      const reason=label+"時の検証済みイン逃げ救済として、点数を増やさず"+meta.replacedTicket+"を"+ticket+"へ1点置換。";
      rescueCheck(meta.reason===reason,"reason_invalid");
      rescueCheck(validation?.version==="candidate-validation-evidence-v1","snapshot_version");
      let generator=validation;
      if(validation.status==="invalid-or-unavailable"){
        const d=validation.diagnostic;
        rescueCheck(d?.version==="candidate-validation-mismatch-diagnostic-v1"&&d.purpose==="diagnostic-only"&&
          d.resultUsedForGeneration===false&&d.usableForPrediction===false&&d.mismatchReason==="final-ticket-set-mismatch"&&
          Array.isArray(d.transformations)&&d.transformations.length===1&&d.transformations[0]?.kind===key&&
          equal(projectMeta(d.transformations[0]),projectMeta(meta))&&d.transformations[0].reason===reason&&
          equal(d.observedFinalTickets,final),"diagnostic_invalid");
        generator=d.originalGeneratorSnapshot;
      }else rescueCheck(validation.status==="captured","snapshot_status");
      rescueCheck(generator?.version==="candidate-validation-evidence-v1"&&generator.status==="captured"&&
        generator.resultUsedForGeneration===false&&!Object.hasOwn(generator,"diagnostic")&&
        validList(generator.finalSelectedTickets,10)&&validList(generator.poolTickets,120)&&
        Array.isArray(generator.branches)&&Array.isArray(generator.observations)&&
        generator.finalSelectedTickets.every(t=>generator.poolTickets.includes(t))&&
        generator.observations.every(o=>o&&generator.poolTickets.includes(o.ticket)&&["selection","pool-audit"].includes(o.stage))&&
        generator.poolTickets.every(t=>generator.observations.some(o=>o.ticket===t)),"snapshot_invalid");
      const before=generator.finalSelectedTickets;
      rescueCheck(before.length===final.length&&Number.isInteger(meta.index)&&meta.index===before.length-1&&
        valid(meta.replacedTicket)&&before[meta.index]===meta.replacedTicket&&!before.includes(ticket)&&
        !final.includes(meta.replacedTicket),"replacement_invalid");
      const after=before.slice();after[meta.index]=ticket;
      rescueCheck(equal(after,final),"replacement_order");
      const labels=[prediction?.verificationEvidence?.mainScenario?.label,selection?.verificationEvidence?.mainScenario?.label].filter(v=>v!==undefined);
      rescueCheck(labels.length>0&&labels.every(v=>v===label),"scenario_mismatch");
      return {purpose:"saved-replacement-display-provenance",kind:key,
        meta:Object.fromEntries([...RESCUE_KEYS,"reason"].map(k=>[k,meta[k]])),reason,before:[...before],after:[...after]};
    }
    const proofs=[];
    if(RESCUES.some(([key])=>summary&&Object.hasOwn(summary,key))){
      const active=RESCUES.filter(([key])=>summary&&Object.hasOwn(summary,key));
      rescueCheck(active.length===1&&selection.status==="selected","summary_invalid");
      const key=active[0][0],proof=pathProof(selection.candidateValidationEvidence,summary[key],key);
      rescueCheck(selection.reason===proof.reason,"selection_reason");proofs.push(proof);
    }
    if(evidence!==undefined){
      const review=record?.reviewEvidence,savedReview=evidence?.reviewEvidence;
      rescueCheck(review?.version==="race-review-evidence-v1"&&/^[a-f0-9]{64}$/.test(review.method||"")&&
        review.predictionMode==="server_pre_deadline"&&review.officialResultUsedForPrediction===false&&
        ["version","method","predictionMode","officialResultUsedForPrediction"].every(key=>savedReview?.[key]===review[key]),"record_method");
      rescueCheck(record&&record.prediction===prediction&&evidence?.version==="practical-selection-evidence-v1"&&evidence.status==="captured"&&
        evidence.selectionStatus==="selected"&&evidence.productionChanged===false&&evidence.resultUsedForGeneration===false&&
        /^\d{8}-(?:0[1-9]|1\d|2[0-4])-(?:[1-9]|1[0-2])$/.test(record.raceKey||"")&&
        ["raceKey","selectedAt","deadlineAt"].every(key=>typeof record[key]==="string"&&evidence[key]===record[key])&&
        Number.isFinite(Date.parse(record.selectedAt))&&Date.parse(record.selectedAt)<Date.parse(record.deadlineAt)&&
        equal(evidence.practicalTickets,final),"record_identity");
      const transformations=wrapped?.diagnostic?.transformations;
      rescueCheck(Array.isArray(transformations)&&transformations.length===1,"record_transformations");
      const meta=transformations[0],proof=pathProof(wrapped,meta,meta.kind);
      rescueCheck(evidence.selectionReason===proof.reason,"record_reason");proofs.push(proof);
    }
    rescueCheck(proofs.length>0,"proof_missing");
    const proof=proofs[0];
    rescueCheck(proofs.every(p=>p.kind===proof.kind&&equal(projectMeta(p.meta),projectMeta(proof.meta))&&equal(p.before,proof.before)),"proof_conflict");
    for(const rows of [finalRows,...(Array.isArray(prediction?.practicalTickets)?[prediction.practicalTickets]:[]),...copies]){
      rescueCheck(Array.isArray(rows)&&equal(rows.map(row=>typeof row==="string"?row:row?.ticket),final),"copy_order");
      const row=rows[proof.meta.index];
      rescueCheck(row&&typeof row==="object"&&row.ticket===proof.meta.ticket&&
        row.category==="検証済み救済"&&row.displayCategory==="検証済み救済"&&row.selectionTier==="検証済み1点置換"&&
        row.comment===proof.reason&&row.scenarioSummary===proof.reason&&row.scenarioTitle===proof.meta.targetLabel+"のイン逃げ救済"&&
        row.evidenceQualified===true&&row.purchaseEligible===true&&row.expansionEligible===false&&row.priorityScore===0&&
        EMPTY_RESCUE_FIELDS.every(key=>Array.isArray(row[key])&&row[key].length===0)&&
        equal(projectMeta(row[proof.kind]),projectMeta(proof.meta))&&
        RESCUES.filter(([key])=>Object.hasOwn(row,key)).length===1&&
        rows.every((r,i)=>i===proof.meta.index||!rowClaims(r)),"row_metadata");
    }
    return proof;
  }

  // Read the complete snapshot before display-only clipping. Never select by odds/results.
  function fromPrediction(prediction, selection=prediction?.practicalSelection, options={}) {
    if(!prediction||typeof prediction!=="object")return null;
    const state=(status,reason)=>({version:VERSION,status,reason,groups:[],centralTickets:[],
      primaryTickets:[],allTickets:[],primaryCount:0,allCount:0,
      referenceOriginalCount:0,referenceOverlapCount:0,explanation:explanation(prediction)});
    if(selection?.purchaseDecision?.status==="skip")
      return state("skipped",String(selection.purchaseDecision.reason||"購入を見送ります。"));
    if(selection?.purchaseDecision&&selection.purchaseDecision.status!=="unchanged")
      return state("unavailable","購入方針の確認中です。");
    if(selection?.status==="skipped")return state("skipped",String(selection.reason||"購入を見送ります。"));
    const central=Array.isArray(selection?.tickets)?selection.tickets:prediction.practicalTickets;
    if(!Array.isArray(central))return state("unavailable","買い目の選定を確認中です。");
    if(!central.length)return state("empty","選定された買い目はありません。");
    try {
      const main=tickets(prediction.mainSheet?.tickets),cover=tickets(prediction.mainSheet?.coverTickets),
        flow=tickets(prediction.mainSheet?.flowTickets),hole=tickets(prediction.manshuSheet?.tickets);
      const selected=tickets(central),pool=new Set([...main,...cover,...flow,...hole]);
      // Pool membership already proves historical in-pool tickets. Require
      // extra replacement provenance only to bridge a saved off-pool rescue.
      const offPoolRescue=central.some(row=>{
        const ticket=typeof row==="string"?row:row?.ticket;
        return !pool.has(ticket)&&(rowClaims(row)||RESCUES.some(([key])=>selection?.expansionSummary?.[key]?.ticket===ticket)||
          options.practicalSelectionEvidence?.candidateValidationEvidence?.diagnostic?.transformations?.some(t=>t?.ticket===ticket));
      });
      const rescue=offPoolRescue?savedRescueProof({prediction,selection,finalRows:central,record:options.record,
        evidence:options.practicalSelectionEvidence,copies:options.copies||[]}):null;
      for(const row of central) {
        const ticket=typeof row==="string"?row:row.ticket;
        if(pool.has(ticket)||(rescue&&ticket===rescue.meta.ticket))continue;
        const allowed=r=>r&&r.category==="独立展開"&&r.candidateKind==="independent-scenario"&&
          (r.displayCategory===undefined||r.displayCategory==="独立展開")&&
          ["別頭の独立展開","残し艇を使う押さえ展開"].includes(r.scenarioClassificationReason);
        if(!allowed(row))throw Error("reader_contract_center_membership_missing");
        if(Array.isArray(prediction.practicalTickets)&&!prediction.practicalTickets.some(r=>r.ticket===ticket&&allowed(r)&&r.scenarioClassificationReason===row.scenarioClassificationReason))
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
  return {VERSION,MAIN,ADDITIONAL,HOLE,REFERENCE,valid,tickets,groupTickets,verifiedHead,exhibitionStText,explanationView,explanation,referenceSummary,savedRescueProof,fromPrediction};
});
