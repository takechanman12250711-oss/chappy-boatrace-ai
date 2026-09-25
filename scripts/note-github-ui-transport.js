'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { raceDateFromKey } = require('./build-note-iphone-handoff');

const DEFAULT_HANDOFF = path.join(process.cwd(), 'data', 'note-publish', 'iphone.json');
const EXPECTED_PRICE_YEN = 300;
const NOTE_EDITOR_URL = 'https://editor.note.com/new';
const BROWSER_USE_API_URL = 'https://api.browser-use.com/api/v4/browsers';
const BROWSER_USE_PROXY_COUNTRY = 'jp';
const BROWSER_USE_TIMEOUT_MINUTES = 10;

function loadHandoff(handoffPath = DEFAULT_HANDOFF) {
  const absolute = path.resolve(handoffPath);
  if (!fs.existsSync(absolute)) throw new Error('note_handoff_missing');
  const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  return { absolute, payload };
}

function loadStorageState(env = process.env) {
  const encoded = String(env.NOTE_STATE_JSON_BASE64 || '').trim();
  if (!encoded) throw new Error('note_state_missing');

  let state;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    state = JSON.parse(decoded);
  } catch {
    throw new Error('note_state_invalid');
  }

  if (!state || typeof state !== 'object' || !Array.isArray(state.cookies) || !Array.isArray(state.origins)) {
    throw new Error('note_state_invalid');
  }
  if (state.cookies.length === 0) throw new Error('note_state_empty');
  return state;
}

function loadBrowserUseConfig(env = process.env) {
  const apiKey = String(env.BROWSER_USE_API_KEY || '').trim();
  const profileId = String(env.BROWSER_USE_PROFILE_ID || '').trim();
  if (!apiKey) throw new Error('browser_use_api_key_missing');
  if (!profileId) throw new Error('browser_use_profile_id_missing');
  return { apiKey, profileId };
}

async function createBrowserUseSession(config, request = fetch) {
  const response = await request(BROWSER_USE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Use-API-Key': config.apiKey
    },
    body: JSON.stringify({
      profileId: config.profileId,
      proxyCountryCode: BROWSER_USE_PROXY_COUNTRY,
      timeout: BROWSER_USE_TIMEOUT_MINUTES
    })
  });
  if (!response.ok) throw new Error(`browser_use_create_failed_${response.status}`);
  const session = await response.json();
  if (!session || !session.id || !session.cdpUrl) throw new Error('browser_use_session_invalid');
  return { id: session.id, cdpUrl: session.cdpUrl };
}

async function stopBrowserUseSession(config, sessionId, request = fetch) {
  if (!sessionId) return { ok: true };
  const response = await request(`${BROWSER_USE_API_URL}/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Use-API-Key': config.apiKey
    },
    body: JSON.stringify({ action: 'stop' })
  });
  return { ok: response.ok, status: response.status };
}

function firstPaidParagraph(paidText) {
  return String(paidText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function articleBody(payload) {
  return `${String(payload.freeText || '').trim()}\n\n${String(payload.paidText || '').trim()}`.trim();
}

function validateDraftGate(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'handoff_invalid' };
  if (payload.canPublish !== true) return { ok: false, reason: payload.blockReason || 'can_publish_false' };
  if (payload.blockReason) return { ok: false, reason: payload.blockReason };
  const nowMs = Number(now);
  if (!Number.isFinite(nowMs) || !Number.isFinite(new Date(nowMs + 9 * 3600000).getTime())) {
    return { ok: false, reason: 'clock_invalid' };
  }
  const today = new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10);
  const raceDate = raceDateFromKey(payload.raceKey);
  if (!raceDate || raceDate !== today || (payload.raceDate && payload.raceDate !== raceDate)) {
    return { ok: false, reason: 'race_day_mismatch' };
  }
  const deadline = String(payload.deadlineAt || '');
  const deadlineMs = Date.parse(deadline);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(deadline) || !Number.isFinite(deadlineMs)) {
    return { ok: false, reason: 'deadline_unavailable' };
  }
  if (deadlineMs <= nowMs) return { ok: false, reason: 'deadline_passed' };
  if (!String(payload.title || '').trim()) return { ok: false, reason: 'title_missing' };
  if (!String(payload.freeText || '').trim()) return { ok: false, reason: 'free_text_missing' };
  if (!String(payload.paidText || '').trim()) return { ok: false, reason: 'paid_text_missing' };
  if (Number(payload.price) !== EXPECTED_PRICE_YEN) return { ok: false, reason: 'price_not_300' };
  return { ok: true };
}

function requireDraftGate(payload, now = Date.now()) {
  const gate = validateDraftGate(payload, now);
  if (!gate.ok) throw new Error(`note_publish_gate_blocked_${gate.reason}`);
}

function draftClaimRef(payload) {
  const parts = /^(\d{8})-(\d{1,2})-(\d{1,2})$/.exec(String(payload.raceKey || ''));
  if (!parts || Number(parts[2]) < 1 || Number(parts[2]) > 24 || Number(parts[3]) < 1 || Number(parts[3]) > 12) {
    throw new Error('note_claim_race_key_invalid');
  }
  // A revised title/body or zero-padding must not create another attempt.
  const race = `${parts[1]}-${Number(parts[2])}-${Number(parts[3])}`;
  return `refs/tags/note-draft-claim/${createHash('sha256').update(race).digest('hex')}`;
}

function loadClaimConfig(env = process.env) {
  const repository = String(env.GITHUB_REPOSITORY || '');
  const sha = String(env.NOTE_CLAIM_SHA || env.GITHUB_SHA || '');
  const token = String(env.NOTE_CLAIM_TOKEN || '');
  if (repository !== 'takechanman12250711-oss/chappy-boatrace-ai' || !/^[a-f0-9]{40}$/.test(sha) || !token) {
    throw new Error('note_claim_configuration_missing');
  }
  return { repository, sha, token };
}

async function preflightDraft(payload, env = process.env, request = fetch) {
  const gate = validateDraftGate(payload);
  if (!gate.ok) return gate;
  const { repository, token } = loadClaimConfig(env);
  const ref = draftClaimRef(payload);
  const response = await request(`https://api.github.com/repos/${repository}/git/ref/${ref.slice(5)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000)
  });
  if (response.status === 404) return validateDraftGate(payload);
  if (response.status !== 200) throw new Error(`note_claim_lookup_failed_${response.status}`);
  const existing = await response.json();
  if (existing.ref !== ref) throw new Error('note_claim_lookup_invalid');
  return { ok: false, reason: 'prior_attempt_review_required' };
}

async function claimDraft(payload, env = process.env, request = fetch) {
  requireDraftGate(payload);
  const { repository, sha, token } = loadClaimConfig(env);
  const ref = draftClaimRef(payload);
  // Atomic creation persists across runners/retries. Never delete on failure:
  // the note write may have succeeded even when its response was lost.
  const response = await request(`https://api.github.com/repos/${repository}/git/refs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, sha }),
    signal: AbortSignal.timeout(30000)
  });
  if (response.status !== 201) throw new Error(`note_claim_not_acquired_${response.status}_review_required`);
  const created = await response.json();
  if (created.ref !== ref || created.object?.sha !== sha) throw new Error('note_claim_response_invalid_review_required');
  requireDraftGate(payload);
  console.log(`NOTE_UI_DRAFT_CLAIM=${ref}`);
  return ref;
}

function isEditorUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'editor.note.com';
  } catch {
    return false;
  }
}

async function ensureEditorReady(page, findVisible) {
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1000);
  if (!isEditorUrl(page.url())) {
    let host = 'unknown';
    try { host = new URL(page.url()).hostname || 'unknown'; } catch {}
    throw new Error(`note_editor_session_not_ready_${host}`);
  }
  const locate = findVisible || require('./note-browserbase-draft-save').waitForVisibleAcrossFrames;
  const title = await locate(page, ['textarea[placeholder*="タイトル"]', 'input[placeholder*="タイトル"]', '[aria-label*="タイトル"]']);
  const body = await locate(page, ['textarea[placeholder*="本文"]', '[data-placeholder*="本文"][contenteditable="true"]', '.ProseMirror[contenteditable="true"]', '[contenteditable="true"][role="textbox"]']);
  if (!isEditorUrl(page.url()) || !title || !body ||
      !(await title.isEditable().catch(() => false)) || !(await body.isEditable().catch(() => false))) {
    throw new Error('note_editor_fields_not_ready');
  }
  return page.url();
}

async function clickVisibleText(page, texts) {
  for (const text of texts) {
    const roleButton = page.getByRole('button', { name: text, exact: false });
    for (let i = 0; i < await roleButton.count(); i += 1) {
      const item = roleButton.nth(i);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        return true;
      }
    }

    const textLocator = page.getByText(text, { exact: false });
    for (let i = 0; i < await textLocator.count(); i += 1) {
      const item = textLocator.nth(i);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        return true;
      }
    }
  }
  return false;
}

async function setPaidPrice(page, price) {
  const { waitForVisibleAcrossFrames } = require('./note-browserbase-draft-save');
  const input = await waitForVisibleAcrossFrames(page, [
    'input#price',
    'input[placeholder*="価格"]',
    'input[aria-label*="価格"]',
    'input[name*="price"]',
    'input[inputmode="numeric"]',
    'input[type="number"]'
  ], 15000);
  if (!input) throw new Error('note_price_input_missing');
  await input.fill(String(price));
  const value = String(await input.inputValue().catch(() => '')).replace(/[^0-9]/g, '');
  if (value !== String(price)) throw new Error('note_price_verification_failed');
}

function paidBoundaryIndex(blocks, start) {
  const matches = blocks.map((block, index) => !block.widget && block.text === start ? index : -1).filter(index => index >= 0);
  if (matches.length !== 1) throw new Error('note_paid_boundary_target_not_unique');
  const index = matches[0] - 1;
  if (index < 0 || !blocks[index].widget || blocks[index].buttons !== 1) {
    throw new Error('note_paid_boundary_marker_missing');
  }
  return index;
}

async function setPaidBoundary(page, paidText) {
  if (!(await clickVisibleText(page, ['有料エリア設定', '有料エリア']))) {
    throw new Error('note_paid_area_button_missing');
  }
  await page.waitForTimeout(1000);

  const start = firstPaidParagraph(paidText);
  if (!start) throw new Error('note_paid_start_missing');
  const editor = page.locator('.ProseMirror.paywall-setting[role="textbox"]');
  const readBlocks = () => editor.evaluate(el => Array.from(el.children, child => ({
    text: (child.textContent || '').trim(),
    widget: child.classList.contains('ProseMirror-widget'),
    buttons: child.querySelectorAll('button').length,
    pressed: child.querySelector('button')?.getAttribute('aria-pressed') === 'true'
  })));
  const blocks = await readBlocks();
  const index = paidBoundaryIndex(blocks, start);
  if (!blocks[index].pressed) {
    await editor.locator(':scope > *').nth(index).getByRole('button', { name: 'ラインをこの場所に変更', exact: true }).click();
  }
  const verified = await readBlocks();
  const selected = paidBoundaryIndex(verified, start);
  if (!verified[selected].pressed || verified.filter(block => block.pressed).length !== 1) {
    throw new Error('note_paid_boundary_verification_failed');
  }
}

async function configurePaidPublication(page, payload) {
  requireDraftGate(payload);
  if (!(await clickVisibleText(page, ['公開に進む', '公開設定']))) {
    throw new Error('note_publish_settings_button_missing');
  }
  await page.waitForTimeout(1000);

  await page.getByText('有料', { exact: true }).click();
  if (!(await page.getByRole('radio', { name: '有料', exact: true }).isChecked())) throw new Error('note_paid_toggle_missing');
  requireDraftGate(payload);
  await setPaidPrice(page, EXPECTED_PRICE_YEN);
  requireDraftGate(payload);
  await setPaidBoundary(page, payload.paidText);
  return { ok: true, price: EXPECTED_PRICE_YEN, paidStart: firstPaidParagraph(payload.paidText) };
}

async function createAuthenticatedPage(browser) {
  // A Browser Use profile is loaded into its existing context. A new incognito
  // context would intentionally omit the saved note cookies.
  const context = browser.contexts()[0];
  if (!context) throw new Error('browser_use_context_missing');
  const page = context.pages()[0] || await context.newPage();
  await ensureEditorReady(page);
  return { context, page };
}

function requirePublicationGate(payload, rootDir = process.cwd(), now = Date.now()) {
  requireDraftGate(payload, now);
  return require('./note-publication-source').verifyPublicationSource(payload, rootDir, now);
}

async function preparePublication({ rootDir = process.cwd(), env = process.env, request = fetch, handoff } = {}) {
  const latest = handoff || JSON.parse(fs.readFileSync(path.join(rootDir, 'data/note-publish/latest.json'), 'utf8'));
  if (!Array.isArray(latest.candidates)) throw new Error('publication_candidates_invalid');
  const skipped = [];
  for (const candidate of latest.candidates) {
    let payload;
    try {
      payload = require('./note-publication-source').publicationPayload(candidate.sourcePath, rootDir);
      requirePublicationGate(payload, rootDir);
    } catch (error) {
      skipped.push({ raceKey: candidate.raceKey, reason: error.message, issueCodes: error.issueCodes });
      continue;
    }
    const gate = await preflightDraft(payload, env, request);
    if (gate.ok) return { ok: true, payload, skipped };
    skipped.push({ raceKey: payload.raceKey, reason: gate.reason });
  }
  return { ok: false, reason: 'no_eligible_unclaimed_article', skipped };
}

function publicArticleUrl(value, noteId) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'note.com' &&
      new RegExp(`^/[^/]+/n/${noteId}/?$`).test(u.pathname) && !u.search ? u.href : null;
  } catch { return null; }
}

async function publishConfiguredArticle(page, payload, paid, guard = requirePublicationGate) {
  guard(payload);
  if (paid?.price !== EXPECTED_PRICE_YEN) throw new Error('publication_price_unverified');
  const noteId = new URL(page.url()).pathname.match(/^\/notes\/(n[a-f0-9]+)\/publish\/?$/)?.[1];
  if (!noteId || !isEditorUrl(page.url())) throw new Error('publication_editor_identity_missing');
  const title = page.getByRole('heading', { name: payload.title, exact: true });
  if (await title.count() !== 1 || !await title.isVisible()) throw new Error('publication_title_mismatch');
  const editor = page.locator('.ProseMirror.paywall-setting[role="textbox"]');
  const blocks = await editor.evaluate(el => Array.from(el.children, child => ({
    text: (child.textContent || '').trim(), widget: child.classList.contains('ProseMirror-widget'),
    buttons: child.querySelectorAll('button').length,
    pressed: child.querySelector('button')?.getAttribute('aria-pressed') === 'true'
  })));
  const index = paidBoundaryIndex(blocks, firstPaidParagraph(payload.paidText));
  const normalize = value => String(value).replace(/\s+/g, '');
  if (!blocks[index].pressed || blocks.filter(b => b.pressed).length !== 1 ||
      normalize(blocks.filter(b => !b.widget).map(b => b.text).join('\n')) !== normalize(articleBody(payload))) {
    throw new Error('publication_body_or_boundary_mismatch');
  }
  const submit = page.getByRole('button', { name: '投稿する', exact: true });
  if (await submit.count() !== 1 || !await submit.isVisible() || !await submit.isEnabled()) {
    throw new Error('publication_submit_unavailable');
  }
  guard(payload);
  console.log('NOTE_UI_PUBLICATION_ATTEMPT=true');
  // Exactly one attempt. A lost response must never cause another click.
  await submit.click();
  let url;
  for (let attempt = 0; attempt < 30 && !url; attempt += 1) {
    url = publicArticleUrl(page.url(), noteId);
    if (!url) {
      const links = await page.locator('a[href]').evaluateAll(elements => elements
        .filter(el => el.getClientRects().length).map(el => el.href));
      url = links.map(value => publicArticleUrl(value, noteId)).find(Boolean);
    }
    if (!url) await page.waitForTimeout(1000);
  }
  if (!url) url = await findPublishedArticleInList(page, noteId);
  if (!url) throw new Error('publication_result_unknown_review_required');
  // Independently confirm the public page without the owner's login context.
  const verification = await page.context().browser().newContext();
  try {
    const publicPage = await verification.newPage();
    const response = await publicPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!response?.ok() || !publicArticleUrl(publicPage.url(), noteId)) throw new Error('publication_public_page_unavailable');
    await publicPage.getByRole('heading', { name: payload.title, exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    await publicPage.getByRole('heading', { name: 'ここから先は', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    await publicPage.getByRole('button', { name: '¥300', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    const dates = await publicPage.locator('time[datetime]').evaluateAll(elements => elements.map(el => el.getAttribute('datetime')));
    const publishedAt = dates.find(value => Number.isFinite(Date.parse(value)) &&
      Math.abs(Date.now() - Date.parse(value)) < 10 * 60 * 1000);
    if (!publishedAt) throw new Error('publication_timestamp_unverified_review_required');
    return { version: 'note-publication-receipt-v1', raceKey: payload.raceKey, url,
      publishedAt, verifiedAt: new Date().toISOString(), price: EXPECTED_PRICE_YEN,
      sourceSha256: payload.sourceSha256 };
  } finally { await verification.close(); }
}

async function findPublishedArticleInList(page, noteId) {
  // The completion screen can omit a visible public link even after publication.
  // Read the owner's existing list in a separate tab; never submit again or
  // infer success from a draft preview. The caller still verifies the public
  // page without authentication, including title, paywall, price and timestamp.
  const listing = await page.context().newPage();
  try {
    const response = await listing.goto('https://note.com/notes', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response?.ok() || listing.url() !== 'https://note.com/notes') return null;
    const link = listing.locator(`a[href*="/n/${noteId}"]`).first();
    await link.waitFor({ state: 'visible', timeout: 15000 });
    const links = await listing.locator('a[href]').evaluateAll(elements => elements
      .filter(el => el.getClientRects().length).map(el => el.href));
    const url = links.map(value => publicArticleUrl(value, noteId)).find(Boolean) || null;
    if (url) console.log(`NOTE_UI_PUBLICATION_URL_RECOVERED=${url}`);
    return url;
  } catch {
    return null;
  } finally {
    await listing.close();
  }
}

async function savePublicationReceipt(payload, receipt, env = process.env, request = fetch) {
  const { repository, sha, token } = loadClaimConfig(env);
  const base = `https://api.github.com/repos/${repository}/git`;
  async function post(endpoint, data) {
    const response = await request(`${base}/${endpoint}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(30000)
    });
    if (response.status !== 201) throw new Error(`publication_receipt_save_failed_${response.status}`);
    return response.json();
  }
  const tree = await post('trees', { tree: [{ path: 'receipt.json', mode: '100644', type: 'blob', content: JSON.stringify(receipt, null, 2) }] });
  if (!/^[a-f0-9]{40}$/.test(tree.sha || '')) throw new Error('publication_receipt_tree_invalid');
  const commit = await post('commits', { message: `Verified note publication ${payload.raceKey}`, tree: tree.sha, parents: [sha] });
  if (!/^[a-f0-9]{40}$/.test(commit.sha || '')) throw new Error('publication_receipt_commit_invalid');
  const ref = draftClaimRef(payload).replace('note-draft-claim/', 'note-published/');
  const result = await post('refs', { ref, sha: commit.sha });
  if (result.ref !== ref || result.object?.sha !== commit.sha) throw new Error('publication_receipt_ref_invalid');
  return ref;
}

async function run({ env = process.env } = {}) {
  const mode = String(env.NOTE_UI_MODE || 'auth').trim().toLowerCase();
  if (!['auth', 'draft', 'publish'].includes(mode)) throw new Error('unsupported_note_ui_mode');

  // Invalid/missing credentials and stale handoffs must stop before browser setup.
  const browserUse = loadBrowserUseConfig(env);
  const draft = mode !== 'auth' ? loadHandoff(env.NOTE_IPHONE_HANDOFF || DEFAULT_HANDOFF) : null;
  if (draft) requireDraftGate(draft.payload);
  if (mode === 'publish') requirePublicationGate(draft.payload);
  const { loadCoverTemplate, attachCover } = require('./note-cover');
  const { renderCover } = require('./note-cover-template');
  const coverTemplate = draft ? loadCoverTemplate(draft.payload) : null;
  const { chromium } = require('playwright');
  // Cover rendering does not need note authentication. Keep the large embedded
  // image/font document off the remote CDP session, then hand only the verified
  // JPEG to the existing authenticated note transport.
  let cover = null;
  if (coverTemplate) {
    const coverBrowser = await chromium.launch({ headless: true });
    try {
      cover = await renderCover(coverBrowser, coverTemplate);
    } finally {
      await coverBrowser.close();
    }
  }
  // Do not reserve a race when local cover generation itself fails.
  if (draft) await claimDraft(draft.payload, env);
  const session = await createBrowserUseSession(browserUse);
  let browser;
  try {
    browser = await chromium.connectOverCDP(session.cdpUrl);
    const { page } = await createAuthenticatedPage(browser);
    console.log('NOTE_UI_PROFILE_LOADED=true');
    console.log('NOTE_UI_EDITOR_READY=true');

    if (mode === 'auth') {
      console.log('NOTE_UI_DRAFT_FILLED=false');
      console.log('NOTE_UI_PAID_CONFIGURED=false');
      console.log('NOTE_UI_PUBLISH_CLICKED=false');
      return;
    }

    const { absolute, payload } = draft;
    requireDraftGate(payload);

    const { fillDraft } = require('./note-browserbase-draft-save');
    const result = await fillDraft(page, {
      title: String(payload.title).trim(),
      body: articleBody(payload)
    });
    await attachCover(page, cover);
    requireDraftGate(payload);
    console.log('NOTE_UI_COVER_ATTACHED=true');
    const paid = await configurePaidPublication(page, payload);
    if (mode === 'publish') {
      const receipt = await publishConfiguredArticle(page, payload, paid);
      await savePublicationReceipt(payload, receipt, env);
      console.log(`NOTE_UI_PUBLICATION=${JSON.stringify(receipt)}`);
      return receipt;
    }

    console.log('NOTE_UI_DRAFT_FILLED=true');
    console.log(`NOTE_UI_DRAFT_URL=${result.url}`);
    console.log(`NOTE_UI_HANDOFF=${absolute}`);
    console.log('NOTE_UI_PAID_CONFIGURED=true');
    console.log(`NOTE_UI_PRICE_YEN=${paid.price}`);
    console.log(`NOTE_UI_PAID_START=${paid.paidStart}`);
    console.log('NOTE_UI_PUBLISH_CLICKED=false');
  } finally {
    if (browser) await browser.close().catch(() => {});
    const stopped = await stopBrowserUseSession(browserUse, session.id).catch(() => ({ ok: false }));
    if (!stopped.ok) console.error('NOTE_UI_BROWSER_STOP_FAILED=true');
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`NOTE_UI_TRANSPORT_FAILED=${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_HANDOFF,
  EXPECTED_PRICE_YEN,
  NOTE_EDITOR_URL,
  BROWSER_USE_API_URL,
  BROWSER_USE_PROXY_COUNTRY,
  BROWSER_USE_TIMEOUT_MINUTES,
  loadHandoff,
  loadStorageState,
  loadBrowserUseConfig,
  createBrowserUseSession,
  stopBrowserUseSession,
  firstPaidParagraph,
  paidBoundaryIndex,
  setPaidBoundary,
  articleBody,
  validateDraftGate,
  requireDraftGate,
  draftClaimRef,
  claimDraft,
  preflightDraft,
  isEditorUrl,
  ensureEditorReady,
  configurePaidPublication,
  createAuthenticatedPage,
  requirePublicationGate,
  preparePublication,
  findPublishedArticleInList,
  publishConfiguredArticle,
  savePublicationReceipt,
  run
};
