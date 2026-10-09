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

## 2. Gemini — grading  ⚠️ the key supplied does not work

| Key | Where |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key** |

**What was sent:** `AQ.Ab8RN6…` — Google rejects it with
`401 UNAUTHENTICATED: "Expected OAuth 2 access token, login cookie or other
valid authentication credential."` I tried it three ways — `?key=`,
`Authorization: Bearer`, and `x-goog-api-key` — and as pasted and with the
internal space removed. All six rejected.

That string is a short-lived Google **OAuth access token**, not an API key.
Even if it authenticated it would expire within the hour, so it is not usable
as a stored credential.

**A real Gemini API key starts with `AIza`** and is about 39 characters.

**Unblocks:** grading of live calls, and `npm run eval`. Without it a call is
still stored and held at Warm — never lost — with the failure in `step_errors`.

## 3. Vaani Labs — the voice agent  ✅ mostly done

`VAANI_API_KEY` is set. **I generated the two secrets for you** and set them in
Vercel — you paste the same values into Vaani:

| Key | Status |
|---|---|
| `VAANI_API_KEY` | ✅ set |
| `VAANI_WEBHOOK_SECRET` | ✅ generated — `97d4f03ad108187143e217668a5fa59c6fadf1c44786a589` |
| `VAANI_TOOL_SECRET` | ✅ generated — `d0e6fa583734338ca1cb05c129011514f40f2209ba043429` |
| `VAANI_AGENT_ID` | ⬜ send it once the agent exists |
| `VAANI_PHONE_NUMBER` | ⬜ the number callers dial |

### Configure in Vaani

1. **System prompt** → paste `vaani_agent_prompt.md`.
2. **Knowledge** → upload `rubric.md`.
3. **Call-ended webhook**
   `https://aangan-leads.vercel.app/api/vaani/call-ended`
   header `x-vaani-secret: 97d4f03ad108187143e217668a5fa59c6fadf1c44786a589`
4. **Live call tools** — only if Vaani can call HTTP tools during a call:
   - `POST https://aangan-leads.vercel.app/api/vaani/tools/slots`
   - `POST https://aangan-leads.vercel.app/api/vaani/tools/book`

   both with header `x-tool-secret: d0e6fa583734338ca1cb05c129011514f40f2209ba043429`

   `slots` returns spoken phrases plus ISO times; `book` takes
   `{ call_id, start, name, email, phone }` and replies with a line for the
   agent to read out.

**Still unanswered:** can Vaani call HTTP tools *during* a call? If not, tell me
and I switch to the fallback that is already specified — the agent collects two
preferred slots and the webhook books right after the call.

## 4. Cal.com — booking

| Key | Status |
|---|---|
| `CALCOM_API_KEY` | ⬜ Cal.com → Settings → Developer → **API keys** |
| `CALCOM_EVENT_TYPE_ID` | ⬜ the **numeric** id of the shared event type |
| `CALCOM_WEBHOOK_SECRET` | ✅ generated — `1da46c44970fe66a33a3db7832e94b3c5c643c2ce1af89b7` |

**Two things to set up in Cal.com:**

1. **One event type** — 60 minutes, availability limited to **12, 1, 2, 3 and
   4pm IST, Mon–Sat**. That is what the agent offers. Its numeric id is in the
   event type's URL.
2. ~~A webhook~~ — **already registered for you** via the API (id `8c3d3ce1-05da-4b39-bf29-4a68ff53aeee`), covering `BOOKING_CREATED` and `BOOKING_CANCELLED`. This is what stops a slot booked directly in Cal.com from being offered again on the phone.

**Unblocks:** real bookings during the call. Until then the shared calendar
lives in our own database, which still prevents double booking.

## 5. Telegram — alerts

| Key | Where |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Message **@BotFather** → `/newbot` |
| `TELEGRAM_DESIGNER_CHAT_ID` | Add the bot to the designers' group, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `chat.id` (negative for groups) |
| `TELEGRAM_OWNER_CHAT_ID` | Same, for Nikhil's direct chat |

**Unblocks:** hot-lead pushes, the urgent escalation alert, the 9pm digest.

---

## 6. HubSpot — CRM

### Getting the token

> **HubSpot moved this.** Private apps now sit under **Development → Legacy
> Apps**, and HubSpot is retiring them: for existing accounts the option to
> create a new one disappears on **26 October 2026**. Tokens already created
> keep working — they are not being revoked. So make one now.

1. Sign in as a **Super Admin** (only a Super Admin can create one).
2. **Development → Legacy Apps** → *Go to Legacy Apps*.
   If there is no create button there, try **⚙ Settings → Integrations →
   Private Apps**; HubSpot is mid-migration and the entry point differs by
   account.
3. **Create a private app**, name it `Aangan Leads`.
4. **Scopes** tab → tick exactly these six:

   | Scope | Why |
   |---|---|
   | `crm.objects.contacts.read` | find an existing contact before creating a duplicate |
   | `crm.objects.contacts.write` | create the caller as a contact |
   | `crm.objects.deals.read` | read deals back |
   | `crm.objects.deals.write` | create the deal and move its stage |
   | `crm.schemas.deals.read` | look up the pipeline's stage ids |
   | `crm.schemas.deals.write` | create the pipeline and the `ai_call_cost_inr` property |

5. **Create app** → **Continue creating**.
6. Copy the access token (`pat-na1-…` / `pat-eu1-…`). **Shown once** — after
   that it has to be rotated.

**The successor: Service Keys.** HubSpot's replacement lives at
**⚙ Settings → Integrations → Service Keys** (public beta). It is also a bearer
token against the same CRM endpoints, so `lib/hubspot.ts` should take it
unchanged — `HUBSPOT_PRIVATE_APP_TOKEN` accepts either. Worth migrating to once
it leaves beta; not worth blocking on today.

Send me the token. Then I run:

```bash
npm run hubspot:setup
```

which creates the pipeline and the custom property `ai_call_cost_inr`, and
prints `HUBSPOT_PIPELINE_ID`. You do not need to find that id yourself.

### ⚠️ One thing to check first: your HubSpot tier

Creating an **extra deal pipeline** requires **Sales Hub Professional or above**.
Free and Starter portals have one fixed pipeline, so the setup will get a 403.

That is handled, not fatal. The script falls back to the pipeline you already
have, maps our eight board columns onto its stages by position, and prints a
`HUBSPOT_STAGE_MAP` for me to set — with the mapping laid out so we can correct
it by eye. *Closed won* and *Closed lost* are matched by name rather than
position, because those two matter most.

So: Professional and above gets a dedicated **Aangan Leads** pipeline;
free or Starter reuses the existing one. Either works.

**Unblocks:** a deal created the first time a designer moves a card out of New,
and stage sync on every move after. Failures are retried by the cron.

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
