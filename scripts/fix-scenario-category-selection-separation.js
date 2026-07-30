const fs = require("fs");

const path = "js/practical-selection.js";
let source = fs.readFileSync(path, "utf8");

source = source.replace(
  `  const CATEGORY_LABELS = Object.freeze({\n    main: "本線",\n    cover: "押さえ",\n    flow: "流し",\n    hole: "万舟・穴",\n    possibility: "展開候補"\n  });\n`,
  ""
);

source = source.replace(
  `    const sourceCategory =\n      explicitSourceCategory ||\n      categoryKey(\n        original.sourceCategory ||\n        original.displayCategory ||\n        original.category ||\n        category\n      );`,
  `    const sourceCategory =\n      explicitSourceCategory ||\n      categoryKey(category);`
);

source = source.replace(
  `      category:\n        CATEGORY_LABELS[sourceCategory] ||\n        category,\n      sourceCategory,`,
  `      category,\n      displayCategory:\n        original.displayCategory ||\n        original.category ||\n        category,\n      sourceCategory,`
);

fs.writeFileSync(path, source, "utf8");

const testPath = "scripts/test-scenario-category-sync.js";
let test = fs.readFileSync(testPath, "utf8");
test = test.replace(
  `assert(practical.includes("CATEGORY_LABELS[sourceCategory]"));\nassert(practical.includes("original.sourceCategory"));`,
  `assert(practical.includes("displayCategory:"));\nassert(practical.includes("categoryKey(category)"));\nassert(!practical.includes("CATEGORY_LABELS[sourceCategory]"));`
);
fs.writeFileSync(testPath, test, "utf8");

for (const cleanupPath of [
  "scripts/fix-scenario-category-selection-separation.js"
]) {
  if (fs.existsSync(cleanupPath)) fs.unlinkSync(cleanupPath);
}

console.log("Separated display categories from selection keys.");
