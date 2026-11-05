# Jamson Wellness Store

A full-stack skincare, haircare, bodycare and wellness storefront built with Next.js App Router, TypeScript, Tailwind CSS, Drizzle ORM and Neon PostgreSQL. The customer portal, admin area and API routes all run in one Next.js application.

## Project structure

```text
Jamson/
├── app/
│   ├── admin/                 # Protected dashboard and admin sections
│   ├── api/                   # Auth, catalog, cart, checkout and admin route handlers
│   ├── cart/ checkout/        # Cart and multi-step checkout
│   ├── login/ signup/         # Account and password recovery pages
│   ├── account/ orders/ profile/ # Customer account, orders and profile pages
│   ├── products/ shop/        # Product detail and listing pages
│   ├── globals.css layout.tsx # Global styling, SEO defaults and shared shell
│   ├── robots.ts sitemap.ts   # Search engine metadata
│   └── page.tsx               # Storefront home page
├── components/                # Storefront, forms, checkout and admin UI
│   └── ui/                    # Reusable shadcn-style primitives
├── db/
│   └── schema.ts              # Normalized PostgreSQL schema
├── drizzle/                   # Generated SQL migrations
├── lib/                       # Auth, database, validation, email and helpers
├── public/images/             # Local product/category illustration fallbacks
├── scripts/seed.ts            # Repeatable sample catalog seed
├── .env                       # Local environment template (ignored by Git)
├── .env.example               # Documented environment variable template
├── drizzle.config.ts
├── proxy.ts                   # CSRF origin check and admin-page sign-in gate
└── package.json
```

## Requirements

- Node.js 20.9 or newer (Node 22 LTS recommended)
- npm
- A Neon PostgreSQL project
- ImageKit and Razorpay credentials for image upload and online payments
- SMTP credentials to enable password reset email delivery

## Setup

1. **Create Neon database credentials.** Create a project at [Neon](https://neon.tech/), open **Connect**, and copy its PostgreSQL connection string. Use the pooled connection string and keep `sslmode=require`.
2. **Configure image uploads.** Create a free [ImageKit](https://imagekit.io/) account and open **Developer options → API keys** in the dashboard. Copy the public key and private key there, and copy the URL endpoint shown for your media library (for example, `https://ik.imagekit.io/your_id`). Paste these into the matching `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, and `IMAGEKIT_URL_ENDPOINT` entries in `.env`. Also set `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` to the same public key and `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` to the same endpoint; these two values are safe for browser use. Never put the private key in a `NEXT_PUBLIC_` variable or expose it to the browser. The upload folder, 5 MB image limit, and 8-image product limit have defaults and can be changed with `IMAGEKIT_UPLOAD_FOLDER`, `MAX_IMAGE_SIZE_MB`, and `MAX_IMAGES_PER_PRODUCT`.
3. **Configure payments.** Create a [Razorpay](https://razorpay.com/) account and obtain the test or live Key ID and Key Secret from **Account & Settings → API Keys**. Add a webhook pointing to `https://YOUR_APP_HOST/api/webhooks/razorpay`, subscribe to `payment.captured`, `payment.failed`, and `refund.processed`, and copy its webhook secret.
4. **Configure email.** Add SMTP host, port, user, password and a verified sender address from your email provider. Password reset requires these values.
5. Copy `.env.example` to `.env` (or use the included `.env` template) and fill in the values:

   ```dotenv
   DATABASE_URL=postgresql://...-pooler...
   DATABASE_URL_UNPOOLED=postgresql://...
   JWT_SECRET=<at-least-32-random-characters>
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   IMAGEKIT_PUBLIC_KEY=
   IMAGEKIT_PRIVATE_KEY=
   IMAGEKIT_URL_ENDPOINT=
   NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY=
   NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=
   IMAGEKIT_UPLOAD_FOLDER=/skincare-store/products
   MAX_IMAGE_SIZE_MB=5
   MAX_IMAGES_PER_PRODUCT=8
   RAZORPAY_KEY_ID=
   RAZORPAY_KEY_SECRET=
   NEXT_PUBLIC_RAZORPAY_KEY_ID=
   RAZORPAY_WEBHOOK_SECRET=
   EMAIL_HOST=
   EMAIL_PORT=587
   EMAIL_USER=
   EMAIL_PASSWORD=
   EMAIL_FROM=
   STORE_NAME=Jamson Wellness
   CURRENCY=INR
   RETURN_WINDOW_DAYS=7
   ```

   Generate `JWT_SECRET` with a secure random generator (for example `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Never commit `.env`; `.gitignore` excludes it. The app reports missing required configuration with a clear message.

6. Install dependencies, create the schema, seed sample products and start the entire app:

   ```bash
   npm install
   npm run db:push
   npm run db:seed
   npm run dev
   ```

   Open `http://localhost:3000`. The seed adds four product categories and twelve sample products. Run `npm run db:push` again after schema changes.

## Database commands

- `npm run db:generate` — generate a versioned SQL migration from the Drizzle schema.
- `npm run db:migrate` — apply generated migrations to the configured database.
- `npm run db:migrate:prod` — apply reviewed migrations using `DATABASE_URL_UNPOOLED` (direct Neon connection); never run automatically during a Vercel build.
- `npm run db:push` — push the current schema directly to Neon (convenient for initial setup).
- `npm run db:seed` — insert or update the sample categories/products and default store settings.

For production, generate and review migrations, apply them manually before deployment with `npm run db:migrate:prod`, then build:

```bash
npm run db:generate
npm run db:migrate:prod
npm run build
```

Vercel uses the pooled `DATABASE_URL` at runtime and runs in Mumbai (`bom1`). Choose the nearest available Neon region, such as Mumbai or Singapore, to minimize database latency. Use `npm run db:seed:prod` for categories and settings only; it does not create sample products. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the complete Vercel setup, environment-variable table, webhook configuration, first-admin SQL and operational checklist.

## Make a regular account an administrator

There is deliberately no admin signup route. Register normally at `/signup`, then run this SQL in the Neon SQL Editor, replacing the email with the account you created:

```sql
WITH promoted AS (
  UPDATE users SET role = 'admin', session_version = session_version + 1
  WHERE email = 'me@example.com' AND role = 'user'
  RETURNING id
)
INSERT INTO audit_logs (actor_user_id, target_user_id, action, old_value, new_value)
SELECT id, id, 'role_changed', '{"role":"user"}'::jsonb, '{"role":"admin"}'::jsonb
FROM promoted;
```

The SQL increments the session version and records the bootstrap role change. Sign in again to create a fresh session. Admin pages and every `/api/admin/*` handler independently verify the current database role; the Next.js proxy is an additional early gate.

After the first administrator exists, use **Admin → Users** to promote other registered accounts. Role changes are confirmed, audited, and invalidate existing sessions. An administrator cannot block or demote themselves, and the final administrator cannot be demoted or deleted. User deletion is soft deletion so order records remain available.

## User accounts, returns and refunds

- **My Account** at `/account` brings together the signed-in user's overview, orders, returns, payments, addresses, wishlist, reviews, profile/security and recent account activity. APIs derive the user ID from the verified session; they do not accept a client-selected account ID.
- Admins can inspect a user's profile, addresses, complete order/payment/return history, cart, wishlist, reviews, audit activity and lifetime stats at **Admin → Users**.
- Signed-in users can request returns from delivered orders during the configured return window. They select item quantities, a reason, an optional comment and up to four optional photos. `RETURN_WINDOW_DAYS` defaults to 7; the setting can also be seeded as `return_window_days`.
- Admins manage the request at **Admin → Returns**: Requested → Approved/Rejected → Picked Up → Received → Refunded. When marking items received, stock restoration is optional. Online refunds are issued through Razorpay after receipt; COD refunds must be completed manually and then marked refunded.
- The `returns`, `return_items` and `audit_logs` tables are included in the Drizzle schema and migrations. They are intentionally seeded without fabricated customer, order or audit records.
- `product_images` stores each ImageKit URL, ImageKit file ID, alt text and display order. Seed-only sample URLs use the visibly non-production `your_imagekit_id` placeholder and should be replaced with actual uploads before publishing sample products.

## Main capabilities

- Public catalog with category, search, price, rating, popularity and newest filters; pagination; product details, ratings and approved reviews.
- Customer signup/sign-in, HTTP-only signed session cookie, rate-limited auth endpoints, password reset tokens and SMTP email.
- In local development, the forgot-password form displays a one-time reset link instead of requiring SMTP. In production, reset links are sent by email and are never returned by the API.
- Database-backed cart, wishlist, saved delivery addresses, COD and Razorpay checkout, order history, invoice PDF downloads, order cancellation before shipment and returns/refunds.
- Server-side price/tax/shipping/coupon calculation, conditional stock decrements inside a PostgreSQL transaction, server verification of Razorpay signatures, and webhook handling.
- Admin catalog and category management, signed ImageKit product uploads, ImageKit-hosted return-photo uploads, order/customer/user/return/review/coupon/banner/settings management, low-stock indicators and sales chart.
- Responsive layouts, accessible labels, loading/empty/error states, metadata, sitemap and robots policy.

Prices are stored as integer paise. Store settings for shipping and tax can be edited in **Admin → Settings**. Product image upload requires the ImageKit values; Razorpay checkout requires all Razorpay keys and webhook configuration. Cash on delivery remains available independently. Admin upload authentication, file ownership/folder checks, image-size limits, image-count limits and image deletion are verified on the server.

## Security notes

- Passwords use bcrypt; reset tokens are random, hashed at rest and expire after 30 minutes.
- The session cookie is HTTP-only, SameSite=Lax and Secure in production. Password and order authorization is checked on the server.
- Role and status changes increment a database-backed session version and write an audit entry; blocked, deleted or changed-role sessions are rejected by server guards.
- Admin route handlers call a database-backed role guard; the proxy performs an early signed-role check as well. Never promote an account from the client.
- Price and stock values are recalculated/validated on the server. Razorpay signatures are verified using constant-time comparison.
- Use HTTPS in production, rotate credentials if exposed, and restrict Neon/ImageKit/Razorpay keys to the required environments. Auth rate limits are stored atomically in Neon rather than process memory, so they persist across serverless instances.
