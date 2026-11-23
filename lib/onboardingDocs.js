// Single source of truth for onboarding checklist documents and their
// requirements. Add new documents to ONBOARDING_DOCS and document-specific
// role/affiliation exceptions to ONBOARDING_REQUIREMENTS below.

// Every document on the onboarding checklist, in display order. Uploaded
// documents are stored as a zip; form documents generate and save their own PDF.
export const ONBOARDING_DOCS = [
  { key: 'background_check',          label: 'Background Check',          bucket: 'onboarding-background-checks', urlKey: 'background_check_url',  type: 'upload' },
  { key: 'id_check',                  label: 'Photo ID',                  bucket: 'onboarding-ids',               urlKey: 'id_check_url',          type: 'upload' },
  { key: 'immunization',              label: 'Immunizations',             bucket: 'onboarding-immunizations',     urlKey: 'immunization_url',      type: 'upload' },
  { key: 'tb_test',                   label: 'TB Test',                   bucket: 'onboarding-tb-tests',          urlKey: 'tb_test_url',           type: 'upload' },
  { key: 'licenses_certifications',   label: 'Licenses & Certifications', bucket: 'onboarding-licenses',          urlKey: 'licenses_url',          type: 'upload' },
  { key: 'confidentiality_agreement', label: 'Confidentiality Agreement', bucket: 'onboarding-confidentiality',   urlKey: 'confidentiality_url',   type: 'form',   form: 'confidentiality_agreement', formPage: 'confidentiality_agreement.html', formWidth: 760 },
  { key: 'parking_pass',              label: 'Parking Pass',              bucket: 'onboarding-parking-passes',    urlKey: 'parking_pass_url',      type: 'form',   form: 'parking_pass',              formPage: 'parking_pass.html',              formWidth: 600 },
]

export const ONBOARDING_UPLOAD_DOCS   = ONBOARDING_DOCS.filter(doc => doc.type === 'upload')
export const ONBOARDING_FORM_DOCS     = ONBOARDING_DOCS.filter(doc => doc.type === 'form')
export const ONBOARDING_FILE_DOCS     = ONBOARDING_DOCS.filter(doc => doc.bucket && doc.urlKey)
export const ONBOARDING_FORM_DOC_KEYS = new Set(ONBOARDING_FORM_DOCS.map(doc => doc.key))

// Backwards-compatible names for existing integrations.
export const VOLUNTEER_UPLOAD_DOCS    = ONBOARDING_UPLOAD_DOCS
export const VOLUNTEER_FORM_DOCS      = ONBOARDING_FORM_DOCS
export const VOLUNTEER_ONBOARDING_DOCS = ONBOARDING_DOCS

// Requirements start with defaultRequired, then apply the matching affiliation
// and role rules. A rule can exclude a default document with notRequired or
// add another document with required. Explicit additions are applied last, so
// they win if a future rule ever overlaps.
export const ONBOARDING_REQUIREMENTS = {
  defaultRequired: [
    'parking_pass',
    'confidentiality_agreement',
    'background_check',
    'id_check',
    'immunization',
    'tb_test',
  ],
  affiliations: {
    missionary: {
      notRequired: ['immunization', 'tb_test', 'background_check'],
    },
  },
  roles: {
    'Information Systems': { notRequired: ['immunization', 'tb_test'] },
    'Communications':      { notRequired: ['immunization', 'tb_test'] },
    'Credentialing':       { notRequired: ['immunization', 'tb_test'] },
    'Human Resources':     { notRequired: ['immunization', 'tb_test'] },
    'HR':                  { notRequired: ['immunization', 'tb_test'] },
    'Pharmacy':            { required: ['licenses_certifications'] },
    'Lab':                 { required: ['licenses_certifications'] },
  },
}

export function hasSavedOnboardingPrefs(affiliation, defaultRole) {
  return !!affiliation && !!defaultRole
}

function getRequirementRules(affiliation, defaultRole) {
  return [
    ONBOARDING_REQUIREMENTS.affiliations[affiliation],
    ONBOARDING_REQUIREMENTS.roles[defaultRole],
  ].filter(Boolean)
}

export function getRequiredDocKeys(affiliation, defaultRole) {
  if (!hasSavedOnboardingPrefs(affiliation, defaultRole)) return []

  const required = new Set(ONBOARDING_REQUIREMENTS.defaultRequired)
  const rules = getRequirementRules(affiliation, defaultRole)

  for (const rule of rules) {
    for (const itemKey of rule.notRequired || []) required.delete(itemKey)
  }
  for (const rule of rules) {
    for (const itemKey of rule.required || []) required.add(itemKey)
  }

  return Array.from(required)
}

export function isDocRequired(itemKey, affiliation, defaultRole) {
  return getRequiredDocKeys(affiliation, defaultRole).includes(itemKey)
}

export function isDocNotNeeded(itemKey, affiliation, defaultRole) {
  if (!hasSavedOnboardingPrefs(affiliation, defaultRole)) return false
  if (isDocRequired(itemKey, affiliation, defaultRole)) return false

  return getRequirementRules(affiliation, defaultRole)
    .some(rule => (rule.notRequired || []).includes(itemKey))
}

export function isDocOptional(itemKey, affiliation, defaultRole) {
  if (!hasSavedOnboardingPrefs(affiliation, defaultRole)) return false
  return !isDocRequired(itemKey, affiliation, defaultRole)
    && !isDocNotNeeded(itemKey, affiliation, defaultRole)
}
