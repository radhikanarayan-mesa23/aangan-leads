# Setting up the Vaani agent

**Why this is a manual step.** VaaniVoice's public API has seven endpoints —
session minting, LiveKit rooms, and API-key management. There is **no endpoint
that creates or updates an agent**: searching their OpenAPI spec for `prompt`,
`instructions` or `persona` returns zero hits. A session request only carries a
`flow_id`, which *references* a published flow you already own:

```
POST /api/public/v1/voicebot/session   { "flow_id": "lead-qualification-v3" }
```

So the flow — personality, questions, guardrails, knowledge — is built in their
dashboard. Nothing in this repo can push it there. What this repo does is
receive the result, and that side is now written against their exact contract.

---

## Current state (2026-10-10)

The agent **exists and is configured** — `npm run vaani:setup` pushes it from
this repo, so the prompt lives in git rather than drifting in a dashboard.

| | |
|---|---|
| Agent | `040c5b84-2b3d-427d-8efe-9f32cc5a80b7` — "Lead Qualification", **Running** |
| System prompt | 12,654 chars — `vaani_agent_prompt.md` plus the rubric's non-negotiable sections |
| Greeting | the verbatim opening line |
| Speech | Deepgram `nova-3`, `language: multi`, 40 Pune-specific keywords |
| Call Type | **Inbound** |
| Webhook | registered, `call_ended` + `call_postprocessing`, tested end to end |
| **Missing** | **an inbound phone number** — Design → Telephony → Add Phone Number |

**Test it without a number:** agent page → **Start Test → Start Web (RTC) Call**
and talk to it in the browser. It is a real call, so it fires the webhook and
lands on the board like any other.

Two platform quirks worth knowing:

- `know_how.guardrails` is accepted with a 200 and **silently dropped** — only
  `faq` and `pain_points` persist. The guardrails therefore live in the system
  prompt, which is the surface we can prove stuck.
- The agent was created from a template that left **"Amaze Developers",
  "Delhi NCR"** in its metadata. Overwritten with Aangan's.

## 1. Build the flow in the Vaani dashboard

| Field | What to paste |
|---|---|
| **System prompt / instructions** | the whole of [`vaani_agent_prompt.md`](../vaani_agent_prompt.md) |
| **Knowledge base** | upload [`rubric.md`](../rubric.md) |
| **Opening line** | *"Namaste, thank you for calling Aangan Studio. This call is recorded so our designers can help you better. May I know your name?"* |
| **Languages** | English, Hindi, Marathi |
| **Max call length** | 5 minutes |

Publish it, then note its **flow id** — that is what goes in `VAANI_AGENT_ID`.

## 2. Register the webhook

Dashboard → webhooks. Subscribe **`call.completed`** and **`call.failed`** to:

```
https://aangan-leads.vercel.app/api/vaani/call-ended
```

Vaani shows the signing secret (`vv_whk_…`) **once**. Send it to me — it
replaces `VAANI_WEBHOOK_SECRET`.

The receiver already does what their spec requires:

- verifies `X-VaaniVoice-Signature: sha256=<hex>` as an HMAC-SHA256 over the
  **raw** body bytes, compared in constant time
- unwraps the `{ id, type, created, data }` envelope
- de-duplicates on the `evt_` id, because retries reuse it (up to 8 attempts)
- answers `webhook.ping` from the dashboard **Test** button with a 200
- acknowledges event types it does not handle, so the subscription is never
  auto-disabled for the wrong reason
- returns non-2xx **only** when the failure is ours and a retry would help
- keeps the row for `call.failed` — the caller still rang, so nothing is
  silently dropped

Phone numbers arrive masked (`+9198******34`). That is stored as given.

## 3. Live booking tools — only if their flow builder supports HTTP tools

The spec does not document in-call tool calls, so confirm in the dashboard.
If it does, register two, both with header
`x-tool-secret: <VAANI_TOOL_SECRET>`:

**`get_slots`** — `POST https://aangan-leads.vercel.app/api/vaani/tools/slots`

```json
{ "type": "object", "properties": {}, "required": [] }
```

Returns `{ say, spoken[], slots[{iso, spoken}] }`. Read `say` aloud.

**`book_slot`** — `POST https://aangan-leads.vercel.app/api/vaani/tools/book`

```json
{
  "type": "object",
  "properties": {
    "call_id": { "type": "string", "description": "This call's id" },
    "start":   { "type": "string", "description": "ISO 8601 UTC, from get_slots" },
    "name":    { "type": "string" },
    "email":   { "type": "string" },
    "phone":   { "type": "string" }
  },
  "required": ["call_id", "start"]
}
```

Returns `{ ok, say, ticket_no }`. Read `say` aloud — it already contains the
read-back and the ticket number, and never a price.

**If their flow builder cannot call HTTP tools**, say so and I will switch to
the fallback already specified in the brief: the agent collects two preferred
slots, and the webhook books the first free one right after the call. That path
needs no change on their side.

## 4. What is still unknown

- **The key `vaani_e3c073…` does not authenticate.** Their API issues
  `vv_live_…` keys from <https://www.vaanilabs.in/api-keys>. The one we have
  returns `401 invalid_token`.
- **Their public API has no telephony.** No inbound numbers, no SIP, no call
  routing — only browser and LiveKit voice. If Aangan needs a real phone line,
  either Vaani has a non-public telephony product, or the phone leg needs a
  different vendor. The rest of this system does not care which: `lib/vaani.ts`
  is the only file that knows the payload shape.
