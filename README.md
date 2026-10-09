# Aangan Leads

Answers every phone enquiry to Aangan Studio — interior design, Pune, ~200 enquiries a month — day or night. Runs a fixed intake, books in-scope callers into a consultation slot during the call, grades every lead Hot / Warm / Low, and gives designers a board and Nikhil a sales overview.

```
Caller ─► Vaani voice agent  (vaani_agent_prompt.md, backed by rubric.md)
            │  10 intake questions · never quotes a price · books a slot live
            ▼
        POST /api/vaani/call-ended ─► Postgres on Neon (one row per call)
            ▼
        Gemini Flash (one call, rubric.md as the system prompt)
            ▼  code recomputes the estimate, budget fit and grade — and wins
        ├─► Telegram   (Hot/Warm → designers · Escalate → Nikhil, any hour)
        ├─► /board     (Kanban, 8 stages, synced to HubSpot deal stages)
        └─► /owner     (volume · sources · cost · pipeline · conversions)
```

**`rubric.md` is the single source for grading.** It sits behind the voice agent and is the system prompt for Gemini. Code never restates the criteria — `lib/rubric.ts` parses them.

See [DEMO.md](DEMO.md) to run it, [docs/CONTEXT.md](docs/CONTEXT.md) for current state, and [docs/DECISIONS.md](docs/DECISIONS.md) for why things are the way they are.

## Layout

| Path | What lives there |
|---|---|
| `rubric.md` | Scope, service area, intake, price policy, estimate, criteria, grades, booking |
| `vaani_agent_prompt.md` | The voice agent's system prompt |
| `source/` | Nikhil's original files — never edited |
| `lib/rubric.ts` | The only parser of `rubric.md` |
| `lib/pricing.ts` | Internal bands. Never reaches a caller-facing surface |
| `lib/grading.ts` | C1–C5, the ladder, and the code override on budget maths |
| `lib/vaani.ts` | The only file that knows Vaani's payload shape |
| `lib/calendly.ts` | Calendly v2 — availability, booking on the caller's behalf, cancellation |
| `app/board` · `app/owner` | Designer board and owner dashboard |
| `scripts/` | `migrate` · `seed` · `replay` · `check-grading` · `eval` · `hubspot-setup` |
