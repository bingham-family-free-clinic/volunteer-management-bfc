// Shared metadata for the documents a volunteer can upload directly during
// onboarding. Keep in sync with CHECKLIST_ITEMS in components/Pipeline.js.

export const VOLUNTEER_UPLOAD_DOCS = [
  { key: 'background_check',        label: 'Background Check',        bucket: 'onboarding-background-checks', urlKey: 'background_check_url' },
  { key: 'id_check',                label: 'ID',                      bucket: 'onboarding-ids',               urlKey: 'id_check_url' },
  { key: 'immunization',            label: 'Immunization',            bucket: 'onboarding-immunizations',     urlKey: 'immunization_url' },
  { key: 'tb_test',                 label: 'TB Test',                 bucket: 'onboarding-tb-tests',          urlKey: 'tb_test_url' },
  { key: 'licenses_certifications', label: 'Licenses & Certifications', bucket: 'onboarding-licenses',        urlKey: 'licenses_url' },
]

const NON_PATIENT_ROLES = ['Information Systems', 'Communications']

const DEFAULT_REQUIRED = ['background_check', 'id_check', 'immunization', 'tb_test']
const NON_PATIENT_ROLES_REQUIRED = ['background_check', 'id_check']
const MISSIONARY_REQUIRED = ['id_check']

export function hasSavedOnboardingPrefs(affiliation, defaultRole) {
  return !!affiliation && !!defaultRole
}

export function getRequiredDocKeys(affiliation, defaultRole) {
  if (affiliation === 'missionary') return MISSIONARY_REQUIRED
  if (NON_PATIENT_ROLES.includes(defaultRole)) return NON_PATIENT_ROLES_REQUIRED
  return DEFAULT_REQUIRED
}

export function isDocNotNeeded(itemKey, affiliation, defaultRole) {
  if (itemKey === 'licenses_certifications') return false
  if (!hasSavedOnboardingPrefs(affiliation, defaultRole)) return false
  return !getRequiredDocKeys(affiliation, defaultRole).includes(itemKey)
}
