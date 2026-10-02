"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { saveNoteDraftBundle } = require("./note-draft-bundle");
const { buildPredictionSummary } = require("./build-prediction-summaries");
const { loadLatest, reviewStatus } = require("../js/saved-note-draft");
const NOW = "2026-09-10T03:45:00.000Z";

function fixture() {
  return {
    article: { publishable: true, title: "唐津10R 保存原稿", fullText: "無料本文\n\n有料本文\n1-2-3", practicalTickets: [{ ticket: "1-2-3", odds: 12.5 }] },
    record: { date: "20260910", jcd: "23", raceNo: 10, raceKey: "20260910-23-10", place: "唐津",
      selectedAt: NOW, deadlineAt: "2026-09-10T03:55:00.000Z", prediction: { practicalTickets: [{ ticket: "1-2-3", odds: 12.5 }] },
      note: { publishable: true, audit: { status: "ready_for_review", contentReady: true, auditedAt: NOW,
        canPublish: false, automaticPublicationEnabled: false, issues: [] } } },
    baselinePracticalTickets: [{ ticket: "1-2-3", odds: 12.5 }], minLeadSeconds: 120, maxPracticalTickets: 10
  };
}

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-saved-note-test-"));
  let cases = 0;
  try {
    const input = fixture();
    input.record.note.draftBundle = saveNoteDraftBundle(input, { rootDir });
    const original = structuredClone(input);
    const summary = buildPredictionSummary({ date: input.record.date, predictions: [input.record] });
    assert.deepEqual(summary.predictions[0].note.draftBundle, input.record.note.draftBundle);
    assert.equal(summary.predictions[0].note.audit, undefined, "do not duplicate full audit into lightweight summary");
    const bytes = fs.readFileSync(path.join(rootDir, input.record.note.draftBundle.path), "utf8");
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push(url);
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal instanceof AbortSignal);
      const body = url === `data/predictions/summaries/${input.record.date}.json`
        ? JSON.stringify(summary) : url === input.record.note.draftBundle.path ? bytes : null;
      assert.notEqual(body, null, "only summary and exact immutable snapshot may be fetched");
      return { ok: true, text: async () => body };
    };
    const saved = await loadLatest({ date: input.record.date, fetchImpl, cryptoImpl: webcrypto });
    assert.deepEqual(saved.article, input.article);
    assert.deepEqual(saved.bundle.baselinePracticalTickets, input.baselinePracticalTickets);
    assert.deepEqual(saved.bundle.generationAudit, input.record.note.audit);
    assert.deepEqual(input, original, "reading must not mutate or regenerate source");
    assert.equal(calls.length, 2, "never fetch huge daily prediction originals");
    cases += 1;

    for (const mutate of [
      value => { value.date = "20260911"; },
      value => { delete value.predictions[0].note.draftBundle; },
      value => { value.predictions[0].note.draftBundle.status = "save_error"; },
      value => { value.predictions[0].note.draftBundle.path = "https://example.com/private.json"; },
      value => { value.predictions[0].note.draftBundle.path = "../other.json"; },
      value => { value.predictions[0].raceKey = "20260910-23-9"; }
    ]) {
      const bad = structuredClone(summary);
      mutate(bad);
      let reads = 0;
      await assert.rejects(loadLatest({ date: input.record.date, cryptoImpl: webcrypto,
        fetchImpl: async () => { reads += 1; return { ok: true, text: async () => JSON.stringify(bad) }; } }));
      assert.equal(reads, 1, "invalid reference must not trigger a payload request");
      cases += 1;
    }
    await assert.rejects(loadLatest({ date: "../../bad", fetchImpl, cryptoImpl: webcrypto }));
    await assert.rejects(loadLatest({ date: input.record.date, fetchImpl, cryptoImpl: {} }), /整合性/);
    await assert.rejects(loadLatest({ date: input.record.date, cryptoImpl: webcrypto,
      fetchImpl: async (url, options) => {
        const response = await fetchImpl(url, options);
        return { ok: true, text: async () => (await response.text()) + (url.endsWith("summaries/20260910.json") ? "" : " ") };
      } }), /一致しません/);
    await assert.rejects(loadLatest({ date: input.record.date, fetchImpl: async () => ({ ok: false, status: 404 }) }), /まだありません/);
    cases += 4;

    for (const [clock, expected] of [[Date.parse(NOW), "生成時検査"], [Date.parse("2026-09-10T03:53:00Z"), "余裕が不足"], [Date.parse("2026-09-10T04:00:00Z"), "締切済み"], [NaN, "確認できません"]]) {
      const result = reviewStatus(saved.bundle, clock);
      assert.match(result.message, new RegExp(expected));
      assert.equal(result.canPublish, false);
      assert.equal(result.automaticPublicationEnabled, false);
      cases += 1;
    }
    const missingAudit = structuredClone(saved.bundle);
    missingAudit.generationAudit = null;
    assert.match(reviewStatus(missingAudit).message, /要確認/);
    const rejected = structuredClone(saved.bundle);
    rejected.generationAudit = { ...rejected.generationAudit, status: "blocked", contentReady: false,
      issues: [{ code: "ODDS_MISSING", message: "オッズを確認できません" }] };
    assert.match(reviewStatus(rejected).message, /オッズを確認できません/);
    cases += 2;

    // Run the production note controls, without collection or the prediction engine.
    const source = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");
    const start = source.indexOf("  let lastNotePrediction = null;");
    const end = source.indexOf("  async function copyNoteText(", start);
    assert.ok(start >= 0 && end > start);
    const controls = Object.fromEntries(["noteLoadSavedBtn", "noteGenerateBtn", "noteCopyTitleBtn", "noteCopyFullBtn",
      "noteTitlePreview", "noteArticlePreview", "noteAssistantSection", "dateInput"].map(id => [id,
      { dataset: {}, value: id === "dateInput" ? "2026-09-10" : "", listeners: [],
        addEventListener(type, fn) { this.listeners.push({ type, fn }); } }]));
    const messages = [];
    const copied = [];
    let load = async () => saved;
    const browserWindow = { ChappySavedNoteDraft: { loadLatest: args => load(args), reviewStatus },
      ChappyNoteGenerator: { generateArticle: () => { throw new Error("must not regenerate saved drafts"); } } };
    const context = { window: browserWindow, document: { getElementById: id => controls[id] || null },
      setNoteStatus: text => messages.push(text), copyNoteText: (text, message) => copied.push({ text, message }), console };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end) + "\nthis.noteApi = {setupNoteAssistant, updateNoteAssistant, loadSavedNoteArticle, generateNoteArticle};", context);
    const api = context.noteApi;
    controls.noteAssistantSection.hidden = true;
    api.setupNoteAssistant(); api.setupNoteAssistant();
    assert.equal(controls.noteLoadSavedBtn.listeners.length, 1);
    assert.equal(controls.noteAssistantSection.hidden, false, "saved drafts must be reachable before any prediction is rendered");
    api.updateNoteAssistant(null);
    assert.equal(controls.noteAssistantSection.hidden, false, "clearing a prediction must not hide the saved-draft entry");
    api.updateNoteAssistant({ ok: true, isRetrospective: true });
    assert.equal(controls.noteAssistantSection.hidden, false, "stored drafts remain available for retrospective viewing");
    assert.equal(controls.noteGenerateBtn.disabled, true, "retrospective view must not generate a new prediction article");
    const savedModule = browserWindow.ChappySavedNoteDraft;
    delete browserWindow.ChappySavedNoteDraft;
    let moduleLoads = 0;
    browserWindow.ChappyAppRuntime = { ensure: async group => {
      assert.equal(group, "savedNote"); moduleLoads += 1;
      browserWindow.ChappySavedNoteDraft = savedModule;
    } };
    await api.loadSavedNoteArticle();
    assert.equal(moduleLoads, 1, "saved draft code is loaded only on request");
    assert.equal(controls.noteTitlePreview.value, input.article.title);
    assert.equal(controls.noteArticlePreview.value, input.article.fullText);
    assert.equal(controls.noteCopyFullBtn.disabled, false);
    controls.noteCopyFullBtn.listeners[0].fn();
    assert.equal(copied[0].text, input.article.fullText);
    assert.match(copied[0].message, /公開前/);
    assert.match(messages.at(-1), /保存原稿：唐津 10R/);
    api.updateNoteAssistant(null);
    assert.equal(controls.noteAssistantSection.hidden, false);
    assert.equal(controls.noteArticlePreview.value, "");
    assert.equal(controls.noteCopyFullBtn.disabled, true);
    cases += 1;

    let finish;
    load = () => new Promise(resolve => { finish = resolve; });
    const slow = api.loadSavedNoteArticle();
    api.updateNoteAssistant({ ok: true });
    finish(saved);
    await slow;
    assert.equal(controls.noteArticlePreview.value, "", "late response cannot replace a new prediction's article");
    assert.equal(controls.noteCopyFullBtn.disabled, true);
    load = async () => { throw new Error("test missing snapshot"); };
    await api.loadSavedNoteArticle();
    assert.equal(controls.noteCopyFullBtn.disabled, true, "failure cannot leave an old draft copyable");
    assert.equal(controls.noteLoadSavedBtn.disabled, false, "user may retry a failed request");
    assert.equal(messages.at(-1), "test missing snapshot");
    cases += 2;
  } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  console.log(`saved note draft tests passed (${cases} cases)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
