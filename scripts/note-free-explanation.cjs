'use strict';

// Presentation-only: inspect immutable saved claims, never rerun predictions.
const ticketsIn = text => require('./note-readable-article').ticketsIn(text);
const FALLBACK = '保存済みの本命と展開説明の整合を確認できないため、ここでは本命艇を断定しません。';
const valid = t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
const ticket = row => typeof row === 'string' ? row : row?.ticket;
function savedMainHead(prediction) {
  const rows = prediction?.mainSheet?.tickets;
  if (!Array.isArray(rows) || !rows.length || !rows.every(row => valid(ticket(row)))) return null;
  const heads = new Set(rows.map(row => Number(ticket(row)[0])));
  const head = Number(prediction?.mainSheet?.honmei?.boatNo);
  if (!Number.isInteger(head) || head < 1 || head > 6 || heads.size !== 1 || !heads.has(head)) return null;
  // A missing formal head is not agreement. Do not fall back to ranking prose,
  // attacker course, a raw mark or a later result to fill this identity.
  const scenario = prediction?.verificationEvidence?.mainScenario;
  const raw = scenario?.headBoatNo;
  if (!(typeof raw === 'number' || (typeof raw === 'string' && /^[1-6]$/.test(raw)))) return null;
  if (!Number.isInteger(Number(raw)) || Number(raw) !== head) return null;
  if (scenario.attackerBoatNo !== undefined && Number(scenario.attackerBoatNo) !== head) return null;
  return head;
}
function formalLabel(prediction, head) {
  const scenario = prediction.verificationEvidence.mainScenario;
  // Deliberately finite saved generator grammar, not a natural-language
  // contradiction detector. Unknown scenario types/labels stay unverified.
  const labels = { escape: `${head}号艇逃げ`, sashi: '2コース差し',
    threeAttack: '3コース攻め', fourAttack: '4カド攻め' };
  const expected = labels[scenario.type];
  return expected && scenario.label === expected ? expected : null;
}
function safeNormalExplanation(article, bundle) {
  const prediction = bundle?.record?.prediction || {}, head = savedMainHead(prediction);
  if (!head) return FALLBACK;
  const label = formalLabel(prediction, head);
  if (!label) return FALLBACK;
  const savedTickets = [...new Set(prediction.mainSheet.tickets.map(ticket))].sort();
  const matches = (article?.allRangeGroups || []).filter(group => group.key === 'main' &&
    Array.isArray(group.tickets) && group.tickets.length > 0 && group.tickets.every(valid) &&
    new Set(group.tickets).size === group.tickets.length &&
    JSON.stringify([...group.tickets].sort()) === JSON.stringify(savedTickets));
  if (matches.length !== 1 || typeof matches[0].reason !== 'string') return FALLBACK;
  const sentences = value => String(value || '').split(/(?<=[。！？])|\n/).map(line => line.trim()).filter(Boolean);
  const allowed = new Set([`最有力展開は${label}。`, `${label}から作られた本線候補。`]);
  const groupLines = sentences(matches[0].reason).filter(line => allowed.has(line));
  if (!groupLines.length) return FALLBACK;
  // Only these complete canonical sentences are copied. Raw mainSheet.reason,
  // row commentary and arbitrary group clauses are never fallbacks, even when
  // a few known contradiction patterns appear absent.
  const summaryLines = sentences(prediction.raceFlow?.summary || article?.rangeSummary)
    .filter(line => allowed.has(line));
  return [...new Set([...summaryLines, ...groupLines])].join('\n');
}
function withVerifiedExplanation(base, article, bundle) {
  if (require('./note-article-series').seriesOfBundle(bundle) !== 'normal') {
    return { ...base, presentationVersion: 'readable-v4' };
  }
  const pattern = /(?<=🧭 展開の考え方\n)[\s\S]*?(?=\n\n🎟️ 有料部分の内容)/g;
  if ([...base.freeText.matchAll(pattern)].length !== 1) throw Error('readable_explanation_section_invalid');
  const freeText = base.freeText.replace(pattern, () => safeNormalExplanation(article, bundle));
  if (ticketsIn(freeText).length) throw Error('readable_free_ticket_leak');
  if (!base.fullText.startsWith(base.freeText)) throw Error('readable_free_prefix_invalid');
  const fullText = freeText + base.fullText.slice(base.freeText.length);
  return { ...base, presentationVersion: 'readable-v4', freeText, fullText };
}
module.exports = { FALLBACK, savedMainHead, safeNormalExplanation, withVerifiedExplanation };

