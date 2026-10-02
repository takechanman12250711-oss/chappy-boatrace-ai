"use strict";
const fs=require("node:fs");
const path=require("node:path");
const target=path.resolve(__dirname,"collect-predictions.js");
let src=fs.readFileSync(target,"utf8");
const marker=`    exhibitionFoot: (() => {\n      const support = prediction?.flowSupport || prediction?.stExhibitionSupport || {};`;
if(!src.includes(marker)) throw new Error("exhibitionFoot marker not found");
if(!src.includes("    localWater: (() => {")){
  const insert=`    localWater: (() => {\n      const support = prediction?.venueWaterSupport || {};\n      const venue = String(support?.venue || \"\").trim();\n      const windValue = Number(support?.wind);\n      const waveValue = Number(support?.wave);\n      const tide = String(support?.tide || \"\").trim();\n      const confirms = Array.isArray(support?.confirms) ? support.confirms : Array.isArray(support?.confirmations) ? support.confirmations : [];\n      const alerts = Array.isArray(support?.alerts) ? support.alerts : Array.isArray(support?.cautions) ? support.cautions : [];\n      const statements = [...confirms, ...alerts].map(String).filter(Boolean);\n      const wind = Number.isFinite(windValue) ? windValue : null;\n      const wave = Number.isFinite(waveValue) ? waveValue : null;\n      const hasMeasuredCondition = wind !== null || wave !== null || Boolean(tide);\n      const hasSpecificVenueRule = statements.some(text => !/開催場の水面特性を補助評価/.test(text) && /イン|差し|潮|風|波|水面|ナイター|展示|乗り心地/.test(text));\n      return {\n        venue,\n        wind,\n        wave,\n        tide,\n        statements,\n        formal: Boolean(venue) && statements.length > 0 && (hasMeasuredCondition || hasSpecificVenueRule)\n      };\n    })(),\n`;
  src=src.replace(marker,insert+marker);
}
const mergeMarker=`    wallTheory: {\n      ...(aiCoreEvidence.wallTheory || {}),\n      ...(providedEvidence.wallTheory || {})\n    }`;
if(!src.includes(mergeMarker)) throw new Error("wallTheory merge marker not found");
if(!src.includes("    localWater: {\n      ...(aiCoreEvidence.localWater || {}),")){
  src=src.replace(mergeMarker,`    localWater: {\n      ...(aiCoreEvidence.localWater || {}),\n      ...(providedEvidence.localWater || {})\n    },\n`+mergeMarker);
}
fs.writeFileSync(target,src);
console.log("local water evidence storage patch applied");
