'use strict';

// 2026-10-25 owner request: public X posts carry the same short notice.
// Presentation only. It never changes tickets, results, prices or schedules.
const SOCIAL_NOTICE = '※予想は参考情報です。舟券は20歳以上・自己責任で。';

// Hit reports and recaps already sit at X's 280 weight limit and must keep
// every verified fact. Add the notice there only when it still fits.
function withNoticeIfFits(text, weight, limit = 280) {
  const withNotice = `${text}\n${SOCIAL_NOTICE}`;
  return weight(withNotice) <= limit ? withNotice : text;
}

module.exports = { SOCIAL_NOTICE, withNoticeIfFits };
