'use strict';
// Synthetic fixture only; never submit to a live article queue.
const { createHash } = require('node:crypto');
const { VERSION } = require('./note-independent-monitor-source');
const sha = text => createHash('sha256').update(text).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  // Synthetic test data only. Never written to the repository's article queue.
  const tickets = [{ ticket: '1-2-3', odds: 12.3 }, { ticket: '1-2-4', odds: 16.4 }];
  const freeText = '9月28日 丸亀6R｜締切 17:29\n\n通常AIの予想とは別の、独立した監視予想です。\n\n表示保持の単体テスト用原稿。';
  const paidText = '監視の根拠\n元の理由を短縮・差し替えしない。\n\n買い目\n\n・1-2-34\n\n計 2点';
  const paywallMarker = '──────── ここから先は有料部分です ────────';
  const tags = ['#ボートレース'];
  const article = { ok: true, publishable: true, format: 'formation-v3',
    title: '狙い目監視｜9月28日 丸亀6R｜締切 17:29｜イン逃げ',
    freeText, paidText, paywallMarker, tags,
    fullText: [freeText, paywallMarker, paidText,
      '※舟券の購入は自己責任で、無理のない範囲でお楽しみください。', tags.join(' ')].join('\n\n'),
    practicalTickets: clone(tickets), boatEvaluations: [1, 2, 3, 4, 5, 6],
    meta: { date: '20260928', place: '丸亀', raceNo: 6, deadline: '17:29' } };
  const record = { raceKey: '20260928-15-6', date: '20260928', jcd: '15', place: '丸亀', raceNo: 6,
    source: 'independent-watch', selectedAt: '2026-09-28T16:00:00+09:00',
    deadlineAt: '2026-09-28T17:29:00+09:00', prediction: { practicalTickets: clone(tickets) },
    exhibitionSnapshot: { version: 'note-exhibition-v1', ready: true, capturedAt: '2026-09-28T15:59:00+09:00',
      entries: [1,2,3,4,5,6].map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
      startExhibition: [1,2,3,4,5,6].map(boat => ({ boat, course: boat, st: 0.12, mappingSource: 'official-start-image' })) } };
  const sources = [['entry', 'racelist'], ['exhibition', 'beforeinfo']].map(([role, page]) => {
    const text = `UNIT TEST ONLY: synthetic ${role} evidence, not a real race observation.`;
    return { role, url: `https://www.boatrace.jp/owpc/pc/race/${page}?hd=20260928&jcd=15&rno=6`,
      observedAt: '2026-09-28T15:59:00+09:00', text, sha256: sha(text) };
  });
  return { version: VERSION, capturedAt: record.selectedAt, article, record, baselinePracticalTickets: clone(tickets),
    monitor: { origin: 'independent-watch', kind: 'escape', raceKey: record.raceKey,
      status: 'confirmed-after-exhibition', confirmedAt: record.selectedAt,
      sources, tickets: clone(tickets), article: clone(article),
      boatAssessments: [1,2,3,4,5,6].map(boat => ({ boat, reason: `単体テストの${boat}号艇評価。` })) } };
}
module.exports = { fixture };
