"use strict";

const fs = require("node:fs");
const file = "js/practical-selection.js";
let source = fs.readFileSync(file, "utf8");

function replaceOnce(anchor, replacement, label) {
  if (!source.includes(anchor)) {
    if (source.includes(replacement)) return;
    throw new Error(`missing patch anchor: ${label}`);
  }
  source = source.replace(anchor, replacement);
}

replaceOnce(
  "  const MINIMUM_CANDIDATE_PROMOTION_SCORE =\n    90;\n",
  "  const MINIMUM_CANDIDATE_PROMOTION_SCORE =\n    90;\n  const STRONG_ESCAPE_MINIMUM_SCORE =\n    80;\n  const STRONG_ESCAPE_MINIMUM_GAP =\n    5;\n  const STRONG_ESCAPE_MAXIMUM_ALTERNATE_HEAD_COUNT =\n    1;\n",
  "strong escape constants"
);

const helperAnchor = "  function select(prediction) {\n";
const helper = `  function findRaceScenarios(\n    source,\n    seen = new Set()\n  ) {\n    if (\n      !source ||\n      typeof source !== \"object\" ||\n      seen.has(source)\n    ) {\n      return null;\n    }\n\n    seen.add(source);\n\n    if (\n      source.mainScenario &&\n      Array.isArray(source.scenarios)\n    ) {\n      return source;\n    }\n\n    for (const value of Object.values(source)) {\n      const found =\n        findRaceScenarios(\n          value,\n          seen\n        );\n      if (found) return found;\n    }\n\n    return null;\n  }\n\n  function strongEscapeTrimPlan(\n    prediction,\n    rows\n  ) {\n    const raceScenarios =\n      findRaceScenarios(prediction);\n    const mainScenario =\n      raceScenarios?.mainScenario || null;\n    const scenarios =\n      arrayify(\n        raceScenarios?.scenarios\n      );\n    const mainScore =\n      numeric(mainScenario?.score, 0);\n    const secondScore =\n      scenarios\n        .filter(\n          scenario =>\n            scenario !== mainScenario\n        )\n        .map(scenario =>\n          numeric(scenario?.score, 0)\n        )\n        .sort((a, b) => b - a)[0] ||\n      0;\n    const scoreGap =\n      mainScore - secondScore;\n    const eligible =\n      String(mainScenario?.type || \"\") ===\n        \"escape\" &&\n      mainScore >=\n        STRONG_ESCAPE_MINIMUM_SCORE &&\n      scoreGap >=\n        STRONG_ESCAPE_MINIMUM_GAP;\n\n    if (!eligible) {\n      return {\n        eligible: false,\n        applied: false,\n        mainScore,\n        secondScore,\n        scoreGap,\n        keptAlternateTickets: [],\n        removedTickets: []\n      };\n    }\n\n    const alternateRows =\n      arrayify(rows).filter(row =>\n        ticketBoats(row?.ticket)[0] !== 1\n      );\n    const keptAlternateTickets =\n      alternateRows\n        .slice(\n          0,\n          STRONG_ESCAPE_MAXIMUM_ALTERNATE_HEAD_COUNT\n        )\n        .map(row => row.ticket);\n    const removedTickets =\n      alternateRows\n        .slice(\n          STRONG_ESCAPE_MAXIMUM_ALTERNATE_HEAD_COUNT\n        )\n        .map(row => row.ticket);\n\n    return {\n      eligible: true,\n      applied:\n        removedTickets.length > 0,\n      mainScore,\n      secondScore,\n      scoreGap,\n      keptAlternateTickets,\n      removedTickets\n    };\n  }\n\n${helperAnchor}`;
replaceOnce(helperAnchor, helper, "strong escape helper");

const trimAnchor = "    candidates.forEach(\n      ({ row, validation }) => {\n";
const trimBlock = `    const strongEscapeTrim =\n      strongEscapeTrimPlan(\n        prediction,\n        selected\n      );\n    const strongEscapeTrimmedTickets =\n      new Set(\n        strongEscapeTrim\n          .removedTickets\n      );\n\n    if (strongEscapeTrim.applied) {\n      const retained =\n        selected.filter(row =>\n          !strongEscapeTrimmedTickets\n            .has(row.ticket)\n        );\n\n      selected.splice(\n        0,\n        selected.length,\n        ...retained\n      );\n      strongEscapeTrimmedTickets\n        .forEach(ticket =>\n          used.delete(ticket)\n        );\n      candidateDecisions.forEach(\n        decision => {\n          if (\n            strongEscapeTrimmedTickets\n              .has(decision.ticket)\n          ) {\n            decision.selected = false;\n            decision.reasonCode =\n              \"STRONG_ESCAPE_ALTERNATE_TRIMMED\";\n            decision.reason =\n              \"1逃げ成立度80以上かつ次点展開との差5点以上のため、別頭は選抜順の最上位1点だけを維持。\";\n          }\n        }\n      );\n    }\n\n${trimAnchor}`;
replaceOnce(trimAnchor, trimBlock, "strong escape trim application");

const selectedCheckAnchor = `        if (wasSelected) {\n          mergeIntoSelected(row);\n`;
const selectedCheckReplacement = `        if (\n          strongEscapeTrimmedTickets\n            .has(row.ticket)\n        ) {\n          recordDecision(\n            row,\n            false,\n            \"STRONG_ESCAPE_ALTERNATE_TRIMMED\",\n            \"1逃げ成立度80以上かつ次点展開との差5点以上のため、別頭は選抜順の最上位1点だけを維持。\"\n          );\n          return;\n        }\n\n${selectedCheckAnchor}`;
replaceOnce(selectedCheckAnchor, selectedCheckReplacement, "trimmed candidate decision");

const summaryAnchor = `      finalCount:\n        finalizedTickets.length,\n`;
const summaryReplacement = `      finalCount:\n        finalizedTickets.length,\n      ...(\n        strongEscapeTrim.eligible\n          ? {\n              strongEscapeTrim: {\n                eligible: true,\n                applied:\n                  strongEscapeTrim.applied,\n                minimumScore:\n                  STRONG_ESCAPE_MINIMUM_SCORE,\n                minimumGap:\n                  STRONG_ESCAPE_MINIMUM_GAP,\n                maximumAlternateHeadCount:\n                  STRONG_ESCAPE_MAXIMUM_ALTERNATE_HEAD_COUNT,\n                mainScore:\n                  strongEscapeTrim.mainScore,\n                secondScore:\n                  strongEscapeTrim.secondScore,\n                scoreGap:\n                  strongEscapeTrim.scoreGap,\n                keptAlternateTickets: [\n                  ...strongEscapeTrim\n                    .keptAlternateTickets\n                ],\n                removedTickets: [\n                  ...strongEscapeTrim\n                    .removedTickets\n                ],\n                removedCount:\n                  strongEscapeTrim\n                    .removedTickets.length\n              }\n            }\n          : {}\n      ),\n`;
replaceOnce(summaryAnchor, summaryReplacement, "expansion summary trim audit");

replaceOnce(
  "          \"practical-5-7-10-grounded-flow2-candidate90-v3\"\n",
  "          \"practical-5-7-10-grounded-flow2-candidate90-strongescape-v4\"\n",
  "ticket policy version"
);

const reasonAnchor = `      reason:\n        candidatePromotionTickets.length\n          ? \"基本5〜7点と検証済み独立展開を維持し、priority 90以上かつ3着まで物理根拠がそろう候補だけを空き枠へ補完。\"\n`;
const reasonReplacement = `      reason:\n        strongEscapeTrim.applied\n          ? \"強い1逃げでは1号艇頭を維持し、別頭は展開選抜順の最上位1点だけに整理。\"\n          : candidatePromotionTickets.length\n          ? \"基本5〜7点と検証済み独立展開を維持し、priority 90以上かつ3着まで物理根拠がそろう候補だけを空き枠へ補完。\"\n`;
replaceOnce(reasonAnchor, reasonReplacement, "selection reason");

const apiAnchor = `    MINIMUM_CANDIDATE_PROMOTION_SCORE,\n    THEORY_SCHEMA_VERSION,\n`;
const apiReplacement = `    MINIMUM_CANDIDATE_PROMOTION_SCORE,\n    STRONG_ESCAPE_MINIMUM_SCORE,\n    STRONG_ESCAPE_MINIMUM_GAP,\n    STRONG_ESCAPE_MAXIMUM_ALTERNATE_HEAD_COUNT,\n    THEORY_SCHEMA_VERSION,\n`;
replaceOnce(apiAnchor, apiReplacement, "api constants");

fs.writeFileSync(file, source);
console.log("strong escape trim patch applied");
