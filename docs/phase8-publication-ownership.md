# Saved Phase 8 publication ownership

`scripts/persist-theory-validation-cycle.cjs` is the sole main publisher of
`data/stats/theory-validation-phase8-cycle.json`. It uses the unchanged Phase 8
builder and its stable-save rule: only `generatedAt` is ignored. Actual evidence,
coverage source times, candidate decisions and wall progress remain significant.

## Existing entry points

- Official results: `diagnostics` computes the learning reports. The central
  runner builds Phase 8 in memory and passes the identical object to Phase 9,
  but saves only Phase 9. `publish_diagnostics` validates and saves that artifact.
  Dependent `publish_reports` refreshes Phase 8 from current main and returns its
  final commit as `saved_sha`. Both calibration checkout and its checkpoint base
  use that exact commit.
- Wall collection: the dedicated collector and its schedule, push, manual and
  official-result-success triggers stay intact. Its strict checkpoint contains
  exactly the wall report, Phase 6 and Phase 7. Dependent `refresh_cycle` calls
  the same limited publisher after the three-report checkpoint succeeds.

Both refresh jobs use the existing `chappy-main-data-writers` queue. They do not
restore prediction archives, rebuild the learning pipeline or add a schedule.
Heavy collection stays outside the shared queue. Phase 8 dynamically rebuilds
Phases 7/6 from the latest saved inputs, so either collector's ordering reaches
Phase 11's unchanged on-disk Phase 8 reader.

## Freshness and recovery

The publisher fetches main into a disposable worktree and rebuilds there. It
validates completion/safety flags and permits only the Phase 8 output path. A
concurrent push causes a fresh-main recomputation, up to three attempts; it never
rebases artifact bytes, chooses `KEEP_NEWER` for Phase 8, or force-pushes. No-op
calculations also recheck main. An ambiguous push response is reconciled before
retry, including newer saved inputs following an accepted commit.

The checkpoint job and refresh job are separate intentionally. If batch saving
succeeds and Phase 8 refresh fails, rerun the failed refresh job. This starts
from current main without replaying the consumed artifact. Replaying an older
wall receipt or stale diagnostic output still fails the unchanged strict guard.
No checkpoint profile accepts precomputed Phase 8 bytes, including calibration.
Packaging fails explicitly if a producer accidentally changes Phase 8; the
forbidden update is never silently dropped.

## Verification

`node scripts/test-phase8-single-writer.cjs` uses the real builder and saved
report inputs in temporary Git remotes with shallow clones and the exact
refresh-job sparse paths (raw prediction/result files stay outside worktrees). It changes wall and coverage counts and
checks both publication orders, Phase 11 counts, Phase 9's exact in-memory
handoff, failure recovery, code/input push races, no-op races, lost acknowledgments,
bounded contention, unchanged raw-data hashes and rejected raw/config writes.
Existing checkpoint, wall, stable-save, Phase 8 and Phase 9 tests remain required.

A local build against main `0aa5053a` took 0.084 seconds on Node 24; this measures
builder time only. Runner checkout, Git fetch/push and queue wait are separate.
The GitHub Node 20 run and main saved output must be verified before calling the
production issue resolved. No prediction formula, approval gate or raw original
is changed by this publication fix.

## Existing monitor compatibility

The result watchdog reads the final workflow conclusion and the unchanged
`Save official results before calibration`, `Build prediction calibration`, and
`Save calibration and derived data` step names. It does not require the Phase 8
commit to equal a diagnostics receipt commit. Successful jobs from earlier
attempts remain visible during failed-job reruns. Diagnostic receipts retain
their original source/published-from provenance; calibration starts at the newer
Phase 8 commit through its unchanged `publish_reports.saved_sha` interface.
