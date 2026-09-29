This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Messenger notifications

Clients connect Messenger from **My Glow**; GlowSync then sends appointment
reminders (~24h before), updates (rescheduled / cancelled / no-show), and
admin promo / booking broadcasts, each with a button that deep-links into
the site. Design: `docs/superpowers/specs/2026-09-29-messenger-notifications-design.md`.

**Deploy order: apply `supabase/migrations/047_messenger.sql` to the database BEFORE deploying this code — admin broadcasts (including email-only) and broadcast history depend on its new columns.**

Setup:

1. **Meta app** — add the Messenger product, connect the Page, generate a
   Page access token with `pages_messaging` and `pages_utility_messaging`.
2. **Webhook** — callback `https://<site>/api/messenger/webhook`, verify
   token = `MESSENGER_VERIFY_TOKEN`; subscribe the Page to `messages`,
   `messaging_postbacks`, `messaging_referrals`,
   `message_template_status_update`.
3. **Env (Vercel + `.env.local`)** — `MESSENGER_PAGE_ID`,
   `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET`,
   `MESSENGER_VERIFY_TOKEN`, `MESSENGER_DISPATCH_SECRET` (any long random
   string), `NEXT_PUBLIC_MESSENGER_PAGE_USERNAME`, `NEXT_PUBLIC_SITE_URL`.
4. **Supabase** — apply `supabase/migrations/047_messenger.sql` in the SQL
   Editor, then add Vault secrets:
   `select vault.create_secret('https://<site>/api/messenger/dispatch', 'messenger_dispatch_url');`
   `select vault.create_secret('<MESSENGER_DISPATCH_SECRET>', 'messenger_dispatch_secret');`
5. **Templates** — `node --env-file=.env.local scripts/messenger-setup.ts`
   (rerun if the site domain changes). Needs Node 22.18+ (TypeScript type
   stripping); it may print a harmless `MODULE_TYPELESS_PACKAGE_JSON` warning.
6. **Testing** — in Development mode only people with a role on the Meta
   app receive messages; add testers under App Roles.
7. **Real clients** — submit App Review for `pages_messaging` and
   `pages_utility_messaging`, then switch the app to Live.

Promos and booking invites only reach clients who messaged the Page in the
last 24 hours (Meta policy); the rest are recorded as skipped.

## Reviews & moderation

Clients rate a completed visit (service, therapist, branch). Reviews go through
SECURITY DEFINER functions, pass a server-side word filter, and admins moderate
them at `/admin/reviews` (hide / show / remove / restore, with an audit log).

Blocked words live in the table `blocked_review_terms` (lowercase letters and
single spaces only).

### Deploy runbook

1. Apply `supabase/migrations/048_review_moderation.sql` in the Supabase SQL
   Editor immediately before deploying this code. The old review forms stop
   working once 048 is applied, and the new UI needs 048.
2. Run `supabase/tests/048_reviews_check.sql` with the placeholders filled in.
   It rolls back; all lines should say PASS or show the expected counts.
3. Deploy/push right away (keep the gap to minutes).
4. Manual pass: rate a visit, confirm it appears on `/team/<id>` and in
   Reports, hide it in `/admin/reviews`, confirm it is gone from the staff page
   and the client sees "Hidden by the spa", then restore it. Two admin tabs
   should update live.
