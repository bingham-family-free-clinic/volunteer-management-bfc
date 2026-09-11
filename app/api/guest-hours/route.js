import 'server-only'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Self-contained model: guest hours live ONLY in guest_hours_submissions.
// No profiles rows, no shifts mirroring. Shifts tab + DataDashboard merge
// the guest table at read time.

// Simple in-memory per-IP rate limit (10 POSTs / hour). Resets on deploy;
// sufficient for a low-volume kiosk form behind Vercel.
const hits = new Map()
function isRateLimited(ip) {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs)
  arr.push(now)
  hits.set(ip, arr)
  return arr.length > 10
}

function getMountainDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Public dropdown data: only active orgs. No auth required.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('guest_organizations')
    .select('id,name')
    .eq('is_active', true)
    .order('name')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ organizations: data || [] })
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { guest_name, organization_id, work_date, arrival_time, exit_time, website } = body || {}

  // Honeypot: bots fill it, humans never see it.
  if (website) return Response.json({ ok: true, skipped: true })

  const name = (guest_name || '').toString().trim().replace(/<[^>]*>/g, '')
  if (name.length < 2 || name.length > 100) {
    return Response.json({ error: 'Please enter your first and last name.' }, { status: 400 })
  }
  if (!organization_id) {
    return Response.json({ error: 'Please choose an affiliation.' }, { status: 400 })
  }
  if (!work_date || !/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
    return Response.json({ error: 'Please choose a valid date.' }, { status: 400 })
  }
  if (!arrival_time || !exit_time || !/^\d{2}:\d{2}/.test(arrival_time) || !/^\d{2}:\d{2}/.test(exit_time)) {
    return Response.json({ error: 'Please enter arrival and exit times.' }, { status: 400 })
  }

  // Date must be yesterday, today, or tomorrow (Mountain) — prevents backdating abuse.
  const allowed = new Set([getMountainDateStr(-1), getMountainDateStr(0), getMountainDateStr(1)])
  if (!allowed.has(work_date)) {
    return Response.json({ error: 'Date must be today (or yesterday if after midnight).' }, { status: 400 })
  }

  const arrMin = toMinutes(arrival_time)
  const exitMin = toMinutes(exit_time)
  if (!(exitMin > arrMin)) {
    return Response.json({ error: 'Exit time must be after arrival time.' }, { status: 400 })
  }
  const durationHours = Math.round(((exitMin - arrMin) / 60) * 100) / 100
  if (durationHours < 0.25) {
    return Response.json({ error: 'Shift must be at least 15 minutes.' }, { status: 400 })
  }
  if (durationHours > 12) {
    return Response.json({ error: 'Shifts over 12 hours cannot be submitted here — please see staff.' }, { status: 400 })
  }

  // No future exit when submitting for today (Mountain wall-clock compare).
  const todayMt = getMountainDateStr(0)
  if (work_date === todayMt) {
    const nowMt = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })
    if (toMinutes(exit_time.slice(0, 5)) > toMinutes(nowMt) + 5) {
      return Response.json({ error: 'Exit time cannot be in the future.' }, { status: 400 })
    }
  }

  // Org must exist + be active.
  const { data: org, error: orgErr } = await supabaseAdmin
    .from('guest_organizations')
    .select('id,name,is_active')
    .eq('id', organization_id)
    .maybeSingle()
  if (orgErr || !org) return Response.json({ error: 'Invalid affiliation.' }, { status: 400 })
  if (!org.is_active) {
    return Response.json({ error: 'That affiliation is currently deactivated — please see staff.' }, { status: 400 })
  }

  // Canonical guest row (auto-final, no approval). Single write — no shifts
  // mirroring in the self-contained model.
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('guest_hours_submissions')
    .insert({
      guest_name: name,
      organization_id: org.id,
      work_date,
      arrival_time: arrival_time.slice(0, 5),
      exit_time: exit_time.slice(0, 5),
      duration_hours: durationHours,
    })
    .select('id')
    .single()
  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

  return Response.json({
    ok: true,
    id: inserted.id,
    organization: org.name,
    duration_hours: durationHours,
  })
}
