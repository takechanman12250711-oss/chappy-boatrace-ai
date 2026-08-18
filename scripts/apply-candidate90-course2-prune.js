"use strict";

const fs = require("node:fs");
const path = require("node:path");

const target = path.join(process.cwd(), "js", "practical-selection.js");
const source = fs.readFileSync(target, "utf8");
const before = `        if (promotedHeadCourse >= 4) {\n          const reason =\n            promotedHeadCourse ===\n              promotedHeadBoatNo\n              ? "4〜6号艇頭の候補補完は購入対象外。"\n              : \`${'${promotedHeadBoatNo}'}号艇は実${'${promotedHeadCourse}'}コースの外頭となるため候補補完の購入対象外。\`;\n          recordDecision(\n            row,\n            false,\n            "OUTER_HEAD_CANDIDATE_PROMOTION_PRUNED",\n            reason\n          );\n          return;\n        }`;
const after = `        if (\n          promotedHeadCourse === 2 ||\n          promotedHeadCourse >= 4\n        ) {\n          const isSecondCourseHead =\n            promotedHeadCourse === 2;\n          const reason =\n            isSecondCourseHead\n              ? (\n                  promotedHeadCourse ===\n                    promotedHeadBoatNo\n                    ? "2号艇頭のcandidate90候補補完は購入対象外。"\n                    : \`${'${promotedHeadBoatNo}'}号艇は実2コース頭となるためcandidate90候補補完の購入対象外。\`\n                )\n              : promotedHeadCourse ===\n                  promotedHeadBoatNo\n                ? "4〜6号艇頭の候補補完は購入対象外。"\n                : \`${'${promotedHeadBoatNo}'}号艇は実${'${promotedHeadCourse}'}コースの外頭となるため候補補完の購入対象外。\`;\n          recordDecision(\n            row,\n            false,\n            isSecondCourseHead\n              ? "SECOND_COURSE_HEAD_CANDIDATE_PROMOTION_PRUNED"\n              : "OUTER_HEAD_CANDIDATE_PROMOTION_PRUNED",\n            reason\n          );\n          return;\n        }`;

if (!source.includes(before)) {
  throw new Error("candidate90 production target not found");
}
const updated = source.replace(before, after);
if (updated === source) {
  throw new Error("candidate90 production patch not applied");
}
fs.writeFileSync(target, updated);
console.log("candidate90 actual-course2 prune applied");
