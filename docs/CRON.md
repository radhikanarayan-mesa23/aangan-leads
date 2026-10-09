# Scheduling

`GET /api/cron` does five jobs, each isolated so one failure cannot stop the rest:

1. queued designer pushes whose 9am has arrived
2. nudges for hot leads still sitting in New after an hour
3. overdue callback alerts
4. retries for failed HubSpot syncs
5. the 9pm daily brief to Nikhil (only fires at 21:00 IST)

## What runs today

`vercel.json` schedules it **once a day at 15:30 UTC = 21:00 IST**, which covers
the daily brief. Vercel sends `Authorization: Bearer $CRON_SECRET`, and the route
accepts that.

> Hobby plans allow one cron run per day. That is why the schedule is daily
> rather than the ten minutes the brief asks for.

## What still needs setting up

Jobs 1–4 want a **ten-minute** cadence. Point [cron-job.org](https://cron-job.org)
at:

```
GET https://aangan-leads.vercel.app/api/cron?secret=<CRON_SECRET>
```

every 10 minutes. The route is idempotent — a nudge or an alert is recorded in
`lead_events` once and never repeats — so overlapping runs are harmless.
