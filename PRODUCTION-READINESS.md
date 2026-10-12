# F-Commerce OS production-readiness plan

**Assessment date: 12 October 2026.** This is a delivery plan for the intended product, not a claim that it is deployed, certified, or connected to live merchants.

## Product direction

Build a multi-tenant operations SaaS for Bangladesh social-commerce merchants: each merchant manages its own people, products, orders, customer conversations, payment review, and fulfillment. Start with one independently useful product: merchant workspaces, catalog, order/inventory operations, and a safe unified inbox. Add external channels only after account-owner authorization, platform review, and end-to-end verification.

The application may connect a customer's existing Facebook Page, Instagram professional account, or WhatsApp Business Account after the required provider authorization. It cannot create those accounts for a customer, bypass Meta review, or claim a connection because a form was completed. A customer creates and owns those provider accounts; the product requests explicitly granted access.

## Repository assessment

### Foundations that exist

- Next.js/React/TypeScript application, PostgreSQL/Prisma data model, tenant memberships and role checks, email/password Better Auth, merchant workspace setup, and tenant-scoped operational APIs.
- Transactional order/inventory handling, payment review, private proof-storage interfaces, courier adapters, audit events, API rate limiting, idempotency records, a durable database outbox, and a protected job endpoint.
- A Meta webhook handler that verifies the raw-body HMAC, deduplicates provider events, persists before processing, and records unmapped events without assigning them to a tenant.
- An authenticated Meta access-token connection endpoint that validates token/app/account/permission before encrypting and saving it. This is **manual token onboarding**, not a customer-facing OAuth or WhatsApp Embedded Signup flow.
- A generated first-install Prisma migration and a CI workflow that exercises migrations on a clean PostgreSQL service.

These source-code foundations do not establish operational readiness. Code, successful compilation, a green test suite, provider credentials, provider approval, production infrastructure, and a deployed/verified service are separate things.

### Known gaps that block a production SaaS launch

- This workspace has no production database URL, domain, email sender, object-store credentials, provider credentials, or hosting configuration. Local Docker services are not the production database.
- Public signup is disabled unless `ALLOW_PUBLIC_SIGNUP=true` and Resend email delivery is configured. Email verification and time-limited password recovery are implemented, but invitation lifecycle, MFA, account deletion, and security/session management remain incomplete. Do not turn on unrestricted production registration until the remaining controls and abuse protections are in place.
- Meta authorization is not OAuth/Embedded Signup. The UI asks an operator for an access token and account ID; this is unsuitable as the final onboarding experience for a commercial multi-tenant integration.
- Meta webhook/API access, Page subscriptions, WhatsApp templates and opt-in enforcement, token expiry/reauthorization, disconnect/data deletion, and real send/receive reconciliation still require provider-approved end-to-end tests. Environment variables alone do not prove connectivity.
- The Daraz Open Platform exists, but this assessment did not establish official Bangladesh seller eligibility, API scopes, or live-access terms. No marketplace adapter or production entitlement should be advertised until the marketplace confirms them.
- The payment/courier implementations are adapter foundations. Provider contracts, merchant account approval, real settlement/booking reconciliation, live sandbox/production testing, and operational exception handling remain required.
- No privacy notice, customer data-retention/deletion schedule, data-processing terms, incident-response commitments, verified Bangladesh legal assessment, or production recovery objectives are evidenced here.
- The database has a first-install migration. Any database previously created with `prisma db push` must be carefully compared and baselined before `prisma migrate deploy`; never apply the initial migration to an existing populated database without a reviewed baseline.

## Delivery sequence and exit criteria

### 0. Secure and reproducible engineering baseline

**Status: implemented in the repository; hosting ownership and a clean CI release remain external gates.**

- Keep local PostgreSQL/Redis bound to loopback, require non-empty local passwords, and require Redis authentication. Never copy development credentials into production.
- Treat schema evolution as checked-in migrations. The initial migration is intended for a new, empty database.
- Require lockfile-based dependency installation, clean PostgreSQL migration deployment, tests, type checks, lint, and a production build in CI.
- Serve only the authenticated server-backed product; do not include a browser-only storefront or synthetic business data.

**Exit:** a clean CI run provisions PostgreSQL, applies all committed migrations, and builds both deployment images; local instructions work from a new clone without an exposed unauthenticated database or cache.

### 1. Account security and onboarding

- Configure Resend with an owner-controlled verified sending domain, then test verified signup, verification resend/expiry, forgot/reset password, delivery failure, token expiry/replay, and email enumeration behavior against that account.
- Decide whether the initial release is invite-only or public. Public registration requires verified email, registration throttling, abuse controls, terms/privacy consent capture, and monitoring. Bootstrap the first owner using a controlled process rather than an unbounded signup switch.
- Add account deletion, session/device revocation, password-change security, and multi-factor authentication or a documented risk-based alternative. Test role changes and tenant isolation across every workspace and file/message route.
- Complete staff invitation, acceptance/expiry, revocation, last-owner protections, and auditable role management.
- Review session lifetime, CSRF/origin handling, proxy/IP assumptions, secret rotation, dependency vulnerability workflow, and production logging/redaction. Exercise denial paths and recovery.

**Exit:** an independent test operator can register/invite, verify email, sign in/out, recover access, revoke sessions, and verify that every role and tenant boundary behaves correctly.

### 2. Data, privacy, and operational foundations

- Select managed PostgreSQL, production connection-pool settings, region, encryption/backups, point-in-time recovery, restore tests, migration/rollback policy, and named owners. Set and test RPO/RTO targets.
- Add schema constraints and migration review tests for financial/inventory invariants and tenant-scoped relationships; include database-backed integration tests for concurrent order creation, duplicate webhooks, retry/idempotency, and job recovery.
- Implement auditable customer-data export, correction, disconnect, retention, and deletion workflows. Define retention by data type and delete provider tokens/data on disconnect where required. Keep a record of consent and opt-out where messaging requires it.
- Choose a private object-storage provider, encryption/key policy, upload scanning and file retention, signed-link lifetime, backup lifecycle, and a restore test. Never expose a public proof URL.
- Write incident response, support escalation, backup/restore, provider outage, payment mismatch, duplicate-send, and queue-dead-letter runbooks.
- Add structured request/job IDs and redacted operational logs, error/uptime alerting, database/queue/webhook metrics, dashboards, dependency monitoring, and operational alerts. Health checks must distinguish liveness from dependency readiness and never reveal secrets.
- Have qualified counsel review applicable Bangladesh privacy, consumer/e-commerce, tax, cross-border transfer, payment, and contractual obligations before accepting real customer data. This research is not legal advice and did not establish current Bangladeshi statutory requirements or retention deadlines.

**Exit:** a clean production-like environment can restore from backup, meet agreed recovery targets, honor a verified deletion/export request, and alert an operator when database, webhook, queue, or provider work is failing.

### 3. Meta customer-authorized integrations — recommended first external integration

- Register the product owner's Meta developer app and business; select and document the supported login/onboarding path per product. Request only necessary permissions and complete Business Verification and App Review/advanced access for serving external merchants.
- Replace manual token entry with the correct OAuth and account-selection flow. Use one-time, expiring, server-verified `state`, exact redirect URI allowlists, CSRF protection, least-privilege scopes, secure token exchange, encrypted storage, account ownership validation, webhook subscriptions, and a customer-visible disconnect/reauthorization action.
- Treat Instagram Login and Facebook Login as distinct supported configurations: their account requirements and permission names differ. Restrict Instagram messaging to eligible professional accounts.
- Implement WhatsApp customer onboarding with the approved Meta Embedded Signup/business integration flow, WABA and phone-number selection, messaging and management permissions, opt-in evidence, approved templates, and customer-service-window/template policy checks. Do not allow arbitrary free-form sends outside the provider's allowed window.
- Implement page/WABA/Instagram subscription checks and callback confirmation, dedupe/replay protection, delivery/read/failure webhooks, access-token expiry handling, rate limits, and explicit handling for revoked permissions/account disconnect.
- Verify Meta's current policy and retention/data-deletion terms at launch. Keep a human escalation path. Exercise real inbound, reply within policy, duplicate event, disabled permission, expired token, retry, unknown-delivery, and unsubscribe behavior in an approved app environment before any live claim.

**Exit:** Meta has approved the relevant external-customer access, and an independently owned test merchant can connect, receive, reply within policy, disconnect, and verify data/token handling. Test accounts and app-role users alone do not satisfy this gate.

### 4. Payments, shipping, marketplaces, and AI

- For each MFS/bank/courier provider, obtain the merchant contract, supported country/account, official API specification, sandbox credentials, webhook verification method, refund/return/reconciliation process, rate limits, and production approval. Test against the provider sandbox and reconcile provider records before enabling live status transitions.
- Keep screenshots/OCR as review evidence only; never call them proof of settlement. Ensure retries cannot silently duplicate a transfer or booking.
- Research Daraz (and any other named marketplace) directly with its official partner/seller portal. Obtain written confirmation of Bangladesh access, listing/order/stock APIs, app review, seller authorization, quotas, and terms. Add an adapter only for verified capabilities; do not promise integration based on a portal landing page.
- If AI drafting is enabled, disclose data sent to the model provider, obtain merchant configuration/consent, minimize/redact input, review provider retention/training terms, enforce a budget/timeout, and keep human approval/escalation for customer-facing actions. Never let the model approve payments, alter stock, or dispatch orders.
- Verify every provider's exact live/test mode and credentials in a sandbox; a saved configuration must never render as connected until a signed/provider-verified response confirms it.

**Exit:** each activated provider passes documented sandbox and production smoke tests, duplicate/retry tests, human escalation/reconciliation, operational alerting, and opt-out/disconnect tests.

### 5. Launch and commercialization gate

- Choose hosting, data region, domain/DNS/TLS, secret manager, email, object storage, database, worker/scheduler, and support/incident owner. Publish privacy notice, terms, service status/support channels, subprocessor list, data processing terms, pricing, onboarding, and a support/SLA boundary consistent with actual monitoring and recovery.
- Run external penetration testing and an independent code/configuration review. Exercise accessibility, localization (Bangla and English), mobile, browser, and realistic merchant-scale performance. Resolve findings before onboarding production merchants.
- Maintain separate development, staging, and production accounts/projects/secrets/data; test staging against provider sandboxes; prevent test accounts and fake provider success in production.
- Record accepted launch scope and excluded integrations, data regions, recovery objectives, support hours, provider contracts/approvals, unresolved risks, and a named party accepting each risk.

**Exit:** production release owner signs evidence for all above gates; the actual HTTPS production URL, database readiness, email delivery, backups, alerts, and every advertised integration have been tested by someone other than the implementer.

## Official provider research

Research performed 12 October 2026. Policies and APIs change: recheck the provider's current documentation and app dashboard before implementing or launching. The findings below distinguish published platform requirements from unverified local availability.

- **Messenger / Pages:** use a Page access token and relevant Page permissions; connect the app to the Page and subscribe webhooks. Meta limits customer-data access for external businesses through app review/advanced access and business verification. [Messenger overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview), [webhooks](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks), [App Review](https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review), [Business Verification](https://developers.facebook.com/documentation/development/release/business-verification).
- **Instagram:** messaging requires an eligible professional account. Instagram Login and Facebook Login are different API paths with different scopes and account-linking requirements; standard access is not equivalent to approval for external customers. [Instagram Messaging API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api).
- **WhatsApp:** customer onboarding for a software provider is different from connecting the developer's own test account. Meta documents a Tech Provider/business integration route, permissions, opt-in, 24-hour service window, and approved message templates outside that window. Bangladesh appears in Meta's rate-card updates effective 1 October 2026; that alone does not prove all local account/feature eligibility or a billing/settlement rule. [Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started), [permissions](https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions), [access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens), [opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in), [templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview), [pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [business policy](https://whatsappbusiness.com/policy/).
- **Marketplaces:** the [Daraz Open Platform](https://open.daraz.com/) portal exists. This research did not verify Bangladesh seller eligibility, supported API operations, access approval, or a current official integration contract; those points remain **unverified**, not assumed available.
- **Law and retention:** platform policies require appropriate notice/consent and limit the use of platform-derived messaging data. This research did not verify the complete current Bangladesh statutory duties, numerical retention periods, localization requirements, or breach-notification deadlines. Obtain current local legal review rather than treating the platform policy as a complete compliance assessment.

## Decisions to make when external accounts are available

1. Choose a deployment host, region, domain, managed PostgreSQL plan, email provider/sending domain, private object store, and an accountable support/recovery owner.
2. Decide invite-only versus verified public signup, merchant pricing/terms, data-retention defaults, supported launch platforms, and human escalation expectations.
3. Have the product owner create/control the Meta business/developer app and complete the required verification/review; a merchant separately connects their own eligible assets.
4. For each MFS, courier, marketplace, and model provider, obtain the product owner's or merchant's official contract and sandbox access before implementation or advertisement.

Do not paste secrets, customer data, payment proof, or provider tokens into issues, chat, source control, or browser-visible variables. Configure production secrets directly in the selected host's secret manager.
