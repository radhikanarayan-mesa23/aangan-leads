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
