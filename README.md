# New Raj Fashion & Raj Saree Showroom

A responsive e-commerce application for New Raj Fashion and Raj Saree Showroom, Gandhi Chowk, Sidhi, Madhya Pradesh 486661. The app is built with Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL, Prisma and server-side sessions. Business contact details, prices, stock, reviews and payment credentials are not fabricated.

## What works

- Public storefront, category and collection pages, product details, search, responsive navigation, light/dark themes, policies and a newsletter subscription form.
- Customer registration, password and OTP sign-in, shared phone/email identity selection, password reset, Google OAuth, authenticator MFA, one-time recovery codes, profile and address management, wishlist, order history, order tracking and session revocation.
- Database-backed cart, coupon application, server-side pricing, delivery/tax settings, variant stock reservations, COD and Razorpay checkout, payment verification and signed, idempotent webhooks.
- Customer cancellation and return requests; Owner/Staff fulfilment transitions; Owner Razorpay refund initiation, refund webhook updates and provider status checks.
- Manual carrier and tracking-number entry for shipments; customers see tracking details on their order page. Shipment updates and payment/refund events create persisted customer notifications.
- Separate Staff and Owner portals. Server authorization protects every management API. Staff grants are limited to operational permissions; only the Owner can change catalogue data or global settings.
- Owner product, image, variant/inventory, category, promotion, banner, staff, order, payment, refund, customer, report, settings, support inbox, review moderation and audit-log screens. Image files are validated, resized and converted to WebP before they are saved to S3-compatible storage.
- Owner CSV catalog import/export (imports create products only), order/sales export, optional inventory cost and valuation, configurable tax/delivery and invoice details, and downloadable PDF invoices.
- Staff invitation links with verified identity acceptance, customer communication preferences, verified-purchase reviews, and owner-authorized staff stock counts with audit records.
- PostgreSQL schema, committed migrations, non-public seed data, one-time Owner bootstrap, focused unit tests and Playwright smoke tests.

Seed data contains only roles, permissions, taxonomy, home sections, a wedding collection and the verified store address. It does not create a demo Owner, customer, product, price, stock, discount or review.

## Requirements

- Node.js 20.6 or later and npm (the seed/bootstrap commands use Node's `--env-file` support).
- PostgreSQL 15 or later. Docker Desktop is the easiest local setup.
- S3-compatible storage for product image uploads. The included Compose file starts PostgreSQL and RustFS (a local S3-compatible service).
- Optional configured services: Razorpay, an SMTP provider, an SMS provider, Google OAuth and a production S3-compatible bucket.

## Local setup

1. In PowerShell, copy `.env.example` to `.env` with `Copy-Item .env.example .env`. Set a private `AUTH_SECRET` of at least 16 characters and set `S3_ACCESS_KEY` / `S3_SECRET_KEY` to local storage credentials (the Compose fallback values are `rajfashiondev` / `rajfashion-local-secret-2026`). For provider-free local sign-up and sign-in, set `AUTH_DEV_OTP_ENABLED=true` and `AUTH_DEV_OTP_CODE=123456`; this is development-only and must not be used in production. Keep `.env` out of source control.
2. Start PostgreSQL and RustFS: `npm run db:up`.
3. Install packages and generate Prisma Client: `npm install` (the install hook also generates the client) or `npm run db:generate`.
4. Apply all committed migrations: `npm run db:deploy`.
5. Seed initial roles, permissions, categories, homepage sections and store address: `npm run db:seed`.
6. In the RustFS console at `http://localhost:19001`, sign in with `S3_ACCESS_KEY` and `S3_SECRET_KEY`, create the bucket named by `S3_BUCKET` (default `new-raj-fashion`), configure read access for product objects, and set `S3_PUBLIC_URL` to `http://localhost:19000/new-raj-fashion`. Compose publishes the S3 API on host port `19000` and the console on `19001`; the container listens on `9000` and `9001`. The Compose fallback credentials are for local development only; replace them outside local development.
7. Create the first Owner once. Set `OWNER_BOOTSTRAP_TOKEN` and `OWNER_BOOTSTRAP_TOKEN_CONFIRM` to the same random value of 32+ characters, set `OWNER_BOOTSTRAP_CONFIRM=CREATE_OWNER`, and set `OWNER_BOOTSTRAP_USERNAME` and `OWNER_BOOTSTRAP_PASSWORD` (10+ characters). Then run `npm run bootstrap:owner`. The password is never printed. Clear the bootstrap values after the Owner account is created.
8. Start the app with `npm run dev` and open `http://localhost:3000`.

If Docker Desktop is unavailable, point `DATABASE_URL` at a running PostgreSQL service and configure an S3-compatible bucket yourself. The application does not start its own database process.

## Optional provider configuration

### OTP delivery

Configure SMTP in `SMTP_*` for email and a supported SMS provider in `SMS_*` or `TWILIO_*` for phone verification. With no delivery provider, real OTP messages cannot be delivered. For local-only development, `AUTH_DEV_OTP_ENABLED=true` exposes the test code in the response; this bypass is disabled by default and must never be enabled in production.

### Google sign-in

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register `${APP_URL}/api/auth/oauth/google/callback` as an authorized redirect URI. The callback validates the Google signature, issuer, audience, expiry and nonce; the flow also binds state and PKCE. Google accounts are identified by the provider subject and are not linked by matching email.

### Razorpay payments and refunds

Set the Razorpay key ID, key secret and webhook secret on the server. The Owner must enable a payment method in Store Settings. Razorpay Checkout sends its callback to a server endpoint that verifies the signature and provider payment details. The UI does not treat a client-side success event as proof of payment. Configure the Razorpay webhook endpoint at `/api/payments/razorpay/webhook` with the same webhook secret and payment/refund events used by the application. Until configured, online checkout and provider refunds remain unavailable; COD starts disabled.

### Production storage and deployment

Set the S3 endpoint, region, bucket, server credentials and public URL or CDN URL. Keep image objects read-only to the public and uploads owner-only through the application. Set `APP_URL` to the production HTTPS origin. Use managed PostgreSQL, HTTPS, backups, secret management, monitoring and a shared rate-limit store before launch.

## Commands

- `npm run dev` — local development server.
- `npm run build` / `npm start` — production build and server.
- `npm run typecheck` — TypeScript validation.
- `npm run lint` — ESLint.
- `npm test` — Vitest unit tests.
- `npm run test:e2e` — Playwright smoke tests; Playwright starts the development server automatically.
- `npm run db:generate` — regenerate Prisma Client after schema changes.
- `npm run db:deploy` — apply committed migrations.
- `npm run db:seed` — seed safe role, taxonomy and store configuration.

The unit suite covers authorization resolution, order transition rules, account validation, INR/identifier formatting, TOTP verification, Google token validation, CSV safety, checkout allocation and invoice PDF structure. The Playwright suite covers the unauthenticated shopkeeper entry point, anonymous Owner API rejection and a mobile viewport smoke check. It does not yet cover a complete customer purchase, database-backed account journeys or live payment-provider behavior.

## Remaining work before production

- Configure real provider accounts and credentials, then perform end-to-end tests in Razorpay test mode and verify webhook/refund reconciliation with the merchant account.
- Add full database-backed integration and browser journey coverage for shared-identity OTP login, inventory concurrency, coupons, checkout, cancellation, returns, refunds, staff permissions and Owner flows.
- Carrier API integrations, support conversations/attachments and SLA tooling, and scheduled marketing campaigns are not included. Shipment status and tracking number are maintained manually; the support inbox stores requests, status and private staff notes.
- Store policies, tax configuration, shipping rules, catalogue, images, prices, availability, contact details, opening hours, logo and payment settings require the Owner’s actual business information.
- Configure deployment/CI, production database backups, monitoring, dependency/security review, distributed rate limiting and storage access policies.

Do not accept live payments until provider credentials, payment webhooks, refund reconciliation, store policies and a complete purchase journey have been tested in the target environment.
