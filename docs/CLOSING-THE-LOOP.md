# Closing the loop with the caller

*Aangan Leads — the customer side of the journey, and the one hole still in it.*

## Where the journey ends today

A caller rings at 9pm. Vaani answers, asks the nine intake questions, reads the free
slots off the real calendar and books her in for Monday at 1pm. She hears her
reference number. She hangs up.

Then nothing.

Everything that happens next happens to *us*, not to her. The webhook fires, Gemini
reads the transcript, the code re-derives the grade, a card appears on the board, a
Telegram push lands in the designers' chat, a deal opens in HubSpot. The whole system
wakes up — and the only person with money on the table has no idea any of it occurred.

Her experience is five good minutes followed by silence.

## Why this is the biggest hole

**She is deciding whether to spend eight to fourteen lakh.** At that price a person
does not ring one studio. She rings four. By Monday morning she has spoken to three
other places, and the only evidence that Aangan exists is a number in her call log and
a time she half-remembers. The studio that sends her a message that evening is the one
she still trusts on Monday.

**The promise has a clock on it.** When a caller isn't booked, the agent says *"a
designer will call you within the hour"* or *"by 11am tomorrow"*. We store that
promise in `callback_due_at`, exactly as it was spoken, and the cron sweep already
flags it when it goes overdue — to *us*. The caller, who is the one waiting, is told
nothing either way. A promise tracked only internally is not a promise kept; it is a
promise measured.

**India is a WhatsApp-first market.** A missed call from an unknown Pune number at
11am is ignored. A WhatsApp message with a name, a time and a reference is read. We
built a voice system for a market that confirms in text.

## What already exists to build on

This is not a rewrite. Four of the five pieces are in place:

| Piece | State |
|---|---|
| A reference the caller already heard | `AAN-0042`, issued mid-call by `aangan_book` |
| The exact promise we made | `callback_due_at`, read from the transcript, not assumed |
| The confirmed slot | `booked_at` + the Cal.com booking id |
| A scheduler already running | `GET /api/cron` every 10 minutes, already watching overdue callbacks |
| A way to reach her | **missing** — this is the only new part |

Cal.com already emails an invite to callers who booked *and* gave an email. That is a
partial loop for a minority of callers. Everyone else — the ones who didn't book, the
ones who gave no email, the LOW leads — gets nothing at all.

## The loop, in four messages

**1. Within sixty seconds of hanging up.** *"Namaste Radhika — thanks for calling
Aangan Studio. You're booked for Monday 12 October, 1pm, at our Baner studio. Your
reference is AAN-0042. Reply here if you need to change it."* For an unbooked caller,
the same message carries the promise instead: *"a designer will call you by 11am
tomorrow."* This message does the most work of the four, because it arrives while she
still remembers the call.

**2. The morning of.** A short reminder with the address. Consultation no-shows are
the expensive failure — a designer's blocked hour spent on nobody.

**3. When we are the ones who slip.** The cron sweep already knows when
`callback_due_at` has passed. Today it nudges the designers. It should also tell the
caller: *"Sorry — we said we'd ring by 11. We're running late and will call you within
the hour."* A studio that admits a delay before being chased reads as organised. A
studio that goes quiet reads as uninterested, which is the same signal as being
forgotten.

**4. After the consultation.** One message, with the designer's name and what happens
next. This is also the only natural place to ask how the call went, which is the only
honest source of truth about whether a HOT grade was actually hot.

## What it would take

A WhatsApp Business sender (Gupshup or Meta Cloud API, both cheap at this volume) plus
four approved template messages. The send points are already identified in code: the
end of `processLead()` for message 1, and the existing cron sweep for 2 and 3. Each
would sit in its own try/catch and log to `step_errors`, exactly as Telegram and
HubSpot do, so a messaging outage can never cost us the grade. Templates must be
approved before use and the content is fixed — which is a feature here, since it makes
it impossible for a message to invent a price.

Roughly a day's work. Most of it is the provider account, not the code.

## How we would know it worked

Three numbers, all derivable from what the schema already stores:

- **Consultation no-show rate**, before and after reminders exist.
- **Time from call to first designer contact** — because a caller who has been
  messaged chases less, and a designer who knows she has been messaged can ring with
  context rather than an apology.
- **Reply rate on message 1.** A caller who replies has self-identified as live, which
  is better qualifying evidence than anything a model infers from a transcript.

## What we would deliberately not do

No drip campaign. No "just checking in!" at day three, seven and fourteen. A person
spending ten lakh on her home does not want to be nurtured; she wants to be answered.
Four messages, each tied to a real event, each one something she would miss if it
didn't arrive. The hard rules hold throughout: no price in any message, and no promise
the studio cannot keep.

---

*The system currently closes the loop with everyone except the person who started it.
That is the gap worth closing next.*
