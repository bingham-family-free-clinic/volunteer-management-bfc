export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export const SHIFTS = ['10-2', '2-6']

export const ROLES = [
  'Clinical Staff',
  'Scribe',
  'Receptionist',
  'Lab',
  'Pharmacy',
  'Clinical Supervisor',
  'Patient Nav.',
  'Mental Health',
  'Support Center',
  'Young Support',
  'Float',
  'OSSM',
  'Information Systems',
  'Office Assistant',
  'Office Manager',
  'Administrative Assistant',
  'Human Resources',
  'Credentialing',
  'Communications',
  'Provider',
  'Director',
  'Lab Director',
  'Physical Wellness'
]

export const AFFILIATION_LABELS = {
  missionary: 'Missionary',
  student: 'Student',
  volunteer: 'Volunteer',
  intern: 'Intern',
  provider: 'Clinical Care Volunteer',
}

export const LUNCH_SHIFTS = [
  { id: 1, label: 'Lunch Shift 1', time: '12:30–1:00 PM' },
  { id: 2, label: 'Lunch Shift 2', time: '1:00–1:30 PM'  },
]


export const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export const ROLE_SUGGESTIONS = {
  'Clinical Supervisor': 1, 'Float': 1,
  'Mental Health': 0, 'Patient Nav.': 3, 'Young Support': 0, 'Receptionist': 3,
  'Scribe': 3, 'Support Center': 2, 'Clinical Staff': 3, 'Lab': 3
}
export const SCHOOLS = ['BYU', 'UVU', 'Norda', 'SLCC', 'U of U', 'Other']
export const MAJORS = ['Pre-Med', 'Pre-Nursing', 'Pre-PA', 'Pre-Dental', 'Pre-Pharmacy', 'Pre-PT', 'Other Pre-Health', 'Biology', 'Chemistry', 'Biochemistry', 'Neuroscience', 'Public Health', 'Health Administration', 'Nutrition / Dietetics', 'Psychology', 'Social Work', 'Computer Science', 'Data Science','Biomedical Engineering', 'Other STEM', 'Business', 'Finance', 'Marketing', 'Management','English', 'Political Science', 'Sociology', 'Communications','Other']

export const ACTION_LABELS = {
  approved_callout: 'Approved callout', denied_callout: 'Denied callout',
  approved_cover: 'Approved cover', denied_cover: 'Denied cover',
  approved_hours: 'Approved hours', rejected_hours: 'Rejected hours',
  deleted_shift: 'Deleted shift', edited_shift: 'Edited shift', created_shift: 'Created shift',
  edited_volunteer: 'Edited volunteer', deactivated_volunteer: 'Deactivated volunteer',
  reactivated_volunteer: 'Reactivated volunteer', assigned_schedule: 'Assigned to schedule',
  removed_schedule: 'Removed from schedule', sent_message: 'Sent message', created_volunteer: 'Created volunteer',
}
export const ACTION_COLORS = {
  approved_callout: '#4ade80', denied_callout: '#ef4444', approved_cover: '#4ade80', denied_cover: '#ef4444',
  approved_hours: '#4ade80', rejected_hours: '#ef4444', deleted_shift: '#ef4444', edited_shift: '#60a5fa',
  created_shift: '#60a5fa', edited_volunteer: '#60a5fa', deactivated_volunteer: '#f87171',
  reactivated_volunteer: '#4ade80', assigned_schedule: '#a78bfa', removed_schedule: '#f87171',
  sent_message: '#94a3b8', created_volunteer: '#a78bfa',
}

export const TRAINING_APPROVER_ROLES = [
  'Clinical Supervisor', 'CMI', 'Office Manager', 'Administrative Assistant',
]
export const TRAINING_WRITTEN_APPROVAL_ROLES = [
  'Clinical Supervisor', 'CMI',
]
export const TRAINING_TRIGGER_ROLES = [
  'Administrative Assistant', 'Director', 'Office Manager', 'Human Resources',
]
export const TRAINING_STAGE_LABELS = {
  written_training:         'Written Training',
  pending_written_approval: 'Awaiting Written Approval',
  shift_1_pending:          'Shift 1 Pending',
  shift_2_pending:          'Shift 2 Pending',
  pending_vouch:            'Awaiting Vouch',
  active:                   'Active',
}