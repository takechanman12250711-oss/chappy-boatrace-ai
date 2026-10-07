'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { contentLines, compareEditorContent } = require('./note-editor-content');
const { SERIES, seriesOfBundle, publicationKey } = require('./note-article-series');
const { dailySummary,publishedOutcomeLine,dailyPublishedSummary } = require('./note-marketing-reports');
const { NOTE_PRICE_YEN, isRecordedPrice } = require('./note-pricing');
const { NOTICE: EXPIRY_NOTICE, purchaseLinkText, indexPurchaseLinks } = require('./note-marketing-expiry');
const ACCOUNT = 'great_robin3243';
const PROFILE = `https://note.com/${ACCOUNT}`;
const VERSION = 'note-marketing-state-v1';
// A reviewed cover-only edit left a terminal NBSP after the free guide's last
// link. Preserve the page; ignore only this invisible end-of-article sentinel.
// Do not trim other spaces, indentation or text, or alter paid-article checks.
const marketingText = text => String(text || '').replace(/\u00a0+(?=[\r\n]*$)/u, '');
const sameMarketingContent = (actual, expected) => compareEditorContent(marketingText(actual), marketingText(expected)).equal;
const hash = text => createHash('sha256').update(JSON.stringify(contentLines(marketingText(text)))).digest('hex');
function jstDate(now = Date.now()) { return new Date(now + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, ''); }
function recentDates(now = Date.now()) { return [jstDate(now), jstDate(now - 86400000)]; }
function validUrl(url) { return new RegExp(`^https://note\\.com/${ACCOUNT}/n/n[a-f0-9]+$`).test(String(url)); }
function loadConfig(rootDir = process.cwd()) {
  const file = path.join(rootDir, 'config/note-marketing.json');
  if (!fs.existsSync(file)) return null;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (config.version !== 'note-marketing-config-v1' || config.account !== ACCOUNT) throw new Error('marketing_config_invalid');
  for (const key of ['guide', 'index']) {
    const a = config[key];
    if (!a || !validUrl(a.url) || !a.url.endsWith(`/n/${a.id}`) || !a.title || !a.initialBody) throw new Error('marketing_article_invalid');
  }
  if (config.guide.id === config.index.id) throw new Error('marketing_article_identity_duplicate');
  return config;
}
function navigation(article, config) {
  if (!config) return article;
  const links = `今日の予想一覧\n${config.index.url}\n\nはじめての方へ\n${config.guide.url}`;
  if (!article.fullText.startsWith(article.freeText)) throw new Error('marketing_free_boundary_invalid');
  const freeText = `${article.freeText.trim()}\n\n${links}`;
  return { ...article, freeText, fullText: freeText + article.fullText.slice(article.freeText.length), marketingNavigationVersion: 'note-navigation-v1' };
}
function urlsIn(text) { return [...new Set(String(text).match(/https:\/\/note\.com\/great_robin3243(?:\/n\/n[a-f0-9]+)?|https:\/\/www\.boatrace\.jp\/owpc\/pc\/race\/raceresult\?hd=\d{8}&jcd=(?:0[1-9]|1\d|2[0-4])&rno=(?:1[0-2]|[1-9])(?!\d)/g) || [])]; }
function bodyHtml(text) {
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return String(text).replace(/\r\n?/g, '\n').split('\n').map(line => {
    // HTML collapses leading/repeated ASCII spaces; explicit NBSP preserves
    // the exact source spacing through the editor paste handler.
    let value = escape(line).replace(/ /g, '&nbsp;');
    for (const url of urlsIn(line).sort((a,b) => b.length-a.length)) {
      // Navigation URLs are complete standalone lines; don't rewrite prediction text.
      if (line === url) value = `<a href="${escape(url)}">${escape(url)}</a>`;
    }
    return `<p>${value || '<br>'}</p>`;
  }).join('');
}
function receiptRow(receipt, bytes, now = Date.now()) {
  if (receipt.version !== 'note-publication-receipt-v1' || !isRecordedPrice(receipt.price) || !validUrl(receipt.url) ||
      !/^\d{8}-\d{2}-\d{1,2}$/.test(receipt.raceKey || '') || !/^[a-f0-9]{64}$/.test(receipt.sourceSha256 || '') ||
      !Number.isFinite(Date.parse(receipt.publishedAt)) || !Number.isFinite(Date.parse(receipt.verifiedAt)) ||
      Date.parse(receipt.publishedAt) > now || Date.parse(receipt.verifiedAt) > now ||
      Date.parse(receipt.verifiedAt) < Date.parse(receipt.publishedAt)) throw new Error('marketing_receipt_invalid');
  if (!recentDates(now).includes(receipt.raceKey.slice(0, 8))) return null;
  if (createHash('sha256').update(bytes).digest('hex') !== receipt.sourceSha256) throw new Error('marketing_source_hash_mismatch');
  const bundle = JSON.parse(bytes), r = bundle.record;
  const articleSeries = seriesOfBundle(bundle);
  const key = publicationKey(receipt.raceKey, articleSeries);
  if ((receipt.articleSeries !== undefined && receipt.articleSeries !== articleSeries) ||
      (receipt.publicationKey !== undefined && receipt.publicationKey !== key)) throw new Error('marketing_receipt_series_mismatch');
  const deadline = Date.parse(r?.deadlineAt);
  if (r?.raceKey !== receipt.raceKey || !Number.isFinite(deadline) || Date.parse(receipt.publishedAt) >= deadline ||
      !/^[一-龠ぁ-ゖァ-ヺー]{1,10}$/u.test(r.place || '') || !Number.isInteger(Number(r.raceNo)) || Number(r.raceNo)<1 || Number(r.raceNo)>12) throw new Error('marketing_source_identity_invalid');
  const [date, jcd, raceNo] = receipt.raceKey.split('-');
  if (Number(raceNo) !== Number(r.raceNo)) throw new Error('marketing_source_identity_invalid');
  if (!/^(?:0[1-9]|1\d|2[0-4])$/.test(jcd)) throw new Error('marketing_source_venue_invalid');
  const ticketStrings = values => Array.isArray(values) ? values.map(t=>typeof t === 'string' ? t : t?.ticket) : null;
  const tickets = ticketStrings(bundle.baselinePracticalTickets), saved = ticketStrings(r.prediction?.practicalTickets);
  let ticketCount = null;
  if (tickets || saved) {
    if (!tickets || !saved || !tickets.length || tickets.length > 7 || new Set(tickets).size !== tickets.length ||
        tickets.some(t=>typeof t !== 'string' || !/^[1-6]-[1-6]-[1-6]$/.test(t) || new Set(t.split('-')).size !== 3) ||
        JSON.stringify([...tickets].sort()) !== JSON.stringify([...saved].sort())) throw new Error('marketing_ticket_count_invalid');
    ticketCount = tickets.length;
  }
  return { raceKey: receipt.raceKey, articleSeries, publicationKey: key, url: receipt.url, place: r.place, raceNo: Number(r.raceNo), deadlineAt: r.deadlineAt,
    price: receipt.price, publishedAt: receipt.publishedAt, sourceSha256: receipt.sourceSha256, ticketCount,
    resultUrl: `https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${date}&jcd=${jcd}&rno=${Number(r.raceNo)}` };
}
function indexBody(rows, config, now = Date.now()) {
  const date = jstDate(now), current = rows.filter(r => r.raceKey.slice(0,8) === date).sort((a,b) => Date.parse(a.deadlineAt)-Date.parse(b.deadlineAt));
  const retained = rows.filter(r=>recentDates(now).includes(r.raceKey.slice(0,8)));
  if (new Set(retained.map(r=>publicationKey(r.raceKey,r.articleSeries))).size !== retained.length || new Set(retained.map(r=>r.url)).size !== retained.length) throw new Error('marketing_duplicate_publication');
  const time = value => new Date(Date.parse(value)+9*3600000).toISOString().slice(11,16);
  const show = r => {
    const result=publishedOutcomeLine(r).split('\n');
    return [`${result.shift()}｜${r.place}${r.raceNo}R`,...result,
      `🕒 締切 ${time(r.deadlineAt)}｜公開 ${time(r.publishedAt)}`,
      `${Number.isInteger(r.ticketCount)?`中心${r.ticketCount}点`:'点数は記事で確認'}${isRecordedPrice(r.price)?`｜公開時価格 ${r.price}円`:''}`,
      purchaseLinkText(r, now),'公式結果を確認',r.resultUrl].join('\n');
  };
  const yesterday = recentDates(now)[1], previous = rows.filter(r=>r.raceKey.slice(0,8)===yesterday)
    .sort((a,b)=>Date.parse(a.deadlineAt)-Date.parse(b.deadlineAt));
  const icons={normal:'🚤',escape:'🏁',manshu:'🌊'};
  const groups = selected => Object.entries(SERIES).flatMap(([key,series])=>{
    const subset=selected.filter(r=>(r.articleSeries||'normal')===key);
    return subset.length ? [`${icons[key]} ${series.label}\n\n${subset.map(show).join('\n\n')}`] : [];
  }).join('\n\n') || '掲載を確認できた記事はまだありません。';
  const {summarizePublicRows}=require('./note-public-results');
  const details=(selected,day,label)=>`${label}（${selected.length}記事）\n掲載全券・種類別\n${dailyPublishedSummary(selected,day,{includeRaces:false})}\n\n中心のみの従来成績（記事別）\n${dailySummary(selected,day)}`;
  // Keep every published result visible. Legacy center-only numbers live once
  // in the detail block rather than competing with each race's public result.
  return [`📅 ${date.slice(0,4)}年${Number(date.slice(4,6))}月${Number(date.slice(6,8))}日の予想・結果一覧`,
    `🚤 本日の公開記事\n${summarizePublicRows(current)}`,
    groups(current),
    `📅 前日の結果（${Number(yesterday.slice(4,6))}月${Number(yesterday.slice(6,8))}日）\n${summarizePublicRows(previous)}\n\n${groups(previous)}`,
    `📊 集計の詳細\n${details(current,date,'本日')}\n\n${details(previous,yesterday,'前日')}`,
    'ℹ️ 結果の見方\n掲載全券は、締切前に公開した本命・押さえ・展開・万舟の買い目が対象です。別会計の参考予想は含めません。\n同じレースは全体で1回だけ数え、種類別と中心のみの成績は記事単位です。結果待ち・不成立・照合確認中は判定済み件数に含めません。\n払戻は公式の100円あたりの金額です。実際の購入額・利益ではありません。',
    `🕒 購入前に\n時刻は日本時間です。日付・締切・各記事の価格をご確認ください。新規公開は各${NOTE_PRICE_YEN}円で試行中です。\n${EXPIRY_NOTICE}`,
    `📖 はじめての方へ\n${config.guide.url}`, `チャッピーのプロフィール\n${PROFILE}`].join('\n\n');
}
function initialState(config) {
  return { version: VERSION, date: '', seenRefs: [], rows: [], articles: Object.fromEntries(['guide','index'].map(k=>[k,{ hash: hash(config[k].initialBody) }])) };
}
// Keep the exact course text from the last verified publication. A later
// course receipt can change the live journal before the next index update.
// Distribution must compare against the displayed snapshot, not that future
// rendering, while still rechecking the current race/result portion.
function publishedIndexBody(state, config, now = Date.now()) {
  const extra = state.korogashiIndex;
  if (extra && (extra.version !== 'note-korogashi-index-v1' || typeof extra.text !== 'string')) throw Error('marketing_course_snapshot_invalid');
  const body = indexBody(state.rows, config, now) + (extra?.text ? '\n\n' + extra.text : '');
  return indexPurchaseLinks(body, state.rows, now, { freeUrls: [config.guide.url, config.index.url] });
}
// Diagnostics never authorize an edit. In particular, whitespace candidates
// are only reported for review; requireEditable below remains exact and closed.
// Do not log article text: an unexpected draft can contain private additions.
function editDiagnostics(actual, previousHash, desired, previousText = null) {
  const current = String(actual || '');
  const previousVerified = typeof previousText === 'string' && hash(previousText) === previousHash;
  const variants = {
    terminalAsciiSpace: current.replace(/ +(?=[\r\n]*$)/u, ''),
    terminalWhitespace: current.replace(/[\t \u00a0]+(?=[\r\n]*$)/u, ''),
    lineEndWhitespace: current.replace(/[\t \u00a0]+(?=\r?$)/gmu, ''),
    zeroWidthCharacters: current.replace(/[\u200b\u200c\u200d\ufeff]/gu, '')
  };
  const matches = expectedHash => Object.entries(variants)
    .filter(([, value]) => value !== current && hash(value) === expectedHash).map(([name]) => name);
  const comparison = expected => {
    const a = contentLines(marketingText(current)), b = contentLines(marketingText(expected));
    let first = 0;
    while (first < a.length && first < b.length && a[first] === b[first]) first++;
    return { actualLines: a.length, expectedLines: b.length,
      firstDifferentLine: first === a.length && first === b.length ? null : first + 1 };
  };
  return { actualHash: hash(current), previousHash, desiredHash: hash(desired),
    desiredComparison: comparison(desired),
    previousComparison: previousVerified ? comparison(previousText) : null,
    whitespaceCandidates: { previous: matches(previousHash), desired: matches(hash(desired)) } };
}
function validateUpdateAttempt(attempt, article, previousHash) {
  if (!attempt) return null;
  const digest = value => /^[a-f0-9]{64}$/.test(value || '');
  if (attempt.version !== 'note-marketing-update-attempt-v1' || attempt.articleId !== article.id ||
      attempt.fromHash !== previousHash || !digest(attempt.fromHash) || !digest(attempt.targetHash) ||
      !Number.isFinite(Date.parse(attempt.startedAt)) || !Number.isSafeInteger(attempt.sequence) || attempt.sequence < 1 ||
      !Array.isArray(attempt.previousAttempts) || attempt.previousAttempts.length !== attempt.sequence - 1) {
    throw new Error('marketing_update_attempt_invalid');
  }
  let lastTime = -Infinity;
  for (const [index, earlier] of [...attempt.previousAttempts, attempt].entries()) {
    const time = Date.parse(earlier?.startedAt);
    if (earlier?.sequence !== index + 1 || !digest(earlier?.targetHash) || !Number.isFinite(time) || time < lastTime) {
      throw new Error('marketing_update_attempt_invalid');
    }
    lastTime = time;
  }
  return attempt;
}
function updateAttempt(state, key, article) {
  return validateUpdateAttempt(state.pendingUpdates?.[key], article, state.articles[key]?.hash);
}
function prepareUpdateAttempt(state, key, article, desired, now) {
  const previous = updateAttempt(state, key, article);
  const fromHash = state.articles[key]?.hash;
  if (!/^[a-f0-9]{64}$/.test(fromHash || '') || !Number.isFinite(now) ||
      (previous && now < Date.parse(previous.startedAt))) throw new Error('marketing_update_attempt_invalid');
  return { ...state, articles: { ...state.articles }, pendingUpdates: { ...state.pendingUpdates,
    [key]: { version: 'note-marketing-update-attempt-v1', articleId: article.id,
      fromHash, targetHash: hash(desired), startedAt: new Date(now).toISOString(),
      // A retry may persist C then stop before replacing published/draft B.
      // Keep every earlier generated target in this same verified-hash epoch.
      sequence: previous ? previous.sequence + 1 : 1,
      previousAttempts: previous ? [...previous.previousAttempts, {sequence:previous.sequence,
        targetHash:previous.targetHash, startedAt:previous.startedAt}] : [] } } };
}
function requireEditable(actual, previousHash, desired) {
  if (hash(actual) !== previousHash && hash(actual) !== hash(desired)) throw new Error('marketing_manual_change_review_required');
}
module.exports = { ACCOUNT, PROFILE, VERSION, marketingText, sameMarketingContent, hash, jstDate, recentDates, validUrl, loadConfig, navigation, urlsIn, bodyHtml, receiptRow, indexBody, publishedIndexBody, initialState, requireEditable, editDiagnostics, validateUpdateAttempt, updateAttempt, prepareUpdateAttempt };
