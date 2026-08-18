"use strict";
const fs=require("node:fs");
let core=fs.readFileSync("js/ai-core.js","utf8");
const old=`  sashiSkillTiebreak.applied =\n    rawEscapeIsMain &&\n    sashiSkillTiebreak.scoreGap <= 2.5 &&\n    sashiSkillTiebreak.nationalSkillGap >= 10;`;
const next=`  /*\n    #305の技量タイブレークは採用後monitorで基本5点・払戻を悪化させたため停止。\n    2差し生スコア、#301のST比較ガード、#308の残し・拾いは維持する。\n  */\n  sashiSkillTiebreak.applied = false;`;
if(!core.includes(old))throw Error("#305 marker not found");
fs.writeFileSync("js/ai-core.js",core.replace(old,next));
let mon=fs.readFileSync("scripts/build-sashi-core-post-adoption-monitor.js","utf8");
const oldBlock='}else if(kind==="noTiebreak"){const marker=/sashiSkillTiebreak\\.applied =\\n\\s*rawEscapeIsMain &&\\n\\s*sashiSkillTiebreak\\.scoreGap <= 2\\.5 &&\\n\\s*sashiSkillTiebreak\\.nationalSkillGap >= 10;/;if(!marker.test(patched))throw new Error("#305 tiebreak marker not found");patched=patched.replace(marker,"sashiSkillTiebreak.applied = false; // counterfactual: #305 tiebreak disabled");}';
const newBlock='}else if(kind==="legacyTiebreak"){const marker="sashiSkillTiebreak.applied = false;";if(!patched.includes(marker))throw new Error("#305 disabled marker not found");patched=patched.replace(marker,"sashiSkillTiebreak.applied =\\n    rawEscapeIsMain &&\\n    sashiSkillTiebreak.scoreGap <= 2.5 &&\\n    sashiSkillTiebreak.nationalSkillGap >= 10; // counterfactual: legacy #305 enabled");}';
if(!mon.includes(oldBlock))throw Error("monitor old block not found");
mon=mon.replace(oldBlock,newBlock)
 .replace('const noGuardCore=loadPatchedCore("noGuard"),noTiebreakCore=loadPatchedCore("noTiebreak");','const noGuardCore=loadPatchedCore("noGuard"),legacyTiebreakCore=loadPatchedCore("legacyTiebreak");')
 .replace('const prod=productionCore.buildPredictionData(input),ng=noGuardCore.buildPredictionData(input),nt=noTiebreakCore.buildPredictionData(input);','const prod=productionCore.buildPredictionData(input),ng=noGuardCore.buildPredictionData(input),nt=legacyTiebreakCore.buildPredictionData(input);')
 .replace('if(prod.raceScenarios?.evidence?.sashiSkillTiebreak?.applied===true)tiebreakApplied++;','if(nt.raceScenarios?.evidence?.sashiSkillTiebreak?.applied===true)tiebreakApplied++;')
 .replace('tiebreak:"A=current #305 tiebreak, B=same current ai-core with only sashi skill tiebreak disabled"','tiebreak:"A=current #305 disabled, B=same current ai-core with legacy #305 sashi skill tiebreak enabled"');
if(!mon.includes('legacyTiebreakCore'))throw Error("monitor patch failed");
fs.writeFileSync("scripts/build-sashi-core-post-adoption-monitor.js",mon);
