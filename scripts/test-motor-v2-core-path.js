"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

const motor = read("js/motor-maintenance-insights.js");
const core = read("js/ai-core.js");
const loader = read("js/prediction-runtime-loader.js");

// 既存の動的テストを先に実行し、入力置換・新エンジン減衰・整備単独加点禁止を確認する。
execFileSync(process.execPath, [path.join(repoRoot, "tools/test-motor-maintenance-theory-v2.js")], {
  stdio: "inherit"
});

assert.match(
  motor,
  /core\.buildPredictionData\s*=\s*function\s*\(data\)/,
  "モーターVer2はbuildPredictionData本体を包む"
);
assert.match(
  motor,
  /const enhanced = enhanceData\(data, core\);[\s\S]*originalBuild\(enhanced\.data\)/,
  "ai-coreへ渡す前にVer2入力へ置換する"
);
assert.match(
  motor,
  /core\.buildBoatAnalyses\s*=\s*function\s*\(data\)/,
  "艇分析単体でもVer2入力を通す"
);
assert.match(
  motor,
  /\.\.\.row\.encodedMotor/,
  "正式評価時だけencodedMotorを既存motor入力へ反映する"
);
assert.ok(
  motor.includes("const maintenanceEffect = maintenance") &&
  motor.includes("? strongEvidence ? 10 : moderateEvidence ? 6 : 0") &&
  motor.includes(": 5;"),
  "部品交換の事実だけでは加点しない"
);
assert.match(
  motor,
  /if \(newEnvironment\) score = round\(score \* 0\.45\)/,
  "新エンジン期はモーター実績を減衰する"
);

assert.match(
  core,
  /function calcMotorIndex\(boat, data\)[\s\S]*boat\.motorRate[\s\S]*boat\.motor2Rate/,
  "ai-coreのmotor指数はVer2が置換するmotorRate/motor2Rateを実際に読む"
);
assert.match(
  core,
  /motor:\s*calcMotorIndex\(\s*boat,\s*data\s*\)/,
  "calcMotorIndexの結果を艇分析のmotor枠へ渡す"
);

const motorPos = loader.indexOf('"js/motor-maintenance-insights.js"');
const corePos = loader.indexOf('"js/ai-core.js"');
const predictionPos = loader.indexOf('"js/prediction.js"');
assert.ok(motorPos >= 0, "モーターVer2をランタイムへ読み込む");
assert.ok(corePos > motorPos, "ai-core生成前にモーターVer2の待受けを置く");
assert.ok(predictionPos > corePos, "Ver2適用済みai-coreをpredictionへ渡す");

console.log("モーターVer2 本体経路テスト: 合格");
console.log("- Ver2入力置換 -> ai-core motor指数 -> prediction の順序を固定");
console.log("- 部品交換単独加点なし / 新エンジン減衰を維持");
console.log("- 展開・印・買い目への別枠二重加点は追加しない");
