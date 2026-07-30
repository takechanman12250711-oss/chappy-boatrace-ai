const fs = require("fs");

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: expected one match, found ${count}`);
  }
  fs.writeFileSync(path, source.replace(before, after), "utf8");
}

replaceOnce(
  "js/evaluated-scenario-candidates.js",
  "    function build(basePrediction) {",
  `    const SCENARIO_CATEGORY_LABELS = Object.freeze({\n      main: \"本線\",\n      cover: \"押さえ\",\n      flow: \"流し\",\n      hole: \"万舟\"\n    });\n\n    function classifyScenarioCategory(\n      ticketBranches,\n      bestBranch\n    ) {\n      const branches = Array.isArray(ticketBranches)\n        ? ticketBranches\n        : [];\n      const sourceKeys = branches\n        .map((branch) =>\n          String(branch?.source || \"\")\n            .replace(/^base-formation:/, \"\")\n        )\n        .filter((key) =>\n          Object.prototype.hasOwnProperty.call(\n            SCENARIO_CATEGORY_LABELS,\n            key\n          )\n        );\n\n      if (sourceKeys.includes(\"main\")) {\n        return { key: \"main\", label: SCENARIO_CATEGORY_LABELS.main, reason: \"最有力の中心展開\" };\n      }\n      if (sourceKeys.includes(\"cover\")) {\n        return { key: \"cover\", label: SCENARIO_CATEGORY_LABELS.cover, reason: \"中心展開の軽い崩れ\" };\n      }\n      if (sourceKeys.includes(\"flow\")) {\n        return { key: \"flow\", label: SCENARIO_CATEGORY_LABELS.flow, reason: \"同一展開の3着違い\" };\n      }\n      if (sourceKeys.includes(\"hole\")) {\n        return { key: \"hole\", label: SCENARIO_CATEGORY_LABELS.hole, reason: \"本線とは異なる成立展開\" };\n      }\n\n      const roles = branches.flatMap((branch) =>\n        Array.isArray(branch?.roles) ? branch.roles : []\n      );\n      const type = String(bestBranch?.type || \"\");\n      const hasAlternateHead =\n        type.includes(\"alternate-head\") ||\n        roles.some((role) => role?.role === \"alternate-head\");\n      const hasPickup = roles.some((role) =>\n        role?.role === \"pickup\" &&\n        (role?.eligiblePositions || []).includes(3)\n      );\n      const hasHold = roles.some((role) =>\n        role?.role === \"hold\"\n      );\n\n      if (hasAlternateHead) {\n        return { key: \"hole\", label: SCENARIO_CATEGORY_LABELS.hole, reason: \"別頭の独立展開\" };\n      }\n      if (hasPickup) {\n        return { key: \"flow\", label: SCENARIO_CATEGORY_LABELS.flow, reason: \"3着拾いの展開違い\" };\n      }\n      if (hasHold) {\n        return { key: \"cover\", label: SCENARIO_CATEGORY_LABELS.cover, reason: \"残し艇を使う押さえ展開\" };\n      }\n      return { key: \"main\", label: SCENARIO_CATEGORY_LABELS.main, reason: \"中心の成立展開\" };\n    }\n\n    function build(basePrediction) {`
);

replaceOnce(
  "js/evaluated-scenario-candidates.js",
  `            candidatePool.push({\n              id:\n                \`candidate:\${ticket}\`,\n              ticket,\n              category:\n                \"展開候補\",\n              candidateKind:\n                independentBranches\n                  .length\n                  ? \"independent-scenario\"\n                  : ticketBranches.length\n                    ? \"canonical-formation\"\n                    : \"evaluation-coverage\",`,
  `            const scenarioCategory =\n              classifyScenarioCategory(\n                ticketBranches,\n                bestBranch\n              );\n\n            candidatePool.push({\n              id:\n                \`candidate:\${ticket}\`,\n              ticket,\n              category:\n                scenarioCategory.label,\n              sourceCategory:\n                scenarioCategory.key,\n              displayCategory:\n                scenarioCategory.label,\n              scenarioClassificationReason:\n                scenarioCategory.reason,\n              candidateKind:\n                independentBranches\n                  .length\n                  ? \"independent-scenario\"\n                  : ticketBranches.length\n                    ? \"canonical-formation\"\n                    : \"evaluation-coverage\",`
);

replaceOnce(
  "js/evaluated-scenario-candidates.js",
  `              comment:\n                bestBranch?.summary ||\n                \`\${ticket}は候補として保持。\` +\n                \"構造化根拠を確認できるまで実戦厳選へ追加しない。\",`,
  `              comment:\n                bestBranch?.summary\n                  ? \`【\${scenarioCategory.label}】\${bestBranch.summary}\`\n                  : \`【\${scenarioCategory.label}】\${ticket}は候補として保持。\` +\n                    \"構造化根拠を確認できるまで実戦厳選へ追加しない。\",`
);

replaceOnce(
  "js/practical-selection.js",
  `  const ROLE_LABELS = Object.freeze({\n    head: \"1着軸\",\n    \"alternate-head\": \"攻め頭\",\n    attack: \"攻め\",\n    hold: \"残し\",\n    inside: \"内残し\",\n    pickup: \"拾い\"\n  });`,
  `  const ROLE_LABELS = Object.freeze({\n    head: \"1着軸\",\n    \"alternate-head\": \"攻め頭\",\n    attack: \"攻め\",\n    hold: \"残し\",\n    inside: \"内残し\",\n    pickup: \"拾い\"\n  });\n  const CATEGORY_LABELS = Object.freeze({\n    main: \"本線\",\n    cover: \"押さえ\",\n    flow: \"流し\",\n    hole: \"万舟\",\n    possibility: \"展開候補\"\n  });`
);

replaceOnce(
  "js/practical-selection.js",
  `    const sourceCategory =\n      explicitSourceCategory ||\n      categoryKey(category);`,
  `    const sourceCategory =\n      explicitSourceCategory ||\n      categoryKey(\n        original.sourceCategory ||\n        original.displayCategory ||\n        original.category ||\n        category\n      );`
);

replaceOnce(
  "js/practical-selection.js",
  `      category,\n      sourceCategory,`,
  `      category:\n        CATEGORY_LABELS[sourceCategory] ||\n        category,\n      sourceCategory,`
);

replaceOnce(
  "js/render.js",
  `    return String(value);`,
  `    return String(value)\n      .replace(/independent-scenario/g, \"独立展開\");`
);

const test = `const assert = require("assert");\nconst fs = require("fs");\n\nconst evaluated = fs.readFileSync("js/evaluated-scenario-candidates.js", "utf8");\nconst practical = fs.readFileSync("js/practical-selection.js", "utf8");\nconst render = fs.readFileSync("js/render.js", "utf8");\n\nassert(evaluated.includes("classifyScenarioCategory"));\nassert(evaluated.includes("scenarioClassificationReason"));\nassert(evaluated.includes("sourceCategory:"));\nassert(practical.includes("CATEGORY_LABELS[sourceCategory]"));\nassert(practical.includes("original.sourceCategory"));\nassert(render.includes('.replace(/independent-scenario/g, "独立展開")'));\nassert(!/category:\\s*\\n?\\s*\"展開候補\",\\s*\\n?\\s*candidateKind/.test(evaluated));\n\nconsole.log("scenario category sync regression: passed");\n`;
fs.writeFileSync("scripts/test-scenario-category-sync.js", test, "utf8");

for (const path of [
  "scripts/apply-scenario-category-sync.js",
  ".github/workflows/scenario-category-sync.yml"
]) {
  if (fs.existsSync(path)) fs.unlinkSync(path);
}

console.log("Applied scenario category sync patch.");
