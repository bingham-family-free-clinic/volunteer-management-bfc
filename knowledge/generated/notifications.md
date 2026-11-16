---
title: Notifications
feature: notifications
keywords:
  - messaging
  - push notifications
  - threads
  - reply all
  - inbox
  - attachments
related:
  - volunteers
last_generated: 2026-11-16
---

# Purpose

The notifications feature provides internal messaging between clinic staff and volunteers. Conversations are threaded, support replies and Reply All, and can fan out push notifications. It replaces group-chat coordination for clinic communication.

# Pages

- `/volunteer` — Volunteer portal Messages tab: inbox, sent, compose, threaded conversations, typing indicators, file attachments.
- `/admin` — Admin dashboard Messages tab: full messaging UI with unread badge and HR-gated message visibility.
- `/provider` — Provider portal Messages tab: full messaging UI.

# Workflows

1. Sender composes a message through `POST /api/send-message` with a valid Supabase JWT.
2. The route inserts into `messages`, resolves recipients server-side, and fans out push notifications.
3. Threads group a root message with its replies and render as a single conversation.
4. Replies support Reply (to a specific message) and Reply All (to the full thread audience).
5. Attachments upload to Supabase Storage; images up to 5 MB total per submission.

# Business rules

- Recipient types: admin, everyone, volunteer, group, shift, role, affiliation_missionary.
- Inbox visibility is filtered client-side, excluding the user's own sent messages and affiliation-gated messages they do not qualify for.
- Messages are paginated at 10 per page.
- Typing indicators broadcast over Supabase realtime scoped to the current thread.

# User roles

- Admin: sends messages to any recipient type, views HR-gated messages.
- Volunteer: sends and receives messages within their visible threads.
- Provider: sends and receives messages within their visible threads.

# Frequently asked questions

Q: Can I attach files to a message?
A: Yes, one image plus additional files up to 5 MB total.

Q: Who receives a message sent to the shift recipient type?
A: Volunteers scheduled for a specific day and shift time.

# Related documents

- volunteers.md — volunteer roster and messaging participants
