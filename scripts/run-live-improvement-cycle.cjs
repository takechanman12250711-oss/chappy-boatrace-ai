'use strict';
const fs=require('node:fs');
const path=require('node:path');
const phase8=require('./theory-validation-phase8-cycle.cjs');
const phase9=require('./phase9-live-improvement-cycle.cjs');
const ROOT=path.resolve(__dirname,'..');
const PHASE8_OUT=path.join(ROOT,'data','stats','theory-validation-phase8-cycle.json');
const PHASE9_OUT=path.join(ROOT,'data','stats','phase9-live-improvement-cycle.json');
function comparable(value){return value&&typeof value==='object'?{...value,generatedAt:''}:value;}
function writeStable(filePath,report){
 let previous=null;
 if(fs.existsSync(filePath)){try{previous=JSON.parse(fs.readFileSync(filePath,'utf8'));}catch{previous=null;}}
 if(previous&&JSON.stringify(comparable(previous))===JSON.stringify(comparable(report)))return{changed:false,report:previous};
 fs.mkdirSync(path.dirname(filePath),{recursive:true});
 fs.writeFileSync(filePath,JSON.stringify(report,null,2)+'\n');
 return{changed:true,report};
}
function build(){
 const phase8Report=phase8.build();
 const phase9Report=phase9.build(phase9.load(),{phase8Report});
 if(phase8Report.phaseComplete!==true)throw new Error('phase8 live improvement cycle is incomplete');
 if(phase9Report.phaseComplete!==true)throw new Error('phase9 live improvement cycle is incomplete');
 return{phase8Report,phase9Report};
}
function run(){
 const {phase8Report,phase9Report}=build();
 const saved8=writeStable(PHASE8_OUT,phase8Report);
 const saved9=writeStable(PHASE9_OUT,phase9Report);
 const summary={productionChanged:false,phase8:{...phase8Report.summary,artifactChanged:saved8.changed},phase9:{...phase9Report.summary,artifactChanged:saved9.changed},audit:{duplicateRaceRecords:phase9Report.audit.duplicateRaceRecords,ambiguousMissReasons:phase9Report.audit.ambiguousMissReasons,rejectedCandidateRetest:phase9Report.audit.rejectedCandidateRetest,brokenHandoff:phase9Report.audit.brokenHandoff}};
 process.stdout.write(JSON.stringify(summary,null,2)+'\n');
 return summary;
}
if(require.main===module)run();
module.exports={PHASE8_OUT,PHASE9_OUT,comparable,writeStable,build,run};
