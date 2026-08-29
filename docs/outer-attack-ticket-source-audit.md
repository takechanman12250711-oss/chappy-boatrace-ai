# Outer attack ticket source audit

Purpose: determine whether the 12 discovery races matching the fixed outer-attack signal retain historical exact-ticket data outside `formations`.

Rules:
- Discovery only.
- Holdout unused.
- Production prediction and ticket logic unchanged.
- Recursively inspect the original canonical saved prediction record rather than regenerating tickets with the current model.
- Treat any discovered historical ticket path as an audit source only until its semantics are verified.
