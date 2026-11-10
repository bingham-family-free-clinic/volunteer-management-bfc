// ── Shared, egress-efficient message syncing ────────────────────────────────
//
// Everything that reads the `messages` / `message_reads` / `profiles` tables
// for the Messages feature goes through here, so the three pages (admin,
// volunteer, provider) and MessageTab all share the same cheap strategy:
//
//   • Fetch a full window ONCE, then only ask the database for rows newer
//     than a watermark ("delta sync"). A poll with nothing new returns ~0 bytes
//     instead of re-downloading 50 messages, every read receipt and every
//     profile.
//   • Realtime INSERT payloads are merged straight into state (no refetch).
//   • Read receipts are only requested for message ids we actually hold
//     (chunked `.in()`), never "every read this user has ever made".
//   • Profiles (names) rarely change, so they are cached and shared.
//   • Rows the UI can never show (direct messages between two other people)
//     are excluded in the query itself and dropped from realtime payloads.

export const MSG_PAGE_SIZE = 10
export const MSG_FETCH_LIMIT = MSG_PAGE_SIZE * 5 // matches the old window size

// Columns MessageTab renders. The `sender:profiles!…(full_name, role)` join is
// gone: the name is resolved from the cached profiles list and `role` was never
// read anywhere.
export const MSG_COLUMNS =
  'id, created_at, body, image_url, recipient_type, recipient_shift, recipient_day, recipient_role, recipient_volunteer_id, sender_id, parent_message_id'

// Columns the unread-badge needs (no body / attachments).
export const BADGE_COLUMNS =
  'id, created_at, sender_id, recipient_type, recipient_role, recipient_volunteer_id, parent_message_id'

const MSG_KEYS = MSG_COLUMNS.split(',').map(s => s.trim())

// How often a read-receipt refresh is allowed as a fallback (realtime normally
// delivers them instantly; this only covers a dropped connection).
export const READS_REFRESH_MS = 3 * 60 * 1000
// Profiles are refreshed at most this often unless an unknown sender shows up.
export const PROFILES_TTL_MS = 10 * 60 * 1000

// ── Row helpers ─────────────────────────────────────────────────────────────

// Trim a realtime payload row down to the columns we keep in state.
export function slimMessage(row) {
  if (!row || !row.id) return null
  const out = {}
  MSG_KEYS.forEach(k => { out[k] = row[k] ?? null })
  return out
}

// A direct message between two OTHER people is never displayed to this user
// (not in the inbox, sent list, threads or badge count), so never download it.
export function isHiddenDM(row, uid) {
  return Boolean(
    row &&
    row.recipient_type === 'volunteer' &&
    row.sender_id !== uid &&
    row.recipient_volunteer_id !== uid
  )
}

// PostgREST filter equivalent of !isHiddenDM(), for use with .or().
function visibleRowsFilter(uid) {
  return `recipient_type.neq.volunteer,sender_id.eq.${uid},recipient_volunteer_id.eq.${uid}`
}

// Newest-first, de-duplicated by id. `incoming` wins on conflict.
export function mergeMessages(prev, incoming) {
  const byId = new Map()
  ;(prev || []).forEach(m => { if (m) byId.set(m.id, m) })
  ;(incoming || []).forEach(m => { if (m) byId.set(m.id, m) })
  return [...byId.values()].sort((a, b) => {
    const d = Date.parse(b.created_at) - Date.parse(a.created_at)
    return d !== 0 ? d : (a.id < b.id ? 1 : -1)
  })
}

export function maxCreatedAt(rows) {
  let max = null
  ;(rows || []).forEach(r => {
    if (r?.created_at && (!max || Date.parse(r.created_at) > Date.parse(max))) max = r.created_at
  })
  return max
}

// ── Queries ─────────────────────────────────────────────────────────────────

// One page of messages. Pass `before` for older pages, `after` for delta sync.
export async function fetchMessageRows(supabase, uid, { columns = MSG_COLUMNS, before, after, limit = MSG_FETCH_LIMIT } = {}) {
  let q = supabase
    .from('messages')
    .select(columns)
    .or(visibleRowsFilter(uid))
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)
  if (after)  q = q.gt('created_at', after)
  const { data, error } = await q
  if (error) return { rows: null, error }
  return { rows: (data || []).filter(m => m != null), error: null }
}

// Read receipts for just the given message ids (chunked to keep URLs short).
export async function fetchReadIds(supabase, uid, messageIds) {
  const ids = [...new Set((messageIds || []).filter(Boolean))]
  const out = new Set()
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('message_reads')
      .select('message_id')
      .eq('user_id', uid)
      .in('message_id', ids.slice(i, i + CHUNK))
    if (error) return null // caller keeps what it already has
    ;(data || []).forEach(r => out.add(r.message_id))
  }
  return out
}

// ── Profiles cache (shared by every MessageTab mount) ───────────────────────
let profilesCache = { at: 0, data: null, inflight: null }

export function getCachedProfiles() {
  return profilesCache.data
}

export async function loadProfiles(supabase, { force = false } = {}) {
  const fresh = profilesCache.data && Date.now() - profilesCache.at < PROFILES_TTL_MS
  if (fresh && !force) return profilesCache.data
  if (profilesCache.inflight) return profilesCache.inflight
  profilesCache.inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, default_role, status')
        .order('full_name')
      if (!error && data) profilesCache = { at: Date.now(), data, inflight: null }
      return profilesCache.data || []
    } finally {
      profilesCache.inflight = null
    }
  })()
  return profilesCache.inflight
}

// ── Cross-mount view cache ──────────────────────────────────────────────────
// Admin/volunteer pages unmount MessageTab when you leave the tab. Keeping the
// last state here lets the next visit paint instantly and only fetch the delta.
let viewCache = null // { userId, messages, readIds, cursor, hasMore, watermark, readsAt }

export function getViewCache(userId) {
  return viewCache && viewCache.userId === userId ? viewCache : null
}
export function setViewCache(next) { viewCache = next }
export function clearViewCache() { viewCache = null }

// ── Unread-badge loader (pages that show a badge while MessageTab is closed) ─
// Holds a light copy of recent messages + read ids; each refresh is a delta.
export function createUnreadBadgeLoader(supabase, countUnreadThreads) {
  const state = { userId: null, msgs: new Map(), reads: new Set(), watermark: null, readsAt: 0, inflight: null }

  function reset(userId) {
    state.userId = userId
    state.msgs = new Map()
    state.reads = new Set()
    state.watermark = null
    state.readsAt = 0
  }

  function countNow(user, profile) {
    return countUnreadThreads([...state.msgs.values()], state.reads, user, profile)
  }

  async function refreshReads(uid) {
    const fresh = await fetchReadIds(supabase, uid, [...state.msgs.keys()])
    if (fresh) {
      // Reads never go back to unread, so union with what we already know.
      fresh.forEach(id => state.reads.add(id))
      state.readsAt = Date.now()
    }
  }

  async function run(user, profile, { forceReads }) {
    const uid = user.id
    if (state.userId !== uid) reset(uid)

    if (!state.watermark) {
      const { rows } = await fetchMessageRows(supabase, uid, { columns: BADGE_COLUMNS })
      if (rows) {
        state.msgs = new Map(rows.map(r => [r.id, r]))
        state.watermark = maxCreatedAt(rows) || new Date(0).toISOString()
      }
      await refreshReads(uid)
    } else {
      const { rows } = await fetchMessageRows(supabase, uid, { columns: BADGE_COLUMNS, after: state.watermark })
      if (rows && rows.length >= MSG_FETCH_LIMIT) {
        // Too much happened while we were away to patch — start over.
        reset(uid)
        return run(user, profile, { forceReads: true })
      }
      if (rows && rows.length) {
        rows.forEach(r => state.msgs.set(r.id, r))
        state.watermark = maxCreatedAt(rows) || state.watermark
      }
      if (forceReads || Date.now() - state.readsAt > READS_REFRESH_MS) await refreshReads(uid)
    }
    return countNow(user, profile)
  }

  return {
    // Network: delta fetch (full fetch only the first time).
    load(user, profile, { forceReads = false } = {}) {
      if (!user?.id) return Promise.resolve(null)
      if (state.inflight) return state.inflight
      state.inflight = run(user, profile, { forceReads })
        .catch(() => null)
        .finally(() => { state.inflight = null })
      return state.inflight
    },
    // No network: fold a realtime INSERT payload in and recount.
    ingest(row, user, profile) {
      if (!user?.id || state.userId !== user.id || !state.watermark) return null
      const slim = slimMessage(row)
      if (!slim || isHiddenDM(slim, user.id)) return countNow(user, profile)
      state.msgs.set(slim.id, {
        id: slim.id, created_at: slim.created_at, sender_id: slim.sender_id,
        recipient_type: slim.recipient_type, recipient_role: slim.recipient_role,
        recipient_volunteer_id: slim.recipient_volunteer_id, parent_message_id: slim.parent_message_id,
      })
      return countNow(user, profile)
    },
    // No network: a read receipt arrived (e.g. read on another device).
    ingestRead(messageId, user, profile) {
      if (!user?.id || state.userId !== user.id || !messageId) return null
      state.reads.add(messageId)
      return countNow(user, profile)
    },
    // Make the next load() re-check read receipts (e.g. after leaving the tab
    // where reads were just made).
    markReadsStale() { state.readsAt = 0 },
  }
}