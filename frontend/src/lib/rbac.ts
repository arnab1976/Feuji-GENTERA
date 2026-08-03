/**
 * RBAC helpers — four-persona architecture from Feuji GENTERA portal.
 * Level 4 Provider Admin · Level 3 Provider User · Level 2 Tenant Admin · Level 1 Tenant User
 */

export type PortalRole =
  | 'Provider Admin'
  | 'Provider User'
  | 'Tenant Admin'
  | 'Tenant User';

export const ROLE_META: Record<
  PortalRole,
  { level: number; color: string; scope: string; label: string }
> = {
  'Provider Admin': { level: 4, color: '#7C3AED', scope: 'Platform · Full Access', label: 'Level 4' },
  'Provider User': { level: 3, color: '#0891B2', scope: 'Platform · View Only', label: 'Level 3' },
  'Tenant Admin': { level: 2, color: '#0D9488', scope: 'Tenant · Scope', label: 'Level 2' },
  'Tenant User': { level: 1, color: '#2563EB', scope: 'Tenant · Feature Access', label: 'Level 1' },
};

export function canManageProviders(role: string): boolean {
  return role === 'Provider Admin';
}

export function canViewAllTenants(role: string): boolean {
  return role === 'Provider Admin' || role === 'Provider User';
}

export function canManageTenants(role: string): boolean {
  return role === 'Provider Admin';
}

export function canInviteUsers(role: string): boolean {
  return role === 'Provider Admin' || role === 'Tenant Admin';
}

export function canApproveCost(role: string): boolean {
  return role === 'Provider Admin' || role === 'Tenant Admin';
}

export function canApproveBudgetEscalation(role: string): boolean {
  return role === 'Provider Admin';
}

export function canUseWorkflow(role: string): boolean {
  return (
    role === 'Provider Admin' ||
    role === 'Tenant Admin' ||
    role === 'Tenant User'
  );
}

/** Generate / submit Project Intake Form (Stage 1) */
export function canSubmitProjectIntake(role: string): boolean {
  return (
    role === 'Provider Admin' ||
    role === 'Tenant Admin' ||
    role === 'Tenant User'
  );
}

/**
 * Approve Project Intake before AI / cost / Terraform.
 * Tenant Admin is primary approver; Provider Admin can always approve.
 */
export function canApproveProjectIntake(role: string): boolean {
  return role === 'Provider Admin' || role === 'Tenant Admin';
}

export function canAccessOptimaFull(role: string): boolean {
  return role === 'Provider Admin' || role === 'Tenant Admin';
}

export function canViewOptima(role: string): boolean {
  return (
    role === 'Provider Admin' ||
    role === 'Provider User' ||
    role === 'Tenant Admin'
  );
}

export function canViewAudit(role: string): boolean {
  return role === 'Provider Admin' || role === 'Provider User';
}

/** Sidebar visibility for admin / workflow / optima sections */
export function canSeeAdminNav(role: string): boolean {
  return role === 'Provider Admin' || role === 'Provider User';
}

export function canMutateAdmin(role: string): boolean {
  return role === 'Provider Admin';
}

export function canSeeTenantAdminPortal(role: string): boolean {
  return role === 'Tenant Admin';
}

/** Tenant User roster — Platform Admin approval nav only */
export function canSeeTenantUserNav(role: string): boolean {
  return role === 'Provider Admin' || role === 'Provider User';
}

export function canInviteTenantUsers(role: string): boolean {
  return role === 'Tenant Admin';
}

export function canApproveTenantUsers(role: string): boolean {
  return role === 'Provider Admin';
}

export function isProviderRole(role: string): boolean {
  return role === 'Provider Admin' || role === 'Provider User';
}
