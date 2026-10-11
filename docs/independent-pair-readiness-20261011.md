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
