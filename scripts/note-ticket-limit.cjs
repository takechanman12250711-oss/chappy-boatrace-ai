'use strict';

// 2026-11-16 owner decision: a race article may be published when its saved
// practical selection ("中心の買い目") holds 1-10 tickets. It was 1-7. The
// prediction itself already allows up to 10 (docs/CHAPPY_CHARTER.md); this is
// only the publication gate and the readers of published rows.
// Independent-monitor originals keep their own 1-7 rule. Since the 2026-11-20
// owner decision, a korogashi leg uses this same 1-10 limit.
const MAX_PUBLICATION_TICKETS = 10;
module.exports = { MAX_PUBLICATION_TICKETS };
