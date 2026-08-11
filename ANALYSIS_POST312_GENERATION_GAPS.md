# Post-#312 generation-gap audit (temporary analysis)

This branch is analysis-only and must not be merged.

## Baseline (2026-08-07 through 2026-08-10 row basis)
- practical-selection hits: 115 / 341
- misses: 226
- exact winning ticket present in formal AI Core formations (main+safety+flow+longshot): 84
- exact winning ticket absent from formal formations: 142

## Formal-generation-absent 142 decomposition
- scenario head exists and both 2nd/3rd roles present but exact ticket not formed: 49
- correct 2nd missing only: 50
- correct 3rd missing only: 8
- correct 2nd and 3rd both missing: 6
- no formal winner scenario: 29 (5-head=21, 6-head=8)

## Tested and rejected counterfactuals
1. Direct ticketization of scenario-complete 49: weak efficiency / no two-half robustness.
2. Main-attacker retention ticketization: weak second-half robustness.
3. Pickup-to-second promotion: apparent gains fell after duplicate-race correction; fixed 84/78 was too sparse out-of-time to establish robustness.
4. Triple-role third restoration (remainer+follower+pickup >=65): 115->117 but +129 tickets, incremental ROI 44.19%; test half +0. Rejected.
5. Pickup-second + remainer-third role swap (pickup>=65, hold>=65): 115->118 but +281 tickets, incremental ROI 36.8%; out-of-time pre-target +7 but +520 tickets, ROI 51.04%. Rejected.
6. 5/6-head simple scenario expansion was already rejected in earlier counterfactual work; not repeated.

## Conclusion
No generation-broadening rule tested here satisfies the adoption standard. Production main remains unchanged. Next analysis target is the 84 misses where the exact winning ticket already exists in formal AI Core formations but practical selection still does not purchase it.
