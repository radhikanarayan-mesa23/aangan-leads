# How to test

## Without a phone number — works today

```bash
npm run simulate-call                # a hot Baner lead
npm run simulate-call -- low         # Talegaon, out of area
npm run simulate-call -- escalate    # existing client complaining
npm run simulate-call -- hinglish    # caller switches English → Hindi
npm run simulate-call -- hot local   # against a local dev server
```

This POSTs to the deployed webhook in **exactly the shape Vaani sends** — the
multi-event envelope, duration in milliseconds, transcript as one `Agent:/User:`
string. It exercises the whole chain: webhook → Gemini → code grader → board →
Telegram → HubSpot.

Then look at what the pipeline made of it:

```bash
npm run show-call                    # the most recent call
npm run show-call -- <vani_call_id>  # a specific one
```

It prints the grade and why, every field extracted, the languages detected,
flags, the callback promise, whether Telegram fired, and any step that failed.

Clean up afterwards — simulated calls use a `sim-` prefix:

```sql
delete from lead_events where lead_id in (select id from leads where vani_call_id like 'sim-%');
delete from leads where vani_call_id like 'sim-%';
```

## The other checks

```bash
npm run check        # grading over 14 seeded calls — no DB, no API key
npm run verify:db    # schema + every query against an embedded Postgres
npm run eval         # 20 adversarial cases through the live model
```

`eval` exits non-zero on a **false LOW** or any call where the agent spoke a
price. Run it after every change to `rubric.md`.

## In the Vaani dashboard

- **Conversations → History** — every call, with transcript and recording
- **Developers → Logs** — webhook deliveries and their response codes
- **Developers → Webhooks → Test** — fires a sample delivery at our endpoint

> Their `GET /api/call-history` endpoint returns a 500 for this account: it
> builds an internal path from the client *name* (`"Radhika rara"`) and the
> space breaks the client-id parse. Their bug, not ours — use the dashboard.

## With a phone number — the real test

1. Dial the number.
2. Say: *"I have a 3BHK in Baner, about 1100 square feet, full home, around 22 lakh, moving in two months."*
3. **Ask the price twice.** It must refuse both times — that is the one guardrail that cannot bend.
4. Watch the lead appear on the board, graded, with a Telegram push.
5. `npm run show-call` to see exactly what was extracted.

Then work through the ten scenarios in `CLAUDE.md` P8: clear yes, wrong area,
advice only, three-week deadline, low budget, rude caller pushing for a price,
existing-client complaint, unclear locality and decision-maker, and two
off-script questions.
