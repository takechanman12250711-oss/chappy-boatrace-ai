'use strict';
// 2026-10-28 owner decision: newly published race articles are free (no paid
// area, the whole article readable by anyone). Earlier receipts keep the price
// actually set at publication: 300 before the 2026-10-04 trial, then 200.
// The 200-yen era's exact module is frozen as note-recovery-pricing-v1.cjs for
// proof-gated recovery of claims made before this change.
const NOTE_PRICE_YEN = 0;
const FREE_PRESENTATION_VERSIONS = Object.freeze(['readable-v6']);
const isRecordedPrice = price => price === 0 || price === 200 || price === 300;
const isFreePrice = price => price === 0;
// The price a publication of this presentation version was claimed with.
// Every readable version before v6 was published (or claimed) at 200 yen or
// earlier; recovery only ever re-verifies the 200-yen era, as before.
const priceForPresentation = version => FREE_PRESENTATION_VERSIONS.includes(version) ? 0 : 200;
module.exports = { NOTE_PRICE_YEN, FREE_PRESENTATION_VERSIONS, isRecordedPrice, isFreePrice, priceForPresentation };
