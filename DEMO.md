# Aangan Leads — the 5-minute demo

> Every phone enquiry to Aangan Studio answered, graded and on a designer's board — at 11pm on a Sunday as reliably as at 11am on a Tuesday.

## Setup

```bash
npm install
cp .env.example .env     # DATABASE_URL (Neon, pooled endpoint) is the only one needed
npm run db:migrate
npm run db:seed
npm run dev
```

Sign in at <http://localhost:3000> as **nikhil@aanganstudio.in** (owner) or **sneha@aanganstudio.in** (designer).

## The story, in order

**1. The call that would have been missed.** Open `/board` and find **Priya Kulkarni** — a 3BHK in Baner, graded Hot, with a consultation already booked. The call came in at 9pm. Nobody at the studio was awake.

**2. The grade is arithmetic, not vibes.** Open **Sameer Joshi**. Gemini read that call as Hot. The card says so, and says the code overrode it: ₹14 lakh against an internal minimum of ₹16.2 lakh is `close`, not `fits`, so the lead is Warm. Open the card's criteria list — C1 to C5, each with the reason it landed where it did.

**3. No budget is never a reason to drop someone.** **Anjali Deshmukh** refused to name a figure. She is Warm, not Low. That one rule is the difference between a healthy board and a quietly leaking one.

**4. Nothing is dropped silently.** The Low column is full and visible. Dragging a card to *Not converted* asks for a reason before it will move.

**5. No price ever reaches a caller.** Open **Kunal Bhave** and read the transcript — he asked for a per-sq-ft rate twice and got the same honest line both times. The internal estimate appears only on the card and the dashboard, labelled *internal — never share*. The owner's health strip counts prices spoken; the target is zero.

**6. Drag a card.** Move anything from New to Contacted. The stage saves, the activity timeline records who moved it and when, and the HubSpot deal is created on that first move out of New.

**7. The owner's view.** `/owner` (Nikhil only — a designer who tries it is sent back to the board). Leads in, grade mix, cost per hot lead, pipeline value, forecast, funnel drop-off, cost against revenue, and the hour-by-weekday heatmap that shows how many calls land outside office hours.

## Prove it live

```bash
npm run check     # grades all 14 seeded calls with no database and no API key
npm run replay    # pushes a seeded call through the real webhook pipeline
npm run eval      # runs the adversarial set through the live model (needs GEMINI_API_KEY)
```

`npm run eval` exits non-zero on a **false low** — a lead that should have been Hot or Warm and came back Low — or on any call where the agent spoke a price. Those are the two failures that cost real money.

## What is wired but waiting on keys

| Needs | Without it |
|---|---|
| `GEMINI_API_KEY` | Leads store ungraded and fall back to Warm rather than being lost |
| `TELEGRAM_BOT_TOKEN` + chat ids | Pushes are skipped; the board is still correct |
| `CALCOM_API_KEY` | Booking uses our own database, which still prevents double booking |
| `HUBSPOT_PRIVATE_APP_TOKEN` | Stage moves log locally and retry when the token arrives |
| `VAANI_*` | The webhook accepts unauthenticated calls in development only |
