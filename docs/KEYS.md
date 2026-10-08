# Keys needed, in the order they unblock things

Send them however you like — I'll put each one into Vercel (production) and your
local `.env`, then run the step it unblocks. Nothing here is committed; `.env` is
gitignored and Vercel values are stored encrypted.

**Already set, nothing needed from you:** `SESSION_SECRET`, `CRON_SECRET`,
`APP_URL`, `GEMINI_MODEL`, `COST_VAANI_INR_PER_MIN`,
`COST_GEMINI_INR_PER_1K_INPUT`, `COST_GEMINI_INR_PER_1K_OUTPUT`.

---

## 1. Neon — blocks everything

| Key | Where to find it |
|---|---|
| `DATABASE_URL` | Neon console → your project → **Connection string** → tick **Pooled connection**. The host must contain `-pooler`. |

Looks like:
`postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/aangan?sslmode=require`

> Take the **pooled** one. The direct endpoint works locally and then runs out of
> connections on Vercel, because every serverless invocation opens its own.

**Unblocks:** the entire app. I run `db:migrate` and `db:seed`, and the board and
dashboard go live with 14 leads.

---

## 2. Gemini — grading

| Key | Where |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio → **Get API key** |

**Unblocks:** real grading of real calls, and `npm run eval` against the live
model. Without it leads are stored and held at Warm rather than lost.

---

## 3. Vaani Labs — the voice agent

| Key | Notes |
|---|---|
| `VAANI_API_KEY` | |
| `VAANI_AGENT_ID` | The agent you create from `vaani_agent_prompt.md` |
| `VAANI_PHONE_NUMBER` | The number callers dial |
| `VAANI_WEBHOOK_SECRET` | **You choose this** — any long random string. Paste the same value into Vaani's webhook config. |
| `VAANI_TOOL_SECRET` | **You choose this** — same idea, for the two live call tools. |

Three things to set inside Vaani, not here:

1. **System prompt** → paste `vaani_agent_prompt.md`.
2. **Knowledge** → upload `rubric.md`.
3. **Call-ended webhook** → `https://aangan-leads.vercel.app/api/vaani/call-ended`
   with header `x-vaani-secret: <VAANI_WEBHOOK_SECRET>`.

**One question I cannot answer from the docs:** can Vaani call our HTTP tools
*during* a live call? If yes, register these two and the agent books inside the
call:

- `POST https://aangan-leads.vercel.app/api/vaani/tools/slots`
- `POST https://aangan-leads.vercel.app/api/vaani/tools/book`

both with header `x-tool-secret: <VAANI_TOOL_SECRET>`.

If no, tell me and I'll switch to the fallback that's already specified: the
agent collects two preferred slots and the webhook books right after the call.

---

## 4. Calendar — please confirm which product

The brief says **Cal.com**, and that is what is built. You said *Calendly* —
they're different products with different APIs. If you want Calendly I need to
rewrite `lib/calcom.ts`; it's maybe an hour, and worth knowing before you buy a
plan.

**If Cal.com:**

| Key | Where |
|---|---|
| `CALCOM_API_KEY` | Cal.com → Settings → Developer → API keys |
| `CALCOM_EVENT_TYPE_ID` | The numeric id of one **shared** event type: 1 hour, 12/1/2/3/4pm IST, Mon–Sat |

> Note: Calendly's API cannot create a booking on someone else's behalf the way
> this flow needs — it's built around the invitee following a link. That is the
> main reason the brief chose Cal.com.

**Unblocks:** real consultation bookings. Until then the shared calendar lives in
our own database, which still prevents double booking.

---

## 5. Telegram — alerts

| Key | Where |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Message **@BotFather** → `/newbot` |
| `TELEGRAM_DESIGNER_CHAT_ID` | Add the bot to the designers' group, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `chat.id` (negative for groups) |
| `TELEGRAM_OWNER_CHAT_ID` | Same, for Nikhil's direct chat |

**Unblocks:** hot-lead pushes, the urgent escalation alert, the 9pm digest.

---

## 6. HubSpot — CRM

| Key | Where |
|---|---|
| `HUBSPOT_PRIVATE_APP_TOKEN` | HubSpot → Settings → Integrations → Private Apps → create one |
| `HUBSPOT_PIPELINE_ID` | **Don't look for this** — give me the token and I run `npm run hubspot:setup`, which creates the pipeline and prints the id |

Scopes the private app needs: `crm.objects.contacts.read/write`,
`crm.objects.deals.read/write`, `crm.schemas.deals.read/write`.

**Unblocks:** a deal created the first time a designer moves a card out of New,
and stage sync on every move after.

---

## 7. Cron — after the database is live

Nothing to buy. At [cron-job.org](https://cron-job.org), every 10 minutes:

```
GET https://aangan-leads.vercel.app/api/cron?secret=<CRON_SECRET>
```

I have the `CRON_SECRET` and will give you the exact URL to paste once Neon is in.

**Unblocks:** queued night-time pushes, hot-lead nudges, overdue callback alerts,
HubSpot retries, the 9pm digest.

---

## Also worth deciding

**The live URL is currently Vercel-protected** — only someone logged into your
Vercel account can open it. Fine while building; say the word and I'll make it
public so Nikhil can see it. The app has its own magic-link sign-in either way,
so "public" only means the login page is reachable.
