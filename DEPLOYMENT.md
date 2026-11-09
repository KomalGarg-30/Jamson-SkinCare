# Vercel deployment (Next.js + Neon)

This project is configured for Vercel's Next.js runtime and Neon PostgreSQL. Vercel functions run in Mumbai (`bom1`); choose a Neon region close to your users, preferably AWS Asia Pacific Mumbai or Singapore, to reduce database latency. Production migrations are manual and must be applied before deploying code that uses the new schema.

## Prerequisites

Create accounts for GitHub, Vercel, Neon, and Resend. ImageKit and Razorpay are needed only when enabling their corresponding features. OTP rate limits use Upstash Redis when configured and fall back to PostgreSQL.

## 1. Push the repository to GitHub

If this is a new repository, create an empty GitHub repository first, then run from the project directory:

```bash
git add .
git commit -m "Prepare Decotrin for Vercel deployment"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

For an existing remote, use `git push` instead of adding another remote. Confirm `.env` and `.env.local` are ignored before pushing; never commit production credentials.

## 2. Create the production Neon database

Create a Neon production project/branch in Mumbai or Singapore, as close to Vercel's `bom1` region as possible. In Neon **Connect**, copy both connection strings:

- The **pooled** string (hostname contains `-pooler`) is `DATABASE_URL` and is used by the running application.
- The **direct/non-pooled** string is `DATABASE_URL_UNPOOLED` and is used only for schema migrations.

Keep TLS enabled and do not add either connection string to source control.

## 3. Migrate and seed before deploying

From the local project directory, set the production connection values only in your shell. In PowerShell:

```powershell
$env:DATABASE_URL = "YOUR_NEON_POOLED_CONNECTION_STRING"
$env:DATABASE_URL_UNPOOLED = "YOUR_NEON_DIRECT_CONNECTION_STRING"
npm ci
npm run db:migrate:prod
npm run db:seed:prod
```

The migration command refuses to run without `DATABASE_URL_UNPOOLED`. Review SQL migrations before applying them. The production seed creates only the default categories and store settings; it does not add demo products. Never run the demo `db:seed` against production.

Before migrating an existing Neon database, check its migration ledger:

```sql
SELECT
  to_regclass('drizzle.__drizzle_migrations') AS drizzle_migration_ledger,
  to_regclass('public.__drizzle_migrations') AS public_migration_ledger,
  to_regclass('public.users') AS users_table,
  to_regclass('public.products') AS products_table;
```

`db:migrate:prod` refuses to apply the initial migrations when application tables exist but the ledger is absent or empty. This protects databases previously initialized with `db:push` from duplicate-table migrations. In that case, create a Neon branch/backup and reconcile the existing schema with the migration history before deploying; do not mark migrations applied or choose column renames without verifying that the live schema matches. Once the history is reconciled, rerun the production migration command.

## 4. Import into Vercel

In Vercel, choose **Add New → Project**, import the GitHub repository, and configure:

- Framework preset: **Next.js**
- Root directory: repository root (the directory containing `package.json`)
- Install command: `npm ci`
- Build command: `npm run build` (or leave the Next.js default)
- Output directory: leave the Next.js default

Do not set a standalone or static export output. `vercel.json` selects Mumbai, configures function limits, security headers, and the daily cleanup cron.

## 5. Set up Resend email

Email is required for verified signup and password recovery:

1. Create an account at [Resend](https://resend.com) and create an API key in **API Keys**.
2. In Resend **Domains**, add the domain you will send from. Publish the exact SPF and DKIM DNS records Resend displays at your domain registrar. Add a DMARC record as recommended for your domain.
3. Wait until Resend reports the domain as verified.
4. Choose `EMAIL_FROM` on that domain, for example `Decotrin <noreply@decotrin.com>`. For testing only, `onboarding@resend.dev` is limited to sending to the email address of your own Resend account. Set `EMAIL_REPLY_TO` to your support inbox.
5. Add the values in Vercel as described in the next section. `RESEND_API_KEY` is a server-only secret; never use a `NEXT_PUBLIC_` prefix.

## 6. Set up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and configure the OAuth consent screen.
2. Create an OAuth client under **APIs & Services → Credentials → Create credentials → OAuth client ID**, choosing **Web application**.
3. Add `http://localhost:3000/api/auth/google/callback` and `https://decotrin.com/api/auth/google/callback` as authorized redirect URIs.
4. Add the generated credentials to Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Keep both server-only.

The Google button appears on sign-in and signup. Google-verified accounts are linked by email and use the normal Decotrin session.

## 7. Configure environment variables

Add these in **Project Settings → Environment Variables**. Use test Razorpay credentials for Preview and Development; use live Razorpay keys only in Production. Vercel sets `NODE_ENV` and `VERCEL_URL` automatically. Environment variables used by the build must be present before the first deployment.

| Variable | Where to get it | Required? |
|---|---|---|
| `NODE_ENV` | Set automatically by Vercel | No |
| `NEXT_PUBLIC_APP_URL` | Your production URL, e.g. `https://yourstore.vercel.app`; set explicitly for a custom domain (`VERCEL_URL` is the fallback) | Recommended |
| `DATABASE_URL` | Neon **pooled** connection string (host includes `-pooler`) | Yes |
| `DATABASE_URL_UNPOOLED` | Neon **direct/non-pooled** connection string; required only when running migrations | Migrations |
| `JWT_SECRET` | Generate with `openssl rand -base64 32` (or a secure password generator); use a unique value per environment | Yes |
| `CRON_SECRET` | Generate a long random secret; sent only by Vercel Cron | Scheduled cleanup |
| `IMAGEKIT_PUBLIC_KEY` | ImageKit dashboard → Developer options → API keys | Image uploads |
| `IMAGEKIT_PRIVATE_KEY` | ImageKit dashboard → Developer options → API keys; server-only | Image uploads |
| `IMAGEKIT_URL_ENDPOINT` | ImageKit dashboard, e.g. `https://ik.imagekit.io/your_id` | Image uploads |
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` | Same ImageKit public key | Image uploads |
| `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | Same ImageKit URL endpoint | Image uploads |
| `IMAGEKIT_UPLOAD_FOLDER` | ImageKit folder; defaults to `/skincare-store/products` | No |
| `MAX_IMAGE_SIZE_MB` | Product image upload limit; defaults to `5` | No |
| `MAX_IMAGES_PER_PRODUCT` | Product image count limit; defaults to `8` | No |
| `RAZORPAY_KEY_ID` | Razorpay dashboard → API Keys; TEST in Preview, LIVE in Production | Online payments/refunds |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard → API Keys; server-only | Online payments/refunds |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Same environment's Razorpay Key ID | Online payments |
| `RAZORPAY_WEBHOOK_SECRET` | The secret configured for the Razorpay webhook | Online payment webhooks |
| `RESEND_API_KEY` | Resend dashboard → API Keys; server-only | Required for auth email |
| `EMAIL_FROM` | Sender on a verified Resend domain, e.g. `Decotrin <noreply@decotrin.com>` | Required for auth email |
| `EMAIL_REPLY_TO` | Customer-support email address | Optional |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth web application client ID | Optional Google sign-in |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth web application client secret; server-only | Optional Google sign-in |
| `OTP_LENGTH` | OTP digits; defaults to `6` | No |
| `OTP_EXPIRY_MINUTES` | OTP validity; defaults to `1` minute | No |
| `OTP_RESEND_COOLDOWN_SECONDS` | Server-enforced resend cooldown; defaults to `60` | No |
| `RETURN_WINDOW_DAYS` | Number of days after delivery to allow a return; defaults to `7` | No |
| `STORE_NAME` | Your customer-facing store name | No |
| `CURRENCY` | ISO currency code, e.g. `INR` | No |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST API URL; enables shared distributed rate limits | Recommended |
| `UPSTASH_REDIS_REST_TOKEN` | Matching Upstash Redis REST token | Recommended |
| `AUDIT_LOG_RETENTION_DAYS` | Optional retention in days; unset preserves audit history indefinitely | No |
| `VERCEL_URL` | Supplied automatically by Vercel; fallback when constructing absolute URLs | No |

`DATABASE_URL` and `JWT_SECRET` are required for the store; email actions also require `RESEND_API_KEY` and `EMAIL_FROM`. Vercel provides `VERCEL_URL` for absolute links, though `NEXT_PUBLIC_APP_URL` should be set for a custom domain. The scheduled cleanup endpoint remains disabled until `CRON_SECRET` is set. `DATABASE_URL_UNPOOLED` is needed only for database migrations. Set variables for Production, Preview, and Development as appropriate, and never prefix private credentials with `NEXT_PUBLIC_`. Supplied values are validated without printing secret values.

## 8. Configure Razorpay webhooks (optional)

Skip this step until enabling Razorpay payments. After deploying and adding Razorpay credentials in Vercel, configure the webhook in the Razorpay dashboard:

- Webhook URL: `https://<your-domain>/api/webhooks/razorpay`
- Events: `payment.captured`, `payment.failed`, and `refund.processed`
- Secret: a generated webhook secret; set the same value as `RAZORPAY_WEBHOOK_SECRET` in Vercel and redeploy.

The webhook validates the raw request body signature and uses Razorpay's event ID to ignore duplicates. ImageKit uses the configured endpoint and API keys; if ImageKit restrictions are enabled, allow your production domain.

## 9. Custom domain

Add the domain under **Vercel → Project → Settings → Domains**, then create the DNS records Vercel shows at your domain registrar. Once verified, set `NEXT_PUBLIC_APP_URL=https://<your-domain>` for the correct Vercel environments and redeploy.

## 10. Promote the first administrator

Create the account through the normal signup flow. In the production Neon SQL Editor, replace the example address with that account's email and run:

```sql
WITH promoted AS (
  UPDATE users SET role = 'admin', session_version = session_version + 1
  WHERE email = 'admin@example.com' AND role = 'user' AND deleted_at IS NULL
  RETURNING id
)
INSERT INTO audit_logs (actor_user_id, target_user_id, action, old_value, new_value)
SELECT id, id, 'role_changed', '{"role":"user"}'::jsonb, '{"role":"admin"}'::jsonb
FROM promoted;
```

Then sign in again to issue a fresh session. Other accounts can be promoted in **Admin → Users**.

## 11. Post-deploy checklist

- `https://<your-domain>/api/health` returns `status: "ok"` and `database: "connected"`.
- Signup OTP, login, resend cooldown, and password-reset OTP work.
- Resend confirms the verified sender domain and production delivery.
- Admin product image upload, display, and deletion work.
- Cart and checkout work; a Razorpay TEST payment creates an order and the webhook is received.
- A COD order can be placed.
- The return request and admin return/refund flow work.
- A normal user is denied access to admin APIs (403) and redirected from admin pages.
- `/api/cron/cleanup` rejects requests without `Authorization: Bearer <CRON_SECRET>`.
- Vercel's scheduled cleanup function has a successful invocation in the Function Logs.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build reports missing environment variables | Add the required Production/Preview variables in Vercel, check for whitespace/empty values, then redeploy. |
| Neon connection errors or too many connections | Use the pooled URL in `DATABASE_URL`; reserve direct URL for `DATABASE_URL_UNPOOLED` and migrations. Confirm the Neon project is active. |
| Migration fails or complains about a column | Confirm migrations were applied to the intended Neon branch with `DATABASE_URL_UNPOOLED`; inspect SQL before retrying. For a database initialized with `db:push`, reconcile its migration baseline on a Neon branch first. Do not select a rename for an unrelated column. |
| ImageKit images do not load | Verify the endpoint host and public values; the hostname is added to `next.config.ts` remote patterns at build time, so update env vars and redeploy. Check ImageKit domain restrictions. |
| Razorpay webhook signature fails | Verify the endpoint, event subscriptions, raw configured webhook secret, and that the secret was copied to `RAZORPAY_WEBHOOK_SECRET`; do not use API key secret in its place. |
| Function times out | Check Vercel function logs and database region; keep background work bounded. The Hobby plan has a lower maximum duration than Pro. |
| Session cookie is not set | Use HTTPS, access the same host as `NEXT_PUBLIC_APP_URL`, and confirm the domain is not mixing `www` and apex URLs. |
| Cron returns 401 | Configure `CRON_SECRET` in Production. Call manually with `Authorization: Bearer <same-secret>`. |

## Rollback and safe schema testing

Use **Vercel → Deployments → Promote to Production** on the last known-good deployment for an instant application rollback. Database migrations are not automatically rolled back; make additive/backward-compatible changes and plan a separate database recovery if needed. Create a Neon branch from production to test migrations and seed behavior safely, and point Preview deployments at that branch.
