'use strict';
const input = require('./analysis-input-contract');
const HOLDOUT_START='20260819';
const fields={
  entries:x=>Array.isArray(x.entries)&&x.entries.length===6,
  st:x=>Array.isArray(x.entries)&&x.entries.length===6&&x.entries.every(b=>Number.isFinite(Number(b?.st??b?.startTiming??b?.avgST))),
  exhibition:x=>Array.isArray(x.entries)&&x.entries.length===6&&x.entries.every(b=>Number.isFinite(Number(b?.exhibition??b?.exhibitionTime??b?.tenjiTime))),
  course:x=>Array.isArray(x.entries)&&x.entries.length===6&&x.entries.every(b=>Number.isFinite(Number(b?.course??b?.entryCourse??b?.lane??b?.boatNo))),
  motor:x=>Array.isArray(x.entries)&&x.entries.length===6&&x.entries.every(b=>Number.isFinite(Number(b?.motorRate??b?.motor2Rate??b?.motorWinRate??b?.motorNo))),
  local:x=>Array.isArray(x.entries)&&x.entries.length===6&&x.entries.every(b=>Number.isFinite(Number(b?.localWinRate??b?.localRate??b?.local))),
  national:x=>Array.isArray(x.entries)&&x.entries.length===6&&x.entries.every(b=>Number.isFinite(Number(b?.winRate??b?.nationalWinRate??b?.national))),
  weather:x=>x.weather&&typeof x.weather==='object'&&Object.keys(x.weather).length>0
};
function dateOf(r){return String(r.__analysisRaceKey||input.raceKey(r)||'').slice(0,8)}
function build(){const cohort=input.buildDefaultCohort();const rows=cohort.records.filter(r=>dateOf(r)>=HOLDOUT_START);const available={},missing={};for(const k of Object.keys(fields)){available[k]=0;missing[k]=0}let strictEntries=0;for(const r of rows){const frozen=input.referenceTagInput(r,{strictFrozenInputs:true});if(Array.isArray(frozen.entries)&&frozen.entries.length===6)strictEntries++;for(const [k,fn] of Object.entries(fields)){if(fn(frozen))available[k]++;else missing[k]++;}}return{schemaVersion:1,analysisId:'frozen-input-replayability-v1',holdoutStart:HOLDOUT_START,eligible:rows.length,strictEntries,available,missing,diagnostics:cohort.diagnostics};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
