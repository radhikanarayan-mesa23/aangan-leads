# Changelog

## phase-0 — source files, rubric and agent prompt
- Copied Nikhil's `services.md`, `pricing.md`, `qualified.md` into `source/`. The sample enquiries PDF is image-only; no text could be extracted.
- Wrote `rubric.md` v1.0 — every placeholder filled from the sources, six open questions listed in §14.
- Wrote `vaani_agent_prompt.md` — personality, context, flow, off-script, guardrails, close.

## phase-1 — scaffold
- Next.js 15 App Router + TypeScript + Tailwind, design tokens in `app/globals.css`.
- `migrations/001_init.sql`: `users`, `leads`, `lead_events`, `magic_tokens`, unique index on `booked_at`.
- `migrations/002_rls_supabase.sql`: RLS policies, applied only if the database is Supabase.
- Magic-link auth, owner/designer roles, role separation in `middleware.ts` and `requireOwner()`.
- 14 seeded calls across every grade and stage, graded by the real code.

## phase-2 — intake pipeline
- `POST /api/vaani/call-ended`: secret, `normalizeVaniPayload`, upsert on `vani_call_id`, 200, then `after()`.
- `lib/gemini.ts`: one call, temperature 0, `rubric.md` as the system prompt, Zod-validated, retried once.
- `lib/pricing.ts` + `lib/grading.ts`: internal estimate, budget fit, C1–C5, the ladder, code override.
- Callback promise stored as spoken; costs; Telegram with quiet hours.
- `scripts/replay.ts`, `scripts/check-grading.ts`, `scripts/eval.ts`, `seed/test-set.json`.

## phase-3 — designer board
- `/board`: 8-column Kanban, dnd-kit drag on pointer and touch, filters, claim, designer load.
- Card detail: contact, requirement grid, budget vs internal estimate, criteria, handoff note, off-script questions, recording, transcript, timeline, stage dropdown, notes.
- `PATCH /api/leads/:id/stage` with lost-reason and proposal-value rules, event log, HubSpot sync.
- `/board/calendar`: week view of the five daily slots.

## phase-4 — owner dashboard
- `/owner`: KPI row with month-on-month deltas, health strip, code-computed insights.
- Charts: leads over time by grade, funnel with drop-off, locality, source, cost vs revenue, hour × weekday heatmap, team table.
- `GET /api/cron`: queued pushes, hot-lead nudges, overdue callbacks, HubSpot retries, 9pm digest.
- `scripts/hubspot-setup.ts`.

## phase-4.1 — review pass, four defects fixed
- **Board card:** the card body was a `<button>` wrapping the Claim `<button>` — invalid nesting, and its `onPointerDown` guard swallowed the drag gesture everywhere except the 12px padding ring. The card is now a single draggable element with click and Enter/Space to open; Claim stops propagation on its own.
- **`upsertCall`:** a row created mid-call by `/api/vaani/tools/book` holds only a name and a slot. The webhook's `on conflict` now coalesces caller name, number, email, start time, booking and cost instead of leaving the placeholder's gaps.
- **Seeded bookings:** past consultations were written at the call timestamp rather than a slot hour, so they missed the calendar grid and two could collide on the unique index on `booked_at`. They now land on a real slot hour, N days after the call.
- **Funnel:** every lost lead was credited with reaching Contacted regardless of how far it got, so per-stage drop-off was wrong. It is now computed from `lead_events`, counting the furthest stage each lead ever entered.

## phase-4.2 — Neon
- `DATABASE_URL` targets Neon's pooled endpoint; `lib/db.ts` now verifies TLS properly rather than disabling certificate checks, with `sslmode=no-verify` as the explicit opt-out.
- `migrations/002_rls_supabase.sql` parked — skipped unless `npm run db:migrate -- --supabase`.
- `.env.example` leads with Neon; the Supabase keys are documented as dormant.
- Recordings stream through the auth-gated proxy. Keeping our own copy of the audio is a TODO in `lib/storage.ts`.

## phase-4.3 — two gaps against the brief
- Board date filter (any date / 24h / 7d / 30d). The brief lists grade, assigned, locality **and date**; date was the one missing.
- Owner KPI relabelled to the brief's "% answered within 5 min". The measure is unchanged and the sub-line now states it plainly: the agent picks up on the first ring, so this is the share of calls that became a real conversation rather than dropping, erroring or staying silent.

## phase-4.4 — verified against a real Postgres
- `npm run verify:db` — the whole schema and every query run against an embedded Postgres (PGlite), no server and no network. 34 checks: migration, seeding, `text[]` and `jsonb` round-trips, the unique index that blocks a double booking, webhook idempotency, the mid-call placeholder merge, stage moves, `step_errors` appends, and every owner-dashboard analytic.
- `lib/db.ts` gained a `setExecutor` test seam so the real `lib/` queries run unchanged under the harness.
- Dropped the `pgcrypto` extension: `gen_random_uuid()` has been core since Postgres 13.
- **Fixed — callback punctuality lied.** The health strip counted a promise that was not yet due as already missed.
- **Fixed — hard rule 3 was violated.** `callback_due_at` was written for every unbooked lead, including callers the agent had politely declined. The promise is now read from the transcript, so it is stored exactly as spoken: out-of-area, advice-only and deadline callers get none, and the existing-client escalation keeps its "right away".
- A missing or unreachable database now renders a setup page explaining what to do, instead of a 500.

## phase-4.5 — deploy
- Private GitHub repo `radhikanarayan-mesa23/aangan-leads`, Vercel project linked to it.
- **Next.js 15.1.6 → 15.5.27.** Vercel refused the first build: 15.1.6 carries CVE-2025-66478. Same App Router API, no code changes needed.
- A deploy without `DATABASE_URL` now shows the setup page rather than failing.

## phase-5 — Calendly
- `lib/calcom.ts` → `lib/calendly.ts` against Calendly API v2: `GET /event_type_available_times`, `POST /invitees` (books server-side, no invitee click), `POST /scheduled_events/{uuid}/cancellation`.
- Offered slots are now our grid **intersected with Calendly's real availability**, degrading to our own calendar if Calendly is unreachable.
- If Calendly refuses a slot mid-call, our hold is released and the agent offers another time instead of confirming a booking that does not exist.
- **New `POST /api/calendly/webhook`** (`invitee.created`, `invitee.canceled`), signature-verified with a five-minute replay window. A booking made directly in Calendly now holds the slot; a cancellation frees it without dropping the lead.
- Schema: `calcom_booking_id` → `calendly_event_uri`, plus `calendly_cancel_url`.
- `verify:db` is now 37 checks, covering the direct-booking hold and the cancellation release.

## phase-5.1 — secrets are mandatory in production
Going public exposed a hole: every webhook treated a missing shared secret as "allow", which is right on a laptop and wrong on a public URL. An unsigned POST to `/api/calendly/webhook` returned 200, and `/api/vaani/call-ended` would have accepted fabricated calls.

`lib/webhook-auth.ts` now centralises the rule — **a missing secret is a 503 in production, never an open door** — and `/api/vaani/call-ended`, both live call tools, `/api/calendly/webhook` and `/api/cron` all use it. Local development is unchanged.

## phase-5.2 — live on Neon
- Neon pooled endpoint wired, schema applied, 14 leads seeded. All grades land as the rubric's worked examples promise, including the code override on AAN-0004.
- **Fixed — the magic link was printed on the production login page.** With no email provider wired, anyone who knew a team address could have signed in. It is now behind `DEMO_MAGIC_LINK=1`, and with the flag off the form gives the same answer for any address so it cannot be used to discover who is on the team.

## phase-5.3 — back to Cal.com
- `lib/calendly.ts` → `lib/calcom.ts` against Cal.com API v2, with the version header pinned per endpoint (omitting it returns 404).
- `POST /api/calendly/webhook` → `POST /api/calcom/webhook`, HMAC-SHA256 over the raw body in `x-cal-signature-256`.
- `migrations/003_calcom.sql` renames the booking columns on the live Neon database. Idempotent, and safe on a fresh install.
- `verify:db` now applies the **whole migration chain** in order, not just `001` — 38 checks.
- Generated `VAANI_WEBHOOK_SECRET`, `VAANI_TOOL_SECRET` and `CALCOM_WEBHOOK_SECRET`; set in Vercel and `.env`, so those endpoints no longer return 503 in production.

## phase-6 — HubSpot setup survives a free portal
- Creating an extra deal pipeline needs Sales Hub Professional. `scripts/hubspot-setup.ts` now catches the 403, falls back to the portal's existing pipeline, maps our eight columns onto its stages by position, and prints a `HUBSPOT_STAGE_MAP` with the mapping shown for checking. *Closed won* and *Closed lost* are matched by name, not position.
- `lib/hubspot.ts` resolves a stage through `resolveStageId()`: the explicit map wins, then a label match. It returns null rather than guessing, and `updateDealStage` now throws a readable error instead of silently filing a deal under no stage.
- `docs/KEYS.md` has the step-by-step for creating the private app and the exact six scopes.

## phase-6.1 — corrected HubSpot instructions
HubSpot moved private apps under *Development → Legacy Apps* and disables creation for existing accounts on **26 October 2026**. `docs/KEYS.md` now reflects that, names Service Keys as the successor, and notes that `HUBSPOT_PRIVATE_APP_TOKEN` accepts either credential.

## phase-6.2 — rubric v1.1: approved, plus a ₹8L budget floor
- All six open assumptions confirmed; `rubric.md` §14 is now the approval record.
- **New:** a stated budget ≥ ₹8,00,000 passes C3 on its own. The threshold is parsed out of `rubric.md`, not hardcoded.
- `budget_fit` still records the arithmetic, so the board shows the real gap; leads that pass on the floor carry flag `BUDGET_FLOOR` and say so in the grade reason.
- One seeded lead moved: AAN-0004 Warm → Hot. 14/14 checks, 38/38 DB checks.
