"use strict";

const fs = require("node:fs");
const path = require("node:path");

const COMPACT_SCENARIO_OLD = `    frameMovementAdjustment: Number(\n      value.frameMovementAdjustment || 0\n    ),\n    attacker: Number(value.attacker || 0) || null,`;
const COMPACT_SCENARIO_NEW = `    frameMovementAdjustment: Number(\n      value.frameMovementAdjustment || 0\n    ),\n    ...(Object.prototype.hasOwnProperty.call(value, "slitAdjustment")\n      ? { slitAdjustment: Number(value.slitAdjustment || 0) }\n      : {}),\n    slitReasons: Array.isArray(value.slitReasons)\n      ? value.slitReasons.map(String).filter(Boolean)\n      : [],\n    attacker: Number(value.attacker || 0) || null,`;

const AICORE_EVIDENCE_OLD = `    frameMovement: Array.isArray(evidence.frameMovement)\n      ? evidence.frameMovement\n      : []\n  };`;
const AICORE_EVIDENCE_NEW = `    frameMovement: Array.isArray(evidence.frameMovement)\n      ? evidence.frameMovement\n      : [],\n    stSlit: {\n      source: String(aiCore?.stSlitTheory?.source || ""),\n      roles: (Array.isArray(aiCore?.stSlitTheory?.roles)\n        ? aiCore.stSlitTheory.roles\n        : []).map(role => ({\n          boatNo: Number(role?.boatNo || role?.boat || 0) || null,\n          course: Number(role?.course || 0) || null,\n          score: Number.isFinite(Number(role?.score))\n            ? Number(role.score)\n            : null,\n          status: String(role?.status || ""),\n          samples: Number.isFinite(Number(role?.samples))\n            ? Number(role.samples)\n            : null,\n          isFormal: role?.isFormal === true,\n          appliedToScore: role?.appliedToScore === true,\n          fCount: Number(role?.fCount || 0),\n          reason: String(role?.reason || "")\n        }))\n    }\n  };`;

const SCENARIO_MERGE_OLD = `    scenarios:\n      providedScenarios.length >= 2\n        ? providedScenarios\n        : aiCoreScenarios,`;
const SCENARIO_MERGE_NEW = `    scenarios:\n      providedScenarios.length >= 2\n        ? providedScenarios.map((provided, index) =>\n            mergeCompactScenario(\n              provided,\n              aiCoreScenarios.find(row =>\n                String(row?.type || "") ===\n                  String(provided?.type || "")\n              ) || aiCoreScenarios[index] || null\n            )\n          )\n        : aiCoreScenarios,`;

const ST_SLIT_MERGE_OLD = `    frameMovement:\n      Array.isArray(providedEvidence.frameMovement) &&\n      providedEvidence.frameMovement.length\n        ? providedEvidence.frameMovement\n        : aiCoreEvidence.frameMovement\n  };`;
const ST_SLIT_MERGE_NEW = `    frameMovement:\n      Array.isArray(providedEvidence.frameMovement) &&\n      providedEvidence.frameMovement.length\n        ? providedEvidence.frameMovement\n        : aiCoreEvidence.frameMovement,\n    stSlit: {\n      ...(aiCoreEvidence.stSlit || {}),\n      ...(providedEvidence.stSlit || {}),\n      roles:\n        Array.isArray(providedEvidence?.stSlit?.roles) &&\n        providedEvidence.stSlit.roles.length\n          ? providedEvidence.stSlit.roles\n          : aiCoreEvidence?.stSlit?.roles || []\n    }\n  };`;

const HISTORY_LOOKUP_OLD = `    const stats =\n      (\n        officialHistoryStats.racers ||\n        {}\n      )[registerNo] || null;\n    const venueStats =\n      (\n        racerVenueStarts.racers ||\n        {}\n      )[registerNo] || null;\n    if (!stats && !venueStats) {\n      return null;\n    }`;
const HISTORY_LOOKUP_NEW = `    const stats =\n      (\n        officialHistoryStats.racers ||\n        {}\n      )[registerNo] || null;\n    const venueStats =\n      (\n        racerVenueStarts.racers ||\n        {}\n      )[registerNo] || null;\n    const skillHistory =\n      racerSkillStats?.racers?.[registerNo] ||\n      null;\n    if (!stats && !venueStats && !skillHistory) {\n      return null;\n    }`;

const HISTORY_RETURN_OLD = `      samples:\n        Number(stats?.starts || 0),\n      localStarts,`;
const HISTORY_RETURN_NEW = `      skillHistory,\n      samples:\n        Number(\n          stats?.starts ??\n          skillHistory?.windows?.all3Years?.starts ??\n          0\n        ),\n      localStarts,`;

function replaceExactly(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} marker count must be 1, got ${count}`);
  }
  return source.replace(before, after);
}

function patchText(source) {
  let output = String(source);
  output = replaceExactly(output, COMPACT_SCENARIO_OLD, COMPACT_SCENARIO_NEW, "compactScenario");
  output = replaceExactly(output, AICORE_EVIDENCE_OLD, AICORE_EVIDENCE_NEW, "aiCoreEvidence.stSlit");
  output = replaceExactly(output, SCENARIO_MERGE_OLD, SCENARIO_MERGE_NEW, "scenario merge");
  output = replaceExactly(output, ST_SLIT_MERGE_OLD, ST_SLIT_MERGE_NEW, "stSlit merge");
  output = replaceExactly(output, HISTORY_LOOKUP_OLD, HISTORY_LOOKUP_NEW, "live racer skill history lookup");
  output = replaceExactly(output, HISTORY_RETURN_OLD, HISTORY_RETURN_NEW, "live racer skill history return");
  return output;
}

function main() {
  const target = path.resolve(process.argv[2] || "scripts/collect-predictions.js");
  const source = fs.readFileSync(target, "utf8");
  const output = patchText(source);
  fs.writeFileSync(target, output, "utf8");
  console.log(`ST/slit storage source patched: ${path.relative(process.cwd(), target)}`);
}

if (require.main === module) main();
module.exports = { patchText };