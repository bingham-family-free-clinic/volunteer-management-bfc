import * as webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

// Service-role client so this can read push_subscriptions server-side
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(req) {
  const { userIds, title, body, url } = await req.json()

  // Fetch all matching subscriptions
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds)

  const payload = JSON.stringify({ title, body, url })

  const results = await Promise.allSettled(
    (subs || []).map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  )

  return Response.json({ sent: results.filter(r => r.status === 'fulfilled').length })
}