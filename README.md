This repository is publicly visible for portfolio and review purposes only.

Commercial or other use requires written permission.

# BFC Volunteer Portal

A full-stack volunteer management platform for **Bingham Family Free Clinic**, built with Next.js 15 and Supabase. The app covers the full lifecycle of clinic volunteer operations — recruitment and onboarding, interview scheduling, shift scheduling, attendance, callouts, shift coverage, weekly training, internal messaging, provider credentialing, missionary (OSSM) oversight, and administrative reporting.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Routing & Access Control](#routing--access-control)
- [Features by Role](#features-by-role)
  - [Volunteer View](#volunteer-view)
  - [Admin View](#admin-view)
  - [Clinical Supervisor View](#clinical-supervisor-view)
  - [OSSM View](#ossm-view)
  - [Provider View](#provider-view)
- [Shifts & Scheduling](#shifts--scheduling)
- [Callouts & Coverage](#callouts--coverage)
- [Provider Scheduling](#provider-scheduling)
- [Provider Credentials](#provider-credentials)
- [Recruitment Pipeline](#recruitment-pipeline)
- [Interview Self-Scheduling](#interview-self-scheduling)
- [Messaging System](#messaging-system)
- [Push Notifications & PWA](#push-notifications--pwa)
- [API Routes](#api-routes)
- [Backend Architecture](#backend-architecture)
- [Conventions & Patterns](#conventions--patterns)

---

---

## Overview

The BFC Volunteer Portal replaces manual spreadsheets and group-chat coordination for a free community health clinic. Volunteers clock in/out, submit callouts, request shift coverage, complete weekly training, and communicate with the team. Admins manage schedules, run the recruitment pipeline, review hours submissions, track provider credential expiration, publish weekly training content, and maintain an audit log. Clinical Supervisors get a focused view of their shifts with live attendance and language coverage. OSSM staff monitor missionary volunteers. Providers manage clinical availability through a dedicated portal.

All authenticated pages are client-rendered (`'use client'`) and talk directly to Supabase from the browser, except for a small set of Next.js API routes that require service-role access or server-side push delivery.

## Quick Start

**Prerequisites:** Node.js (compatible with Next.js 15), npm, and access to the project's Supabase instance with the required tables, storage buckets, RLS policies, and Edge Functions deployed.

```bash
git clone <repository-url>
cd volunteer-management-bfc
npm install
```

Create a `.env.local` file in the project root (see [Environment Variables](#environment-variables)). At minimum, local development requires the Supabase public credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Server-only variables (`SUPABASE_SERVICE_ROLE_KEY`, VAPID keys, `CRON_SECRET`) are required for API routes, push notifications, and cron jobs. Push and cron features will not work without them.

```bash
npm run dev    # Start development server (default http://localhost:3000)
npm run build  # Production build
npm start      # Run production build locally
```

**Deployment:** The app is configured for [Vercel](https://vercel.com). Cron schedules live in `vercel.json`. Set all environment variables in the Vercel project settings.

> **Note:** Database schema, migrations, Row Level Security policies, and Supabase Edge Functions are **not** in this repository. They must already exist in the linked Supabase project. See [Supabase Dependencies](#supabase-dependencies).

---

## Environment Variables

| Variable | Scope | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase client initialization |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Supabase client; JWT verification in API routes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | `/api/send-message`, `/api/send-push`, `/api/cron/shift-reminder` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Client + server | Push subscription; `web-push` on server |
| `VAPID_PRIVATE_KEY` | Server only | Push delivery |
| `VAPID_EMAIL` | Server only | VAPID contact email for `web-push` |
| `CRON_SECRET` | Server only | Authorizes Vercel cron calls to `/api/cron/shift-reminder` |
| `VERCEL_ENV` | Server (automatic on Vercel) | Switches app icon between production (`logo3.png`) and non-production (`logo4.png`) |

There is no `.env.example` file in the repository. Obtain values from the project maintainer or your Supabase/Vercel dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React / Next.js App Router pages)                     │
│  /  /volunteer  /admin  /clinical-supervisor  /ossm  /provider  │
│  /schedule/[token]  /reset-password  /offline                   │
└────────────┬───────────────────────────────┬────────────────────┘
             │ Supabase JS (anon key + JWT)   │ fetch() to API routes
             ▼                                ▼
┌────────────────────────┐         ┌──────────────────────────────┐
│  Supabase              │         │  Next.js API Routes          │
│  · Postgres + RLS      │         │  · /api/send-message         │
│  · Auth                │         │  · /api/send-push            │
│  · Storage             │         │  · /api/cron/shift-reminder  │
│  · Edge Functions      │         └──────────────────────────────┘
└────────────────────────┘
             ▲
             │ Vercel Cron (weekdays, shift reminders)
```

**Auth flow:** Login at `/` uses Supabase email/password auth. Sessions persist in `localStorage` under the key `bingham-app` (see `lib/supabase.js`). After login, users with `default_role = 'Provider'` go to `/provider`; all others go to `/volunteer`. Additional views (`/admin`, `/clinical-supervisor`, `/ossm`) are reached via "Switch View" buttons or direct navigation.

**Timezone:** Clinic operations use **Mountain Time** (`America/Denver`). Helpers in `lib/timeUtils.js` and inline logic throughout the app convert/display times accordingly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.2 (`app/` router) |
| UI | React 18 |
| Backend / Database | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Auth | Supabase Auth (email/password; session key `bingham-app`) |
| File Storage | Supabase Storage |
| Push Notifications | Web Push API (`web-push` v3) + service worker |
| Styling | CSS custom properties in `app/globals.css` + inline component styles (Tailwind is configured but not used in components) |
| Fonts | DM Sans, DM Mono (Google Fonts) |
| Cron | Vercel Cron → `/api/cron/shift-reminder` |
| Package Manager | npm |

---

## Project Structure

```
/
├── app/
│   ├── page.js                      # Login / landing (includes forgot-password flow)
│   ├── volunteer/page.js            # Volunteer default view
│   ├── admin/page.js                # Admin dashboard (role-gated tabs)
│   ├── clinical-supervisor/page.js  # Clinical Supervisor view
│   ├── ossm/page.js                 # OSSM missionary oversight view
│   ├── provider/page.js             # Provider portal
│   ├── schedule/[token]/page.js     # Public interview self-scheduling (tokenized)
│   ├── reset-password/page.js       # Password recovery completion
│   ├── offline/page.js              # Offline fallback (service worker)
│   ├── api/
│   │   ├── send-message/route.js    # Authenticated message send + push fan-out
│   │   ├── send-push/route.js       # Server-side push to specific user IDs
│   │   └── cron/shift-reminder/route.js
│   ├── globals.css
│   └── layout.js                    # Root layout, PWA meta, service worker registration
├── components/
│   ├── AdminTasks.jsx               # Internal team task board (admin)
│   ├── BiannualSurvey.jsx           # Volunteer feedback survey
│   ├── ClinicOpenings.jsx           # Open slot display (admin scheduling)
│   ├── DataDashboard.jsx            # Charts / aggregate stats (admin Data tab)
│   ├── LanguageCoverage.js          # Language coverage panel (admin)
│   ├── Live.js                      # Shared live-shift panel (admin + CS)
│   ├── MessageCard.js               # Shared message bubble component
│   ├── MessageTab.jsx               # Full messaging UI (volunteer + provider)
│   ├── Pipeline.js                  # Volunteer recruitment pipeline (admin)
│   ├── ProviderScheduleView.jsx     # Shared provider schedule (admin + CS)
│   ├── Providers.jsx                # Admin provider management
│   ├── SubmitHoursPanel.jsx         # Off-system hours submission form
│   ├── VolunteerTasks.jsx           # Team task list (volunteer)
│   ├── Waitlist.js                  # Scheduling waitlist (admin)
│   ├── WeeklyTraining.jsx           # Admin weekly training editor
│   └── WeeklyTrainingBanner.jsx     # Volunteer weekly training reader
├── lib/
│   ├── supabase.js                  # Supabase client singleton
│   ├── constants.js                 # DAYS, SHIFTS, ROLES, SCHOOLS, MAJORS, labels
│   ├── timeUtils.js                 # Mountain Time helpers
│   ├── messageUtils.js              # Inbox filter logic
│   ├── pushNotifications.js         # Subscribe / unsubscribe helpers
│   ├── scheduleUtils.js             # Provider schedule synthesis
│   ├── trainingUtils.js             # Weekly training week-key helpers
│   └── interview-schedule.js        # Interview slot formatting (sync with Edge Function)
├── public/
│   ├── logo2.png                    # Clinical Supervisor header logo
│   ├── logo4.png                    # Non-production app icon
│   ├── sw.js/route.js               # Dynamic service worker (intended route: /sw.js)
│   ├── manifest.js                  # PWA manifest export
│   ├── parking_pass.html            # Onboarding parking pass template
│   └── confidentiality_agreement.html
├── vercel.json                      # Cron schedule for shift reminders
├── next.config.js
├── tailwind.config.js
└── package.json
```
---

## Routing & Access Control

### Primary routes

| Route | Purpose | Access gate (from code) |
|---|---|---|
| `/` | Login, forgot password | Public |
| `/volunteer` | Default volunteer portal | Authenticated (default landing) |
| `/provider` | Provider portal | `default_role = 'Provider'` (login redirect) |
| `/admin` | Admin dashboard | `profiles.role = 'admin'` **and** `hasAdminAccess()` |
| `/clinical-supervisor` | CS dashboard | `default_role = 'Clinical Supervisor'` **or** `role = 'admin'` |
| `/ossm` | Missionary oversight | Authenticated session only (no role check in page init) |
| `/schedule/[token]` | Applicant interview booking | Valid scheduling token (Edge Function) |
| `/reset-password` | Complete password reset | Supabase `PASSWORD_RECOVERY` event |
| `/offline` | Offline page | Public (cached by service worker) |

### Profile fields that drive access

| Field | Values | Effect |
|---|---|---|
| `profiles.role` | `'admin'`, `'volunteer'`, … | `'admin'` unlocks `/admin` |
| `profiles.default_role` | See `ROLES` in `lib/constants.js` | Determines position, training content, tab visibility, and switch-view destinations |
| `profiles.affiliation` | `missionary`, `student`, `intern`, `volunteer`, `provider` | Conditional UI (intern hours report, missionary messaging, etc.) |
| `profiles.team` | Team name string | Shows volunteer Tasks tab when set |

### Switch View (from `/volunteer`)

Users can see one or more switch buttons depending on their profile:

| Condition | Destination |
|---|---|
| `role = 'admin'` | `/admin` |
| `default_role = 'Clinical Supervisor'` or `'Office Manager'` | `/clinical-supervisor` |
| `default_role = 'OSSM'` | `/ossm` |

An admin whose `default_role` is also `'OSSM'` sees **both** Admin and OSSM switch buttons.

> **Note:** `/clinical-supervisor` only allows `Clinical Supervisor` or `role = 'admin'`. Users with `default_role = 'Office Manager'` who are not admins will be redirected back to `/volunteer` if they use the clinical-supervisor switch link. Office Managers typically access admin features via `/admin` when `role = 'admin'`.

### Admin dashboard tab visibility

All admin users must have `role = 'admin'`. Tab sets then depend on `default_role` (and affiliation for provider admins). Defined in `app/admin/page.js`:

| `default_role` | Tabs available |
|---|---|
| **Lab Director** | Live, Scheduling, Volunteers *(lab-scoped data only)* |
| **Credentialing** | Providers, Volunteers, Add Volunteer, Shifts, Hours |
| **Office Manager** | Live, Scheduling, Volunteers, Pipeline, Shifts, Data, Call-Outs, Weekly Training |
| **OSSM** | Live, Scheduling, Volunteers, Pipeline, Shifts, Data, Call-Outs |
| **Human Resources** | Live, Scheduling, Volunteers, Pipeline, Shifts, Data, Call-Outs |
| **All other admin roles** *(Director, Admin Assistant, etc.)* | Live, Scheduling, Volunteers, Providers, Pipeline, Shifts, Call-Outs, Hours, Recent Activity, Add Volunteer, Data, Weekly Training |
| **+ Tasks tab** | Also shown when `default_role` is Director, Administrative Assistant, or Executive Assistant |
| **+ Languages tab** | Inserted after Volunteers for Office Manager, Director, or Administrative Assistant |

Additional admin capabilities tied to `default_role`:

- **Role slot cap override:** Director, Administrative Assistant, Executive Assistant can exceed `ROLE_SUGGESTIONS` limits.
- **Lab Director data scope:** Volunteers with `default_role` in `{Lab, Lab Director}` or anyone scheduled for a `Lab` shift.

Admin access also requires `hasAdminAccess()`: `affiliation = 'provider'` **or** `default_role` in `{Lab Director, Director, Information Systems, Provider, Administrative Assistant, Executive Assistant, OSSM, Office Manager, Human Resources, Credentialing}`. This is a safeguard to assure that individuals if individuals are admin, that they are assigned the correct default_role.

---

## Features by Role

### Volunteer View

Located at `app/volunteer/page.js`. Tabs load lazily — data for a tab is fetched the first time it is visited, tracked via a `fetchedTabs` ref.

**Primary tabs:** Clock, Schedule, Call-Out, Messages, Account.

**Conditional tabs:**

| Tab | Shown when |
|---|---|
| Report Hours | `affiliation = 'intern'` |
| Tasks | `profile.team` is set |
| Training | Unacknowledged weekly training exists for the volunteer's roles |
| Feedback | Biannual survey week (first full Mon–Sun of April or October) and not yet submitted |

**Clock tab** *(loaded on init)*

- One-tap clock in / clock out
- Resolves scheduled role for the current shift window; falls back to `default_role`

**Schedule tab**

- Personal recurring schedule with week-of-month patterns (`every`, `odd` = 1st & 3rd, `even` = 2nd & 4th)
- Respects `start_date` / `end_date` on schedule entries
- Approved call-outs and shift pick-up requests

**Call-Out tab**

- Single-shift or date-range callouts (range auto-generates weekday shifts, skips weekends and unscheduled days)
- Open Shifts list with "I can cover" cover requests

**Messages tab** (`MessageTab.jsx`)

- Inbox, Sent, Compose; paginated (10 at a time)
- Recipient types: Admin, Everyone, My Shift, My Role, Individual
- Optional image attachment (JPEG/PNG/WebP/GIF, max 5 MB) → Supabase Storage
- Unread badge; broadcast view counts

**Report Hours tab** *(intern only)*

- Logs hours as a shift record
- Sends structured weekly progress report to all users with `default_role = 'Director'`

**Tasks tab** *(when `team` is set)*

- View/update team tasks; cycle status, edit notes, reassign within team

**Training tab**

- Role-specific sections filtered to volunteer's scheduled roles + `default_role`
- Acknowledgment stored per user per week

**Feedback tab**

- Biannual survey, visible for two weeks of the year.

**Account tab**

- Total hours, shift history, provider credential cards (provider affiliation), push notification toggle, password change

---

### Admin View

Located at `app/admin/page.js`. Uses a `loadedTabs` ref to prevent re-fetching on tab revisit. Heavy lists are paginated.

**Live tab** — Expected-but-not-clocked-in (via `Live.js`), active shifts, today's callouts.

**Scheduling tab** — Day × shift grid (Mon–Fri, 10–2 / 2–6), role assignments with date/pattern/note, `ROLE_SUGGESTIONS` cap warnings, date preview with callout/cover status, Waitlist, Clinic Openings.

**Lunch tab** — Assign lunch breaks (12:30–1:00 or 1:00–1:30) per weekday shift.

**Volunteers tab** — Filterable roster, provider credential summary banner, volunteer detail with avatar, edit, deactivate/reactivate, lazy-loaded shifts/schedule/hours.

**Providers tab** — Provider recurring/one-time schedules, callouts, credential dates.

**Pipeline tab** — Full recruitment workflow (see [Recruitment Pipeline](#recruitment-pipeline)).

**Shifts tab** — Paginated shift log (25/page), filter, inline edit/delete, manual entry.

**Call-Outs tab** — Approve/deny callouts; assign/deny cover requests; covered/closed history.

**Hours tab** — Pending submissions (approval creates shift record); lazy-loaded reviewed history (20/page).

**Recent Activity tab** — Audit log (last 2 weeks, 30/page, filterable). Admin mutations call `audit()` → `audit_logs`.

**Add Volunteer tab** — Creates Supabase Auth account + `profiles` row with affiliation-conditional fields.

**Data tab** — Hours totals, no-shows, repeat lates, per-volunteer reports, attendance bar chart. Powered by `attendance_records` (records before `2026-03-29` excluded from analytics).

**Weekly Training tab** — Create/edit training content by week.

**Tasks tab** *(Director, Administrative Assistant, Executive Assistant)* — Internal team task board via `AdminTasks.jsx`.

**Languages tab** *(Office Manager, Director, Administrative Assistant)* — Language coverage via `LanguageCoverage.js`.

---

### Clinical Supervisor View

Located at `app/clinical-supervisor/page.js`. Scoped to shifts the CS user is personally scheduled for. Individual must have default_role = 'Clinical Supervisor'.

**Live tab** — Expected-not-clocked-in (`Live.js`), active shifts, today's callouts, birthday highlight.

**Schedule tab** — Personal scheduled shifts with expandable volunteer rows (phone, languages, affiliation, clock-in badge).

**Language Coverage tab** — Per-shift language bubbles; green when a speaker is clocked in; modal with speaker list.

**Providers tab** — Read-only collective provider schedule (`ProviderScheduleView.jsx`).

> The Lunch tab UI exists in code but is **commented out** in the current codebase.

---

### OSSM View

Located at `app/ossm/page.js`. Dedicated portal for OSSM staff to monitor **missionary** volunteers (`affiliation = 'missionary'`, `status = 'active'`). OSSM staff themselves are excluded from the missionary list.

**Live tab** — Today's schedule, callouts, and active shifts across all missionaries; expected-not-clocked-in banner; tap a missionary to open their detail.

**Missionaries tab** — Searchable directory with per-missionary detail: profile info, recurring schedule, attendance records, monthly hours breakdown, last 30 days of shifts.

Accessible via "OSSM View" switch button when `default_role = 'OSSM'`, or by navigating directly to `/ossm`.

---

### Provider View

Located at `app/provider/page.js`.

**My Shifts** *(loaded on init)* — Upcoming one-time and recurring shifts; remove own one-time shifts.

**Schedule tab** — Clinical openings grid; add/remove one-time shifts; submit provider callouts.

**Messages tab** — Full messaging UI (`MessageTab.jsx`).

**Account tab** — Profile, password change, off-system hours, push toggle, shift history.

---

## Shifts & Scheduling

The clinic runs recurring **weekday shifts only**, Monday–Friday:

| Shift ID | Window |
|---|---|
| `10-2` | 10:00 AM – 2:00 PM MT |
| `2-6` | 2:00 PM – 6:00 PM MT |

A `schedule` row is a recurring assignment: `(volunteer_id, day_of_week, shift_time, role)` plus optional `start_date`, `end_date`, and `week_pattern` (`every` / `odd` / `even`). The `odd`/`even` pattern refers to the week-of-month occurrence for that weekday (e.g., 2nd Monday = even).

---

## Callouts & Coverage

When a volunteer can't make a shift they submit a **callout**. An admin approves or denies it.

- **Approved + no `covered_by`** → shift is open for coverage
- Volunteers submit **cover requests** (`shift_cover_requests`) on open shifts
- Admin approves one cover request; others for that callout are auto-denied
- **Approved + `covered_by` set** → shift is covered

---

## Provider Scheduling

Providers have `default_role = 'Provider'`.

- **One-time shifts** — `provider_shifts` (provider self-schedules or admin adds)
- **Recurring shifts** — `provider_recurring_schedule` (admin-managed)
- **Callouts** — `provider_callouts` (removes provider from slot without deleting schedule row)
- Provider can remove own one-time shifts; recurring rows are admin-managed
- Collective schedule visible to admin and clinical supervisors via `ProviderScheduleView.jsx` / `lib/scheduleUtils.js`

---

## Provider Credentials

Five expiration fields per provider: License, BLS, DEA, FTCA, TB. Each can hold:

- ISO date string (`YYYY-MM-DD`)
- `"N/A"` (DEA only)
- `"expired"` (manually marked)
- `null` (not on file)

`credentialStatus()` returns `ok`, `expiring` (within 30 days), `expired`, `na`, or `missing`. Admin volunteer list shows a collapsible banner for flagged credentials across active providers.

---

## Recruitment Pipeline

The Pipeline component (`components/Pipeline.js`) manages volunteer recruitment from application through profile creation. It has **four sub-tabs**: Pipeline, Calendar, Recently Added, and Email Templates.

### Application stages

| Stage | Meaning |
|---|---|
| `applied` | New submission awaiting review |
| `interview` | Accepted for interview |
| `onboarding` | Post-interview; admin completes onboarding steps |
| `rejected` | Declined (triggers rejection email unless silent) |
| `completed` | Profile created; volunteer on waitlist |
| `offloaded` | Files archived; cleared from active list |

### Stage workflow

**Applied → Interview** — Review application; "Move to Interview" sends interview invitation email.

**Interview → Onboarding** — Interview date required; "Accept — Move to Onboarding" prompts affiliation selection and sends welcome email (with welcome packet attachment if configured).

**Onboarding → Completed** — Five-step wizard with incremental saves:

| Step | Collects |
|---|---|
| 1 — Affiliation | missionary / student / intern / volunteer / provider + affiliation-specific fields |
| 2 — Birthday | Date of birth |
| 3 — Position | Default role from clinic role list |
| 4 — Availability | Preferred shift grid + willing-to-fill roles |
| 5 — Checklist | Document verification and file uploads |

**Onboarding checklist items**

| Item | Required (non-missionary) | File upload |
|---|---|---|
| Background Check | Yes | Yes |
| ID | Yes | Yes |
| Immunization | Yes | Yes |
| TB Test | Yes | Yes |
| Licenses & Certifications | No | Yes |
| Confidentiality Agreement | No | Generated PDF workflow |
| Parking Pass | No | Generated PDF workflow |

Non-missionary applicants need background check, ID, and immunization files before profile creation. Missionaries have relaxed mandatory doc requirements.

**Profile creation** — Invokes `create-volunteer` Edge Function for Auth account, inserts `profiles`, uploads avatar, adds to waitlist, marks application `completed`. Default temporary password: `BFC2025!`.

**Rejection** — Available at any active stage; sends rejection template unless moved silently.

### Recently Added tab

Review completed applicants, download onboarding files as ZIP, **Offload** to archive.

### Email Templates tab

Editable templates: Interview Invitation, Onboarding Welcome, Onboarding — Missionary, Rejection Notice. Includes Welcome Packet Manager (PDF in `onboarding-assets`).

Stage transitions trigger emails via `send-stage-email` Edge Function (except silent rejections).

---

## Interview Self-Scheduling

Applicants in the `interview` stage receive a personal scheduling link (`/schedule/[token]`). The page calls the `schedule-interview` Supabase Edge Function for:

- Loading applicant info and available slots
- Booking, rescheduling, or cancelling an appointment

**Admin Calendar tab** (inside Pipeline) shows booked appointments, lapsed interviews, blocked times, manual scheduling, and copyable scheduling links per applicant.

Slot rules are defined in `lib/interview-schedule.js` (must stay in sync with the Edge Function):

| Constant | Value |
|---|---|
| Timezone | `America/Denver` |
| Slot duration | 30 minutes |
| Business hours | 10:00–18:00 local |
| Booking window | 14 days ahead |
| Minimum lead time | 120 minutes |
| Available days | Monday–Friday |

Database tables: `interview_appointments`, `interview_blocked_times`.

---

## Messaging System

Messages are sent via `POST /api/send-message` with a valid Supabase JWT in the `Authorization` header. The route inserts into `messages`, resolves recipients server-side, and fans out push notifications.

| `recipient_type` | Audience |
|---|---|
| `admin` | Users with `role = 'admin'` |
| `everyone` | All active users |
| `volunteer` | Single user (`recipient_volunteer_id`) |
| `shift` | Volunteers scheduled for a specific `day` + `shift_time` |
| `role` | Volunteers with a given `default_role` |
| `affiliation_missionary` | Volunteers with `affiliation = 'missionary'` |

`getInboxMessages()` in `lib/messageUtils.js` filters inbox visibility client-side (excludes own sent messages and affiliation-gated messages the user doesn't qualify for).

Image attachments upload to the `message-images` storage bucket (max 5 MB).

---

## Push Notifications & PWA

The app registers as a Progressive Web App with Apple web-app meta tags in `app/layout.js`.

**Client helpers** (`lib/pushNotifications.js`):

- `subscribeToPush(supabase, userId)` — requests permission, registers subscription, stores endpoint in `push_subscriptions`
- `unsubscribeFromPush(supabase, userId)` — removes subscription from browser and database

**Service worker** — Registered at `/sw.js` from `layout.js`. Handler source: `public/sw.js/route.js` (handles offline fallback to `/offline`, push events, notification clicks).

**Server delivery** — `web-push` npm package via `/api/send-message` (on new messages) and `/api/cron/shift-reminder`.

**Shift reminders** — Vercel cron fires at **16:00 and 20:00 UTC** on weekdays (`vercel.json`), which maps to **10 AM and 2 PM Mountain Time** during MDT. Reminds scheduled volunteers who haven't clocked in for the upcoming slot.

---

## API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/send-message` | POST | Supabase JWT | Insert message, resolve recipients, send push |
| `/api/send-push` | POST | None in code | Send push to specified `userIds` *(appears intended for internal/server use)* |
| `/api/cron/shift-reminder` | GET | `Bearer ${CRON_SECRET}` | Weekday shift reminder cron job |

---

## Backend Architecture

All backend architecture is contained in a private repository. Acccess may be granted upon request.

---

## Conventions & Patterns

**Lazy tab loading** — Volunteer and admin pages fetch tab data on first visit only, using ref-based dedup guards (`fetchedTabs`, `loadedTabs`).

**Audit logging** — Admin mutations in `app/admin/page.js` and pipeline actions call `audit()` which inserts into `audit_logs` with action labels/colors from `lib/constants.js`.

**Pagination** — Shifts (25), hours (20), audit (30), messages (10), callouts (60 limit).

**Mobile layout** — Pages detect mobile via user agent and viewport width (~428px), rendering bottom nav or sidebar patterns accordingly.

---

*Last updated to reflect the codebase as of July 31, 2026.*
