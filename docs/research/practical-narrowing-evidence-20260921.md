# Practical selection evidence audit — 2026-09-21

No prediction policy, ticket limit, UI, or historical forecast is changed.

## Completed diagnosis

- Audit run: https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/35557854508
- Source SHA: `50ee349b98b5f99cc9bae9a4551445d7bd5693a0`
- Generated at: `2026-09-21T03:35:36.628Z`
- Input report generated at: `2026-09-21T02:35:27.315Z`.
- All 26 reviewed note snapshots lacked a daily original matching race key, selection timestamp and practical-ticket set. This includes all six candidate-only hits. The immutable note forecasts themselves exist; their exclusion decisions were not included in the compact bundle.
- This does not establish why a ticket was excluded. Different-time daily predictions must not be substituted. No hindsight reconstruction or historical backfill is permitted.

## Forward evidence repair

The existing all-race collector already computes the complete practical selection for its outer-attack snapshot. Preserve its recorded decisions at that point, before odds/article processing, and verify the selected ticket set against the independent baseline. Save the evidence in both the immutable note bundle and existing research source; the latter survives article audit failure. Do not rerun or change selection for this repair.

`practicalSelectionEvidence` includes race/time identity, method evidence, selected tickets, existing candidate and target decisions, and comparison boundaries. Missing selection or a baseline mismatch is explicit and carries no substitute decisions. A captured snapshot with zero decisions does not establish an exclusion reason.

Next comparison must use same-time saved evidence, include gains and losses, preserve the maximum 10 practical tickets, and pass the existing preregistered adoption gate on separate evidence. This repair is not a demonstrated hit-rate improvement.

The prior ordinary-candidate experiment remains unadopted: on the 51-race later historical period, hits fell from 19 (37.3%) to 18 (35.3%). Do not rerun that fixed candidate on the same evidence.
