export function recipientLabel(msg) {
  if (msg.recipient_type === 'everyone') return 'Everyone'
  if (msg.recipient_type === 'admin') return 'Admins'
  if (msg.recipient_type === 'volunteer') return 'You'
  if (msg.recipient_type === 'group') return 'Group'
  if (msg.recipient_type === 'shift') return `${msg.recipient_day ? msg.recipient_day.charAt(0).toUpperCase() + msg.recipient_day.slice(1, 3) : ''} ${msg.recipient_shift || ''}`.trim() + ' Shift'
  if (msg.recipient_type === 'affiliation_missionary') return 'Missionaries'
  if (msg.recipient_type === 'role') return `${msg.recipient_role}`
  return msg.recipient_type
}

// Group chats (Individuals tab, 2+ people) store the member id list as JSON
// in recipient_role, since the messages table has no array column.
export function parseGroupMemberIds(msg) {
  if (!msg || msg.recipient_type !== 'group') return []
  try {
    const parsed = JSON.parse(msg.recipient_role)
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string' && id) : []
  } catch {
    return []
  }
}

export const allowedToSeeHRMessagesRoles = [
  'Administrative Assistant',
  'Office Manager',
  'Director',
  'Human Resources'
]

// Audience types that address more than one person, so the name in the
// "To: …" line is emphasised ("To: **Everyone**", "To: **Group**") while a
// message to a single person stays plain ("To: Jon Doe").
const MULTI_RECIPIENT_TYPES = [
  'everyone',
  'admin',
  'role',
  'shift',
  'affiliation_missionary',
  'group',
]

export function isMultiRecipient(msg) {
  if (!msg) return false
  // Admin threads always address the Admins group, even when a reply also
  // includes the original volunteer sender as an extra recipient.
  if (msg.recipient_type === 'admin') return true
  // An explicit person beats the audience type (e.g. an HR reply addressed
  // back to one volunteer still shows a single name).
  if (msg.recipient_volunteer_id) return false
  return MULTI_RECIPIENT_TYPES.includes(msg.recipient_type)
}

// "To: Jon Doe" → ["To: ", "Jon Doe"] so only the name can be bolded.
export function splitToLabel(label) {
  const match = /^To:\s*/.exec(label || '')
  if (!match) return ['', label || '']
  return [label.slice(0, match[0].length), label.slice(match[0].length)]
}

// ── Attachments ──────────────────────────────────────────────────────────────
// The messages table has no array column (see recipient_role above), so a
// message's files are stored as a JSON array in image_url:
//   [{ url, name, type }, …]
// A bare URL in that column is a legacy single image.

const EXT_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', ico: 'image/x-icon',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
}

function nameFromUrl(url) {
  try {
    const withoutQuery = String(url).split('?')[0]
    const last = withoutQuery.split('/').pop() || ''
    return decodeURIComponent(last)
  } catch {
    return ''
  }
}

export function typeFromName(name) {
  const base = String(name || '').split('?')[0]
  const ext = (base.split('.').pop() || '').toLowerCase()
  return EXT_TYPES[ext] || ''
}

// Reads image_url into a normalised attachment list. Tolerates a bare URL
// (legacy rows), an already-parsed array, and malformed JSON.
export function parseAttachments(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter(a => a && a.url).map(a => ({
      url: a.url,
      name: a.name || nameFromUrl(a.url),
      type: a.type || '',
    }))
  }
  if (typeof value !== 'string') return []

  const trimmed = value.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      const list = Array.isArray(parsed) ? parsed : (parsed && parsed.files) || []
      return list.filter(a => a && a.url).map(a => ({
        url: a.url,
        name: a.name || nameFromUrl(a.url),
        type: a.type || typeFromName(a.name || nameFromUrl(a.url)),
      }))
    } catch {
      // Only bare URLs ever live in this column, and those never start with
      // "[", so a broken payload yields no attachments rather than a junk URL.
      return []
    }
  }

  const name = nameFromUrl(value)
  return [{ url: value, name, type: typeFromName(name) }]
}

export function isImageAttachment(att) {
  if (!att) return false
  if (att.type && /^image\//i.test(att.type)) return true
  const ref = att.name || nameFromUrl(att.url || '')
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|heif|ico)$/i.test(ref)
}

// Single image → keep image_url a plain URL (legacy compatible).
// Anything else → JSON array.
export function serializeAttachments(files) {
  const list = (files || []).filter(f => f && f.url)
  if (!list.length) return null
  if (list.length === 1 && isImageAttachment(list[0])) return list[0].url
  return JSON.stringify(list.map(f => ({
    url: f.url,
    name: f.name || nameFromUrl(f.url),
    type: f.type || typeFromName(f.name || nameFromUrl(f.url)),
  })))
}

// Blob download with an open-in-new-tab fallback (storage CORS, etc.).
export async function downloadAttachment(att) {
  if (!att || !att.url) return
  try {
    const res = await fetch(att.url)
    if (!res.ok) throw new Error('fetch failed')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = att.name || 'download'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    window.open(att.url, '_blank', 'noopener')
  }
}

export function getInboxMessages(messages, user, profile) {
  return messages.filter(m => {
    if (m.sender_id === user?.id) return false
    if (
      m.recipient_type === 'affiliation_missionary' &&
      profile?.affiliation !== 'missionary'
    ) return false

    if (m.recipient_type === 'admin') {
      // Admins with an HR-visible role see all admin messages. An admin thread
      // reply can also name the original volunteer sender as an extra
      // recipient (shown as "To: Admins"), so that volunteer sees it too.
      if (allowedToSeeHRMessagesRoles.includes(profile?.default_role)) return true
      return Boolean(m.recipient_volunteer_id) && m.recipient_volunteer_id === user?.id
    }

    if (m.recipient_type === 'volunteer') {
      return m.recipient_volunteer_id === user?.id
    }

    if (m.recipient_type === 'group') {
      return parseGroupMemberIds(m).includes(user?.id)
    }

    return true
  })
}

// ── Unread thread count (shared by the tab badge and MessageTab) ────────────
// MessageTab derives its own count from the threads it actually renders, and
// reports it to the page via onUnreadCountChange. The page badge must use the
// SAME rules, otherwise the badge counts a message the tab then hides (e.g. an
// admin reply the viewer isn't an audience member of) and the number flips
// to 0 the moment the tab mounts, then returns on reload.
// Mirrors canSeeReply / inboxThreads / isThreadUnread in MessageTab.jsx; keep
// them in sync.
export function countUnreadThreads(messages, readIds, user, profile) {
  if (!user?.id) return 0
  const reads = readIds instanceof Set ? readIds : new Set(readIds || [])
  const all = (messages || []).filter(m => m != null)
  const topLevel = all.filter(m => !m.parent_message_id)
  const topById = new Map(topLevel.map(m => [String(m.id), m]))

  const canSeeReply = (r, root) => {
    if (r.sender_id === user.id) return true
    if (r.recipient_type === 'volunteer') return r.recipient_volunteer_id === user.id
    if (r.recipient_type === 'group') {
      const audience = new Set(
        [...parseGroupMemberIds(r), r.sender_id, root?.sender_id].filter(Boolean)
      )
      return audience.has(user.id)
    }
    if (!profile) return true
    return getInboxMessages([r], user, profile).length > 0
  }

  const repliesMap = {}
  all.filter(m => m.parent_message_id).forEach(r => {
    const root = topById.get(String(r.parent_message_id))
    if (!canSeeReply(r, root)) return
    ;(repliesMap[r.parent_message_id] ||= []).push(r)
  })

  const inboxIds = new Set(
    (profile
      ? getInboxMessages(topLevel, user, profile)
      : topLevel.filter(m => m.sender_id !== user.id)
    ).map(m => m.id)
  )

  return topLevel.filter(m => {
    const replies = repliesMap[m.id] || []
    const hasReplyFromOthers = replies.some(r => r.sender_id !== user.id)
    // Own threads only appear once someone else has replied.
    if (m.sender_id === user.id && !hasReplyFromOthers) return false
    if (!inboxIds.has(m.id) && !hasReplyFromOthers) return false
    const rootUnread = !reads.has(m.id) && m.sender_id !== user.id
    const replyUnread = replies.some(r => !reads.has(r.id) && r.sender_id !== user.id)
    return rootUnread || replyUnread
  }).length
}
