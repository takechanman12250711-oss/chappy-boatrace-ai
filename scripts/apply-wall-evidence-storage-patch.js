"use strict";
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");

function replaceOnce(text,before,after,label){
  if(text.includes(after)) return text;
  if(!text.includes(before)) throw new Error(`${label}: patch anchor not found`);
  return text.replace(before,after);
}

function patchCollector(text){
  const stBlock=`    stSlit: {\n      source: String(aiCore?.stSlitTheory?.source || ""),\n      roles: (Array.isArray(aiCore?.stSlitTheory?.roles)\n        ? aiCore.stSlitTheory.roles\n        : []).map(role => ({\n          boatNo: Number(role?.boatNo || role?.boat || 0) || null,\n          course: Number(role?.course || 0) || null,\n          score: Number.isFinite(Number(role?.score))\n            ? Number(role.score)\n            : null,\n          status: String(role?.status || ""),\n          samples: Number.isFinite(Number(role?.samples))\n            ? Number(role.samples)\n            : null,\n          isFormal: role?.isFormal === true,\n          appliedToScore: role?.appliedToScore === true,\n          fCount: Number(role?.fCount || 0),\n          reason: String(role?.reason || "")\n        }))\n    }\n`;
  const wallBlock=`    stSlit: {\n      source: String(aiCore?.stSlitTheory?.source || ""),\n      roles: (Array.isArray(aiCore?.stSlitTheory?.roles)\n        ? aiCore.stSlitTheory.roles\n        : []).map(role => ({\n          boatNo: Number(role?.boatNo || role?.boat || 0) || null,\n          course: Number(role?.course || 0) || null,\n          score: Number.isFinite(Number(role?.score))\n            ? Number(role.score)\n            : null,\n          status: String(role?.status || ""),\n          samples: Number.isFinite(Number(role?.samples))\n            ? Number(role.samples)\n            : null,\n          isFormal: role?.isFormal === true,\n          appliedToScore: role?.appliedToScore === true,\n          fCount: Number(role?.fCount || 0),\n          reason: String(role?.reason || "")\n        }))\n    },\n    wallTheory: (() => {\n      const wall = aiCore?.wallTheory || {};\n      const attackerNo = Number(wall?.attackerNo || raceScenarios?.attacker || 0);\n      const wallCandidateNo = Number(wall?.wallCandidateNo || 0);\n      const wallBoat = Number(wall?.wallBoat || 0);\n      const state = String(wall?.state || "").trim();\n      const score = Number(wall?.score);\n      const grade = String(wall?.grade || "").trim();\n      return {\n        attackerNo: attackerNo >= 1 && attackerNo <= 6 ? attackerNo : null,\n        wallCandidateNo: wallCandidateNo >= 1 && wallCandidateNo <= 6 ? wallCandidateNo : null,\n        wallBoat: wallBoat >= 1 && wallBoat <= 6 ? wallBoat : null,\n        state,\n        score: Number.isFinite(score) ? score : null,\n        grade,\n        formal: /^(壁成立|互角|壁崩れ)$/.test(state) && attackerNo >= 1 && attackerNo <= 6 && wallCandidateNo >= 1 && wallCandidateNo <= 6 && Number.isFinite(score) && Boolean(grade)\n      };\n    })()\n`;
  text=replaceOnce(text,stBlock,wallBlock,"collector wall evidence");
  const mergeAnchor=`    stSlit: {\n      ...(aiCoreEvidence.stSlit || {}),\n      ...(providedEvidence.stSlit || {}),\n      roles:\n        Array.isArray(providedEvidence?.stSlit?.roles) &&\n        providedEvidence.stSlit.roles.length\n          ? providedEvidence.stSlit.roles\n          : aiCoreEvidence?.stSlit?.roles || []\n    }\n`;
  const mergeAfter=`    stSlit: {\n      ...(aiCoreEvidence.stSlit || {}),\n      ...(providedEvidence.stSlit || {}),\n      roles:\n        Array.isArray(providedEvidence?.stSlit?.roles) &&\n        providedEvidence.stSlit.roles.length\n          ? providedEvidence.stSlit.roles\n          : aiCoreEvidence?.stSlit?.roles || []\n    },\n    wallTheory: {\n      ...(aiCoreEvidence.wallTheory || {}),\n      ...(providedEvidence.wallTheory || {})\n    }\n`;
  return replaceOnce(text,mergeAnchor,mergeAfter,"collector wall merge");
}

function patchTheorySnapshot(text){
  const before=`function wallEvidence(prediction) {\n  const wall = prediction?.aiCore?.wallTheory || prediction?.wallTheory || prediction?.raceScenarios?.wallTheory || {};`;
  const after=`function wallEvidence(prediction) {\n  const storedEvidence = prediction?.practicalSelection?.verificationEvidence || prediction?.verificationEvidence || {};\n  const wall = prediction?.aiCore?.wallTheory || prediction?.wallTheory || prediction?.raceScenarios?.wallTheory || storedEvidence?.wallTheory || {};`;
  return replaceOnce(text,before,after,"theory snapshot stored wall evidence");
}

function apply(){
  const collectorPath=path.join(root,"scripts","collect-predictions.js");
  const theoryPath=path.join(root,"js","theory-tag-snapshot.js");
  const collector=patchCollector(fs.readFileSync(collectorPath,"utf8"));
  const theory=patchTheorySnapshot(fs.readFileSync(theoryPath,"utf8"));
  fs.writeFileSync(collectorPath,collector);
  fs.writeFileSync(theoryPath,theory);
}

if(require.main===module){apply();console.log("wall evidence storage patch applied");}
module.exports={patchCollector,patchTheorySnapshot,apply};
