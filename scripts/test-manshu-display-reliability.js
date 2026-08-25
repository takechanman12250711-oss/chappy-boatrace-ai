"use strict";

const assert = require("node:assert/strict");
const moduleApi = require("../js/manshu-display-reliability.js");

const prediction = {
  manshuSheet: { tickets: [] },
  ticketSheets: {
    hole: [
      {
        ticket: "4-1-2",
        category: "万舟",
        odds: 118.4,
        oddsText: "118.4倍",
        scenarioSummary: "4号艇のカド攻めから1号艇を残す。"
      },
      { ticket: "5-1-3", category: "穴候補" }
    ]
  },
  practicalSelection: { status: "selected" }
};

const fallback = moduleApi.firstFallbackTicket(prediction);
assert.equal(moduleApi.ticketOf(fallback), "4-1-2");
const normalized = moduleApi.normalizeCandidate(fallback);
assert.equal(normalized.category, "万舟");
assert.equal(normalized.oddsText, "118.4倍");
const fallbackHtml = moduleApi.candidateBody(normalized);
assert.match(fallbackHtml, /4号艇のカド攻め/);
assert.match(fallbackHtml, /data-manshu-display-fallback="true"/);
assert.match(fallbackHtml, /<span>候補<\/span>/);
assert.equal(
  fallbackHtml.includes("<h3>万舟"),
  false,
  "万舟見出しを内側で重複表示しない"
);
assert.equal(
  moduleApi.candidateSignature(normalized),
  moduleApi.candidateSignature({ ...normalized }),
  "同じ表示候補は安定した署名になる"
);
assert.notEqual(
  moduleApi.candidateSignature({
    ...normalized,
    odds: 99,
    oddsText: "取得済み"
  }),
  moduleApi.candidateSignature({
    ...normalized,
    odds: 100,
    oddsText: "取得済み"
  }),
  "万舟判定の境界を跨ぐオッズ更新は表示署名を変える"
);

assert.equal(
  moduleApi.ticketOf(
    moduleApi.firstFallbackTicket({
      manshuSheet: {
        tickets: [{
          ticket: "6-1-2",
          category: "穴候補",
          scenarioSummary: "6号艇の展開突き。"
        }]
      },
      practicalSelection: { status: "selected" }
    })
  ),
  "6-1-2",
  "表示境界で万舟欄だけ空になっても、予想本体に保持した候補を復元する"
);

const normalManshuSection = {
  querySelector(selector) {
    if (selector.includes(":not(")) return { dataset: {} };
    return null;
  }
};
const normalManshuDocument = {
  getElementById(id) {
    if (id !== "resultArea") return null;
    return {
      querySelector(selector) {
        return selector === ".v3-manshu-newspaper"
          ? normalManshuSection
          : null;
      }
    };
  }
};
assert.equal(
  moduleApi.apply(prediction, normalManshuDocument),
  false,
  "通常描画済みの万舟行は上書きしない"
);

assert.equal(
  moduleApi.firstFallbackTicket({
    ...prediction,
    practicalSelection: { status: "skipped" }
  }),
  null,
  "見送りレースへ購入候補を復元しない"
);

assert.equal(
  moduleApi.ticketOf(
    moduleApi.firstFallbackTicket({
      manshuSheet: { tickets: [] },
      formation: { manshu: ["5-2-1"] },
      practicalSelection: { status: "selected" }
    })
  ),
  "5-2-1",
  "候補シートがない保存形式でもformationから復元する"
);

let fallbackWrites = 0;
let fallbackVisible = false;
const fallbackBody = {
  set innerHTML(value) {
    this.value = value;
    fallbackWrites += 1;
    fallbackVisible = true;
  }
};
const fallbackSection = {
  dataset: {},
  querySelector(selector) {
    if (selector.includes(":not(")) return null;
    if (selector === ".v3-section-body") return fallbackBody;
    if (selector === "[data-manshu-display-fallback='true']") {
      return fallbackVisible ? { dataset: { manshuDisplayFallback: "true" } } : null;
    }
    return null;
  }
};
const fallbackDocument = {
  getElementById(id) {
    if (id !== "resultArea") return null;
    return {
      querySelector(selector) {
        return selector === ".v3-manshu-newspaper"
          ? fallbackSection
          : null;
      }
    };
  }
};

assert.equal(moduleApi.apply(prediction, fallbackDocument), true);
assert.equal(fallbackWrites, 1);
assert.equal(
  moduleApi.apply(prediction, fallbackDocument),
  false,
  "同じフォールバック表示をMutationObserver経由で再適用してもDOMを書き換えない"
);
assert.equal(
  fallbackWrites,
  1,
  "同一候補の再適用でinnerHTML書換えを連鎖させない"
);
assert.equal(
  moduleApi.apply({
    ...prediction,
    ticketSheets: {
      hole: [{
        ...prediction.ticketSheets.hole[0],
        oddsText: "120.1倍"
      }]
    }
  }, fallbackDocument),
  true,
  "表示内容が変わった場合だけフォールバック行を更新する"
);
assert.equal(fallbackWrites, 2);

(async () => {
  let observerCallback = null;
  let observerWrites = 0;
  let observerFallbackVisible = false;
  const observerBody = {
    set innerHTML(value) {
      this.value = value;
      observerWrites += 1;
      observerFallbackVisible = true;
      if (observerCallback) queueMicrotask(() => observerCallback([]));
    }
  };
  const observerSection = {
    dataset: {},
    querySelector(selector) {
      if (selector.includes(":not(")) return null;
      if (selector === ".v3-section-body") return observerBody;
      if (selector === "[data-manshu-display-fallback='true']") {
        return observerFallbackVisible ? {} : null;
      }
      return null;
    }
  };
  const observerResultArea = {
    querySelector(selector) {
      return selector === ".v3-manshu-newspaper"
        ? observerSection
        : null;
    }
  };
  const observerRoot = {
    document: {
      getElementById(id) {
        return id === "resultArea" ? observerResultArea : null;
      }
    },
    renderAll() {
      return true;
    },
    addEventListener() {},
    queueMicrotask,
    MutationObserver: class {
      constructor(callback) {
        observerCallback = callback;
      }

      observe() {}
    }
  };

  assert.equal(moduleApi.install(observerRoot), true);
  assert.equal(observerRoot.renderAll(prediction), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(
    observerWrites,
    1,
    "MutationObserverが自分の書換えを検知してもmicrotask連鎖を終了する"
  );

  console.log("万舟表示フォールバック回帰テスト: 合格");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
