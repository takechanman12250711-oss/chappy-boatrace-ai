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
module.exports={STATUS_LABELS,statusLabel,statusCounts};
