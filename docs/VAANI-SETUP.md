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
