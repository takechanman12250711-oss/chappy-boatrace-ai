"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
require("../js/evaluated-scenario-candidates");
require("../js/ai-core");
require("../js/prediction");
const practicalSelection = require("../js/practical-selection");
const noteGenerator = require("../js/note-generator");
const outerAttackShadow = require(
  "../js/outer-attack-ticket-shadow"
);

const aiCore = global.ChappyAICore;
const cloneJson = value => JSON.parse(JSON.stringify(value));

function entries(courseByBoat = {}) {
  return Array.from({ length: 6 }, (_, index) => {
    const boatNo = index + 1;

    return {
      boat: boatNo,
      racerName: `${boatNo}号艇`,
      startExhibition: {
        course: Number(courseByBoat[boatNo] || boatNo),
        isOfficialCourse: true,
        mappingSource: "official-start-image"
      }
    };
  });
}

function analyses(roadByBoat = {}) {
  return Array.from({ length: 6 }, (_, index) => {
    const boatNo = index + 1;

    return {
      boatNo,
      playerName: `${boatNo}号艇`,
      roleScores: {
        road: Number(roadByBoat[boatNo] || 40)
      }
    };
  });
}

const FOUR_ATTACK_REASONS = {
  1: ["4カド攻め時のイン残し"],
  2: ["2コース差し残り"],
  3: ["内で残る"],
  4: ["4カド攻め"],
  5: ["4カド攻めに乗るまくり差し・追走"],
  6: ["最内差し・空き水面を拾い・道中"]
};

function scenario({
  type = "fourAttack",
  label = "4カド攻め",
  attackerCourse = 4,
  attackerBoatNo = 4,
  score = 82,
  reasons = FOUR_ATTACK_REASONS,
  blockedBoats = [],
  firstScores = {},
  secondBoatNos = [1, 2, 3, 5, 6],
  thirdBoatNos = [1, 2, 3, 5, 6]
} = {}) {
  const boats = Array.from({ length: 6 }, (_, index) => {
    const boatNo = index + 1;

    return {
      boatNo,
      firstScore: Number(
        firstScores[boatNo] ??
        ({ 4: 90, 5: 82, 6: 76 }[boatNo] || 45)
      ),
      secondScore: 90 - boatNo,
      thirdScore: 86 - boatNo,
      score: 88 - boatNo,
      reasons: [...(reasons[boatNo] || [])]
    };
  });
  const byBoat = new Map(boats.map(row => [row.boatNo, row]));

  return {
    type,
    label,
    score,
    attacker: attackerCourse,
    attackerCourse,
    attackerBoatNo,
    headBoatNo: attackerBoatNo,
    blockedBoats: [...blockedBoats],
    outcome: {
      boats,
      firstCandidates: [byBoat.get(attackerBoatNo)],
      secondCandidates: secondBoatNos.map(boatNo => byBoat.get(boatNo)),
      thirdCandidates: thirdBoatNos.map(boatNo => byBoat.get(boatNo))
    }
  };
}

function buildOptions(overrides = {}) {
  const fourAttack = overrides.fourAttack || scenario();

  return {
    formations: {
      mainEstablished: true,
      main: ["1-2-3"],
      cover: ["1-3-2"],
      safety: ["1-3-2"],
      flow: ["1-4-5"],
      nagashi: ["1-4-5"],
      hole: ["4-1-2"],
      longshot: ["4-1-2"]
    },
    raceScenarios: {
      mainScenario: fourAttack,
      scenarios: [fourAttack],
      roadRaceBoats: [6]
    },
    entries: entries(),
    analyses: analyses({ 6: 79 }),
    racerSkillTheory: {
      roles: [{
        boatNo: 6,
        score: 84,
        methodLabel: "複数戦法の実績あり",
        isAdopted: true
      }]
    },
    ...overrides.options
  };
}

function exactTicket(ticket) {
  const parts = String(ticket || "").split("-").map(Number);
  return (
    parts.length === 3 &&
    parts.every(boatNo => boatNo >= 1 && boatNo <= 6) &&
    new Set(parts).size === 3
  );
}

function expandNotation(notation) {
  const match = String(notation || "").match(
    /^([1-6]+)-([1-6]+)-([1-6]+)$/
  );
  assert.ok(match, `${notation}: フォーメーション表記`);

  const positions = match.slice(1).map(value =>
    [...new Set(value.split("").map(Number))]
  );
  const tickets = [];

  positions[0].forEach(first => {
    positions[1].forEach(second => {
      positions[2].forEach(third => {
        if (new Set([first, second, third]).size !== 3) return;
        tickets.push(`${first}-${second}-${third}`);
      });
    });
  });

  return tickets;
}

function ticketValues(source) {
  return (Array.isArray(source) ? source : [])
    .map(row => String(row?.ticket || row || ""))
    .filter(Boolean);
}

function canonicalTicketDigest(prediction) {
  const formation = prediction?.formation || prediction?.formations || {};
  const sheets = prediction?.ticketSheets || {};
  const compactRows = rows => (Array.isArray(rows) ? rows : []).map(row => ({
    ticket: String(row?.ticket || row || ""),
    category: String(row?.category || ""),
    displayCategory: String(row?.displayCategory || ""),
    priorityScore: Number(row?.priorityScore || 0),
    branchIds: [...(row?.branchIds || [])]
  }));

  return {
    formation: Object.fromEntries(
      ["main", "cover", "safety", "flow", "nagashi", "hole", "longshot"]
        .map(key => [key, ticketValues(formation[key])])
    ),
    ticketSheets: Object.fromEntries(
      ["main", "cover", "flow", "hole", "possibility", "all"]
        .map(key => [key, compactRows(sheets[key])])
    ),
    aiTicketList: compactRows(prediction?.aiTicketList),
    manshu: compactRows(prediction?.manshuSheet?.tickets)
  };
}

function practicalDigest(selection) {
  return {
    status: selection?.status,
    reason: selection?.reason,
    normalMaximumCount: selection?.normalMaximumCount,
    maximumCount: selection?.maximumCount,
    tickets: (selection?.tickets || []).map(row => ({
      ticket: row.ticket,
      category: row.category,
      displayCategory: row.displayCategory,
      selectionTier: row.selectionTier || "",
      priorityScore: Number(row.priorityScore || 0),
      amount: Number(row.amount || 0),
      branchIds: [...(row.validBranchIds || row.branchIds || [])]
    })),
    expansionSummary: selection?.expansionSummary || null,
    priorityGateReplacement: selection?.priorityGateReplacement || null,
    strongEscapeTrim: selection?.strongEscapeTrim || null
  };
}

function boardDigest(board) {
  if (!board) return null;

  return {
    source: board.source,
    totalPointCount: board.totalPointCount,
    totalSuggestedYen: board.totalSuggestedYen,
    lines: board.lines.map(line => ({
      rank: line.rank,
      id: line.id,
      kind: line.kind,
      title: line.title,
      reason: line.reason,
      priorityScore: line.priorityScore,
      trigger: line.trigger,
      headEvidence: line.headEvidence,
      formation: line.formation,
      allocation: line.allocation,
      tickets: line.ticketDetails.map(detail => ({
        ticket: detail.ticket,
        scenarioSummary: detail.scenarioSummary,
        trigger: detail.trigger,
        roles: detail.roles,
        roadRaceAdjustment: detail.roadRaceAdjustment,
        priorityScore: detail.priorityScore
      }))
    }))
  };
}

function assertBoardContract(board, label) {
  assert.ok(board, `${label}: 2筋以上ある時はボードを作る`);
  assert.equal(board.schemaVersion, 1, `${label}: schema version`);
  assert.equal(board.source, "ai-core-light-manshu-ticket-board-v1");
  assert.equal(board.title, "取れたらいいな舟券");
  assert.equal(board.selectionScope, "advisory-display-only");
  assert.equal(board.generatedFrom, "formal-pre-race-scenarios");
  assert.equal(board.displayOnly, true);
  assert.equal(board.advisoryOnly, true);
  assert.equal(board.purchaseEligible, false);
  assert.equal(board.saveEligible, false);
  assert.equal(board.noteEligible, false);
  assert.equal(board.usesOdds, false);
  assert.equal(board.usesOfficialResult, false);
  assert.equal(board.changesNormalTickets, false);
  assert.equal(board.changesPracticalSelection, false);
  assert.equal(board.unitYen, 100);
  assert.equal(board.maximumLineCount, 3);
  assert.equal(board.maximumPointsPerLine, 4);
  assert.equal(board.maximumTotalPointCount, 12);
  assert.equal(board.maximumSuggestedYen, 2400);
  assert.ok(board.lines.length >= 2 && board.lines.length <= 3);

  const expectedUnits = [3, 2, 1];
  const allTickets = [];
  let totalPointCount = 0;
  let totalSuggestedYen = 0;

  board.lines.forEach((line, index) => {
    const lineLabel = `${label}: 第${index + 1}候補`;
    const expanded = line.formation.expandedTickets;
    assert.equal(line.rank, index + 1, `${lineLabel}: rank`);
    assert.ok(
      ["START_UPSET", "OUTER_FOLLOW", "ROAD_PICKUP"].includes(line.kind),
      `${lineLabel}: 定義済みの筋`
    );
    assert.equal(line.displayOnly, true);
    assert.equal(line.advisoryOnly, true);
    assert.equal(line.purchaseEligible, false);
    assert.equal(line.saveEligible, false);
    assert.equal(line.noteEligible, false);
    assert.equal(line.usesOdds, false);
    assert.equal(line.usesOfficialResult, false);
    assert.ok(expanded.length >= 2 && expanded.length <= 4);
    assert.equal(line.formation.pointCount, expanded.length);
    assert.deepEqual(
      [...expandNotation(line.formation.notation)].sort(),
      [...expanded].sort(),
      `${lineLabel}: 圧縮表記を展開しても根拠付きexact券だけになる`
    );
    assert.equal(new Set(expanded).size, expanded.length);
    assert.ok(expanded.every(exactTicket), `${lineLabel}: 正しい3連単`);
    assert.deepEqual(
      line.ticketDetails.map(detail => detail.ticket),
      expanded,
      `${lineLabel}: 個別説明と展開券の順番を一致させる`
    );
    assert.ok(
      line.ticketDetails.every(detail =>
        detail.trigger?.scenarioType === line.trigger?.scenarioType &&
        detail.trigger?.attackerBoatNo === line.trigger?.attackerBoatNo &&
        detail.scenarioSummary.includes(detail.ticket) &&
        detail.displayOnly === true &&
        detail.advisoryOnly === true &&
        detail.source ===
          "ai-core-light-manshu-ticket-board-v1" &&
        detail.selectionScope === "advisory-display-only" &&
        detail.storyType ===
          "LIGHT_MANSHU_TICKET_BOARD_DETAIL" &&
        detail.purchaseEligible === false &&
        detail.saveEligible === false &&
        detail.noteEligible === false &&
        detail.usesOdds === false &&
        detail.usesOfficialResult === false &&
        !detail.roles.some(role =>
          ["BLOCKED_RISK", "DISPLACED_RISK"].includes(role?.role)
        )
      ),
      `${lineLabel}: 全exact券を同じ固定展開と肯定根拠で説明する`
    );

    const unitsPerTicket = expectedUnits[index];
    const expectedTotal = expanded.length * unitsPerTicket * board.unitYen;
    assert.equal(line.allocation.unitYen, board.unitYen);
    assert.equal(line.allocation.unitsPerTicket, unitsPerTicket);
    assert.equal(line.allocation.yenPerTicket, unitsPerTicket * board.unitYen);
    assert.equal(line.allocation.totalUnits, expanded.length * unitsPerTicket);
    assert.equal(line.allocation.totalYen, expectedTotal);
    assert.match(
      line.allocation.label,
      new RegExp(`1点あたり${unitsPerTicket}枚`)
    );

    totalPointCount += expanded.length;
    totalSuggestedYen += expectedTotal;
    allTickets.push(...expanded);
  });

  assert.equal(new Set(allTickets).size, allTickets.length, `${label}: 筋間重複なし`);
  assert.equal(board.totalPointCount, totalPointCount);
  assert.ok(board.totalPointCount <= board.maximumTotalPointCount);
  assert.equal(board.totalSuggestedYen, totalSuggestedYen);
  assert.ok(board.totalSuggestedYen <= board.maximumSuggestedYen);
}

assert.equal(
  typeof aiCore.buildLightManshuTicketBoard,
  "function",
  "表示専用ボードbuilderを公開APIにする"
);

const baseOptions = buildOptions();
const optionsBefore = JSON.stringify(baseOptions);
const board = aiCore.buildLightManshuTicketBoard(baseOptions);

assert.equal(
  JSON.stringify(baseOptions),
  optionsBefore,
  "ボード生成はformations・展開・艇評価の入力を変更しない"
);
assertBoardContract(board, "4カド波乱fixture");
assert.deepEqual(
  board.lines.map(line => line.kind),
  ["START_UPSET", "OUTER_FOLLOW", "ROAD_PICKUP"],
  "攻め切り・外の連動・道中拾いを別筋として最大3候補にする"
);
assert.ok(
  board.lines.some(line => line.formation.headBoatNos[0] === 4) &&
  board.lines.some(line => line.formation.headBoatNos[0] === 5) &&
  board.lines.some(line => line.formation.headBoatNos[0] === 6),
  "4・5・6号艇の根拠ある頭筋を同時に残せる"
);
assert.ok(
  board.lines.every(line => !line.formation.expandedTickets.includes("4-1-2")),
  "通常側の既存穴候補と重複するexact券を追加表示しない"
);
const scoredDetail = board.lines[0].ticketDetails[0];
const [, scoredSecond, scoredThird] = scoredDetail.ticket
  .split("-")
  .map(Number);
assert.equal(
  scoredDetail.positionScores.second,
  90 - scoredSecond,
  "2着優先度には総合scoreよりsecondScoreを使う"
);
assert.equal(
  scoredDetail.positionScores.third,
  86 - scoredThird,
  "3着優先度には総合scoreよりthirdScoreを使う"
);

const noisyBoard = aiCore.buildLightManshuTicketBoard({
  ...cloneJson(baseOptions),
  odds: {
    byTicket: Object.fromEntries(
      board.lines.flatMap(line =>
        line.formation.expandedTickets.map(ticket => [ticket, 999.9])
      )
    )
  },
  result: {
    settled: true,
    resultTicket: board.lines[0].formation.expandedTickets[0],
    payoutPer100: 999999,
    popularity: 120
  },
  officialResult: {
    trifecta: board.lines.at(-1).formation.expandedTickets.at(-1),
    payout: 888888
  },
  __officialResult: {
    resultTicket: board.lines[1].formation.expandedTickets[0]
  }
});
assert.deepEqual(
  boardDigest(noisyBoard),
  boardDigest(board),
  "オッズ・的中目・払戻・人気を与えても候補、順位、枚数を変えない"
);

const belowRoadBoard = aiCore.buildLightManshuTicketBoard({
  ...cloneJson(baseOptions),
  analyses: analyses({ 6: 64 })
});
assert.ok(belowRoadBoard);
assert.equal(
  belowRoadBoard.lines.some(line => line.kind === "ROAD_PICKUP"),
  false,
  "道中点65未満を道中浮上の頭筋にしない"
);

const reducedReasons = cloneJson(FOUR_ATTACK_REASONS);
reducedReasons[5] = ["4カド攻めで攻め場減少"];
const negativeScenario = scenario({
  reasons: reducedReasons,
  blockedBoats: [6],
  firstScores: { 4: 90, 5: 95, 6: 95 }
});
const negativeBoard = aiCore.buildLightManshuTicketBoard(
  buildOptions({
    fourAttack: negativeScenario,
    options: {
      raceScenarios: {
        mainScenario: negativeScenario,
        scenarios: [negativeScenario],
        roadRaceBoats: [6]
      }
    }
  })
);
assert.equal(
  negativeBoard,
  null,
  "攻め場減少の5号艇とblockedの6号艇で弱い2・3筋目を埋めない"
);

const weakAttackerScenario = scenario({
  score: 0,
  blockedBoats: [6],
  firstScores: { 4: 0, 5: 90, 6: 90 }
});
assert.equal(
  aiCore.buildLightManshuTicketBoard(
    buildOptions({
      fourAttack: weakAttackerScenario,
      options: {
        raceScenarios: {
          mainScenario: weakAttackerScenario,
          scenarios: [weakAttackerScenario],
          roadRaceBoats: [6]
        }
      }
    })
  ),
  null,
  "1着評価60未満の弱い攻め筋を3枚枠へ入れない"
);

assert.equal(
  aiCore.buildLightManshuTicketBoard({
    ...cloneJson(baseOptions),
    formations: {
      ...cloneJson(baseOptions.formations),
      mainEstablished: false
    }
  }),
  null,
  "正式主展開が成立しない時は参考ボードを作らない"
);

const threeReasons = {
  ...cloneJson(FOUR_ATTACK_REASONS),
  3: ["3コース攻め"],
  4: ["3攻めに連動して追走"],
  5: ["3攻めに乗るまくり差し"],
  6: ["最内差し・道中拾い"]
};
const threeAttack = scenario({
  type: "threeAttack",
  label: "3コース攻め",
  attackerCourse: 3,
  attackerBoatNo: 3,
  score: 75,
  reasons: threeReasons,
  firstScores: { 3: 92, 4: 82, 5: 78, 6: 70 }
});
const fourAttack = scenario({ score: 99 });
const pinnedStory = aiCore.buildLightManshuScenario({
  formations: {
    mainEstablished: true,
    longshot: ["4-1-5"]
  },
  raceScenarios: {
    mainScenario: fourAttack,
    scenarios: [fourAttack, threeAttack]
  },
  entries: entries(),
  analyses: analyses(),
  racerSkillTheory: { roles: [] },
  pinnedScenario: threeAttack
});
assert.ok(pinnedStory);
assert.equal(pinnedStory.trigger.scenarioType, "threeAttack");
assert.equal(pinnedStory.trigger.attackerBoatNo, 3);
assert.equal(
  pinnedStory.trigger.isMainScenario,
  false,
  "固定した別展開を主展開と誤表示しない"
);
const sameCoarseMain = scenario({
  label: "同じ攻め艇の主展開",
  score: 96
});
const sameCoarseTarget = scenario({
  label: "同じ攻め艇の別展開",
  score: 71,
  secondBoatNos: [1, 3, 5],
  thirdBoatNos: [1, 2, 5]
});
const clonedPinStory = aiCore.buildLightManshuScenario({
  formations: {
    mainEstablished: true,
    longshot: ["4-1-5"]
  },
  raceScenarios: {
    mainScenario: sameCoarseMain,
    scenarios: [sameCoarseMain, sameCoarseTarget]
  },
  entries: entries(),
  analyses: analyses(),
  racerSkillTheory: { roles: [] },
  pinnedScenario: cloneJson(sameCoarseTarget)
});
assert.ok(clonedPinStory);
assert.equal(
  clonedPinStory.trigger.scenarioLabel,
  "同じ攻め艇の別展開",
  "cloneされた固定展開も候補集合まで含む安定identityで照合する"
);

const savedInputs = require(path.join(
  __dirname,
  "../data/stats/local-water-v2-post-adoption-input-cache.json"
)).races;
let savedBoardCount = 0;
let savedLineCount = 0;
let savedAbSnapshotCount = 0;
const savedDisplayFixtures = [];

for (const savedRace of savedInputs) {
  const cleanInput = cloneJson(savedRace.api);
  const noisyInput = cloneJson(savedRace.api);
  noisyInput.odds = {
    byTicket: {
      "1-2-3": 1.1,
      "4-5-6": 9999.9,
      "6-5-4": 8888.8
    }
  };
  noisyInput.result = {
    settled: true,
    resultTicket: "6-5-4",
    payoutPer100: 999999,
    popularity: 120
  };
  noisyInput.officialResult = {
    trifecta: "4-5-6",
    payout: 888888
  };
  noisyInput.__officialResult = {
    resultTicket: "5-6-4",
    payoutPer100: 777777
  };

  const cleanPrediction = global.createPrediction(cleanInput);
  const noisyPrediction = global.createPrediction(noisyInput);
  const cleanBoard = cleanPrediction.lightManshuTicketBoard;
  const noisySavedBoard = noisyPrediction.lightManshuTicketBoard;
  const raceLabel = savedRace.raceKey;

  assert.deepEqual(
    boardDigest(noisySavedBoard),
    boardDigest(cleanBoard),
    `${raceLabel}: 保存済み事前入力でもオッズ・公式結果を参照しない`
  );
  assert.deepEqual(
    canonicalTicketDigest(noisyPrediction),
    canonicalTicketDigest(cleanPrediction),
    `${raceLabel}: 表示用ノイズでformations・ticketSheetsを変えない`
  );
  assert.equal(
    Object.hasOwn(cleanPrediction.formations || {}, "lightManshuTicketBoard"),
    false,
    `${raceLabel}: formationsへボードを混ぜない`
  );
  assert.equal(
    Object.hasOwn(cleanPrediction.formation || {}, "lightManshuTicketBoard") ||
      Object.hasOwn(
        cleanPrediction.aiCore?.formations || {},
        "lightManshuTicketBoard"
      ),
    false,
    `${raceLabel}: formation互換先やAIコアのformationへも混ぜない`
  );
  assert.equal(
    Object.hasOwn(cleanPrediction.ticketSheets || {}, "lightManshuTicketBoard"),
    false,
    `${raceLabel}: ticketSheetsへボードを混ぜない`
  );
  assert.equal(
    Object.hasOwn(cleanPrediction.manshuSheet || {}, "lightManshuTicketBoard"),
    false,
    `${raceLabel}: manshuSheetへボードを混ぜない`
  );
  assert.ok(
    (cleanPrediction.aiTicketList || []).every(row =>
      !Object.hasOwn(row || {}, "lightManshuTicketBoard")
    ),
    `${raceLabel}: aiTicketListへボードを混ぜない`
  );
  assert.deepEqual(
    cleanPrediction.aiCore?.lightManshuTicketBoard || null,
    cleanBoard || null,
    `${raceLabel}: root正本とaiCore互換ミラーを一致させる`
  );

  const selectionWithBoard = practicalSelection.select(cleanPrediction);
  const predictionWithoutBoard = {
    ...cleanPrediction,
    lightManshuTicketBoard: null,
    aiCore: {
      ...(cleanPrediction.aiCore || {}),
      lightManshuTicketBoard: null
    }
  };
  const selectionWithoutBoard = practicalSelection.select(
    predictionWithoutBoard
  );

  assert.deepEqual(
    practicalDigest(selectionWithBoard),
    practicalDigest(selectionWithoutBoard),
    `${raceLabel}: ボード有無で実戦厳選を変えない`
  );
  assert.deepEqual(
    noteGenerator.generateArticle(cleanPrediction),
    noteGenerator.generateArticle(predictionWithoutBoard),
    `${raceLabel}: ボード有無でnote本文・実戦券を変えない`
  );
  if (cleanBoard && savedAbSnapshotCount < 5) {
    assert.deepEqual(
      outerAttackShadow.buildSnapshot(cleanPrediction, {
        now: "2026-09-03T00:00:00.000Z"
      }),
      outerAttackShadow.buildSnapshot(predictionWithoutBoard, {
        now: "2026-09-03T00:00:00.000Z"
      }),
      `${raceLabel}: ボード有無で外攻めA/B全snapshotを変えない`
    );
    savedAbSnapshotCount += 1;
  }
  assert.equal(selectionWithBoard.normalMaximumCount, 7);
  assert.ok(
    selectionWithBoard.tickets.every(row =>
      row.displayOnly !== true &&
      row.advisoryOnly !== true &&
      row.source !== "ai-core-light-manshu-ticket-board-v1"
    ),
    `${raceLabel}: 通常最大7点・成立展開時最大10点へ参考券を加算しない`
  );

  if (!cleanBoard) continue;
  savedDisplayFixtures.push({
    raceLabel,
    board: cloneJson(cleanBoard),
    selection: cloneJson(selectionWithBoard)
  });
  savedBoardCount += 1;
  savedLineCount += cleanBoard.lines.length;
  assertBoardContract(cleanBoard, raceLabel);

  const canonicalTickets = new Set([
    ...ticketValues(cleanPrediction.formations?.main),
    ...ticketValues(cleanPrediction.formations?.cover),
    ...ticketValues(cleanPrediction.formations?.safety),
    ...ticketValues(cleanPrediction.formations?.flow),
    ...ticketValues(cleanPrediction.formations?.nagashi),
    ...ticketValues(cleanPrediction.formations?.hole),
    ...ticketValues(cleanPrediction.formations?.longshot),
    ...ticketValues(cleanPrediction.ticketSheets?.all),
    ...ticketValues(cleanPrediction.manshuSheet?.tickets)
  ]);
  assert.ok(
    cleanBoard.lines.every(line =>
      line.formation.expandedTickets.every(ticket =>
        !canonicalTickets.has(ticket)
      )
    ),
    `${raceLabel}: 通常シート・穴シートの既存券を参考ボードへ再掲しない`
  );
}

assert.ok(savedInputs.length > 0, "保存済み事前入力を読み込む");
assert.ok(savedBoardCount > 0, "保存済み事前入力でも複数筋ボードが成立する");
assert.ok(savedLineCount >= savedBoardCount * 2, "成立ボードは必ず2筋以上");
assert.equal(
  savedAbSnapshotCount,
  5,
  "保存入力5Rで外攻めA/B snapshot・fingerprint不変を直接確認する"
);

global.CHAPPY_RENDER_TEST_HOOKS = true;
global.window.addEventListener = () => {};
global.document = {
  body: {},
  getElementById() {
    return null;
  },
  querySelectorAll() {
    return [];
  }
};
require("../js/render");

const renderHooks = global.ChappyRenderTestHooks;
assert.equal(
  typeof renderHooks?.renderLightManshuTicketBoard,
  "function",
  "別枠ボードの描画hookを公開する"
);
let savedVisibleBoardCount = 0;
for (const fixture of savedDisplayFixtures) {
  const practicalTickets = new Set(
    ticketValues(fixture.selection?.tickets)
  );
  const boardTickets = fixture.board.lines.flatMap(
    line => line.formation.expandedTickets
  );
  const hasPracticalOverlap = boardTickets.some(
    ticket => practicalTickets.has(ticket)
  );
  const rendered = renderHooks.renderLightManshuTicketBoard({
    lightManshuTicketBoard: fixture.board,
    practicalSelection: fixture.selection
  });
  const shouldRender =
    fixture.selection?.status === "selected" &&
    !hasPracticalOverlap;

  assert.equal(
    Boolean(rendered),
    shouldRender,
    `${fixture.raceLabel}: 実戦券重複・見送り時はボード全体をfail-closedにする`
  );
  if (rendered) {
    savedVisibleBoardCount += 1;
    assert.ok(
      boardTickets.every(ticket =>
        !practicalTickets.has(ticket)
      ),
      `${fixture.raceLabel}: 表示可能ボードと実戦厳選を完全分離する`
    );
  }
}
assert.ok(
  savedVisibleBoardCount > 0,
  "保存済み事前入力に実戦券と分離した表示可能ボードがある"
);
const boardHtml = renderHooks.renderLightManshuTicketBoard({
  lightManshuTicketBoard: board,
  practicalSelection: { status: "selected" }
});
assert.match(boardHtml, /v3-light-manshu-ticket-board/);
assert.match(boardHtml, /取れたらいいな舟券/);
assert.match(boardHtml, /3筋/);
assert.match(
  boardHtml,
  /通常枠7点（成立展開追加時は全体10点）・実戦厳選・購入保存には加算しません/
);
assert.match(boardHtml, /1点あたり3枚/);
assert.match(boardHtml, /1点あたり2枚/);
assert.match(boardHtml, /1点あたり1枚/);
assert.match(boardHtml, /個別\d点を見る/);
assert.doesNotMatch(
  boardHtml,
  /OUTER_FOLLOW|ROAD_PICKUP|START_UPSET/,
  "内部の筋コードを利用者へ見せない"
);
assert.doesNotMatch(
  boardHtml.match(/v3-ticket-accordion-dream[^>]*>/)?.[0] || "",
  /\bopen\b/,
  "参考舟券は初期状態で折りたたむ"
);

const escapedBoard = cloneJson(board);
escapedBoard.title = "<b>取れたらいいな</b>";
escapedBoard.lines[0].reason =
  "<script>alert('x')</script>【説明末尾保持】";
const escapedHtml = renderHooks.renderLightManshuTicketBoard({
  lightManshuTicketBoard: escapedBoard,
  practicalSelection: { status: "selected" }
});
assert.doesNotMatch(escapedHtml, /<script>|<b>/);
assert.match(escapedHtml, /&lt;script&gt;/);
assert.match(escapedHtml, /【説明末尾保持】/);
assert.equal(
  renderHooks.renderLightManshuTicketBoard({
    lightManshuTicketBoard: board,
    practicalSelection: { status: "skipped" }
  }),
  "",
  "見送りレースには任意の追加参考舟券を表示しない"
);
for (const status of [undefined, "unavailable", "error"]) {
  const practicalSelectionValue = status
    ? { status }
    : undefined;
  assert.equal(
    renderHooks.renderLightManshuTicketBoard({
      lightManshuTicketBoard: board,
      practicalSelection: practicalSelectionValue
    }),
    "",
    `実戦厳選が${status || "未生成"}なら参考ボードをfail-closedにする`
  );
}
assert.equal(
  renderHooks.renderLightManshuTicketBoard({
    lightManshuTicketBoard: {
      ...cloneJson(board),
      lines: [cloneJson(board.lines[0])]
    },
    practicalSelection: { status: "selected" }
  }),
  "",
  "1筋しかない時はv1の既存穴説明だけを残す"
);
const reservedTicket = board.lines[0]
  .formation.expandedTickets[0];
assert.equal(
  renderHooks.renderLightManshuTicketBoard({
    lightManshuTicketBoard: board,
    practicalSelection: {
      status: "selected",
      tickets: [{ ticket: reservedTicket }]
    }
  }),
  "",
  "実戦厳選と重複する参考券は描画側でも非表示にする"
);
assert.equal(
  global.ChappyRenderAdapter.applyAiCoreAdapter({
    lightManshuTicketBoard: null,
    aiCore: {
      lightManshuTicketBoard: board
    }
  }).lightManshuTicketBoard,
  null,
  "トップレベル正本のnullをaiCore互換ミラーで復活させない"
);

console.log("light manshu ticket board tests passed");
console.log(`- 保存済み事前入力: ${savedInputs.length}R`);
console.log(`- ボード成立: ${savedBoardCount}R / ${savedLineCount}筋`);
console.log(`- 実戦厳選後に表示可能: ${savedVisibleBoardCount}R`);
console.log("- 通常予想・実戦厳選・購入候補への非接続: 合格");
console.log("- オッズ・公式結果非依存、最大3筋・2400円: 合格");
