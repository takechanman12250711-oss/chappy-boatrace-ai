# Bright mobile layout

The 2026-10-07 layout uses white cards, a pale blue canvas and dark text. It is a presentation-only change.

## Venue picker

- The default grid contains all 24 venues, in official code order. Phones use 3 columns; wider screens use 6.
- Cards display venue name, timeband / grade, then independent hosting status. A grade never conceals an ended or unavailable state.
- `eventSession` is read from the existing official daily index response. Values are `morning`, `day`, `summer`, `night`, `midnight`, or empty when unconfirmed.
- Exact tags remain distinct. The day filter includes summer; the night filter includes midnight. Cards lacking daily metadata use explicitly qualified `通常…` labels.
- Unknown grade is `確認中`; no event is `—`. No unknown value defaults to `一般`.
- The live API is the separate `takechanman12250711-oss/chappy-boatrace-api` repository. The frontend's mirrored API file alone does not deploy live metadata. The qualified fallback is retained during rolling deployment.

## Prediction reading order

Race / deadline / source freshness → existing flow explanation and caution → 本命 / 押さえ / 流し（フォーメーション） / 万舟 → 厳選 → expandable entries, boat details and evidence.

- Existing DOM sections are moved, not regenerated or deleted, preserving controls and evidence.
- The flow preview comes only from fields already present on the prediction. Missing explanation or source freshness is explicit. Generation time is not substituted for source fetch time.
- `厳選` is a display name. Internal practical keys, selection rules and performance cohorts remain unchanged.
- The existing display membership is preserved: sub-100 or unpriced reference tickets still appear under 押さえ, now identified as 参考候補. No saved ticket changes category.
- The four-category total includes all four groups, excluding the overlapping practical selection. Practical-only tickets remain visible in the dedicated selection panel.
- Six boat badge colours stay white / black / red / blue / yellow / green.
- Delayed presentation callbacks bind to the rendered DOM generation, preventing earlier results from repainting a newer race or loading screen.

## Checks

`node scripts/test-venue-picker-metadata.js` checks parsing, unknown states, all 24 entries and stale selection responses.

The DOM integration test uses synthetic fixtures (not live predictions), the actual renderer and final presentation modules:

```
npm install --prefix /tmp/chappy-dom-tests --no-audit --no-fund --ignore-scripts linkedom@0.18.12
NODE_PATH=/tmp/chappy-dom-tests/node_modules node scripts/test-bright-mobile-layout.cjs
```

It checks layout order, exact category ticket sets, source immutability, reference labels, practical-only tickets, totals, empty/high-odds-only states, race switching, delayed callbacks, all boat badge colours, safe text and the 24-card filters. The existing mobile/display and home workflows remain required.

DOM tests do not establish pixel-level contrast or responsive rendering. Verify 320px / 390px / desktop, all navigation states and real screenshots through an available authorized browser before claiming visual QA complete.
