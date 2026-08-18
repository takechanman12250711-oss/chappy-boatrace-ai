"use strict";

const fs = require("node:fs");
const path = require("node:path");

const target = path.join(process.cwd(), "js", "practical-selection.js");
const source = fs.readFileSync(target, "utf8");
const marker = "        if (promotedHeadCourse >= 4) {";
const insertion = `        if (promotedHeadCourse === 2) {\n          const reason =\n            promotedHeadCourse ===\n              promotedHeadBoatNo\n              ? "2号艇頭のcandidate90候補補完は購入対象外。"\n              : \`${'${promotedHeadBoatNo}'}号艇は実2コース頭となるためcandidate90候補補完の購入対象外。\`;\n          recordDecision(\n            row,\n            false,\n            "SECOND_COURSE_HEAD_CANDIDATE_PROMOTION_PRUNED",\n            reason\n          );\n          return;\n        }\n\n${marker}`;

if (source.includes("SECOND_COURSE_HEAD_CANDIDATE_PROMOTION_PRUNED")) {
  console.log("candidate90 actual-course2 prune already applied");
  process.exit(0);
}
if (!source.includes(marker)) {
  throw new Error("candidate90 promotedHeadCourse marker not found");
}
const updated = source.replace(marker, insertion);
if (updated === source) {
  throw new Error("candidate90 production patch not applied");
}
fs.writeFileSync(target, updated);
console.log("candidate90 actual-course2 prune applied");
