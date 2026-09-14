'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { preparePublication, run } = require('./note-github-ui-transport');
const { buildLatestHandoff } = require('./build-note-publish-handoff');
const REPOSITORY = 'takechanman12250711-oss/chappy-boatrace-ai';

async function publishQueue({ env = process.env, request = fetch, prepare = preparePublication,
  publish = run, build = buildLatestHandoff, now = Date.now } = {}) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || !env.NOTE_CLAIM_TOKEN || env.NOTE_UI_MODE !== 'publish') {
    throw new Error('publication_queue_context_invalid');
  }
  const started = now();
  const handoff = build({ write: false }).payload;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'note-publication-queue-'));
  let published = 0;
  try {
    while (handoff.candidates.length && now() - started < 6 * 60 * 1000 && published < 8) {
      const gate = await prepare({ env, request, handoff });
      if (!gate.ok) break;
      const file = path.join(directory, 'publication.json');
      fs.writeFileSync(file, JSON.stringify(gate.payload));
      // Each article still goes through the original fresh audit, atomic claim,
      // one final click and anonymous public receipt verification.
      const receipt = await publish({ env: { ...env, NOTE_IPHONE_HANDOFF: file } });
      if (!receipt?.url || receipt.raceKey !== gate.payload.raceKey) throw new Error('publication_receipt_missing');
      published++;
      handoff.candidates = handoff.candidates.filter(c => c.raceKey !== gate.payload.raceKey);
    }
    const pending = await prepare({ env, request, handoff });
    if (pending.ok) {
      const response = await request(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/note-github-ui-transport.yml/dispatches`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.NOTE_CLAIM_TOKEN}`,
          Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: { mode: 'publish' } }), signal: AbortSignal.timeout(30000)
      });
      if (response.status !== 204) throw new Error(`publication_queue_dispatch_failed_${response.status}`);
    }
    console.log(`NOTE_QUEUE=${JSON.stringify({ published, continued: pending.ok })}`);
    return { published, continued: pending.ok };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
if (require.main === module) publishQueue().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { publishQueue };
