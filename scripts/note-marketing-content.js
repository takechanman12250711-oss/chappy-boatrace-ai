'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { contentLines, compareEditorContent } = require('./note-editor-content');
const { SERIES, seriesOfBundle, publicationKey } = require('./note-article-series');
const { outcomeLine, dailySummary } = require('./note-marketing-reports');
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
  if (receipt.version !== 'note-publication-receipt-v1' || receipt.price !== 300 || !validUrl(receipt.url) ||
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
    publishedAt: receipt.publishedAt, sourceSha256: receipt.sourceSha256, ticketCount,
    resultUrl: `https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${date}&jcd=${jcd}&rno=${Number(r.raceNo)}` };
}
function indexBody(rows, config, now = Date.now()) {
  const date = jstDate(now), current = rows.filter(r => r.raceKey.slice(0,8) === date).sort((a,b) => Date.parse(a.deadlineAt)-Date.parse(b.deadlineAt));
  const retained = rows.filter(r=>recentDates(now).includes(r.raceKey.slice(0,8)));
  if (new Set(retained.map(r=>publicationKey(r.raceKey,r.articleSeries))).size !== retained.length || new Set(retained.map(r=>r.url)).size !== retained.length) throw new Error('marketing_duplicate_publication');
  const time = value => new Date(Date.parse(value)+9*3600000).toISOString().slice(11,16);
  const show = r => `${time(r.deadlineAt)}｜${r.place}${r.raceNo}R\n公開 ${time(r.publishedAt)}｜${Number.isInteger(r.ticketCount) ? `実戦厳選${r.ticketCount}点` : '点数は記事で確認'}\n${outcomeLine(r)}\n${r.url}\n公式結果を確認\n${r.resultUrl}`;
  const yesterday = recentDates(now)[1], previous = rows.filter(r=>r.raceKey.slice(0,8)===yesterday)
    .sort((a,b)=>Date.parse(a.deadlineAt)-Date.parse(b.deadlineAt));
  const descriptions = {normal:'展開と相手の組み合わせを確認したい方へ。',escape:'イン逃げを狙う独立監視の予想を確認したい方へ。',manshu:'高配当を狙う独立監視の予想を確認したい方へ。'};
  // Always show absolute deadlines. A static note cannot claim to know whether
  // a race is still open at the reader's current time between updater runs.
  return [`${date.slice(0,4)}年${Number(date.slice(4,6))}月${Number(date.slice(6,8))}日の予想一覧`,
    '通常予想・イン逃げ・万舟を分け、各区分の締切順にまとめています。イン逃げと万舟は独立した狙い目監視の原稿です。時刻は日本時間、各記事300円です。',
    '日付と締切をご確認ください。締切を過ぎた記事は振り返り用の記録です。',
    `本日の公開記事の成績\n${dailySummary(current, date)}\n集計は事前公開した記事の実戦厳選買い目だけが対象です。種類ごとに集計し、結果待ち・不成立・確認中は判定済み件数に含めません。払戻は公式の100円あたりの金額で、実際の購入額・利益ではありません。`,
    ...Object.entries(SERIES).map(([key, series]) => {
      const selected = current.filter(r => (r.articleSeries || 'normal') === key);
      return `${series.label}\n${descriptions[key]}\n${selected.length ? selected.map(show).join('\n\n') : '本日、掲載を確認できた記事はまだありません。'}`;
    }),
    `前日の公開記事と公式結果（${Number(yesterday.slice(4,6))}月${Number(yesterday.slice(6,8))}日）\n前日分は振り返り用です。的中・不的中を選ばず、公開を確認した記事を種類別に掲載しています。\n${dailySummary(previous, yesterday)}\n\n${previous.length ? Object.entries(SERIES).map(([key,series])=>{const selected=previous.filter(r=>(r.articleSeries||'normal')===key);return selected.length ? `${series.label}\n${selected.map(show).join('\n\n')}` : '';}).filter(Boolean).join('\n\n') : '前日の公開を確認できた記事はありません。'}`,
    `はじめての方へ\n${config.guide.url}`, `チャッピーのプロフィール\n${PROFILE}`].join('\n\n');
}
function initialState(config) {
  return { version: VERSION, date: '', seenRefs: [], rows: [], articles: Object.fromEntries(['guide','index'].map(k=>[k,{ hash: hash(config[k].initialBody) }])) };
}
function requireEditable(actual, previousHash, desired) {
  if (hash(actual) !== previousHash && hash(actual) !== hash(desired)) throw new Error('marketing_manual_change_review_required');
}
module.exports = { ACCOUNT, PROFILE, VERSION, marketingText, sameMarketingContent, hash, jstDate, recentDates, validUrl, loadConfig, navigation, urlsIn, bodyHtml, receiptRow, indexBody, initialState, requireEditable };
