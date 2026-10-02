# Main data writer concurrency

Workflows that write generated data to `main` share the `chappy-main-data-writers` concurrency group. Every workflow in that group must set `queue: max` and `cancel-in-progress: false`.

Mixing the default single-pending queue with `queue: max` can replace an older waiting writer when several follow-up workflows start together. The shared invariant keeps pending writers queued while retaining serialization; it does not identify any one workflow as the proven source of a past cancellation.
