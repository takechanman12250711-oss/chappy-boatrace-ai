'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function reasonCount(z,reason){return Number((z?.missingReasonSummary||[]).find(x=>x?.reason===reason)?.count||0);}
function classify(z){
 if(!z)return'DIAGNOSTIC_MISSING';
 if(Number(z.generationDiagnosticCount||0)===0)return'GENERATION_DIAGNOSTICS_MISSING';
 if(Number(z.formalEvidenceCount||0)>0&&Number(z.catalogTaggedCount||0)===0)return'FORMAL_PRESENT_TAG_NOT_SAVED';
 if(Number(z.formalEvidenceCount||0)>0)return'MEASURED';
 if(Number(z.supportPresentCount||0)===0)return'NO_NEW_ENGINE_SUPPORT_OBSERVED';
 const diagnostics=Number(z.generationDiagnosticCount||0);
 if(diagnostics>0&&reasonCount(z,'new-engine-mode-off')>=diagnostics)return'NO_NEW_ENGINE_MODE_OBSERVED';
 return'SUPPORT_PRESENT_FORMAL_NOT_MET';
}
function build(){
 const perf=read('data/stats/theory-performance-report.json');
 const z=(perf.zeroEvidenceDiagnostics||[]).find(x=>x.theoryKey==='new-engine')||null;
 const row=(perf.byTheory||[]).find(x=>x.theoryKey==='new-engine')||null;
 return{schemaVersion:1,generatedAt:new Date().toISOString(),productionChanged:false,theoryPerformance:row,diagnostics:z,classification:classify(z),normalZeroEvidence:classify(z)==='NO_NEW_ENGINE_MODE_OBSERVED',automaticProductionChange:false};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={reasonCount,classify,build};