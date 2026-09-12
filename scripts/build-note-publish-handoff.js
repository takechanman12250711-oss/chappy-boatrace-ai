"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const DRAFT_ROOT = path.join(ROOT, "data", "note-drafts");
const OUTPUT_DIR = path.join(ROOT, "data", "note-publish");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "latest.json");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function listDateDirs() {
  if (!fs.existsSync(DRAFT_ROOT)) return [];
  return fs.readdirSync(DRAFT_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{8}$/.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .reverse();
}

function draftFilesForDate(date) {
  const dir = path.join(DRAFT_ROOT, date);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
    .map(entry => path.join(dir, entry.name));
}

function timestampOf(payload) {
  const values = [
    payload?.capturedAt,
    payload?.record?.selectedAt,
    payload?.record?.deadlineAt
  ];
  for (const value of values) {
    const ms = Date.parse(value || "");
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function normalizeCandidate(payload, sourcePath) {
  if (!payload?.article?.publishable || !payload?.article?.fullText || !payload?.record?.raceKey) {
    return null;
  }

  return {
    raceKey: payload.record.raceKey,
    date: payload.record.date ?? null,
    jcd: payload.record.jcd ?? null,
    place: payload.record.place ?? null,
    raceNo: payload.record.raceNo ?? null,
    selectedAt: payload.record.selectedAt ?? payload.capturedAt ?? null,
    deadlineAt: payload.record.deadlineAt ?? null,
    title: payload.article.title ?? null,
    freeText: payload.article.freeText ?? null,
    paidText: payload.article.paidText ?? null,
    fullText: payload.article.fullText,
    tags: Array.isArray(payload.article.tags) ? payload.article.tags : [],
    sourceCommit: payload.sourceCommit ?? null,
    bundleSha256: payload.sha256 ?? null,
    sourcePath,
    _timestamp: timestampOf(payload)
  };
}

function buildLatestHandoff() {
  let selectedDate = null;
  let candidates = [];

  for (const date of listDateDirs()) {
    const latestByRace = new Map();

    for (const filePath of draftFilesForDate(date)) {
      const payload = readJson(filePath);
      const relativePath = path.relative(ROOT, filePath).split(path.sep).join("/");
      const candidate = normalizeCandidate(payload, relativePath);
      if (!candidate) continue;

      const current = latestByRace.get(candidate.raceKey);
      if (!current || candidate._timestamp >= current._timestamp) {
        latestByRace.set(candidate.raceKey, candidate);
      }
    }

    if (latestByRace.size > 0) {
      selectedDate = date;
      candidates = [...latestByRace.values()]
        .sort((a, b) => {
          const aDeadline = Date.parse(a.deadlineAt || "");
          const bDeadline = Date.parse(b.deadlineAt || "");
          if (Number.isFinite(aDeadline) && Number.isFinite(bDeadline) && aDeadline !== bDeadline) {
            return aDeadline - bDeadline;
          }
          return a.raceKey.localeCompare(b.raceKey);
        })
        .map(({ _timestamp, ...candidate }) => candidate);
      break;
    }
  }

  const payload = {
    version: "note-publish-handoff-v1",
    generatedAt: new Date().toISOString(),
    date: selectedDate,
    candidateCount: candidates.length,
    candidates,
    instructions: {
      purpose: "Browser automation should use this file as the single handoff source for note posting.",
      safety: "This file does not publish anything. Before posting, confirm the article is not already published and the race deadline has not passed."
    }
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const next = `${JSON.stringify(payload, null, 2)}\n`;
  const previous = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, "utf8") : null;

  if (previous) {
    try {
      const previousPayload = JSON.parse(previous);
      previousPayload.generatedAt = payload.generatedAt;
      const previousComparable = JSON.stringify(previousPayload);
      const nextComparable = JSON.stringify(payload);
      if (previousComparable === nextComparable) return { changed: false, payload };
    } catch {
      // Replace malformed output below.
    }
  }

  fs.writeFileSync(OUTPUT_PATH, next, "utf8");
  return { changed: true, payload };
}

if (require.main === module) {
  const result = buildLatestHandoff();
  console.log(`note publish handoff: ${result.payload.candidateCount} candidate(s), changed=${result.changed}`);
}

module.exports = { buildLatestHandoff };
