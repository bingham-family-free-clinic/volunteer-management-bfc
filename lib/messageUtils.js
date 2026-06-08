export function recipientLabel(msg) {
  if (msg.recipient_type === 'everyone') return 'Everyone'
  if (msg.recipient_type === 'admin') return 'Admin'
  if (msg.recipient_type === 'volunteer') return 'You'
  if (msg.recipient_type === 'shift') return `${msg.recipient_day ? msg.recipient_day.slice(0,3) + ' ' : ''}${msg.recipient_shift}`
  if (msg.recipient_type === 'affiliation_missionary') return 'Missionaries'
  if (msg.recipient_type === 'role') return `${msg.recipient_role}`
  return msg.recipient_type
}

export function getInboxMessages(messages, user, profile) {
  return messages.filter(m => {
    if (m.sender_id === user?.id) return false
    if (
      m.recipient_type === 'affiliation_missionary' &&
      profile?.affiliation !== 'missionary'
    ) return false

    if (m.recipient_type === 'volunteer') {
      return m.recipient_volunteer_id === user?.id
    }

    return true
  })
}