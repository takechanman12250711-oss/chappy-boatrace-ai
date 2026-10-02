"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data", "note-publish", "latest.json");
const OUTPUT_DIR = path.join(ROOT, "data", "note-publish");
const OUTPUT = path.join(OUTPUT_DIR, "latest.md");

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function buildNoteMcpMarkdown() {
  if (!fs.existsSync(INPUT)) {
    return { status: "no_handoff" };
  }

  const handoff = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const candidates = Array.isArray(handoff.candidates) ? handoff.candidates : [];
  if (!candidates.length) return { status: "no_candidate" };

  const candidate = candidates[0];
  if (!candidate.title || !candidate.fullText) return { status: "invalid_candidate" };

  const tags = Array.isArray(candidate.tags) ? candidate.tags.filter(Boolean) : [];
  const frontMatter = [
    "---",
    `title: ${yamlString(candidate.title)}`,
    "tags:",
    ...tags.map(tag => `  - ${yamlString(tag)}`),
    "---",
    ""
  ];
  const markdown = `${frontMatter.join("\n")}${candidate.fullText.trim()}\n`;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const previous = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : null;
  if (previous === markdown) {
    return { status: "unchanged", raceKey: candidate.raceKey, path: "data/note-publish/latest.md" };
  }
  fs.writeFileSync(OUTPUT, markdown, "utf8");
  return { status: "written", raceKey: candidate.raceKey, path: "data/note-publish/latest.md" };
}

if (require.main === module) {
  console.log(JSON.stringify(buildNoteMcpMarkdown()));
}

module.exports = { buildNoteMcpMarkdown };
