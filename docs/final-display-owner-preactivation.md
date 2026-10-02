# Final display owner preactivation

This branch is based on the latest `main` before activation.

Safety gates before switching the production loader:

1. Preserve approved formation display independently from purchase selection.
   - `12-345-全` remains a 24-point display formation.
   - `4-23-全` remains an 8-point display formation.
   - Practical purchase tickets stay exact and are not expanded by display notation.
2. Keep the new final display owner inactive until preactivation tests pass.
3. Do not delete or bypass the current final display chain before the activation commit.
4. After activation, enforce a single final renderer and verify old competing scripts are no longer loaded.
5. Do not change prediction logic, selection thresholds, ticket generation, or purchase targets as part of this display-owner refactor.
