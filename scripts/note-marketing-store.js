'use strict';
const { VERSION, jstDate, recentDates, initialState, receiptRow } = require('./note-marketing-content');
const { settlePublished, distributionDrafts } = require('./note-marketing-reports');
const { sourceContext } = require('./note-marketing-social');
const REPO = 'takechanman12250711-oss/chappy-boatrace-ai';
const BRANCH = 'note-marketing-state';
function client(env = process.env, request = fetch) {
  const revision = env.NOTE_CLAIM_SHA || env.GITHUB_SHA;
  if (env.GITHUB_REPOSITORY !== REPO || !env.NOTE_CLAIM_TOKEN || !/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('marketing_repository_context_invalid');
  const base = `https://api.github.com/repos/${REPO}`;
  async function api(route, method = 'GET', body, missing = false) {
    const response = await request(base + route, { method, redirect: 'error', headers: { Authorization: `Bearer ${env.NOTE_CLAIM_TOKEN}`,
      Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`marketing_github_${method}_${response.status}`);
    return response.json();
  }
  async function file(filePath, ref, missing = false) {
    let data = await api(`/contents/${filePath}?ref=${encodeURIComponent(ref)}`, 'GET', null, missing);
    if (data === null) return null;
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
    // One-time migration rechecks receipts to recover yesterday's verified
    // originals and add count/result links. Later runs remain incremental.
    const migrated = state.receiptWindowVersion === 2;
    const seen = new Set(migrated ? state.seenRefs : []), date = jstDate(now), dates = recentDates(now);
    const rows = migrated ? state.rows.filter(r=>dates.includes(r.raceKey.slice(0,8))) : [];
    for (const ref of refs) {
      if (!/^refs\/tags\/note-published\/[a-f0-9]{64}$/.test(ref.ref || '') || !/^[a-f0-9]{40}$/.test(ref.object?.sha || '')) throw new Error('marketing_receipt_ref_invalid');
      const key = `${ref.ref}:${ref.object.sha}`;
      if (seen.has(key)) continue;
      const receipt = JSON.parse(await file('receipt.json', ref.object.sha));
      // Validate old receipts too; originals are needed for today and yesterday.
      let bytes = '';
      const sourceDate = String(receipt.raceKey).slice(0,8);
      if (dates.includes(sourceDate) && /^\d{8}-\d{2}-\d{1,2}$/.test(receipt.raceKey) && /^[a-f0-9]{64}$/.test(receipt.sourceSha256 || '')) {
        bytes = await file(`data/note-drafts/${sourceDate}/${receipt.raceKey}-${receipt.sourceSha256}.json`, 'main');
      }
      const row = receiptRow(receipt, bytes, now);
      if (row) rows.push(row);
      seen.add(key);
    }
    return { ...state, date, receiptWindowVersion: 2, seenRefs: [...seen].sort(), rows };
  }
  async function save(state, head) {
    const tree = await api('/git/trees', 'POST', { tree: [{ path: 'state.json', mode: '100644', type: 'blob', content: JSON.stringify(state, null, 2) + '\n' }] });
    const commit = await api('/git/commits', 'POST', { message: 'Record verified note marketing update', tree: tree.sha, parents: [head || revision] });
    const result = head ? await api(`/git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha, force: false })
      : await api('/git/refs', 'POST', { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
    if (result.object?.sha !== commit.sha) throw new Error('marketing_state_save_unverified');
    return commit.sha;
  }
  async function settle(state, config, now = Date.now(), { refresh = false, fetchResult, clock = Date.now } = {}) {
    const dates = [...new Set(state.rows.map(r => r.raceKey.slice(0,8)))];
    const daily = new Map();
    for (const date of dates) {
      const bytes = await file(`data/results/${date}.json`, 'main', true);
      if (bytes === null) continue;
      const data = JSON.parse(bytes);
      if (data.source !== 'boatrace-official' || data.date !== date || !Array.isArray(data.races)) throw new Error('marketing_results_file_invalid');
      for (const r of data.races) {
        const key = `${r.date}-${r.jcd}-${Number(r.raceNo)}`;
        if (daily.has(key)) throw new Error('marketing_results_duplicate');
        daily.set(key, r);
      }
    }
    // Reuse both existing official collectors; do not introduce a new scraper.
    let ledger = { races: {} };
    if (state.rows.some(r => !daily.get(r.raceKey)?.resultAvailable && daily.get(r.raceKey)?.status !== 'void')) {
      const bytes = await file('data/stats/race-review-results.json', 'main', true);
      if (bytes) {
        ledger = JSON.parse(bytes);
        if (ledger.version !== 'race-review-results-v1' || !ledger.races) throw new Error('marketing_result_ledger_invalid');
      }
    }
    const keys = new Set(state.rows.map(r => r.raceKey));
    const officialResults = Object.fromEntries(Object.entries(state.officialResults || {}).filter(([key]) => keys.has(key)));
    const resultAttempts = Object.fromEntries(Object.entries(state.resultAttempts || {}).filter(([key]) => keys.has(key)));
    const attempted = new Set();
    const rows = [];
    for (const row of state.rows) {
      const bytes = await file(`data/note-drafts/${row.raceKey.slice(0,8)}/${row.raceKey}-${row.sourceSha256}.json`, 'main', true);
      const result = daily.get(row.raceKey);
      let official = result?.resultAvailable || result?.status === 'void' ? result : (ledger.races[row.raceKey] || officialResults[row.raceKey] || result);
      let settlement = bytes === null ? { status: 'review', reason: 'published_source_missing' } : settlePublished(row, bytes, official, refresh ? clock() : now);
      // Only verified published originals that are still waiting need a fetch.
      // Reuse api/result's official parser; no new scraper or research writer.
      if (refresh && settlement.status === 'pending' && now >= Date.parse(row.deadlineAt) + 15 * 60000 &&
          attempted.size < 12 && !attempted.has(row.raceKey) &&
          now - (Date.parse(resultAttempts[row.raceKey]?.checkedAt) || 0) >= 20 * 60000) {
        attempted.add(row.raceKey);
        resultAttempts[row.raceKey] = { checkedAt: new Date(now).toISOString(), status: 'retry' };
        try {
          const candidate = await (fetchResult || require('./note-marketing-results').fetchOfficialResult)(row.raceKey);
          const checked = settlePublished(row, bytes, candidate, clock());
          if (checked.reason !== 'official_result_identity_mismatch') {
            officialResults[row.raceKey] = candidate;
            official = candidate;
          }
          settlement = checked;
          resultAttempts[row.raceKey].status = checked.status;
        } catch { /* Keep the verified pending snapshot; retry on a later run. */ }
      }
      rows.push({ ...row, settlement, socialContext: sourceContext(row,bytes) });
    }
    return { ...state, rows, ...(refresh || state.officialResults ? { officialResults, resultAttempts } : {}),
      distribution: distributionDrafts(rows, config, state.date) };
  }
  // Reuse the same scoped client for permanent social claims and receipts.
  return { load, collect, settle, save, api, revision };
}
module.exports = { REPO, BRANCH, client };
