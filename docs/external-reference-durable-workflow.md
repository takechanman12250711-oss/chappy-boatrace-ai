# Durable external-reference research

This workflow is the Work-like durable orchestration layer for the already-approved three-source plan.

Flow:
1. Hiyori public collector
2. Macour public collector
3. BR public collector
4. durable wait
5. official-result settlement and A/B report

The workflow never changes prediction logic. Each collector must write only the immutable `external-reference-v1` contract and keep `usableForPrediction=false`.

Required production environment variables:
- `EXTERNAL_REFERENCE_COLLECTOR_URL`
- `EXTERNAL_REFERENCE_SETTLEMENT_URL`

Until those endpoints are configured, the durable run reports `collector_not_configured` / `settlement_not_configured` rather than pretending collection succeeded.
