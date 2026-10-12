# Contributing

## Development setup

Follow the reproducible local setup in [README.md](./README.md). Keep credentials in an ignored local environment file or approved secret manager. Never use production customer records or provider credentials in local tests.

## Change requirements

- Keep API reads and writes tenant-scoped and authorize every operation on the server.
- Add a reviewed Prisma migration for schema changes; do not use schema push in a deployed environment.
- Treat provider actions as external side effects: require owner authorization, idempotency, explicit failure handling, and reconciliation for uncertain outcomes.
- Add or update focused tests for behavior and security boundaries.
- Update user and operations documentation when supported behavior or launch requirements change.

## Before opening a pull request

Run:

```bash
npm test
npm run db:validate
npm run typecheck
npm run lint
npm run build
```

Use a descriptive commit message and include the reason for behavior changes, operational consequences, migration notes, and verification evidence in the pull request.
