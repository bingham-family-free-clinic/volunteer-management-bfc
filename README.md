This repository is publicly visible for portfolio and review purposes only.

Commercial or other use requires written permission.



# BFC Volunteer Portal



A full-stack volunteer management platform for **Bingham Family Free Clinic**, built with Next.js 15 and Supabase. The app covers the full lifecycle of clinic volunteer operations — recruitment and onboarding, scheduling, attendance, callouts, shift coverage, weekly training, internal messaging, provider credentialing, and administrative oversight.

---

## Table of Contents



- [Depth Highlight](#depth-highlight)

- [Overview](#overview)

- [Tech Stack](#tech-stack)

- [Project Structure](#project-structure)

- [User Roles & Views](#user-roles--views)

- [Features by Role](#features-by-role)

  - [Volunteer View](#volunteer-view)

  - [Admin View](#admin-view)

  - [Clinical Supervisor View](#clinical-supervisor-view)

  - [Provider View](#provider-view)

- [Shifts & Scheduling](#shifts--scheduling)

- [Callouts & Coverage](#callouts--coverage)

- [Provider Scheduling](#provider-scheduling)

- [Provider Credentials](#provider-credentials)

- [Pipeline](#pipeline)

- [Messaging System](#messaging-system)

- [Push Notifications](#push-notifications)



---



## Overview



The BFC Volunteer Portal replaces manual spreadsheets and group-chat coordination for a free community health clinic. Volunteers can clock in/out, submit callouts, request shift coverage, complete weekly training, and communicate with the team. Admins manage the full schedule, run the recruitment pipeline, review hours submissions, track provider credential expiration, publish weekly training content, and maintain an audit log of all administrative actions. Clinical Supervisors get a focused view of their own shifts with live attendance, language coverage, lunch scheduling, and provider schedules. Providers manage their own clinical availability through a dedicated portal.



---



## Tech Stack



| Layer | Technology |

|---|---|

| Framework | Next.js 15 |

| Backend / Database | Supabase (Postgres + Auth + Storage + Edge Functions) |

| Auth | Supabase Auth (email/password, session persisted to `localStorage` under key `bingham-app`) |

| File Storage | Supabase Storage |

| Push Notifications | Web Push API (`web-push` v3) + service worker |

| Styling | Tailwind CSS + inline component styles |

| Cron | Vercel Cron (shift reminders at 10 AM and 2 PM MT, weekdays) |

| Package Manager | npm |



---



## Project Structure



```

/

├── app/

│   ├── page.js                      # Login / landing (includes forgot-password flow)

│   ├── volunteer/page.js            # Volunteer default view

│   ├── admin/page.js                # Admin dashboard

│   ├── clinical-supervisor/page.js  # Clinical Supervisor view

│   ├── provider/page.js             # Provider default view

│   ├── reset-password/page.js

│   ├── privacy/page.js

│   ├── terms/page.js

│   ├── offline/page.js

│   ├── api/

│   │   ├── send-message/route.js    # Authenticated message-send endpoint

│   │   ├── send-push/route.js

│   │   └── cron/shift-reminder/route.js

│   ├── globals.css

│   └── layout.js

├── components/

│   ├── AdminTasks.jsx               # Internal team task board (admin)

│   ├── BiannualSurvey.jsx           # Volunteer feedback survey

│   ├── ClinicOpenings.jsx           # Open slot display (admin scheduling)

│   ├── DataDashboard.jsx            # Charts / aggregate stats (admin Data tab)

│   ├── Live.js                      # Shared live-shift panel (admin + CS)

│   ├── LunchScheduler.jsx           # Schedule volunteer lunches

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

│   ├── supabase.js                  # Supabase client (singleton)

│   ├── constants.js                 # DAYS, SHIFTS, ROLES, SCHOOLS, MAJORS, action labels/colors

│   ├── timeUtils.js                 # Mountain Time helpers

│   ├── messageUtils.js              # Inbox filter logic

│   ├── pushNotifications.js         # Subscribe / unsubscribe helpers

│   ├── scheduleUtils.js             # Provider schedule synthesis from recurring + one-time tables

│   └── trainingUtils.js             # Weekly training week-key helpers

├── public/

│   ├── logo3.png

│   ├── sw.js                        # Service worker (push notifications)

│   ├── manifest.json

│   ├── parking_pass.html

│   └── confidentiality_agreement.html

├── vercel.json                      # Cron schedule for shift reminders

└── next.config.js

```



---



## User Roles & Views



The app has four distinct authenticated views, each with its own route. Role resolution happens on login and in each page's init function.



| Route | Who can access | How access is determined |

|---|---|---|

| `/volunteer` | Most volunteers | Default landing after login |

| `/admin` | Admins only | `role = 'admin'` in `profiles` |

| `/clinical-supervisor` | Clinical supervisors and Office Manager | `default_role = 'Clinical Supervisor'`, or `default_role = 'Office Manager'` |

| `/provider` | Providers | `default_role = 'Provider'` |



Users with `role = 'admin'`, `default_role = 'Office Manager'`, or `default_role = 'Clinical Supervisor'` see a **Switch View** button to toggle between their primary view and `/volunteer`.



---



## Features by Role



### Volunteer View



Located at `/volunteer/page.js`. Tabs load lazily — data for a tab is only fetched the first time it is visited, using a `fetchedTabs` ref as a dedup guard.



**Clock tab** (critical path — loaded on init)

- One-tap clock in / clock out

- Automatically resolves the volunteer's scheduled role for the current shift window and stamps it on the shift record

- Falls back to `default_role` if no schedule match is found

- View assigned lunch if relevant



**Schedule tab**

- Displays the volunteer's personal recurring schedule

- Filters by week-of-month pattern (`every`, `odd` = 1st & 3rd, `even` = 2nd & 4th)

- Respects `start_date` / `end_date` bounds on schedule entries

- View approved call-outs and shift pick-up requests



**Call-Out tab**

- Single-shift callout: date + shift + role + optional reason

- Date-range callout: auto-generates one callout row per scheduled weekday shift within the range, skipping weekends and days with no schedule match

- Open Shifts list: shows approved callouts with no coverage assigned; volunteers can tap "I can cover" to submit a cover request



**Messages tab**

- Inbox, Sent, and Compose sub-views (via `MessageTab.jsx`)

- Paginated — loads 10 messages at a time, with a "Load older" button

- Compose supports: Admin, Everyone, My Shift, My Role, or Individual recipient types

- Optional image attachment (JPEG/PNG/WebP/GIF, max 5 MB), uploaded to Supabase Storage

- Unread badge on the tab button; messages marked read on inbox open

- Broadcast messages show a view count badge (eye icon + number)



**Report Hours tab** (Intern affiliation only — tab is hidden for all other affiliations)

- Logs hours directly as a shift record

- Sends a structured weekly progress report message to all users with `default_role = 'Director'`



**Tasks tab** (shown when the volunteer has a `team` assignment on their profile)

- View and update tasks assigned to their internal team

- Cycle task status (Open → Blocked → Done), edit notes, reassign within team



**Training tab** (shown when unacknowledged weekly training exists)

- Banner on the home screen prompts volunteers until they acknowledge

- Role-specific training sections filtered to the volunteer's `default_role`

- Acknowledgment stored per user per week



**Feedback tab** (shown during biannual survey week if not yet submitted)

- Likert-scale and open-ended questions about the volunteer experience

- Active during the first full Mon–Sun week of January and July



**Account tab**

- Total hours and completed shift count

- Expandable shift history (last 10)

- Provider credential cards with expiry status (Provider affiliation only)

- Submit hours form for off-system hours (pending admin approval)

- Push notification toggle

- Password change



---



### Admin View



Located at `/admin/page.js`. Uses a `loadedTabs` ref to prevent re-fetching on tab revisit. All heavy lists are paginated.



**Live tab**

- Volunteers expected but not yet clocked in (cross-references schedule, callouts, week patterns, and active shifts — via shared `Live.js` component)

- Active shifts list (everyone currently clocked in, clickable to open volunteer detail)

- Today's callouts with covered/open/pending status



**Scheduling tab**

- Day × shift grid (Mon–Fri, 10–2 / 2–6)

- Per-role assignment with optional start/end date, week pattern, and schedule note

- `ROLE_SUGGESTIONS` cap enforcement (warns when a role slot is full)

- Date picker to preview schedule on a specific date, showing callout/cover status inline

- **Waitlist** — onboarded volunteers waiting for a specific shift; filters on available days and roles; admin can assign directly to the schedule

- **Clinic Openings** — slots with no volunteer scheduled for the upcoming shift window



**Lunch tab**

- Assign volunteers to lunch breaks (12:30–1:00 or 1:00–1:30) per weekday shift



**Volunteers tab**

- Filterable list: search, affiliation, role, default position, active/inactive toggle

- Provider Credentials Summary Banner — collapsible alert listing any expired or expiring-soon credentials across all active providers

- Volunteer detail: full profile, avatar upload, edit form, status change (deactivate with reason / reactivate), recent shifts (last 10, lazy), recurring schedule (lazy), total hours (fetched on open)



**Providers tab**

- Manage provider recurring schedules, one-time shifts, callouts, and credential dates

- Full provider roster with schedule grid



**Pipeline tab**

- Full recruitment workflow (see [Pipeline](#pipeline))



**Shifts tab**

- Paginated shift log (25 at a time, "load more")

- Filter by volunteer

- Inline edit (clock in/out in Mountain Time, role) and delete

- Manual shift entry form



**Call-Outs tab**

- Pending callouts with approve / deny actions

- Open shifts (approved, uncovered) with pending cover requests to assign or deny

- Collapsed "Covered / Closed" history section



**Hours tab**

- Pending submissions shown immediately; approving creates a shift record automatically

- Reviewed history loaded lazily on demand (paginated, 20 at a time)



**Recent Activity tab** (Audit log)

- Filtered to the last 2 weeks, paginated 30 at a time

- Filterable by admin, action type, and date range

- Every admin mutation calls `audit()` which writes to `audit_logs`



**Add Volunteer tab**

- Creates a Supabase Auth account + `profiles` row in one form

- Affiliation-conditional fields: missionary (SMA info), student (school/major), intern (advisor/school/dept), provider (credential dates)



**Data tab**

- Hours served totals, filterable by month, year, or affiliation

- No-shows per individual (shifts where someone neither clocked in nor called out), with drill-down to missed shifts

- Repeat late arrivals per individual, sorted by frequency

- Volunteer hours report per individual by month, year, or affiliation

- Late & no-show bar chart by shift slot

- Powered by `attendance_records` (records before 2026-03-29 are excluded from attendance analytics)



**Weekly Training tab**

- Create or edit training content for any week (defaults to next week)

- Sections: announcements, general training, weekly goal, last week's goal result, and per-role training blocks



**Tasks tab** (Director, Administrative Assistant, or Executive Assistant only)

- Internal team task board organized by clinic team

- Create tasks with assignee, due date, status, and notes

- Manage team membership on volunteer profiles



---



### Clinical Supervisor View



Located at `/clinical-supervisor/page.js`. Scoped to the shifts the CS user is personally scheduled for, with read-only access to broader live data.



**Live tab**

- Expected-but-not-clocked-in panel (same shared `Live.js` logic as admin)

- Full active-shift list

- Today's callouts

- Birthday highlight for any volunteer whose birthday matches today's Mountain Time date



**Schedule tab**

- Shows only the shifts the CS is personally scheduled for

- Expandable volunteer rows with phone, languages, and affiliation

- "in" badge on volunteers currently clocked in during the active slot



**Language Coverage tab**

- Per-shift language bubble list (scoped to that shift's volunteers only)

- Bubbles highlighted green if at least one speaker is currently clocked in

- Click any bubble to open a modal listing all speakers for that shift, with clock-in status and phone numbers

- "Multilingual Volunteers by Shift" reference table



**Lunch tab**

- Same lunch scheduler as admin, scoped to the CS user's permissions



**Providers tab**

- Read-only collective provider schedule via `ProviderScheduleView.jsx`



---



### Provider View



Located at `/provider/page.js`. Personalized portal for clinical care volunteers.



**My Shifts** (critical path — loaded on init)

- Immediate view of upcoming shifts (one-time and recurring)

- Remove upcoming one-time shifts with a tap



**Schedule tab**

- Displays clinical openings across the upcoming weeks

- Add or remove one-time shifts by selecting shift slots on the grid

- Submit provider callouts for shifts they can no longer cover



**Messages tab**

- Full messaging UI (same `MessageTab.jsx` component as volunteers)



**Account tab**

- View profile information

- Change password

- Submit off-system hours for admin approval

- Push notification toggle

- View previously worked shifts (collapsed by default)



---



### Shifts & Scheduling



The clinic runs recurring **weekday shifts only**, Monday–Friday:



| Shift ID | Window |

|---|---|

| `10-2` | 10:00 AM – 2:00 PM MT |

| `2-6` | 2:00 PM – 6:00 PM MT |



A `schedule` row represents a recurring assignment: `(volunteer_id, day_of_week, shift_time, role)` plus optional `start_date`, `end_date`, and `week_pattern` (`every` / `odd` / `even`). The `odd`/`even` pattern refers to the week-of-month count for that day (e.g. "2nd Monday of the month" = even).



### Callouts & Coverage



When a volunteer can't make a shift they submit a **callout**. An admin approves or denies it.



- **Approved + no `covered_by`** → shift is open for coverage

- Volunteers can submit a **cover request** (`shift_cover_requests`) on any open shift

- Admin approves one cover request; all other requests for that callout are auto-denied

- **Approved + `covered_by` set** → shift is covered



### Provider Scheduling



Providers are scheduled differently from normal volunteers. Providers are individuals where `default_role = 'Provider'`.



- One-time shifts scheduled by the provider (`provider_shifts`)

- Recurring shifts scheduled by admin (`provider_recurring_schedule`)

- Provider can remove any of their own one-time shifts; recurring rows are admin-managed

- Provider callouts (`provider_callouts`) remove them from a slot without deleting the underlying schedule row

- Admin and Clinical Supervisors can view the collective provider schedule



### Provider Credentials



Five credential expiration dates are tracked per provider: License, BLS, DEA, FTCA, TB. Each field can hold:

- An ISO date string (`YYYY-MM-DD`)

- `"N/A"` (not applicable — DEA only)

- `"expired"` (manually marked)

- `null` (not on file)



`credentialStatus()` returns one of `ok`, `expiring` (within 30 days), `expired`, `na`, or `missing`. The admin volunteer list shows a collapsible banner summarising all flagged credentials across active providers.



---

## Pipeline



The Pipeline tab (`components/Pipeline.js`) manages volunteer recruitment from first application through profile creation. It has three sub-tabs: **Pipeline**, **Recently Added**, and **Email Templates**.



### Application stages



| Stage | Meaning |

|---|---|

| `applied` | New submission awaiting initial review |

| `interview` | Accepted for interview; date/time can be scheduled |

| `onboarding` | Post-interview acceptance; admin completes onboarding steps |

| `rejected` | Application declined (triggers rejection email unless moved silently) |

| `completed` | Profile created; applicant is now an active volunteer on the waitlist |

| `offloaded` | Completed applicant whose files were downloaded and archived |



### Stage workflow



**Applied → Interview**

- Admin reviews application data and resume

- "Move to Interview" advances the stage and sends the interview invitation email (from `email_templates`)



**Interview → Onboarding**

- Admin must save an interview date (time optional) before acceptance

- Interview list is sorted: upcoming interviews first (soonest first), then past interviews, then unscheduled

- "Accept — Move to Onboarding" prompts for affiliation selection, then advances the stage and sends the onboarding welcome email (with welcome packet attachment if configured)



**Onboarding → Completed**

- Five-step onboarding wizard, with progress saved incrementally on the application record:



| Step | Collects |

|---|---|

| 1 — Affiliation | missionary / student / intern / volunteer / provider, plus affiliation-specific fields |

| 2 — Birthday | Required date of birth |

| 3 — Position | Default role from the clinic role list |

| 4 — Availability | Preferred shift grid (Mon–Fri × 10–2 / 2–6) and optional willing-to-fill roles |

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



Non-missionary applicants must have background check, ID, and immunization files uploaded before a profile can be created. Missionaries have relaxed mandatory doc requirements.



**Profile creation** (final onboarding action)

- Invokes the `create-volunteer` Edge Function to create the Supabase Auth account

- Inserts a `profiles` row with all collected affiliation and credential data

- Uploads applicant photo to `avatars` if provided during onboarding

- Automatically inserts the new volunteer into the **waitlist** with their preferred slots/roles

- Marks the application `stage = 'completed'` and links `volunteer_id`

- Default temporary password: `BFC2025!`

- Writes an audit log entry



**Rejection** — available at any active stage; sends the rejection email template unless moved silently.



### Recently Added tab



Lists applicants in `completed` stage (newly onboarded volunteers). Admin can:

- Review the created profile summary

- Download all onboarding files as a ZIP (resume + checklist uploads via `jszip`)

- **Offload** — downloads files, then moves the application to `offloaded` to clear it from the active list



### Email Templates tab



Editable templates for four pipeline emails:

- Interview Invitation

- Onboarding Welcome

- Onboarding — Missionary (variant)

- Rejection Notice



Also includes a **Welcome Packet Manager** — upload/replace the PDF attached to onboarding emails (stored in `onboarding-assets`, referenced from `email_templates.welcome_packet_path`).



Stage transitions automatically trigger emails via the `send-stage-email` Edge Function, except when explicitly moved silently (rejections use the rejection template).



---



## Messaging System



Messages are sent via the `/api/send-message` route (requires a valid Supabase JWT in the `Authorization` header). Recipient types:



| `recipient_type` | Audience |

|---|---|

| `admin` | Users with `role = 'admin'` |

| `everyone` | All active users |

| `volunteer` | A single user (`recipient_volunteer_id`) |

| `shift` | All volunteers scheduled for a specific `day` + `shift_time` |

| `role` | All volunteers with a given `default_role` |

| `affiliation_missionary` | All volunteers with `affiliation = 'missionary'` |



`getInboxMessages()` in `lib/messageUtils.js` filters the message list to only messages the current user should see in their inbox (excludes own sent messages and affiliation-gated messages they don't qualify for).



---



## Push Notifications



`lib/pushNotifications.js` wraps the browser Push API:



- `subscribeToPush(supabase, userId)` — requests notification permission, registers a push subscription via the service worker, and stores the subscription endpoint in the database

- `unsubscribeFromPush(supabase, userId)` — removes the push subscription from both the browser and the database



The service worker (`public/sw.js`) handles incoming push events. Server-side push delivery uses the `web-push` npm package. A Vercel cron job (`/api/cron/shift-reminder`) sends shift reminders at 10 AM and 2 PM Mountain Time on weekdays to volunteers scheduled for the upcoming slot who haven't clocked in.



---
