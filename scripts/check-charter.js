"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = relativePath =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const charter = JSON.parse(read("config/chappy-charter.json"));
const collectPredictionWorkflow = read(
  ".github/workflows/collect-predictions.yml"
);
const collectResultWorkflow = read(
  ".github/workflows/collect-results.yml"
);
const learningAnalysisWorkflow = read(
  ".github/workflows/build-learning-analysis-pipeline.yml"
);
const practicalPriorityShadowReportApi =
  require("../js/practical-priority-shadow-report");

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

const sharedWriterConcurrency =
  /concurrency:\s*\n\s+group: chappy-main-data-writers\s*\n\s+queue: max\s*\n\s+cancel-in-progress: false/;
assert(
  sharedWriterConcurrency.test(collectPredictionWorkflow) &&
    sharedWriterConcurrency.test(collectResultWorkflow) &&
    (
      sharedWriterConcurrency.test(learningAnalysisWorkflow) ||
      (
        learningAnalysisWorkflow.includes("contents: read") &&
        !learningAnalysisWorkflow.includes("git push origin main") &&
        collectResultWorkflow.includes(
          "node scripts/build-learning-analysis-pipeline.js"
        )
      )
    ),
  "予想・結果・学習分析のmain書込は同じ排他グループで直列実行してください"
);
const checksOutCurrentMain =
  /uses:\s*actions\/checkout@v4[\s\S]{0,160}?\n\s+ref:\s*main/;
assert(
  checksOutCurrentMain.test(collectPredictionWorkflow) &&
    checksOutCurrentMain.test(collectResultWorkflow) &&
    checksOutCurrentMain.test(learningAnalysisWorkflow),
  "直列化したmain書込処理は実行開始時点の最新mainを取得してください"
);
assert(
  collectPredictionWorkflow.includes(
    "node scripts/build-practical-priority-shadow-report.js"
  ) &&
    collectPredictionWorkflow.includes(
      "node scripts/test-practical-priority-shadow-artifact.js"
    ) &&
    collectPredictionWorkflow.includes(
      "git add data/stats/practical-priority-shadow-report.json"
    ),
  "予想収集直後に順位候補シャドーレポートを再構築・検証・保存してください"
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
  charter.principles
    ?.preserveEvaluatedScenarioCandidatesForEveryBoat === true &&
    charter.principles
      ?.candidateGenerationPrecedesTicketLimit === true &&
    charter.principles
      ?.excludedCandidatesRequireStructuredReason === true,
  "評価済み展開の全艇共通保護または除外理由の保存が無効です"
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
const groundedFlow = practical.groundedFlow || {};
assert(
  practical.standard === 5 &&
    practical.normalMaximum === 7 &&
    practical.maximum === 10,
  "実戦厳選は基本5点・通常最大7点・成立展開時最大10点でなければなりません"
);
assert(
  allocation.main === 3 &&
    allocation.cover === 2 &&
    allocation.flow === 2 &&
    allocation.longshot === 1,
  "実戦厳選の配分上限が本線3・押さえ2・フォーメーション由来2・穴1ではありません"
);
assert(
  groundedFlow.ticketCount === 2 &&
    groundedFlow.internalSourceCategory === "flow" &&
    groundedFlow.displayLabel ===
      "フォーメーション" &&
    groundedFlow.mustNotDisplayAsFlow === true &&
    groundedFlow.atomicSelection === true &&
    groundedFlow.requiresSameScenario === true &&
    groundedFlow.requiresSameFirstSecondAnchor === true &&
    groundedFlow.minimumRoleScore === 65 &&
    groundedFlow.mutuallyExclusiveWithNormalLongshot === true,
  "フォーメーション表示と同一展開・同一1着2着軸・65点・穴排他契約が固定されていません"
);
assert(
  practical.scenarioExpansion?.enabled === true &&
    practical.scenarioExpansion
      ?.requiresStructuredEvidence === true &&
    practical.scenarioExpansion
      ?.minimumRoleScore === 65 &&
    practical.scenarioExpansion
      ?.candidateRequirementDoesNotImplyPurchase === true &&
    practical.scenarioExpansion
      ?.categoryScopedPresentation === true &&
    practical.scenarioExpansion?.fillsToMaximum === false &&
    practical.scenarioExpansion
      ?.preservesCandidatePool === true &&
    practical.scenarioExpansion
      ?.requiresExclusionReason === true,
  "8〜10点目の展開追加条件が固定されていません"
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
    exhibitionPerformance.fullModeRequiresLapBoats === 6 &&
    exhibitionPerformance.lapTimeSourcePolicy ===
      "venue-official-original-exhibition-only",
  "展示モードの6艇成立条件が固定されていません"
);
assert(
  exhibitionPerformance.exhibitionStBelongsTo === "ST・スリット" &&
    exhibitionPerformance.doubleTimeAndNewSamAreIntegrated === true &&
    exhibitionPerformance.mayAdjustRolesOrFinishingCandidatesSeparately === false,
  "展示ST・ダブルタイム・新サムの二重加点防止が無効です"
);

const shadowV2 = charter.shadowSelectionV2 || {};
const expectedNormalWeights = {
  flow: 30,
  course: 20,
  stSlit: 15,
  exhibition: 12,
  holdPickup: 9,
  localWater: 7,
  skill: 4,
  motor: 3
};
const expectedNewEngineWeights = {
  flow: 30,
  course: 20,
  stSlit: 16,
  exhibition: 14,
  holdPickup: 9,
  localWater: 7,
  skill: 3,
  motor: 1
};
assert(
  shadowV2.enabled === true &&
    shadowV2.mode === "active_selection" &&
    shadowV2.cutoffSeconds === 120,
  "自動選定V2は締切2分前までの完全データで稼働しなければなりません"
);
assert(
  shadowV2.drivesAutomaticSelection === true &&
    shadowV2.selectionScoreSource ===
      "shadowSelectionV2.evaluation.totalScore" &&
    shadowV2.selectionThreshold === 60 &&
    shadowV2.requiresCalibrationEligible === true &&
    shadowV2.legacyEvaluationUsage === "audit_only" &&
    shadowV2.onV2Unavailable ===
      "skip_without_legacy_fallback",
  "自動選定V2と60点判定の接続条件が固定されていません"
);
assert(
  shadowV2.doesNotAffectTicketComposition === true &&
    shadowV2.doesNotAffectNoteContentRules === true &&
    shadowV2.doesNotPublishNoteAutomatically === true,
  "自動選定V2が買い目構成またはnote内容・公開規則を変更しています"
);
assert(
  shadowV2.oddsUsedForScore === false &&
    shadowV2.officialResultUsedForScore === false,
  "自動選定V2の採点へオッズまたは公式結果を混在できる設定です"
);
assert(
  JSON.stringify(shadowV2.priority) ===
    JSON.stringify(expectedPriority),
  "自動選定V2の8項目順が憲章と一致しません"
);
assert(
  JSON.stringify(shadowV2.weights?.normal) ===
    JSON.stringify(expectedNormalWeights) &&
    JSON.stringify(shadowV2.weights?.newEngine) ===
    JSON.stringify(expectedNewEngineWeights),
  "自動選定V2の通常・新エンジン配点が承認値と一致しません"
);
assert(
  Object.values(shadowV2.weights?.normal || {})
    .reduce((sum, value) => sum + value, 0) === 100 &&
    Object.values(shadowV2.weights?.newEngine || {})
      .reduce((sum, value) => sum + value, 0) === 100,
  "自動選定V2の配点合計が100ではありません"
);
assert(
  [
    "entries",
    "officialCourses",
    "averageST",
    "exhibitionST",
    "exhibitionTime",
    "skill",
    "motor"
  ].every(key => shadowV2.requiredData?.[key] === 6) &&
    shadowV2.requiredData?.windDirection === true &&
    shadowV2.requiredData?.windSpeed === true &&
    shadowV2.requiredData?.waveHeight === true &&
    shadowV2.requiredData?.liveTideWhenTidal === true,
  "自動選定V2の完全データ条件が不足しています"
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
const improvementReviewPolicy =
  charter.automation
    ?.improvementReview || {};
assert(
  improvementReviewPolicy.windowSize === 100 &&
    improvementReviewPolicy.population ===
      "same_generation_completed_auto_selected" &&
    improvementReviewPolicy.shadowCountsTowardWindow === false &&
    improvementReviewPolicy.legacyCountsTowardWindow === false &&
    improvementReviewPolicy.minimumRoleSchemaVersion === 1 &&
    improvementReviewPolicy.minimumTheorySchemaVersion === 1 &&
    improvementReviewPolicy.requiresPreRaceRoleAttribution === true &&
    improvementReviewPolicy.requiresPreRaceTheoryAttribution === true &&
    improvementReviewPolicy.retroactiveTheoryAttribution === false,
  "100R改善レビューの母集団が固定されていません"
);
assert(
  improvementReviewPolicy.automaticApplication === false &&
    improvementReviewPolicy.approvalDoesNotApplyChange === true &&
    improvementReviewPolicy.applicationRequiresSeparatePullRequest === true &&
    improvementReviewPolicy.applicationRequiresNewGeneration === true,
  "改善提案と実装の二重ロックが固定されていません"
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
const practicalPriorityShadow =
  read("js/practical-priority-shadow.js");
const evaluatedScenarioCandidates =
  read("js/evaluated-scenario-candidates.js");
const predictionRuntimeLoader =
  read("js/prediction-runtime-loader.js");
const shadowSelectionV2 = read("js/shadow-selection-v2.js");
const collectPredictions = read("scripts/collect-predictions.js");
const improvementReview =
  read("js/improvement-review.js");
const improvementReviewBuilder =
  read(
    "scripts/build-improvement-review.js"
  );

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
    practicalSelection.includes("const FLOW_GROUP_COUNT = 2;") &&
    practicalSelection.includes(
      "フォーメーション"
    ) &&
    practicalSelection.includes(
      "displayCategory:"
    ) &&
    render.includes(
      "フォーメーション"
    ) &&
    practicalSelection.includes("const MINIMUM_FLOW_ROLE_SCORE = 65;") &&
    practicalSelection.includes("function selectGroundedFlowPair()") &&
    practicalSelection.includes("scenarioIds.length === 1") &&
    practicalSelection.includes("`${boats[0]}-${boats[1]}`") &&
    /secondScore\s*<\s*MINIMUM_FLOW_ROLE_SCORE\s*\|\|\s*thirdScore\s*<\s*MINIMUM_FLOW_ROLE_SCORE/.test(
      practicalSelection
    ) &&
    /pair\.length\s*!==\s*FLOW_GROUP_COUNT/.test(
      practicalSelection
    ) &&
    /groundedFlowPair\.length\s*!==\s*FLOW_GROUP_COUNT\s*&&\s*evidence\.longshot/.test(
      practicalSelection
    ) &&
    practicalSelection.includes("lists.longshot,") &&
    practicalSelection.includes("const NORMAL_MAXIMUM_COUNT = 7;") &&
    practicalSelection.includes("const MAXIMUM_COUNT = 10;") &&
    practicalSelection.includes("lists.possibility") &&
    practicalSelection.includes("requireActionableRole") &&
    practicalSelection.includes("rawExpansionCandidates") &&
    practicalSelection.includes("\"独立展開\"") &&
    practicalSelection.includes("row.purchaseEligible") &&
    practicalSelection.includes("excludedCandidates") &&
    practicalSelection.includes("INDEPENDENT_SCENARIO") &&
    practicalSelection.includes("CANDIDATE_ONLY_EVALUATION"),
  "実戦厳選の実装配分が憲章と一致しません"
);
assert(
  practicalSelection.includes("主軸となる展開が定まらないため見送り。"),
  "note原稿に本線不成立時の見送りがありません"
);
const priorityShadowCharter =
  charter.practicalPriorityProspectiveShadow || {};
assert(
  priorityShadowCharter.enabled === true &&
    priorityShadowCharter.startDate === "20260813" &&
    priorityShadowCharter.targetReplacementCount === 100 &&
    priorityShadowCharter.fixedEndpoint === true &&
    priorityShadowCharter.earlyStoppingAllowed === false &&
    priorityShadowCharter.candidateReasonCode ===
      "CANDIDATE_ONLY_EVALUATION" &&
    priorityShadowCharter.firstFormationBranch ===
      "formation:flow" &&
    priorityShadowCharter.headBoatNo === 1 &&
    JSON.stringify(priorityShadowCharter.structuredRoles) ===
      JSON.stringify(["head", "hold", "pickup"]) &&
    priorityShadowCharter.priorityScoreExclusiveMinimum === 90 &&
    priorityShadowCharter.sourceSelectionFingerprint ===
      "evaluated-scenarios-v1|internal-score-v1|practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5-coursefailclosed1" &&
    priorityShadowCharter.replacementMode ===
      "same-index-one-for-one" &&
    priorityShadowCharter.voidHandling ===
      "resolved-neutral-kept-in-fixed-cohort" &&
    priorityShadowCharter.settledPayoutPolicy ===
      "positive-official-payout-required" &&
    priorityShadowCharter.minimumDiscordantCount === 6 &&
    priorityShadowCharter.maximumLossCount === 1 &&
    priorityShadowCharter.maximumOneSidedPValue === 0.05 &&
    priorityShadowCharter.conditionsMayChangeDuringCohort === false &&
    priorityShadowCharter.requiresHumanApproval === true &&
    priorityShadowCharter.automaticApplication === false &&
    priorityShadowCharter.usableForPrediction === false,
  "順位候補の事前登録シャドー条件が憲章と一致しません"
);
assert(
  (() => {
    const report = practicalPriorityShadowReportApi.build([]);
    return (
      report.contract.fixedEndpoint === true &&
      report.contract.earlyStoppingAllowed === false &&
      report.contract.conditionsMayChangeDuringCohort === false &&
      report.contract.voidHandling ===
        "resolved-neutral-kept-in-fixed-cohort" &&
      report.contract.settledPayoutPolicy ===
        "positive-official-payout-required" &&
      report.requiresHumanApproval === true &&
      report.automaticApplication === false &&
      report.usableForPrediction === false
    );
  })() &&
  practicalPriorityShadow.includes(
    "prospective-shadow-only"
  ) &&
    practicalPriorityShadow.includes(
      "candidate-priority-strictly-greater"
    ) &&
    practicalPriorityShadow.includes(
      "automaticApplication: false"
    ) &&
    practicalPriorityShadow.includes(
      "usableForPrediction: false"
    ) &&
    collectPredictions.includes(
      "practicalPriorityShadowSnapshot"
    ),
  "順位候補のシャドー保存・固定終了点・承認ゲートが不足しています"
);
assert(
  evaluatedScenarioCandidates.includes("MARK_DEFINITIONS") &&
    evaluatedScenarioCandidates.includes("candidatePool") &&
    evaluatedScenarioCandidates.includes("physicalCoverage") &&
    evaluatedScenarioCandidates.includes("independent-scenario") &&
    !evaluatedScenarioCandidates.includes("fourContinuation") &&
    !evaluatedScenarioCandidates.includes("threeAttackBoatNo"),
  "評価済み展開の候補生成が全艇共通処理になっていません"
);
assert(
  predictionRuntimeLoader.indexOf(
    "\"js/evaluated-scenario-candidates.js\""
  ) <
    predictionRuntimeLoader.indexOf("\"js/ai-core.js\""),
  "評価済み展開候補をAIコアより先に読み込んでいません"
);
assert(
  script.includes("practicalSelectionAudit") &&
    script.includes(".compactAudit?.(") &&
    script.includes("flowAnchor:") &&
    script.includes("scenarioId:") &&
    script.includes("flowCommonReason:") &&
    script.includes("flowRoleEvidence:") &&
    practicalSelection.includes(
      "function compactAudit"
    ) &&
    practicalSelection.includes(
      "targetDecisions:"
    ) &&
    practicalSelection.includes(
      "excludedIndependentCandidates:"
    ) &&
    collectPredictions.includes(
      "compactPracticalSelection"
    ),
  "評価艇・買い目・非採用理由をブラウザと自動保存へ残していません"
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
assert(
  collectPredictions.includes(
    "charter?.shadowSelectionV2?.selectionThreshold"
  ) &&
    collectPredictions.includes("shadowV2Predictions") &&
    collectPredictions.includes("buildActiveV2Comparison") &&
    collectPredictions.includes("calibrationEligible === true") &&
    shadowSelectionV2.includes(
      "校正対象として成立した総合点だけを60点の自動選定へ使う"
    ),
  "自動選定V2の有効スコアと60点判定の接続が固定されていません"
);
assert(
  improvementReview.includes(
    "const REVIEW_SIZE = 100;"
  ) &&
    improvementReview.includes(
      "applicationLock: true"
    ) &&
    improvementReview.includes(
      "automaticApplication:"
    ) &&
    improvementReviewBuilder.includes(
      "improvement-review.json"
    ) &&
    !collectPredictions.includes(
      "improvement-review.json"
    ),
  "100R改善レビューが提案専用の独立経路になっていません"
);

if (failures.length) {
  console.error("チャッピーAI憲章チェック: 失敗");
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log("チャッピーAI憲章チェック: 合格");
console.log(`- 優先順位: ${expectedPriority.join(" → ")}`);
console.log("- 実戦厳選: 基本5点・通常5〜7点・成立展開時最大10点");
console.log("- フォーメーション: 同一1着・2着軸の根拠付き3連単2券を一組で採用（通常穴と排他）");
console.log("- 同意なしの予想ロジック変更: 禁止");
