'use strict';
// Synthetic GET responses only. Historical JSON code bytes are inert fixtures.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const historical = require('./fixtures/note-recovery-code.json');
const root = path.join(__dirname, '..');
const blobSha = bytes => createHash('sha1').update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
function response(data, status = 200) { return { status, json: async () => data }; }
function requestFixture(identity, { version = 'readable-v3', rootDir = root, largeSource = false, mutate } = {}) {
  const claimSha = 'b'.repeat(40), calls = [], blobs = new Map();
  const request = async (url, options) => {
    if (options?.method && options.method !== 'GET') throw Error('test_unexpected_write');
    calls.push(url);
    const parsed = new URL(url), pathname = parsed.pathname;
    let result;
    const draftClaimRef = require('./note-github-ui-transport').draftClaimRef;
    if (pathname.includes('/git/ref/tags/note-published/')) result = response(null, 404);
    else if (pathname.includes('/git/ref/tags/note-draft-claim/')) result = response({ ref: draftClaimRef(identity), object: { type: 'commit', sha: claimSha }, presentationVersion: 'forged-untrusted-field' });
    else if (pathname.endsWith(`/git/commits/${claimSha}`)) result = response({ sha: claimSha, tree: { sha: 'c'.repeat(40) } });
    else if (pathname.includes('/contents/')) {
      if (parsed.searchParams.get('ref') !== claimSha) throw Error('test_mutable_ref');
      const file = pathname.split('/contents/')[1];
      const bytes = file === identity.sourcePath ? fs.readFileSync(path.join(rootDir, file))
        : Buffer.from(historical.versions[version]?.files[file] ?? fs.readFileSync(path.join(file === 'config/note-marketing.json' ? rootDir : root, file)));
      const sha = blobSha(bytes); blobs.set(sha, bytes);
      result = response({ type: 'file', path: file, sha, encoding: largeSource && file === identity.sourcePath ? 'none' : 'base64',
        content: largeSource && file === identity.sourcePath ? '' : bytes.toString('base64') });
    } else if (pathname.includes('/git/blobs/')) {
      const sha = pathname.split('/git/blobs/')[1], bytes = blobs.get(sha);
      result = bytes ? response({ sha, encoding: 'base64', content: bytes.toString('base64') }) : response(null, 404);
    } else throw Error('test_unexpected_get_' + pathname);
    return mutate ? await mutate(url, result) : result;
  };
  return { request, calls, claimSha };
}
module.exports = { requestFixture, blobSha, response };
