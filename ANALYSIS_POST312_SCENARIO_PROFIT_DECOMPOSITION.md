# Post-#312 winner-head profit decomposition

Analysis only. Do not merge this branch.

## Basis

- pre-target unique races (< 2026-08-07): 457 races, 133 hits
- target row basis (2026-08-07..10): 341 races, 115 hits
- practical selection rebuilt from current main-compatible code path
- stake model: 100 yen per selected ticket

## Target row basis by actual winner head

| actual head | races | hits | hit rate | ROI | profit |
|---|---:|---:|---:|---:|---:|
| 1 | 193 | 96 | 49.74% | 80.10% | -34,950 |
| 2 | 42 | 16 | 38.10% | 161.67% | +23,680 |
| 3 | 42 | 1 | 2.38% | 22.38% | -29,960 |
| 4 | 33 | 0 | 0.00% | 0.00% | -30,100 |
| 5 | 23 | 2 | 8.70% | 85.11% | -3,260 |
| 6 | 8 | 0 | 0.00% | 0.00% | -7,100 |

## Pre-target by actual winner head

| actual head | races | hits | hit rate | ROI | profit |
|---|---:|---:|---:|---:|---:|
| 1 | 246 | 119 | 48.37% | 80.99% | -40,800 |
| 2 | 49 | 13 | 26.53% | 102.73% | +1,170 |
| 3 | 76 | 0 | 0.00% | 0.00% | -66,400 |
| 4 | 45 | 0 | 0.00% | 0.00% | -39,800 |
| 5 | 28 | 0 | 0.00% | 0.00% | -25,300 |
| 6 | 13 | 1 | 7.69% | 58.55% | -4,850 |

## Structural finding

The same pattern exists before and after 2026-08-07:

1. Actual 2-head races are the only profitable head class under the current practical-selection path.
2. Actual 1-head races are hit at about 48-50%, but remain below break-even ROI (~80%).
3. Actual 3- and 4-head races are the dominant structural blind spot: target 75 races produced only one hit; pre-target 121 races produced zero hits.
4. Actual 5/6 heads are rare and weakly covered, consistent with earlier rejection of simple outer-head scenario addition.

The audit attempted to classify the internal named main scenario, but the rebuilt public prediction object does not expose a stable mainScenario label at the paths tested. Therefore no scenario-name conclusion is claimed. The reliable decomposition is by actual winner head and selected-ticket head.

## Next analysis

Do not globally broaden tickets. Focus on why 3-head and 4-head winners are almost never represented in practical selection despite the AI having formal 3-attack / 4-corner theory. Split those races into:

- predicted head remained 1/2 because attack scenario lost at scenario-selection stage;
- attack head existed in formal formations but was filtered downstream;
- attack scenario itself was not generated/qualified.

Compare 3-head and 4-head separately and preserve pre-target vs target validation.
