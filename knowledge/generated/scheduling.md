---
title: Scheduling
feature: scheduling
keywords:
  - shift scheduling
  - recurring shifts
  - callouts
  - shift coverage
  - waitlist
  - clinic openings
related:
  - attendance
  - volunteers
last_generated: 2026-11-16
---

# Purpose

The scheduling feature lets clinic staff build and manage recurring weekday shifts and lets volunteers see when they are expected to work. It replaces manual spreadsheets for coordinating who is scheduled, when they clock in and out, and what happens when someone cannot make a shift.

# Pages

- `/admin` — Admin dashboard Scheduling tab: day-by-day shift grid (Monday-Friday, 10-2 and 2-6), role assignments, callout and cover status, Waitlist, Clinic Openings.
- `/volunteer` — Volunteer portal Schedule tab: personal recurring schedule with week-of-month patterns, approved callouts, and shift pick-up requests.
- `/provider` — Provider portal Schedule tab: week-by-week provider schedule grid, add/remove one-time shifts, submit provider callouts.
- `/clinical-supervisor` — Clinical Supervisor Schedule tab: personal scheduled shifts with expandable volunteer rows.

# Workflows

1. Admin creates recurring shift rows `(volunteer, day_of_week, shift_time, role)` with optional `start_date`, `end_date`, and `week_pattern` (`every`, `odd`, `even`).
2. Volunteer clocks in/out through the volunteer portal Clock tab.
3. If a volunteer cannot work, they submit a callout; an admin approves or denies it.
4. Approved callouts without coverage appear as open shifts for other volunteers to request coverage.
5. Admin approves one cover request per open shift; others are auto-denied.

# Business rules

- Shifts are weekday only, Monday-Friday, with two windows: `10-2` (10:00 AM - 2:00 PM MT) and `2-6` (2:00 PM - 6:00 PM MT).
- `odd`/`even` week pattern refers to the week-of-month occurrence for that weekday.
- Role capacity warnings use `ROLE_SUGGESTIONS` limits; certain admin roles can exceed them.
- Provider recurring schedules are admin-managed; one-time provider shifts can be added by the provider or admin.

# User roles

- Admin: creates and edits schedules, approves callouts and coverage, manages waitlist and clinic openings.
- Volunteer: views personal schedule, clocks in/out, submits callouts, requests shift coverage.
- Provider: manages own one-time shifts and submits provider callouts.
- Clinical Supervisor: views scheduled shifts and language coverage for their assigned shifts.

# Frequently asked questions

Q: Can I schedule a shift on a weekend?
A: No. The clinic runs weekday shifts only, Monday-Friday.

Q: What happens when a callout is approved but no one covers it?
A: The shift becomes open for coverage, and other volunteers can submit cover requests.

Q: Can I remove my own recurring shift?
A: No. Recurring schedule rows are admin-managed. Volunteers can only remove their own one-time provider shifts.

# Related documents

- attendance.md — how attendance and hours are tracked
- volunteers.md — volunteer roster and credentials
