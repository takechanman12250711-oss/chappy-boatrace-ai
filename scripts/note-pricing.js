'use strict';
// User-approved trial for newly published articles, 2026-10-04 JST.
// Historical receipts retain the actual price paid at publication.
const NOTE_PRICE_YEN = 200;
const isRecordedPrice = price => price === 200 || price === 300;
module.exports = { NOTE_PRICE_YEN, isRecordedPrice };
