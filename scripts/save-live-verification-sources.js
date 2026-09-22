'use strict';
const { execFileSync } = require('node:child_process');
const { pushSourceWithRebase } = require('./dispatch-ready-note');
function save({ env = process.env, git = args => execFileSync('git', args, { encoding: 'utf8' }).trim() } = {}) {
  if (env.GITHUB_REPOSITORY !== 'takechanman12250711-oss/chappy-boatrace-ai' || env.GITHUB_REF !== 'refs/heads/main') throw new Error('live_source_context_invalid');
  const guard = () => {
    const files = [git(['diff', '--name-only', 'HEAD']), git(['ls-files', '--others', '--exclude-standard'])].join('\n').split('\n').filter(Boolean);
    if (files.some(p => !/^data\/(note-drafts|outer-attack-sources)\/\d{8}\/\d{8}-\d{2}-\d{1,2}-[a-f0-9]{64}\.json$/.test(p) && !/^data\/verification-coverage\/\d{8}\/[a-f0-9]{64}\.json$/.test(p))) throw new Error('live_source_unrelated_changes');
    return [...new Set(files)];
  };
  const files = guard();
  if (!files.length) return { saved: 0 };
  git(['add', '--', ...files]);
  git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '--only', '-m', 'Save immutable live verification sources', '--', ...files]);
  pushSourceWithRebase(git, guard);
  console.log(`LIVE_VERIFICATION_SAVED=${files.length}`);
  return { saved: files.length };
}
if (require.main === module) save();
module.exports = { save };
