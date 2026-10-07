'use strict';
// Display only. Ledger counts/statuses and publication evidence stay untouched.
const STATUS_LABELS = Object.freeze({hit:'🎯 的中',miss:'❌ 不的中',pending:'⏳ 結果待ち',void:'➖ 不成立',review:'🔎 照合確認中'});
function statusLabel(status) {
  if (!Object.hasOwn(STATUS_LABELS,status)) throw Error('result_presentation_status_invalid');
  return STATUS_LABELS[status];
}
function statusCounts(counts, unit = '件') {
  // Omit empty categories, never a nonzero miss/pending/review/void. Together
  // with the published denominator these counts still describe every record.
  return Object.keys(STATUS_LABELS).filter(status=>counts[status]>0)
    .map(status=>`${STATUS_LABELS[status]} ${counts[status]}${unit}`).join(' ／ ');
}
// Article families are verified source identities. Published section labels
// remain literal: e.g. 相手を広げるなら combines main and cover tickets, so
// calling that whole section 押さえ would invent a category attribution.
const RESULT_SERIES_LABELS=Object.freeze({normal:'AI展開予想',escape:'独立本命予想',manshu:'独立万舟予想'});
function isPublishedSectionLabel(articleSeries,label) {
  if(!Object.hasOwn(RESULT_SERIES_LABELS,articleSeries))return false;
  if(['中心の買い目','相手を広げるなら','別の展開を考えるなら','高配当を狙うなら'].includes(label))return true;
  const {NORMAL_LABELS,INDEPENDENT_LABELS}=require('./note-category-article');
  return articleSeries==='normal'?NORMAL_LABELS.includes(label):INDEPENDENT_LABELS[articleSeries]===label;
}
function winningGroups(matches) {
  return Object.entries(RESULT_SERIES_LABELS).flatMap(([articleSeries,family])=>{
    const labels=[...new Set(matches.filter(s=>s.articleSeries===articleSeries).map(s=>s.label))];
    return labels.length ? [{articleSeries,family,labels}] : [];
  });
}
function winningLabel(matches) {
  return winningGroups(matches).map(g=>`${g.family}「${g.labels.join('／')}」`).join('・');
}
module.exports={STATUS_LABELS,statusLabel,statusCounts,RESULT_SERIES_LABELS,winningGroups,winningLabel,isPublishedSectionLabel};
