---
title: Volunteers
feature: volunteers
keywords:
  - volunteer roster
  - add volunteer
  - credentials
  - deactivate
  - reactivate
  - recruitment pipeline
related:
  - scheduling
  - attendance
last_generated: 2026-11-16
---

# Purpose

The volunteers feature manages the volunteer lifecycle from application through active service. Admins maintain the roster, create accounts, track provider credentials, and review hours. The recruitment pipeline moves applicants from applied to completed.

# Pages

- `/admin` — Admin dashboard Volunteers tab: filterable roster, provider credential banner, volunteer detail with edit/deactivate/reactivate, lazy-loaded shifts/schedule/hours.
- `/admin` — Admin dashboard Pipeline tab: recruitment workflow from application to onboarding.
- `/admin` — Admin dashboard Add Volunteer tab: creates Supabase Auth account and profiles row.
- `/volunteer` — Volunteer portal Account tab: profile, password change, push notification toggle, shift history.

# Workflows

1. Applicant submits an application; it enters the `applied` stage.
2. Admin moves the applicant to `interview`, then to `onboarding` after an interview.
3. Onboarding is a five-step wizard: affiliation, position, availability, documents, checklist.
4. Admin completes onboarding by creating the profile via the `create-volunteer` Edge Function; the application moves to `completed` and the volunteer joins the waitlist.
5. At any point an admin may reject an applicant, sending a rejection notice unless moved silently.

# Business rules

- Non-missionary applicants need background check, ID, and immunization files before profile creation.
- Missionaries have relaxed mandatory document requirements.
- Provider credentials track License, BLS, DEA, and TB expiration; status is `ok`, `expiring`, `expired`, `na`, or `missing`.
- Admin access requires `role = 'admin'` and `hasAdminAccess()`.

# User roles

- Admin: manages roster, pipeline, credentials, and volunteer creation.
- Volunteer: views and updates own account and shift history.

# Frequently asked questions

Q: How do I add a new volunteer?
A: Use the Admin dashboard Add Volunteer tab, which creates the Supabase Auth account and profiles row.

Q: What documents are required for onboarding?
A: Non-missionary applicants need background check, ID, and immunization files. Missionaries have relaxed requirements.

# Related documents

- scheduling.md — shift assignments for volunteers
- attendance.md — hours and attendance tracking
