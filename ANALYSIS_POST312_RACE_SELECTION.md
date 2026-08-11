# Post-#312 race-selection audit

Analysis-only branch. Do not merge into production.

## Scope
After PR #313 rejected simple candidate-generation broadening and PR #314 rejected simple practical-selection broadening/replacement, this audit tested whether existing race-level evidence can robustly identify races worth buying or skipping without changing ticket generation.

Target row basis (2026-08-07 through 2026-08-10): 341 races, 115 hits, 226 misses. Unique historical pre-target basis: 457 races, 133 hits.

## Target-only candidate rules
Several conditions looked strong inside the target period. Example `noLongshot_fourTotal65_twoBuffs4`: 63 selected races, 33 hits (52.38%), ROI 135.26%. But the same fixed condition on pre-target races fell to 57 races, 17 hits (29.82%), ROI 55.62%. Other target-derived conditions also failed out-of-time.

## Cross-period stable features
The strongest features with the same hit/miss direction in both periods were concentrated around boat 1: higher boat-1 race-flow/tenkai score, total score, evidence/buff count, attack score, local/michu support, and lower debuff count. More alternate-scenario pickup candidates tended to correlate with misses. This direction is compatible with the project's inner-course / 1-escape philosophy, but correlation alone did not produce profitable selection rules.

## Four-block robustness
Stable-feature-only rounded rules were tested across four chronological blocks: preEarly, preLate, 2026-08-07/08, and 2026-08-09/10.

Best minimum ROI among tested rules was `oneTenkai66`: minimum block ROI 53.19% with minimum hit rate 27.91%. Other rules had minimum ROI between 39.60% and 50.53%. No tested rule achieved ROI >=100% in all four blocks.

Examples:
- `oneTenkai66`: preEarly ROI 53.19%, preLate 54.67%, targetTrain 55.62%, targetTest 65.50%.
- `oneTotal68`: 48.65%, 55.51%, 81.72%, 61.37%.
- `total68_buffs4`: 49.93%, 55.11%, 76.56%, 61.47%.

## Conclusion
Race-level selection based on the tested existing evidence features is not robustly profitable. A stable relationship exists between stronger boat-1 evidence and hit probability, but using it as a buy/skip gate does not improve ROI enough to justify a production change.

Production main remains unchanged. The next analysis should move to structural miss/profit decomposition by actual winner course/head and predicted main scenario, to identify whether losses concentrate in specific scenario classes rather than trying additional global thresholds.