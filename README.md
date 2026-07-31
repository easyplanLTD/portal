# Easy Repair Portal

The engineer-facing companion to FixFlow. Where FixFlow is the internal admin panel (owner/staff
run the business from it), this is what an engineer opens to see their jobs, leads, earnings, and
manage their own profile.

## Current state

Same situation as FixFlow started in: this runs on local demo data (no real database yet), using
the same three sample engineers (Dave, Sarah, Mike) with the same IDs, so it's easy to reason about
both apps together. Once Supabase is wired up (see FixFlow's `create-user-frontend.jsx` and the SQL
schema from that project), both apps will read from the same live data — a job assigned in FixFlow
will appear here instantly, and vice versa.

`src/lib/supabaseClient.js` is already in here, ready for that step.

## Sections

- **Dashboard** — today's jobs, lead progress toward daily target, success rate, any time-off
  requests awaiting approval
- **Bookings** — tabs for Jobs, Leads (only shown if relevant to that engineer's Jobs/Leads/Both
  setting), Schedule, and Reviews (placeholder — no review data exists anywhere yet)
- **Payments** — job earnings and tonight's lead charges
- **Support** — contact details (placeholder — no ticketing system yet)
- **Settings** — Holidays & Time Off (fully working, including the pending/approval flow),
  Skills, Coverage, and Documents (the last three are read-only here; they mirror what's set in
  FixFlow's Engineer profile, and become editable by the engineer only if FixFlow's
  "Let this engineer edit their own Settings" toggle is switched on for them)

## Running it locally

```bash
npm install
npm run dev
```

## Demo logins

Same three engineers as FixFlow: Dave (self-service on), Sarah and Mike (self-service off, so
their Settings tabs are view-only except where noted). Click any of them on the login screen.

## Deploying to Vercel

Same process as FixFlow:
1. Push this folder to its own GitHub repository.
2. vercel.com → **Add New → Project** → import the repo → deploy (Vite auto-detected).
3. Suggested subdomain: `portal.easyrepair.co.uk`, alongside FixFlow at `admin.easyrepair.co.uk`.

## Pushing to GitHub for the first time

```bash
cd portal-project
git init
git add .
git commit -m "Initial Easy Repair Portal prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

## What's not built yet

- Real Supabase connection (still local demo data, same as FixFlow was before its wiring started)
- Document uploads (needs Supabase Storage set up)
- Reviews (no review collection exists anywhere in the system yet)
- Messaging/broadcast from FixFlow to engineers (discussed earlier, not yet built)
- The Skills/Coverage/Documents tabs are read-only here even when switched on for self-service —
  making them actually editable in the Portal (not just displaying what FixFlow set) is the next
  logical step once Supabase is wired up, so both apps write to the same source of truth.
