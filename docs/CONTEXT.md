# Context — where this project is right now

_Updated 2026-10-08._

## What is built

- **Phase 0** — `source/` holds Nikhil's three files. `rubric.md` is at **v1.1, approved 2026-10-09**: all six assumptions confirmed, plus a ₹8L budget floor on C3. `vaani_agent_prompt.md` matches rubric §4–6 and §10.
- **P1 Scaffold** — Next.js 15 (App Router, TS) + Tailwind, migrations for `users` / `leads` / `lead_events` / `magic_tokens`, magic-link auth with owner/designer roles, middleware role separation, 14 seeded calls.
- **P2 Intake pipeline** — `POST /api/vaani/call-ended` (secret → normalise → upsert → 200 → `after()`), one Gemini call with `rubric.md` as the system prompt, Zod validation with one retry, code-side estimate / budget fit / grade with override, callback promise, costs, Telegram. `scripts/replay.ts` and `scripts/check-grading.ts`.
- **P3 Designer Board** — `/board` Kanban, 8 columns, dnd-kit drag (pointer + touch), filters (grade, mine, locality, date, designer), claim, card detail panel (contact, requirement grid, budget vs internal estimate, criteria, handoff note, off-script questions, recording, transcript, timeline, stage dropdown, notes), `/board/calendar` week view.
- **P4 Owner Dashboard** — `/owner` KPI row, health strip, code-computed insights, leads over time, funnel with drop-off, locality, source, cost vs revenue, hour × weekday heatmap, team table.
- **Live call tools** — `POST /api/vaani/tools/slots` and `/book` (secret-checked, 30s cache, availability re-checked before booking).
- **Cron** — `GET /api/cron`: queued pushes, hot-lead nudges, overdue callbacks, HubSpot retries, 9pm digest.
- **HubSpot** — client, stage resolution via `resolveStageId()`, `scripts/hubspot-setup.ts` (falls back to the portal's existing pipeline when it cannot create one — extra pipelines need Sales Hub Professional), deal created on the first move out of New, retried by cron.

## Fixed in the review pass (2026-10-08)

Nested buttons on the board card (which also broke dragging), `upsertCall` not
coalescing over a mid-call placeholder row, seeded past bookings landing off the
slot grid, and a funnel that mis-credited lost leads. See `CHANGELOG.md`.

## In progress / next step

1. **A real Gemini API key** — the one supplied is an OAuth credential and Google rejects it. Needed for grading live calls and for `npm run eval`.
2. **`DEMO_MAGIC_LINK` must go off** before real caller data lands, which means wiring an email provider for sign-in links.
3. Cal.com, Telegram and HubSpot keys.
4. Waiting on the design file to re-token `app/globals.css`.

## Env status

| Key | Status |
|---|---|
| `DATABASE_URL` | ✅ set — Neon pooled endpoint, schema applied, 14 leads seeded |
| `GEMINI_API_KEY` | ❌ the credential supplied is an OAuth token, not an API key — Google returns 401. Needs an AI Studio key (`AIza…`) |
| `TELEGRAM_BOT_TOKEN`, chat ids | missing — pushes are skipped, never crash |
| `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID` | missing — booking falls back to our own DB, which still prevents double booking |
| `HUBSPOT_PRIVATE_APP_TOKEN` | missing. **Create it before 26 Oct 2026** — HubSpot disables new legacy private apps then. Accepts a Service Key too — sync is a no-op. `HUBSPOT_PIPELINE_ID` (and `HUBSPOT_STAGE_MAP` on a free portal) are printed by `npm run hubspot:setup` |
| `VAANI_API_KEY` | ✅ set |
| `VAANI_WEBHOOK_SECRET`, `VAANI_TOOL_SECRET`, `CALCOM_WEBHOOK_SECRET` | ✅ generated and set in Vercel — paste the same values into Vaani and Cal.com |
| `SESSION_SECRET`, `CRON_SECRET` | defaulted in development, **must be set in production** |

## Open `// ASSUME:` notes

- `lib/db.ts` — Neon, decided 2026-10-08. One Postgres URL; nothing above it knows the host.
- `lib/auth.ts` — our own magic link rather than Supabase Auth. With Neon there is no RLS, so hard rule 5 rests on `middleware.ts` and `requireOwner()` alone; `migrations/002_rls_supabase.sql` is parked.
- `lib/vaani.ts` — Vaani's call-ended payload shape is unverified; the normaliser accepts the common shapes.
- `lib/calcom.ts` — written from Cal.com's published v2 reference; `POST /v2/bookings` and `GET /v2/slots` are unverified against a live account. The slots parser accepts both documented shapes.
- `lib/storage.ts` — on Neon, recordings stream through the auth-gated proxy. We keep no copy, so an expiring Vaani URL would lose the audio. TODO: Vercel Blob or S3.
- ~~`rubric.md` §14 — six questions for Nikhil~~ — all confirmed 2026-10-09.
- `source/enquiries.pdf` is image-only; no text could be extracted, so no real transcript informed the seeds.
- The project folder was renamed to `~/Desktop/ai-building/vaani` (the old name ended in a space, which broke tooling).

## Known gaps

- No **Neon** database has been touched yet. The schema, the seed and every query are verified against an embedded Postgres via `npm run verify:db` (34 checks), so what remains unproven is only Neon-specific: TLS, the pooled endpoint and connection limits.
- `scripts/eval.ts` has never run against the live model.
- Recording playback is untested without a real recording URL.

## Run, test, deploy

```bash
npm install
cp .env.example .env            # add DATABASE_URL at minimum
npm run check                   # grading over the seeds, no DB or API key needed
npm run verify:db               # schema + every query against an embedded Postgres (37 checks)
npm run db:migrate && npm run db:seed
npm run dev                     # http://localhost:3000, sign in as nikhil@aanganstudio.in
npm run replay                  # push a seeded call through the real pipeline
npm run eval                    # needs GEMINI_API_KEY
```

Deploy: pushes to `main` on `radhikanarayan-mesa23/aangan-leads` deploy automatically to the Vercel project `aangan-leads`. `SESSION_SECRET`, `CRON_SECRET`, `GEMINI_MODEL` and the three cost variables are already set there. Point cron-job.org at `/api/cron?secret=$CRON_SECRET` every 10 minutes once the database is live.
