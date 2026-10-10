# Context — where this project is right now

_Updated 2026-10-10._

## What is built

- **Shell** — dark navigation rail (`components/Shell.tsx`), collapsing to a button on mobile.
- **Look** — palette from the Show Prime badge; dark hero band on the dashboard and a gradient welcome card on sign-in. All tokens in `app/globals.css`.
- **Phase 0** — `source/` holds Nikhil's three files. `rubric.md` is at **v1.2** (approved v1.1 2026-10-09, language capture added 2026-10-10): all six assumptions confirmed, plus a ₹8L budget floor on C3. `vaani_agent_prompt.md` matches rubric §4–6 and §10.
- **P1 Scaffold** — Next.js 15 (App Router, TS) + Tailwind, migrations for `users` / `leads` / `lead_events` / `magic_tokens`, magic-link auth with owner/designer roles, middleware role separation, 14 seeded calls.
- **P2 Intake pipeline** — `POST /api/vaani/call-ended` (secret → normalise → upsert → 200 → `after()`), one Gemini call with `rubric.md` as the system prompt, Zod validation with one retry, code-side estimate / budget fit / grade with override, callback promise, costs, Telegram. `scripts/replay.ts` and `scripts/check-grading.ts`.
- **Every win rate shows its denominator** (`50% of 2 closed`); the maths is `won / (won + lost)`.
- **Worklist** — every card says what to do next (`lib/next-action.ts`) and the board sorts by urgency. Call outcomes are recorded from the card.
- **P3 Designer Board** — `/board` Kanban, 8 columns, dnd-kit drag (pointer + touch), filters (grade, mine, locality, date, designer), claim, card detail panel (contact, requirement grid, budget vs internal estimate, criteria, handoff note, off-script questions, recording, transcript, timeline, stage dropdown, notes), `/board/calendar` week view.
- **P4 Owner Dashboard** — `/owner` KPI row, health strip, code-computed insights, leads over time, funnel with drop-off, locality, source, cost vs revenue, hour × weekday heatmap, and a designed per-designer snapshot (open, consultations, converted ₹, not converted, win rate, time to first contact, what is being let down — plus an Unclaimed row).
- **Live call tools** — `POST /api/vaani/tools/slots` and `/book` (secret-checked, 30s cache, availability re-checked before booking). Both are **registered in Vaani and enabled on the agent** as `aangan_slots` and `aangan_book`, so a caller is booked during the call rather than promised one.
- **Cron** — `GET /api/cron`: queued pushes, hot-lead nudges, overdue callbacks, HubSpot retries, 9pm brief. Scheduled daily by `vercel.json`; the 10-minute sweep still needs cron-job.org.
- **Daily brief** — `lib/brief.ts`, 70-word highlight + Markdown/CSV download at `/api/owner/brief`.
- **HubSpot** — client, stage resolution via `resolveStageId()`, `scripts/hubspot-setup.ts` (falls back to the portal's existing pipeline when it cannot create one — extra pipelines need Sales Hub Professional), deal created on the first move out of New, retried by cron.

## Fixed in the review pass (2026-10-08)

Nested buttons on the board card (which also broke dragging), `upsertCall` not
coalescing over a mid-call placeholder row, seeded past bookings landing off the
slot grid, and a funnel that mis-credited lost leads. See `CHANGELOG.md`.

## In progress / next step

1. **An inbound phone number** — the last missing piece. The agent is configured, the tools are attached and the webhook is verified; buying and attaching a number is Nikhil's action, because it charges the account.
2. **`DEMO_MAGIC_LINK` must go off** before real caller data lands. It now controls two things: open demo sign-in on the login page, and printing the magic link instead of emailing it. Turning it off needs an email provider wired first, or nobody can get in.
3. Cal.com, Telegram and HubSpot keys.
4. ~~Waiting on the design file~~ — palette taken from the Show Prime badge, 2026-10-09. Deep navy + royal blue, dark hero band on the dashboard.

## Env status

| Key | Status |
|---|---|
| `DATABASE_URL` | ✅ set — Neon pooled endpoint, schema applied, 14 leads seeded |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | ✅ set, `gemini-3.8-flash`. Live grading verified; `npm run eval` 20/20, 0 false lows |
| `TELEGRAM_BOT_TOKEN`, chat ids | ✅ set (@aanganNNbot, owner `8939412037`). Daily brief and hot-lead push both delivered live. Designer id is temporarily the owner's until a group exists |
| `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID` | ✅ set. Event type `7409828`, 60 min, schedule `2476628` Mon–Sat 12–5pm IST. Booking and cancellation verified live |
| `HUBSPOT_PRIVATE_APP_TOKEN`, `HUBSPOT_PIPELINE_ID` | ✅ set. Dedicated **Aangan Leads** pipeline `2613566173`, 8 stages, `ai_call_cost_inr` created. Deal creation and stage sync verified against the live portal |
| `VAANI_API_KEY`, `VAANI_AGENT_ID` | ✅ set. Agent `040c5b84…` configured from this repo via `npm run vaani:setup`. Needs publishing + a phone number |
| `VAANI_WEBHOOK_SECRET`, `VAANI_TOOL_SECRET`, `CALCOM_WEBHOOK_SECRET` | ✅ generated and set in Vercel — paste the same values into Vaani and Cal.com |
| `SESSION_SECRET`, `CRON_SECRET` | defaulted in development, **must be set in production** |

## Open `// ASSUME:` notes

- `lib/db.ts` — Neon, decided 2026-10-08. One Postgres URL; nothing above it knows the host.
- `lib/auth.ts` — our own magic link rather than Supabase Auth. With Neon there is no RLS, so hard rule 5 rests on `middleware.ts` and `requireOwner()` alone; `migrations/002_rls_supabase.sql` is parked.
- `lib/vaani.ts` — written against **Vaani AI**'s real delivery, captured from their dashboard Test button. Multi-event deliveries, `call_postprocessing` preferred, ms→s conversion. Secret rides in the URL query; they send no signature header.
- `lib/calcom.ts` — written from Cal.com's published v2 reference; `POST /v2/bookings` and `GET /v2/slots` are unverified against a live account. The slots parser accepts both documented shapes.
- `lib/storage.ts` — on Neon, recordings stream through the auth-gated proxy. We keep no copy, so an expiring Vaani URL would lose the audio. TODO: Vercel Blob or S3.
- ~~`rubric.md` §14 — six questions for Nikhil~~ — all confirmed 2026-10-09.
- `source/enquiries.pdf` is image-only; no text could be extracted, so no real transcript informed the seeds.
- The project folder was renamed to `~/Desktop/ai-building/vaani` (the old name ended in a space, which broke tooling).

## Known gaps

- No **Neon** database has been touched yet. The schema, the seed and every query are verified against an embedded Postgres via `npm run verify:db` (53 checks), so what remains unproven is only Neon-specific: TLS, the pooled endpoint and connection limits.
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
