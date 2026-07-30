const assert = require("assert");
const fs = require("fs");

const evaluated = fs.readFileSync("js/evaluated-scenario-candidates.js", "utf8");
const practical = fs.readFileSync("js/practical-selection.js", "utf8");
const render = fs.readFileSync("js/render.js", "utf8");

assert(evaluated.includes("classifyScenarioCategory"));
assert(evaluated.includes("scenarioClassificationReason"));
assert(evaluated.includes("sourceCategory:"));
assert(practical.includes("displayCategory:"));
assert(practical.includes("categoryKey(category)"));
assert(!practical.includes("CATEGORY_LABELS[sourceCategory]"));
assert(render.includes('.replace(/independent-scenario/g, "独立展開")'));
assert(!/category:\s*\n?\s*"展開候補",\s*\n?\s*candidateKind/.test(evaluated));

console.log("scenario category sync regression: passed");
