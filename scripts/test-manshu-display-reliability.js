"use strict";

const assert = require("node:assert/strict");
const moduleApi = require("../js/manshu-display-reliability.js");

const prediction = {
  manshuSheet: { tickets: [] },
  ticketSheets: {
    hole: [
      {
        ticket: "4-1-5",
        category: "万舟",
        odds: 118.4,
        oddsText: "118.4倍",
        scenarioType: "取れたらいいな",
        scenarioSummary:
          "4カド攻めでスタートから波乱。4号艇が攻め切るなら先頭。1号艇が内で残って2着、5号艇が攻めについて行って3着。4-1-5の攻め筋で決着。"
      },
      { ticket: "5-1-3", category: "穴候補" }
    ]
  },
  practicalSelection: { status: "selected" }
};

const fallback = moduleApi.firstFallbackTicket(prediction);
assert.equal(moduleApi.ticketOf(fallback), "4-1-5");
const normalized = moduleApi.normalizeCandidate(fallback);
assert.equal(normalized.category, "万舟");
assert.equal(normalized.oddsText, "118.4倍");
assert.equal(normalized.scenarioType, "取れたらいいな");
const fallbackHtml = moduleApi.candidateBody(normalized);
assert.match(fallbackHtml, /取れたらいいな/);
assert.match(fallbackHtml, /スタートから波乱/);
assert.match(fallbackHtml, /4-1-5の攻め筋/);
assert.match(fallbackHtml, /4.*1.*5/s);
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
assert.notEqual(
  moduleApi.candidateSignature(normalized),
  moduleApi.candidateSignature({
    ...normalized,
    scenarioSummary:
      `${normalized.scenarioSummary} 道中で入れ替わる可能性。`
  }),
  "同じ券でも筋説明が変われば表示を更新する"
);

assert.equal(
  moduleApi.ticketOf(
    moduleApi.firstFallbackTicket({
      manshuSheet: {
        tickets: [{
          ticket: "6-1-2",
          odds: 120.1,
          category: "穴候補",
          scenarioSummary: "6号艇の展開突き。"
        }]
      },
      practicalSelection: { status: "selected" }
    })
  ),
  "6-1-2",
  "表示境界で万舟欄だけ空になっても、取得済み100倍以上の候補を復元する"
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
        if (selector === ":scope > .v3-root") return this;
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
  "通常候補または複数参考筋が描画済みの万舟欄は1点fallbackで上書きしない"
);

for (const renderedSelector of [
  ".chappy-scenario-manshu-board",
  ".chappy-true-manshu-board",
  ".chappy-manshu-formation-board",
  ".v3-light-manshu-ticket-board"
]) {
  const integratedSection = {
    querySelector(selector) {
      return selector.includes(renderedSelector) ? { dataset: {} } : null;
    }
  };
  const integratedDocument = {
    getElementById(id) {
      if (id !== "resultArea") return null;
      return {
        querySelector(selector) {
          if (selector === ":scope > .v3-root") return this;
          return selector === ".v3-manshu-newspaper"
            ? integratedSection
            : null;
        }
      };
    }
  };
  assert.equal(
    moduleApi.apply(prediction, integratedDocument),
    false,
    `${renderedSelector} の正常な万舟表示を1点fallbackで上書きしない`
  );
}

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
  "",
  "オッズ未取得の旧formation文字列を万舟として復元しない"
);

for (const odds of [undefined, null, "", 99.9, 0]) {
  assert.equal(moduleApi.firstFallbackTicket({
    manshuSheet:{tickets:[{ticket:"6-1-2",odds}]},
    practicalSelection:{status:"selected"}
  }),null,"未取得または100倍未満を万舟として復元しない");
}
assert.equal(moduleApi.ticketOf(moduleApi.firstFallbackTicket({
  formation:{manshu:[{ticket:"5-2-1",odds:100}]},
  practicalSelection:{status:"selected"}
})),"5-2-1","オッズ取得済みの保存formationは100倍を境界として復元する");

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
        if (selector === ":scope > .v3-root") return this;
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
      if (selector === ":scope > .v3-root") return this;
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

  // Control queued work independently of the production guard. Each render
  // owns a different root, as the real renderer does via resultArea.innerHTML.
  const queue = [];
  let notify, current = null, unexpectedCreation = 0;
  const layouts = [];
  function layout() {
    const node = { writes: 0, dataset: {}, html: "", visible: false };
    const body = { set innerHTML(value) { node.html = value; node.writes++; node.visible = true; } };
    const section = { dataset: {}, querySelector(selector) {
      if (selector.includes(":not(")) return null;
      if (selector === ".v3-section-body") return body;
      if (selector === "[data-manshu-display-fallback='true']") return node.visible ? {} : null;
      return null;
    }};
    node.querySelector = selector => selector === ".v3-manshu-newspaper" ? section : null;
    layouts.push(node);
    return node;
  }
  const area = { dataset: {}, querySelector(selector) {
    if (selector === ":scope > .v3-root") return current;
    return current?.querySelector(selector) || null;
  }, appendChild() { unexpectedCreation++; } };
  const documentFixture = { getElementById: id => id === "resultArea" ? area : null,
    createElement() { unexpectedCreation++; throw Error("fallback created outside current root"); } };
  const rootFixture = { document: documentFixture,
    renderAll(p) { current = p ? layout() : null; return "rendered"; },
    renderPrediction(p) { current = p ? layout() : null; return "alias"; },
    queueMicrotask: fn => queue.push(fn), addEventListener() {},
    MutationObserver: class { constructor(callback) { notify = callback; } observe() {} }
  };
  function flush() {
    let count = 0;
    while (queue.length) { assert(++count < 50, "queued callbacks settle"); queue.shift()(); }
  }
  const before = JSON.stringify(prediction);
  assert.equal(moduleApi.install(rootFixture), true);
  assert.equal(rootFixture.renderAll(prediction), "rendered");
  const cancelled = current;
  current = null;
  flush(); notify([]); flush();
  assert.equal(cancelled.writes, 0, "reset before render callback cancels that old prediction");
  assert.equal(moduleApi.apply(prediction, documentFixture), false, "status-only area has no prediction root");
  assert.equal(unexpectedCreation, 0, "reset never creates a detached legacy section");

  rootFixture.renderAll(prediction);
  const a = current;
  const nextPrediction = { ticketSheets: { hole: [{ ticket: "6-2-1", odds: 221 }] }, practicalSelection: {status:"selected"} };
  assert.equal(rootFixture.renderPrediction(nextPrediction), "alias");
  const b = current;
  flush();
  assert.equal(a.writes, 0, "queued A cannot write into a later B root");
  assert.equal(b.writes, 1, "discarding A does not suppress the new root's own fallback");
  assert.match(b.html, /221倍/);
  notify([]); flush();
  assert.equal(b.writes, 1, "current observer is idempotent");

  // A queued observer runs only for the still-current render, including when
  // render B overtakes it before its callback is drained.
  notify([]);
  rootFixture.renderAll(prediction);
  const c = current;
  flush();
  assert.equal(c.writes, 1, "an old observer reservation does not strand a new render");
  notify([]); current = null; flush();
  current = layout(); notify([]); flush();
  assert.equal(current.writes, 0, "unrendered replacement root cannot inherit the last race");

  rootFixture.renderAll(prediction); flush();
  const removed = current;
  removed.visible = false;
  notify([{removedNodes:[removed]}]); flush();
  assert.equal(removed.writes, 1, "remove-and-reattach of the same root still expires that render");
  notify([]); flush();
  assert.equal(removed.writes, 1, "expired root stays expired after another mutation");
  rootFixture.renderAll(prediction); flush();
  const recover = current;
  recover.visible = false; notify([]); flush();
  assert.equal(recover.writes, 2, "normal empty legacy UI in the current root still recovers");

  rootFixture.renderAll(prediction);
  const loading = current;
  area.dataset.raceLoading = "true";
  flush(); delete area.dataset.raceLoading; notify([]); flush();
  assert.equal(loading.writes, 0, "a superseding loading phase expires pending fallback");
  rootFixture.renderAll(prediction); rootFixture.renderAll(null); flush();
  assert.equal(current, null, "empty render invalidates earlier queued work");
  assert.equal(JSON.stringify(prediction), before, "root lifecycle repair does not mutate tickets or prediction");
  assert.equal(unexpectedCreation, 0);

  console.log("万舟表示フォールバック回帰テスト: 合格");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
