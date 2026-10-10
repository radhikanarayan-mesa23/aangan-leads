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

---

## 2026-10-09 — back to Cal.com

**Decision.** Radhika moved the calendar back to Cal.com. `lib/calendly.ts` is replaced by `lib/calcom.ts` against Cal.com API v2.

**Nothing was lost in the round trip.** The three improvements made while Calendly was in place were carried over rather than reverted:
1. Offered slots are our 12–4pm IST grid **intersected with the provider's real availability**, degrading to our own calendar if the provider is unreachable.
2. If the provider refuses a slot mid-call, our hold is released and the agent offers another time instead of confirming a booking that does not exist.
3. A signature-verified provider webhook, now `POST /api/calcom/webhook` for `BOOKING_CREATED` and `BOOKING_CANCELLED`. This closes the hole the original Cal.com build had: a slot booked directly in the calendar would otherwise still be offered to the next caller.

**Shape.** `GET /v2/slots` (`cal-api-version: 2024-09-04`), `POST /v2/bookings` (`2024-08-13`), `POST /v2/bookings/{uid}/cancel`. The version header is mandatory — omitting it returns 404 and a wrong value silently falls back to an older response shape, so both are pinned as constants. The slots parser accepts both the date-keyed object and the flat array, because the published examples disagree.

**Schema.** `calendly_event_uri` → `calcom_booking_uid`, `calendly_cancel_url` → `calcom_cancel_url`, via `migrations/003_calcom.sql`. This is a real migration, not an edit to `001`, because the database is already live on Neon with 14 rows. It is idempotent and safe on a fresh database.

**Why this is better than the first Cal.com build.** `scripts/verify-db.ts` now applies the whole migration chain in order rather than just the initial schema, so migrations are tested as a sequence.

**Open risk.** Two GitHub issues report `POST /v2/bookings` rejecting a `title` field the docs do not list as required, and `/v2/slots` returning times `/v2/bookings` then refuses. `title` is sent in `bookingFieldsResponses` defensively. Neither is confirmed against a live account — the first real booking is the test.

---

## 2026-10-09 — HubSpot credential: legacy private app now, Service Key later

**Decision.** Authenticate with a legacy private app token.

**Why, given it is being retired.** HubSpot has moved private apps under
*Development → Legacy Apps* and disables creation for existing accounts on
**26 October 2026** — seventeen days out. Tokens already issued are explicitly
not revoked. The legacy private app is documented, stable, and what
`lib/hubspot.ts` is written against, so it is the fastest safe route today.

**The successor** is Service Keys (*Settings → Integrations → Service Keys*),
currently public beta. It is a bearer token against the same CRM endpoints, so
`HUBSPOT_PRIVATE_APP_TOKEN` takes either and no code should need to change.

**Follow-up owed.** Migrate to a Service Key once it leaves beta, and re-run
`npm run hubspot:setup` to confirm nothing shifted.

**Rejected.** Going straight to Service Keys now. It is beta, the auth shape is
unverified against this codebase, and the fallback path would be closed by the
time we found out.

---

## 2026-10-09 — rubric.md v1.1 approved, plus a ₹8L budget floor

**Approval.** Radhika confirmed all six assumptions carried in v1.0 §14 as-is: Mon–Sat working days; unlisted Pune/PCMC localities are *unclear*, never a fail; painting-only is not offered; ₹3.5L–₹8L is the right band for a single room; 2,000 sq ft is the large-job threshold; an office over 3,000 sq ft is *unclear* rather than an automatic decline. §14 is now the record of that decision rather than a list of open questions.

**New rule.** A stated budget of **₹8,00,000 or more passes C3 on its own**, whatever the per-sq-ft estimate says. Aangan's average project is ₹8–14 lakh, so a caller at that figure is worth a designer regardless of how the arithmetic lands.

**How it is implemented.** The threshold lives in `rubric.md` §7 and is *parsed* by `lib/rubric.ts` as `hotBudgetFloorInr` — not hardcoded. `budget_fit` still records the arithmetic truth (`fits` / `close` / `below` / `unknown`) because the board and dashboard need it; only the C3 verdict changes. A lead that passes on the floor rather than the maths gets flag `BUDGET_FLOOR`, and its grade reason says so plainly: *"budget clears the ₹8L floor"*, never "budget covers the estimate".

**Effect.** Exactly one seeded lead moved: AAN-0004, Sameer Joshi — 900 sq ft in Kothrud, ₹14L against a ₹16.2L minimum. Previously Warm on `close`; now **Hot**. Worked example C in §13 was updated to match.

**The risk, stated.** The floor is absolute, so ₹8L on a 2,000 sq ft villa (estimate ~₹36L) would also grade Hot. The card still shows *Budget below*, so a designer sees the gap before the consultation — but if that starts wasting designer time, the fix is to require the budget also be within some fraction of the estimate. Worth watching once real calls are flowing.

**Rejected.** Making the floor replace `budget_fit` entirely. The dashboard's pipeline value and the designer's "can they actually afford this" judgement both need the arithmetic kept.

---

## 2026-10-09 — premium blue theme from the Show Prime badge

**Decision.** The palette comes from the ID badge Radhika supplied: deep navy ground, royal blue gradient, silver-periwinkle highlights. The layout reference was an agent-console screenshot — a light page carrying one dark hero card.

**What I kept light.** The page stays cool off-white rather than going fully dark. A designer reads this board between site visits on a phone, and a dense Kanban of fourteen cards in dark mode is harder to scan, not more premium. The weight goes into the hero band and the navy ink instead — restraint reads as expensive, decoration does not.

**Grade chips stayed semantic.** Hot is still red, warm amber, escalate purple, retuned to sit beside the blue. Making them all blue would have looked cleaner and destroyed the one thing the board is for. They still carry their word, so colour is never the only signal.

**Everything is still a token.** `app/globals.css` holds the whole palette as CSS variables; no component hardcodes a colour. The next rebrand is the same one-file job this one was.

**Rejected.** A fully dark dashboard, for the readability reason above. Also rejected: recolouring the grade chips into the brand ramp.

---

## 2026-10-10 — designers see the whole board, not only their own leads

**Decision.** Confirmed by Radhika. A designer signs in to the **Board** and the **Calendar** and nothing else. On the board they see **every** lead, including ones nobody has claimed — not a filtered view of their own.

**Why not "only mine".** A new Hot lead belongs to nobody. If designers could only see their own, no one would ever see it to pick it up, and every lead would need Nikhil to assign it by hand — which puts a person back in the path the system exists to remove. The **Mine** filter narrows to their own work in one click when they want it.

**How role separation is enforced** — three independent layers, so removing any one does not open the door:
1. `middleware.ts` redirects `/owner` to `/board?denied=owner`
2. `requireOwner()` blocks the page render
3. the nav never offers the Overview tab

`/api/owner/brief` returns 403 to a designer. The owner-only board extras — designer filter, team load strip — do not render. Verified in production against a real designer session.

**What designers *do* see, deliberately:** the internal estimate on the card, labelled *internal — never share*. A designer needs to know whether a caller's stated budget covers the job before walking into a consultation. Pipeline value, forecast, cost per lead and the daily brief stay with Nikhil.

**Rejected.** Showing designers only their assigned leads, for the stalling problem above. A middle path — own leads plus the unclaimed pool — was offered and not needed.

---

## 2026-10-10 — the agent follows the caller's language, and we record it

**Decision.** Dynamic language switching is on, and every call records which languages the caller used.

**What was actually wrong.** `senses_capabilities.auto_detect` was true, but speech-to-text was pinned to `language: "en"`. A Pune caller who opens in English and slips into Hindi for the budget would have had that Hindi transcribed as nonsense — and since the grade is derived from the transcript, the grade would have followed it. Auto-detect at the top level was a setting that looked right and did nothing.

**Now:** Deepgram `nova-3` runs with `language: "multi"`, which code-switches mid-sentence rather than guessing one language per call. The LLM follows via `brain.llm.auto_detect` — note the published docs call this `auto_detect_llm`, which the API silently ignores; the stored field is `auto_detect`. Enabling it also swapped the primary model to a multilingual one on the platform's side.

**Also added: 40 recognition keywords** — every served locality plus `BHK`, `carpet area`, `lakh`, `modular kitchen`, `possession`, `vastu`. This is the difference between hearing "Wakad" and "worked", which decides whether C1 can be judged at all.

**And lowered the agent's temperature from 0.7 to 0.3.** It reads from a rubric and is forbidden from improvising; 0.7 invites exactly the embroidery the guardrails exist to prevent.

**On the dashboard.** `rubric.md` v1.2 asks Gemini for `languages` (in the order the caller used them) and `language_switched`. The panel shows the mix, the share who switched mid-call, and **win rate by language** — which for a Pune studio is a staffing question: if a third of callers open in Marathi, that is who the designer ringing them back needs to be.

**Why count the opening language.** A lead sits under the language the caller *started* in, because that is what the agent had to handle first and what a human receptionist would have needed to speak. Switching is counted separately, since it is the hard case and worth watching on its own.

**Rejected.** Counting every language equally per call — it would have made a caller who said two words of Hindi look like a Hindi caller, and inflated the case for Hindi-speaking designers.
