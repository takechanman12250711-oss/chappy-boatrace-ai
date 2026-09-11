"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createPublicationHandoff } = require("./note-publication-handoff");

function fixture() {
  return {
    version: "note-draft-bundle-v1",
    capturedAt: "2026-09-11T03:00:00.000Z",
    sourceCommit: "a".repeat(40),
    article: {
      publishable: true,
      title: "唐津10R 原稿",
      freeText: "無料本文",
      paidText: "有料本文",
      fullText: "無料本文\n\n有料本文",
      tags: ["ボートレース", "唐津"],
      practicalTickets: [{ ticket: "1-2-3", odds: 12.5 }]
    },
    record: {
      raceKey: "20260911-23-10",
      date: "20260911",
      jcd: "23",
      place: "唐津",
      raceNo: 10,
      deadlineAt: "2026-09-11T03:30:00.000Z"
    },
    generationAudit: {
      status: "ready_for_review",
      contentReady: true,
      canPublish: false,
      automaticPublicationEnabled: false,
      auditedAt: "2026-09-11T03:05:00.000Z"
    }
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

test("認証情報を持たず投稿引き継ぎデータだけを生成する", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const bytes = `${JSON.stringify(input, null, 2)}\n`;
  const handoff = createPublicationHandoff(input, { draftBytes: bytes });
  assert.equal(handoff.version, "note-publication-handoff-v1");
  assert.equal(handoff.target, "note");
  assert.equal(handoff.state, "prepared_only");
  assert.equal(handoff.source.raceKey, "20260911-23-10");
  assert.equal(handoff.article.fullText, input.article.fullText);
  assert.equal(handoff.auditSnapshot.contentReady, true);
  assert.equal(handoff.auditSnapshot.canPublish, false);
  assert.equal(handoff.auditSnapshot.automaticPublicationEnabled, false);
  assert.equal(handoff.publication.authentication, "external");
  assert.equal(handoff.publication.authenticated, false);
  assert.equal(handoff.publication.publishedUrl, null);
  assert.equal(handoff.source.draftSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(handoff.integrity.articleSha256,
    createHash("sha256").update(input.article.fullText).digest("hex"));
  assert.equal(JSON.stringify(input), before, "source bundle must not be mutated");
  assert.equal("cookie" in handoff, false);
  assert.equal("password" in handoff, false);
  assert.equal("token" in handoff, false);
});

test("記事配列は独立コピーとして保持する", () => {
  const input = fixture();
  const handoff = createPublicationHandoff(input);
  handoff.article.tags.push("追加");
  handoff.article.practicalTickets[0].ticket = "6-5-4";
  assert.deepEqual(input.article.tags, ["ボートレース", "唐津"]);
  assert.equal(input.article.practicalTickets[0].ticket, "1-2-3");
  assert.equal(handoff.source.draftSha256, null);
});

test("生成時監査がなくても公開許可を捏造しない", () => {
  const input = fixture();
  delete input.generationAudit;
  const handoff = createPublicationHandoff(input);
  assert.equal(handoff.auditSnapshot, null);
  assert.equal(handoff.publication.authenticated, false);
  assert.equal(handoff.publication.publishMode, null);
  assert.equal(handoff.publication.scheduledAt, null);
  assert.equal(handoff.publication.price, null);
});

for (const patch of [
  { version: "unknown" },
  { article: null },
  { article: { fullText: "" } },
  { record: { raceKey: "../../etc", date: "20260911", jcd: "23", raceNo: 10 } },
  { record: { raceKey: "20260911-25-10", date: "20260911", jcd: "25", raceNo: 10 } },
  { record: { raceKey: "20260911-23-13", date: "20260911", jcd: "23", raceNo: 13 } }
]) {
  test(`不正なbundleを拒否する: ${JSON.stringify(patch)}`, () => {
    const input = fixture();
    Object.assign(input, patch);
    assert.throws(() => createPublicationHandoff(input));
  });
}

console.log(`# ${passed} tests passed`);
