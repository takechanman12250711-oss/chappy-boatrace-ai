'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const workflow = read('.github/workflows/deploy-pages.yml');
const repo = 'takechanman12250711-oss/chappy-boatrace-ai';
// Evaluate the workflow's actual condition with event fixtures; no duplicated gate.
const gate = workflow.match(/  check:\n    if: >-\n([\s\S]*?)    runs-on:/)[1].trim();
const eligible = github => vm.runInNewContext(`Boolean(${gate})`, { github });
const writerEvent = overrides => ({
  repository: repo,
  event_name: 'workflow_run',
  ref: 'refs/heads/main',
  event: { workflow_run: {
    name: 'Collect live note independently',
    conclusion: 'success',
    event: 'schedule',
    head_branch: 'main',
    head_repository: { full_name: repo },
    ...overrides,
  } },
});

test('GITHUB_TOKEN data writers have an explicit completed-run route', () => {
  const section = workflow.match(/  workflow_run:\n([\s\S]*?)\npermissions:/)[1];
  assert.match(section, /types: \[completed\]/);
  assert.match(section, /branches: \[main\]/);
  const writerFiles = [
    'live-note.yml', 'collect-predictions.yml', 'collect-results.yml',
    'build-continuous-performance-ledger.yml', 'build-race-insight-report.yml',
    'build-learning-analysis-pipeline.yml', 'build-boat-data-site.yml',
    'build-boat-data-before.yml', 'build-note-publish-handoff.yml',
  ];
  const configuredNames = [...section.matchAll(/^      - (.+)$/gm)].map(m => m[1]);
  const actualNames = writerFiles.map(file => read(`.github/workflows/${file}`).match(/^name: (.+)$/m)[1]);
  assert.deepEqual(configuredNames.sort(), actualNames.sort());
  // Saving with the Actions token does not emit a new push run. A successful
  // writer completion must still be eligible without any push event.
  for (const name of actualNames) assert.equal(eligible(writerEvent({ name })), true, name);
  assert.equal(configuredNames.includes(workflow.match(/^name: (.+)$/m)[1]), false, 'deployment must not trigger itself');
});

test('only successful same-repository main writers can start a deployment', () => {
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', null]) {
    assert.equal(eligible(writerEvent({ conclusion })), false, String(conclusion));
  }
  assert.equal(eligible(writerEvent({ head_branch: 'feature' })), false);
  assert.equal(eligible(writerEvent({ event: 'pull_request' })), false);
  assert.equal(eligible(writerEvent({ head_repository: null })), false);
  assert.equal(eligible(writerEvent({ head_repository: { full_name: 'other/fork' } })), false);
  assert.equal(eligible({ ...writerEvent(), repository: 'other/fork' }), false);
});

test('push and manual runs require main; unrelated events are rejected', () => {
  for (const event_name of ['push', 'workflow_dispatch']) {
    const github = { repository: repo, event_name, ref: 'refs/heads/main', event: {} };
    assert.equal(eligible(github), true);
    assert.equal(eligible({ ...github, ref: 'refs/heads/feature' }), false);
  }
  assert.equal(eligible({ repository: repo, event_name: 'pull_request', ref: 'refs/heads/main', event: {} }), false);
  assert.match(workflow, /push:\n    branches: \[main\]/);
  assert.doesNotMatch(workflow, /^  schedule:/m, 'no new scheduled monitor');
});

test('duplicate entrypoints share the non-cancelling deployment queue and read current main', () => {
  const deploy = workflow.slice(workflow.indexOf('\n  deploy:'));
  assert.match(deploy, /needs: check/);
  assert.match(deploy, /if: needs\.check\.outputs\.source == 'workflow'/);
  assert.match(deploy, /concurrency:\n      group: pages-deploy\n      cancel-in-progress: false/);
  const checkout = deploy.match(/- uses: actions\/checkout@v4\n([\s\S]*?)- uses: actions\/configure-pages/)[1];
  assert.match(checkout, /ref: main/);
  assert.doesNotMatch(checkout, /workflow_run\.head_sha|github\.event\.pull_request/);
  assert.match(checkout, /persist-credentials: false/);
  assert.doesNotMatch(deploy, /actions\/download-artifact/);
});

test('deploy waits past the 10-minute default inside the job limit', () => {
  const deploy = workflow.slice(workflow.indexOf('\n  deploy:'));
  const minutes = Number(deploy.match(/timeout-minutes: (\d+)/)[1]);
  const step = deploy.match(/uses: actions\/deploy-pages@v4\n        with:\n          timeout: (\d+)/);
  assert.ok(step, 'deploy-pages timeout is explicit');
  const ms = Number(step[1]);
  assert.ok(ms > 600000, 'longer than the action default that cancelled run 42799511972');
  assert.ok(ms < minutes * 60000, 'still ends before the job limit');
});

test('token-queued live note runs request a deployment without blocking the relay', () => {
  // Runs queued with the Actions token emit no workflow_run, so the relay asks directly.
  const live = read('.github/workflows/live-note.yml');
  const relay = live.slice(live.indexOf('\n  relay:'));
  assert.match(relay, /permissions:\n      actions: write/);
  const request = relay.match(/- name: Request a site deployment[^\n]*\n([\s\S]*?)\n      - name: /)[1];
  assert.match(request, /id: deploy-request/);
  assert.match(request, /if: github\.event_name != 'schedule' \|\| needs\.live-note\.result != 'success'/);
  assert.match(request, /continue-on-error: true/);
  assert.match(request, /gh workflow run deploy-pages\.yml --repo "\$REPO" --ref main/);
  const order = ['Request a site deployment', 'Queue the next live note run', 'Surface a failed site deployment request'];
  const at = order.map(name => relay.indexOf(`- name: ${name}`));
  assert.ok(at.every(i => i > 0) && at[0] < at[1] && at[1] < at[2], 'request, then relay, then surface failure');
  const surface = relay.slice(at[2]);
  assert.match(surface, /if: always\(\) && steps\.deploy-request\.outcome == 'failure'/);
  assert.match(surface, /exit 1/);
});
