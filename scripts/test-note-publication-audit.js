"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { auditNotePublication } = require("./note-publication-audit");
const { saveNoteDraftBundle } = require("./note-draft-bundle");

global.window = global;
global.ChappyPracticalSelection = {
  createPracticalSelection(prediction) {
    return structuredClone(prediction.practicalTickets);
  }
};
const noteGenerator = require("../js/note-generator");

const NOW = "2026-09-10T03:45:00.000Z";
const TICKETS = [
  "1-2-3", "1-2-4", "1-3-2", "2-1-3", "2-1-4",
  "1-2-6", "3-1-2", "1-2-5", "1-3-4", "1-4-3", "1-4-5"
];

function fixture(count = 8) {
  const practicalTickets = TICKETS.slice(0, count).map((ticket, index) => ({
    ticket,
    odds: 12.5 + index,
    category: "実戦候補",
    comment: "保存済みの展開判断に基づく候補。"
  }));
  const prediction = {
    date: "20260910",
    race: {
      date: "20260910",
      jcd: "23",
      stadiumName: "唐津",
      raceNo: 10,
      raceInfo: { deadline: "12:55" }
    },
    confidence: 84,
    manshuPower: 23,
    venue: { name: "唐津", water: "淡水" },
    weather: { windDirection: "北", windSpeed: 2, waveHeight: 1 },
    raceFlow: {
      title: "イン逃げ本線",
      summary: "2号艇は2着残し。別展開では2号艇が3着を拾う。"
    },
    mainSheet: {
      honmei: { boatNo: 1, name: "1号艇", course: 1 },
      taikou: { boatNo: 2, name: "2号艇" },
      ana: { boatNo: 3, name: "3号艇" },
      osae: { boatNo: 4, name: "4号艇" },
      evaluations: [84, 78, 75, 72, 68, 65].map((score, index) => ({
        boatNo: index + 1,
        name: `${index + 1}号艇`,
        course: index + 1,
        className: "A1",
        score,
        shortComment: index === 0 ? "頭候補" : "展開に応じて評価"
      })),
      tickets: structuredClone(practicalTickets.slice(0, 3)),
      coverTickets: structuredClone(practicalTickets.slice(3, 5)),
      flowTickets: structuredClone(practicalTickets.slice(5))
    },
    manshuSheet: { tickets: [], candidates: [] },
    practicalTickets,
    dataQuality: { level: "高", boatIdentity: { valid: true } }
  };
  const article = noteGenerator.generateArticle(prediction);
  assert.equal(article.publishable, true, "generator fixture must remain valid");
  return {
    article,
    record: {
      date: "20260910",
      jcd: "23",
      place: "唐津",
      raceNo: 10,
      raceKey: "20260910-23-10",
      deadlineAt: "2026-09-10T03:55:00.000Z",
      prediction: structuredClone(prediction)
    },
    baselinePracticalTickets: structuredClone(practicalTickets),
    now: NOW
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function replaceSection(article, field, transform) {
  const previous = article[field];
  article[field] = transform(previous);
  article.fullText = article.fullText.replace(previous, article[field]);
}

let assertions = 0;
function ready(name, input) {
  const result = auditNotePublication(input);
  assert.equal(result.contentReady, true, `${name}: ${JSON.stringify(result.issues)}`);
  assert.equal(result.status, "ready_for_review", name);
  assert.equal(result.canPublish, false, "quality approval never authorizes publication");
  assert.equal(result.automaticPublicationEnabled, false, name);
  assert.match(result.articleSha256, /^[a-f0-9]{64}$/, name);
  assert.equal(result.raceKey, "20260910-23-10", name);
  assert.equal(result.auditedAt, NOW, name);
  assert.deepEqual(result.issues, [], name);
  assertions += 1;
  return result;
}

function blocked(name, mutate, input = fixture()) {
  mutate(input);
  const result = auditNotePublication(input);
  assert.equal(result.contentReady, false, name);
  assert.ok(["blocked", "audit_error"].includes(result.status), name);
  assert.equal(result.canPublish, false, name);
  assert.equal(result.automaticPublicationEnabled, false, name);
  assert.ok(Array.isArray(result.issues) && result.issues.length > 0, name);
  result.issues.forEach(issue => {
    assert.equal(typeof issue.code, "string", name);
    assert.equal(typeof issue.message, "string", name);
  });
  assertions += 1;
  return result;
}

for (const count of [8, 9, 10]) ready(`${count} practical tickets`, fixture(count));
blocked("11 practical tickets exceed unchanged maximum", () => {}, fixture(11));
blocked("stricter configured maximum is applied", input => { input.maxPracticalTickets = 7; });
blocked("configuration cannot raise the ten-ticket maximum", input => { input.maxPracticalTickets = 11; });
blocked("configuration cannot disable the deadline buffer", input => { input.minLeadSeconds = 0; });
blocked("missing source deadline", input => { delete input.record.deadlineAt; });
blocked("invalid source deadline", input => { input.record.deadlineAt = "not-a-date"; });
blocked("unknown rendered deadline", input => {
  input.article.meta.deadline = "締切時刻未取得";
  replaceSection(input.article, "freeText", text => text.replace("締切 12:55", "締切時刻未取得"));
});
blocked("rendered deadline differs from source", input => {
  input.article.meta.deadline = "12:56";
  replaceSection(input.article, "freeText", text => text.replace("12:55", "12:56"));
});
blocked("rendered deadline differs from article metadata", input => {
  replaceSection(input.article, "freeText", text => text.replace("12:55", "12:56"));
});
blocked("deadline already passed", input => { input.now = "2026-09-10T03:56:00.000Z"; });
blocked("deadline is too close", input => { input.now = "2026-09-10T03:54:00.000Z"; });
blocked("deadline falls on another JST date", input => { input.record.deadlineAt = "2026-09-11T03:55:00.000Z"; });
blocked("invalid current time", input => { input.now = "not-a-date"; });

for (const odds of [undefined, 0, -1, NaN, Infinity]) {
  blocked(`invalid practical odds ${String(odds)}`, input => {
    input.article.practicalTickets[0].odds = odds;
    input.record.prediction.practicalTickets[0].odds = odds;
    input.baselinePracticalTickets[0].odds = odds;
  });
}
blocked("article odds differ from saved prediction", input => { input.article.practicalTickets[0].odds = 99.9; });
blocked("rendered odds differ from source", input => {
  replaceSection(input.article, "paidText", text => text.replaceAll("12.5倍", "99.9倍"));
});
blocked("rendered missing odds are not publishable", input => {
  replaceSection(input.article, "paidText", text => text.replaceAll("12.5倍", "オッズ未取得"));
});
blocked("article practical ticket changes", input => { input.article.practicalTickets[0].ticket = "6-5-4"; });
blocked("article practical ticket ordering changes", input => {
  [input.article.practicalTickets[0], input.article.practicalTickets[1]] =
    [input.article.practicalTickets[1], input.article.practicalTickets[0]];
});
blocked("independent baseline differs", input => { input.baselinePracticalTickets[0].ticket = "6-5-4"; });
blocked("saved prediction differs from independent baseline", input => {
  input.record.prediction.practicalTickets[0].ticket = "6-5-4";
});
blocked("missing independent baseline", input => { delete input.baselinePracticalTickets; });
blocked("duplicate boats cannot form a trifecta", input => {
  input.article.practicalTickets[0].ticket = "1-1-3";
  input.record.prediction.practicalTickets[0].ticket = "1-1-3";
  input.baselinePracticalTickets[0].ticket = "1-1-3";
  replaceSection(input.article, "paidText", text => text.replaceAll("1-2-3", "1-1-3"));
});
blocked("duplicate practical ticket", input => {
  input.article.practicalTickets[1] = structuredClone(input.article.practicalTickets[0]);
  input.record.prediction.practicalTickets[1] = structuredClone(input.record.prediction.practicalTickets[0]);
  input.baselinePracticalTickets[1] = structuredClone(input.baselinePracticalTickets[0]);
});
blocked("displayed practical count differs", input => {
  replaceSection(input.article, "paidText", text => text.replace("厳選買い目　8点", "厳選買い目　7点"));
});
blocked("rendered practical ticket differs", input => {
  replaceSection(input.article, "paidText", text => {
    const marker = "🔥 実戦厳選買い目";
    const split = text.indexOf(marker);
    return text.slice(0, split) + text.slice(split).replace("1-2-3", "6-5-4");
  });
});

blocked("fullText no longer contains its free section", input => {
  input.article.fullText = input.article.fullText.replace("締切 12:55", "締切 12:56");
});
blocked("fullText no longer contains its paid section", input => {
  input.article.fullText = input.article.fullText.replace("🔥 実戦厳選買い目", "買い目削除済み");
});
blocked("missing paywall", input => {
  input.article.fullText = input.article.fullText.replace(input.article.paywallMarker, "");
});
blocked("duplicate paywall", input => { input.article.fullText += `\n${input.article.paywallMarker}`; });
blocked("free section leaks a concrete trifecta", input => {
  replaceSection(input.article, "freeText", text => `${text}\n買い目は1-2-3です。`);
});
blocked("free section leaks a full-width trifecta", input => {
  replaceSection(input.article, "freeText", text => `${text}\n買い目は１－２－３です。`);
});
for (const formation of ["1-23-全", "12-345-全", "1-全-全", "１２－３４５－全", "1-23-ALL"]) {
  const report = blocked(`free section leaks wildcard formation ${formation}`, input => {
    replaceSection(input.article, "freeText", text => `${text}\n買い目は${formation}です。`);
  });
  assert.ok(report.issues.some(issue => issue.code === "FREE_TICKET_LEAK"), formation);
}
const unsupportedPaid = blocked("unsupported paid ticket outside the practical section", input => {
  replaceSection(input.article, "paidText", text => `${text}\n\n追加買い目：6-5-4を購入対象とする。`);
});
assert.ok(unsupportedPaid.issues.some(issue => issue.code === "UNSOURCED_CANDIDATE_TICKET"));
const unsupportedReference = blocked("unsupported paid ticket cannot claim a separate ledger", input => {
  replaceSection(input.article, "paidText", text => `${text}\n\n【参考・別会計】\n・6-5-4\nこの買い目も購入します。`);
});
assert.ok(unsupportedReference.issues.some(issue => issue.code === "UNSOURCED_REFERENCE_TICKET"));
blocked("article race differs from saved race", input => { input.article.meta.raceNo = 11; });
blocked("article date differs from saved race", input => { input.article.meta.date = "20260911"; });
blocked("article venue differs from saved race", input => { input.article.meta.place = "琵琶湖"; });
blocked("record key differs from its race", input => { input.record.raceKey = "20260910-23-11"; });
blocked("record venue code differs from its race key", input => { input.record.jcd = "11"; });
blocked("unpublishable generator result", input => { input.article.publishable = false; });
blocked("missing saved practical list", input => { delete input.record.prediction.practicalTickets; });
blocked("missing one boat evaluation", input => {
  replaceSection(input.article, "paidText", text => text.replace(/^6号艇[^\n]*\n/m, ""));
});
blocked("duplicate boat evaluation", input => {
  replaceSection(input.article, "paidText", text => text.replace(/^6号艇/m, "5号艇"));
});

const withReferences = fixture();
withReferences.record.prediction.manshuSheet.forecastLedger = {
  forecasts: [{
    formation: { notation: "4-1-25", expandedTickets: ["4-1-2", "4-1-5"] }
  }]
};
replaceSection(withReferences.article, "paidText", text => `${text}\n\n【参考・別会計】\n・4-1-25\n内訳 4-1-2、4-1-5\n参考買い目は実戦厳選点数へ加算しません。`);
ready("separate reference formations do not inflate practical count", withReferences);
const missingReferenceSource = blocked("reference formations require a saved independent source", input => {
  delete input.record.prediction.manshuSheet.forecastLedger;
}, structuredClone(withReferences));
assert.ok(missingReferenceSource.issues.some(issue => issue.code === "UNSOURCED_REFERENCE_TICKET"));
const articleClaimedSource = blocked("article-only reference provenance is not trusted", input => {
  input.article.manshuSheet = {
    forecastLedger: structuredClone(input.record.prediction.manshuSheet.forecastLedger)
  };
  delete input.record.prediction.manshuSheet.forecastLedger;
}, structuredClone(withReferences));
assert.ok(articleClaimedSource.issues.some(issue => issue.code === "UNSOURCED_REFERENCE_TICKET"));

const immutableInput = fixture();
const immutableSnapshot = structuredClone(immutableInput);
deepFreeze(immutableInput);
const first = ready("deeply frozen input", immutableInput);
assert.deepEqual(immutableInput, immutableSnapshot, "audit must not mutate source or article");
assert.deepEqual(auditNotePublication(immutableInput), first, "same input and clock must be deterministic");

for (const invalid of [undefined, null, {}, [], "bad input", { article: null }]) {
  const result = auditNotePublication(invalid);
  assert.equal(result.contentReady, false, "invalid input must fail closed without throwing");
  assert.equal(result.canPublish, false);
  assert.equal(result.automaticPublicationEnabled, false);
  assert.ok(result.issues.length > 0);
  assertions += 1;
}

// Execute only the collector's audit guard: never load its network/collection entrypoint.
const collectorSource = fs.readFileSync(path.join(__dirname, "collect-predictions.js"), "utf8");
const guardMarker = "// Audit metadata must not change selection, drafts, or collection availability.";
const guardStart = collectorSource.indexOf(guardMarker);
const guardEnd = collectorSource.indexOf("\n  }\n\n  if (!dryRun)", guardStart);
assert.ok(guardStart >= 0 && guardEnd > guardStart, "collector audit guard must be identifiable");
assert.equal(collectorSource.indexOf(guardMarker, guardStart + 1), -1, "collector guard must be unique");
const collectorGuard = collectorSource.slice(guardStart, guardEnd);
class FixedAuditDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
}
for (const mode of ["normal", "require_failure", "auditor_failure"]) {
  const input = fixture();
  const article = deepFreeze(input.article);
  const selectedBase = deepFreeze({ prediction: { practicalTickets: input.baselinePracticalTickets } });
  const selectedData = {
    ...input.record,
    prediction: deepFreeze(input.record.prediction),
    note: { publishable: true, title: article.title, rejectionReasons: Object.freeze([]) }
  };
  const before = structuredClone({ selectedData, selectedBase, article });
  const warnings = [];
  const auditCalls = [];
  vm.runInNewContext(collectorGuard, {
    selectedData, selectedBase, article,
    charter: deepFreeze({ shadowSelectionV2: { cutoffSeconds: 120 }, practicalTickets: { maximum: 10 } }),
    Date: FixedAuditDate,
    console: { warn: message => warnings.push(message) },
    require(moduleName) {
      assert.equal(moduleName, "./note-publication-audit", "guard must not load any other module");
      if (mode === "require_failure") throw new Error("synthetic unavailable auditor");
      return {
        auditNotePublication(payload) {
          auditCalls.push(payload);
          if (mode === "auditor_failure") throw new Error("synthetic audit error");
          return auditNotePublication(payload);
        }
      };
    }
  }, { timeout: 1000 });
  const { audit, ...originalNoteFields } = selectedData.note;
  assert.deepEqual({ ...selectedData, note: originalNoteFields }, before.selectedData, `${mode}: saved prediction unchanged`);
  assert.deepEqual(selectedBase, before.selectedBase, `${mode}: independent baseline unchanged`);
  assert.deepEqual(article, before.article, `${mode}: article unchanged`);
  assert.equal(audit.status, mode === "normal" ? "ready_for_review" : "audit_error", mode);
  assert.equal(audit.contentReady, mode === "normal", mode);
  assert.equal(audit.canPublish, false, mode);
  assert.equal(audit.automaticPublicationEnabled, false, mode);
  assert.equal(audit.auditedAt, NOW, mode);
  assert.equal(audit.raceKey, selectedData.raceKey, mode);
  assert.equal(warnings.length, mode === "normal" ? 0 : 1, mode);
  assert.equal(auditCalls.length, mode === "require_failure" ? 0 : 1, mode);
  if (auditCalls.length) {
    assert.equal(auditCalls[0].baselinePracticalTickets, selectedBase.prediction.practicalTickets);
    assert.equal(auditCalls[0].article, article);
    assert.equal(auditCalls[0].record, selectedData);
    assert.equal(auditCalls[0].minLeadSeconds, 120);
    assert.equal(auditCalls[0].maxPracticalTickets, 10);
  }
  if (mode !== "normal") assert.equal(audit.issues[0].code, "AUDIT_EXECUTION_FAILED");
  assertions += 1;
}

// Exercise the actual collector save block without running collection or network calls.
const saveStart = collectorSource.indexOf("  if (!dryRun)", guardEnd);
const saveEnd = collectorSource.indexOf("\n\n  console.log(", saveStart);
assert.ok(saveStart > guardEnd && saveEnd > saveStart, "collector save block must be identifiable");
const collectorSave = collectorSource.slice(saveStart, saveEnd);
for (const mode of ["saved", "blocked", "missing_baseline", "dry_run", "no_selection", "rejected", "require_failure", "store_failure"]) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-note-collector-save-"));
  try {
    const input = fixture();
    input.record.selectedAt = NOW;
    if (mode === "blocked") delete input.record.deadlineAt;
    if (mode === "missing_baseline") delete input.baselinePracticalTickets;
    if (mode === "rejected") input.article.publishable = false;
    const originalAudit = auditNotePublication(input);
    const selectedData = mode === "no_selection" ? null : {
      ...input.record,
      note: { publishable: input.article.publishable, audit: originalAudit }
    };
    const selectedBase = { prediction: { practicalTickets: input.baselinePracticalTickets } };
    const comparison = [{ fixture: "comparison" }];
    const verificationPredictions = [selectedBase];
    const shadowV2Predictions = [{ fixture: "shadow" }];
    const collectionHealth = { fixture: "health" };
    const best = { jcd: "23", raceNo: 10 };
    const before = structuredClone({ input, selectedBase });
    const warnings = [];
    let noteSaves = 0;
    let runSaves = 0;
    let bundleCalls = 0;
    vm.runInNewContext(collectorSave, {
      dryRun: mode === "dry_run", selectedData, selectedBase, article: input.article,
      date: input.record.date, best, comparison, verificationPredictions,
      shadowV2Predictions, collectionHealth,
      charter: { shadowSelectionV2: { cutoffSeconds: 120 }, practicalTickets: { maximum: 10 } },
      process: { env: { GITHUB_SHA: "fixture-source-commit" } },
      console: { warn: message => warnings.push(message) },
      saveNote(date, selected, article) {
        noteSaves += 1;
        assert.equal(date, input.record.date);
        assert.equal(selected, best);
        assert.equal(article, input.article);
        return mode === "rejected" ? "" : "data/notes/fixture.md";
      },
      saveRun(...args) {
        runSaves += 1;
        assert.deepEqual(args, [input.record.date, comparison, selectedData,
          verificationPredictions, shadowV2Predictions, collectionHealth]);
      },
      require(moduleName) {
        assert.equal(moduleName, "./note-draft-bundle");
        if (mode === "require_failure") throw new Error("synthetic unavailable bundle module");
        return { saveNoteDraftBundle(payload) {
          bundleCalls += 1;
          assert.equal(payload.baselinePracticalTickets, selectedBase.prediction.practicalTickets);
          if (mode === "store_failure") throw new Error("synthetic storage failure");
          return saveNoteDraftBundle(payload, { rootDir });
        } };
      }
    }, { timeout: 1000 });
    assert.deepEqual({ input, selectedBase }, before, `${mode}: original evidence must remain unchanged`);
    assert.equal(runSaves, mode === "dry_run" ? 0 : 1, `${mode}: prediction save availability`);
    const savesNote = !["dry_run", "no_selection"].includes(mode);
    assert.equal(noteSaves, savesNote ? 1 : 0, `${mode}: original Markdown save availability`);
    assert.equal(bundleCalls, savesNote && mode !== "require_failure" ? 1 : 0);
    const failed = ["require_failure", "store_failure"].includes(mode);
    assert.equal(warnings.length, failed ? 1 : 0);
    if (selectedData) {
      assert.equal(selectedData.note.audit, originalAudit, "snapshot save must not rewrite audit approval");
      assert.equal(selectedData.note.audit.canPublish, false);
      assert.equal(selectedData.note.audit.automaticPublicationEnabled, false);
    }
    if (["saved", "blocked", "missing_baseline"].includes(mode)) {
      const bundlePath = path.join(rootDir, selectedData.note.draftBundle.path);
      const payload = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
      assert.equal(selectedData.note.draftBundle.status, "saved");
      assert.equal(payload.sourceCommit, "fixture-source-commit");
      assert.equal(payload.capturedAt, NOW);
      assert.deepEqual(payload.article, input.article);
      assert.deepEqual(payload.baselinePracticalTickets, input.baselinePracticalTickets ?? null);
      assert.deepEqual(payload.generationAudit, originalAudit);
      assert.deepEqual(auditNotePublication({ ...payload, now: NOW }), originalAudit,
        `${mode}: stored inputs must reproduce the original audit, including missing evidence`);
      const replay = spawnSync(process.execPath, [
        path.join(__dirname, "note-publication-audit.js"), "--input", bundlePath, "--now", NOW
      ], { encoding: "utf8" });
      assert.equal(replay.error, undefined, replay.stderr);
      assert.equal(replay.status, mode === "saved" ? 0 : 1, replay.stderr);
      assert.deepEqual(JSON.parse(replay.stdout), originalAudit);
      if (mode === "saved") {
        const afterDeadline = auditNotePublication({ ...payload, now: "2026-09-10T04:00:00.000Z" });
        assert.equal(afterDeadline.contentReady, false, "saved approval must not survive the deadline");
        assert.ok(afterDeadline.issues.some(issue => issue.code === "DEADLINE_TOO_CLOSE"));
      }
    } else {
      assert.deepEqual(fs.readdirSync(rootDir), [], `${mode}: no bundle should be written`);
      if (failed) assert.equal(selectedData.note.draftBundle.status, "save_error");
      if (mode === "rejected") assert.equal(selectedData.note.draftBundle.status, "not_generated");
    }
    assertions += 1;
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

// Only synthetic fixtures in an owned, isolated temporary directory are written.
const cliFixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-note-audit-test-"));
const cliFixturePath = path.join(cliFixtureDirectory, "payload.json");
try {
  for (const expectedReady of [true, false]) {
    const input = fixture();
    if (!expectedReady) delete input.record.deadlineAt;
    fs.writeFileSync(cliFixturePath, JSON.stringify(input), "utf8");
    const result = spawnSync(process.execPath, [
      path.join(__dirname, "note-publication-audit.js"), "--input", cliFixturePath, "--now", NOW
    ], { encoding: "utf8" });
    assert.equal(result.error, undefined, result.stderr);
    assert.ok(result.stdout.trim(), result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.contentReady, expectedReady, result.stderr);
    assert.equal(report.canPublish, false);
    assert.equal(report.automaticPublicationEnabled, false);
    assert.equal(result.status === 0, expectedReady, result.stderr);
    assertions += 1;
  }
} finally {
  if (fs.existsSync(cliFixturePath)) fs.unlinkSync(cliFixturePath);
  fs.rmdirSync(cliFixtureDirectory);
}

console.log(`note publication audit tests passed (${assertions} cases)`);
