"use strict";

// Keep the original draft and its independent saved baseline together for replay.
// This stores evidence only; it does not generate predictions or publish to note.
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const VERSION = "note-draft-bundle-v1";

function validateIdentity(record) {
  const { date, jcd, raceNo, raceKey } = record || {};
  const isoDate = typeof date === "string" && /^\d{8}$/.test(date)
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : "";
  const parsedDate = isoDate ? new Date(`${isoDate}T00:00:00.000Z`) : null;
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== isoDate ||
      typeof jcd !== "string" || !/^(?:0[1-9]|1\d|2[0-4])$/.test(jcd) ||
      !Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12 ||
      raceKey !== `${date}-${jcd}-${raceNo}`) {
    throw new Error("note draft bundle requires a valid date, venue, race number and matching raceKey");
  }
}

function verifyExisting(outputPath, bytes) {
  if (!fs.lstatSync(outputPath).isFile() || fs.readFileSync(outputPath, "utf8") !== bytes) {
    throw new Error("existing note draft bundle differs from its content-addressed payload");
  }
}

function saveNoteDraftBundle(input = {}, { rootDir = process.cwd() } = {}) {
  const { article, record, baselinePracticalTickets, sourceCommit,
    minLeadSeconds = 120, maxPracticalTickets = 10 } = input;
  if (!article?.publishable || !article?.fullText) return { status: "not_generated" };
  validateIdentity(record);

  // Serialize before any writes. Each field is a snapshot, including the baseline
  // captured before article generation; it is never rebuilt from the article.
  const payload = {
    version: VERSION,
    capturedAt: record.selectedAt ?? null,
    sourceCommit: sourceCommit ?? null,
    article,
    record: {
      raceKey: record.raceKey,
      date: record.date,
      jcd: record.jcd,
      place: record.place ?? null,
      raceNo: record.raceNo,
      selectedAt: record.selectedAt ?? null,
      deadlineAt: record.deadlineAt ?? null,
      prediction: {
        practicalTickets: record.prediction?.practicalTickets ?? null,
        mainSheet: record.prediction?.mainSheet ?? null,
        manshuSheet: record.prediction?.manshuSheet ?? null
      }
    },
    baselinePracticalTickets: baselinePracticalTickets ?? null,
    minLeadSeconds,
    maxPracticalTickets,
    generationAudit: record.note?.audit ?? null
  };
  const bytes = `${JSON.stringify(payload, null, 2)}\n`;
  const sha256 = createHash("sha256").update(bytes, "utf8").digest("hex");
  const relativePath = path.join("data", "note-drafts", record.date, `${record.raceKey}-${sha256}.json`);
  const outputPath = path.resolve(rootDir, relativePath);
  const directory = path.dirname(outputPath);
  fs.mkdirSync(directory, { recursive: true });

  // Publish a fully written file in one atomic operation. Neither an existing
  // snapshot nor a temp file owned by another attempt is ever overwritten.
  const tempPath = path.join(directory, `.${record.raceKey}-${sha256}-${randomUUID()}.tmp`);
  let fd;
  let ownsTemp = false;
  try {
    fd = fs.openSync(tempPath, "wx", 0o600);
    ownsTemp = true;
    fs.writeFileSync(fd, bytes, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    try {
      fs.linkSync(tempPath, outputPath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      verifyExisting(outputPath, bytes);
    }
  } finally {
    try {
      if (fd !== undefined) fs.closeSync(fd);
    } finally {
      if (ownsTemp) fs.unlinkSync(tempPath);
    }
  }
  return { status: "saved", path: relativePath, sha256 };
}

module.exports = { saveNoteDraftBundle };
