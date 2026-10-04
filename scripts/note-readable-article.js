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
  // Group only equal first/second axes; the third axis cannot invent a ticket.
  const groups = [];
  for (const ticket of tickets) {
    const [a,b,c] = ticket.split('-'), key = `${a}-${b}`;
    if (groups.at(-1)?.key !== key) groups.push({ key, thirds: [] });
    groups.at(-1).thirds.push(c);
  }
  return groups.map(({ key, thirds }) => `・${key}-${thirds.join('')}`).join('\n');
}

function readableArticle(article, bundle) {
  const independent = bundle.version === 'independent-monitor-note-v1';
  const prediction = bundle.record.prediction;
  const central = unique(bundle.baselinePracticalTickets);
  const seen = new Set(central);
  const groups = [{ heading: '中心の買い目', tickets: central,
    description: 'まず確認する買い目です。追加候補を買わず、この範囲だけで選べます。' }];
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
      else groups.push({ heading, tickets, description: 'ここからは追加候補です。中心の買い目との重複はありません。無料部分の展開説明を確認して、必要な場合だけ追加してください。' });
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
    description: '保存された参考予想のうち、上の買い目と重複しない分です。中心の買い目の成績とは別集計です。' });
  const referenceProse = reference.split('\n').filter(line => !mentions(line).length && !/^(計 |内訳|参考.*点|本命とは別会計)/.test(line)).join('\n').trim();
  if (referenceProse) reasons.push(referenceProse);
  // A saved rationale can include the full ticket. Its ticket remains in the
  // paid list; omit that sentence from the preview instead of exposing it.
  const explanation = [...new Set(reasons.filter(Boolean).map(reason => reason
    .split(/(?<=[。！？])|\n/).filter(sentence => !mentions(sentence).length).join('\n').trim()).filter(Boolean))].join('\n\n');
  const total = groups.reduce((n,g) => n + g.tickets.length, 0);
  const freeText = [freeBase, '展開の考え方', explanation,
    `有料部分の内容\n中心の買い目 ${central.length}点${total > central.length ? `／追加・参考 ${total - central.length}点` : ''}。重複を除いた全体は${total}点です。`,
    '中心の買い目から順に掲載します。追加候補はすべて買う前提ではありません。的中報告の対象は中心の買い目です。'
  ].filter(Boolean).join('\n\n');
  let cumulative = 0;
  const paidText = groups.map(group => {
    cumulative += group.tickets.length;
    return [group.heading, group.description, formations(group.tickets),
      `${group === groups[0] ? '中心' : '追加'} ${group.tickets.length}点｜ここまで重複なし${cumulative}点`,
      `1点100円の場合：この欄${group.tickets.length * 100}円`].join('\n\n');
  }).join('\n\n');
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
module.exports = { readableArticle, ticketsIn };
