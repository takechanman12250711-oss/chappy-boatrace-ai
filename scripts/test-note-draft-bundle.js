"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { saveNoteDraftBundle } = require("./note-draft-bundle");

function fixture() {
  const tickets = [{ ticket: "1-2-3", odds: 12.5, comment: "保存された展開判断" }];
  return {
    article: {
      publishable: true,
      title: "唐津10R 原稿",
      freeText: "保存された無料本文",
      paidText: "保存された有料本文",
      fullText: "保存された無料本文\n\n保存された有料本文",
      practicalTickets: structuredClone(tickets)
    },
    record: {
      raceKey: "20260910-23-10",
      date: "20260910",
      jcd: "23",
      place: "唐津",
      raceNo: 10,
      selectedAt: "2026-09-10T03:40:00.000Z",
      deadlineAt: "2026-09-10T03:55:00.000Z",
      prediction: {
        practicalTickets: structuredClone(tickets),
        mainSheet: { tickets: structuredClone(tickets) },
        manshuSheet: {
          forecastLedger: {
            forecasts: [{ formation: { notation: "3-4-5", expandedTickets: ["3-4-5"] } }]
          }
        },
        unrelatedLargeEvidence: { omitFromBundle: true }
      },
      note: { audit: { contentReady: true, canPublish: false, automaticPublicationEnabled: false } }
    },
    baselinePracticalTickets: structuredClone(tickets),
    minLeadSeconds: 180,
    maxPracticalTickets: 8,
    sourceCommit: "a".repeat(40)
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function files(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(rootDir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}

function withPatchedFs(method, replacement, run) {
  const original = fs[method];
  fs[method] = replacement(original);
  try { return run(); } finally { fs[method] = original; }
}

let passed = 0;
function test(name, run) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-note-bundle-test-"));
  try {
    run(rootDir);
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

test("保存内容とSHA256が一致し、監査用の独立した入力を保持する", rootDir => {
  const input = deepFreeze(fixture());
  const before = JSON.stringify(input);
  const saved = saveNoteDraftBundle(input, { rootDir });
  assert.equal(saved.status, "saved");
  const outputPath = path.join(rootDir, saved.path);
  const bytes = fs.readFileSync(outputPath, "utf8");
  const payload = JSON.parse(bytes);
  assert.equal(saved.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(saved.path, path.join("data", "note-drafts", input.record.date,
    `${input.record.raceKey}-${saved.sha256}.json`));
  assert.equal(payload.version, "note-draft-bundle-v1");
  assert.equal(payload.capturedAt, input.record.selectedAt);
  assert.equal(payload.sourceCommit, input.sourceCommit);
  assert.deepEqual(payload.article, input.article);
  assert.deepEqual(payload.baselinePracticalTickets, input.baselinePracticalTickets);
  assert.deepEqual(payload.generationAudit, input.record.note.audit);
  assert.equal(payload.minLeadSeconds, 180);
  assert.equal(payload.maxPracticalTickets, 8);
  assert.equal(payload.record.prediction.unrelatedLargeEvidence, undefined);
  assert.equal(payload.record.note, undefined);
  assert.equal(JSON.stringify(input), before, "caller objects must remain unchanged");
  assert.deepEqual(files(rootDir), [outputPath], "no unfinished temp file remains");
});

test("後から原稿・保存予想・参考台帳・基準を変更しても保存済み原稿は変わらない", rootDir => {
  const input = fixture();
  const expected = structuredClone(input);
  const saved = saveNoteDraftBundle(input, { rootDir });
  input.article.practicalTickets[0].ticket = "6-5-4";
  input.article.fullText = "後から変更した本文";
  input.record.prediction.practicalTickets[0].odds = 999;
  input.record.prediction.manshuSheet.forecastLedger.forecasts[0].formation.notation = "6-5-4";
  input.baselinePracticalTickets[0].ticket = "5-4-3";
  input.record.note.audit.canPublish = true;
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, saved.path), "utf8"));
  assert.deepEqual(payload.article, expected.article);
  assert.deepEqual(payload.record.prediction.practicalTickets, expected.record.prediction.practicalTickets);
  assert.deepEqual(payload.record.prediction.manshuSheet, expected.record.prediction.manshuSheet);
  assert.deepEqual(payload.baselinePracticalTickets, expected.baselinePracticalTickets);
  assert.deepEqual(payload.generationAudit, expected.record.note.audit);
  payload.article.practicalTickets[0].ticket = "6-4-2";
  assert.deepEqual(payload.baselinePracticalTickets, expected.baselinePracticalTickets);
  assert.deepEqual(payload.record.prediction.practicalTickets, expected.record.prediction.practicalTickets);
});

test("同一入力の再保存は既存ファイルを書き換えない", rootDir => {
  const input = fixture();
  const first = saveNoteDraftBundle(input, { rootDir });
  const outputPath = path.join(rootDir, first.path);
  const original = fs.readFileSync(outputPath);
  const before = fs.statSync(outputPath);
  const second = saveNoteDraftBundle(input, { rootDir });
  const after = fs.statSync(outputPath);
  assert.deepEqual(second, first);
  assert.deepEqual(fs.readFileSync(outputPath), original);
  assert.equal(after.ino, before.ino);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.deepEqual(files(rootDir), [outputPath]);
});

test("同一レースの内容変更は別ファイルに追加して過去の内容を維持する", rootDir => {
  const input = fixture();
  const first = saveNoteDraftBundle(input, { rootDir });
  const original = fs.readFileSync(path.join(rootDir, first.path));
  input.article.fullText += "\n追加の原稿";
  const second = saveNoteDraftBundle(input, { rootDir });
  assert.notEqual(first.path, second.path);
  assert.notEqual(first.sha256, second.sha256);
  assert.deepEqual(fs.readFileSync(path.join(rootDir, first.path)), original);
  assert.equal(JSON.parse(fs.readFileSync(path.join(rootDir, second.path), "utf8")).article.fullText,
    input.article.fullText);
  assert.equal(files(rootDir).length, 2);
});

test("独立基準の差を原稿から補正せずそのまま保存する", rootDir => {
  const input = fixture();
  input.baselinePracticalTickets[0].ticket = "2-3-1";
  const saved = saveNoteDraftBundle(input, { rootDir });
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, saved.path), "utf8"));
  assert.equal(payload.baselinePracticalTickets[0].ticket, "2-3-1");
  assert.equal(payload.article.practicalTickets[0].ticket, "1-2-3");
});

test("欠けた基準・時刻・監査はnullのまま残し、捏造しない", rootDir => {
  const input = fixture();
  delete input.baselinePracticalTickets;
  delete input.record.selectedAt;
  delete input.record.deadlineAt;
  delete input.record.note;
  delete input.record.prediction;
  delete input.sourceCommit;
  delete input.minLeadSeconds;
  delete input.maxPracticalTickets;
  const saved = saveNoteDraftBundle(input, { rootDir });
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, saved.path), "utf8"));
  assert.equal(payload.capturedAt, null);
  assert.equal(payload.record.selectedAt, null);
  assert.equal(payload.record.deadlineAt, null);
  assert.equal(payload.baselinePracticalTickets, null);
  assert.equal(payload.generationAudit, null);
  assert.equal(payload.sourceCommit, null);
  assert.deepEqual(payload.record.prediction, { practicalTickets: null, mainSheet: null, manshuSheet: null });
  assert.equal(payload.minLeadSeconds, 120);
  assert.equal(payload.maxPracticalTickets, 10);
});

test("明示された不正な監査設定を保存時に書き換えない", rootDir => {
  const input = fixture();
  input.minLeadSeconds = null;
  input.maxPracticalTickets = 99;
  const saved = saveNoteDraftBundle(input, { rootDir });
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, saved.path), "utf8"));
  assert.equal(payload.minLeadSeconds, null);
  assert.equal(payload.maxPracticalTickets, 99);
});

for (const article of [null, {}, { publishable: false, fullText: "本文" },
  { publishable: true }, { publishable: true, fullText: "" }]) {
  test(`原稿未生成時は何も保存しない: ${JSON.stringify(article)}`, rootDir => {
    assert.deepEqual(saveNoteDraftBundle({ article }, { rootDir }), { status: "not_generated" });
    assert.deepEqual(fs.readdirSync(rootDir), []);
  });
}

for (const patch of [
  { date: "../../etc", raceKey: "../../etc-23-10" },
  { date: "2026/910", raceKey: "2026/910-23-10" },
  { date: "20260230", raceKey: "20260230-23-10" },
  { date: "20261310", raceKey: "20261310-23-10" },
  { date: 20260910 },
  { jcd: "../23" }, { jcd: "00" }, { jcd: "25" }, { jcd: 23 },
  { raceNo: 0 }, { raceNo: 13 }, { raceNo: 1.5 }, { raceNo: "10" },
  { raceKey: "../../outside.json" },
  { raceKey: "20260910-23-1" },
  { raceNo: 1, raceKey: "20260910-23-01" }
]) {
  test(`不正な識別子は書き込み前に拒否する: ${JSON.stringify(patch)}`, rootDir => {
    const input = fixture();
    Object.assign(input.record, patch);
    assert.throws(() => saveNoteDraftBundle(input, { rootDir }), /valid date, venue, race number/);
    assert.deepEqual(fs.readdirSync(rootDir), []);
  });
}

test("会場・レースの境界値と閏日を扱える", rootDir => {
  for (const [date, jcd, raceNo] of [["20280229", "01", 1], ["20260910", "24", 12]]) {
    const input = fixture();
    Object.assign(input.record, { date, jcd, raceNo, raceKey: `${date}-${jcd}-${raceNo}` });
    assert.equal(saveNoteDraftBundle(input, { rootDir }).status, "saved");
  }
  assert.equal(files(rootDir).length, 2);
});

test("保存先が既に破損していても上書き・削除しない", rootDir => {
  const input = fixture();
  const saved = saveNoteDraftBundle(input, { rootDir });
  const outputPath = path.join(rootDir, saved.path);
  fs.writeFileSync(outputPath, "既存の内容は保持する", "utf8");
  assert.throws(() => saveNoteDraftBundle(input, { rootDir }), /differs from/);
  assert.equal(fs.readFileSync(outputPath, "utf8"), "既存の内容は保持する");
  assert.deepEqual(files(rootDir), [outputPath]);
});

test("同じ内容でも保存先がシンボリックリンクなら変更せず拒否する", rootDir => {
  const input = fixture();
  const saved = saveNoteDraftBundle(input, { rootDir });
  const outputPath = path.join(rootDir, saved.path);
  const existingPath = path.join(rootDir, "existing.json");
  fs.renameSync(outputPath, existingPath);
  const bytes = fs.readFileSync(existingPath);
  fs.symlinkSync(existingPath, outputPath);
  assert.throws(() => saveNoteDraftBundle(input, { rootDir }), /differs from/);
  assert.equal(fs.lstatSync(outputPath).isSymbolicLink(), true);
  assert.deepEqual(fs.readFileSync(existingPath), bytes);
});

test("完成したJSONだけを最終パスへ原子的に公開する", rootDir => {
  let observed = false;
  withPatchedFs("linkSync", original => (tempPath, outputPath) => {
    assert.equal(fs.existsSync(outputPath), false);
    const payload = JSON.parse(fs.readFileSync(tempPath, "utf8"));
    assert.equal(payload.article.fullText, fixture().article.fullText);
    const result = original(tempPath, outputPath);
    assert.deepEqual(fs.readFileSync(outputPath), fs.readFileSync(tempPath));
    observed = true;
    return result;
  }, () => saveNoteDraftBundle(fixture(), { rootDir }));
  assert.equal(observed, true);
  assert.equal(files(rootDir).length, 1);
});

test("他の処理が先に同一ファイルを保存しても内容を維持して成功する", rootDir => {
  withPatchedFs("linkSync", original => (tempPath, outputPath) => {
    original(tempPath, outputPath);
    throw Object.assign(new Error("another writer won"), { code: "EEXIST" });
  }, () => assert.equal(saveNoteDraftBundle(fixture(), { rootDir }).status, "saved"));
  assert.equal(files(rootDir).length, 1);
});

for (const method of ["fsyncSync", "linkSync"]) {
  test(`${method}失敗時は自分の一時ファイルのみ片付ける`, rootDir => {
    const existingPath = path.join(rootDir, "existing-history.json");
    fs.writeFileSync(existingPath, "以前の保存予想", "utf8");
    withPatchedFs(method, () => () => {
      throw Object.assign(new Error("injected storage failure"), { code: "EIO" });
    }, () => assert.throws(() => saveNoteDraftBundle(fixture(), { rootDir }), /injected storage failure/));
    assert.deepEqual(files(rootDir), [existingPath]);
    assert.equal(fs.readFileSync(existingPath, "utf8"), "以前の保存予想");
  });
}

test("一時ファイルを先に他の処理が作っていた場合は削除しない", rootDir => {
  let foreignTemp;
  withPatchedFs("openSync", original => (filePath, flags, ...args) => {
    if (flags !== "wx") return original(filePath, flags, ...args);
    foreignTemp = filePath;
    const fd = original(filePath, "wx", ...args);
    try { fs.writeFileSync(fd, "別処理の一時ファイル", "utf8"); } finally { fs.closeSync(fd); }
    throw Object.assign(new Error("temporary path already exists"), { code: "EEXIST" });
  }, () => assert.throws(() => saveNoteDraftBundle(fixture(), { rootDir }), /already exists/));
  assert.equal(fs.readFileSync(foreignTemp, "utf8"), "別処理の一時ファイル");
  assert.deepEqual(files(rootDir), [foreignTemp]);
});

test("途中までの書き込み失敗で不完全なJSONを最終パスに残さない", rootDir => {
  withPatchedFs("writeFileSync", original => (filePath, bytes, ...args) => {
    if (typeof filePath !== "number") return original(filePath, bytes, ...args);
    original(filePath, bytes.slice(0, 20), ...args);
    throw new Error("partial write failure");
  }, () => assert.throws(() => saveNoteDraftBundle(fixture(), { rootDir }), /partial write failure/));
  assert.deepEqual(files(rootDir), []);
});

test("JSON化できない入力ではディレクトリも作成しない", rootDir => {
  const input = fixture();
  input.article.circular = input.article;
  assert.throws(() => saveNoteDraftBundle(input, { rootDir }), /circular/i);
  assert.deepEqual(fs.readdirSync(rootDir), []);
});

console.log(`note draft bundle: ${passed} tests passed`);
