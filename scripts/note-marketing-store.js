'use strict';
const { VERSION, jstDate, initialState, receiptRow } = require('./note-marketing-content');
const REPO = 'takechanman12250711-oss/chappy-boatrace-ai';
const BRANCH = 'note-marketing-state';
function client(env = process.env, request = fetch) {
  const revision = env.NOTE_CLAIM_SHA || env.GITHUB_SHA;
  if (env.GITHUB_REPOSITORY !== REPO || !env.NOTE_CLAIM_TOKEN || !/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('marketing_repository_context_invalid');
  const base = `https://api.github.com/repos/${REPO}`;
  async function api(route, method = 'GET', body, missing = false) {
    const response = await request(base + route, { method, headers: { Authorization: `Bearer ${env.NOTE_CLAIM_TOKEN}`,
      Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`marketing_github_${method}_${response.status}`);
    return response.json();
  }
  async function file(filePath, ref) {
    let data = await api(`/contents/${filePath}?ref=${encodeURIComponent(ref)}`);
    // The Contents API omits base64 for originals larger than 1 MiB.
    // Read the exact returned Git blob, then still verify the original SHA256.
    if (data.encoding === 'none' && data.type === 'file' && /^[a-f0-9]{40}$/.test(data.sha || '')) {
      data = await api(`/git/blobs/${data.sha}`);
    }
    if (data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error('marketing_file_encoding_invalid');
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  async function load(config) {
    const ref = await api(`/git/ref/heads/${BRANCH}`, 'GET', null, true);
    if (!ref) return { state: initialState(config), head: null };
    if (!/^[a-f0-9]{40}$/.test(ref.object?.sha || '')) throw new Error('marketing_state_ref_invalid');
    const state = JSON.parse(await file('state.json', ref.object.sha));
    if (state.version !== VERSION || !Array.isArray(state.seenRefs) || !Array.isArray(state.rows) || !state.articles?.guide || !state.articles?.index) throw new Error('marketing_state_invalid');
    return { state, head: ref.object.sha };
  }
  async function collect(state, now = Date.now()) {
    const refs = await api('/git/matching-refs/tags/note-published/');
    if (!Array.isArray(refs)) throw new Error('marketing_receipt_refs_invalid');
    const seen = new Set(state.seenRefs), date = jstDate(now);
    const rows = state.date === date ? [...state.rows] : [];
    for (const ref of refs) {
      if (!/^refs\/tags\/note-published\/[a-f0-9]{64}$/.test(ref.ref || '') || !/^[a-f0-9]{40}$/.test(ref.object?.sha || '')) throw new Error('marketing_receipt_ref_invalid');
      const key = `${ref.ref}:${ref.object.sha}`;
      if (seen.has(key)) continue;
      const receipt = JSON.parse(await file('receipt.json', ref.object.sha));
      // Validate old receipts too, but only fetch prediction originals for today.
      let bytes = '';
      if (String(receipt.raceKey).slice(0, 8) === date && /^\d{8}-\d{2}-\d{1,2}$/.test(receipt.raceKey) && /^[a-f0-9]{64}$/.test(receipt.sourceSha256 || '')) {
        bytes = await file(`data/note-drafts/${date}/${receipt.raceKey}-${receipt.sourceSha256}.json`, 'main');
      }
      const row = receiptRow(receipt, bytes, now);
      if (row) rows.push(row);
      seen.add(key);
    }
    return { ...state, date, seenRefs: [...seen].sort(), rows };
  }
  async function save(state, head) {
    const tree = await api('/git/trees', 'POST', { tree: [{ path: 'state.json', mode: '100644', type: 'blob', content: JSON.stringify(state, null, 2) + '\n' }] });
    const commit = await api('/git/commits', 'POST', { message: 'Record verified note marketing update', tree: tree.sha, parents: [head || revision] });
    const result = head ? await api(`/git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha, force: false })
      : await api('/git/refs', 'POST', { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
    if (result.object?.sha !== commit.sha) throw new Error('marketing_state_save_unverified');
    return commit.sha;
  }
  return { load, collect, save };
}
module.exports = { REPO, BRANCH, client };
