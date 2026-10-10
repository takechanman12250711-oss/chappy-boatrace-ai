'use strict';
const {selectPartners}=require('./partner-calibration.cjs');
const VERSION='escape-second-course-ablation-v1';
function select(input,model) {
 const control=selectPartners(input,model);
 if(input.scenarioType!=='escape')return {...control,version:VERSION,applied:false};
 const adjusted={...model,weights:model.weights.map((w,i)=>i>=2&&i<8?0:w)};
 return {...selectPartners(input,adjusted),version:VERSION,applied:true};
}
module.exports={VERSION,select};
if(require.main===module)require('./compare-partner-course-ablation.cjs').compare(process.argv[2],process.argv[3],{VERSION,select,protocol:require('./partner-second-course-protocol.json')});
