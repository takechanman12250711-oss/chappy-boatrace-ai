"use strict";
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(process.cwd(), "js", "ai-core.js");
let src = fs.readFileSync(file, "utf8");
const marker = "const sashiSkillTiebreak = {";
if (src.includes(marker)) {
  console.log("2差し技量タイブレーク: 既に適用済み");
  process.exit(0);
}

const clampNeedle = `  fourAttackScore = clamp(\n    round(fourAttackScore),\n    1,\n    100\n  );\n\n  /*\n    追走・残しの保持は、該当する攻めが実際の主筋で、`;
const clampReplacement = `  fourAttackScore = clamp(\n    round(fourAttackScore),\n    1,\n    100\n  );\n\n  /*\n    1逃げと2差しが僅差の時だけ、最終的な技量差をタイブレークに使う。\n    展開スコア自体には加点せず、展開→コース→ST等で作った差が\n    2.5点以内の場合に限り、全国技量指数で最終順位を解決する。\n  */\n  const sashiSkillTiebreak = {\n    applied: false,\n    scoreGap: round(\n      Math.max(0, escapeScore - sashiScore)\n    ),\n    nationalSkillGap: round(\n      toNumber(getAnalysis(2)?.indexes?.national, 0) -\n      toNumber(getAnalysis(1)?.indexes?.national, 0)\n    )\n  };\n\n  const rawEscapeIsMain =\n    escapeScore >= sashiScore &&\n    escapeScore >= threeAttackScore &&\n    escapeScore >= fourAttackScore;\n\n  sashiSkillTiebreak.applied =\n    rawEscapeIsMain &&\n    sashiSkillTiebreak.scoreGap <= 2.5 &&\n    sashiSkillTiebreak.nationalSkillGap >= 10;\n\n  /*\n    追走・残しの保持は、該当する攻めが実際の主筋で、`;
if (!src.includes(clampNeedle)) throw new Error("clamp insertion point not found");
src = src.replace(clampNeedle, clampReplacement);

const sortNeedle = `  ].sort((a, b) => b.score - a.score);`;
const sortReplacement = `  ].sort((a, b) => {\n    if (sashiSkillTiebreak.applied) {\n      if (a.type === "sashi") return -1;\n      if (b.type === "sashi") return 1;\n    }\n\n    return b.score - a.score;\n  });`;
if (!src.includes(sortNeedle)) throw new Error("scenario sort point not found");
src = src.replace(sortNeedle, sortReplacement);

const evidenceNeedle = `    mainGap: round(mainGap),\n    relations: {`;
const evidenceReplacement = `    mainGap: round(mainGap),\n    sashiSkillTiebreak: {\n      applied: sashiSkillTiebreak.applied,\n      scoreGap: sashiSkillTiebreak.scoreGap,\n      nationalSkillGap:\n        sashiSkillTiebreak.nationalSkillGap,\n      reason: sashiSkillTiebreak.applied\n        ? "1逃げと2差しが2.5点以内で、2号艇の全国技量指数が1号艇を10点以上上回るため2差しを最終採用"\n        : ""\n    },\n    relations: {`;
if (!src.includes(evidenceNeedle)) throw new Error("evidence insertion point not found");
src = src.replace(evidenceNeedle, evidenceReplacement);

fs.writeFileSync(file, src);
console.log("2差し技量タイブレーク: ai-core.jsへ安全適用完了");
