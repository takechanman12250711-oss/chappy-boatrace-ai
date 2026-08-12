"use strict";
const fs=require('node:fs');
const p='js/practical-selection.js';
let s=fs.readFileSync(p,'utf8');
const old=`        const weakOuterHead =\n          (headBoatNo === 5 || headBoatNo === 6) &&\n          numeric(row.priorityScore, 0) < 80;\n\n        if (weakOuterHead) {\n          rememberExpansionExclusion(\n            row,\n            \"WEAK_OUTER_HEAD_INDEPENDENT\",\n            \"5・6号艇頭の独立展開はpriority 80未満のため購入対象外。\"\n          );\n        }\n        return !weakOuterHead;`;
const neu=`        const priorityScore =\n          numeric(row.priorityScore, 0);\n        const weakTwoHead =\n          headBoatNo === 2 &&\n          priorityScore < 80;\n        const weakOuterHead =\n          (headBoatNo === 5 || headBoatNo === 6) &&\n          priorityScore < 80;\n\n        if (weakTwoHead) {\n          rememberExpansionExclusion(\n            row,\n            \"WEAK_TWO_HEAD_INDEPENDENT\",\n            \"2号艇頭の独立展開はpriority 80未満のため購入対象外。\"\n          );\n        }\n        if (weakOuterHead) {\n          rememberExpansionExclusion(\n            row,\n            \"WEAK_OUTER_HEAD_INDEPENDENT\",\n            \"5・6号艇頭の独立展開はpriority 80未満のため購入対象外。\"\n          );\n        }\n        return !weakTwoHead && !weakOuterHead;`;
if(!s.includes(old)) throw new Error('target block not found');
s=s.replace(old,neu);fs.writeFileSync(p,s);
