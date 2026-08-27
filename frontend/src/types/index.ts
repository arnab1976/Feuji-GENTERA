/** Core TypeScript interfaces — mirrors Phase 1 and Phase 2 data models */

// ── Provider & Tenant ────────────────────────────────────────────────────────
export interface Provider {
  providerId: string;
  name: string;
  adminEmail: string;
  industry: string;
  plan: 'ENTERPRISE' | 'PROFESSIONAL' | 'STARTER';
  status: 'ACTIVE' | 'INACTIVE';
  tenants: string[];
  users: ProviderUser[];
  createdAt: string;
  /** Soft-deleted / moved to Archive — restore brings back to main list */
  archived?: boolean;
  /** @deprecated use archived */
  deleted?: boolean;
  /** Commissioned for use; false = decommissioned */
  commissioned?: boolean;
  archivedAt?: string;
}

export interface ProviderUser {
  userId: string;
  email: string;
  role: 'PROVIDER_ADMIN' | 'PROVIDER_USER' | 'TENANT_ADMIN' | 'TENANT_USER';
  fullName?: string;
}

export type InviteRole = 'PROVIDER_USER' | 'TENANT_ADMIN' | 'TENANT_USER';

export type TenantAdminIntakeData = {
  full_name?: string;
  org_name?: string;
  contact_email?: string;
  plan?: string;
  primary_cloud?: string;
  compliance?: string;
  job_title?: string;
  project?: string;
  environment?: string;
  app_category?: string;
  budget_ceiling?: number;
  description?: string;
};

/** Provider User registration intake (Level 3 · platform view-only) */
export type ProviderUserIntakeData = {
  full_name?: string;
  org_name?: string;
  contact_email?: string;
  department?: string;
  job_title?: string;
  function_area?: string;
  portfolio_scope?: string;
  contribution?: string;
  capabilities?: {
    view_providers_tenants?: boolean;
    view_llm_kit_progress?: boolean;
    view_portfolio_analytics?: boolean;
    view_optima_savings?: boolean;
    view_health_dashboards?: boolean;
    view_audit_readonly?: boolean;
    invite_users?: boolean;
    manage_tenants?: boolean;
    approve_costs?: boolean;
    submit_workflow?: boolean;
  };
  capability_requests?: {
    key: string;
    action: 'add' | 'exclude';
    label?: string;
  }[];
  request_note?: string;
  provider_notes?: string;
};

/** Tenant User requirement intake (filled by Tenant Admin → Provider approval) */
export type TenantUserIntakeData = {
  full_name?: string;
  org_name?: string;
  contact_email?: string;
  job_title?: string;
  function_area?: string;
  department?: string;
  project?: string;
  environment?: string;
  access_scope?: string;
  primary_cloud?: string;
  compliance?: string;
  description?: string;
  contribution?: string;
  invited_by?: string;
  tenant_id?: string;
  provider_notes?: string;
};

export interface InvitedUser {
  inviteId: string;
  fullName: string;
  email: string;
  role: InviteRole;
  /** Company / org associated with the invite */
  companyName: string;
  providerId?: string | null;
  tenantId?: string | null;
  tenantName?: string | null;
  /** Role-specific extras */
  department?: string;
  jobTitle?: string;
  functionArea?: string;
  invitedBy: string;
  /** Owning Tenant Admin for TENANT_USER (resolved from tenantId / company) */
  tenantAdmin?: string | null;
  tenantAdminName?: string | null;
  tenantAdminEmail?: string | null;
  tenantAdminId?: string | null;
  invitedAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'APPROVED' | 'ARCHIVED' | 'DECOMMISSIONED';
  summaryLine?: string;
  archived?: boolean;
  decommissioned?: boolean;
  archivedAt?: string | null;
  intakeData?: TenantAdminIntakeData | ProviderUserIntakeData | TenantUserIntakeData | null;
  pendingIntakeData?: TenantAdminIntakeData | ProviderUserIntakeData | TenantUserIntakeData | null;
  providerNotes?: string | null;
  reviewMessage?: string | null;
  lastReviewedAt?: string | null;
  lastEditedBy?: string | null;
  lastReviewDecision?: 'pending' | 'approve' | 'reject' | 'provider_edit' | string | null;
  hasPendingReview?: boolean;
}

export interface Tenant {
  tenantId: string;
  providerId: string;
  orgName: string;
  contact: string;
  billing: { plan: string; currency: string };
  cloud: { primary: 'aws' | 'azure' | 'gcp' };
  compliance: 'HIPAA' | 'SOC2' | 'GDPR' | 'None';
  status: 'ACTIVE' | 'INACTIVE';
  budgetCeiling: number;
  createdAt: string;
  archived?: boolean;
}

// ── Phase 1 Workflow ─────────────────────────────────────────────────────────
export interface IntakeForm {
  intakeId: string;
  tenantId: string;
  tenantName?: string;
  project: string;
  cloud: 'aws' | 'azure' | 'gcp';
  appCategory: 'rag' | 'agent' | 'summariser' | 'finetuning';
  environment: 'prod' | 'uat' | 'dev';
  compliance: string;
  budgetCeiling: number;
  description: string;
  status: string;
  submittedBy?: string;
  submittedByRole?: string;
  tenantUserId?: string | null;
  tenantUserName?: string | null;
  approvedBy?: string;
  approvedAt?: string | null;
  reviewNotes?: string;
  submittedAt: string;
  unlockToken?: string | null;
  unlockTokenExpiresAt?: string | null;
  unlockTokenValid?: boolean;
  unlockTokenConsumed?: boolean;
}

export interface InfraResource {
  category: string;
  resource: string;
  justification: string;
  monthly_cost: number;
}

export interface AIRecommendation {
  recommendationId: string;
  summary: string;
  resources: InfraResource[];
  compliance_notes: string;
  opa_flags: string[];
  totalMonthlyCost: number;
  latencyMs: number;
}

export interface ResourcePlan {
  planId: string;
  approvedTotal: number;
  budgetCeiling: number;
  requiresApproval: boolean;
  status: string;
}

export interface TerraformArtifact {
  artifactId: string;
  s3Key: string;
  files: string[];
  validationStatus: 'PASSED' | 'FAILED';
  opaScan: 'CLEAN' | 'VIOLATIONS';
  tfsec: string;
}

export interface DeploymentOutputs {
  postgresql_fqdn?: string;
  aks_cluster_name?: string;
  resource_group?: string;
  openai_endpoint?: string;
  key_vault_uri?: string;
  vnet_id?: string;
  resources_created?: number;
}

// ── Phase 2 OPTIMA-AI ────────────────────────────────────────────────────────
export interface OptimaLever {
  lever: string;
  monthlyCost: number;
  percentOfTotal: number;
  optimizationPotentialPct: number;
  estimatedSaving: number;
  color: string;
}

export interface OptimaRecommendation {
  id: string;
  recId: string;
  lever: string;
  severity: 'HIGH' | 'MED' | 'LOW';
  title: string;
  detail: string;
  resourceName: string;
  resourceIdentifier: string;
  estimatedMonthlySaving: number;
  effort: string;
  risk: string;
  actionDescription: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  approvedBy?: string;
  approvedAt?: string;
  executedAt?: string;
  tfApplyJobId?: string;
}

export interface SavingsDashboard {
  tenantId: string;
  phase1Baseline: number;
  budgetCeiling: number;
  approvedSaving: number;
  realizedSaving: number;
  optimisedCost: number;
  realizationRate: number;
  recommendations: {
    total: number; approved: number; executed: number;
    pending: number; rejected: number;
  };
}

// ── App Navigation ───────────────────────────────────────────────────────────
export type PageId =
  | 'home'
  | 'provider' | 'provider-user' | 'tenant' | 'tenant-user' | 'tenant-admin-portal' | 'rbac' | 'activity-feed'
  | 'provider-intake' | 'tenant-intake'
  | 'intake' | 'ai' | 'cost' | 'terraform' | 'jumpbox'
  | 'health' | 'audit' | 'testing' | 'launch'
  | 'optima-overview' | 'optima-scan' | 'optima-recs'
  | 'optima-approval' | 'optima-savings'
  | 'phase3-architecture' | 'phase3-azure';
