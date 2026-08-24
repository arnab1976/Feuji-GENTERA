/**
 * Project Intake Form — Stage 1
 * Single structured entry point to the LLM Kit workflow.
 * All AI recommendation, cost estimation, and Terraform generation derive from this form.
 *
 * Authority:
 *   Generate  — Provider Admin, Tenant Admin, Tenant User
 *   Approve   — Tenant Admin (primary), Provider Admin
 *   Tenant User submissions stay PENDING until approved; TA/PA auto-approve on submit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '@/store/appStore';
import { workflowApi, api } from '@/services/api';
import {
  canSubmitProjectIntake,
  canApproveProjectIntake,
} from '@/lib/rbac';
import type { IntakeForm as IntakeFormType, Tenant } from '@/types';

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#64748B',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  color: '#0F172A',
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
};

const CLOUD_OPTIONS = [
  { value: 'azure', label: 'Azure' },
  { value: 'aws', label: 'AWS' },
  { value: 'gcp', label: 'GCP' },
];

const APP_CATEGORY_OPTIONS = [
  { value: 'rag', label: 'RAG — Retrieval-Augmented Gen.' },
  { value: 'agent', label: 'Agent — Autonomous Workflows' },
  { value: 'summariser', label: 'Summariser — Document Intel' },
  { value: 'finetuning', label: 'Fine-tuning — Custom Models' },
];

const ENV_OPTIONS = [
  { value: 'prod', label: 'Production' },
  { value: 'uat', label: 'UAT' },
  { value: 'dev', label: 'Development' },
];

const COMPLIANCE_OPTIONS = ['HIPAA', 'SOC2', 'GDPR', 'None'];

function mapIntake(d: any): IntakeFormType {
  return {
    intakeId: d.intakeId,
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    project: d.project,
    cloud: d.cloud,
    appCategory: d.appCategory,
    environment: d.environment,
    compliance: d.compliance,
    budgetCeiling: d.budgetCeiling,
    description: d.description || '',
    status: d.status,
    submittedBy: d.submittedBy,
    submittedByRole: d.submittedByRole,
    tenantUserId: d.tenantUserId ?? null,
    tenantUserName: d.tenantUserName ?? null,
    approvedBy: d.approvedBy,
    approvedAt: d.approvedAt,
    reviewNotes: d.reviewNotes,
    submittedAt: d.submittedAt,
    unlockToken: d.unlockToken ?? null,
    unlockTokenExpiresAt: d.unlockTokenExpiresAt ?? null,
    unlockTokenValid: Boolean(d.unlockTokenValid),
    unlockTokenConsumed: Boolean(d.unlockTokenConsumed),
  };
}

function formatTokenExpiry(iso?: string | null) {
  if (!iso) return null;
  try {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'expired';
    const secs = Math.ceil(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')} left`;
  } catch {
    return null;
  }
}

const UNLOCK_MEMORY_PREFIX = 'gentera_unlock_verified_';

function rememberUnlock(intakeId: string) {
  try {
    sessionStorage.setItem(`${UNLOCK_MEMORY_PREFIX}${intakeId}`, '1');
  } catch { /* ignore */ }
}

function isUnlockRemembered(intakeId: string) {
  try {
    return sessionStorage.getItem(`${UNLOCK_MEMORY_PREFIX}${intakeId}`) === '1';
  } catch {
    return false;
  }
}

function hasJourneyUnlocked(item: IntakeFormType) {
  return Boolean(item.unlockTokenConsumed) || isUnlockRemembered(item.intakeId);
}

function ViewIntakeButton({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="View Intake Form"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: compact ? '4px 10px' : '5px 12px',
        fontSize: 11,
        fontWeight: 700,
        color: '#1D4ED8',
        background: '#EFF6FF',
        border: '1px solid #BFDBFE',
        borderRadius: 7,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <i className="ti ti-eye" style={{ fontSize: 14 }} />
      View
    </button>
  );
}

function raisedByLabel(item: IntakeFormType) {
  const roleLabels = new Set(['Provider Admin', 'Tenant Admin', 'Provider User', 'Tenant User']);
  const tuName = (item.tenantUserName || '').trim();
  if (tuName && !roleLabels.has(tuName)) return tuName;

  const name = (item.submittedBy || '').trim();
  const role = (item.submittedByRole || '').trim();
  // Prefer real person name when submitter was Tenant User
  if (role === 'Tenant User' && name && !roleLabels.has(name)) {
    return name.replace(/\s*\([^)]*@[^)]*\)\s*$/, '').trim() || name;
  }
  if (name && !roleLabels.has(name) && !name.startsWith('Provider ') && !name.startsWith('Tenant ')) {
    return name.replace(/\s*\([^)]*@[^)]*\)\s*$/, '').trim() || name;
  }
  return tuName || '—';
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    pending_tenant_approval: {
      bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', label: 'Pending with Tenant Admin',
    },
    pending_provider_approval: {
      bg: '#EDE9FE', color: '#6D28D9', border: '#DDD6FE', label: 'Pending with Provider Admin',
    },
    queued_for_recommendation: {
      bg: '#D1FAE5', color: '#047857', border: '#A7F3D0', label: 'Approved — Stage 2 Unlocked',
    },
    rejected: {
      bg: '#FEE2E2', color: '#B91C1C', border: '#FECDD3', label: 'Rejected',
    },
  };
  const s = map[status] || { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0', label: status };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '4px 10px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {status === 'pending_tenant_approval' && <i className="ti ti-clock" />}
      {status === 'pending_provider_approval' && <i className="ti ti-shield-clock" />}
      {status === 'queued_for_recommendation' && <i className="ti ti-circle-check" />}
      {status === 'rejected' && <i className="ti ti-circle-x" />}
      {s.label}
    </span>
  );
}

export default function IntakeForm() {
  const {
    currentRole,
    activeTenant,
    tenants,
    invitedUsers,
    setIntakeForm,
    markStageComplete,
    setPage,
  } = useAppStore();

  const canSubmit = canSubmitProjectIntake(currentRole);
  const canApprove = canApproveProjectIntake(currentRole);

  const tenantOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; cloud?: string; compliance?: string; budget?: number }>();
    (tenants || []).filter((t) => !t.archived && t.status === 'ACTIVE').forEach((t: Tenant) => {
      map.set(t.tenantId, {
        id: t.tenantId,
        name: t.orgName,
        cloud: t.cloud?.primary,
        compliance: t.compliance,
        budget: t.budgetCeiling,
      });
    });
    (invitedUsers || [])
      .filter((u) => u.role === 'TENANT_ADMIN' && u.tenantId && !u.archived && !u.decommissioned)
      .forEach((u) => {
        if (!map.has(u.tenantId!)) {
          const intake = u.intakeData as Record<string, any> | undefined;
          map.set(u.tenantId!, {
            id: u.tenantId!,
            name: u.companyName || intake?.org_name || u.tenantId!,
            cloud: intake?.primary_cloud,
            compliance: intake?.compliance,
            budget: intake?.budget_ceiling,
          });
        }
      });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tenants, invitedUsers]);

  const [submitterRole, setSubmitterRole] = useState<'Provider Admin' | 'Tenant Admin' | 'Tenant User'>(
    (['Provider Admin', 'Tenant Admin', 'Tenant User'].includes(currentRole) ? currentRole : 'Tenant User') as any,
  );

  useEffect(() => {
    if (['Provider Admin', 'Tenant Admin', 'Tenant User'].includes(currentRole)) {
      setSubmitterRole(currentRole as any);
    }
  }, [currentRole]);

  const [projectName, setProjectName] = useState('Clinical RAG Assistant — Phase 1');
  const [cloud, setCloud] = useState('azure');
  const [appCategory, setAppCategory] = useState('rag');
  const [environment, setEnvironment] = useState('prod');
  const [compliance, setCompliance] = useState('HIPAA');
  const [budgetCeiling, setBudgetCeiling] = useState(2000);
  const [tenantId, setTenantId] = useState('');
  const [tenantUserId, setTenantUserId] = useState('');
  const [description, setDescription] = useState(
    'HIPAA-compliant LLM assistant with pgvector semantic search, 500 concurrent users...',
  );
  const [apiTenants, setApiTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [queue, setQueue] = useState<IntakeFormType[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [unlockModalItem, setUnlockModalItem] = useState<IntakeFormType | null>(null);
  const [unlockTokenInput, setUnlockTokenInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [viewIntakeItem, setViewIntakeItem] = useState<IntakeFormType | null>(null);
  const hasInitializedDefault = useRef(false);

  const allTenantOptions = useMemo(() => {
    const map = new Map(tenantOptions.map((t) => [t.id, t]));
    apiTenants.forEach((t) => {
      if (!map.has(t.tenantId) && !t.archived) {
        map.set(t.tenantId, {
          id: t.tenantId,
          name: t.orgName,
          cloud: t.cloud?.primary,
          compliance: t.compliance,
          budget: t.budgetCeiling,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tenantOptions, apiTenants]);

  const tenantUsersForSelectedTenant = useMemo(() => {
    if (!tenantId) return [];
    const selectedTenantObj = allTenantOptions.find((t) => t.id === tenantId);
    const orgNameLower = selectedTenantObj?.name?.trim().toLowerCase();

    return (invitedUsers || []).filter((u) => {
      if (u.role !== 'TENANT_USER' || u.archived || u.decommissioned) return false;
      if (u.tenantId && u.tenantId === tenantId) return true;
      const uCompany = (u.companyName || (u.intakeData as any)?.org_name || '').trim().toLowerCase();
      return orgNameLower && uCompany === orgNameLower;
    });
  }, [invitedUsers, tenantId, allTenantOptions]);

  useEffect(() => {
    if (tenantUsersForSelectedTenant.length > 0) {
      if (!tenantUserId || !tenantUsersForSelectedTenant.some((u) => u.inviteId === tenantUserId)) {
        setTenantUserId(tenantUsersForSelectedTenant[0].inviteId);
      }
    } else {
      setTenantUserId('');
    }
  }, [tenantUsersForSelectedTenant, tenantUserId]);

  useEffect(() => {
    if (!tenantId && activeTenant?.tenantId) {
      setTenantId(activeTenant.tenantId);
      setCloud(activeTenant.cloud?.primary || 'azure');
      setCompliance(activeTenant.compliance || 'HIPAA');
      setBudgetCeiling(activeTenant.budgetCeiling || 2000);
    } else if (!tenantId && allTenantOptions.length === 1) {
      setTenantId(allTenantOptions[0].id);
    }
  }, [activeTenant, allTenantOptions, tenantId]);

  const loadTenants = useCallback(async () => {
    try {
      const res = await api.get('/tenants');
      const items = (res.data?.items || []).map((d: any) => ({
        tenantId: d.tenantId,
        providerId: d.providerId,
        orgName: d.orgName,
        contact: d.contact,
        billing: d.billing || { plan: 'PROFESSIONAL', currency: 'USD' },
        cloud: d.cloud || { primary: 'azure' },
        compliance: d.compliance || 'HIPAA',
        status: d.status || 'ACTIVE',
        budgetCeiling: d.budgetCeiling ?? 2000,
        createdAt: d.createdAt,
        archived: Boolean(d.archived),
      })) as Tenant[];
      setApiTenants(items);
    } catch {
      /* store / invite-derived options still work */
    }
  }, []);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await workflowApi.listIntakes();
      let items = (res.data?.items || []).map(mapIntake);
      if (items.length === 0 && !hasInitializedDefault.current) {
        hasInitializedDefault.current = true;
        items = [
          {
            intakeId: 'INTAKE-DEMO-001',
            tenantId: 'TENANT_DEMO',
            tenantName: 'Gentera Enterprise Tenant',
            project: 'Clinical RAG Assistant — Phase 1',
            cloud: 'azure',
            appCategory: 'rag',
            environment: 'prod',
            compliance: 'HIPAA',
            budgetCeiling: 2000,
            description: 'HIPAA-compliant LLM assistant with pgvector search.',
            status: 'queued_for_recommendation',
            submittedAt: new Date().toISOString(),
          },
        ];
      }
      setQueue(items);
      items.forEach((it: IntakeFormType) => {
        if (it.unlockTokenConsumed) rememberUnlock(it.intakeId);
      });
    } catch {
      if (!hasInitializedDefault.current) {
        hasInitializedDefault.current = true;
        setQueue([
          {
            intakeId: 'INTAKE-DEMO-001',
            tenantId: 'TENANT_DEMO',
            tenantName: 'Gentera Enterprise Tenant',
            project: 'Clinical RAG Assistant — Phase 1',
            cloud: 'azure',
            appCategory: 'rag',
            environment: 'prod',
            compliance: 'HIPAA',
            budgetCeiling: 2000,
            description: 'HIPAA-compliant LLM assistant with pgvector search.',
            status: 'queued_for_recommendation',
            submittedAt: new Date().toISOString(),
          },
        ]);
      } else {
        setQueue([]);
      }
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
    loadQueue();
  }, [loadTenants, loadQueue]);

  const onTenantChange = (id: string) => {
    setTenantId(id);
    const t = allTenantOptions.find((x) => x.id === id);
    if (t?.cloud) setCloud(t.cloud);
    if (t?.compliance) setCompliance(t.compliance);
    if (t?.budget) setBudgetCeiling(t.budget);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!canSubmit) {
      setError('Your role cannot generate a Project Intake. Switch to Provider Admin, Tenant Admin, or Tenant User.');
      return;
    }
    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!tenantId) {
      setError('Select a Tenant Scope. Approve a Tenant Admin first if the list is empty.');
      return;
    }

    const selectedTenantUser = tenantUsersForSelectedTenant.find((u) => u.inviteId === tenantUserId);
    if (tenantUsersForSelectedTenant.length > 0 && !selectedTenantUser) {
      setError('Select the Tenant User this intake is raised for — their name appears in the roster notification.');
      return;
    }

    const finalSubmittedBy = submitterRole === 'Tenant User' && selectedTenantUser
      ? selectedTenantUser.fullName
      : submitterRole;
    const finalSubmittedByEmail = submitterRole === 'Tenant User' && selectedTenantUser
      ? selectedTenantUser.email
      : undefined;
    const tenantUserName = selectedTenantUser?.fullName
      || (submitterRole === 'Tenant User' ? finalSubmittedBy : undefined);

    setLoading(true);
    try {
      const res = await workflowApi.submitIntake({
        tenant_id: tenantId,
        project_name: projectName.trim(),
        cloud,
        app_category: appCategory,
        environment,
        compliance,
        budget_ceiling: Number(budgetCeiling) || 2000,
        description: description.trim(),
        submitted_by: finalSubmittedBy,
        submitted_by_role: submitterRole,
        submitted_by_email: finalSubmittedByEmail,
        tenant_user_id: selectedTenantUser?.inviteId || tenantUserId || undefined,
        tenant_user_name: tenantUserName,
        tenant_admin_name: 'Tenant Admin',
      });
      const mapped = mapIntake(res.data);
      if (mapped.status === 'queued_for_recommendation') {
        setIntakeForm(mapped);
        markStageComplete('intake');
        setSuccess(
          `Intake ${mapped.intakeId} submitted as Provider Admin — Auto-approved & queued. Stage 2 AI Recommendation unlocked!`,
        );
      } else if (mapped.status === 'pending_provider_approval') {
        setSuccess(
          `Intake ${mapped.intakeId} submitted as Tenant Admin — Status: Pending Provider Admin Approval before AI Engine can run.`,
        );
      } else {
        setSuccess(
          `Intake ${mapped.intakeId} submitted as Tenant User — Status: Pending Tenant Admin Approval -> Provider Admin Approval.`,
        );
      }
      await loadQueue();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Submit failed');
    } finally {
      setLoading(false);
    }
  };

  const decide = async (intakeId: string, decision: 'approve' | 'reject') => {
    if (!canApprove) return;
    setDecidingId(intakeId);
    setError(null);
    try {
      const res = await workflowApi.decideIntake(intakeId, {
        decision,
        notes: reviewNotes[intakeId] || '',
        actor_role: currentRole,
        actor_name: currentRole,
      });
      const mapped = mapIntake(res.data);
      if (decision === 'approve') {
        if (mapped.status === 'pending_provider_approval') {
          setSuccess(`Intake ${intakeId} approved by Tenant Admin! Forwarded to Provider Admin for final approval.`);
        } else if (mapped.status === 'queued_for_recommendation') {
          setIntakeForm(mapped);
          markStageComplete('intake');
          setSuccess(`Intake ${intakeId} approved by Provider Admin! Stage 2 AI Recommendation unlocked.`);
        }
      } else {
        setSuccess(`Intake ${intakeId} rejected.`);
      }
      await loadQueue();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Decision failed');
    } finally {
      setDecidingId(null);
    }
  };

  const pending = queue.filter((q) => {
    if (currentRole === 'Tenant User') return false;
    if (currentRole === 'Tenant Admin') return q.status === 'pending_tenant_approval';
    if (currentRole === 'Provider Admin') return q.status === 'pending_provider_approval' || q.status === 'pending_tenant_approval';
    return false;
  });
  const recent = queue.filter((q) => q.status !== 'pending_approval').slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {/* Authority strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10,
      }}>
        {[
          { title: 'Who generates', body: 'Provider Admin · Tenant Admin · Tenant User', accent: '#0D9488' },
          { title: 'Who approves', body: 'Tenant Admin (primary) · Provider Admin', accent: '#7C3AED' },
          { title: 'Downstream', body: 'AI Recommendation → Cost → Terraform', accent: '#2563EB' },
        ].map((c) => (
          <div key={c.title} style={{
            background: '#FFFFFF', border: `1px solid ${c.accent}33`, borderRadius: 12,
            padding: '12px 14px', boxShadow: `0 6px 16px ${c.accent}10`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.accent, marginBottom: 4 }}>
              {c.title}
            </div>
            <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.45 }}>{c.body}</div>
          </div>
        ))}
      </div>

      {/* New project intake card */}
      <form onSubmit={handleSubmit} style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14,
        padding: '18px 20px', boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: '#CCFBF1', color: '#0D9488',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-file-description" style={{ fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>New project intake</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                Feeds Stage 2–4. Current role: <strong>{currentRole}</strong>
                {!canSubmit && ' (view only)'}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace, monospace',
            color: '#0F766E', background: '#CCFBF1', border: '1px solid #99F6E4',
            padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
          }}>
            POST /api/v1/intake/submit
          </span>
        </div>

        {/* RBAC Submitter Persona Selector */}
        <div style={{
          marginBottom: 16, padding: '14px 16px', borderRadius: 12,
          background: '#F8FAFC', border: '1px solid #CBD5E1',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-user-check" style={{ fontSize: 16, color: '#7C3AED' }} />
            <span>Form Submitter Persona (RBAC Approval Workflow) *</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {[
              {
                role: 'Tenant User',
                label: 'Tenant User',
                desc: 'Approval required: Tenant Admin -> Provider Admin',
                color: '#2563EB',
                bg: '#EFF6FF',
                icon: 'ti-user',
                allowed: ['Provider Admin', 'Tenant Admin', 'Tenant User'].includes(currentRole),
              },
              {
                role: 'Tenant Admin',
                label: 'Tenant Admin',
                desc: 'Fills on behalf of Tenant User — 1-Level Approval from Provider Admin required',
                color: '#0D9488',
                bg: '#F0FDFA',
                icon: 'ti-building',
                allowed: ['Provider Admin', 'Tenant Admin'].includes(currentRole),
              },
              {
                role: 'Provider Admin',
                label: 'Provider Admin',
                desc: 'Auto-approved immediately (no other approval required)',
                color: '#7C3AED',
                bg: '#F5F3FF',
                icon: 'ti-shield-check',
                allowed: currentRole === 'Provider Admin',
              },
            ].map((r) => {
              const selected = submitterRole === r.role;
              const disabled = !r.allowed;
              return (
                <div
                  key={r.role}
                  onClick={() => {
                    if (!disabled) setSubmitterRole(r.role as any);
                  }}
                  title={disabled ? `Requires higher role privileges (Active role: ${currentRole})` : ''}
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.45 : 1,
                    border: selected ? `2px solid ${r.color}` : '1px solid #E2E8F0',
                    background: selected ? r.bg : disabled ? '#F1F5F9' : '#FFFFFF',
                    boxShadow: selected ? `0 4px 12px ${r.color}22` : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: selected ? r.color : disabled ? '#94A3B8' : '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className={`ti ${r.icon}`} />
                      {r.label}
                    </div>
                    <input
                      type="radio"
                      name="submitterPersona"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => {
                        if (!disabled) setSubmitterRole(r.role as any);
                      }}
                      style={{ accentColor: r.color, cursor: disabled ? 'not-allowed' : 'pointer' }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: selected ? '#334155' : '#64748B', lineHeight: 1.35 }}>
                    {disabled ? `Restricted — Active role is ${currentRole}` : r.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Project name *</label>
            <input
              style={inputStyle}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={!canSubmit || loading}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Cloud provider</label>
            <select
              style={inputStyle}
              value={cloud}
              onChange={(e) => setCloud(e.target.value)}
              disabled={!canSubmit || loading}
            >
              {CLOUD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>App category</label>
            <select
              style={inputStyle}
              value={appCategory}
              onChange={(e) => setAppCategory(e.target.value)}
              disabled={!canSubmit || loading}
            >
              {APP_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Environment</label>
            <select
              style={inputStyle}
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              disabled={!canSubmit || loading}
            >
              {ENV_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Compliance</label>
            <select
              style={inputStyle}
              value={compliance}
              onChange={(e) => setCompliance(e.target.value)}
              disabled={!canSubmit || loading}
            >
              {COMPLIANCE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Budget ceiling ($/mo)</label>
            <input
              type="number"
              min={0}
              style={inputStyle}
              value={budgetCeiling}
              onChange={(e) => setBudgetCeiling(Number(e.target.value))}
              disabled={!canSubmit || loading}
            />
          </div>
          <div>
            <label style={labelStyle}>Tenant scope *</label>
            <select
              style={inputStyle}
              value={tenantId}
              onChange={(e) => onTenantChange(e.target.value)}
              disabled={!canSubmit || loading}
              required
            >
              <option value="">Select tenant…</option>
              {allTenantOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>
              Tenant User *
              <span style={{ fontWeight: 500, color: '#94A3B8', textTransform: 'none', letterSpacing: 0 }}>
                {' '}— person shown as Raised by Tenant_User in roster
              </span>
            </label>
            <select
              style={inputStyle}
              value={tenantUserId}
              onChange={(e) => setTenantUserId(e.target.value)}
              disabled={!canSubmit || loading}
            >
              <option value="">
                {tenantUsersForSelectedTenant.length > 0
                  ? 'Select Tenant User…'
                  : 'No Tenant Users registered under tenant'}
              </option>
              {tenantUsersForSelectedTenant.map((u) => (
                <option key={u.inviteId} value={u.inviteId}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Description (optional)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 88, resize: 'vertical', lineHeight: 1.5 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canSubmit || loading}
            placeholder="HIPAA-compliant LLM assistant with pgvector semantic search, 500 concurrent users..."
          />
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: '10px 12px', borderRadius: 8,
            background: '#FFF1F2', border: '1px solid #FECDD3', color: '#9F1239', fontSize: 12,
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            marginBottom: 12, padding: '10px 12px', borderRadius: 8,
            background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', fontSize: 12,
          }}>
            {success}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={!canSubmit || loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: canSubmit ? '#0D9488' : '#94A3B8', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            <i className="ti ti-send" />
            {loading ? 'Submitting…' : 'Submit to AI Engine'}
          </button>
          {submitterRole === 'Tenant User' && (
            <span style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>
              <i className="ti ti-info-circle" style={{ marginRight: 4 }} />
              Submitting as Tenant User — Requires Tenant Admin approval first, then Provider Admin approval before Stage 2 AI.
            </span>
          )}
          {submitterRole === 'Tenant Admin' && (
            <span style={{ fontSize: 12, color: '#6D28D9', fontWeight: 600 }}>
              <i className="ti ti-info-circle" style={{ marginRight: 4 }} />
              Submitting as Tenant Admin — Requires Provider Admin approval before Stage 2 AI is unlocked.
            </span>
          )}
          {submitterRole === 'Provider Admin' && canSubmit && (
            <span style={{ fontSize: 12, color: '#0F766E', fontWeight: 600 }}>
              <i className="ti ti-circle-check" style={{ marginRight: 4 }} />
              Submitting as Provider Admin — Auto-approved immediately (no further approval required).
            </span>
          )}
        </div>
      </form>

      {/* Intake forms table */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: '18px 20px',
        boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Intake Forms Roster</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              Multi-level RBAC Roster. Run AI Recommendation Engine once Provider Admin approval is granted.
            </div>
          </div>
          <button
            type="button"
            onClick={loadQueue}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
              border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#334155', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 13 }} />
            <span>Refresh Roster</span>
          </button>
        </div>

        {queueLoading ? (
          <div style={{ fontSize: 13, color: '#64748B', padding: '16px 0', textAlign: 'center' }}>
            <i className="ti ti-loader spin" style={{ marginRight: 8 }} /> Loading intake forms...
          </div>
        ) : queue.filter((q) => !deletedIds.includes(q.intakeId)).length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center', background: '#F8FAFC',
            borderRadius: 10, border: '1px dashed #CBD5E1', color: '#64748B', fontSize: 13,
          }}>
            <i className="ti ti-file-off" style={{ fontSize: 24, color: '#94A3B8', display: 'block', marginBottom: 8 }} />
            No intake forms currently in roster. Submit a new project intake above to populate the roster.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 14px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</th>
                  <th style={{ padding: '12px 14px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tenant</th>
                  <th style={{ padding: '12px 14px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</th>
                  <th style={{ padding: '12px 14px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                  <th style={{ padding: '12px 14px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                  <th style={{ padding: '12px 14px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {queue.filter((q) => !deletedIds.includes(q.intakeId)).map((item) => (
                  <tr key={item.intakeId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 14px', color: '#0F172A', fontWeight: 600 }}>
                      <div>{item.project}</div>
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2,
                      }}>
                        <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 400, fontFamily: 'monospace' }}>
                          {item.intakeId}
                        </div>
                        {item.status !== 'queued_for_recommendation' && (
                          <ViewIntakeButton compact onClick={() => setViewIntakeItem(item)} />
                        )}
                      </div>
                      {item.status === 'queued_for_recommendation' ? (
                        <div style={{
                          fontSize: 11, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0',
                          padding: '10px 12px', borderRadius: 8, marginTop: 6, fontWeight: 500, lineHeight: 1.45,
                          maxWidth: 420,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                            <i className="ti ti-bell-ringing" style={{ marginTop: 1 }} />
                            <div>
                              <strong>Notification:</strong>{' '}
                              Approved by Provider Admin (Step 2/2) — AI Engine unlocked
                            </div>
                          </div>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                            color: '#0F766E', fontWeight: 700,
                          }}>
                            <i className="ti ti-user" />
                            <span>
                              Raised by Tenant_User:{' '}
                              <span style={{ color: '#0F172A' }}>{raisedByLabel(item)}</span>
                            </span>
                          </div>
                          {item.submittedByRole && item.submittedByRole !== 'Tenant User' && (
                            <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6, fontWeight: 500 }}>
                              Submitted via {item.submittedByRole}
                            </div>
                          )}
                          {hasJourneyUnlocked(item) ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                              <div style={{ color: '#047857', flex: '1 1 200px' }}>
                                Unlock JWT verified — journey started. Token is not required again for this intake.
                              </div>
                              <ViewIntakeButton compact onClick={() => setViewIntakeItem(item)} />
                            </div>
                          ) : item.unlockTokenValid && item.unlockToken ? (
                            <>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <i className="ti ti-key" style={{ color: '#6D28D9' }} />
                                <span>Unlock JWT (one-time)</span>
                                <code style={{
                                  fontSize: 13, letterSpacing: '0.1em', fontWeight: 800, color: '#6D28D9',
                                  background: '#EDE9FE', padding: '3px 8px', borderRadius: 4,
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                }}>
                                  {item.unlockToken}
                                </code>
                                <span style={{ color: '#64748B' }}>
                                  (expires in 5 min
                                  {(() => {
                                    const left = formatTokenExpiry(item.unlockTokenExpiresAt);
                                    return left && left !== 'expired' ? ` · ${left}` : '';
                                  })()}
                                  )
                                </span>
                                <ViewIntakeButton compact onClick={() => setViewIntakeItem(item)} />
                              </div>
                              <div style={{ color: '#475569', fontWeight: 500 }}>
                                Enter this 16-character token once in the Run AI Recommendation Engine popup.
                                After verification you will not be asked again for this intake.
                              </div>
                            </>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                              <div style={{ color: '#92400E', flex: '1 1 200px' }}>
                                Unlock JWT expired or unavailable. Tenant Admin and Provider Admin approval are required again.
                              </div>
                              <ViewIntakeButton compact onClick={() => setViewIntakeItem(item)} />
                            </div>
                          )}
                        </div>
                      ) : item.reviewNotes && item.status !== 'pending_provider_approval' ? (
                        <div style={{
                          fontSize: 11, color: item.status === 'rejected' ? '#9F1239' : '#92400E',
                          background: item.status === 'rejected' ? '#FFF1F2' : '#FFFBEB',
                          border: `1px solid ${item.status === 'rejected' ? '#FECDD3' : '#FDE68A'}`,
                          padding: '4px 8px', borderRadius: 6, marginTop: 6, fontWeight: 500, lineHeight: 1.35, maxWidth: 320,
                        }}>
                          <i className="ti ti-bell-ringing" style={{ marginRight: 4 }} />
                          <strong>Notification:</strong> {item.reviewNotes}
                          {item.submittedBy && (
                            <div style={{ marginTop: 4, fontWeight: 700, color: '#0F172A' }}>
                              Raised by Tenant_User: {raisedByLabel(item)}
                            </div>
                          )}
                        </div>
                      ) : null}
                      {item.status === 'pending_provider_approval' && (
                        <div style={{
                          fontSize: 11, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A',
                          padding: '4px 8px', borderRadius: 6, marginTop: 6, fontWeight: 500, lineHeight: 1.35, maxWidth: 320,
                        }}>
                          <i className="ti ti-bell-ringing" style={{ marginRight: 4 }} />
                          <strong>Notification:</strong> It&apos;s require Provider Admin level approval — open Provider Admin portal.
                          {item.submittedBy && (
                            <div style={{ marginTop: 4, fontWeight: 700, color: '#0F172A' }}>
                              Raised by Tenant_User: {raisedByLabel(item)}
                            </div>
                          )}
                        </div>
                      )}
                      {item.status === 'pending_tenant_approval' && item.submittedBy && (
                        <div style={{
                          fontSize: 11, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A',
                          padding: '4px 8px', borderRadius: 6, marginTop: 6, fontWeight: 500, lineHeight: 1.35, maxWidth: 320,
                        }}>
                          <i className="ti ti-user" style={{ marginRight: 4 }} />
                          <strong>Raised by Tenant_User:</strong> {raisedByLabel(item)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 14px', color: '#334155', fontWeight: 600 }}>
                      {item.tenantName || item.tenantId}
                    </td>
                    <td style={{ padding: '14px 14px', color: '#64748B', fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>{item.cloud?.toUpperCase()}</span> · {item.appCategory?.toUpperCase()} · {item.environment}
                    </td>
                    <td style={{ padding: '14px 14px' }}>
                      {statusBadge(item.status)}
                    </td>
                    <td style={{ padding: '14px 14px' }}>
                      {item.status === 'queued_for_recommendation' ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (hasJourneyUnlocked(item)) {
                              rememberUnlock(item.intakeId);
                              setIntakeForm({ ...item, unlockTokenConsumed: true });
                              markStageComplete('intake');
                              setPage('ai');
                              return;
                            }
                            setUnlockModalItem(item);
                            setUnlockTokenInput('');
                            setUnlockError(null);
                          }}
                          style={{
                            fontSize: 12, fontWeight: 700, color: '#FFFFFF', background: '#7C3AED',
                            border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.15s ease',
                            boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#6D28D9')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#7C3AED')}
                        >
                          <i className="ti ti-sparkles" style={{ fontSize: 14 }} />
                          <span>
                            {hasJourneyUnlocked(item)
                              ? 'Continue AI Recommendation Engine'
                              : 'Run AI Recommendation Engine'}
                          </span>
                          <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
                        </button>
                      ) : item.status === 'pending_tenant_approval' ? (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                          borderRadius: 8, background: '#FEF3C7', border: '1px solid #FDE68A',
                          color: '#B45309', fontSize: 11, fontWeight: 600,
                        }} title="Requires Tenant Admin approval in Tenant Admin portal">
                          <i className="ti ti-clock" />
                          <span>Pending with Tenant Admin</span>
                        </div>
                      ) : item.status === 'pending_provider_approval' ? (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                          borderRadius: 8, background: '#D1FAE5', border: '1px solid #A7F3D0',
                          color: '#047857', fontSize: 11, fontWeight: 600,
                        }} title="Approved by Tenant Admin — go to Provider Admin portal for Step 2">
                          <i className="ti ti-circle-check" />
                          <span>Approved by Tenant Admin</span>
                        </div>
                      ) : (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                          borderRadius: 8, background: '#FFF1F2', border: '1px solid #FECDD3',
                          color: '#BE123C', fontSize: 11, fontWeight: 600,
                        }} title="Intake form rejected by administrator">
                          <i className="ti ti-ban" />
                          <span>Rejected / Access Denied</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to delete intake form ${item.intakeId}?`)) {
                            setDeletedIds((prev) => [...prev, item.intakeId]);
                            setQueue((prev) => prev.filter((q) => q.intakeId !== item.intakeId));
                            try {
                              await workflowApi.deleteIntake(item.intakeId);
                            } catch {
                              /* ignore fallback */
                            }
                            setSuccess(`Intake form ${item.intakeId} has been deleted.`);
                          }
                        }}
                        title="Delete Intake Form"
                        style={{
                          padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                          border: '1px solid #FECDD3', background: '#FFF1F2', color: '#BE123C',
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#FEE2E2')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#FFF1F2')}
                      >
                        <i className="ti ti-trash" style={{ fontSize: 14 }} />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewIntakeItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-intake-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setViewIntakeItem(null)}
        >
          <div
            style={{
              width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
              background: '#FFFFFF', borderRadius: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.28)', border: '1px solid #E2E8F0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '18px 22px 12px', borderBottom: '1px solid #F1F5F9',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <h2 id="view-intake-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  View Intake Form
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B' }}>
                  Read-only view of the generated project intake
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewIntakeItem(null)}
                aria-label="Close"
                style={{
                  width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#F8FAFC', color: '#64748B', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <i className="ti ti-x" />
              </button>
            </div>
            <div style={{ padding: '16px 22px 8px', display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {statusBadge(viewIntakeItem.status)}
                <code style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>
                  {viewIntakeItem.intakeId}
                </code>
              </div>
              {([
                ['Project', viewIntakeItem.project],
                ['Tenant', viewIntakeItem.tenantName || viewIntakeItem.tenantId],
                ['Raised by Tenant_User', raisedByLabel(viewIntakeItem)],
                ['Submitted via', viewIntakeItem.submittedByRole || '—'],
                ['Cloud', (viewIntakeItem.cloud || '—').toString().toUpperCase()],
                ['App category', (viewIntakeItem.appCategory || '—').toString().toUpperCase()],
                ['Environment', viewIntakeItem.environment || '—'],
                ['Compliance', viewIntakeItem.compliance || '—'],
                ['Budget ceiling', viewIntakeItem.budgetCeiling != null
                  ? `$${Number(viewIntakeItem.budgetCeiling).toLocaleString()}/mo`
                  : '—'],
                ['Submitted at', viewIntakeItem.submittedAt
                  ? new Date(viewIntakeItem.submittedAt).toLocaleString()
                  : '—'],
                ['Approved by', viewIntakeItem.approvedBy || '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: '#0F172A',
                    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                    padding: '8px 12px',
                  }}>
                    {value}
                  </div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 3 }}>
                  Description
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: '#334155', lineHeight: 1.5,
                  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                  padding: '10px 12px', whiteSpace: 'pre-wrap',
                }}>
                  {viewIntakeItem.description || '—'}
                </div>
              </div>
              {viewIntakeItem.reviewNotes && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 3 }}>
                    Review notes
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 500, color: '#92400E', lineHeight: 1.45,
                    background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
                    padding: '10px 12px',
                  }}>
                    {viewIntakeItem.reviewNotes}
                  </div>
                </div>
              )}
            </div>
            <div style={{
              padding: '14px 22px', borderTop: '1px solid #F1F5F9',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                type="button"
                onClick={() => setViewIntakeItem(null)}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#FFFFFF',
                  background: '#1D4ED8', border: 'none', borderRadius: 8, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {unlockModalItem && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => {
            if (!unlockLoading) setUnlockModalItem(null);
          }}
        >
          <div
            style={{
              width: '100%', maxWidth: 440, background: '#FFFFFF', borderRadius: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.28)', border: '1px solid #E2E8F0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid #F1F5F9' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                Enter Unlock JWT Token
              </h2>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748B', lineHeight: 1.45 }}>
                One-time <strong>16-character alphanumeric</strong> unlock JWT for{' '}
                <strong>{unlockModalItem.project}</strong>
                {unlockModalItem.submittedBy ? (
                  <>
                    {' '}raised by <strong>{raisedByLabel(unlockModalItem)}</strong>
                  </>
                ) : null}
                . Expires in <strong>5 minutes</strong>. After this verification you will not need to enter the token again for this intake journey.
              </p>
            </div>
            <div style={{ padding: '16px 22px', display: 'grid', gap: 12 }}>
              {unlockModalItem.unlockTokenValid && unlockModalItem.unlockToken && (
                <div style={{
                  fontSize: 11, color: '#5B21B6', background: '#F5F3FF', border: '1px solid #DDD6FE',
                  borderRadius: 8, padding: '8px 10px', lineHeight: 1.4,
                }}>
                  Your Tenant User token:{' '}
                  <code style={{ fontWeight: 800, letterSpacing: '0.1em' }}>{unlockModalItem.unlockToken}</code>
                  {formatTokenExpiry(unlockModalItem.unlockTokenExpiresAt)
                    ? ` · ${formatTokenExpiry(unlockModalItem.unlockTokenExpiresAt)}`
                    : ''}
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  16-character alphanumeric unlock JWT
                </label>
                <input
                  value={unlockTokenInput}
                  onChange={(e) => setUnlockTokenInput(
                    e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 16),
                  )}
                  placeholder="A1B2C3D4E5F6G7H8"
                  inputMode="text"
                  maxLength={16}
                  autoFocus
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 16, letterSpacing: '0.18em',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontWeight: 700, color: '#0F172A', background: '#F8FAFC',
                    border: '1px solid #CBD5E1', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              {unlockError && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8, background: '#FEF2F2',
                  border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: 12, lineHeight: 1.4,
                }}>
                  {unlockError}
                </div>
              )}
            </div>
            <div style={{
              padding: '14px 22px', borderTop: '1px solid #F1F5F9',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                type="button"
                disabled={unlockLoading}
                onClick={() => setUnlockModalItem(null)}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#475569',
                  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={unlockLoading || unlockTokenInput.length !== 16}
                onClick={async () => {
                  if (!unlockModalItem) return;
                  setUnlockLoading(true);
                  setUnlockError(null);
                  try {
                    const res = await workflowApi.verifyUnlockToken(
                      unlockModalItem.intakeId,
                      unlockTokenInput,
                    );
                    const mapped = mapIntake(res.data);
                    rememberUnlock(mapped.intakeId);
                    setIntakeForm({ ...mapped, unlockTokenConsumed: true });
                    markStageComplete('intake');
                    setUnlockModalItem(null);
                    setSuccess('Unlock JWT verified once — you can continue this intake journey without re-entering the token.');
                    setTimeout(() => setSuccess(null), 5000);
                    await loadQueue();
                    setPage('ai');
                  } catch (err: any) {
                    const detail = err?.response?.data?.detail || err?.message || 'Token verification failed';
                    setUnlockError(detail);
                    if (String(detail).toLowerCase().includes('expired')) {
                      await loadQueue();
                    }
                  } finally {
                    setUnlockLoading(false);
                  }
                }}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#FFFFFF',
                  background: unlockTokenInput.length === 16 ? '#7C3AED' : '#C4B5FD',
                  border: 'none', borderRadius: 8,
                  cursor: unlockLoading || unlockTokenInput.length !== 16 ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <i className="ti ti-lock-open" />
                {unlockLoading ? 'Verifying…' : 'Verify & Start Journey'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
