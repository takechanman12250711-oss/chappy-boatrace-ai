"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const names = ["chappy-boatrace-dev", "chappy-race-select", "chappy-note-generate", "chappy-note-audit", "chappy-note-publish", "chappy-note-settle"];

function filesIn(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), "Skill copies must not depend on machine-local symlinks");
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? filesIn(path.join(directory, entry.name), relative) : [relative];
  }).sort();
}

for (const name of names) {
  const codex = path.join(root, ".agents", "skills", name);
  const claude = path.join(root, ".claude", "skills", name);
  const files = filesIn(codex);
  assert.deepEqual(filesIn(claude), files, `${name}: file lists differ`);
  assert(files.includes("SKILL.md"));
  for (const file of files) {
    assert.equal(fs.readFileSync(path.join(codex, file), "utf8"),
      fs.readFileSync(path.join(claude, file), "utf8"), `${name}/${file}: instructions drifted`);
  }
  const text = fs.readFileSync(path.join(codex, "SKILL.md"), "utf8");
  assert(text.startsWith(`---\nname: ${name}\ndescription: `));
  assert(!text.includes("[TODO"));
}
console.log(`${names.length} shared Chappy skills match across Codex and Claude Code`);
