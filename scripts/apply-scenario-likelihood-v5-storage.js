"use strict";

const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "collect-predictions.js");
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
`const shadowSelectionV2 =
  loadOptionalV2Dependency(
    () => require(
      "../js/shadow-selection-v2"
    ),
    null,
    "評価器"
  );
`,
`const shadowSelectionV2 =
  loadOptionalV2Dependency(
    () => require(
      "../js/shadow-selection-v2"
    ),
    null,
    "評価器"
  );
const scenarioLikelihoodV5 =
  loadOptionalV2Dependency(
    () => require(
      "../js/scenario-likelihood-v5"
    ),
    null,
    "展開相対成立度"
  );
`,
"load scenario likelihood v5"
);

replaceOnce(
`  "js/shadow-selection-v2.js"
], "ロジック");`,
`  "js/shadow-selection-v2.js",
  "js/scenario-likelihood-v5.js"
], "ロジック");`,
"fingerprint scenario likelihood v5"
);

replaceOnce(
`function safelyUpsertShadowSnapshots(
  existing,
  incoming,
  upserter = null
) {`,
`function safelyAnalyzeScenarioLikelihoodV5(
  prediction,
  analyzer = null
) {
  try {
    const activeAnalyzer =
      analyzer ||
      scenarioLikelihoodV5?.analyze;

    if (typeof activeAnalyzer !== "function") {
      return {
        status: "unavailable",
        usableForPurchase: false,
        scenarios: []
      };
    }

    return activeAnalyzer(
      prediction?.aiCore?.raceScenarios ||
      prediction?.raceFlow ||
      {}
    );
  } catch (error) {
    console.warn(
      `展開AI v5シャドー生成失敗：${error?.message || error}`
    );
    return {
      status: "analysis-failed",
      usableForPurchase: false,
      scenarios: [],
      error: String(error?.message || error)
    };
  }
}

function safelyUpsertShadowSnapshots(
  existing,
  incoming,
  upserter = null
) {`,
"add safe scenario likelihood analyzer"
);

replaceOnce(
`  const selection =
    buildActiveV2Selection(
      shadowV2,
      legacySelection,
      selected
    );`,
`  const scenarioLikelihood =
    safelyAnalyzeScenarioLikelihoodV5(
      prediction,
      dependencies.scenarioLikelihoodAnalyzer
    );
  const selection =
    buildActiveV2Selection(
      shadowV2,
      legacySelection,
      selected
    );`,
"analyze scenario likelihood"
);

replaceOnce(
`    selection,
    shadowV2,
    prediction: compactVerificationPayload(`,
`    selection,
    shadowV2,
    scenarioLikelihoodV5:
      scenarioLikelihood,
    prediction: compactVerificationPayload(`,
"store scenario likelihood"
);

replaceOnce(
`  safelyBuildShadowV2,
  safelyUpsertShadowSnapshots,`,
`  safelyBuildShadowV2,
  safelyAnalyzeScenarioLikelihoodV5,
  safelyUpsertShadowSnapshots,`,
"export scenario likelihood helper"
);

fs.writeFileSync(filePath, source, "utf8");
console.log("scenario likelihood v5 storage patch applied");
