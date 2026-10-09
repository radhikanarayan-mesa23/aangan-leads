# Decisions

Append-only. The latest entry wins over `CLAUDE.md`; when they conflict, say so.

---

## 2026-10-08 — `rubric.md` v1.0 filled from the source files

**Decision.** `rubric.md` was filled from `source/services.md`, `source/pricing.md` and `source/qualified.md`. From here it is the single source for grading; code reads it rather than restating it (`lib/rubric.ts` is the only parser).

**What the sources settled.** Scope and the not-offered list, the Pune + PCMC service area, the 6-week minimum lead time, the per-sq-ft bands, the ₹3.5L–₹8L single-room band, and Nikhil's five criteria including "if budget is not mentioned, treat as qualified".

**What they did not settle** — carried as `ASSUME` in `rubric.md` §14 and still open: working days (Mon–Sat assumed), which fringe localities count as "adjoining", whether painting-only is explicitly declined, whether the single-room band is right for a kitchen-only job, the large-job threshold (2,000 sq ft assumed), and what to do with an office over the 3,000 sq ft cap.

**Status.** Drafted and running. **Not yet approved by Nikhil** — approval still to be logged here.

**Rejected.** Hardcoding the criteria in TypeScript. It is faster, but then `rubric.md` becomes documentation rather than the source, and the two drift apart within a week.

---

## 2026-10-08 — Postgres over the Supabase SDK, because the database may be Neon

**Decision.** All data access goes through `pg` and a single `DATABASE_URL`. Auth is our own magic link: a one-time token row exchanged for a signed httpOnly cookie, with roles from `users.role`.

**Why.** The database choice is still open between Neon and Supabase. A plain Postgres URL works with both, so the decision can be made later without touching application code.

**Consequences.** Supabase Auth and RLS are not in the hot path. The RLS policies are written and kept in `migrations/002_rls_supabase.sql`, applied with `npm run db:migrate -- --supabase` if the project lands on Supabase. Until then, hard rule 5 is enforced twice in our own code: `middleware.ts` and `requireOwner()`.

**Rejected.** Committing to the Supabase SDK now and rewriting later. Also rejected: an ORM — the queries are few and explicit SQL reads better here.

---

## 2026-10-08 — Code has the last word on the grade

**Decision.** Gemini supplies judgement (what the caller meant, whether this is a real project, tone). Code supplies arithmetic and lookups — location against the served list, scope against the offered list, budget fit against the estimate, the timeline against the 6-week minimum — and `lib/grading.ts` recomputes C1–C4 and re-applies the ladder. Disagreements are stored in `gemini_grade` and surfaced on the card and in the health strip.

**Why.** The expensive failure is a false LOW on an ₹8–14 lakh project. Arithmetic should not be delegated to a model when the inputs are already extracted.

**Evidence.** The seeded Kothrud call is exactly this case: Gemini reads it as HOT, the code computes ₹14L against a ₹16.2L minimum, lands on `close`, and regrades it WARM.

**Rejected.** Trusting Gemini's grade and only logging disagreements.

---

## 2026-10-08 — Seeds run through the real grader

**Decision.** `seed/calls.ts` carries transcripts and the extraction Gemini would return, but **not** the grade. `scripts/seed.ts` runs the real `gradeLead()` over them and asserts the expected outcome.

**Why.** Hand-labelled seed data looks right and proves nothing. This way the seeded board is evidence that `rubric.md` behaves, and `npm run check` is a fast regression test with no database and no API key.

**Rejected.** Seeding grades directly as literal values.

---

## 2026-10-08 — Neon, not Supabase

**Decision.** Radhika chose Neon. `DATABASE_URL` points at a Neon **pooled** endpoint (`-pooler` in the host).

**What changed.** Nothing in application code — this is what the 8 October "Postgres over the Supabase SDK" decision was written to allow. Only three things moved: `lib/db.ts` now verifies the TLS certificate properly instead of passing `rejectUnauthorized: false` (Neon presents a valid one, and the old setting was weaker than it needed to be), `migrations/002_rls_supabase.sql` is parked and skipped unless `--supabase` is passed, and `.env.example` leads with Neon.

**Consequences.** Hard rule 5 (role separation) rests entirely on `middleware.ts` and `requireOwner()`, since there is no RLS. Both are in place and tested; the RLS file stays for a future move.

Hard rule 9 (private recordings) is met by the auth-gated proxy at `/api/leads/:id/recording` rather than a private bucket with signed URLs — the browser never sees the upstream URL either way. **This is weaker in one respect:** a Vaani recording URL can expire, and we no longer keep our own copy. Noted as a TODO in `lib/storage.ts`; Vercel Blob or S3 is the fix when recordings need to outlive Vaani's retention window.

**Rejected.** `@neondatabase/serverless` over HTTP. It is a better fit for edge functions, but every route here is Node runtime, `pg` against the pooler is sufficient, and it keeps local development identical to production.

---

## 2026-10-09 — Calendly, not Cal.com

**Decision.** Radhika chose Calendly. `lib/calcom.ts` is replaced by `lib/calendly.ts` against Calendly API v2.

**I was wrong when I pushed back.** I argued Calendly could not book on a caller's behalf and that the flow would have to fall back to sending a scheduling link. That was true of the older API and is no longer: Calendly's Scheduling API exposes `POST /invitees`, which creates the booking server-side with no invitee click, and fires the normal invites, reminders and workflows. The caller experience is therefore identical to the Cal.com design — the agent books inside the call.

**Shape.** `GET /event_type_available_times` for availability (max 31-day window), `POST /invitees` to book, `POST /scheduled_events/{uuid}/cancellation` to release. Auth is a personal access token.

**Two constraints that matter.** It needs a **paid** Calendly plan — a free plan returns 403 on booking. And `location` must be omitted entirely for an event type with no location, or Calendly rejects the request; hence `CALENDLY_LOCATION_KIND`, which is deliberately empty by default.

**Improvement over the Cal.com build.** Offered slots are now our 12–4pm IST grid **intersected with Calendly's real availability**, instead of our database alone. If Calendly is unreachable the intersection is skipped rather than failing, so an outage degrades to our own calendar instead of refusing to book.

**New: `POST /api/calendly/webhook`.** Handles `invitee.created` and `invitee.canceled`, signature-verified with a five-minute replay window. This closes a hole the Cal.com build had: a designer booking a slot directly in the calendar would otherwise still be offered to the next caller. A direct booking now holds the slot as its own lead; a cancellation frees the slot and keeps the lead.

**Schema.** `calcom_booking_id` became `calendly_event_uri`, plus `calendly_cancel_url`. Renamed in `001_init.sql` rather than added as a migration, because no database has ever been created from it yet.

**Rejected.** The single-use scheduling-link fallback. It is what you build when the API cannot book for you, and it no longer has to.
