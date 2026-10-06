export function recipientLabel(msg) {
  if (msg.recipient_type === 'everyone') return 'Everyone'
  if (msg.recipient_type === 'admin') return 'Admin'
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

export function getInboxMessages(messages, user, profile) {
  return messages.filter(m => {
    if (m.sender_id === user?.id) return false
    if (
      m.recipient_type === 'affiliation_missionary' &&
      profile?.affiliation !== 'missionary'
    ) return false

    if (m.recipient_type === 'admin' && !allowedToSeeHRMessagesRoles.includes(profile?.default_role)) {
      return false
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