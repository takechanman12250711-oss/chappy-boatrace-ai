"use strict";
const fs=require("node:fs");
const corePath="js/ai-core.js";
let core=fs.readFileSync(corePath,"utf8");
const old=`  sashiSkillTiebreak.applied =\n    rawEscapeIsMain &&\n    sashiSkillTiebreak.scoreGap <= 2.5 &&\n    sashiSkillTiebreak.nationalSkillGap >= 10;`;
const replacement=`  /*\n    #305の技量タイブレークは採用後monitorで、主展開頭の正答は増えた一方、\n    基本5点の的中・払戻を悪化させたため本番適用を停止する。\n    2差しの生スコア、#301のST比較ガード、#308の残し・拾いは維持する。\n  */\n  sashiSkillTiebreak.applied = false;`;
if(!core.includes(old))throw new Error("#305 production marker not found");
core=core.replace(old,replacement);
fs.writeFileSync(corePath,core);

const monitorPath="scripts/build-sashi-core-post-adoption-monitor.js";
let monitor=fs.readFileSync(monitorPath,"utf8");
monitor=monitor.replace('}else if(kind==="noTiebreak"){const marker=/sashiSkillTiebreak\\.applied =\\n\\s*rawEscapeIsMain &&\\n\\s*sashiSkillTiebreak\\.scoreGap <= 2\\.5 &&\\n\\s*sashiSkillTiebreak\\.nationalSkillGap >= 10;/;if(!marker.test(patched))throw new Error("#305 tiebreak marker not found");patched=patched.replace(marker,"sashiSkillTiebreak.applied = false; // counterfactual: #305 tiebreak disabled");}', '}else if(kind==="legacyTiebreak"){const marker="sashiSkillTiebreak.applied = false;";if(!patched.includes(marker))throw new Error("#305 disabled marker not found");patched=patched.replace(marker,"sashiSkillTiebreak.applied =\\n    rawEscapeIsMain &&\\n    sashiSkillTiebreak.scoreGap <= 2.5 &&\\n    sashiSkillTiebreak.nationalSkillGap >= 10; // counterfactual: legacy #305 enabled");}');
monitor=monitor.replace('const noGuardCore=loadPatchedCore("noGuard"),noTiebreakCore=loadPatchedCore("noTiebreak");','const noGuardCore=loadPatchedCore("noGuard"),legacyTiebreakCore=loadPatchedCore("legacyTiebreak");');
monitor=monitor.replace('const prod=productionCore.buildPredictionData(input),ng=noGuardCore.buildPredictionData(input),nt=noTiebreakCore.buildPredictionData(input);','const prod=productionCore.buildPredictionData(input),ng=noGuardCore.buildPredictionData(input),nt=legacyTiebreakCore.buildPredictionData(input);');
monitor=monitor.replace('if(prod.raceScenarios?.evidence?.sashiSkillTiebreak?.applied===true)tiebreakApplied++;','if(nt.raceScenarios?.evidence?.sashiSkillTiebreak?.applied===true)tiebreakApplied++;');
monitor=monitor.replace('tiebreak:"A=current #305 tiebreak, B=same current ai-core with only sashi skill tiebreak disabled"','tiebreak:"A=current #305 disabled, B=same current ai-core with legacy #305 sashi skill tiebreak enabled"');
if(!monitor.includes('legacyTiebreakCore'))throw new Error("monitor patch failed");
fs.writeFileSync(monitorPath,monitor);
