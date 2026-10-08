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
