'use strict';
// Research-only B1: replay saved A, then change only the promotion queue order.
// No I/O, live selector, role qualification, candidate generation, or outcome read.
const {capturePromotionExecution}=require('./candidate-promotion-execution-evidence.cjs');
const {resolveQueueRolePriorities}=require('./promotion-role-priority-diagnostic.cjs');
const VERSION='promotion-head-priority-comparison-v1';
const REQUIRED_METHOD='50b3ddcc4406fd549d0bd6016b41a8afa7c7714265a93e2845f2ccdfea7d0e11';
const REQUIRED_EXECUTION_CODE_SHA256='12c4a1b75ab69be37a063c6893898c711308d9c83ae3c27cd3d6e74c568bc11c';
const ticket=t=>typeof t==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3;
const list=a=>Array.isArray(a)&&a.length<=10&&a.every(ticket)&&new Set(a).size===a.length;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const integerBoat=n=>Number.isInteger(n)&&n>=1&&n<=6;
const clock=t=>typeof t==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(t)&&Number.isFinite(Date.parse(t));
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,x[k]]));
function compareHeadPriority(input) {
  let A=null;
  const base={version:VERSION,variant:'B1-first-position-saved-priority',purpose:'shadow-comparison',
    productionAction:'KEEP_A',productionChanged:false,automaticAdoption:false,automaticApplication:false,
    usableForPrediction:false,resultUsedForGeneration:false,sourceReferenceVerified:false,includedInDenominator:true,
    status:'unknown',reasons:[],A:null,B:null,changed:false,roleRefs:[],bCourseTrace:[]};
  const keep=(status,reason)=>({...base,status,reasons:[reason],A:A?.slice()??null,B:A?.slice()??null});
  try {
    const {identity,sourceRef,execution,validation,officialCourses,baselineA}=input||{};
    if(!list(baselineA)||baselineA.length===0) return keep('ineligible','BASELINE_A_INVALID');
    A=baselineA.slice();
    if(!identity||identity.method!==REQUIRED_METHOD||!/^\d{8}-(?:0[1-9]|1\d|2[0-4])-(?:[1-9]|1[0-2])$/.test(identity.raceKey||'')||
        !clock(identity.selectedAt)||!clock(identity.deadlineAt)||Date.parse(identity.selectedAt)>=Date.parse(identity.deadlineAt)||
        identity.predictionMode!=='server_pre_deadline'||identity.officialResultUsedForPrediction!==false) return keep('unknown','IDENTITY_UNAVAILABLE');
    if(!sourceRef||typeof sourceRef.path!=='string'||!sourceRef.path||sourceRef.path.includes('\\')||
        sourceRef.path.startsWith('/')||sourceRef.path.split('/').some(p=>!p||p==='.'||p==='..')||
        !/^[a-f0-9]{64}$/.test(sourceRef.sha256||'')) return keep('unknown','SOURCE_REFERENCE_UNAVAILABLE');
    base.identity=pick(identity,['raceKey','selectedAt','deadlineAt','method','predictionMode','officialResultUsedForPrediction']);
    base.sourceRef={path:sourceRef.path,sha256:sourceRef.sha256};
    if(!execution||execution.executionCodeSha256!==REQUIRED_EXECUTION_CODE_SHA256) return keep('unknown','EXECUTION_CODE_UNAVAILABLE');
    if(!Array.isArray(execution.transitions)||!Array.isArray(execution.postSelectorTransformations)) return keep('unknown','TRANSFORMATIONS_UNAVAILABLE');
    if(execution.transitions.length||execution.postSelectorTransformations.length) return keep('not-applicable','POST_PROMOTION_TRANSFORMATION');
    if(!same(execution.afterPromotionTickets,A)||!same(execution.selectorFinalTickets,A)||!same(execution.observedFinalTickets,A))
      return keep('unknown','FINAL_A_ORDER_MISMATCH');
    // Existing pure snapshot verifier replays exactly the saved dispositions,
    // including the maximum-slot check before any course check.
    const replay=capturePromotionExecution({snapshot:execution,validation,finalTickets:A,baselineTickets:A});
    if(replay.status!=='captured') return keep('unknown','A_REPLAY_'+(replay.reasonCode||'UNAVAILABLE'));
    if(!list(execution.before.selectedTickets)||!list(execution.before.usedTickets)) return keep('unknown','BEFORE_SELECTION_INVALID');
    const used=new Set(execution.before.usedTickets),queueTickets=new Set();
    for(const row of execution.queue) {
      if(queueTickets.has(row.ticket)||used.has(row.ticket)) return keep('unknown','DUPLICATE_OR_USED_QUEUE_TICKET');
      queueTickets.add(row.ticket);
      if(typeof row.priorityScore!=='number'||!Number.isFinite(row.priorityScore)||row.priorityScore<90)
        return keep('unknown','ORIGINAL_MAX_PRIORITY_GATE_MISMATCH');
    }
    if(!Array.isArray(officialCourses)||officialCourses.length!==6) return keep('unknown','OFFICIAL_COURSES_UNAVAILABLE');
    const courses=new Map(),seenCourses=new Set();
    for(const boat of officialCourses) {
      if(!integerBoat(boat?.boatNo)||!integerBoat(boat.course)||boat.courseOfficial!==true||courses.has(boat.boatNo)||seenCourses.has(boat.course))
        return keep('unknown','OFFICIAL_COURSES_UNAVAILABLE');
      courses.set(boat.boatNo,boat.course);seenCourses.add(boat.course);
    }
    const roleRefs=[];
    for(const row of execution.queue) {
      const role=resolveQueueRolePriorities(row,validation);
      if(role.status!=='bound') return keep('unknown','ROLE_REFERENCE_'+role.reason);
      if(role.recordedPriorityMatchesPositionMaximum!==true) return keep('unknown','RECORDED_PRIORITY_MAXIMUM_MISMATCH');
      const course=courses.get(Number(row.ticket[0]));
      if(row.courseEvaluated===true&&(row.courseMappingFormal!==true||row.courseSource!=='saved-course-lookup'||
          row.mappedCourse!==course||row.courseOfResult!==course||row.effectiveCourse!==course))
        return keep('unknown','A_OFFICIAL_COURSE_MISMATCH');
      roleRefs.push({queueIndex:row.queueIndex,candidateIndex:row.candidateIndex,ticket:row.ticket,
        sourceCategory:row.sourceCategory,observationRef:role.observationRef,recordedPriority:role.recordedPriority,
        positions:role.positions,scenarioId:role.scenarioId,branchSource:role.branchSource,branchKind:role.branchKind});
    }
    const reordered=execution.queue.map((row,index)=>({row,role:roleRefs[index]}))
      .sort((a,b)=>b.role.positions.first.priority-a.role.positions.first.priority||a.row.queueIndex-b.row.queueIndex);
    const B=execution.before.selectedTickets.slice(),bUsed=new Set(execution.before.usedTickets),bCourseTrace=[];
    for(const [bQueueIndex,{row,role}] of reordered.entries()) {
      const remainingSlots=10-B.length;
      if(!remainingSlots) {
        bCourseTrace.push({bQueueIndex,queueIndex:row.queueIndex,ticket:row.ticket,remainingSlotsBefore:0,
          disposition:'maximum-reached',courseEvaluated:false});
        continue;
      }
      const headBoatNo=Number(row.ticket[0]),course=courses.get(headBoatNo),allowed=course===1||course===3;
      bCourseTrace.push({bQueueIndex,queueIndex:row.queueIndex,ticket:row.ticket,remainingSlotsBefore:remainingSlots,
        disposition:allowed?'adopted':'course-excluded',courseEvaluated:true,headBoatNo,officialCourse:course,
        courseSource:'saved-official-course',headPriority:role.positions.first.priority,originalMaxPriority:row.priorityScore});
      if(allowed&&!bUsed.has(row.ticket)) {B.push(row.ticket);bUsed.add(row.ticket);}
    }
    if(B.length!==A.length||!list(B)) return keep('unknown','SHADOW_POINT_COUNT_MISMATCH');
    const changed=!same(A,B);
    return {...base,status:execution.queue.length&&execution.before.remainingSlots>0?'compared':'not-applicable',
      reasons:execution.queue.length?(execution.before.remainingSlots>0?[]:['NO_OPEN_PROMOTION_SLOTS']):['EMPTY_PROMOTION_QUEUE'],
      A:A.slice(),B,changed,roleRefs,bCourseTrace};
  } catch (_) { return keep('unknown','COMPARISON_INPUT_UNAVAILABLE'); }
}
module.exports={VERSION,REQUIRED_METHOD,REQUIRED_EXECUTION_CODE_SHA256,compareHeadPriority};
