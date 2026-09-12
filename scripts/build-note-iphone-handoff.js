"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data", "note-publish", "latest.json");
const OUTPUT = path.join(ROOT, "data", "note-publish", "iphone.json");

function raceDateFromKey(raceKey) {
  const match = String(raceKey || "").match(/^(\d{4})(\d{2})(\d{2})-/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function todayJst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function buildIphoneHandoff() {
  if (!fs.existsSync(INPUT)) return { status: "no_handoff" };
  const source = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const candidate = Array.isArray(source.candidates) ? source.candidates[0] : null;
  if (!candidate?.title || !candidate?.fullText) return { status: "no_candidate" };

  const deadlineMs = Date.parse(candidate.deadlineAt || "");
  const hasDeadline = Number.isFinite(deadlineMs);
  const raceDate = raceDateFromKey(candidate.raceKey);
  const sameRaceDay = Boolean(raceDate && raceDate === todayJst());
  const beforeDeadline = hasDeadline && deadlineMs > Date.now();
  // Fail closed: publish only when both the race date and a future deadline are verified.
  const canPublish = sameRaceDay && beforeDeadline;
  const blockReason = canPublish
    ? null
    : !sameRaceDay
      ? "race_day_mismatch"
      : !hasDeadline
        ? "deadline_unavailable"
        : "deadline_passed";

  const payload = {
    version: "note-iphone-handoff-v2",
    generatedAt: new Date().toISOString(),
    raceKey: candidate.raceKey || null,
    raceDate,
    title: candidate.title,
    body: candidate.fullText,
    tags: Array.isArray(candidate.tags) ? candidate.tags : [],
    deadlineAt: candidate.deadlineAt || null,
    canPublish,
    blockReason,
    noteCreateUrl: "https://note.com/notes/new",
    shortcut: {
      publishGateField: "canPublish",
      copyField: "body",
      titleField: "title",
      stopUnlessCanPublish: true
    }
  };

  const next = `${JSON.stringify(payload, null, 2)}\n`;
  const previous = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : null;
  if (previous === next) return { status: "unchanged", raceKey: payload.raceKey };
  fs.writeFileSync(OUTPUT, next, "utf8");
  return { status: "written", raceKey: payload.raceKey, canPublish, blockReason };
}

if (require.main === module) console.log(JSON.stringify(buildIphoneHandoff()));
module.exports = { buildIphoneHandoff, raceDateFromKey };
