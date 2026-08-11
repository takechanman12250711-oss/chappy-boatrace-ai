# Post-#312 formal-present selection audit

Analysis-only branch. Do not merge into production.

## Scope
2026-08-07 through 2026-08-10 row-basis misses where the exact official winning ticket already exists in formal AI Core formations but is not selected by practical-selection.

- formal-present misses: 84
- all 84 excluded with `CANDIDATE_ONLY_EVALUATION`
- selected count 10 / capacity 0: 43
- capacity 1: 10
- capacity 2: 31
- formal presence: flow 66, main 18, safety 13, longshot 5 (categories can overlap)

## Capacity-available 41
Tested priority-only, category/rank/priority grids, winner-vs-loser candidate discrimination, and structured rules using head=1, formal category overlap, category rank, priority band, and coverage count.

Some target-period rules looked strong in both halves, but all failed the pre-target out-of-time check. Example: `head1FlowRank8_12P70_84` had target train ROI 245.83%, target test ROI 127.89%, but pre-target ROI only 67.62%. Therefore no additive rule is adopted.

## Full-capacity 43
Tested replacing only the weakest selected `展開追加` ticket, preserving the basic main/cover structure. Candidate modes used head=1 flow / main+flow / formal with priority gaps 0, 5, 10.

Best target-period replacement was `head1Flow-gap0`: 119 swaps, 6 rescued hits, 5 lost existing hits, net +1, swap ROI -17.73%; target second half net -1. Other replacement rules were worse. Therefore no replacement rule is adopted.

## Conclusion
No formal-present selection rule tested here satisfies robustness and efficiency requirements. Production `main` remains unchanged. Combined with PR #313, neither simple candidate-generation broadening nor simple practical-selection broadening/replacement is supported by the available validation data.

Next analysis should move away from adding/replacing tickets and examine race-level discrimination: what separates races where the current practical selection hits from races where it misses, with the goal of improving race selection / skip decisions without changing the core prediction order or adding tickets.