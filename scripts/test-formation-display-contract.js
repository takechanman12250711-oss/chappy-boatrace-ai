"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const selector =
  require("../js/practical-selection");
const noteGenerator =
  require("../js/note-generator");
const {
  buildPredictionIndex,
  compactPracticalTicket:
    compactIndexPracticalTicket
} = require("./build-prediction-index");
const {
  buildPredictionSummary,
  compactPracticalTicket:
    compactSummaryPracticalTicket
} = require("./build-prediction-summaries");

const FROZEN_DATE = "20260813";
const FORBIDDEN_USER_TEXT =
  /流し|2連単/;
const DISPLAY_FIELDS = [
  "displayCategory",
  "scenarioType",
  "scenarioTitle",
  "scenarioSummary",
  "title",
  "summary",
  "reason",
  "comment"
];
const REPLAY_CASES = [{
  raceKey: "20260813-23-5",
  expectedTickets: [
    "2-1-3",
    "2-4-3",
    "2-3-4",
    "1-2-3",
    "1-2-6",
    "2-1-4",
    "2-1-5",
    "1-4-3",
    "2-3-1"
  ],
  expectedLabels: {
    "1-2-3": "順位ゲート補完",
    "2-1-4": "フォーメーション",
    "2-1-5": "フォーメーション",
    "1-4-3": "候補補完",
    "2-3-1": "候補補完"
  }
}, {
  raceKey: "20260813-23-2",
  expectedTickets: [
    "1-2-3",
    "1-4-3",
    "1-3-4",
    "2-1-5",
    "2-1-6",
    "1-2-4",
    "1-2-5",
    "1-2-6",
    "2-1-3",
    "2-1-4"
  ],
  expectedLabels: {
    "1-2-4": "フォーメーション",
    "1-2-5": "フォーメーション",
    "1-2-6": "独立展開",
    "2-1-3": "候補補完",
    "2-1-4": "候補補完"
  }
}];

const frozenPath = path.join(
  __dirname,
  "..",
  "data",
  "predictions",
  `${FROZEN_DATE}.json`
);
const runtimeLoaderSource =
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "js",
      "prediction-runtime-loader.js"
    ),
    "utf8"
  );
assert.match(
  runtimeLoaderSource,
  /const VERSION = "20260813-actual-course1"/,
  "表示修正版をブラウザへ確実に再読込させる"
);
const appRuntimeLoaderSource =
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "js",
      "app-runtime-loader.js"
    ),
    "utf8"
  );
const indexHtmlSource =
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "index.html"
    ),
    "utf8"
  );
assert.match(
  appRuntimeLoaderSource,
  /const VERSION = "20260813-actual-course1"/,
  "親ローダーも表示修正版を再読込させる"
);
assert.match(
  indexHtmlSource,
  /js\/app-runtime-loader\.js\?v=20260813-actual-course1/,
  "HTMLから親ローダーの新世代へ到達する"
);

const staleCompactTicket = {
  ticket: "2-3-1",
  category: "候補補完",
  displayCategory: "流し",
  scenarioType: "流し候補"
};
assert.equal(
  compactIndexPracticalTicket(
    staleCompactTicket
  ).displayCategory,
  "候補補完",
  "indexは旧表示名より最終分類を優先する"
);
assert.equal(
  compactSummaryPracticalTicket(
    staleCompactTicket
  ).displayCategory,
  "候補補完",
  "summaryはTier省略後も最終分類を保持する"
);
assert.equal(
  compactSummaryPracticalTicket(
    staleCompactTicket
  ).scenarioType,
  "フォーメーション候補",
  "summaryの展開名にも旧表示を残さない"
);
const publishedNoteSource =
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "notes",
      "20260813-21-08R.md"
    ),
    "utf8"
  );
assert.doesNotMatch(
  publishedNoteSource,
  FORBIDDEN_USER_TEXT,
  "公開済み最新noteにも禁則語を残さない"
);
const frozenDay = JSON.parse(
  fs.readFileSync(frozenPath, "utf8")
);
const frozenRows = [
  ...(frozenDay.predictions || []),
  ...(frozenDay.verificationPredictions || [])
];

function ticketValues(rows) {
  return rows.map(row =>
    String(row?.ticket || row || "")
  );
}

function replayInput(record) {
  const frozen =
    record?.prediction?.preRaceConditions;

  assert.ok(
    frozen &&
    Array.isArray(frozen.boats) &&
    frozen.boats.length === 6,
    `${record?.raceKey}: 6艇の締切前凍結入力`
  );
  assert.equal(
    frozen.officialResultUsed,
    false,
    `${record.raceKey}: 結果を再生入力へ混ぜない`
  );

  return {
    ...frozen,
    /*
      凍結契約は艇番をboatNoへ正規化して保存するため、
      production入口が使う枠番キーだけを同値で復元する。
    */
    entries: frozen.boats.map(boat => ({
      ...boat,
      waku: boat.boatNo
    })),
    boats: frozen.boats,
    date: record.date,
    jcd: record.jcd,
    stadiumCode: record.jcd,
    venueCode: record.jcd,
    place: record.place,
    stadiumName: record.place,
    placeName: record.place,
    venueName: record.place,
    raceNo: record.raceNo,
    rno: record.raceNo,
    deadlineAt: record.deadlineAt,
    weather: frozen.weather || {}
  };
}

function assertUserFacingText(rows, raceKey) {
  rows.forEach(row => {
    DISPLAY_FIELDS.forEach(field => {
      assert.doesNotMatch(
        String(row?.[field] || ""),
        FORBIDDEN_USER_TEXT,
        `${raceKey} ${row.ticket}: ${field}の禁則語`
      );
    });
    assert.ok(
      String(row.displayCategory || ""),
      `${raceKey} ${row.ticket}: 表示カテゴリ必須`
    );
  });
}

function assertAtomicFormation(rows, raceKey) {
  const formationRows = rows.filter(
    row => row.category === "流し"
  );

  assert.equal(
    formationRows.length,
    2,
    `${raceKey}: 正規フォーメーションは2券一組`
  );
  assert.ok(
    formationRows.every(row =>
      row.displayCategory ===
        "フォーメーション"
    ),
    `${raceKey}: 正規2券の表示カテゴリ`
  );
  assert.equal(
    new Set(
      formationRows.map(row =>
        row.ticket
          .split("-")
          .slice(0, 2)
          .join("-")
      )
    ).size,
    1,
    `${raceKey}: 正規2券は同じ1着・2着軸`
  );
}

function expectedCompact(rows) {
  return rows.map(row => ({
    ticket: row.ticket,
    displayCategory:
      row.displayCategory
  }));
}

function assertCompactContract(
  record,
  rows,
  directory
) {
  const replayRecord = {
    ...record,
    prediction: {
      ...record.prediction,
      practicalTickets: rows
    }
  };
  const day = {
    date: FROZEN_DATE,
    runs: [],
    predictions: [replayRecord],
    verificationPredictions: [],
    shadowV2Predictions: []
  };
  const caseDirectory = path.join(
    directory,
    record.raceKey
  );
  fs.mkdirSync(caseDirectory, {
    recursive: true
  });
  fs.writeFileSync(
    path.join(
      caseDirectory,
      `${FROZEN_DATE}.json`
    ),
    JSON.stringify(day),
    "utf8"
  );

  const compactExpected =
    expectedCompact(rows);
  const index =
    buildPredictionIndex(caseDirectory);
  const indexTickets =
    index.predictions[0]
      ?.prediction
      ?.practicalTickets || [];
  assert.deepEqual(
    expectedCompact(indexTickets),
    compactExpected,
    `${record.raceKey}: index compactで表示カテゴリと順番を保持`
  );

  const summary =
    buildPredictionSummary(day);
  const summaryTickets =
    summary.predictions[0]
      ?.prediction
      ?.practicalTickets || [];
  assert.deepEqual(
    expectedCompact(summaryTickets),
    compactExpected,
    `${record.raceKey}: summary compactで表示カテゴリと順番を保持`
  );
}

const temporaryDirectory =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "chappy-formation-display-"
    )
  );
const noteTexts = [];
const observedLabels = new Set();

try {
  REPLAY_CASES.forEach(replayCase => {
    const record = frozenRows.find(
      row =>
        row.raceKey ===
        replayCase.raceKey
    );
    assert.ok(
      record,
      `${replayCase.raceKey}: 凍結行`
    );

    const prediction =
      global.createPrediction(
        replayInput(record)
      );
    const selection =
      selector.select(prediction);
    const rows = selection.tickets || [];

    assert.equal(
      selection.status,
      "selected",
      `${record.raceKey}: production型再生`
    );
    assert.deepEqual(
      ticketValues(rows),
      replayCase.expectedTickets,
      `${record.raceKey}: 買い目配列・順番・点数を固定`
    );
    assertUserFacingText(
      rows,
      record.raceKey
    );
    assertAtomicFormation(
      rows,
      record.raceKey
    );

    for (
      const [ticket, label]
      of Object.entries(
        replayCase.expectedLabels
      )
    ) {
      const row = rows.find(item =>
        item.ticket === ticket
      );
      assert.equal(
        row?.displayCategory,
        label,
        `${record.raceKey} ${ticket}: ${label}表示`
      );
      observedLabels.add(label);
    }

    const article =
      noteGenerator.generateArticle(
        prediction,
        { date: FROZEN_DATE }
      );
    assert.equal(
      article.ok,
      true,
      `${record.raceKey}: note全文を生成`
    );
    assert.deepEqual(
      ticketValues(
        article.practicalTickets || []
      ),
      replayCase.expectedTickets,
      `${record.raceKey}: note生成でも買い目配列を変えない`
    );
    assert.doesNotMatch(
      article.fullText,
      FORBIDDEN_USER_TEXT,
      `${record.raceKey}: note全文の禁則語`
    );
    noteTexts.push(article.fullText);

    assertCompactContract(
      record,
      rows,
      temporaryDirectory
    );
  });
} finally {
  fs.rmSync(temporaryDirectory, {
    recursive: true,
    force: true
  });
}

assert.deepEqual(
  [...observedLabels].sort(),
  [
    "フォーメーション",
    "候補補完",
    "独立展開",
    "順位ゲート補完"
  ].sort(),
  "4種類のproduction表示契約をすべて再生する"
);

const combinedNotes = noteTexts.join("\n");
for (const label of observedLabels) {
  assert.match(
    combinedNotes,
    new RegExp(`［${label}］`),
    `note全文へ${label}を表示する`
  );
}

console.log(
  "formation display production contract: OK",
  JSON.stringify({
    date: FROZEN_DATE,
    races: REPLAY_CASES.map(
      item => item.raceKey
    ),
    pointCounts: REPLAY_CASES.map(
      item => item.expectedTickets.length
    ),
    labels: [...observedLabels]
  })
);
