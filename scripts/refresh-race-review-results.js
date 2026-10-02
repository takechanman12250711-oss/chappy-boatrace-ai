'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { assess } = require('./build-race-review-progress');
async function refresh(root = process.cwd(), { now = Date.now(), fetchResult, maxRequests = 24 } = {}) {
  fetchResult ||= ({ date, jcd, rno }) => require('./collect-results').callApi(require('../api/result'), { date, jcd, rno: String(rno) });
  const output = path.join(root, 'data/stats/race-review-results.json');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const ledger = fs.existsSync(output) ? read(output) : { version: 'race-review-results-v1', races: {}, attempts: {} };
  const pending = new Map(), dir = path.join(root, 'data/note-drafts');
  for (const date of fs.existsSync(dir) ? fs.readdirSync(dir).filter(d => /^\d{8}$/.test(d)) : []) {
    for (const file of fs.readdirSync(path.join(dir, date)).filter(f => f.endsWith('.json'))) {
      const b = read(path.join(dir, date, file)), r = b.record;
      if (assess(b).reason || Date.parse(r.deadlineAt) + 15 * 60000 > now || ledger.races[r.raceKey]) continue;
      pending.set(r.raceKey, r);
    }
  }
  const sources = path.join(root, 'data/outer-attack-sources');
  for (const date of fs.existsSync(sources) ? fs.readdirSync(sources).filter(d => /^\d{8}$/.test(d)) : []) {
    for (const file of fs.readdirSync(path.join(sources, date)).filter(f => f.endsWith('.json'))) {
      const source = read(path.join(sources, date, file)), r = source.record;
      if (!require('./outer-attack-live-source').validSource(source) || Date.parse(r.deadlineAt) + 15 * 60000 > now || ledger.races[r.raceKey]) continue;
      pending.set(r.raceKey, r);
    }
  }
  const targets = [...pending.values()].sort((a, b) =>
    (Date.parse(ledger.attempts[a.raceKey]?.checkedAt) || 0) - (Date.parse(ledger.attempts[b.raceKey]?.checkedAt) || 0) || a.raceKey.localeCompare(b.raceKey)).slice(0, maxRequests);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => {
    while (cursor < targets.length) {
      const r = targets[cursor++];
      try {
        const result = await fetchResult({ date: r.date, jcd: r.jcd, rno: r.raceNo });
        if (result?.ok !== true || result.source !== 'boatrace-official' || result.date !== r.date ||
            result.jcd !== r.jcd || Number(result.raceNo) !== r.raceNo) throw new Error('official_result_identity_mismatch');
        const complete = result.void || result.status === 'void' || (result.resultAvailable && /^[1-6]-[1-6]-[1-6]$/.test(result.trifecta?.combination || '') && Number.isFinite(result.trifecta?.payout) && result.trifecta.payout > 0);
        ledger.attempts[r.raceKey] = { checkedAt: new Date(now).toISOString(), status: complete ? 'resolved' : 'pending' };
        if (ledger.attempts[r.raceKey].status === 'resolved') ledger.races[r.raceKey] = result;
      } catch (error) { ledger.attempts[r.raceKey] = { checkedAt: new Date(now).toISOString(), status: 'retry', error: String(error.message).slice(0,160) }; }
    }
  }));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output + '.tmp', JSON.stringify(ledger) + '\n'); fs.renameSync(output + '.tmp', output);
  console.log(`Review results: checked ${targets.length}, saved ${Object.keys(ledger.races).length}`);
  return ledger;
}
if (require.main === module) refresh().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { refresh };
