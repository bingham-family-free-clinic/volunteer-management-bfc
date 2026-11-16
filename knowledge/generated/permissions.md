---
title: Permissions
feature: permissions
keywords:
  - roles
  - access control
  - routing
  - default role
  - affiliation
  - admin access
related:
  - volunteers
last_generated: 2026-11-16
---

# Purpose

The permissions feature controls who can access each part of the volunteer management platform. Access is driven by Supabase profile fields such as role, default role, affiliation, and team, combined with route-level guards.

# Pages

- `/` — Login and password recovery; public.
- `/volunteer` — Default volunteer landing after login.
- `/provider` — Provider portal; requires `default_role = 'Provider'`.
- `/admin` — Admin dashboard; requires `role = 'admin'` and `hasAdminAccess()`.
- `/clinical-supervisor` — Clinical Supervisor view; requires `default_role = 'Clinical Supervisor'` or `role = 'admin'`.
- `/ossm` — OSSM missionary oversight; authenticated session only.
- `/guest-hours` — Public guest hours form; no sign-in required.
- `/schedule/[token]` — Public interview self-scheduling with a valid token.

# Workflows

1. User logs in at `/` with Supabase email/password auth; session persists under key `bingham-app`.
2. Login redirect: providers go to `/provider`; all others go to `/volunteer`.
3. From `/volunteer`, eligible users see Switch View buttons to Admin, Clinical Supervisor, or OSSM based on profile fields.
4. Direct navigation to gated routes is redirected when the user does not meet the access rule.

# Business rules

- `profiles.role = 'admin'` unlocks `/admin`.
- `hasAdminAccess()` requires `affiliation = 'provider'` or `default_role` in an approved set including Director, Administrative Assistant, Office Manager, and others.
- Admin tab visibility depends on `default_role`; for example, Office Manager sees Live, Scheduling, Volunteers, Pipeline, Shifts, Data, Call-Outs, and Weekly Training.
- Mobile layout switches to bottom nav or sidebar patterns around 428px viewport width.

# User roles

- Admin: broadest access across admin tabs based on default_role.
- Clinical Supervisor: shift-scoped view for scheduled shifts.
- OSSM: missionary oversight view.
- Provider: clinical availability and scheduling.
- Volunteer: default volunteer portal.

# Frequently asked questions

Q: Can an Office Manager access `/clinical-supervisor`?
A: Only if they also have `role = 'admin'`; otherwise they are redirected to `/volunteer`.

Q: How do Switch View buttons appear?
A: Based on profile fields such as `role = 'admin'` or `default_role = 'Clinical Supervisor'` / `'Office Manager'` / `'OSSM'`.

# Related documents

- volunteers.md — profile fields that drive access
