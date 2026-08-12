"use strict";
const fs=require('node:fs');
const p='js/practical-selection.js';let s=fs.readFileSync(p,'utf8');
const marker=`        const promoted = {\n          ...row,\n          category: "候補補完",`;
const replacement=`        const promotedHeadBoatNo =\n          ticketBoats(row.ticket)[0];\n        if (promotedHeadBoatNo >= 4) {\n          recordDecision(\n            row,\n            false,\n            "OUTER_HEAD_CANDIDATE_PROMOTION_PRUNED",\n            "4〜6号艇頭の候補補完は購入対象外。"\n          );\n          return;\n        }\n\n        const promoted = {\n          ...row,\n          category: "候補補完",`;
if(!s.includes(marker))throw new Error('candidate promotion marker not found');
s=s.replace(marker,replacement);fs.writeFileSync(p,s);