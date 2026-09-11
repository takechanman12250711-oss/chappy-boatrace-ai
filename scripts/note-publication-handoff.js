"use strict";

const fs = require("node:fs");
const { createHash } = require("node:crypto");

const VERSION = "note-publication-handoff-v1";
const DRAFT_VERSION = "note-draft-bundle-v1";

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertDraftBundle(bundle) {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("note publication handoff requires a draft bundle object");
  }
  if (bundle.version !== DRAFT_VERSION) {
    throw new Error(`unsupported note draft bundle version: ${bundle.version || "missing"}`);
  }
  const record = bundle.record || {};
  if (!/^\d{8}$/.test(String(record.date || "")) ||
      !/^(?:0[1-9]|1\d|2[0-4])$/.test(String(record.jcd || "")) ||
      !Number.isInteger(record.raceNo) || record.raceNo < 1 || record.raceNo > 12 ||
      record.raceKey !== `${record.date}-${record.jcd}-${record.raceNo}`) {
    throw new Error("note publication handoff requires a valid race identity");
  }
  if (!bundle.article || typeof bundle.article !== "object" || !bundle.article.fullText) {
    throw new Error("note publication handoff requires a generated article");
  }
}

function createPublicationHandoff(bundle, { draftBytes = null } = {}) {
  assertDraftBundle(bundle);
  const article = bundle.article;
  const record = bundle.record;
  const generationAudit = bundle.generationAudit || null;
  const articleBytes = String(article.fullText);

  return {
    version: VERSION,
    target: "note",
    state: "prepared_only",
    source: {
      draftVersion: bundle.version,
      draftSha256: typeof draftBytes === "string" ? sha256(draftBytes) : null,
      sourceCommit: bundle.sourceCommit ?? null,
      capturedAt: bundle.capturedAt ?? null,
      raceKey: record.raceKey,
      date: record.date,
      jcd: record.jcd,
      place: record.place ?? null,
      raceNo: record.raceNo,
      deadlineAt: record.deadlineAt ?? null
    },
    article: {
      title: article.title ?? null,
      freeText: article.freeText ?? null,
      paidText: article.paidText ?? null,
      fullText: article.fullText,
      tags: Array.isArray(article.tags) ? structuredClone(article.tags) : [],
      practicalTickets: Array.isArray(article.practicalTickets)
        ? structuredClone(article.practicalTickets)
        : []
    },
    integrity: {
      articleSha256: sha256(articleBytes)
    },
    auditSnapshot: generationAudit ? {
      status: generationAudit.status ?? null,
      contentReady: generationAudit.contentReady === true,
      canPublish: false,
      automaticPublicationEnabled: false,
      auditedAt: generationAudit.auditedAt ?? null
    } : null,
    publication: {
      authentication: "external",
      authenticated: false,
      publishMode: null,
      scheduledAt: null,
      price: null,
      publishedAt: null,
      publishedUrl: null
    }
  };
}

function main(argv = process.argv.slice(2)) {
  const inputIndex = argv.indexOf("--input");
  const inputPath = inputIndex >= 0 ? argv[inputIndex + 1] : null;
  if (!inputPath) {
    console.error("usage: node scripts/note-publication-handoff.js --input <draft-bundle.json>");
    process.exitCode = 2;
    return;
  }

  try {
    const bytes = fs.readFileSync(inputPath, "utf8");
    const bundle = JSON.parse(bytes);
    const handoff = createPublicationHandoff(bundle, { draftBytes: bytes });
    process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = { createPublicationHandoff, assertDraftBundle, VERSION };
