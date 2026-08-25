"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const listeners = new Map();
const resultArea = {
  innerHTML: ""
};
const raceInfoArea = {
  innerHTML: ""
};
const calibrationElements = [];
const calibrationInputs = [];
let practicalMode = "selected";
let practicalSelectCalls = 0;
const longScenarioReason =
  `${"長い展開根拠を全文で確認する。".repeat(10)}` +
  "【長文末尾保持】";
const emojiBoundaryComment =
  `${"あ".repeat(59)}🛟` +
  "絵文字の後ろも全文で確認する。【絵文字末尾保持】";
const candidateReason =
  `${"候補比較の根拠を省略せず確認する。".repeat(9)}` +
  "【候補理由末尾保持】";
const manshuSpecificReason =
  `${"万舟固有の成立経路を確認する。".repeat(9)}` +
  "【万舟固有理由末尾】";
const flowCommonReason =
  "1号艇のイン逃げを1着軸に、3号艇の2着残しを固定。";
const flowThirdFourReason =
  "4号艇はまくり差し後の3着残りを評価して採用。";
const flowThirdFiveReason =
  "5号艇は外から伸びて3着へ届く経路を評価して採用。";
const rankingSpecificReason =
  `${"順位固有の比較根拠を確認する。".repeat(9)}` +
  "【ランキング固有理由末尾】";
const boatSpecificComment =
  `${"艇固有の評価コメントを全文で確認する。".repeat(10)}` +
  "【艇コメント末尾保持】";

global.window = global;
global.CHAPPY_RENDER_TEST_HOOKS = true;
global.window.addEventListener = (
  name,
  listener
) => {
  listeners.set(name, listener);
};
global.document = {
  body: resultArea,
  getElementById(id) {
    if (id === "resultArea") {
      return resultArea;
    }
    if (id === "raceInfoArea") {
      return raceInfoArea;
    }
    return null;
  },
  querySelectorAll() {
    return calibrationElements;
  }
};
global.ChappyPredictionCalibration = {
  generationKey() {
    return "generation-v1";
  },
  displayFor(input) {
    calibrationInputs.push(input);
    if (
      input.isRetrospective ===
        true ||
      input.predictionMode ===
        "retrospective_reference"
    ) {
      return {
        status: "unavailable",
        sampleSize: 0,
        rate: null,
        interval: null,
        message:
          "振り返り予想のため校正対象外です。"
      };
    }
    return {
      status: "collecting",
      sampleSize: 0,
      rate: null,
      interval: null,
      message:
        "同一世代・80〜89点の確定結果を収集中です（0/30件）。"
    };
  }
};
global.ChappyPracticalSelection = {
  select() {
    practicalSelectCalls += 1;
    const selectedResult = {
      status: "selected",
      maximumCount: 10,
      evidence: {
        evaluatedTargets: [{
          id: "mark-4",
          evaluation: {
            score: 76
          }
        }]
      },
      tickets: [{
        ticket: "1-2-3",
        category: "本線",
        scenarioType:
          "canonical-formation"
      }, {
        ticket: "1-3-2",
        category: "本線"
      }, {
        ticket: "1-2-4",
        category: "本線"
      }, {
        ticket: "2-1-3",
        category: "押さえ"
      }, {
        ticket: "3-1-2",
        category: "押さえ"
      }, {
        ticket: "1-3-4",
        category: "流し",
        displayCategory:
          "フォーメーション",
        scenarioId:
          "canonical:1",
        flowAnchor: "1-3",
        flowCommonReason,
        flowSecondScore: 78,
        flowThirdScore: 76,
        flowRoleEvidence: [{
          position: 2,
          boatNo: 3,
          role: "hold",
          score: 78,
          reason:
            "3号艇の2着残し根拠"
        }, {
          position: 3,
          boatNo: 4,
          role: "hold",
          score: 76,
          reason:
            "4号艇の3着残り根拠"
        }],
        scenarioSummary:
          flowThirdFourReason
      }, {
        ticket: "1-3-5",
        category: "流し",
        displayCategory:
          "フォーメーション",
        scenarioId:
          "canonical:1",
        flowAnchor: "1-3",
        flowCommonReason,
        flowSecondScore: 78,
        flowThirdScore: 75,
        flowRoleEvidence: [{
          position: 2,
          boatNo: 3,
          role: "hold",
          score: 78,
          reason:
            "3号艇の2着残し根拠"
        }, {
          position: 3,
          boatNo: 5,
          role: "pickup",
          score: 75,
          reason:
            "5号艇の3着拾い根拠"
        }],
        scenarioSummary:
          flowThirdFiveReason
      }, {
        ticket: "3-4-1",
        category: "独立展開",
        displayCategory: "流し",
        selectionTier: "展開追加",
        priorityScore: 72,
        comment:
          "流し候補として保存された旧表示。" +
          longScenarioReason,
        roleLabels: [{
          boatNo: 3,
          position: 1,
          role: "head",
          label: "1着軸",
          structured: true
        }, {
          boatNo: 4,
          position: 2,
          role: "hold",
          label: "2着残し",
          structured: true
        }]
      }],
      targetDecisions: [{
        evaluationId: "mark-4",
        boatNo: 4,
        symbol: "△",
        candidateDecisions: [{
          ticket: "3-4-1",
          ticketSelected: true,
          relation: "structured",
          reason:
            candidateReason,
          roleLabels: [{
            boatNo: 4,
            position: 2,
            role: "hold",
            label: "2着残し",
            structured: true
          }]
        }, {
          ticket: "4-3-1",
          ticketSelected: false,
          relation: "physical-only",
          reason:
            "4号艇頭の構造化根拠がなく比較で非採用",
          roleLabels: [{
            boatNo: 4,
            position: 1,
            role: "position",
            label: "1着候補",
            structured: false
          }]
        }]
      }],
      expansionSummary: {
        normalCount: 7,
        addedCount: 1,
        finalCount: 8,
        hasIndependentAdditions: true,
        exceededNormalMaximum: true,
        reason:
          "時系列と艇・着順・役割が一致した独立展開だけを追加。",
        addedTickets: [{
          ticket: "3-4-1",
          priorityScore: 72
        }]
      },
      verificationEvidence: {
        generation: {
          logicFingerprint:
            "evaluated-scenarios-v1",
          confidenceDefinitionVersion:
            "internal-score-v1",
          ticketPolicyVersion:
            "practical-5-7-10-v1"
        }
      }
    };

    if (practicalMode === "selected") {
      return selectedResult;
    }

    return {
      status: "skipped",
      reason:
        "主軸となる展開が定まらないため見送り。",
      maximumCount: 10,
      evidence:
        selectedResult.evidence,
      tickets: [],
      targetDecisions: [{
        evaluationId: "mark-4",
        boatNo: 4,
        symbol: "△",
        candidateCount: 1,
        selectedCandidateCount: 0,
        excludedCandidateCount: 1,
        hiddenCandidateCount: 0,
        candidateDecisions: [{
          ticket: "3-4-1",
          ticketSelected: false,
          relation: "structured",
          reasonCode: "RACE_SKIPPED",
          reason:
            "主軸となる展開が定まらないため見送り。",
          roleLabels: [{
            boatNo: 4,
            position: 2,
            role: "hold",
            label: "2着残し",
            structured: true
          }]
        }]
      }]
    };
  }
};

require("../js/boat-identity");
require("../js/ai-core");
require("../js/render");
require("../js/main-cover-display-boundary");

const actualCourseData = {
  entries: [1, 2, 3, 4, 5, 6].map(boat => ({
    boat,
    racerName: `${boat}号艇`
  })),
  startExhibition: [1, 2, 3, 4, 5, 6].map(boat => ({
    boat,
    course: {
      1: 6,
      2: 2,
      3: 1,
      4: 4,
      5: 5,
      6: 3
    }[boat],
    isOfficialCourse: true,
    mappingSource: "official-start-image"
  }))
};
const mappedTicketComment =
  global.ChappyRenderTestHooks
    .createTicketSpecificComment(
      {
        race: { raw: actualCourseData },
        raceFlow: {
          attackBoats: [{ boatNo: 6, course: 3 }],
          holdBoats: [
            { boatNo: 3, course: 1 },
            { boatNo: 4, course: 4 }
          ]
        },
        mainSheet: { honmei: { boatNo: 6 } }
      },
      "6-3-4",
      ["本線"]
    );
assert.match(mappedTicketComment, /6号艇の3コース攻めを頭/);
assert.match(mappedTicketComment, /3号艇のイン残しを2着/);
assert.match(mappedTicketComment, /4号艇の4残しを3着/);

const storedMappedTicketComment =
  global.ChappyRenderTestHooks
    .createTicketSpecificComment(
      {
        preRaceConditions: actualCourseData,
        raceFlow: {
          attackBoats: [{ boatNo: 6, course: 6 }],
          holdBoats: [
            { boatNo: 3, course: 3 },
            { boatNo: 4, course: 4 }
          ]
        },
        mainSheet: { honmei: { boatNo: 6 } }
      },
      "6-3-4",
      ["本線"]
    );
assert.equal(
  storedMappedTicketComment,
  mappedTicketComment,
  "保存済みpreRaceConditionsからも公式進入の買い目説明を復元する"
);

const identityTicketComment =
  global.ChappyRenderTestHooks
    .createTicketSpecificComment(
      {
        raceFlow: {
          attackBoats: [{ boatNo: 3, course: 3 }],
          holdBoats: [{ boatNo: 1, course: 1 }]
        },
        mainSheet: { honmei: { boatNo: 3 } }
      },
      "3-1-4",
      ["本線"]
    );
assert.equal(
  identityTicketComment,
  "3号艇の3コース攻めを頭に、1号艇のイン残しを2着、4号艇の4残しを3着に置く本線。",
  "枠なり時の既存買い目説明を維持する"
);

const partialCourseComment =
  global.ChappyRenderTestHooks
    .createTicketSpecificComment(
      {
        race: {
          raw: {
            ...actualCourseData,
            startExhibition:
              actualCourseData
                .startExhibition
                .slice(0, 5)
          }
        },
        raceFlow: {
          holdBoats: [{
            boatNo: 4,
            course: 1
          }]
        }
      },
      "4-1-2",
      ["押さえ"]
    );
assert.match(
  partialCourseComment,
  /4号艇の4残しを頭/,
  "公式6艇写像が欠ける時は部分コース表示を使わない"
);

const legacyRankingHtml =
  global.ChappyRenderTestHooks
    .renderTicketRanking({
      mainSheet: {
        flowFormations: [{
          headBoatNo: 1,
          secondBoatNos: [3],
          notation: "1-3-全",
          pointCount: 4,
          scenarioType: "流し展開",
          reason:
            "旧保存の流し候補を表示する。"
        }]
      },
      aiTicketList: []
    });
assert.match(
  legacyRankingHtml,
  /フォーメーション/,
  "旧形式の候補一覧もフォーメーション表示へ正規化する"
);
assert.doesNotMatch(
  legacyRankingHtml,
  /流し|2連単/,
  "通常描画外の旧候補一覧にも禁則語を残さない"
);
assert.equal(
  global.ChappyRenderTestHooks
    .practicalDisplayCategory({
      category: "候補補完",
      displayCategory: "流し"
    }),
  "候補補完",
  "Tierを省略した旧summaryも最終分類を優先する"
);

global.renderAll({
  boatEvaluation: {
    honmei: {
      no: 1,
      name: "全文確認艇",
      role: "逃げ軸",
      buffs: [
        "コース評価",
        "展示気配"
      ],
      comment:
        boatSpecificComment
    }
  },
  mainSheet: {
    tickets: [{
      ticket: "1-2-3",
      category: "本線",
      odds: 12.4,
      oddsText:
        "12.4倍（最終取得）",
      oddsSource:
        "boatrace-official-snapshot",
      isFinalRetrievedOdds: true,
      scenarioSummary:
        longScenarioReason
    }],
    flowTickets: [
      {
        ticket: "1-3-4",
        category: "流し",
        odds: 31.6,
        oddsText:
          "31.6倍（最終取得）",
        oddsSource:
          "boatrace-official-snapshot",
        isFinalRetrievedOdds: true
      },
      {
        ticket: "1-3-5",
        category: "流し",
        odds: 44.2,
        oddsText:
          "44.2倍（最終取得）",
        oddsSource:
          "boatrace-official-snapshot",
        isFinalRetrievedOdds: true
      }
    ],
    flowFormations: [{
      headBoatNo: 1,
      secondBoatNos: [3],
      thirdMode: "all",
      notation: "1-3-全",
      pointCount: 4,
      expandedTickets: [
        "1-3-2",
        "1-3-4",
        "1-3-5",
        "1-3-6"
      ],
      scenarioType: "escape",
      reason: "1逃げから3号艇を2着にして3着全艇へ流す。"
    }]
  },
  manshuSheet: {
    tickets: [{
      ticket: "4-5-6",
      category: "万舟",
      reason:
        manshuSpecificReason
    }]
  },
  combinedOdds: {
    categories: {
      flow: {
        totalCount: 6,
        availableCount: 6,
        isFormal: true,
        combinedOdds: 9.9
      }
    }
  },
  aiTicketList: [{
    ticket: "5-4-3",
    category: "穴候補"
  }, {
    ticket: "1-3-4",
    category: "流し"
  }, {
    ticket: "1-3-5",
    category: "流し"
  }],
  ticketRanks: [{
    ticket: "5-4-3",
    comment:
      rankingSpecificReason
  }],
  missingNumbersData: {
    available: true,
    windowStartDate: "20260704",
    dataThroughDate: "20260802",
    top30: [{
      rank: 1,
      ticket: "6-4-5",
      recentOccurrences: 0,
      missingDays: 679,
      missingDaysLowerBound: false,
      label: "3年未出"
    }, {
      rank: 2,
      ticket: "6-5-4",
      recentOccurrences: 0,
      missingDays: 489,
      missingDaysLowerBound: true,
      label: "489日以上未出"
    }]
  },
  simpleEvaluation: {
    mode: "main",
    label: "本線信頼度",
    level: "高",
    score: 82,
    mainComment:
      emojiBoundaryComment
  }
});

const html = resultArea.innerHTML;
const practicalSection =
  html.match(
    /v3-practical-section[\s\S]*?<h3>買い目採用判定<\/h3>/
  )?.[0] || "";
const accordionTag = type =>
  html.match(
    new RegExp(
      `<details[^>]*class="[^"]*v3-ticket-accordion-${type}[^"]*"[^>]*>`
    )
  )?.[0] || "";
const meterCount =
  (
    html.match(
      /class="v3-ai-meter"/g
    ) || []
  ).length;

assert.equal(
  meterCount,
  1,
  "AI総合は内部評価を1種類だけ表示する"
);
assert.match(
  html,
  /本線信頼度（内部指数）/
);
assert.match(html, /82点/);
assert.doesNotMatch(
  html,
  /万舟期待度/
);
assert.match(
  html,
  /内部指数は予想同士を比較する評価点で、的中確率ではありません/
);
assert.match(
  html,
  /8〜10点へ拡張/
);
assert.match(
  html,
  /通常7点[\s\S]*＋独立1点[\s\S]*＝8点/
);
assert.match(
  html,
  /採用優先度 72（内部比較値）/
);
assert.doesNotMatch(
  html,
  /3-4-1・72点/,
  "候補選定の優先度を確率やAI総合指数のように表示しない"
);
assert.match(
  html,
  /買い目採用判定/
);
assert.match(
  html,
  /評価根拠で採用/
);
assert.match(
  html,
  /候補保持・非採用/
);
assert.match(
  html,
  /2着残し/
);
assert.match(
  html,
  /別根拠/
);
assert.equal(
  calibrationInputs[0].mode,
  "main",
  "校正表示へ本線・波乱の評価modeを渡す"
);
assert.deepEqual(
  calibrationInputs[0]
    .generation,
  {
    logicFingerprint:
      "evaluated-scenarios-v1",
    confidenceDefinitionVersion:
      "internal-score-v1",
    ticketPolicyVersion:
      "practical-5-7-10-v1"
  },
  "事前注入なしでも選定結果の世代IDを校正表示へ渡す"
);
assert.equal(
  practicalSelectCalls,
  1,
  "同じ描画内で実戦選定を再計算しない"
);
assert.match(
  html,
  /data-calibration-mode="main"/
);
assert.match(
  html,
  /data-calibration-retrospective="false"/
);
assert.match(
  html,
  /【長文末尾保持】/,
  "90文字を超える展開説明を末尾まで表示する"
);
assert.match(
  html,
  /12\.4倍（最終取得）/,
  "最終取得オッズの表示ラベルを数値だけへ戻さない"
);
assert.match(
  html,
  /v3-ticket-accordion-main[\s\S]{0,400}3点/,
  "通常欄の本線summaryをformal selectionの3点にする"
);
assert.match(
  html,
  /v3-ticket-accordion-safety[\s\S]{0,400}2点/,
  "通常欄の押さえsummaryをformal selectionの2点にする"
);
assert.match(
  accordionTag("main"),
  /\bopen\b/,
  "従来どおり本命accordionだけを初期表示で開く"
);
assert.doesNotMatch(
  accordionTag("safety"),
  /\bopen\b/,
  "押さえaccordionの初期折りたたみを保つ"
);
assert.doesNotMatch(
  accordionTag("flow"),
  /\bopen\b/,
  "フォーメーション2券でもaccordionの初期折りたたみを保つ"
);
assert.match(
  html,
  /v3-ticket-accordion-flow[\s\S]{0,300}<span>フォーメーション<\/span>/,
  "同一1着軸の2券を正式な流しと呼ばず、約束した表示名を使う"
);
assert.doesNotMatch(
  html,
  /v3-ticket-accordion-flow[\s\S]{0,300}<span>流し<\/span>|<h3>\s*流し\s*<\/h3>/,
  "同一1着軸の2券を通常表示で流しと呼ばない"
);
assert.match(
  practicalSection,
  />フォーメーション<\/span>/,
  "実戦厳選カードもフォーメーション表示を使う"
);
assert.match(
  practicalSection,
  /v3-formation-row-main[\s\S]{0,800}<span class="v3-tag v3-tag-flow">フォーメーション<\/span>/,
  "内部scenario種別を利用者向け表示へ変換する"
);
assert.doesNotMatch(
  practicalSection,
  /canonical-formation/,
  "内部scenario種別を画面へ露出しない"
);
assert.doesNotMatch(
  practicalSection,
  /流し|2連単/,
  "旧保存行を含む実戦厳選カードへ禁則語を出さない"
);
assert.match(
  practicalSection,
  /<span class="v3-tag v3-tag-flow">独立展開<\/span>/,
  "旧保存の表示名より選択後の独立展開ラベルを優先する"
);
assert.match(
  html,
  /🛟絵文字の後ろも全文で確認する。【絵文字末尾保持】/,
  "UTF-16境界の絵文字と後続文を分断しない"
);
assert.doesNotMatch(
  html,
  /\uFFFD/,
  "説明文へ壊れた代替文字を混入させない"
);
assert.match(
  html,
  /【候補理由末尾保持】/,
  "候補比較理由を120文字で切らない"
);
assert.doesNotMatch(
  html,
  /【万舟固有理由末尾】/,
  "formal selectionで非採用の万舟候補を通常欄へ戻さない"
);
assert.doesNotMatch(
  html,
  /AI買い目一覧/,
  "本命・押さえ・フォーメーション・万舟と重複するAI買い目一覧を表示しない"
);
assert.match(
  html,
  /【艇コメント末尾保持】/,
  "役割・buffと併存する艇コメントも末尾まで表示する"
);
const exactFlowRows =
  html.match(
    /data-flow-notation="[^"]+"/g
  ) || [];
assert.equal(
  exactFlowRows.length,
  2,
  "通常欄のフォーメーションはformal selectionのexact 2券だけを表示する"
);
assert.deepEqual(
  exactFlowRows,
  [
    'data-flow-notation="1-3-4"',
    'data-flow-notation="1-3-5"'
  ],
  "同じ1-3軸のフォーメーション2券を選定順で表示する"
);
assert.match(
  html,
  /v3-ticket-accordion-flow[\s\S]{0,400}2点/,
  "formationの物理4点でなくformal selectionの2点をsummaryへ表示する"
);
assert.doesNotMatch(
  html,
  /data-flow-notation="[^"]*-全"|\d+\s*→\s*\d+\s*→\s*全/,
  "通常欄へ候補formationの全流しを戻さない"
);
assert.equal(
  html.split(flowCommonReason).length - 1,
  1,
  "同一軸2券の共通根拠はフォーメーションaccordionの狙いに1回だけ表示する"
);
assert.match(
  html,
  new RegExp(flowThirdFourReason),
  "4号艇を3着に採用した券別根拠を表示する"
);
assert.match(
  html,
  new RegExp(flowThirdFiveReason),
  "5号艇を3着に採用した券別根拠を表示する"
);
assert.match(
  html,
  /31\.6倍（最終取得）/,
  "1-3-4の最終取得オッズを保持する"
);
assert.match(
  html,
  /44\.2倍（最終取得）/,
  "1-3-5の異なる最終取得オッズを保持する"
);
assert.doesNotMatch(
  html,
  /合成 9\.9倍|取得 6\/6/,
  "候補プール由来の合成オッズをexact 2券へ表示しない"
);

const missingSection =
  html.match(
    /<section class="v3-section v3-missing-numbers">[\s\S]*?<\/section>/
  )?.[0] || "";
assert.match(
  missingSection,
  /679日未出/,
  "30日を超えた実日数を丸めず表示する"
);
assert.match(
  missingSection,
  /489日以上未出/,
  "連続確認範囲より前は下限日数で表示する"
);
assert.doesNotMatch(
  missingSection,
  /(?:オッズ|倍|3年|直近1年)/,
  "出てない目にはオッズ・旧期間率を表示しない"
);

assert.equal(
  typeof listeners.get(
    "chappy:prediction-calibration-loaded"
  ),
  "function",
  "校正JSONの遅延読込後に表示を更新できる"
);
assert.equal(
  typeof listeners.get(
    "chappy:prediction-calibration-unavailable"
  ),
  "function",
  "校正JSONの取得失敗後にunavailable表示へ更新できる"
);
assert.equal(
  typeof listeners.get(
    "chappy:prediction-runtime-optional-unavailable"
  ),
  "function",
  "任意校正モジュールの取得失敗後にunavailable表示へ更新できる"
);

const calibrationApi =
  global
    .ChappyPredictionCalibration;
delete global
  .ChappyPredictionCalibration;
const unavailableMessage = {
  textContent:
    "新方式データを蓄積中"
};
const unavailableClasses =
  new Set([
    "is-collecting"
  ]);
const unavailableElement = {
  dataset: {
    calibrationScore: "82",
    calibrationMode: "main",
    calibrationGeneration:
      "generation-v1",
    calibrationRetrospective:
      "false",
    calibrationPredictionMode:
      "server_pre_deadline"
  },
  classList: {
    remove(...names) {
      names.forEach(name =>
        unavailableClasses.delete(
          name
        )
      );
    },
    add(name) {
      unavailableClasses.add(name);
    }
  },
  querySelector(selector) {
    return selector === "strong"
      ? unavailableMessage
      : null;
  }
};
calibrationElements.push(
  unavailableElement
);
listeners.get(
  "chappy:prediction-runtime-optional-unavailable"
)();
assert.equal(
  unavailableElement.dataset
    .calibrationStatus,
  "unavailable"
);
assert.equal(
  unavailableMessage.textContent,
  "実績校正データを取得できません。予想はそのまま確認できます。"
);
assert.ok(
  unavailableClasses.has(
    "is-unavailable"
  )
);
calibrationElements.length = 0;
global.renderAll({
  simpleEvaluation: {
    mode: "main",
    label: "本線信頼度",
    level: "高",
    score: 82,
    mainComment:
      "展開とコースを中心に比較"
  }
});
assert.match(
  resultArea.innerHTML,
  /実績校正データを取得できません/
);
assert.doesNotMatch(
  resultArea.innerHTML,
  /新方式データを蓄積中（0\/30R）/
);
global
  .ChappyPredictionCalibration =
  calibrationApi;

global.renderAll({
  isRetrospective: true,
  predictionMode:
    "retrospective_reference",
  simpleEvaluation: {
    mode: "main",
    label: "本線信頼度",
    level: "高",
    score: 82,
    mainComment:
      "振り返り確認"
  }
});
assert.equal(
  calibrationInputs.at(-1)
    .isRetrospective,
  true
);
assert.equal(
  calibrationInputs.at(-1)
    .predictionMode,
  "retrospective_reference"
);
assert.match(
  resultArea.innerHTML,
  /振り返り予想のため校正対象外/
);
assert.match(
  resultArea.innerHTML,
  /data-calibration-retrospective="true"/
);

practicalMode = "skipped";
global.renderAll({
  simpleEvaluation: {
    mode: "chaos",
    label: "波乱入口",
    level: "高",
    score: 79,
    mainComment:
      "波乱展開を比較"
  }
});
const skippedHtml =
  resultArea.innerHTML;

assert.match(
  skippedHtml,
  /主軸となる展開が定まらないため見送り/
);
assert.match(
  skippedHtml,
  /購入は見送りますが、艇ごとの候補と非採用理由は下に残します/
);
assert.match(
  skippedHtml,
  /買い目採用判定/
);
assert.match(
  skippedHtml,
  /候補保持・非採用/
);
assert.equal(
  calibrationInputs.at(-1).mode,
  "chaos",
  "波乱入口の校正を本線信頼度へ混ぜない"
);

const styleCss = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "style.css"
  ),
  "utf8"
);
const raceTrendReasonRule =
  styleCss.match(
    /\.official-race-trend-reason\s*\{([\s\S]*?)\}/
  );
assert.ok(
  raceTrendReasonRule,
  "公式レース傾向の根拠表示CSSが存在する"
);
assert.doesNotMatch(
  raceTrendReasonRule[1],
  /-webkit-line-clamp|overflow:\s*hidden|display:\s*-webkit-box/,
  "公式レース傾向の根拠をCSSで途中まで隠さない"
);

const ticketReasonRule =
  styleCss.match(
    /\.v3-ticket-inline\s*>\s*\.v3-formation-reason\s*\{([\s\S]*?)\}/
  );
assert.ok(
  ticketReasonRule,
  "AI買い目の説明文を行全体へ配置するCSSが存在する"
);
assert.match(
  ticketReasonRule[1],
  /grid-column:\s*1\s*\/\s*-1/,
  "AI買い目の説明文を暗黙の3列目へ押し出さない"
);
assert.match(
  ticketReasonRule[1],
  /overflow-wrap:\s*anywhere/,
  "AI買い目の長い説明文をカード内で折り返す"
);
assert.doesNotMatch(
  ticketReasonRule[1],
  /white-space:\s*nowrap|overflow:\s*hidden|-webkit-line-clamp|max-height\s*:/,
  "AI買い目の説明文をCSSで途中まで隠さない"
);

console.log(
  "予想透明性UIテスト: 合格"
);
