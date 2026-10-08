# Aangan Leads: Claude Code Build Brief

> Save this file as `CLAUDE.md` in an empty project folder. Claude Code reads it at the start of every session.
> Work **phase by phase**. Stop after each phase, tell me what you built and how to test it, and wait for "next".
> **Start with Phase 0.** Do not write app code until I have sent the MD files and approved `rubric.md`.

---

## 1. What we're building

**Aangan Leads** answers every phone enquiry to Aangan Studio (interior design, Pune, ~200 enquiries/month, average project ₹8–14 lakh), day or night. It runs a fixed intake conversation, books in-scope callers into a consultation slot, grades every lead **Hot / Warm / Low**, and gives designers a card board and Nikhil a sales overview.

### End-to-end flow

```
Caller ─► Vaani voice agent (reads vaani_agent_prompt.md, backed by rubric.md)
            │  asks the 8 intake questions · never quotes a price · handles off-script safely
            │  in-scope caller? ─► books 1 of 5 shared slots (12–5pm) in Cal.com, live
            ▼
        call ends ─► POST /api/vaani/call-ended ─► Supabase (one row per lead)
            ▼
        Gemini Flash (one call, rubric.md): extract fields · grade HOT/WARM/LOW/ESCALATE · summary · handoff note
            ▼
        ├─► Telegram: "🔥 Hot lead AAN-0042 is on your board, please update it"   (ESCALATE → Nikhil, 🔴 URGENT)
        ├─► Designer Board (Kanban cards) ─ designer drags the card through the funnel
        │        └─► every stage move syncs to the HubSpot deal stage
        └─► Owner Dashboard (Nikhil): volume · sources · cost · pipeline · conversions
```

---

## 2. Phase 0: Source files and rubric (before any code)

1. **Ask me for the source files and wait until I send them:**
   - `services.md`: what the studio does and doesn't do, and the service area
   - `pricing.md`: internal per-sq-ft bands ("indicative only, varies by site")
   - `qualified.md`: Nikhil's description of a lead worth a designer's time
   - `enquiries/`: sample enquiry transcripts (if available)
   Save them under `source/`. **Do not invent their contents.**
2. From them, draft **`rubric.md`** using the structure in section 3, and **`vaani_agent_prompt.md`** using the structure in section 4.
3. Show me both drafts. List every place where the source files were unclear, and wait for my approval.
4. Log the approval in `docs/DECISIONS.md`. From then on, `rubric.md` is the single source for grading. **Code never hardcodes criteria. It always reads `rubric.md`.**

---

## 3. `rubric.md`: required structure

`rubric.md` sits behind the voice agent (loaded into Vaani's knowledge) **and** is the system prompt for Gemini's grading.

1. **Scope.** Services offered and not offered, from `services.md`. Scope options: full home · partial home · single room · painting only · office fit-out · other.
2. **Service area.** The localities served, from `services.md`.
3. **Intake questions** (in this order, conversational, not like a form):
   1. Name, best number, email (spelled back)
   2. Property type (1/2/3 BHK, villa, office…)
   3. Carpet area (sq ft)
   4. Location / locality
   5. What they want done: full home / partial / one room / painting only
   6. Style they like
   7. Budget they have in mind
   8. When they want to move in or start
   9. Who else decides
4. **Off-script policy** (see section 4).
5. **Price policy.** The agent never gives a price, range or per-sq-ft rate. If asked, it says: *"Every home is different, so our designer shares pricing after understanding your space. What budget did you have in mind?"*
6. **Grading** (applied by Gemini after the call):

| Grade | Rule |
|---|---|
| **HOT** | In service area and scope, AND stated budget ≥ internal estimate minimum (pricing band × carpet area), AND timeline ≤ 3 months |
| **WARM** | In area and scope, AND (budget **within 20% below** the estimate minimum, OR **budget not stated**, OR timeline 3–6 months, OR area unknown) |
| **LOW** | Budget **more than 20% below** the estimate minimum, OR outside service area or scope, OR timeline > 6 months, OR advice only |
| **ESCALATE** | Existing client with a complaint or issue. This is not graded as a lead. Goes to Nikhil immediately. |
| **NOT_ENQUIRY** | Wrong number, sales pitch, job seeker, spam |

   Budget care: never grade LOW just because a budget wasn't stated. That case is WARM. When the agent is unsure, prefer WARM over LOW.
7. **Booking eligibility** (live, by Vaani): the caller is in the service area and scope **and** gave a carpet area. A budget is not required to book.
8. **Output JSON schema** that Gemini must return (fields, criteria with pass/fail/unclear, grade, grade_reason, summary, handoff_note, insights, price_mentioned, off_script_count, confidence).

---

## 4. `vaani_agent_prompt.md`: required structure

Order: **personality → context → conversation flow → off-script handling → guardrails → close.**

- **Opening:** *"Namaste, thank you for calling Aangan Studio. This call is recorded so our designers can help you better. May I know your name?"* Match the caller's language (English / Hindi / Marathi).
- **Flow:** the 9 intake items from rubric section 3.
- **Off-script handling (strict, no improvising):**
  - The agent answers only from `rubric.md`. If the caller asks anything outside it, the agent **must not guess, invent or loop**. It says:
    *"That's something I can't answer on this call. Would you like me to pass it to a designer, or shall we continue with a few quick questions?"*
  - If they choose the designer: note the question in the call, and mark it for the handoff.
  - If they say "continue" or "next": go to the next unanswered intake question.
  - After a 2nd off-script question in a row: offer the designer callback once more and move on. Never argue, never repeat the same answer three times.
- **Booking (in-scope callers only):** offer the free shared slots for the next working days, **12pm, 1pm, 2pm, 3pm or 4pm (1 hour each)**. Read back the confirmed slot.
- **Not booked:**
  - 10am–6pm on working days: *"A designer will call you within 1 hour."*
  - Any other time: *"A designer will call you by 11am tomorrow."*
  - **Never promise what the studio can't keep.**
- **Close:** read back the email, slot (if booked) and ticket number. Ask: *"Anything else I should pass on?"* Keep the call under 5 minutes.
- **Guardrails:** no price ever; no promises on timelines, discounts or materials; no comments on competitors; existing-client complaints → *"I'll have Nikhil's team call you right away."*

---

## 5. Hard rules

1. **No price reaches the caller** (voice, invite, message). The internal estimate appears only on the Designer Board and the Owner Dashboard, labelled **"internal — never share"**.
2. **Nothing is silently dropped.** LOW leads appear on the board until a designer moves them to *Not converted* with a reason.
3. **The callback promise is stored** (`callback_due_at`) exactly as spoken, and is tracked.
4. **No double booking.** One shared Cal.com event type, 5 one-hour slots a day (12–5pm, working days). The booking tool re-checks availability right before booking, and the DB has a unique constraint on `booked_at`.
5. **Role separation.** Designers cannot open the Owner Dashboard (blocked in middleware **and** RLS). The owner can see everything.
6. **Each post-call step** (Gemini, Telegram, HubSpot, storage) runs in its own try/catch and logs to `step_errors`.
7. **Idempotent** on `vani_call_id`.
8. **Full cost:** `cost_inr = vaani_cost_inr + llm_cost_inr`.
9. **Recordings:** private Supabase Storage bucket, signed URLs only.
10. **Secrets only in env.** Escape all caller text in Telegram HTML.

---

## 6. Verify before building (don't guess API shapes)

| Unknown | If no / unknown |
|---|---|
| Can Vaani call our HTTP tools **during** a call (for the live Cal.com booking)? | Fallback: the agent collects 2 preferred slots, the webhook books right after the call, and the caller hears "you'll get the invite in a few minutes" |
| Vaani's call-ended payload; structured fields; recording URL expiry; transcript timestamps; cost in payload | `normalizeVaniPayload` placeholder; Gemini extracts fields; always copy the recording; cost = duration × rate |
| Cal.com v2 slots and booking endpoints | Ask me to paste the docs |
| HubSpot pipeline + stage IDs | Script creates the pipeline (section 9) and prints the IDs |

Mark every assumption with `// ASSUME:` and list them at the end of each phase.

---

## 7. Stack and env

Next.js (App Router, TS) + Tailwind + shadcn/ui · **dnd-kit** for the board · Recharts · Supabase (Postgres, magic link, Storage) · Gemini Flash (one call per lead, temperature 0, Zod-validated, retry once) · Vaani Labs · Cal.com API v2 · Telegram Bot API · HubSpot CRM API · Vercel + GitHub · timezone `Asia/Kolkata`.

```
VAANI_API_KEY=            VAANI_AGENT_ID=           VAANI_PHONE_NUMBER=
VAANI_WEBHOOK_SECRET=     VAANI_TOOL_SECRET=
CALCOM_API_KEY=           CALCOM_EVENT_TYPE_ID=
GEMINI_API_KEY=           GEMINI_MODEL=
TELEGRAM_BOT_TOKEN=       TELEGRAM_DESIGNER_CHAT_ID=  TELEGRAM_OWNER_CHAT_ID=  TELEGRAM_WEBHOOK_SECRET=
HUBSPOT_PRIVATE_APP_TOKEN=  HUBSPOT_PIPELINE_ID=
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY=  SUPABASE_SERVICE_ROLE_KEY=
APP_URL=                  CRON_SECRET=
COST_VAANI_INR_PER_MIN=   COST_GEMINI_INR_PER_1K_INPUT=   COST_GEMINI_INR_PER_1K_OUTPUT=
```

---

## 8. Data model

**`users`**: email (pk), name, role (`owner` | `designer`), telegram_chat_id. Drives auth, roles and RLS.

**`leads`**: one row per call.

| Group | Columns |
|---|---|
| Identity | id, `ticket_no` (AAN-0001), `vani_call_id` unique, raw_payload, created_at |
| Caller | caller_name, caller_number, caller_email |
| Call | started_at, duration_s, ended_reason, recording_path, transcript (jsonb `[{speaker,text,t}]`), off_script_count, off_script_questions (text[]) |
| Requirement (`fields` jsonb) | property_type, carpet_area_sqft, locality, scope, style, budget_inr_min/max, move_in_by, decision_maker, source (referral / Instagram / Google / other, if mentioned) |
| Grading | grade (HOT/WARM/LOW/ESCALATE/NOT_ENQUIRY), grade_reason, criteria jsonb, est_min_inr, est_max_inr, budget_fit (fits / close / below / unknown), confidence, price_mentioned, flags text[] |
| AI notes | summary, handoff_note, insights jsonb (intent, concerns, objections, suggested_opener) |
| Booking | calcom_booking_id, booked_at (unique), callback_due_at, callback_done_at |
| Funnel | `stage` (see section 9), assigned_to (users.email), lost_reason, deal_value_inr, stage_changed_at |
| CRM | hubspot_contact_id, hubspot_deal_id |
| Ops | telegram_sent_at, step_errors jsonb, vaani_cost_inr, llm_cost_inr, cost_inr |

**`lead_events`**: lead_id, at, by, type (created / graded / booked / stage_change / note / telegram / hubspot_sync), from_stage, to_stage, note. This powers the activity timeline and funnel analytics.

`lib/pricing.ts`: bands from `pricing.md` plus `estimate(area, scope, tier)`. Comment at the top: **"Never reaches a caller-facing surface."**

---

## 9. Funnel stages (Designer Board columns = HubSpot deal stages)

| Board column | HubSpot stage | Notes |
|---|---|---|
| **New** | (no deal yet) | Every graded lead lands here, sorted HOT → WARM → LOW, then by age |
| **Contacted** | In progress: Contacted | The deal is created the **first time a designer moves the card out of New** |
| **Consultation booked** | In progress: Consultation | Auto-set if Vaani booked a slot |
| **Site visit** | In progress: Site visit | |
| **Proposal sent** | In progress: Proposal | Designer enters `deal_value_inr` |
| **Converted** | Closed won | |
| **Completed** | Completed (custom) | Project delivered |
| **Not converted** | Closed lost | Requires `lost_reason` |

`scripts/hubspot-setup.ts` creates this pipeline and the custom property `ai_call_cost_inr`, then prints the IDs. Every stage move goes through `PATCH /api/leads/:id/stage` → update the row → log a `lead_events` entry → sync the HubSpot deal (in try/catch, retried by cron on failure).

---

## 10. Webhook and alerts

- **During the call** (if Vaani supports tools): `POST /api/vaani/tools/slots` returns free slots in the next working days as spoken phrases plus ISO times (cached 30s). `POST /api/vaani/tools/book` re-checks the slot, then books it. Both check `x-tool-secret`, respond in under 2s, and are idempotent.
- **After the call:** `POST /api/vaani/call-ended`
  1. verify the secret
  2. `normalizeVaniPayload` (the only file that knows Vaani's shape)
  3. upsert on `vani_call_id`
  4. return 200, then do the rest in `after()`: copy the recording → one Gemini call with `rubric.md` → compute the estimate and budget fit in code (**code check overrides Gemini's grade if they conflict on budget math**) → set `stage` (`Consultation booked` if a slot was booked, else `New`) → set `callback_due_at` → costs → Telegram
- **Telegram (generic notifications):**
  - HOT/WARM → designer chat: *"🔥 Hot lead AAN-0042 (Baner · 3BHK full home) is on your board. Please update it."* plus a link.
  - LOW → no push; it's included in the daily digest.
  - ESCALATE → owner chat **🔴 URGENT**, any hour.
  - Designer pushes between 9pm and 9am are queued for 9am.
- **Cron** `GET /api/cron` (with `CRON_SECRET`, triggered every 10 minutes from cron-job.org):
  - queued pushes
  - nudges for HOT cards still in New after 1 working hour
  - overdue callbacks
  - retries failed HubSpot syncs
  - 9pm digest to Nikhil

---

## 11. Dashboards

**Look:** clean and calm, Notion-like. Light, warm off-white background (`#FBFAF8`), white cards, 1px `#ECEAE6` borders, 10px radius, Inter or Geist, generous spacing. Grade chips: HOT `#E5484D` · WARM `#F5A524` · LOW `#8E8E8E` · ESCALATE `#7C3AED`, **always with a text label**. Mobile-first, because designers open it from Telegram.

### A. Designer Board `/board` (designers + owner)
- **Kanban** with the 8 columns from section 9, drag-and-drop with dnd-kit, and a count per column.
- **Card:** name · ticket no · grade chip · locality · scope · carpet area · budget-fit chip · slot (if booked) · assigned designer avatar · age.
- **Filters:** grade, assigned to me / all, locality, date. A "Claim" button assigns the card.
- **Card detail** (side panel; full screen on mobile):
  - Contact (tap to call)
  - Requirement grid
  - Budget vs internal estimate (labelled internal) + grade reason
  - Handoff note + suggested opener
  - Off-script questions the caller asked
  - Recording player
  - Transcript
  - Activity timeline
  - Stage dropdown (an alternative to dragging)
  - Notes
- **Calendar tab `/board/calendar`:** a week view of the 5 daily slots, showing booked (name + ticket) or free. Clicking a booking opens the card.
- **Owner's view of the board:** the same board, plus a designer filter and a column showing each designer's load. Designers see the board only.

### B. Owner Dashboard `/owner` (owner only, VP-of-sales snapshot)
- **Top KPI row** (this week · this month · vs last month):
  - Leads in
  - Hot / Warm / Low mix
  - % answered within 5 min
  - Total cost · cost per lead · cost per Hot lead
  - Pipeline value (sum of internal estimate midpoints for open leads)
  - **Forecast** (pipeline × historical stage conversion rate)
  - Converted (count + ₹)
  - Conversion rate
- **Charts:**
  - leads over time stacked by grade
  - **where leads come from** (by locality and by source)
  - funnel New → Converted with drop-off % per stage
  - **cost vs revenue** by month
  - calls by hour × weekday heatmap (10am–7pm outlined)
- **Team table:** per designer, showing leads claimed, median time to first contact, consultations, conversions.
- **Insight card:** 3–5 bullets computed in code, for example: "4 Hot leads in New for over 1 hr", "Baner + Wakad = 45% of Hot leads", "Low leads mostly kitchen-only under ₹3L", "7 callers asked off-script about modular kitchens."
- **Health strip:**
  - prices spoken (target 0)
  - callbacks on time (≥95%)
  - Gemini vs code grade agreement (≥95%)
  - HubSpot sync failures

---

## 12. Project memory (local and on Git)

- `docs/CONTEXT.md`: current state, under 150 lines (built, in progress, next step, env status, open `// ASSUME:` notes, bugs, run/test/deploy).
- `docs/DECISIONS.md`: append-only, with date, decision, why and what was rejected.
- `CHANGELOG.md`: one entry per commit.

**Rules:**
- Read all three at the start of each session, then summarise in 3 lines.
- Update them in the same commit as the change.
- `.githooks/pre-commit` blocks commits that change code, `rubric.md` or `vaani_agent_prompt.md` without updating `CONTEXT.md` and `CHANGELOG.md`.
- Commit messages: `phase-N: <change>`. Push at the end of each phase and whenever I say "save". Run "wrap up" before context runs out.
- The latest `DECISIONS.md` entry wins over this brief; tell me when they conflict.
- Never put secrets or real caller data in these files.

---

## 13. Phases

**Phase 0: Source files → `rubric.md` + `vaani_agent_prompt.md`** (wait for my files and my approval; this is outside the build clock)

### ⏱ 1-hour demo slice (seeded leads, no live phone needed)

| Min | Phase | Done when |
|---|---|---|
| 0–12 | **P1 Scaffold:** app, migration (`users`, `leads`, `lead_events`), magic link + roles, memory files + hook, `lib/` stubs, seed 12 leads across all grades and stages | `npm run dev` works, first commit made |
| 12–28 | **P2 Intake pipeline:** call-ended webhook, Gemini + Zod with `rubric.md`, estimate + budget fit, grading, `scripts/replay.ts` | replay creates a graded lead on the board |
| 28–46 | **P3 Designer Board:** Kanban + drag + card detail (recording, transcript) + stage API + Telegram push | dragging a card logs an event, and Telegram fires on a new HOT lead |
| 46–60 | **P4 Owner Dashboard (core):** KPI row, funnel, leads by locality, cost vs revenue, insight card. Deploy to Vercel. | live URL + `DEMO.md` |

**Cut line, if behind:** heatmap → team table → board filters. **Never cut:** grading, the board with drag, card detail with transcript and recording, cost per lead, funnel.

### v1.1 (one phase per session)
- **P5 Live voice + Cal.com:** Vaani tools or the fallback booking, the real payload, the calendar tab, no-double-booking test.
- **P6 HubSpot:** setup script, deal creation on the first move, stage sync + retry, revenue from won deals.
- **P7 Eval:** run `seed/test-set.json` through Gemini and print expected vs got. Exit non-zero on a false LOW (a lead expected HOT/WARM that came back LOW) or on a spoken price.
- **P8 Dummy calls:** place 8 calls (clear yes, wrong area, advice only, 3-week deadline, low budget, rude caller pushing for a price 3×, existing client complaint, unclear locality and decision-maker) **plus 2 off-script calls**. Check each row and report what failed and why.
