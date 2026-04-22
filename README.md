# Bolt Tire Dispatch Starter

A mobile-first web app starter for a tire service business. It replaces the spreadsheet workflow with a simple dashboard, jobs list, weekly route board, today's route, and billing page.

## Stack

- Next.js App Router
- Tailwind CSS
- Supabase (database + auth)

This starter also includes demo data so you can open the UI before connecting Supabase.

## What is included

- Dashboard with top-level stats
- Jobs list
- New job form
- Weekly schedule board
- Today's route board
- Billing page
- API routes for listing, creating, and updating jobs
- Supabase SQL migration for the `jobs` table

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy environment variables

```bash
cp .env.example .env.local
```

3. Add your Supabase values in `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. Run the app

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Supabase setup

1. Create a Supabase project.
2. Run the SQL in `supabase/migrations/20260405_init_jobs.sql`.
3. Turn on an auth provider when you are ready.
4. Add your project URL and anon key to `.env.local`.

## Suggested next steps

1. Add login and protect routes.
2. Split customers and vehicles into separate tables.
3. Add status toggle buttons on job cards.
4. Add drag-and-drop schedule moves.
5. Add map links and one-tap calling from the route board.
6. Import your Google Sheet into the `jobs` table.

## Suggested CSV import mapping

Map these spreadsheet columns into `jobs`:

- COMPLETE -> `complete`
- DATE -> `created_at` (or a separate `order_date` field later)
- CUSTOMER -> `customer_name`
- TIRES -> `tire`
- SIZE -> `tire_size`
- QUANTITY -> `quantity`
- ORDERED -> `ordered`
- VEHICLE -> `vehicle`
- POSITION -> `position`
- SCHEDULED -> `scheduled`
- TIME / scheduled datetime -> `scheduled_at`
- CONTACT -> `contact_name`
- NUMBER -> `phone`
- ADDRESS -> `address`
- EMAIL -> `email`
- TOTAL -> `total`
- BILLED -> `billed`
- BILL DATE -> `bill_date`
- PAID -> `paid`
- NOTES -> `notes`

## Notes

When Supabase is not configured, the app falls back to demo data based on the jobs you pasted.
