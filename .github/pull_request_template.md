## Summary

<!-- Describe the user-facing or operational change. -->

## Verification

- [ ] Relevant tests pass.
- [ ] Typecheck, lint, and production build pass.
- [ ] Database migration is reviewed and tested on a clean database (if applicable).
- [ ] Documentation and release configuration are updated.

## Security and operations

- [ ] Tenant ownership and authorization are enforced server-side.
- [ ] No secrets, real customer data, or unverified provider claims are included.
- [ ] External side effects remain disabled unless provider authorization and reconciliation are verified.
- [ ] Failure, retry, and rollback behavior has been reviewed.
