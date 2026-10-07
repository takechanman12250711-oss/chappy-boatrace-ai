'use strict';

// Presentation only. The immutable original is audited before this adapter.
// No prediction engine, result, or odds-based selection is used here.
const NOTICE = '※舟券の購入は自己責任で、無理のない範囲でお楽しみください。';
const ticketOf = row => typeof row === 'string' ? row : row.ticket;
const unique = rows => [...new Set((rows || []).map(ticketOf))];
const valid = t => /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
const mentions = text => [...String(text).normalize('NFKC').matchAll(/(?<![0-9])([1-6]+(?:・[1-6]+)*|全|ALL)\s*[-→－–―]\s*([1-6]+(?:・[1-6]+)*|全|ALL)\s*[-→－–―]\s*([1-6]+(?:・[1-6]+)*|全|ALL)(?![0-9])/gi)];
const expand = m => {
  const axes = m.slice(1, 4).map(a => [...new Set(a.replace(/全|ALL/gi, '123456').replaceAll('・', ''))]);
  return axes[0].flatMap(a => axes[1].flatMap(b => axes[2].map(c => `${a}-${b}-${c}`).filter(valid)));
};
const ticketsIn = text => mentions(text).flatMap(expand);
const sameSet = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

function formations(tickets) {
  // Display may regroup non-adjacent tickets within this section only.
  // Original priority, odds and the central/reference ledgers stay untouched.
  const groups = new Map();
  for (const ticket of tickets) {
    const [a,b,c] = ticket.split('-'), key = `${a}-${b}`;
    if (!groups.has(key)) groups.set(key, { axes: [[a], [b], []], tickets: [] });
    groups.get(key).axes[2].push(c);
    groups.get(key).tickets.push(ticket);
  }
  const blocks = [...groups.values()];
  const format = axes => axes.map(axis => [...new Set(axis)].sort().join('・')).join(' → ');
  // A merge is allowed only when expanding its axes yields exactly its source
  // tickets. Incomplete rectangles therefore cannot invent cross combinations.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const axes = blocks[i].axes.map((axis,k) => [...new Set([...axis, ...blocks[j].axes[k]])]);
        const source = [...blocks[i].tickets, ...blocks[j].tickets];
        if (!sameSet(ticketsIn(format(axes)), source)) continue;
        blocks[i] = { axes, tickets: source };
        blocks.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return blocks.map(({ axes }) => format(axes)).join('\n');
}

function readableArticleV1(article, bundle) {
  const independent = bundle.version === 'independent-monitor-note-v1';
  const prediction = bundle.record.prediction;
  const central = unique(bundle.baselinePracticalTickets);
  const seen = new Set(central);
  const groups = [{ heading: '中心の買い目', tickets: central,
    description: 'この買い目を中心に検討します。' }];
  const reasons = [];
  let reference = '';
  let freeBase = article.freeText;
  if (independent) {
    const match = article.paidText.match(/^買い目\n([\s\S]*?)\n計\s+(\d+)点$/m);
    if (!match || !sameSet(ticketsIn(match[1]), central)) throw new Error('readable_monitor_tickets_mismatch');
    reasons.push(article.paidText.slice(0, match.index).trim());
    reference = article.paidText.slice(match.index + match[0].length).trim();
  } else {
    reasons.push(String(prediction.raceFlow?.summary || article.rangeSummary || '').trim());
    const pools = [
      ['相手を広げるなら', prediction.mainSheet?.tickets, prediction.mainSheet?.reason],
      ['相手を広げるなら', prediction.mainSheet?.coverTickets, ''],
      ['別の展開を考えるなら', prediction.mainSheet?.flowTickets, ''],
      ['高配当を狙うなら', prediction.manshuSheet?.tickets, prediction.manshuSheet?.reason]
    ];
    for (const [index, [heading, rows, reason]] of pools.entries()) {
      const savedReason = String(article.allRangeGroups?.[index]?.reason || reason || rows?.[0]?.scenarioSummary || rows?.[0]?.comment || '').trim();
      if (savedReason) reasons.push(`${heading}\n${savedReason}`);
      const tickets = unique(rows).filter(t => !seen.has(t));
      tickets.forEach(t => seen.add(t));
      if (!tickets.length) continue;
      const existing = groups.find(g => g.heading === heading);
      if (existing) existing.tickets.push(...tickets);
      else groups.push({ heading, tickets, description: {
        '相手を広げるなら': '相手を広げたい場合の追加候補です。',
        '別の展開を考えるなら': '別の展開に備える追加候補です。',
        '高配当を狙うなら': '高配当を狙う場合の追加候補です。'
      }[heading] });
    }
    const practical = article.paidText.match(/^🔥 実戦厳選\n([\s\S]*?)\n計\s+(\d+)点$/m);
    if (!practical) throw new Error('readable_practical_section_missing');
    reference = article.paidText.slice(practical.index + practical[0].length).trim();
    freeBase = freeBase.split('\n\n').filter(p =>
      !/^展開の焦点：/.test(p) && !/^本命・押さえ・万舟を、/.test(p) && !/^実戦厳選は\d+点です。/.test(p)
    ).join('\n\n');
  }
  // Reference forecasts retain their separate accounting, including overlaps.
  // They are not recommendations to add the same ticket twice.
  const referenceTickets = [...new Set(ticketsIn(reference))];
  const remainingReference = referenceTickets.filter(t => !seen.has(t));
  if (remainingReference.length) groups.push({ heading: '別会計の参考予想', tickets: remainingReference,
    description: '中心の買い目の成績とは別集計の参考予想です。' });
  const referenceProse = reference.split('\n').filter(line => !mentions(line).length && !/^(計 |内訳|参考.*点|本命とは別会計)/.test(line)).join('\n').trim();
  if (referenceProse) reasons.push(referenceProse);
  // A saved rationale can include the full ticket. Its ticket remains in the
  // paid list; omit that sentence from the preview instead of exposing it.
  const explanation = [...new Set(reasons.filter(Boolean).map(reason => reason
    .split(/(?<=[。！？])|\n/).filter(sentence => !mentions(sentence).length).join('\n').trim()).filter(Boolean))].join('\n\n');
  const total = groups.reduce((n,g) => n + g.tickets.length, 0);
  // Keep paid section labels and bytes stable: publication proofs use their
  // frozen readable-v1 grammar. Preview headings are presentation-only.
  const freeText = [freeBase, '🧭 展開の考え方', explanation,
    `🎟️ 有料部分の内容\n中心の買い目 ${central.length}点${total > central.length ? `\n追加・参考 ${total - central.length}点` : ''}\n重複を除いた全体は${total}点です。`,
    '中心の買い目から順に掲載します。\n追加候補はすべて買う前提ではありません。',
    '📊 的中報告について\n・中心・追加の買い目全体で判定し、的中した欄を明記します。\n・別会計の参考予想は含めません。\n・中心のみの従来成績も分けて表示します。'
  ].filter(Boolean).join('\n\n');
  let cumulative = 0;
  const paidText = groups.map(group => {
    cumulative += group.tickets.length;
    const count = `${group.tickets.length}点${group === groups[0] ? '' : `｜ここまで合計${cumulative}点`}`;
    return [group.heading, formations(group.tickets) + '\n' + count, group.description].join('\n\n');
  }).join('\n\n') + `\n\n金額の目安（1点100円）\n中心のみ${central.length * 100}円${total > central.length ? `／追加・参考をすべて含めると${total * 100}円` : ''}`;
  const rendered = ticketsIn(paidText);
  const expected = [...central, ...(!independent ? unique([
    ...(prediction.mainSheet?.tickets || []), ...(prediction.mainSheet?.coverTickets || []),
    ...(prediction.mainSheet?.flowTickets || []), ...(prediction.manshuSheet?.tickets || [])]) : []), ...referenceTickets];
  if (rendered.some(t => !valid(t)) || new Set(rendered).size !== rendered.length || !sameSet(rendered, expected)) {
    throw new Error('readable_rendered_tickets_mismatch');
  }
  if (mentions(freeText).length) throw new Error('readable_free_ticket_leak');
  if (freeText.includes(article.paywallMarker) || paidText.includes(article.paywallMarker)) throw new Error('readable_paywall_invalid');
  const fullText = [freeText, article.paywallMarker, paidText, NOTICE, article.tags.join(' ')].filter(Boolean).join('\n\n');
  return { ...article, presentationVersion: 'readable-v1', freeText, paidText, fullText };
}
function readableArticle(article, bundle, { presentationVersion = 'readable-v2' } = {}) {
  // Explicit legacy use exists only for historical regression/reconstruction.
  if (presentationVersion === 'readable-v1') return readableArticleV1(article, bundle);
  if (presentationVersion !== 'readable-v2') throw new Error('published_presentation_version_unsupported');
  const category = require('./note-category-article');
  const series = require('./note-article-series').seriesOfBundle(bundle);
  const sections = category.sourceSections(bundle, series, article);
  const paidText = category.paidTextFromSections(sections);
  const record = bundle.record, prediction = record.prediction;
  const independent = series !== 'normal';
  const parts = category.originalParts(article, independent);
  const reasons = independent ? [parts.rationale] : [
    prediction.raceFlow?.summary || article.rangeSummary,
    prediction.mainSheet?.reason,
    ...(article.allRangeGroups || []).map(group => group.reason),
    prediction.manshuSheet?.reason
  ];
  const savedLines = [...new Set(reasons.filter(Boolean).flatMap(reason => String(reason)
    .split(/(?<=[。！？])|\n/).map(line => line.trim())
    .filter(line => line && !mentions(line).length)))];
  // Use only saved prose. Missing explanations are disclosed, never invented.
  const explanation = (independent ? savedLines : savedLines.slice(0, 3)).join('\n') || '保存済みの展開説明はありません。';
  const date = String(record.date), deadline = Date.parse(record.deadlineAt);
  if (!/^\d{8}$/.test(date) || !Number.isFinite(deadline)) throw new Error('readable_race_identity_invalid');
  const deadlineLabel = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(deadline);
  const counts = category.totals(sections);
  // Preserve saved disclosures, purchase warnings and the existing verified
  // navigation. Remove only the previous presentation introduction/date line.
  const retained = String(article.freeText || '').split('\n\n').filter(paragraph =>
    /^(?:【購入見送り】|作成時点の取得済み情報|今日の予想一覧\n|はじめての方へ\n|https:\/\/note\.com\/)/.test(paragraph));
  const freeText = [
    `🚤 ${Number(date.slice(4, 6))}月${Number(date.slice(6, 8))}日 ${record.place}${record.raceNo}R\n🕒 締切 ${deadlineLabel}`,
    ...(independent ? ['🔎 通常AIとは別の独立した監視予想です。'] : []),
    ...retained.filter(paragraph => !/今日の予想一覧|はじめての方へ|https:\/\//.test(paragraph)),
    `🧭 展開の考え方\n${explanation}`,
    `🎟️ 有料部分の内容\n${sections.filter(section => section.label !== category.REFERENCE).map(section => `${section.label}：${section.tickets.length}点`).join('\n')}\n📌 公開予想は重複なし${counts.primary}点です。`,
    ...(counts.reference ? ['🧾 参考予想は別枠に掲載し、公開予想の成績から除きます。'] : []),
    '📊 的中した区分を明記します。\n保存済みの実戦厳選の成績は、従来どおり別に集計します。',
    ...retained.filter(paragraph => /今日の予想一覧|はじめての方へ|https:\/\//.test(paragraph))
  ].join('\n\n');
  if (mentions(freeText).length) throw new Error('readable_free_ticket_leak');
  if (!article.paywallMarker || freeText.includes(article.paywallMarker) || paidText.includes(article.paywallMarker)) throw new Error('readable_paywall_invalid');
  // Reparse the exact public bytes and verify membership, including overlaps.
  const parsed = category.parsePaidSections(paidText);
  if (parsed.length !== sections.length || parsed.some((section, index) =>
    section.label !== sections[index].label || !sameSet(section.tickets, sections[index].tickets))) throw new Error('readable_rendered_tickets_mismatch');
  const fullText = [freeText, article.paywallMarker, paidText, NOTICE, article.tags.join(' ')].join('\n\n');
  return { ...article, presentationVersion, freeText, paidText, fullText };
}
module.exports = { readableArticle, ticketsIn };
