"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data", "note-publish", "latest.json");
const OUTPUT = path.join(ROOT, "data", "note-publish", "iphone.json");

function buildIphoneHandoff() {
  if (!fs.existsSync(INPUT)) return { status: "no_handoff" };
  const source = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const candidate = Array.isArray(source.candidates) ? source.candidates[0] : null;
  if (!candidate?.title || !candidate?.fullText) return { status: "no_candidate" };

  const deadlineMs = Date.parse(candidate.deadlineAt || "");
  const payload = {
    version: "note-iphone-handoff-v1",
    generatedAt: new Date().toISOString(),
    raceKey: candidate.raceKey || null,
    title: candidate.title,
    body: candidate.fullText,
    tags: Array.isArray(candidate.tags) ? candidate.tags : [],
    deadlineAt: candidate.deadlineAt || null,
    expiredAtBuild: Number.isFinite(deadlineMs) ? deadlineMs <= Date.now() : null,
    noteCreateUrl: "https://note.com/notes/new",
    shortcut: {
      copyField: "body",
      titleField: "title",
      stopIfExpired: true
    }
  };

  const next = `${JSON.stringify(payload, null, 2)}\n`;
  const previous = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : null;
  if (previous === next) return { status: "unchanged", raceKey: payload.raceKey };
  fs.writeFileSync(OUTPUT, next, "utf8");
  return { status: "written", raceKey: payload.raceKey };
}

if (require.main === module) console.log(JSON.stringify(buildIphoneHandoff()));
module.exports = { buildIphoneHandoff };
