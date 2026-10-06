'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateSharedProfile, jstDate } = require('../api/_official-start-rank');
const VERSION = 'official-start-rank-cache-v1';
const REPO = 'takechanman12250711-oss/chappy-boatrace-ai';
const bot = ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];
function assertContext(env) {
  if (env.GITHUB_REPOSITORY !== REPO || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_EVENT_NAME === 'pull_request') throw Error('rank_cache_context_invalid');
}
function mergeProfiles(documents, date, now) {
  const profiles = {};
  for (const document of documents) {
    if (document?.version !== VERSION || document.date !== date) continue;
    for (const [registerNo, raw] of Object.entries(document.profiles || {})) {
      const profile = validateSharedProfile(raw, { registerNo, date, now });
      if (profile && (!profiles[registerNo] || profile.fetchedAt > profiles[registerNo].fetchedAt)) profiles[registerNo] = profile;
    }
  }
  return { version: VERSION, date, profiles: Object.fromEntries(Object.entries(profiles).sort(([a], [b]) => a.localeCompare(b))) };
}
function write(file, document) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(document, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function createRecorder(file, { env = process.env, now = Date.now } = {}) {
  assertContext(env);
  if (fs.existsSync(file)) throw Error('rank_cache_stage_not_empty');
  let saved = null;
  return data => {
    const clock = now(), date = jstDate(clock);
    if (data?.source !== 'boatrace-official' || data.date !== date || !Array.isArray(data.entries)) return;
    const profiles = {};
    for (const entry of data.entries) {
      const registerNo = String(entry.registerNo || '');
      const profile = validateSharedProfile(entry.officialStartRank, { registerNo, date, now: clock });
      if (profile) profiles[registerNo] = profile;
    }
    saved = mergeProfiles([saved, { version: VERSION, date, profiles }], date, clock);
    if (Object.keys(saved.profiles).length) write(file, saved);
  };
}
function save(file, { root = process.cwd(), env = process.env, now = Date.now,
  git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() } = {}) {
  assertContext(env);
  const staged = read(file);
  if (!staged) return { saved: 0 };
  const date = jstDate(now()), relative = `data/official-start-rank-cache/${date}.json`;
  if (staged.date !== date) return { saved: 0 };
  // This derived-cache writer runs last in the existing serial live-note job.
  // Refuse any pending source/prediction edits; do not widen the immutable writer.
  if (git(['status', '--porcelain'])) throw Error('rank_cache_unrelated_changes');
  git([...bot, 'pull', '--rebase', 'origin', 'main']);
  const target = path.join(root, relative), previous = read(target);
  const merged = mergeProfiles([previous, staged], date, now());
  if (!Object.keys(merged.profiles).length || JSON.stringify(previous) === JSON.stringify(merged)) return { saved: 0 };
  write(target, merged);
  const changed = [git(['diff', '--name-only', 'HEAD']), git(['ls-files', '--others', '--exclude-standard'])].join('\n').split('\n').filter(Boolean);
  if (changed.some(name => name !== relative)) throw Error('rank_cache_unrelated_changes');
  git(['add', '--', relative]);
  git([...bot, 'commit', '--only', '-m', 'Share current official start rank profiles', '--', relative]);
  for (let attempt = 0; attempt < 3; attempt++) {
    try { git(['push', 'origin', 'HEAD:refs/heads/main']); break; }
    catch (error) {
      if (attempt === 2) throw error;
      // No force/reset. A same-file conflict fails visibly rather than overwriting.
      git([...bot, 'pull', '--rebase', 'origin', 'main']);
    }
  }
  return { saved: Object.keys(merged.profiles).length, path: relative };
}
if (require.main === module) {
  const file = process.argv[2];
  if (!file || !path.isAbsolute(file)) throw Error('rank_cache_stage_path_required');
  console.log('OFFICIAL_START_RANK_CACHE=' + JSON.stringify(save(file)));
}
module.exports = { VERSION, mergeProfiles, createRecorder, save };
