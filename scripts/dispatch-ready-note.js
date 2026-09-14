'use strict';

const { execFileSync } = require('node:child_process');
const { buildLatestHandoff } = require('./build-note-publish-handoff');
const { preparePublication, requirePublicationGate } = require('./note-github-ui-transport');
const REPOSITORY = 'takechanman12250711-oss/chappy-boatrace-ai';

function assertSourceOnlyChanges(git) {
  const paths = [git(['diff', '--name-only', 'HEAD']), git(['ls-files', '--others', '--exclude-standard'])]
    .join('\n').split('\n').filter(Boolean);
  if (paths.some(file => !/^data\/note-drafts\/\d{8}\/\d{8}-\d{2}-\d{1,2}-[a-f0-9]{64}\.json$/.test(file))) {
    throw new Error('note_only_writer_has_unrelated_changes');
  }
}

function pushSourceWithRebase(git, guard) {
  // Only immutable note files may be rebased concurrently with the central writer.
  // Ref updates stay fast-forward: a lost race retries against the new main.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    guard();
    git(['pull', '--rebase', 'origin', 'main']);
    guard();
    try { git(['push', 'origin', 'HEAD:refs/heads/main']); return; }
    catch (error) { if (attempt === 2) throw error; }
  }
}

async function dispatchReadyNote({ env = process.env, request = fetch,
  git = args => execFileSync('git', args, { encoding: 'utf8' }).trim(),
  prepare = preparePublication, build = buildLatestHandoff, guard = requirePublicationGate } = {}) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main' || !env.NOTE_CLAIM_TOKEN) {
    throw new Error('note_early_dispatch_context_invalid');
  }
  const gate = await prepare({ env, request, handoff: build({ write: false }).payload });
  console.log(`NOTE_EARLY_PREFLIGHT=${JSON.stringify({ ok: gate.ok, reason: gate.reason, skipped: gate.skipped })}`);
  if (!gate.ok) return { dispatched: false, reason: gate.reason };
  guard(gate.payload);
  const file = gate.payload.sourcePath;
  const isolated = env.NOTE_SOURCE_ISOLATED === "true";
  if (isolated) assertSourceOnlyChanges(git);
  // Persist the exact audited bundle before dispatch. Do not include pending
  // prediction/statistics changes, and never force-push or rewrite history.
  git(['add', '--', file]);
  if (git(['diff', '--cached', '--name-only', '--', file])) {
    git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit', '--only', '-m', `Save audited note source ${gate.payload.raceKey}`, '--', file]);
  }
  if (isolated) pushSourceWithRebase(git, () => guard(gate.payload));
  else git(['push', 'origin', 'HEAD:refs/heads/main']);
  guard(gate.payload);
  const response = await request(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/note-github-ui-transport.yml/dispatches`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.NOTE_CLAIM_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { mode: 'publish' } }), signal: AbortSignal.timeout(30000)
  });
  if (response.status !== 204) throw new Error(`note_early_dispatch_failed_${response.status}`);
  console.log(`NOTE_EARLY_DISPATCHED=${gate.payload.raceKey}`);
  return { dispatched: true, raceKey: gate.payload.raceKey };
}

if (require.main === module) dispatchReadyNote().catch(error => {
  console.error(`NOTE_EARLY_DISPATCH_FAILED=${error.message}`); process.exitCode = 1;
});
module.exports = { dispatchReadyNote, assertSourceOnlyChanges, pushSourceWithRebase };

