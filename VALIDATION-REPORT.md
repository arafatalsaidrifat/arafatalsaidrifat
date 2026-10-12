# F-Commerce OS release validation

**Checked:** 12 October 2026
**Scope:** current repository state in this workspace

## Checks completed

- `npm run verify`: **31 tests passed**, Prisma schema validation passed, TypeScript passed, ESLint passed, and the optimized Next.js production build passed.
- The committed initial Prisma migration applied successfully to a new isolated PostgreSQL database and created 27 tables. Existing databases were not changed.
- `npm ci` completed inside the production-image build. Both the migration and standalone web container targets built successfully.
- The production web image was started as a non-root user on loopback against an isolated PostgreSQL database. The live HTTP checks returned database readiness **200**, sign-in page **200**, password recovery page **200**, and rejected registration while account-email setup was absent. The production Content Security Policy also permits only the external font hosts used by the stylesheet.
- Docker Compose configuration parsed successfully when temporary required development passwords were supplied.
- No application server or temporary database used for these checks was left running.

## Production launch is not complete

This workspace has no production `DATABASE_URL`, authentication/encryption secrets, domain, hosting project, verified email sender or Resend key, private object storage account, monitoring, or provider credentials. The container is a deployable artifact; it is not an internet-hosted service. Email delivery and provider onboarding were not exercised against owner-controlled accounts.

Email verification and password recovery have code paths, but invitation lifecycle, MFA, account deletion, broad production abuse controls, privacy/retention operations, backups/restore drills, alerting, and independent security review remain release gates.

Meta OAuth/Embedded Signup and marketplace authorization are not implemented. Provider adapters and configuration do not prove that an external account is connected or that a payment, message, or shipment has been accepted. Do not process real transactions until the owner/provider approvals and end-to-end checks in [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) are complete.

## Existing local services require separate care

The PostgreSQL and Redis containers already running in the shared workspace were observed listening on all host interfaces. The checked-in Compose file now binds new service instances to loopback and requires credentials, but editing Compose does not reconfigure or restart existing containers. They were left untouched to avoid disrupting shared services or persistent data. Before using them, an authorized operator should establish ownership, take and verify backups, rotate credentials, and deliberately recreate them with the restricted configuration.

The checked-in first-install migration targets a new, empty database. A database previously synchronized directly from the Prisma schema must not receive that migration until its schema and migration history have been reviewed and safely baselined.

## Commercial and legal boundary

No deployment, hosting, provider approval, legal compliance, data-protection certification, or production support commitment is claimed. [LICENSE.txt](./LICENSE.txt) grants no open-source license; confirm code ownership, third-party licensing, and distribution rights before commercialization.
