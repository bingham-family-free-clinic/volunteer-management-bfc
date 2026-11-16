---
title: Attendance
feature: attendance
keywords:
  - attendance
  - hours
  - clock in
  - clock out
  - no-shows
  - guest hours
related:
  - scheduling
  - volunteers
last_generated: 2026-11-16
---

# Purpose

The attendance feature records when volunteers work, tracks total hours, and surfaces attendance patterns such as no-shows and repeat lates. It powers the admin Data tab reports and merges guest hours submissions into clinic analytics.

# Pages

- `/admin` — Admin dashboard Data tab: hours totals, no-shows, repeat lates, per-volunteer reports, attendance bar chart.
- `/volunteer` — Volunteer portal Account tab: total hours and shift history.
- `/ossm` — OSSM Missionaries tab: per-missionary attendance records and monthly hours breakdown.
- `/clinical-supervisor` — Clinical Supervisor Live tab: today's callouts and active shifts.

# Workflows

1. Volunteer clocks in and out through the volunteer portal.
2. Clock events produce attendance records tied to shifts.
3. Guest volunteers without accounts submit hours through the public guest hours form; hours merge into analytics at read time.
4. Admin reviews attendance data on the Data tab, paginated at 20 per page.

# Business rules

- Attendance records before 2026-03-29 are excluded from analytics.
- Guest submissions are auto-final and do not mirror into the shifts table.
- Guest validation: no future dates, backdating limited to 30 days, minimum 15-minute shift, maximum 12 hours, and a per-IP rate limit of 10 submissions per hour.
- All times use Mountain Time (`America/Denver`).

# User roles

- Admin: reviews aggregate attendance and per-volunteer reports.
- Volunteer: views own total hours and shift history.
- OSSM: views missionary attendance records and monthly hours.

# Frequently asked questions

Q: Are guest hours included in attendance reports?
A: Yes. Guest hours merge into admin analytics at read time.

Q: Can I backdate guest hours?
A: Yes, up to 30 days back. Future dates are not allowed.

# Related documents

- scheduling.md — how shifts are created and worked
- volunteers.md — volunteer roster
