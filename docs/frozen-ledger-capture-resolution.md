# Frozen ledger capture resolution

The hit-first report verifies the immutable latest 100 ledger rows. Its prediction
lookup must therefore match each saved race key and `selectedAt` capture, rather
than choose the newest version of an entire prediction day. The general
eight-ticket discovery loader still uses its existing latest-day and primary-row
preference rules.

`readFrozenDay` reads both existing raw and archived day sources, checks archive
size and SHA-256 against the existing metadata, and checks the restored source
size and SHA-256. It does not reconstruct, compact, rewrite, or save a source.
Malformed or incomplete existing sources fail closed even when another source
contains a matching capture. It retains the first existing matching record intact (raw before archive,
`predictions` before `verificationPredictions`, then original array index);
no record is assembled from fields belonging to different sources.

## Duplicate equivalence boundary

A race/capture can occur in primary and verification arrays and in both day
sources. Every match must agree on the following evidence, compared structurally
with object keys sorted and array order preserved:

- Resolved race key; `selectedAt`, `capturedAt`, `createdAt`, `deadlineAt`, and
  `deadline` fields.
- Record `verificationMode`, prediction `predictionMode`, and both record and
  prediction `officialResultUsedForPrediction`, `officialResultUsedForEvaluation`,
  and `isRetrospective` flags.
- The complete effective `preRaceConditions` object, including its source label,
  fetch time, schema, timing assertion, result-use assertion and boat evidence.
- The complete effective `verificationEvidence` object, including the generation
  and all other saved evidence.
- The complete effective saved practical-ticket list, preserving ticket order and
  all ticket metadata except the three odds-display fields listed below. A ticket
  string is represented as `{ ticket: string }` only for this equality check.
- The complete `practicalSelection.candidateOutcomes` array, preserving order and
  all candidate metadata except those same three fields. Missing or non-array
  pools remain distinct from empty arrays; the report's unknown-versus-false
  candidate-pool diagnosis is preserved.

The only ignored fields inside ticket/candidate objects are `odds`, `oddsText`,
and `hasOdds`. Existing primary copies contain acquired display odds while their
verification copies contain zero / "オッズ未取得" / false. Neither ticket membership,
miss diagnosis, generation validation, timing validation nor official-result
accounting reads these fields. Their original values remain in the selected
record and are covered by its full record hash. Role, priority, selection and
other ticket metadata are not ignored.

One additional, exact path is allowed only in the practical-ticket list:
`practicalTickets[n].threeCourseEscapeRescueFixed5.{odds, oddsText, hasOdds}`.
The 2026-10-06 primary copies for 13-1, 02-2 and 11-3 retain these display fields
(14.9, 17.5 and 29.7); the verification copies omit them. All other rescue fields
(`applied`, `version`, `targetLabel`, `ticket`, `replacedTicket`, `index`, or any
other field) must agree. Missing, null, array and object rescue values stay
distinct. No arbitrary nested odds fields are stripped, and this nested exception
does not apply to candidate outcomes. The original selected record and its full
hash retain its original nested odds.

All remaining fields outside this projection are outside the hit-first verifier's
input contract. This includes compacted presentation fields such as
`prediction.raceFlow` and `prediction.mainSheet`, other research shadows, note
metadata, and post-result annotations such as `result.review`,
`result.missCauseAnalysis`, `theoryEvaluationSnapshot`, and
`scenarioAiV6Verification`. They cannot supply the official result: that still
comes independently from `data/results`. Differences in these fields do not
establish a conflict in this report's verifier inputs. This is report-input
equivalence, not a claim that the full records are identical.

For auditability, each source records its full source SHA-256 and, when applicable,
archive SHA-256. Every matching record records its array/index, full record
SHA-256 (canonical JSON), and verifier-evidence SHA-256. Object key ordering is
ignored by canonical hashes; array ordering is not. A conflicting evidence hash
rejects that frozen row without selecting the copy that happens to pass.

## Unchanged safety checks

After resolution, the existing report checks the selected record's pre-deadline
status, exact capture time, generation, saved tickets, independent official
result/payout, hit, stake and return. The saved population, ledger bytes,
rolling-100 comparison, `source.complete` gate, and `NOT_APPROVED` /
`automaticApplication=false` / `productionChanged=false` flags stay unchanged.
Missing frozen captures are failures, never substituted with later captures.
The frozen ledger has no original per-record content hash, so lookup alone cannot
prove that a sole surviving source was never changed historically. It proves
agreement with the available hashed source and the existing ledger contract.

## Regression evidence

For the verified 2026-10-05 case, the frozen Wakamatsu 1R capture is
`2026-10-05T05:16:43.698Z`, with eight saved tickets. The newer archive contains a
separate `08:28:07.910Z` capture with seven tickets. Both are preserved; only the
original capture is eligible for its frozen ledger row.

The affected day contains 48 of the frozen 100 rows. Forty-seven have duplicate
copies with harmless display/post-result differences; the explicit projection
matches across those copies. Synthetic tests cover a fixed 100-row population,
missing originals, same-day primary/verification capture collisions, identical
copies, documented annotation/odds differences, conflicting nonwinning tickets
with unchanged accounting, changed ticket-role evidence, timing, generation,
other verification evidence, candidate pools, and corrupt source fingerprints.
