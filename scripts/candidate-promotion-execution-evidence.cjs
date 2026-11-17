'use strict';
// Only consume a selector-time observation. Never generate candidates, re-rank,
// revalidate roles, or reconstruct a missing legacy execution history.
const VERSION='candidate-promotion-execution-v1';
const flags={version:VERSION,purpose:'diagnostic-only',action:'KEEP_A',alternativeTickets:null,
  rankingProposed:false,resultUsedForGeneration:false,usableForPrediction:false,automaticApplication:false};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const tickets=a=>Array.isArray(a)&&a.length<=10&&a.every(t=>typeof t==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3);
const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>row?.[k]!==undefined).map(k=>[k,row[k]]));
function capturePromotionExecution({snapshot,validation,finalTickets,baselineTickets,diagnostic,expansionSummary,candidateDecisions}) {
  const unknown=reasonCode=>({...flags,status:'unknown',reasonCode});
  try {
    if(!snapshot||snapshot.version!==VERSION||snapshot.status!=='captured') return unknown('EXECUTION_SNAPSHOT_UNAVAILABLE');
    for(const [key,value] of Object.entries(flags)) if(!same(snapshot[key],value)) return unknown('EXECUTION_FLAGS_INVALID');
    if(!same(finalTickets,baselineTickets)||!tickets(finalTickets)) return unknown('FINAL_ORDER_MISMATCH');
    if(validation?.status!=='captured'||validation.resultUsedForGeneration!==false||
        validation.version!=='candidate-validation-evidence-v1'||!Array.isArray(validation.observations)||
        !same(snapshot.selectorFinalTickets,validation.finalSelectedTickets)) return unknown('GENERATOR_VALIDATION_UNAVAILABLE');
    const before=snapshot.before;
    if(snapshot.maximumCount!==10||!Number.isInteger(snapshot.candidateCount)||snapshot.candidateCount<0||!tickets(before?.selectedTickets)||!tickets(before?.usedTickets)||
        !same(before.selectedTickets,before.usedTickets)||before.remainingSlots!==10-before.selectedTickets.length||
        !Array.isArray(snapshot.queue)||!Array.isArray(snapshot.transitions)) return unknown('EXECUTION_BOUNDARY_INVALID');
    const selected=before.selectedTickets.slice();
    const candidateIndices=new Set();
    let validPath=true;
    const queue=snapshot.queue.map((row,index)=>{
      if(row.queueIndex!==index||!Number.isInteger(row.candidateIndex)||row.candidateIndex<0||row.candidateIndex>=snapshot.candidateCount||candidateIndices.has(row.candidateIndex)||
          !tickets([row.ticket])||typeof row.sourceCategory!=='string'||!Number.isFinite(row.priorityScore)||
          row.selectedCountBefore!==selected.length||row.remainingSlotsBefore!==10-selected.length) throw Error('EXECUTION_QUEUE_INVALID');
      candidateIndices.add(row.candidateIndex);
      const ref=row.validationRef;
      const obs=ref?.field==='candidateValidationEvidence.observations'&&Number.isInteger(ref.index)?validation.observations[ref.index]:null;
      if(!obs||obs.stage!=='selection'||obs.ticket!==row.ticket||obs.sourceCategory!==row.sourceCategory||obs.priorityScore!==row.priorityScore)
        throw Error('CONSUMED_VALIDATION_REFERENCE_INVALID');
      const bound=obs.valid===true&&obs.purchaseEligible===true&&obs.expansionEligible===false;
      if(!bound) validPath=false;
      if(row.disposition==='maximum-reached') {
        if(selected.length!==10||row.reasonCode!=='MAXIMUM_REACHED'||row.courseEvaluated!==false||
            ['headBoatNo','courseMappingFormal','mappedCourse','courseOfResult','effectiveCourse','courseSource'].some(k=>Object.hasOwn(row,k)))
          throw Error('EXECUTION_DISPOSITION_INVALID');
      } else {
        if(selected.length>=10||row.courseEvaluated!==true||row.headBoatNo!==Number(row.ticket[0])||
            typeof row.courseMappingFormal!=='boolean'||!Number.isInteger(row.effectiveCourse)||row.effectiveCourse<1||row.effectiveCourse>6||
            !Number.isInteger(row.courseOfResult)||row.courseOfResult<0||row.courseOfResult>6||
            row.effectiveCourse!==(row.courseOfResult||row.headBoatNo)||
            row.courseSource!==(row.courseMappingFormal&&row.courseOfResult?'saved-course-lookup':'boat-number-fallback'))
          throw Error('EXECUTION_COURSE_INVALID');
        if(row.disposition==='adopted') {
          if(row.reasonCode!=='CANDIDATE_ONLY_PROMOTED'||![1,3].includes(row.effectiveCourse)) throw Error('EXECUTION_DISPOSITION_INVALID');
          selected.push(row.ticket);
        } else if(row.disposition==='course-excluded') {
          if(![2,4,5,6].includes(row.effectiveCourse)||row.reasonCode!==(row.effectiveCourse===2?
              'SECOND_COURSE_HEAD_CANDIDATE_PROMOTION_PRUNED':'OUTER_HEAD_CANDIDATE_PROMOTION_PRUNED')) throw Error('EXECUTION_DISPOSITION_INVALID');
        } else throw Error('EXECUTION_DISPOSITION_INVALID');
      }
      return {...pick(row,['queueIndex','candidateIndex','ticket','sourceCategory','priorityScore','validationRef',
        'disposition','reasonCode','selectedCountBefore','remainingSlotsBefore','courseEvaluated','headBoatNo',
        'courseMappingFormal','mappedCourse','courseOfResult','effectiveCourse','courseSource']),
        bindingStatus:bound?'bound':'unknown',...(!bound?{bindingReasonCode:'NON_VALID_PURCHASE_PATH'}:{})};
    });
    if(!same(selected,snapshot.afterPromotionTickets)) return unknown('PROMOTION_ORDER_MISMATCH');
    const references={strongEscapeTrim:'expansionSummary.strongEscapeTrim',weakTwoHeadTrim:'candidateDecisions.WEAK_TWO_HEAD_INDEPENDENT',
      priorityGateReplacement:'expansionSummary.priorityGateReplacement',escapeRolePartnerReplacement:'expansionSummary.escapeRolePartnerReplacement'};
    let previous=selected, previousStage=-1;
    const transitions=snapshot.transitions.map(t=>{
      if(references[t.kind]!==t.reference||!same(t.beforeTickets,previous)||!tickets(t.afterTickets)||same(t.beforeTickets,t.afterTickets))
        throw Error('SELECTOR_TRANSFORMATION_INVALID');
      const stage=Object.keys(references).indexOf(t.kind);
      if(stage<=previousStage) throw Error('SELECTOR_TRANSFORMATION_INVALID');
      previousStage=stage;
      if(t.kind==='strongEscapeTrim') {
        const meta=expansionSummary?.strongEscapeTrim;
        if(meta?.applied!==true||!Array.isArray(meta.removedTickets)||!same(previous.filter(ticket=>!meta.removedTickets.includes(ticket)),t.afterTickets))
          throw Error('SELECTOR_TRANSFORMATION_REFERENCE_INVALID');
      } else if(t.kind==='weakTwoHeadTrim') {
        if(!Array.isArray(candidateDecisions)) throw Error('SELECTOR_TRANSFORMATION_REFERENCE_INVALID');
        const decisions=candidateDecisions.filter(row=>row.reasonCode==='WEAK_TWO_HEAD_INDEPENDENT');
        const removed=new Set(decisions.map(row=>row.ticket));
        if(!removed.size||decisions.some(row=>row.selected!==false)||[...removed].some(ticket=>!previous.includes(ticket))||
            !same(previous.filter(ticket=>!removed.has(ticket)),t.afterTickets))
          throw Error('SELECTOR_TRANSFORMATION_REFERENCE_INVALID');
      } else if(t.kind==='priorityGateReplacement'||t.kind==='escapeRolePartnerReplacement') {
        const meta=expansionSummary?.[t.kind];
        if(meta?.applied!==true||!Number.isInteger(meta.selectedIndex)||previous[meta.selectedIndex]!==meta.removedTicket)
          throw Error('SELECTOR_TRANSFORMATION_REFERENCE_INVALID');
        const after=previous.slice();after[meta.selectedIndex]=meta.addedTicket;
        if(!same(after,t.afterTickets)) throw Error('SELECTOR_TRANSFORMATION_REFERENCE_INVALID');
      }
      previous=t.afterTickets;
      return pick(t,['kind','reference','beforeTickets','afterTickets']);
    });
    if(!same(previous,snapshot.selectorFinalTickets)) return unknown('SELECTOR_FINAL_ORDER_MISMATCH');
    const postSelectorTransformations=[];
    if(!same(previous,finalTickets)) {
      if(diagnostic?.version!=='candidate-validation-mismatch-diagnostic-v1'||diagnostic.purpose!=='diagnostic-only'||
          diagnostic.resultUsedForGeneration!==false||diagnostic.usableForPrediction!==false||
          !same(diagnostic.originalGeneratorSnapshot,validation)||!same(diagnostic.observedFinalTickets,finalTickets)||
          diagnostic.transformations?.length!==1) return unknown('POST_SELECTOR_TRANSFORMATION_UNAVAILABLE');
      const transformation=diagnostic.transformations[0];
      postSelectorTransformations.push({kind:transformation.kind,reference:'candidateValidationEvidence.diagnostic.transformations',index:0,
        beforeTickets:previous.slice(),afterTickets:finalTickets.slice()});
    } else if(diagnostic) return unknown('UNEXPECTED_POST_SELECTOR_DIAGNOSTIC');
    return JSON.parse(JSON.stringify({...flags,status:validPath?'captured':'unknown',...(!validPath?{reasonCode:'NON_VALID_PURCHASE_PATH'}:{}),
      maximumCount:10,candidateCount:snapshot.candidateCount,before:pick(before,['selectedTickets','usedTickets','remainingSlots']),queue,
      afterPromotionTickets:snapshot.afterPromotionTickets,selectorFinalTickets:snapshot.selectorFinalTickets,
      transitions,postSelectorTransformations,observedFinalTickets:finalTickets}));
  } catch(error) { return unknown(/^[A-Z_]+$/.test(error.message)?error.message:'EXECUTION_CAPTURE_UNAVAILABLE'); }
}
module.exports={capturePromotionExecution};
