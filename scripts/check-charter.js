"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = relativePath =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const charter = JSON.parse(read("config/chappy-charter.json"));

const expectedPriority = [
  "展開",
  "コース",
  "ST・スリット",
  "展示・足",
  "残し・拾い",
  "当地・水面",
  "技量",
  "モーター"
];

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const includesAll = (source, values) =>
  values.every(value => source.includes(value));

assert(
  JSON.stringify(charter.predictionPriority) ===
    JSON.stringify(expectedPriority),
  "予想の優先順位が憲章と一致しません"
);

assert(
  charter.principles?.insideAdvantageIsDefault === true,
  "内側優位の原則が無効です"
);
assert(
  charter.principles?.preserveRealisticSecondCourseSashi === true &&
    charter.principles?.preserveRealisticFourthBoatHold === true,
  "2差し・4残しの保護が無効です"
);
assert(
  charter.principles?.numbersAloneMayCreateTickets === false &&
    charter.principles?.numbersAloneMayDeleteTickets === false,
  "数字だけで買い目を変更できる設定です"
);
assert(
  charter.principles?.oddsUsage ===
    "post_selection_display_classification_funding_only",
  "オッズの用途が買い目作成後に限定されていません"
);
assert(
  charter.principles?.skipWhenMainScenarioIsMissing === true,
  "本線不成立時の見送りが無効です"
);

const practical = charter.practicalTickets || {};
const allocation = practical.allocationMaximum || {};
assert(
  practical.standard === 5 && practical.maximum === 7,
  "実戦厳選は基本5点・最大7点でなければなりません"
);
assert(
  allocation.main === 3 &&
    allocation.cover === 2 &&
    allocation.flow === 1 &&
    allocation.longshot === 1 &&
    Object.values(allocation).reduce((sum, value) => sum + value, 0) === 7,
  "実戦厳選の配分上限が3・2・1・1ではありません"
);

assert(
  charter.newEngine?.motorWeightMaximum === 0.05,
  "新エンジン期のモーター上限は0.05でなければなりません"
);

const exhibitionPerformance =
  charter.exhibitionPerformance || {};
assert(
  exhibitionPerformance.version === 2 &&
    exhibitionPerformance.weight === 0.09,
  "展示・足Ver2は総合9％枠でなければなりません"
);
assert(
  exhibitionPerformance.neutralScoreWhenIncomplete === 50 &&
    exhibitionPerformance.tieToleranceSeconds === 0.01,
  "展示欠損時50点・0.01秒同等評価が固定されていません"
);
assert(
  exhibitionPerformance.officialModeRequiresExhibitionBoats === 6 &&
    exhibitionPerformance.fullModeRequiresLapBoats === 6,
  "展示モードの6艇成立条件が固定されていません"
);
assert(
  exhibitionPerformance.exhibitionStBelongsTo === "ST・スリット" &&
    exhibitionPerformance.doubleTimeAndNewSamAreIntegrated === true &&
    exhibitionPerformance.mayAdjustRolesOrFinishingCandidatesSeparately === false,
  "展示ST・ダブルタイム・新サムの二重加点防止が無効です"
);
assert(
  includesAll(charter.newEngine?.keywords || [], [
    "新エンジン",
    "新型エンジン",
    "新モーター",
    "新燃料"
  ]),
  "新エンジン判定語が不足しています"
);

assert(
  charter.automation?.mayChangePredictionLogicWithoutApproval === false,
  "同意なしの予想ロジック変更が許可されています"
);
assert(
  includesAll(charter.automation?.logicChangeRequires || [], [
    "what",
    "why",
    "impact",
    "ownerApproval"
  ]),
  "ロジック変更手続きの必須条件が不足しています"
);

const aiCore = read("js/ai-core.js");
const render = read("js/render.js");
const script = read("js/script.js");
const index = read("index.html");
const style = read("style.css");
const noteGenerator = read("js/note-generator.js");
const practicalSelection = read("js/practical-selection.js");

const newEngineWeightMatch = aiCore.match(
  /const NEW_ENGINE_WEIGHTS\s*=\s*\{([\s\S]*?)\};/
);
const newEngineMotorMatch = newEngineWeightMatch?.[1]?.match(
  /motor:\s*([0-9.]+)/
);
const actualNewEngineMotorWeight = Number(newEngineMotorMatch?.[1]);

assert(
  Number.isFinite(actualNewEngineMotorWeight) &&
    actualNewEngineMotorWeight <= charter.newEngine.motorWeightMaximum,
  "実装の新エンジン期モーター比重が憲章上限を超えています"
);
assert(
  /新エンジン\|新型エンジン\|新モーター\|新燃料/.test(aiCore),
  "実装に新エンジン判定語がそろっていません"
);
assert(
  render.includes("数字・オッズだけによる削除はしていません"),
  "実戦厳選に数字・オッズ単独削除の禁止表示がありません"
);
assert(
  practicalSelection.includes("take(lists.main, 3, \"本線\")") &&
    practicalSelection.includes("take(lists.cover, 2, \"押さえ\")") &&
    practicalSelection.includes("take(lists.flow, 1, \"流し\")") &&
    practicalSelection.includes("take(lists.longshot, 1, \"万舟・穴\")"),
  "実戦厳選の実装配分が憲章と一致しません"
);
assert(
  practicalSelection.includes("主軸となる展開が定まらないため見送り。"),
  "note原稿に本線不成立時の見送りがありません"
);
assert(
  render.includes("ChappyPracticalSelection") &&
    noteGenerator.includes("ChappyPracticalSelection"),
  "アプリとnoteが共通の実戦厳選処理を使用していません"
);
assert(
  noteGenerator
    .replaceAll("選手技量", "技量")
    .includes(expectedPriority.join("→")),
  "note原稿の評価順が憲章と一致しません"
);
assert(
  !index.includes("legacyRenderArea") &&
    !index.includes('id="oddsArea"'),
  "旧描画互換エリアが画面に残っています"
);
assert(
  !script.includes("todayMainPick") &&
    !render.includes("renderTodayAiSummary"),
  "削除済みの「今日のAIおすすめ」処理が残っています"
);
assert(
  !render.includes("THEORY_LABELS") &&
    !render.includes("renderTheoryPanel") &&
    !render.includes("pushTheoryFromRanking") &&
    !render.includes("pushTheoryText") &&
    !render.includes("renderTheoryItem") &&
    !render.includes("旧互換・非表示"),
  "非表示の旧理論描画処理が残っています"
);
assert(
  !style.includes("v3-theory-") &&
    !fs.existsSync(path.join(root, ".github/workflows/cleanup-remaining-legacy-ui.yml")) &&
    !fs.existsSync(path.join(root, "scripts/cleanup-remaining-legacy-ui.js")),
  "旧理論CSSまたは一回限りの整理処理が残っています"
);
assert(
  !index.includes('id="missingArea"') &&
    !index.includes('id="historyArea"') &&
    !read("js/stats.js").includes('"historyArea"'),
  "非表示の旧互換DOMまたは描画処理が残っています"
);
assert(
  aiCore.includes(
    "aiTicketList:\n        compatibleAiTicketList"
  ) &&
    aiCore.includes(
      "all:\n          compatibleAiTicketList"
    ),
  "全表示が最新AIコアの共通買い目を使用していません"
);

if (failures.length) {
  console.error("チャッピーAI憲章チェック: 失敗");
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log("チャッピーAI憲章チェック: 合格");
console.log(`- 優先順位: ${expectedPriority.join(" → ")}`);
console.log("- 実戦厳選: 基本5点・最大7点");
console.log("- 同意なしの予想ロジック変更: 禁止");
