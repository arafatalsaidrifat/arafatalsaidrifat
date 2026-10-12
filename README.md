# F-Commerce OS — phased commerce operations platform

F-Commerce OS is an operations workspace for Bangladesh social-commerce merchants. It brings customers, Messenger/Instagram/WhatsApp conversations, catalog/inventory, orders, manual/provider payment review, courier shipments, analytics, and an FAQ-grounded AI drafting workflow into one place. The platform defaults to BDT and `Asia/Dhaka`.

This repository contains both the original browser-only exploration (`index.html`, `public/demo.html`) and a server-backed Next.js application (`src/`, `prisma/`). The demo is useful for product walkthroughs; the authenticated application is the foundation for connecting real provider accounts. Live external services are never inferred from sample records or configuration fields.

## What's implemented in this repository

### Phase 1 — Operations workspace

- Responsive authenticated merchant dashboard and navigation for overview, inbox, orders, products/inventory, customers, payments, shipments, analytics, AI, integrations, settings, and audit history.
- PostgreSQL/Prisma entities for users and sessions, merchants/memberships, channel connections, customers, conversations/messages, products/variants, stock movements, orders/items, payments/proof metadata, shipments, integration status, webhook events, AI policy/FAQ/reviews, audit records, idempotency keys and outbox jobs.
- Order creation computes money in integer poisha, validates same-merchant references and product stock, decrements inventory in a database transaction, creates a payment record and requires an `Idempotency-Key`.
- Order status transitions are guarded; cancellation restores stock transactionally; marking as shipped requires a shipment booking.
- Team membership and every tenant-aware API use server-verified session + merchant membership. This application does **not** depend on a client-provided merchant ID as authorization.
- Optional repeatable demo seed for an existing authenticated user. Seeded merchant, conversations, payment references and tracking values are clearly labelled demo and provider accounts remain disconnected.

### Phase 2 — Meta channels

- `GET/POST /api/webhooks/meta` supports Meta verification challenge and validates `X-Hub-Signature-256` against the exact raw body using constant-time comparison.
- External message IDs are deduplicated, events are persisted before processing, and processing/send work is placed in a database outbox. Connected accounts are matched by provider account ID and merchant; unmapped events are recorded but never routed to a tenant.
- Outbound Messenger/Instagram/WhatsApp sends require a configured connected channel, server-side encrypted token and valid graph API version. Message sends use a queue/outbox with retries; a local/demo status does not imply a provider send.

### Phase 3 — AI support workflow

- LangGraph runs retrieval → safety gate → draft → human handoff. Retrieval uses the current merchant's enabled FAQs and policies only.
- The model call happens on the server, uses a bounded prompt and JSON response, sets a timeout, and contains no automatic tool execution.
- Escalation topics and low confidence require human review. If no LLM key is available the app uses a verified-FAQ-only fallback, still obeying the merchant's minimum confidence threshold. Draft approval does not silently send; an explicit reviewer action enqueues sending and the connected-channel worker handles delivery.

### Phase 4 — MFS review

- Payment methods include bKash, Nagad, Rocket, COD and other configured methods. A proof image/PDF upload is size-limited, MIME-checked and signature-checked, hashed, and stored under a private S3-compatible bucket path with server-side encryption.
- Proof download issues a short-lived signed URL after tenant authorization. OCR is an explicitly assistive review step and stores an AI review; OCR **does not verify a transaction**.
- Duplicate transaction references are checked within a merchant and backed by a database unique constraint. Manual review is audited. A bKash verification adapter is provided; Nagad/Rocket are fail-closed pending the appropriate official merchant contract/credentials and a verified provider protocol.

### Phase 5 — Courier adapters

- Pathao, Steadfast and Shiprocket adapter boundaries and create/refresh actions are included. Provider credentials remain server-side.
- Booking has a database state lock, avoids re-booking known active shipments and records adapter outcome/audit data. Pathao requires a configured destination city/zone/optional area map sourced from the merchant's current courier account; guessed destination IDs are not used. Shiprocket live booking is disabled unless explicitly opted into and configured, since account/country support must be confirmed.
- Starter shipping defaults are illustrative: ৳80 inside Dhaka, ৳150 outside. Replace them with merchant settings and current courier quotations before using real orders.

### Phase 6 — safety and operations foundations

- Secure cookie session configuration, server role gates, tenant-scoped data lookups, Zod validation, server-only secrets, AES-256-GCM token encryption, payment-proof private storage, database-shared fixed-window rate limiting with production fail-closed behavior, append-only-style audit entries, idempotency constraints, durable DB outbox, retry/backoff, cron secret, HTTPS-only production provider endpoints, security headers, and fail-closed behavior for absent credentials.
- Tests cover commerce math, legal state transitions, HMAC verification, verify-token checks, replay keys, BD phone validation, and tenant scoping architecture.
- Redis/BullMQ is optional for the separate worker; the database outbox and protected scheduled worker endpoint remain available when Redis is not configured.

## Architecture

- **UI:** Next.js App Router, React, TypeScript, responsive CSS.
- **Identity:** Better Auth email/password and PostgreSQL-backed sessions.
- **Database:** PostgreSQL with Prisma schema.
- **Async work:** transactional outbox in PostgreSQL; optional Redis/BullMQ worker. `/api/internal/worker` requires a long random `CRON_SECRET` and is scheduled by `vercel.json` only when deployed on a platform that supports that cron configuration.
- **AI:** LangGraph JS with merchant FAQ/policy grounding and a server-side OpenAI-compatible chat endpoint.
- **Uploads:** private S3-compatible storage (for example, a private bucket from a supported provider), not public assets.
- **Integrations:** server-side adapters for Meta messaging/webhooks, bKash transaction lookup, Pathao, Steadfast, Shiprocket and an optional OCR service.

## Run locally

Requirements: Node.js 20.9+ (Node 22 LTS recommended), npm, and Docker Compose. The package registry must be reachable to install dependencies.

1. **Install and start dependencies:**

   ```bash
   npm install
   cp .env.example .env
   docker compose up -d postgres redis
   ```

2. **Generate secrets** (keep them out of Git and browser-side env vars):

   ```bash
   openssl rand -base64 32  # use as BETTER_AUTH_SECRET
   openssl rand -hex 32     # use as TOKEN_ENCRYPTION_KEY (64 hex characters)
   openssl rand -base64 36  # use as CRON_SECRET
   ```

   Update `.env` with `DATABASE_URL`, `BETTER_AUTH_URL=http://localhost:3000`, `APP_URL=http://localhost:3000`, secrets, and `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000`. `ALLOW_PUBLIC_SIGNUP=true` is intended only for a controlled initial setup. Use a long password and turn off open registration once the first owner account exists.

3. **Install schema and run the application:**

   ```bash
   npm run db:validate
   npm run db:generate
   npm run db:push
   npm run dev
   ```

   Open `http://localhost:3000` and create the first user. For production, generate and review a migration in a controlled development database with `npm run db:migrate:init`, commit the resulting `prisma/migrations/` files, and apply them in production with `npm run db:migrate:deploy`. Do not use casual schema pushes against production.

4. **Seed a separate demo workspace (optional):**

   After registering the intended owner, add `DEMO_OWNER_EMAIL=the-registered-email@example.com` to `.env`, then run `npm run db:seed`. The script never creates a predictable-password user; it attaches a clearly marked demo workspace to an existing user. Seed records use `DEMO-*` reference/tracking values, and no provider request is made.

5. **Run checks:**

   ```bash
   npm test
   npm run db:validate
   npm run typecheck
   npm run lint
   npm run build
   ```

   `npm run worker` starts the optional BullMQ worker after Redis is configured. Without Redis, invoke the protected `/api/internal/worker` using the deployment's secret scheduler.

## Environment variables and integrations

All secrets are server environment variables. Never commit `.env`, paste provider credentials into issues, expose secrets as `NEXT_PUBLIC_*`, or log access tokens/secret fields.

| Variable group | Required values | Notes |
|---|---|---|
| Core database/auth | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `TOKEN_ENCRYPTION_KEY` | The app deliberately returns setup/503 responses until auth/database configuration exists. Set trusted origins. |
| Worker | `REDIS_URL` (optional), `CRON_SECRET` | Redis/BullMQ can accelerate worker handling; DB outbox persistence remains the fallback. |
| Meta | `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_API_VERSION`, supported app/page/business credentials | App review, correct scopes, provider subscription, webhook verification, and end-to-end smoke testing are still required. Connect access tokens via the authenticated Integrations page; stored values are encrypted. |
| LLM | `OPENAI_API_KEY`, optional `OPENAI_MODEL`, optional `OPENAI_BASE_URL` | The AI agent is a draft/review workflow, not an autonomous order/payment authority. Review provider privacy and retention terms. |
| Payment proof/OCR | S3 `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; optional `OCR_API_URL`/`OCR_API_KEY` | The S3 bucket must remain private. OCR is for human review only. |
| bKash | `BKASH_API_BASE_URL`, `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` | Requires an approved merchant API contract and correct environment/base URL. Validate a known transaction before production use. |
| Nagad/Rocket | `NAGAD_*`, `ROCKET_*` | The current routes fail closed until a supported, verified merchant API integration is implemented. Variables alone do not imply support or verification. |
| Pathao | `PATHAO_API_BASE_URL`, `PATHAO_CLIENT_ID`, `PATHAO_CLIENT_SECRET`, `PATHAO_USERNAME`, `PATHAO_PASSWORD`, `PATHAO_STORE_ID`, `PATHAO_LOCATION_MAP_JSON` | Confirm the current account API, store and live destination city/zone/area IDs before booking. |
| Steadfast | `STEADFAST_API_BASE_URL`, `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY` | Confirm current credential pair, request fields, COD semantics and service area on a test order first. |
| Shiprocket | `SHIPROCKET_API_BASE_URL`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_LIVE_BOOKING_ENABLED`, country/pickup/pincode settings | Live booking is explicitly disabled by default. Confirm eligible account/country coverage and test with provider sandbox before enabling. |

## Security and go-live checklist

This is a strong engineering foundation, not a certification or a claim that your provider accounts are active. Before using real orders:

- Before production, install dependencies and commit the generated `package-lock.json`; then run `npm test`, `npm run db:validate`, `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm run build`, and a clean deployment build against that lockfile. This environment could not generate the lockfile because registry access timed out, so the packaged source intentionally does not claim a pinned dependency resolution.
- Disable public self-registration or restrict it to invited users; configure email delivery and account recovery if needed; enable MFA/SSO at the appropriate tier.
- Configure a production PostgreSQL cluster with backups/restore drills, TLS, least-privilege credentials, reviewed migrations and connection pooling appropriate to the hosting environment.
- Configure private object storage lifecycle/retention and test signed URL access, tenant-bound object paths and deletion requests.
- The authenticated API currently uses a shared PostgreSQL fixed-window limiter (`RateLimitBucket`) and fails closed if it cannot reach the database. Review thresholds and add edge/WAF protection against volumetric abuse before launch; development alone may fall back to a process-local counter.
- Review authorization/tenant-isolation cases in staging for all IDs and all roles; test cross-tenant IDs, webhook routing, duplicate/replayed events, concurrent stock updates, idempotent retries and queue failure recovery.
- Verify live Meta permissions and messaging windows; run known bKash verification cases; get official Nagad/Rocket API documentation and contracts; confirm courier account permissions, geography, rate, COD and return status mappings.
- Add monitoring/alerts, log redaction, error tracking, request IDs, security contact and incident runbooks. Establish PII/payment proof retention periods and privacy terms for AI processing.
- Verify Accessibility (keyboard, screen reader, contrast) and production pages on real desktop/mobile browsers. The API smoke checks are not a substitute for full E2E browser tests or a third-party security review.

## API map

| Route | Purpose |
|---|---|
| `/api/auth/[...all]` | Better Auth session and account endpoints (disabled until configured) |
| `/api/merchants`, `/api/merchants/:id`, `/api/merchants/:id/members` | Merchant setup, workspace settings, owner/admin-controlled memberships |
| `/api/dashboard`, `/api/orders`, `/api/products`, `/api/customers`, `/api/conversations`, `/api/payments`, `/api/shipments`, `/api/analytics`, `/api/audit` | Tenant-scoped operations APIs |
| `/api/conversations/:id/messages` | Idempotent persisted reply/note; outbound customer message queued only for connected live channel |
| `/api/conversations/:id/messages/:messageId/reconcile` | Owner/admin-only manual reconciliation of uncertain Meta send outcomes; retries require explicit confirmation that delivery did not occur |
| `/api/payments/:id/proof` and subroutes | Private proof upload, signed download, OCR review and manual/provider status review |
| `/api/ai/policy`, `/api/ai/faqs`, `/api/ai/reply`, `/api/ai/reviews` | Configure grounding policy, draft replies, manage human review and approve/queue sends |
| `/api/integrations` and `/api/integrations/:provider/*` | Honest integration status/config checks and secure Meta token connection |
| `/api/webhooks/meta` | Public but HMAC-verified Meta webhook ingress and verification challenge |
| `/api/internal/worker` | Protected scheduled processing of pending outbox jobs |
| `/api/health` | Dependency health response; does not expose secrets |

## Roadmap status

All six roadmap phases now have code foundations in this repository. Provider activation and operational readiness are separate: no credentials were supplied here, so real Meta, payment, OCR, courier and LLM connectivity still requires configuration and end-to-end verification. Remaining go-live gates are called out above rather than replaced with fake success states.
