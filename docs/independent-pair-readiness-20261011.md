# Pair selection readiness audit — 2026-10-11

Source main: `a09d21ce585320a633697346a49d26271b477ab7`.
This audit did not read race outcomes or optimize ticket ranking.

- All 20 saved snapshot-v8 receipts for 20261011 passed snapshot SHA256, pre-deadline confirmation, and exact diagnostic/selector replay.
- Twelve were main-scenario-unresolved. Eight had escape:1 diagnostics, 20 ordered pairs each.
- All eight stopped with course-history-insufficient: zero evaluated pool pairs and zero selected pairs. All 20 projected history metadata records were unavailable (`history-source-or-cutoff-invalid`).
- Across 160 diagnostic pairs, sameZone and same-zone competition both split 96/64; partner-pressure/follow were false throughout and sharedPressureSources empty. Actual turn observations: zero. These conditional route labels do not substantiate an interaction ranking or excluding same-zone pairs.

## Identified input defect and repair

The exact history blob `47f39b5e024ed6d17c1451823ae4d70347c55bf5` (7,588,073 bytes) has generatedAt `2026-10-11T02:13:36.935Z`, lastDate `20261011`, but analysisWindow.latestDate `20261010`. The builder excludes files beyond the latest closed race day, yet copied lastDate from the newest input file, including open days. The independent history consumer correctly rejects that advertised same-day boundary. The observed metadata explains a current input blocker; the exact history blob used by each earlier unavailable receipt is not recoverable from its projected metadata, so this does not prove that every earlier rejection had the identical cause.

Repair only the racer-skill output's lastDate to the builder's effective closed-day cutoff. Do not relax the consumer cutoff, change candidate ranking, alter old receipts or count retrospective projections as forward evidence. Source SHA256 remains captured for newly accepted history.

The regression test runs the actual builder with a completed previous day and a partial current day containing a result; proves the current-day result is excluded and racer aggregates unchanged; passes the resulting metadata through independent history capture/validation; verifies same-day closed data and future publication remain unavailable, and no closed day yields a null cutoff.

## Next evidence, without repeating collection work

The existing official-results pipeline rebuilds this derived history. Main code deployment and a newly generated history file are separate milestones. Confirm lastDate, latestDate and generatedAt after its next build, then inspect genuinely new pre-deadline v8 receipts for available history and evaluated source pools. Never replace the 20 original receipts. After that, assess paired selection evidence and fix a candidate only if its non-outcome rationale is supported, then compare on unseen races at the same ticket count. Precision/ROI improvement is not established by this repair. Research remains unusable for production and automatic application remains disabled.


## Follow-up: deployed cutoff and two more immutable seals

Checked main `f5ebb6fddb624589d63cf725693f9b8883e9ae90`. The #1290 producer repair is live in the derived history: generatedAt `2026-10-11T10:19:54.192Z`, lastDate/latestRaceDate `20261010`, SHA256 `5fb74e0f91c945ac86c677f34daf92014648729c2ce6abe832bc4a3f3be21db7`. Do not repeat the prior hypothetical-history replay.

Compared with the previously checked 24 receipts at `9397a81c7cf266cae5fe9cc24666b92df3d761bb`, only two files were added; existing receipts were unchanged. Total saved v8 receipts on 20261011: 26. Both new snapshots passed the existing protocol/cohort validation, exact selector/diagnostic replay, filename/snapshot hash and pre-deadline checks, with no rejected rows in this two-row delta. No outcomes were used.

| Race | Official deadline JST | Main-scenario result | Pair diagnostic |
|---|---|---|---|
| 20261011-01-12 | 20:45 | exhibition-start-marker | unavailable / 0 pairs |
| 20261011-15-12 | 20:38 | no-supported-main-scenario | unavailable / 0 pairs |

Both reference the available corrected history above. They share artifact `11701028382`, digest `sha256:362c046fc36e527b9994e6a1735f6346943bc92699e5bbdf611648175ed61c78`, run `38136107774`, workflowHead `cc8a8c530bbfb30b7f8b28e96b1f4d97a8731aa5`, createdAt `2026-10-11T11:36:04Z`, confirmedAt `11:36:05Z`. Artifact API metadata matches ID/digest/run/head/creation time. Receipt snapshot hashes are `2ca6ec62f1262b4e5579bc5e27483b8cd2a4944162d02cc77c915b73affcfa2c` and `c1fa33ee2ef8324f2ee2a0c841a7aab51036e45abce75f70868281cdef096e36` respectively.

`independent-autonomous-report.json` is still generatedAt `2026-10-11T00:26:59.994Z`, sourceCommit `f4137a5404b7d46dc6772bec920a09d5c77a8f36`, with pair study not-yet-collected/0. Its checkout predates the new receipts. Existing `escape-main-audit.yml` runs at 21:25 UTC / 06:25 JST daily. The 26 saved records are not 26 evaluated pairs, not 26 hits, and not already included in that report. Verify its next saved report separately; do not rewrite old seals, relax unresolved-scenario checks, or create an extra monitoring schedule.

Pair selection/precision improvement remains unestablished. While genuine future inputs are pending, the previously identified source-input audit was completed in [new-environment-source-audit-20261011.md](new-environment-source-audit-20261011.md); it does not change pair or production logic.
