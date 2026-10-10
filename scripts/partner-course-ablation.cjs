'use strict';
// Research ablation only. Keep upstream scenario/course effects and score weights.
const {selectPartners}=require('./partner-calibration.cjs');
const VERSION='escape-added-course-ablation-v1';
function select(input, model) {
  // Validate the unmodified model and input before deriving the ablation.
  const control=selectPartners(input,model);
  if(input.scenarioType!=='escape') return {...control,version:VERSION,applied:false};
  const adjusted={...model,weights:model.weights.map((w,i)=>i>=2&&i<14?0:w)};
  return {...selectPartners(input,adjusted),version:VERSION,applied:true};
}
module.exports={VERSION,select};
