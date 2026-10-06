'use strict';
const fs = require('node:fs');
const { loadConfig, publishedIndexBody, hash, urlsIn, requireEditable, sameMarketingContent, editDiagnostics, validateUpdateAttempt, updateAttempt, prepareUpdateAttempt } = require('./note-marketing-content');
const { client } = require('./note-marketing-store');
const { readEditorContent } = require('./note-editor-content');
const { fillDraft, waitForVisibleAcrossFrames } = require('./note-browserbase-draft-save');
const { loadBrowserUseConfig, createBrowserUseSession, stopBrowserUseSession } = require('./note-github-ui-transport');
const korogashi = require('./note-korogashi-lifecycle.cjs');
const BODY = '.note-common-styles__textnote-body';
async function readPublic(page, article) {
  const response = await page.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response?.ok() || page.url() !== article.url) throw new Error('marketing_public_page_unavailable');
  await page.getByRole('heading', { name: article.title, exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  if (await page.getByRole('heading', { name: 'ここから先は', exact: true }).count()) throw new Error('marketing_article_not_free');
  const body = page.locator(BODY);
  if (await body.count() !== 1) throw new Error('marketing_public_body_missing');
  return { text: await body.innerText(), links: await body.locator('a[href]').evaluateAll(elements=>elements.map(a=>a.href)) };
}
async function verifyPublic(page, article, desired) {
  const value = await readPublic(page, article);
  if (!sameMarketingContent(value.text, desired) || urlsIn(desired).some(url=>!value.links.includes(url))) throw new Error('marketing_public_content_mismatch');
  return value;
}
function requireArticleEditable(actual, previousHash, desired, article, stage, previousText, attempt = null) {
  // An intent is written before any editor change. Only its exact target may
  // recover a prior successful publish whose verification response was lost.
  // This never accepts arbitrary page text or general whitespace differences.
  validateUpdateAttempt(attempt, article, previousHash);
  const acceptedHash = attempt && attempt.articleId === article.id && attempt.fromHash === previousHash &&
    attempt.targetHash === hash(actual) ? attempt.targetHash : previousHash;
  try { requireEditable(actual, acceptedHash, desired); }
  catch (error) {
    if (error.message === 'marketing_manual_change_review_required') {
      console.error(`NOTE_MARKETING_EDIT_REVIEW=${JSON.stringify({articleId:article.id, stage,
        ...editDiagnostics(actual, previousHash, desired, previousText)})}`);
    }
    throw error;
  }
}
function previousArticleText(state, config, key) {
  const article = state.articles[key];
  let text = key === 'guide' ? config.guide.initialBody : null;
  if (key === 'index' && Number.isFinite(Date.parse(article?.verifiedAt))) {
    text = publishedIndexBody(state, config, Date.parse(article.verifiedAt));
  }
  // An older generator may not be reproducible from today's code. Never label
  // a guessed rendering as the previous verified body.
  return typeof text === 'string' && hash(text) === article?.hash ? text : null;
}
async function updateArticle(page, publicPage, article, desired, previousHash, previousText = null, options = {}) {
  const current = await readPublic(publicPage, article);
  requireArticleEditable(current.text, previousHash, desired, article, 'public', previousText, options.attempt);
  if (sameMarketingContent(current.text, desired) && urlsIn(desired).every(url=>current.links.includes(url))) return false;
  const editUrl = `https://editor.note.com/notes/${article.id}/edit/`;
  await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const title = await waitForVisibleAcrossFrames(page, ['textarea[placeholder*="タイトル"]']);
  const input = await waitForVisibleAcrossFrames(page, ['.ProseMirror[contenteditable="true"]']);
  if (page.url() !== editUrl || !title || !input || (await title.inputValue()).trim() !== article.title) throw new Error('marketing_editor_identity_mismatch');
  // Refuse to overwrite a human edit or a different pending draft.
  requireArticleEditable(await readEditorContent(input), previousHash, desired, article, 'editor', previousText, options.attempt);
  if (typeof options.beforeWrite !== 'function') throw new Error('marketing_update_attempt_persistence_required');
  await options.beforeWrite(); // CAS must succeed before fill, autosave or publish.
  await fillDraft(page, { title: article.title, body: desired });
  const settings = page.getByRole('button', { name: /^(公開に進む|公開設定)$/ });
  if (await settings.count() !== 1) throw new Error('marketing_settings_button_missing');
  await settings.click();
  await page.waitForURL(`https://editor.note.com/notes/${article.id}/publish/`, { timeout: 20000 });
  const free = page.getByRole('radio', { name: '無料', exact: true });
  if (!await free.isChecked()) throw new Error('marketing_free_setting_changed');
  const submit = page.getByRole('button', { name: /^(投稿する|更新する)$/ });
  if (await submit.count() !== 1 || !await submit.isEnabled()) throw new Error('marketing_update_button_missing');
  console.log(`NOTE_MARKETING_UPDATE_ATTEMPT=${article.id}`);
  await submit.click(); // Exactly one submission; later runs recover by reading this same article.
  for (let attempt=0; attempt<5; attempt++) {
    try { await verifyPublic(publicPage, article, desired); return true; }
    catch (error) { if (attempt===4) throw error; await page.waitForTimeout(1500); }
  }
}
function createUpdateJournal(store, loaded, config, clock = Date.now) {
  let state = structuredClone(loaded.state), head = loaded.head;
  if (state.pendingUpdates && (typeof state.pendingUpdates !== 'object' || Array.isArray(state.pendingUpdates) ||
      Object.keys(state.pendingUpdates).some(key => !['guide', 'index'].includes(key)))) {
    throw new Error('marketing_update_attempt_invalid');
  }
  for (const key of ['guide', 'index']) updateAttempt(state, key, config[key]);
  return {
    options(key, desired) {
      return { attempt: updateAttempt(state, key, config[key]), beforeWrite: async () => {
        const next = prepareUpdateAttempt(state, key, config[key], desired, clock());
        const savedHead = await store.save(next, head);
        if (!/^[a-f0-9]{40}$/.test(savedHead || '')) throw new Error('marketing_update_attempt_save_unverified');
        state = next; head = savedHead;
      } };
    },
    verified(key, receipt) {
      state.articles[key] = { ...receipt };
      if (state.pendingUpdates) delete state.pendingUpdates[key];
    },
    get state() { return state; },
    get head() { return head; }
  };
}
async function run({ env = process.env, now = Date.now(), clock = Date.now, store = client(env), update = updateArticle } = {}) {
  const config = loadConfig();
  if (!config) throw new Error('marketing_config_missing');
  const loaded = await store.load(config);
  const journal = createUpdateJournal(store, loaded, config, clock);
  const state = await store.settle(await store.collect(loaded.state, now), config, now, { refresh: true });
  const courseRepo = require('./note-korogashi-store.cjs').repository(store);
  const courses = await courseRepo.load();
  const courseText = korogashi.publicText(courses.state, now);
  state.korogashiIndex = {version:'note-korogashi-index-v1',text:courseText};
  const desired = { guide: config.guide.initialBody, index: publishedIndexBody(state, config, now) };
  const changed = ['guide','index'].filter(k=>state.articles[k]?.hash !== hash(desired[k]));
  // Daily public verification also catches unpublishing or changed links even
  // when there is no new race. Same content within the same day uses no browser.
  const verify = loaded.state.verifiedDate !== state.date || korogashi.needsPublication(courses.state) ||
    Object.keys(loaded.state.pendingUpdates || {}).length > 0;
  if (!changed.length && !verify) {
    if (JSON.stringify(state) !== JSON.stringify(loaded.state)) await store.save(state, loaded.head);
    console.log('NOTE_MARKETING=unchanged'); return { changed: [], verified: false };
  }
  const connection = loadBrowserUseConfig(env);
  const session = await createBrowserUseSession(connection);
  let browser, publicContext;
  const updates = [];
  try {
    browser = await require('playwright').chromium.connectOverCDP(session.cdpUrl);
    const context = browser.contexts()[0];
    if (!context) throw new Error('marketing_saved_profile_missing');
    const page = await context.newPage();
    publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    for (const key of ['guide','index']) {
      if (await update(page, publicPage, config[key], desired[key], state.articles[key].hash, previousArticleText(journal.state, config, key), journal.options(key, desired[key]))) updates.push(key);
      await verifyPublic(publicPage, config[key], desired[key]);
      state.articles[key] = { hash: hash(desired[key]), url: config[key].url, verifiedAt: new Date(clock()).toISOString() };
      journal.verified(key, state.articles[key]);
      if (key === 'index' && korogashi.needsPublication(courses.state)) {
        // The complete body and all source links were just read anonymously.
        // Persist that real time before any official settlement can advance.
        const next = korogashi.announce(courses.state, {url:config.index.url,contentHash:hash(desired.index)}, clock());
        await courseRepo.save(courses, next);
        // If publishing itself overran the deadline, correct the visible
        // status immediately. The saved history already excludes that leg.
        const expired = Object.entries(next.plans).some(([id,p])=>korogashi.project(p).status==='stopped_publication_late' &&
          korogashi.project(courses.state.plans[id]).status==='waiting_publication');
        if (expired) {
          const text = korogashi.publicText(next, clock());
          state.korogashiIndex = {version:'note-korogashi-index-v1',text};
          desired.index = publishedIndexBody(state, config, now);
          if (await update(page, publicPage, config.index, desired.index, state.articles.index.hash, null, journal.options('index', desired.index))) updates.push('index');
          await verifyPublic(publicPage, config.index, desired.index);
          state.articles.index = {hash:hash(desired.index),url:config.index.url,verifiedAt:new Date(clock()).toISOString()};
          journal.verified('index', state.articles.index);
        }
      }
    }
    state.verifiedDate = state.date;
    delete state.pendingUpdates;
    await store.save(state, journal.head);
    const result = { changed: updates, verified: true, articles: state.articles, date: state.date, races: state.rows.length };
    console.log(`NOTE_MARKETING=${JSON.stringify(result)}`);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `\nVerified free guide: ${config.guide.url}\nVerified daily index: ${config.index.url}\nDate: ${state.date}; verified publications: ${state.rows.length}; updated: ${updates.join(', ') || 'none'}.\n`);
    return result;
  } finally {
    if (publicContext) await publicContext.close().catch(()=>{});
    if (browser) await browser.close().catch(()=>{});
    const stopped = await stopBrowserUseSession(connection, session.id).catch(()=>({ok:false}));
    if (!stopped.ok) console.error('NOTE_MARKETING_BROWSER_STOP_FAILED=true');
  }
}
if (require.main === module) run().catch(error=>{console.error(`NOTE_MARKETING_FAILED=${error.message}`);process.exitCode=1;});
module.exports = { BODY, readPublic, verifyPublic, updateArticle, requireArticleEditable, previousArticleText, createUpdateJournal, run };
