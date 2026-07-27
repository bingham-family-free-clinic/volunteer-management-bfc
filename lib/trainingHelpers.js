import { TRAINING_APPROVER_ROLES, TRAINING_WRITTEN_APPROVAL_ROLES, TRAINING_TRIGGER_ROLES } from './constants'

export function getEffectiveTrainingRoles(profile, volunteerRoleStatus) {
  return [profile?.default_role, ...(volunteerRoleStatus?.training_privileges || [])].filter(Boolean)
}
export function canApproveTraining(profile, volunteerRoleStatus) {
  return getEffectiveTrainingRoles(profile, volunteerRoleStatus).some(r => TRAINING_APPROVER_ROLES.includes(r))
}
export function canApproveWrittenTraining(profile, volunteerRoleStatus) {
  return getEffectiveTrainingRoles(profile, volunteerRoleStatus).some(r => TRAINING_WRITTEN_APPROVAL_ROLES.includes(r))
}
export function canTriggerTraining(profile, volunteerRoleStatus) {
  return getEffectiveTrainingRoles(profile, volunteerRoleStatus).some(r => TRAINING_TRIGGER_ROLES.includes(r))
}