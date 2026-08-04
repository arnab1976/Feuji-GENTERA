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
    approvedBy: d.approvedBy,
    approvedAt: d.approvedAt,
    reviewNotes: d.reviewNotes,
    submittedAt: d.submittedAt,
  };
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
    if (submitterRole === 'Tenant User' && tenantUsersForSelectedTenant.length > 0 && !selectedTenantUser) {
      setError('Select a registered Tenant User applicant for this intake form.');
      return;
    }

    const finalSubmittedBy = submitterRole === 'Tenant User' && selectedTenantUser
      ? selectedTenantUser.fullName
      : submitterRole;
    const finalSubmittedByEmail = submitterRole === 'Tenant User' && selectedTenantUser
      ? selectedTenantUser.email
      : undefined;

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
        tenant_user_id: tenantUserId || undefined,
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
              Tenant User {submitterRole === 'Tenant User' ? '*' : '(Optional)'}
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

      {/* Multi-Level RBAC Approval Queue */}
      {canApprove && (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14,
          padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                Intake Approval Queue ({currentRole})
              </div>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                {currentRole === 'Tenant Admin'
                  ? 'Approve Tenant User submissions to forward them to Provider Admin for final sign-off.'
                  : 'Approve Tenant Admin & Tenant User submissions to unlock Stage 2 AI Recommendation.'}
              </div>
            </div>
            <button
              type="button"
              onClick={loadQueue}
              style={{
                fontSize: 12, padding: '6px 10px', borderRadius: 8,
                border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>

          {queueLoading && <div style={{ fontSize: 12, color: '#94A3B8' }}>Loading…</div>}
          {!queueLoading && pending.length === 0 && (
            <div style={{ fontSize: 12, color: '#94A3B8', padding: '8px 0' }}>
              No pending Project Intakes requiring your approval.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((item) => (
              <div key={item.intakeId} style={{
                border: item.status === 'pending_tenant_approval' ? '1px solid #FDE68A' : '1px solid #DDD6FE',
                background: item.status === 'pending_tenant_approval' ? '#FFFBEB' : '#F5F3FF',
                borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{item.project}</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      {item.intakeId} · {item.tenantName || item.tenantId} · {item.cloud?.toUpperCase()} · {item.appCategory}
                      {' · '}submitted by <strong>{item.submittedByRole || item.submittedBy || 'Tenant User'}</strong>
                    </div>
                  </div>
                  {statusBadge(item.status)}
                </div>
                {item.description && (
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 8, lineHeight: 1.45 }}>
                    {item.description}
                  </div>
                )}
                <input
                  style={{ ...inputStyle, marginBottom: 8, background: '#fff' }}
                  placeholder="Review notes (optional)"
                  value={reviewNotes[item.intakeId] || ''}
                  onChange={(e) => setReviewNotes((prev) => ({ ...prev, [item.intakeId]: e.target.value }))}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    disabled={decidingId === item.intakeId}
                    onClick={() => decide(item.intakeId, 'approve')}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: item.status === 'pending_tenant_approval' ? '#0D9488' : '#7C3AED',
                      color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <i className="ti ti-check" />
                    {item.status === 'pending_tenant_approval'
                      ? (currentRole === 'Provider Admin' ? 'Override Approve → Unlock AI' : 'Approve & Forward to Provider Admin')
                      : 'Approve → Unlock AI Engine'}
                  </button>
                  <button
                    type="button"
                    disabled={decidingId === item.intakeId}
                    onClick={() => decide(item.intakeId, 'reject')}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: '1px solid #FECDD3',
                      background: '#fff', color: '#BE123C', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <i className="ti ti-x" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    <td style={{ padding: '14px 14px', color: '#0F172A', fontWeight: 700 }}>
                      <div>{item.project}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 400, fontFamily: 'monospace', marginTop: 2 }}>
                        {item.intakeId}
                      </div>
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
                            setIntakeForm(item);
                            markStageComplete('intake');
                            setPage('ai');
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
                          <span>Run AI Recommendation Engine</span>
                          <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
                        </button>
                      ) : item.status === 'pending_tenant_approval' ? (
                        currentRole === 'Tenant Admin' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              disabled={decidingId === item.intakeId}
                              onClick={() => decide(item.intakeId, 'approve')}
                              style={{
                                fontSize: 11, fontWeight: 700, color: '#FFFFFF', background: '#0D9488',
                                border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <i className="ti ti-check" /> Approve & Forward
                            </button>
                            <button
                              type="button"
                              disabled={decidingId === item.intakeId}
                              onClick={() => decide(item.intakeId, 'reject')}
                              style={{
                                fontSize: 11, fontWeight: 600, color: '#BE123C', background: '#FFFFFF',
                                border: '1px solid #FECDD3', borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
                              }}
                            >
                              <i className="ti ti-x" /> Reject
                            </button>
                          </div>
                        ) : currentRole === 'Provider Admin' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              disabled={decidingId === item.intakeId}
                              onClick={() => decide(item.intakeId, 'approve')}
                              style={{
                                fontSize: 11, fontWeight: 700, color: '#FFFFFF', background: '#7C3AED',
                                border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <i className="ti ti-bolt" /> Override Approve
                            </button>
                            <button
                              type="button"
                              disabled={decidingId === item.intakeId}
                              onClick={() => decide(item.intakeId, 'reject')}
                              style={{
                                fontSize: 11, fontWeight: 600, color: '#BE123C', background: '#FFFFFF',
                                border: '1px solid #FECDD3', borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
                              }}
                            >
                              <i className="ti ti-x" /> Reject
                            </button>
                          </div>
                        ) : (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                            borderRadius: 8, background: '#FEF3C7', border: '1px solid #FDE68A',
                            color: '#B45309', fontSize: 11, fontWeight: 600,
                          }} title="Requires Tenant Admin approval, then Provider Admin approval">
                            <i className="ti ti-clock" />
                            <span>Pending with Tenant Admin</span>
                          </div>
                        )
                      ) : item.status === 'pending_provider_approval' ? (
                        currentRole === 'Provider Admin' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              disabled={decidingId === item.intakeId}
                              onClick={() => decide(item.intakeId, 'approve')}
                              style={{
                                fontSize: 11, fontWeight: 700, color: '#FFFFFF', background: '#7C3AED',
                                border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <i className="ti ti-check" /> Approve → Unlock AI
                            </button>
                            <button
                              type="button"
                              disabled={decidingId === item.intakeId}
                              onClick={() => decide(item.intakeId, 'reject')}
                              style={{
                                fontSize: 11, fontWeight: 600, color: '#BE123C', background: '#FFFFFF',
                                border: '1px solid #FECDD3', borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
                              }}
                            >
                              <i className="ti ti-x" /> Reject
                            </button>
                          </div>
                        ) : (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                            borderRadius: 8, background: '#EDE9FE', border: '1px solid #DDD6FE',
                            color: '#6D28D9', fontSize: 11, fontWeight: 600,
                          }} title="Requires Provider Admin approval before Stage 2 AI">
                            <i className="ti ti-shield-clock" />
                            <span>Pending with Provider Admin</span>
                          </div>
                        )
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
    </div>
  );
}
