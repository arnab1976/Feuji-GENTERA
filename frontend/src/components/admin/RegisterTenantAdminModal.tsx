/**
 * Tenant Admin registration / intake modal.
 * Modes: register (initial Approve) | view | edit | review (Provider approve/reject pending edits)
 */
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { InvitedUser, TenantAdminIntakeData } from '@/types';
import { inviteApi } from '@/services/api';

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#334155',
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 13,
  color: '#0F172A',
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
};

export type IntakeModalMode = 'register' | 'view' | 'edit' | 'review';

export type TenantAdminIntakePayload = {
  full_name: string;
  org_name: string;
  contact_email: string;
  plan: string;
  primary_cloud: string;
  compliance: string;
  job_title: string;
  project: string;
  environment: string;
  app_category: string;
  budget_ceiling: number;
  description: string;
};

function fromIntake(data?: TenantAdminIntakeData | null, invite?: InvitedUser | null) {
  return {
    fullName: data?.full_name || invite?.fullName || '',
    orgName: data?.org_name || invite?.companyName || '',
    contactEmail: data?.contact_email || invite?.email || '',
    plan: data?.plan || 'PROFESSIONAL',
    primaryCloud: data?.primary_cloud || 'azure',
    compliance: data?.compliance || 'HIPAA',
    jobTitle: data?.job_title || invite?.jobTitle || '',
    project: data?.project || `${invite?.companyName || 'Tenant'} GenAI Platform`,
    environment: data?.environment || 'prod',
    appCategory: data?.app_category || 'rag',
    budgetCeiling: String(data?.budget_ceiling ?? 2000),
    description: data?.description || (
      invite
        ? `Onboard Tenant Admin ${invite.fullName} for ${invite.companyName}. `
          + 'Provision an isolated GenAI environment with role-based access, compliance controls, '
          + 'and FinOps cost boundaries aligned to the approved billing plan.'
        : ''
    ),
  };
}

function mapInvite(d: any, fallback?: InvitedUser | null): InvitedUser {
  return {
    inviteId: d.inviteId ?? fallback?.inviteId ?? '',
    fullName: d.fullName ?? fallback?.fullName ?? '',
    email: d.email ?? fallback?.email ?? '',
    role: d.role ?? fallback?.role ?? 'TENANT_ADMIN',
    companyName: d.companyName ?? fallback?.companyName ?? '',
    tenantId: d.tenantId ?? fallback?.tenantId,
    tenantName: d.tenantName ?? fallback?.tenantName,
    providerId: d.providerId ?? fallback?.providerId,
    department: d.department ?? fallback?.department,
    jobTitle: d.jobTitle ?? fallback?.jobTitle,
    functionArea: d.functionArea ?? fallback?.functionArea,
    invitedBy: d.invitedBy ?? fallback?.invitedBy ?? 'Provider Admin',
    invitedAt: d.invitedAt ?? fallback?.invitedAt ?? '',
    status: d.status ?? fallback?.status ?? 'PENDING',
    summaryLine: d.summaryLine,
    archived: Boolean(d.archived),
    decommissioned: Boolean(d.decommissioned),
    archivedAt: d.archivedAt,
    intakeData: d.intakeData ?? fallback?.intakeData,
    pendingIntakeData: d.pendingIntakeData ?? fallback?.pendingIntakeData,
    providerNotes: d.providerNotes ?? fallback?.providerNotes,
    reviewMessage: d.reviewMessage ?? fallback?.reviewMessage,
    lastReviewedAt: d.lastReviewedAt ?? fallback?.lastReviewedAt,
    lastEditedBy: d.lastEditedBy ?? fallback?.lastEditedBy,
    lastReviewDecision: d.lastReviewDecision ?? fallback?.lastReviewDecision,
    hasPendingReview: Boolean(d.hasPendingReview),
  };
}

function norm(v: unknown) {
  return String(v ?? '').trim().toLowerCase();
}

function diffKeys(prev?: TenantAdminIntakeData | null, next?: TenantAdminIntakeData | null): Set<string> {
  const keys = [
    'full_name', 'org_name', 'contact_email', 'plan', 'primary_cloud', 'compliance',
    'job_title', 'project', 'environment', 'app_category', 'budget_ceiling', 'description',
  ] as const;
  const changed = new Set<string>();
  if (!next) return changed;
  for (const k of keys) {
    if (norm(prev?.[k]) !== norm(next?.[k])) changed.add(k);
  }
  return changed;
}

const changedFieldWrap: CSSProperties = {
  padding: 8,
  margin: -8,
  borderRadius: 10,
  background: '#FEF3C7',
  border: '1px solid #FCD34D',
};

const changedInputStyle: CSSProperties = {
  ...inputStyle,
  background: '#FFFBEB',
  border: '1px solid #F59E0B',
};

export default function RegisterTenantAdminModal({
  open,
  invite,
  mode,
  actor,
  providerName,
  providerId,
  onClose,
  onDone,
}: {
  open: boolean;
  invite: InvitedUser | null;
  mode: IntakeModalMode;
  /** Who is acting — provider can apply edits immediately; tenant_admin queues review */
  actor: 'provider' | 'tenant_admin';
  providerName?: string;
  providerId?: string;
  onClose: () => void;
  onDone: (updated: InvitedUser, msg: string, tenant?: Record<string, unknown> | null) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [plan, setPlan] = useState('PROFESSIONAL');
  const [primaryCloud, setPrimaryCloud] = useState('azure');
  const [compliance, setCompliance] = useState('HIPAA');
  const [jobTitle, setJobTitle] = useState('');
  const [project, setProject] = useState('');
  const [environment, setEnvironment] = useState('prod');
  const [appCategory, setAppCategory] = useState('rag');
  const [budgetCeiling, setBudgetCeiling] = useState('2000');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const readOnly = mode === 'view' || mode === 'review';
  const showPending = Boolean(
    (mode === 'review' || mode === 'view')
    && invite?.pendingIntakeData
    && (invite.hasPendingReview || invite.status === 'PENDING'),
  );
  const changed = showPending
    ? diffKeys(invite?.intakeData, invite?.pendingIntakeData)
    : new Set<string>();
  const isChanged = (key: string) => changed.has(key);

  useEffect(() => {
    if (!open || !invite) return;
    const source = (
      (mode === 'review' || mode === 'view')
      && invite.pendingIntakeData
      && (invite.hasPendingReview || invite.status === 'PENDING' || mode === 'review')
    )
      ? invite.pendingIntakeData
      : (invite.intakeData || null);
    const v = fromIntake(source, invite);
    setFullName(v.fullName);
    setOrgName(v.orgName);
    setContactEmail(v.contactEmail);
    setPlan(v.plan);
    setPrimaryCloud(v.primaryCloud);
    setCompliance(v.compliance);
    setJobTitle(v.jobTitle);
    setProject(v.project);
    setEnvironment(v.environment);
    setAppCategory(v.appCategory);
    setBudgetCeiling(v.budgetCeiling);
    setDescription(v.description);
    setNotes('');
    setError(null);
    setLoading(false);
    setConfirmOpen(false);
  }, [open, invite, mode]);

  if (!open || !invite) return null;

  const buildPayload = (): TenantAdminIntakePayload => ({
    full_name: fullName.trim(),
    org_name: orgName.trim(),
    contact_email: contactEmail.trim().toLowerCase(),
    plan,
    primary_cloud: primaryCloud,
    compliance,
    job_title: jobTitle.trim(),
    project: project.trim(),
    environment,
    app_category: appCategory,
    budget_ceiling: Number(budgetCeiling) || 2000,
    description: description.trim(),
  });

  const validate = () => {
    if (!orgName.trim() || !contactEmail.trim() || !fullName.trim()) {
      setError('Organisation name, contact email, and admin name are required.');
      return false;
    }
    return true;
  };

  const approveInitial = async () => {
    if (!validate()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await inviteApi.approve(invite.inviteId, { ...buildPayload(), actor: 'Provider' });
      const updated = mapInvite(res.data, invite);
      onDone(updated, `Tenant Admin “${updated.fullName}” approved for ${updated.companyName}.`, res.data.tenant);
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not approve Tenant Admin intake.');
    } finally {
      setLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!validate()) return;
    setLoading(true);
    setError(null);
    setConfirmOpen(false);
    try {
      const res = await inviteApi.submitEdit(invite.inviteId, {
        ...buildPayload(),
        actor,
        provider_notes: actor === 'provider' ? notes.trim() : undefined,
      });
      const updated = mapInvite(res.data, invite);
      const queued = Boolean(res.data.queuedForReview);
      if (queued) {
        updated.status = 'PENDING';
        updated.hasPendingReview = true;
      }
      const msg = queued
        ? 'Request for approval sent to Provider Admin → Tenant Admin Invitations. Status is PENDING until the Provider who created this Tenant approves.'
        : `Registration updated by Provider for ${updated.companyName}.`;
      onDone(updated, msg, res.data.tenant);
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not save registration changes.');
    } finally {
      setLoading(false);
    }
  };

  const requestSave = () => {
    if (!validate()) return;
    // Tenant (and Tenant Management Edit) must never auto-approve — confirm then queue for Provider.
    if (actor === 'tenant_admin') {
      setConfirmOpen(true);
      return;
    }
    void saveEdit();
  };

  const reviewDecision = async (decision: 'approve' | 'reject') => {
    setLoading(true);
    setError(null);
    try {
      const res = await inviteApi.review(invite.inviteId, {
        decision,
        notes: notes.trim(),
      });
      const updated = mapInvite(res.data, invite);
      const msg = decision === 'approve'
        ? `Approved Tenant's request with notes for ${updated.companyName}. Status is APPROVED.`
        : `Rejected proposed changes. Previous information retained. Message sent to Tenant Admin portal.`;
      onDone(updated, msg, res.data.tenant);
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not complete Provider review.');
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'register' ? 'Tenant Admin registration'
      : mode === 'review' ? 'Edit Tenant changes · Reject or approve Tenant request'
        : mode === 'edit' ? 'Edit registration · Reject or Request for approval'
          : 'Tenant Admin registration details';

  const subtitle =
    mode === 'register' ? 'Requirement intake · Approve to activate Tenant Admin'
      : mode === 'review' ? "Amber fields were changed by Tenant · Use Approved Tenant's request with notes to confirm"
        : mode === 'edit'
          ? 'Request for approval sends changes to the Provider · Status becomes PENDING'
          : 'Saved information from requirement intake';

  const field = (
    label: string,
    required: boolean,
    child: ReactNode,
    changeKey?: string,
  ) => {
    const marked = Boolean(changeKey && isChanged(changeKey));
    return (
      <div style={marked ? changedFieldWrap : undefined}>
        <label style={labelStyle}>
          {label}{required ? <span style={{ color: '#EF4444' }}> *</span> : null}
          {marked ? (
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#B45309',
              background: '#FDE68A', padding: '1px 6px', borderRadius: 999,
            }}>
              Changed by Tenant
            </span>
          ) : null}
        </label>
        {child}
        {marked && invite?.intakeData && changeKey ? (
          <div style={{ fontSize: 11, color: '#92400E', marginTop: 4 }}>
            Previous: {String((invite.intakeData as Record<string, unknown>)[changeKey] ?? '—')}
          </div>
        ) : null}
      </div>
    );
  };

  const textInput = (
    value: string,
    onChange: (v: string) => void,
    opts?: { type?: string; placeholder?: string; changeKey?: string },
  ) => (
    <input
      style={{
        ...(opts?.changeKey && isChanged(opts.changeKey) ? changedInputStyle : inputStyle),
        background: opts?.changeKey && isChanged(opts.changeKey)
          ? '#FFFBEB'
          : (readOnly ? '#F1F5F9' : '#F8FAFC'),
      }}
      type={opts?.type || 'text'}
      value={value}
      placeholder={opts?.placeholder}
      readOnly={readOnly}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  const selectInput = (
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
    changeKey?: string,
  ) => (
    <select
      style={{
        ...(changeKey && isChanged(changeKey) ? changedInputStyle : inputStyle),
        cursor: readOnly ? 'default' : 'pointer',
        background: changeKey && isChanged(changeKey)
          ? '#FFFBEB'
          : (readOnly ? '#F1F5F9' : '#F8FAFC'),
      }}
      value={value}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tenant-admin-intake-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 11000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8, background: '#E0F2FE',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className="ti ti-user-plus" style={{ fontSize: 18, color: '#0284C7' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 id="tenant-admin-intake-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                {title}
              </h2>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{subtitle}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#0F766E', background: '#CCFBF1',
              padding: '4px 10px', borderRadius: 16, fontFamily: 'monospace',
            }}>
              {mode === 'review' ? 'PATCH /invite/review' : mode === 'edit' ? 'PATCH /invite/submit-edit' : 'PATCH /invite/approve'}
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0',
                background: '#FFFFFF', color: '#64748B', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
              }}
            >
              <i className="ti ti-x" style={{ fontSize: 18 }} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 22px 8px' }}>
          <div style={{
            padding: '10px 14px', borderRadius: 8, background: '#E0F2FE',
            color: '#0369A1', fontSize: 13, marginBottom: 16,
          }}>
            Registering under Provider:{' '}
            <strong>{providerName || '—'}</strong>
            {providerId ? <> ({providerId})</> : null}
            {invite.tenantId ? <> · Tenant ID <code style={{ fontSize: 11 }}>{invite.tenantId}</code></> : null}
          </div>

          {showPending && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, background: '#FEF3C7',
              color: '#92400E', fontSize: 12, marginBottom: 14, lineHeight: 1.45,
              border: '1px solid #FCD34D',
            }}>
              <strong>Notification:</strong> Tenant Admin changed registration details.
              Fields highlighted in <strong style={{ background: '#FDE68A', padding: '0 4px', borderRadius: 4 }}>amber</strong> were modified.
              {invite.intakeData ? (
                <> Previous approved org: <strong>{invite.intakeData.org_name || invite.companyName}</strong>.</>
              ) : null}
              {' '}Use <strong>Reject (keep previous)</strong> or <strong>Approved Tenant&apos;s request with notes</strong> below.
            </div>
          )}

          {mode === 'view' && !showPending && invite.reviewMessage && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: invite.lastReviewDecision === 'reject' ? '#FEF2F2' : '#F0FDFA',
              color: invite.lastReviewDecision === 'reject' ? '#B91C1C' : '#0F766E',
              fontSize: 12, marginBottom: 14, whiteSpace: 'pre-wrap',
              border: invite.lastReviewDecision === 'reject' ? '1px solid #FECACA' : '1px solid #99F6E4',
            }}>
              <strong>
                {invite.lastReviewDecision === 'reject' ? 'Rejected by Provider:' : 'Provider message:'}
              </strong>{' '}
              {invite.reviewMessage}
            </div>
          )}

          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#64748B',
            textTransform: 'uppercase', marginBottom: 10,
          }}>
            Tenant organisation
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {field('Organisation name', true, textInput(orgName, setOrgName, { changeKey: 'org_name' }), 'org_name')}
            {field('Contact email', true, textInput(contactEmail, setContactEmail, { type: 'email', changeKey: 'contact_email' }), 'contact_email')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
            {field('Billing plan', false, selectInput(plan, setPlan, [
              { value: 'ENTERPRISE', label: 'ENTERPRISE' },
              { value: 'PROFESSIONAL', label: 'PROFESSIONAL' },
              { value: 'FREE', label: 'FREE' },
            ], 'plan'), 'plan')}
            {field('Primary cloud', false, selectInput(primaryCloud, setPrimaryCloud, [
              { value: 'azure', label: 'Azure' },
              { value: 'aws', label: 'AWS' },
            ], 'primary_cloud'), 'primary_cloud')}
            {field('Compliance', false, selectInput(compliance, setCompliance, [
              { value: 'HIPAA', label: 'HIPAA' },
              { value: 'SOC2', label: 'SOC2' },
              { value: 'GDPR', label: 'GDPR' },
              { value: 'None', label: 'None' },
            ], 'compliance'), 'compliance')}
          </div>

          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#64748B',
            textTransform: 'uppercase', marginBottom: 10,
          }}>
            Tenant Admin & GenAI requirements
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {field('Admin full name', true, textInput(fullName, setFullName, { changeKey: 'full_name' }), 'full_name')}
            {field('Job title', false, textInput(jobTitle, setJobTitle, { placeholder: 'VP IT / Head of Digital', changeKey: 'job_title' }), 'job_title')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {field('Project / use case', false, textInput(project, setProject, { changeKey: 'project' }), 'project')}
            {field('Budget ceiling (USD / mo)', false, textInput(budgetCeiling, setBudgetCeiling, { type: 'number', changeKey: 'budget_ceiling' }), 'budget_ceiling')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {field('Environment', false, selectInput(environment, setEnvironment, [
              { value: 'prod', label: 'Production' },
              { value: 'uat', label: 'UAT' },
              { value: 'dev', label: 'Development' },
            ], 'environment'), 'environment')}
            {field('App category', false, selectInput(appCategory, setAppCategory, [
              { value: 'rag', label: 'RAG' },
              { value: 'agent', label: 'Agent' },
              { value: 'summariser', label: 'Summariser' },
              { value: 'finetuning', label: 'Fine-tuning' },
            ], 'app_category'), 'app_category')}
          </div>

          <div style={{ marginBottom: 8, ...(isChanged('description') ? changedFieldWrap : {}) }}>
            <label style={labelStyle}>
              Requirement summary
              {isChanged('description') ? (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#B45309',
                  background: '#FDE68A', padding: '1px 6px', borderRadius: 999,
                }}>
                  Changed by Tenant
                </span>
              ) : null}
            </label>
            <textarea
              style={{
                ...inputStyle, minHeight: 88, resize: 'vertical', fontFamily: 'inherit',
                background: isChanged('description') ? '#FFFBEB' : (readOnly ? '#F1F5F9' : '#F8FAFC'),
                border: isChanged('description') ? '1px solid #F59E0B' : inputStyle.border,
              }}
              value={description}
              readOnly={readOnly}
              disabled={readOnly}
              onChange={(e) => setDescription(e.target.value)}
            />
            {isChanged('description') && (invite.intakeData as { description?: string } | null | undefined)?.description ? (
              <div style={{ fontSize: 11, color: '#92400E', marginTop: 4 }}>
                Previous: {(invite.intakeData as { description?: string }).description}
              </div>
            ) : null}
          </div>

          {(actor === 'provider' && (mode === 'review' || mode === 'edit' || (showPending && mode === 'view'))) && (
            <div style={{ marginTop: 12, marginBottom: 8 }}>
              <label style={labelStyle}>
                {(mode === 'review' || showPending)
                  ? 'Provider notes (sent to Tenant Admin / Tenant Admin portal)'
                  : 'Notes for Tenant Admin (optional)'}
              </label>
              <textarea
                style={{ ...inputStyle, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
                value={notes}
                placeholder={(mode === 'review' || showPending)
                  ? 'Explain approval or ask Tenant Admin to keep previous information…'
                  : 'Optional note about this Provider update…'}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: '#B91C1C', fontWeight: 600, marginTop: 8 }}>{error}</div>
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
          padding: '14px 22px', borderTop: '1px solid #F1F5F9', background: '#FAFBFC',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#334155',
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 999, cursor: 'pointer',
            }}
          >
            {mode === 'view' ? 'Close' : 'Cancel'}
          </button>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {mode === 'register' && (
              <button
                type="button"
                disabled={loading}
                onClick={approveInitial}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
                  background: loading ? '#94A3B8' : '#0D9488', border: 'none', borderRadius: 999,
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <i className="ti ti-check" style={{ fontSize: 15 }} />
                {loading ? 'Approving…' : 'Approve'}
              </button>
            )}

            {/* Edit / review popup: Reject (keep previous) + approve Tenant request */}
            {(mode === 'edit' || (actor === 'provider' && (mode === 'review' || showPending))) && (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (mode === 'review' || showPending) {
                      void reviewDecision('reject');
                    } else {
                      onClose();
                    }
                  }}
                  style={{
                    padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#B91C1C',
                    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 999,
                    cursor: loading ? 'wait' : 'pointer',
                  }}
                >
                  Reject (keep previous)
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (mode === 'review' || (showPending && actor === 'provider')) {
                      void reviewDecision('approve');
                    } else {
                      requestSave();
                    }
                  }}
                  style={{
                    padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
                    background: loading ? '#94A3B8' : '#0D9488', border: 'none', borderRadius: 999,
                    cursor: loading ? 'wait' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    maxWidth: '100%',
                  }}
                >
                  <i className={`ti ${actor === 'provider' && (mode === 'review' || showPending) ? 'ti-check' : 'ti-send'}`} style={{ fontSize: 15 }} />
                  {loading
                    ? 'Saving…'
                    : (actor === 'provider' && (mode === 'review' || showPending)
                      ? "Approved Tenant's request with notes"
                      : 'Request for approval')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 12000,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
              padding: '22px 24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#FEF3C7',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className="ti ti-bell" style={{ fontSize: 20, color: '#D97706' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  Request approval from Provider?
                </h3>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748B', lineHeight: 1.55 }}>
                  You are changing information that was set by the <strong>Provider</strong>.
                  A Tenant Admin cannot approve this request. Click confirm to send a{' '}
                  <strong>Request for approval</strong> to the Provider who created this Tenant
                  (Provider Admin → Tenant Admin Invitations). Status will change to{' '}
                  <strong>PENDING</strong> until the Provider approves or rejects (with notes).
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#334155',
                  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 999, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={saveEdit}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
                  background: loading ? '#94A3B8' : '#0D9488', border: 'none', borderRadius: 999,
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <i className="ti ti-send" style={{ fontSize: 15 }} />
                {loading ? 'Sending…' : 'Request for approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
