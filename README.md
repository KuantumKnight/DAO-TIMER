# NeuralDAO timer

A shared hackathon clock for participants, organizers, and the auditorium screen.

Preconfigured for **8 October 2026, 08:30–16:30 Asia/Kolkata**. This is eight hours. Edit the schedule in `/admin`; changes persist without redeploying.

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set an organizer passphrase of at least 12 characters and a random `SESSION_SECRET` of at least 32 characters in `.env.local`. `LOCAL_DEV_STORE=1` enables an in-memory store **only in local development**. It resets when the development server restarts; deployed environments always require Redis.

## Routes

- `/`: participant timer with schedule, sharing, theme, sounds, and calendar export.
- `/display`: dark projector display with controls hidden after inactivity. `F` toggles fullscreen; `S` opens settings.
- `/admin`: protected organizer controls and action history.

## Shared storage and access

Connect Upstash Redis through Vercel Marketplace. Set `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_PASSPHRASE`, and `SESSION_SECRET` in Vercel production and preview environments. Never commit credentials. Preview state is namespaced by branch, separate from production. `EVENT_NAMESPACE` can override the namespace for an isolated test environment.

The server stores timestamp anchors, pauses, announcements, and a revisioned history in Redis. Public clients synchronize server time and advance locally. Snapshot polling runs every three seconds in visible tabs; snapshots receive one second of shared CDN caching. Admin reads are uncached. Conflicting writes receive HTTP 409 and require a refresh. An unavailable store yields HTTP 503 instead of silently creating an independent clock.

Organizer sessions last 12 hours. Login attempts are limited to ten per IP per fifteen minutes. Controls require a secure HttpOnly cookie and same-origin requests. All organizers share one passphrase, so history identifies actions rather than people.

## Clock behavior

- Before kickoff, count down to the scheduled start. At kickoff, automatically count down to the deadline. No cron job is needed.
- Start early retains the full **configured** duration.
- Pause freezes remaining time; resume shifts the deadline and upcoming milestones by the pause length.
- Extend adds minutes to the current deadline. Custom milestones keep their elapsed-time positions.
- Reset restores the configured schedule, preserving history and announcements. A past schedule remains finished.
- Editing absolute start/end times replaces any clock overrides. The admin confirmation describes this impact. Metadata-only changes retain current timing.
- Milestones are minutes after kickoff. Kickoff and finish are automatic.
- Sound alerts require an explicit click and only fire when crossing a threshold while the display is active and connected. Previously fired alerts are remembered for the browser tab session, including refreshes. Sounds do not run in the background or replay missed thresholds.
- Calendar files contain the current effective schedule in UTC. An imported calendar is a snapshot; use the timer for live changes.

## Verify

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Browser tests use the passphrase from your ignored `.env.local`, exercise two independent clients, and restore the default schedule. Run them against local development only. Screenshots and reports are ignored by Git.

## Deploy

The GitHub source is `KuantumKnight/DAO-TIMER`. Connect it to the `dao-timer` project under `sarvesh-m-projects`. Validate a preview with preview-only Redis state before deploying production. Use Vercel Git integration for subsequent changes, or `vercel deploy --prod --scope sarvesh-m-projects` from the linked folder.

Verify the production timer in a signed-out browser and protect `/admin` with the organizer passphrase. Check Vercel runtime logs after rollout. The existing event survives builds and deployments; rolling back application code does not roll back the event clock.
