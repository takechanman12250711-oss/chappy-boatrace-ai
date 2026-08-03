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
const refreshFlow = functionSource("refreshOddsOnly");
const applyFlow = functionSource("applyOddsSupplement");
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
const firstWait = initialFlow.indexOf(
  "await Promise.all(["
);

assert.ok(raceStart >= 0, "初回にレース取得を開始する");
assert.ok(oddsStart >= 0, "初回にオッズ補足取得を開始する");
assert.ok(
  raceStart < firstWait && oddsStart < firstWait,
  "レース・オッズ・出てない目は同じ待機より前に並行開始する"
);
assert.match(
  supplementFlow,
  /fetchMissingNumbers\(params\)[\s\S]*fetchOddsData\(params\)[\s\S]*await oddsPromise/,
  "オッズと出てない目を並行開始し、オッズだけを先に反映できる"
);
assert.equal(supplementFlow.includes("await Promise.all"), false, "出てない目の遅延でオッズ表示を止めない");
assert.match(
  supplementFlow,
  /\.catch\(oddsError[\s\S]*oddsData:\s*null/,
  "初回オッズ失敗は補足情報なしとして扱う"
);

const initialSave = initialFlow.indexOf(
  "savePredictionSnapshot("
);
const initialRender = initialFlow.indexOf(
  "window.renderAll("
);

assert.ok(
  initialSave >= 0 && initialSave < initialRender,
  "予想本体はオッズ応答を待たず先に保存・描画する"
);
assert.match(
  initialFlow,
  /updateStatus\("予想を表示しました（オッズ取得中…）"\)[\s\S]*oddsSupplementPromise[\s\S]*applyOddsSupplement/,
  "初回表示後にオッズを非同期で付加する"
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
  buildMissingTop30(missingData, byTicket) {
    return {
      ...missingData,
      testedTickets: Object.keys(byTicket)
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
    { ticket: "1-2-3", score: 82 },
    { ticket: "1-3-2", score: 74 }
  ],
  aiTicketList: [
    { ticket: "1-2-3", score: 82 },
    { ticket: "1-3-2", score: 74 }
  ],
  ticketSheets: {
    main: [{ ticket: "1-2-3", score: 82 }],
    cover: [{ ticket: "1-3-2", score: 74 }],
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
      { ticket: "1-2-3", score: 82 },
      { ticket: "1-3-2", score: 74 }
    ]
  }
};
const ticketOrder = list =>
  list.map(item => item.ticket);
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

console.log(
  "初回オッズ並列取得・生成済み予想付加 回帰テスト: 合格"
);
