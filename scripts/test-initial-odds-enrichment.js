"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "js/script.js"),
  "utf8"
);

assert.match(
  source,
  /const ODDS_REQUEST_TIMEOUT_MS = 30000/,
  "本番APIの遅い初回応答にも30秒だけ待ち、予想本体は先に表示する"
);

function functionSource(name) {
  const pattern = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\(`
  );
  const match = pattern.exec(source);

  assert.ok(match, `${name} が存在する`);

  const argsOpen = source.indexOf("(", match.index);
  let argsDepth = 0;
  let argsClose = -1;

  for (let index = argsOpen; index < source.length; index += 1) {
    if (source[index] === "(") argsDepth += 1;
    if (source[index] === ")") argsDepth -= 1;
    if (argsDepth === 0) {
      argsClose = index;
      break;
    }
  }

  assert.ok(argsClose >= 0, `${name} の引数終端が存在する`);
  const open = source.indexOf("{", argsClose);
  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;

    if (depth === 0) {
      return source.slice(match.index, index + 1);
    }
  }

  throw new Error(`${name} の終端を取得できません`);
}

const initialFlow = functionSource("fetchAndRenderRace");
const supplementFlow = functionSource("fetchOddsSupplement");
const reviewSupplementFlow = functionSource(
  "fetchReviewOddsSupplement"
);
const normalizeReviewOddsSource =
  functionSource(
    "normalizeReviewOddsData"
  );
const missingFetchFlow = functionSource("fetchMissingNumbers");
const refreshFlow = functionSource("refreshOddsOnly");
const applyFlow = functionSource("applyOddsSupplement");
const reviewApplyFlow = functionSource(
  "applyReviewOddsSupplement"
);
const applyMissingFlow = functionSource("applyMissingSupplement");
const timeoutFlow = functionSource("fetchWithTimeout");
const enrichSource = functionSource(
  "enrichPredictionWithOdds"
);

const raceStart = initialFlow.indexOf(
  "fetchRaceData(params)"
);
const oddsStart = initialFlow.indexOf(
  "fetchOddsSupplement("
);
const reviewOddsStart = initialFlow.indexOf(
  "fetchReviewOddsSupplement("
);
const firstWait = initialFlow.indexOf(
  "await Promise.all(["
);
const firstWaitEnd = initialFlow.indexOf(
  "]);",
  firstWait
);
const firstWaitSource = initialFlow.slice(
  firstWait,
  firstWaitEnd
);

assert.ok(raceStart >= 0, "初回にレース取得を開始する");
assert.ok(oddsStart >= 0, "初回にオッズ補足取得を開始する");
assert.ok(
  reviewOddsStart >= 0,
  "振り返りでも最終オッズ取得を開始する"
);
assert.ok(
  raceStart < firstWait &&
    oddsStart < firstWait &&
    reviewOddsStart < firstWait,
  "レース・通常オッズ・振り返り最終オッズを同じ待機より前に並行開始する"
);
assert.equal(
  firstWaitSource.includes(
    "oddsSupplementPromise"
  ),
  false,
  "30秒のオッズ通信で初期表示を止めない"
);
assert.match(
  supplementFlow,
  /fetchMissingNumbers\(params\)[\s\S]*fetchOddsData\(params\)[\s\S]*await oddsPromise/,
  "オッズと出てない目を並行開始し、オッズだけを先に反映できる"
);
assert.match(
  missingFetchFlow,
  /\?jcd=\$\{encodeURIComponent\(params\.jcd\)\}[\s\S]*&scope=venue[\s\S]*&date=\$\{encodeURIComponent\(params\.date\)\}/,
  "出てない目は選択場の全Rと予想対象日を明示して取得する"
);
assert.equal(
  missingFetchFlow.includes("params.rno"),
  false,
  "出てない目の順位条件へR番号を混ぜない"
);
assert.equal(supplementFlow.includes("await Promise.all"), false, "出てない目の遅延でオッズ表示を止めない");
assert.match(
  supplementFlow,
  /\.catch\(oddsError[\s\S]*oddsData:\s*null/,
  "初回オッズ失敗は補足情報なしとして扱う"
);
assert.match(
  reviewSupplementFlow,
  /fetchOddsData\(\s*params\s*\)/,
  "振り返りは保存済み最終オッズを返せる共通APIを読む"
);
assert.equal(
  reviewSupplementFlow.includes(
    "fetchMissingNumbers"
  ),
  false,
  "振り返り最終オッズ取得では出てない目APIを呼ばない"
);
assert.match(
  reviewSupplementFlow,
  /normalizeReviewOddsData\(\s*oddsData\s*\)/,
  "振り返りの公式直取得も最終オッズ表示へ正規化する"
);

const reviewNormalizeSandbox = {};
vm.runInNewContext(
  `${normalizeReviewOddsSource}; this.normalizeReviewOddsData = normalizeReviewOddsData;`,
  reviewNormalizeSandbox
);
const completeOfficialByTicket = {};
for (let first = 1; first <= 6; first += 1) {
  for (let second = 1; second <= 6; second += 1) {
    if (second === first) continue;
    for (let third = 1; third <= 6; third += 1) {
      if (third === first || third === second) continue;
      completeOfficialByTicket[`${first}-${second}-${third}`] =
        Number((8 + first + second / 10 + third / 100).toFixed(2));
    }
  }
}
completeOfficialByTicket["1-2-3"] = 9.7;
const directOfficialOdds =
  reviewNormalizeSandbox
    .normalizeReviewOddsData(
      {
        ok: true,
        available: true,
        source: "boatrace-official",
        byTicket:
          completeOfficialByTicket
      },
      "2026-08-09T05:30:00.000Z"
    );
assert.equal(
  directOfficialOdds
    .isFinalRetrievedOdds,
  true,
  "終了直後に公式ページから直接得たオッズも最終取得として扱う"
);
assert.equal(
  directOfficialOdds.savedAt,
  "2026-08-09T05:30:00.000Z",
  "公式直取得に取得時刻を最終オッズ時刻として付ける"
);
assert.equal(
  directOfficialOdds.source,
  "boatrace-official",
  "公式直取得のsourceは書き換えない"
);
const storedOfficialOdds =
  reviewNormalizeSandbox
    .normalizeReviewOddsData(
      {
        ok: true,
        available: true,
        source:
          "boatrace-official-snapshot",
        savedAt:
          "2026-08-09T05:11:00.000Z",
        isFinalRetrievedOdds: true,
        byTicket: {
          ...completeOfficialByTicket,
          "1-2-3": 10.2
        }
      },
      "2026-08-09T05:30:00.000Z"
    );
assert.equal(
  storedOfficialOdds.savedAt,
  "2026-08-09T05:11:00.000Z",
  "保存snapshot自身のsavedAtを上書きしない"
);
assert.equal(
  storedOfficialOdds.source,
  "boatrace-official-snapshot",
  "保存snapshot自身のsourceを維持する"
);
const incompleteOfficialOdds =
  reviewNormalizeSandbox
    .normalizeReviewOddsData({
      ok: true,
      available: true,
      source: "boatrace-official",
      byTicket: {
        "1-2-3": 9.7
      }
    });
assert.equal(
  incompleteOfficialOdds.available,
  true,
  "APIのavailable契約をフロント独自の固定通り数で上書きしない"
);
assert.equal(
  incompleteOfficialOdds.isFinalRetrievedOdds,
  true
);

const initialSave = initialFlow.indexOf(
  "savePredictionSnapshot("
);
const initialRender = initialFlow.indexOf(
  "window.renderAll("
);

assert.ok(
  initialSave >= 0 && initialSave < initialRender,
  "予想本体はオッズ応答を待たず先に保存・描画できる"
);
assert.match(
  initialFlow,
  /updateStatus\("予想を表示しました（オッズ取得中…）"\)[\s\S]*oddsSupplementPromise[\s\S]*applyOddsSupplement/,
  "初回表示後にオッズを非同期で付加する"
);
assert.match(
  initialFlow,
  /if \(isReview\)[\s\S]*oddsAppliedBeforeRender[\s\S]*oddsSupplementPromise[\s\S]*applyReviewOddsSupplement/,
  "振り返りは早着オッズを初回描画へ、後着オッズを同じ予想へ再反映する"
);
assert.match(
  reviewApplyFlow,
  /isCurrentRequest\(\)[\s\S]*lastPrediction !== prediction[\s\S]*enrichPredictionWithOdds\([\s\S]*isCurrentRequest\(\)[\s\S]*lastPrediction !== prediction[\s\S]*window\.renderAll/,
  "振り返りの後着オッズは付加前後に世代と表示中予想を確認する"
);
assert.equal(
  reviewApplyFlow.includes(
    "savePredictionSnapshot"
  ),
  false,
  "振り返りの後着オッズを予想履歴へ保存しない"
);
assert.equal(
  reviewApplyFlow.includes(
    "updateStatus("
  ),
  false,
  "振り返りの後着オッズで公式結果の状態文を上書きしない"
);
assert.equal(
  reviewApplyFlow.includes(
    "fetchOfficialResult"
  ),
  false,
  "最終オッズ付加処理へ公式結果を混ぜない"
);
assert.match(
  initialFlow,
  /const prediction\s*=\s*createPredictionSafe\([\s\S]*enrichPredictionWithOdds\(/,
  "最終オッズは予想・買い目生成後にだけ付加する"
);
assert.match(
  initialFlow,
  /if \(\s*!isReview\s*\) \{\s*savePredictionSnapshot\(/,
  "振り返り予想は初回にも保存しない"
);
assert.ok(
  initialFlow.indexOf("window.renderAll(") <
    initialFlow.indexOf("fetchOfficialResult("),
  "公式結果は予想作成・初回描画後にだけ取得する"
);
assert.match(
  applyFlow,
  /isCurrentRequest\(\)[\s\S]*lastPrediction !== prediction[\s\S]*enrichPredictionWithOdds\([\s\S]*savePredictionSnapshot\([\s\S]*window\.renderAll/,
  "古い応答を捨て、同じ予想へオッズを付加して再描画・保存する"
);
assert.match(
  applyMissingFlow,
  /buildMissingTop30[\s\S]*savePredictionSnapshot[\s\S]*updateMissingNumbersSection/,
  "出てない目は予想画面全体を再描画せず、保存後に該当欄だけ後追い更新する"
);
assert.match(
  applyFlow,
  /!hasUsableOddsData\(oddsData\)[\s\S]*missingData[\s\S]*applyMissingSupplement[\s\S]*missingPromise[\s\S]*applyMissingSupplement/,
  "オッズが未取得でも、場別の出てない目は独立して反映する"
);
assert.match(
  initialFlow,
  /oddsAppliedBeforeRender[\s\S]*missingPromise[\s\S]*applyMissingSupplement/,
  "オッズが初回描画より先に返っても、後着の出てない目を反映する"
);
assert.match(
  timeoutFlow,
  /AbortController[\s\S]*controller\.abort\(\)[\s\S]*clearTimeout/,
  "オッズ通信は上限時間を設けて予想表示を妨げない"
);
assert.ok(
  refreshFlow.includes("lastPrediction"),
  "オッズ更新は生成済み予想を再利用する"
);
assert.ok(
  refreshFlow.includes("enrichPredictionWithOdds("),
  "初回と手動更新で同じ付加helperを使う"
);
assert.ok(
  !refreshFlow.includes("createPredictionSafe("),
  "オッズ更新で予想・買い目を再生成しない"
);

function runReviewApply({
  current = true,
  samePrediction = true,
  usableOdds = true,
  restoredSnapshot = false,
  oddsError = null
} = {}) {
  const candidate = {};
  const calls = {
    enrich: 0,
    render: 0,
    badge: 0,
    lastBadge: null
  };
  const context = {
    console,
    candidate,
    displayedPrediction:
      samePrediction
        ? candidate
        : {},
    calls,
    oddsError,
    isCurrentRequest() {
      return current;
    },
    hasUsableOddsData() {
      return usableOdds;
    },
    enrichPredictionWithOdds() {
      calls.enrich += 1;
    },
    updatePredictionOddsStatus(message, state) {
      calls.badge += 1;
      calls.lastBadge = { message, state };
    },
    window: {
      ChappyFinalOddsDisplay: {
        prepare(value) {
          return restoredSnapshot
            ? {
                ...value,
                finalOddsDisplay: {
                  available: true,
                  isFinalRetrievedOdds: true
                }
              }
            : value;
        }
      },
      renderAll() {
        calls.render += 1;
      }
    }
  };

  vm.runInNewContext(
    `
      let lastPrediction = displayedPrediction;
      let lastRaceData = {};
      ${reviewApplyFlow}
      this.result = applyReviewOddsSupplement({
        oddsSupplement: {
          oddsData: {
            available: true,
            byTicket: { "1-2-3": 8.4 }
          },
          oddsError
        },
        prediction: candidate,
        params: {
          date: "20260809",
          jcd: "02",
          rno: 6
        },
        isCurrentRequest
      });
    `,
    context
  );

  return {
    result: context.result,
    calls
  };
}

const staleGeneration =
  runReviewApply({
    current: false
  });
assert.equal(
  staleGeneration.result,
  false,
  "別の選択世代へ遅着した最終オッズを捨てる"
);
assert.deepEqual(
  staleGeneration.calls,
  { enrich: 0, render: 0, badge: 0, lastBadge: null },
  "別世代の最終オッズで予想・画面を触らない"
);

const stalePrediction =
  runReviewApply({
    samePrediction: false
  });
assert.equal(
  stalePrediction.result,
  false,
  "表示中とは別の予想へ遅着した最終オッズを捨てる"
);
assert.deepEqual(
  stalePrediction.calls,
  { enrich: 0, render: 0, badge: 0, lastBadge: null },
  "別予想の最終オッズで予想・画面を触らない"
);

const currentReview =
  runReviewApply();
assert.equal(
  currentReview.result,
  true,
  "同じ世代・同じ予想へだけ最終オッズを再反映する"
);
assert.deepEqual(
  currentReview.calls,
  {
    enrich: 1,
    render: 1,
    badge: 1,
    lastBadge: {
      message: "最終オッズ反映済み",
      state: "ready"
    }
  },
  "最終オッズの後着時は予想再生成なしで一度だけ再描画する"
);

const localFallback = runReviewApply({
  usableOdds: false,
  restoredSnapshot: true,
  oddsError: new Error("API unavailable")
});
assert.equal(localFallback.result, false);
assert.deepEqual(
  localFallback.calls.lastBadge,
  {
    message: "端末保存の最終オッズを表示",
    state: "ready"
  },
  "API失敗時も端末保存値を表示中だと明示する"
);

const noFinalOdds = runReviewApply({
  usableOdds: false,
  oddsError: new Error("API unavailable")
});
assert.equal(noFinalOdds.result, false);
assert.deepEqual(
  noFinalOdds.calls.lastBadge,
  {
    message: "最終オッズ取得失敗",
    state: "error"
  },
  "API・端末保存の両方がない場合は待機表示を終了する"
);

const history = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem(key) {
      return history.get(key) || null;
    },
    setItem(key, value) {
      history.set(key, String(value));
    }
  },
  buildMissingTop30(missingData) {
    return {
      ...missingData
    };
  },
  attachCombinedOdds(prediction) {
    prediction.combinedOdds = {
      available: true,
      testOnly: true
    };
  }
};

vm.runInNewContext(
  `${enrichSource}; this.enrichPredictionWithOdds = enrichPredictionWithOdds;`,
  sandbox
);

const prediction = {
  ticketRanks: [
    { ticket: "1-2-3", score: 82, category: "本命" },
    { ticket: "1-3-2", score: 74, category: "押さえ" }
  ],
  aiTicketList: [
    { ticket: "1-2-3", score: 82, category: "本命" },
    { ticket: "1-3-2", score: 74, category: "押さえ" }
  ],
  ticketSheets: {
    main: [{ ticket: "1-2-3", score: 82, category: "本命" }],
    cover: [{ ticket: "1-3-2", score: 74, category: "押さえ" }],
    flow: [],
    hole: [],
    all: [
      { ticket: "1-2-3", score: 82 },
      { ticket: "1-3-2", score: 74 }
    ]
  },
  mainSheet: {
    tickets: [{ ticket: "1-2-3", score: 82 }],
    coverTickets: [{ ticket: "1-3-2", score: 74 }],
    flowTickets: []
  },
  manshuSheet: {
    tickets: []
  },
  aiCore: {
    mainSheet: {
      tickets: [{ ticket: "1-2-3", score: 82 }],
      coverTickets: [{ ticket: "1-3-2", score: 74 }],
      flowTickets: []
    },
    manshuSheet: {
      tickets: []
    }
  },
  finalAi: {
    ticketRanks: [{ ticket: "1-2-3", score: 82 }],
    topTickets: [{ ticket: "1-2-3", score: 82 }],
    manshuTickets: [{ ticket: "1-3-2", score: 74 }]
  },
  practicalSelection: {
    tickets: [
      { ticket: "1-2-3", score: 82, category: "本命" },
      { ticket: "1-3-2", score: 74, category: "押さえ" }
    ]
  }
};
const snapshotPrediction =
  JSON.parse(
    JSON.stringify(
      prediction
    )
  );
const ticketOrder = list =>
  list.map(item => item.ticket);
const ticketContract = value => ({
  ranks: value.ticketRanks.map(item => ({
    ticket: item.ticket,
    category: item.category
  })),
  ai: value.aiTicketList.map(item => ({
    ticket: item.ticket,
    category: item.category
  })),
  main: value.ticketSheets.main.map(item => ({
    ticket: item.ticket,
    category: item.category
  })),
  cover: value.ticketSheets.cover.map(item => ({
    ticket: item.ticket,
    category: item.category
  })),
  practical:
    value.practicalSelection.tickets.map(item => ({
      ticket: item.ticket,
      category: item.category
    }))
});
const before = {
  ranks: ticketOrder(prediction.ticketRanks),
  ai: ticketOrder(prediction.aiTicketList),
  practical: ticketOrder(
    prediction.practicalSelection.tickets
  )
};
const params = {
  date: "20260803",
  jcd: "23",
  rno: 12
};

const enriched = sandbox.enrichPredictionWithOdds(
  prediction,
  {
    ok: true,
    count: 120,
    byTicket: {
      "1-2-3": 8.4,
      "1-3-2": 31.2
    }
  },
  {
    ok: true,
    missingNumbers: [{ ticket: "4-5-6" }]
  },
  params
);

assert.equal(enriched, prediction, "生成済み予想そのものを付加更新する");
assert.deepEqual(
  ticketOrder(prediction.ticketRanks),
  before.ranks,
  "買い目ランキングの内容・順番を変えない"
);
assert.deepEqual(
  ticketOrder(prediction.aiTicketList),
  before.ai,
  "AI買い目の内容・順番を変えない"
);
assert.deepEqual(
  ticketOrder(prediction.practicalSelection.tickets),
  before.practical,
  "実戦厳選の内容・順番を変えない"
);
assert.equal(
  prediction.ticketRanks[0].odds,
  8.4,
  "生成済み買い目へ初回オッズを付加する"
);
assert.equal(
  prediction.ticketSheets.cover[0].odds,
  31.2,
  "各表示用買い目へ同じオッズを付加する"
);
assert.equal(
  prediction.practicalSelection.tickets[1].odds,
  31.2,
  "実戦厳選にもオッズを付加する"
);
assert.equal(
  prediction.aiCore.mainSheet.tickets[0].odds,
  8.4,
  "再描画で優先されるAIコア本命シートにもオッズを保持する"
);
assert.equal(
  prediction.aiCore.mainSheet,
  prediction.mainSheet,
  "AIコア表示アダプターとオッズ付与済み本命シートを同期する"
);
assert.equal(
  prediction.finalAi.manshuTickets[0].odds,
  31.2,
  "最終AIの万舟買い目にも同じオッズを付加する"
);
assert.equal(
  prediction.missingNumbersData.ok,
  true,
  "出てない目を同じ初回予想へ付加する"
);
assert.equal(
  prediction.combinedOdds.available,
  true,
  "合成オッズも同じ付加処理で更新する"
);

const snapshotContractBefore =
  ticketContract(
    snapshotPrediction
  );
const directReviewPrediction =
  JSON.parse(
    JSON.stringify(
      snapshotPrediction
    )
  );
sandbox.enrichPredictionWithOdds(
  directReviewPrediction,
  directOfficialOdds,
  null,
  params
);
assert.equal(
  directReviewPrediction
    .ticketRanks[0]
    .oddsText,
  "9.7倍（最終取得）",
  "終了直後の公式直取得も最終取得文言まで反映する"
);
assert.equal(
  directReviewPrediction
    .ticketRanks[0]
    .oddsSource,
  "boatrace-official",
  "終了直後の公式直取得sourceを買い目へ保持する"
);
assert.equal(
  directReviewPrediction
    .ticketRanks[0]
    .oddsSavedAt,
  "2026-08-09T05:30:00.000Z",
  "終了直後の公式直取得時刻を買い目へ保持する"
);
assert.deepEqual(
  ticketContract(
    directReviewPrediction
  ),
  snapshotContractBefore,
  "公式直取得の最終オッズでも予想契約を変えない"
);
const finalSavedAt =
  "2026-08-09T04:11:00.000Z";
sandbox.enrichPredictionWithOdds(
  snapshotPrediction,
  {
    ok: true,
    available: true,
    count: 120,
    source:
      "boatrace-official-snapshot",
    savedAt: finalSavedAt,
    isFinalRetrievedOdds: true,
    byTicket: {
      "1-2-3": 8.4,
      "1-3-2": 31.2
    }
  },
  null,
  params
);
assert.deepEqual(
  ticketContract(
    snapshotPrediction
  ),
  snapshotContractBefore,
  "最終オッズ付加でticket・category・順番・点数を変えない"
);
assert.equal(
  snapshotPrediction
    .ticketRanks[0]
    .oddsText,
  "8.4倍（最終取得）",
  "保存済み最終オッズを明示して表示する"
);
assert.equal(
  snapshotPrediction
    .ticketRanks[0]
    .oddsSource,
  "boatrace-official-snapshot",
  "最終オッズの取得元を買い目へ保持する"
);
assert.equal(
  snapshotPrediction
    .ticketRanks[0]
    .oddsSavedAt,
  finalSavedAt,
  "最終オッズの保存時刻を買い目へ保持する"
);
assert.equal(
  snapshotPrediction
    .ticketRanks[0]
    .isFinalRetrievedOdds,
  true,
  "最終取得オッズの識別子を買い目へ保持する"
);
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      snapshotPrediction
        .finalOddsDisplay
    )
  ),
  {
    available: true,
    label: "最終取得オッズ",
    source:
      "boatrace-official-snapshot",
    savedAt: finalSavedAt,
    isFinalRetrievedOdds: true
  },
  "予想全体にも最終オッズのsource・savedAtを保持する"
);

const orderBeforeRefresh =
  ticketOrder(prediction.ticketRanks);
sandbox.enrichPredictionWithOdds(
  prediction,
  {
    ok: true,
    count: 120,
    byTicket: {
      "1-2-3": 5.5,
      "1-3-2": 42.0
    }
  },
  {
    ok: true,
    missingNumbers: []
  },
  params
);

assert.deepEqual(
  ticketOrder(prediction.ticketRanks),
  orderBeforeRefresh,
  "再取得でも買い目を変更しない"
);
assert.ok(
  prediction.oddsMovements.length >= 1,
  "再取得では前回値とのオッズ変動を付加する"
);

const orderBeforePartialRefresh =
  ticketOrder(prediction.ticketRanks);
sandbox.enrichPredictionWithOdds(
  prediction,
  {
    ok: true,
    count: 1,
    byTicket: {
      "1-2-3": 6.2
    }
  },
  {
    ok: true,
    missingNumbers: []
  },
  params
);
assert.deepEqual(
  ticketOrder(prediction.ticketRanks),
  orderBeforePartialRefresh,
  "一部オッズだけの再取得でも買い目・順番を変えない"
);
assert.equal(
  prediction.ticketSheets.cover[0].odds,
  null,
  "最新公式表から消えた押さえへ古いオッズを残さない"
);
assert.equal(
  prediction.ticketSheets.cover[0].oddsText,
  "オッズ未取得",
  "公式値がない買い目は推測せず未取得と表示する"
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

async function drainAsyncWork() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

function createReviewFlowHarness({
  fastOdds = false
} = {}) {
  const oddsDeferred = deferred();
  const firstRenderDeferred = deferred();
  const events = [];
  const statuses = [];
  const oddsStatuses = [];
  const calls = {
    oddsApi: 0,
    missingApi: 0,
    enrich: 0,
    render: 0,
    save: 0
  };
  const prediction = {
    ticketRanks: [{
      ticket: "1-2-3",
      category: "本命"
    }]
  };
  const resultArea = {
    dataset: {
      raceLoading: "true"
    }
  };
  const oddsPayload = {
    ok: true,
    available: true,
    count: 120,
    source: "boatrace-official-snapshot",
    savedAt: "2026-08-09T05:11:00.000Z",
    isFinalRetrievedOdds: true,
    byTicket: {
      ...completeOfficialByTicket,
      "1-2-3": 8.4
    }
  };
  const context = {
    console,
    Promise,
    setTimeout,
    clearTimeout,
    prediction,
    events,
    statuses,
    oddsStatuses,
    calls,
    CustomEvent: class CustomEvent {
      constructor(name, options) {
        this.type = name;
        this.detail = options?.detail;
      }
    },
    document: {
      getElementById(id) {
        return id === "resultArea"
          ? resultArea
          : null;
      }
    },
    window: {
      ChappyPredictionRuntime: {
        ensureReady() {
          return Promise.resolve(true);
        }
      },
      ChappyHiyoriRuntimeLoader: {
        ensureReady() {
          return Promise.resolve(true);
        }
      },
      renderAll(value) {
        calls.render += 1;
        events.push(
          value.reviewOddsApplied
            ? "render:odds"
            : "render:initial"
        );
        if (calls.render === 1) {
          firstRenderDeferred.resolve();
        }
      },
      dispatchEvent() {},
      ChappyHomeDashboardV2: {
        showPredictionError() {}
      }
    },
    clearErrorArea() {},
    updateStatus(value) {
      statuses.push(value);
    },
    updatePredictionOddsStatus(value) {
      oddsStatuses.push(value);
    },
    getRaceParams() {
      return {
        place: "戸田",
        jcd: "02",
        rno: 6,
        date: "20260809"
      };
    },
    getRaceMode() {
      return "review";
    },
    verifyLiveDeadline() {
      throw new Error(
        "reviewでlive締切判定を呼んではならない"
      );
    },
    clearReviewResult() {
      throw new Error(
        "review開始時に結果欄をlive扱いで消してはならない"
      );
    },
    fetchRaceData() {
      events.push("race-api");
      return Promise.resolve({
        ok: true,
        entries: []
      });
    },
    fetchOddsData() {
      calls.oddsApi += 1;
      events.push("odds-api");
      return fastOdds
        ? Promise.resolve(oddsPayload)
        : oddsDeferred.promise;
    },
    fetchMissingNumbers() {
      calls.missingApi += 1;
      throw new Error(
        "reviewでmissing APIを呼んではならない"
      );
    },
    fetchOddsSupplement() {
      throw new Error(
        "reviewでlive odds helperを呼んではならない"
      );
    },
    prepareRaceDataForTheories(value) {
      return Promise.resolve(value);
    },
    createPredictionSafe() {
      events.push("create-prediction");
      return prediction;
    },
    createTheorySafe() {},
    createAISafe() {},
    hasUsableOddsData(value) {
      events.push("check-usable-odds");
      return Boolean(
        value?.available !== false &&
        Object.values(value?.byTicket || {})
          .some(odds => Number(odds) > 0)
      );
    },
    enrichPredictionWithOdds(value) {
      calls.enrich += 1;
      events.push("enrich-odds");
      value.reviewOddsApplied = true;
      return value;
    },
    savePredictionSnapshot() {
      calls.save += 1;
    },
    fetchOfficialResult() {
      events.push("official-result-api");
      return Promise.resolve({
        resultAvailable: true
      });
    },
    renderReviewResult() {
      events.push("render-result");
    },
    renderReviewResultError(error) {
      throw error;
    },
    isVoidOfficialResult() {
      return false;
    },
    showError(error) {
      throw new Error(error);
    }
  };

  vm.runInNewContext(
    `
      let predictionGeneration = 0;
      let lastRaceData = null;
      let lastPrediction = null;
      ${normalizeReviewOddsSource}
      ${reviewSupplementFlow}
      ${reviewApplyFlow}
      ${initialFlow}
      this.start = fetchAndRenderRace;
      this.switchRace = () => {
        predictionGeneration += 1;
      };
    `,
    context
  );

  return {
    context,
    calls,
    events,
    statuses,
    oddsStatuses,
    prediction,
    firstRendered: firstRenderDeferred.promise,
    resolveOdds() {
      oddsDeferred.resolve(oddsPayload);
    }
  };
}

async function testReviewFlowOrchestration() {
  const fast = createReviewFlowHarness({
    fastOdds: true
  });
  await fast.context.start();
  await drainAsyncWork();

  assert.equal(
    fast.calls.oddsApi,
    1,
    "振り返りfast経路はオッズAPIをexact onceで呼ぶ"
  );
  assert.equal(
    fast.calls.missingApi,
    0,
    "振り返りfast経路はmissing APIを呼ばない"
  );
  assert.equal(
    fast.calls.render,
    1,
    "fast最終オッズは初回描画へまとめ、二重描画しない"
  );
  assert.ok(
    fast.events.indexOf("enrich-odds") <
      fast.events.indexOf("render:odds"),
    "fast最終オッズは初回描画より前に付加する: " +
      JSON.stringify(fast.events)
  );
  assert.ok(
    fast.events.indexOf("official-result-api") >
      fast.events.indexOf("create-prediction") &&
      fast.events.indexOf("official-result-api") >
        fast.events.indexOf("render:odds"),
    "公式結果は予想作成・初回描画後に取得する"
  );
  assert.equal(
    fast.calls.save,
    0,
    "振り返りfast経路は予想履歴へ保存しない"
  );

  const late = createReviewFlowHarness();
  const lateFlow = late.context.start();
  await late.firstRendered;

  assert.equal(
    late.calls.render,
    1,
    "遅い最終オッズを待たず予想を初回描画する"
  );
  assert.equal(
    late.prediction.reviewOddsApplied,
    undefined,
    "初回描画時点で未着オッズを推測しない"
  );

  await lateFlow;
  const resultStatus = late.statuses.at(-1);
  late.resolveOdds();
  await drainAsyncWork();

  assert.equal(
    late.calls.oddsApi,
    1,
    "振り返りlate経路もオッズAPIをexact onceで呼ぶ"
  );
  assert.equal(
    late.calls.missingApi,
    0,
    "振り返りlate経路もmissing APIを呼ばない"
  );
  assert.equal(
    late.calls.render,
    2,
    "同じレースの後着オッズだけを一度再描画する"
  );
  assert.equal(
    late.calls.enrich,
    1,
    "後着最終オッズを生成済み予想へ一度だけ付加する"
  );
  assert.equal(
    late.calls.save,
    0,
    "振り返りlate経路も予想履歴へ保存しない"
  );
  assert.equal(
    late.statuses.at(-1),
    resultStatus,
    "後着最終オッズで公式結果のstatusを上書きしない"
  );

  const stale = createReviewFlowHarness();
  const staleFlow = stale.context.start();
  await stale.firstRendered;
  await staleFlow;
  const staleResultStatus =
    stale.statuses.at(-1);
  const staleOddsStatusCount =
    stale.oddsStatuses.length;

  stale.context.switchRace();
  stale.resolveOdds();
  await drainAsyncWork();

  assert.equal(
    stale.calls.render,
    1,
    "レース切替後に遅着した最終オッズで再描画しない"
  );
  assert.equal(
    stale.calls.enrich,
    0,
    "レース切替後の古い最終オッズを予想へ付加しない"
  );
  assert.equal(
    stale.statuses.at(-1),
    staleResultStatus,
    "レース切替後の古い応答で公式結果statusを変えない"
  );
  assert.equal(
    stale.oddsStatuses.length,
    staleOddsStatusCount,
    "レース切替後の古い応答でオッズstatusも変えない"
  );
  assert.equal(
    stale.calls.save,
    0,
    "stale応答でも振り返り予想を保存しない"
  );
}

testReviewFlowOrchestration()
  .then(() => {
    console.log(
      "初回オッズ並列取得・生成済み予想付加 回帰テスト: 合格"
    );
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
