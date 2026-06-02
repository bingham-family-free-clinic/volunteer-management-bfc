import 'server-only'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Service-role client — can read any row, bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

export async function POST(req) {
  // ── 1. Verify the caller is a logged-in user ─────────────────────────────
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Use a per-request client with the user's JWT to verify identity
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 2. Parse the request body ─────────────────────────────────────────────
  const {
    recipient_type,
    recipient_day,
    recipient_shift,
    recipient_role,
    recipient_volunteer_id,
    body,
    image_url,
    parent_message_id,
  } = await req.json()

  // ── 3. Insert the message ─────────────────────────────────────────────────
  const { data: message, error: insertError } = await supabaseAdmin
    .from('messages')
    .insert({
      sender_id:              user.id,
      recipient_type,
      recipient_day:          recipient_day          ?? null,
      recipient_shift:        recipient_shift        ?? null,
      recipient_role:         recipient_role         ?? null,
      recipient_volunteer_id: recipient_volunteer_id ?? null,
      body:                   body?.trim() ?? '',
      image_url:              image_url ?? null,
      parent_message_id:      parent_message_id      ?? null, 
    })
    .select()
    .single()

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  // ── 4. Resolve recipient user IDs ─────────────────────────────────────────
  // Mirrors getInboxMessages logic but server-side and in reverse —
  // instead of filtering messages for a user, we find users for a message.
  let recipientUserIds = []

  if (recipient_type === 'everyone') {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .neq('id', user.id)
    recipientUserIds = (data || []).map(p => p.id)

  } else if (recipient_type === 'admin') {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .neq('id', user.id)
    recipientUserIds = (data || []).map(p => p.id)

  } else if (recipient_type === 'affiliation_missionary') {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('affiliation', 'missionary')
      .neq('id', user.id)
    recipientUserIds = (data || []).map(p => p.id)

  } else if (recipient_type === 'role' && recipient_role) {
    const { data } = await supabaseAdmin
      .from('schedule')
      .select('volunteer_id')
      .eq('role', recipient_role)
      .neq('volunteer_id', user.id)
    recipientUserIds = [...new Set((data || []).map(s => s.volunteer_id))]

  } else if (recipient_type === 'shift' && recipient_day && recipient_shift) {
    const { data } = await supabaseAdmin
      .from('schedule')
      .select('volunteer_id')
      .eq('day_of_week', recipient_day)
      .eq('shift_time', recipient_shift)
      .neq('volunteer_id', user.id)
    recipientUserIds = [...new Set((data || []).map(s => s.volunteer_id))]

  } else if (
    (recipient_type === 'volunteer' || recipient_type === 'user') &&
    recipient_volunteer_id &&
    recipient_volunteer_id !== user.id
  ) {
    recipientUserIds = [recipient_volunteer_id]
  }

  // ── 5. Fetch push subscriptions and send ──────────────────────────────────
  if (recipientUserIds.length === 0) {
    return Response.json({ message_id: message.id, pushed: 0 })
  }

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .in('user_id', recipientUserIds)

  if (!subs || subs.length === 0) {
    return Response.json({ message_id: message.id, pushed: 0 })
  }

  // Get sender's first name for the notification title
  const { data: senderProfile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const senderName = senderProfile?.full_name?.split(' ')[0] ?? 'Someone'
  const notifPayload = JSON.stringify({
    title: `Message from ${senderName}`,
    body:  (body?.trim() || '📎 Image').slice(0, 120),
    url:   '/volunteer',
  })

  // Fire all pushes in parallel, collect stale endpoints to clean up
  const staleEndpoints = []

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notifPayload
        )
      } catch (err) {
        // 410 = subscription is expired or user revoked permission
        if (err.statusCode === 410) staleEndpoints.push(sub.endpoint)
      }
    })
  )

  // Clean up dead subscriptions so they don't accumulate
  if (staleEndpoints.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints)
  }

  return Response.json({
    message_id: message.id,
    pushed: subs.length - staleEndpoints.length,
  })
}