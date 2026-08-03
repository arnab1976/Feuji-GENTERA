/**
 * Tenant User requirement intake form — filled by Tenant Admin under a specific tenant.
 * Submits invite + intake profile; status stays PENDING until Provider Admin approves.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi, providerApi } from '@/services/api';
import type { InvitedUser } from '@/types';

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

function mapInvite(d: any): InvitedUser {
  return {
    inviteId: d.inviteId,
    fullName: d.fullName,
    email: d.email,
    role: d.role,
    companyName: d.companyName,
    providerId: d.providerId,
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    department: d.department,
    jobTitle: d.jobTitle,
    functionArea: d.functionArea,
    invitedBy: d.invitedBy,
    invitedAt: d.invitedAt,
    status: d.status,
    summaryLine: d.summaryLine,
    archived: Boolean(d.archived),
    decommissioned: Boolean(d.decommissioned),
    archivedAt: d.archivedAt,
    intakeData: d.intakeData,
    pendingIntakeData: d.pendingIntakeData,
    providerNotes: d.providerNotes,
    reviewMessage: d.reviewMessage,
    lastReviewedAt: d.lastReviewedAt,
    lastEditedBy: d.lastEditedBy,
    lastReviewDecision: d.lastReviewDecision,
    hasPendingReview: Boolean(d.hasPendingReview),
  };
}

export default function InviteTenantUserFormModal({
  open,
  tenantAdmin,
  onClose,
  onSuccess,
}: {
  open: boolean;
  /** Tenant Admin under whose tenant the user is invited */
  tenantAdmin: InvitedUser | null;
  onClose: () => void;
  onSuccess: (msg: string, invite: InvitedUser) => void;
}) {
  const { provider, providers, addInvitedUser, setProviders, setProvider, currentRole } = useAppStore();
  const activeProvider = provider
    ?? providers.find((p) => !p.archived && !p.deleted)
    ?? providers[0]
    ?? null;

  const orgName = (
    tenantAdmin?.intakeData && 'org_name' in tenantAdmin.intakeData
      ? tenantAdmin.intakeData.org_name
      : undefined
  ) || tenantAdmin?.companyName || '';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [functionArea, setFunctionArea] = useState('');
  const [department, setDepartment] = useState('');
  const [project, setProject] = useState('');
  const [environment, setEnvironment] = useState('prod');
  const [accessScope, setAccessScope] = useState('workflow');
  const [primaryCloud, setPrimaryCloud] = useState('azure');
  const [compliance, setCompliance] = useState('HIPAA');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !tenantAdmin) return;
    setFullName('');
    setEmail('');
    setJobTitle('');
    setFunctionArea('');
    setDepartment('');
    setProject(`${orgName} GenAI workflow`.trim());
    setEnvironment('prod');
    setAccessScope('workflow');
    setPrimaryCloud(
      (tenantAdmin.intakeData && 'primary_cloud' in tenantAdmin.intakeData
        ? String(tenantAdmin.intakeData.primary_cloud || 'azure')
        : 'azure'),
    );
    setCompliance(
      (tenantAdmin.intakeData && 'compliance' in tenantAdmin.intakeData
        ? String(tenantAdmin.intakeData.compliance || 'HIPAA')
        : 'HIPAA'),
    );
    setDescription(
      `Onboard Tenant User for ${orgName}. Grant tenant-scoped workflow access under Tenant Admin ${tenantAdmin.fullName}. `
      + 'Access stays pending until Provider Admin approves this requirement form.',
    );
    setError(null);
    setLoading(false);

    providerApi.list()
      .then((res) => {
        const rows = (res.data || []).map((d: any) => ({
          providerId: d.providerId,
          name: d.name,
          adminEmail: d.adminEmail,
          industry: d.industry,
          plan: d.plan,
          status: d.status ?? 'ACTIVE',
          tenants: d.tenants ?? [],
          users: d.users ?? [],
          createdAt: d.createdAt ? String(d.createdAt).split('T')[0] : '',
          deleted: false,
          archived: false,
          commissioned: true,
        }));
        if (rows.length) setProviders(rows);
      })
      .catch(() => { /* keep local */ });
  }, [open, tenantAdmin, orgName, setProviders]);

  if (!open || !tenantAdmin) return null;

  const submit = async () => {
    if (!fullName.trim() || !email.trim()) {
      setError('Full name and work email are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid work email (e.g. name@company.com).');
      return;
    }
    if (!jobTitle.trim()) {
      setError('Job title is required.');
      return;
    }
    if (!functionArea) {
      setError('Select a function area.');
      return;
    }
    if (!department.trim()) {
      setError('Department / team is required.');
      return;
    }
    if (!project.trim()) {
      setError('Project / use case is required.');
      return;
    }
    if (!description.trim() || description.trim().length < 20) {
      setError('Provide a requirement description (at least 20 characters).');
      return;
    }
    if (!orgName.trim()) {
      setError('Tenant company is missing on this Tenant Admin record.');
      return;
    }

    const synced = useAppStore.getState().providers || [];
    const matchedByName = synced.find(
      (p) => activeProvider?.name
        && p.name?.trim().toLowerCase() === activeProvider.name.trim().toLowerCase(),
    ) ?? synced[0];
    const resolvedProviderId = matchedByName?.providerId
      ?? activeProvider?.providerId
      ?? tenantAdmin.providerId
      ?? null;

    if (matchedByName && matchedByName.providerId !== activeProvider?.providerId) {
      setProvider({
        ...matchedByName,
        deleted: false,
        archived: false,
        commissioned: true,
      });
    }

    setLoading(true);
    setError(null);
    try {
      const res = await inviteApi.create({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role: 'TENANT_USER',
        company_name: orgName.trim(),
        provider_id: resolvedProviderId,
        job_title: jobTitle.trim(),
        function_area: functionArea,
        department: department.trim(),
        portfolio_scope: accessScope,
        contribution: description.trim(),
        invited_by: currentRole === 'Tenant Admin' ? 'Tenant Admin' : (currentRole || 'Tenant Admin'),
        // Extra intake fields — backend stores on create for TENANT_USER
        project: project.trim(),
        environment,
        access_scope: accessScope,
        primary_cloud: primaryCloud,
        compliance,
        description: description.trim(),
        tenant_id: tenantAdmin.tenantId || undefined,
      });

      const invite = mapInvite(res.data);
      addInvitedUser(invite);
      onSuccess(
        `Requirement form submitted for ${invite.fullName}. Status is PENDING — awaiting Provider Admin approval.`,
        invite,
      );
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not submit Tenant User requirement form.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tu-requirement-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto',
          background: '#FFFFFF', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)', border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #F1F5F9', position: 'relative' }}>
          <h2 id="tu-requirement-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
            Invite Tenant User · Requirement form
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B', lineHeight: 1.45 }}>
            Fill the requirement form for a user under{' '}
            <strong>{orgName || 'your tenant'}</strong>
            {tenantAdmin.tenantId ? (
              <> (<code style={{ fontSize: 11 }}>{tenantAdmin.tenantId}</code>)</>
            ) : null}
            . The profile stays <strong>PENDING</strong> until Provider Admin approves.
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 8,
              border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 16 }} />
          </button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>
          <div style={{
            padding: '10px 12px', borderRadius: 10, background: '#EFF6FF',
            border: '1px solid #BFDBFE', color: '#1E40AF', fontSize: 12, lineHeight: 1.45,
          }}>
            Tenant Admin: <strong>{tenantAdmin.fullName}</strong> · {tenantAdmin.email}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Full name *</label>
              <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <label style={labelStyle}>Work email *</label>
              <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Tenant company</label>
            <input style={{ ...inputStyle, background: '#F1F5F9' }} value={orgName} readOnly />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Job title *</label>
              <input style={inputStyle} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Data Scientist" />
            </div>
            <div>
              <label style={labelStyle}>Function area *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={functionArea} onChange={(e) => setFunctionArea(e.target.value)}>
                <option value="">Select function</option>
                <option value="Data Science">Data Science</option>
                <option value="Clinical / Domain">Clinical / Domain</option>
                <option value="Engineering">Engineering</option>
                <option value="Operations">Operations</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Department / team *</label>
              <input style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="GenAI Delivery" />
            </div>
            <div>
              <label style={labelStyle}>Access scope *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={accessScope} onChange={(e) => setAccessScope(e.target.value)}>
                <option value="workflow">LLM Kit workflow stages</option>
                <option value="intake_cost">Intake + Cost review only</option>
                <option value="readonly">Read-only tenant workspace</option>
                <option value="full_tenant">Full tenant feature access</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Project / use case *</label>
            <input style={inputStyle} value={project} onChange={(e) => setProject(e.target.value)} placeholder="RAG assistant for claims" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Environment *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                <option value="dev">dev</option>
                <option value="uat">uat</option>
                <option value="prod">prod</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Primary cloud *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={primaryCloud} onChange={(e) => setPrimaryCloud(e.target.value)}>
                <option value="azure">Azure</option>
                <option value="aws">AWS</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Compliance *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={compliance} onChange={(e) => setCompliance(e.target.value)}>
                <option value="HIPAA">HIPAA</option>
                <option value="SOC2">SOC2</option>
                <option value="GDPR">GDPR</option>
                <option value="None">None</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Requirement description *</label>
            <textarea
              style={{ ...inputStyle, minHeight: 100, resize: 'vertical', background: '#FFFFFF' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe why this user needs access, what they will do, and any constraints…"
            />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
              Submitted to Provider Admin for approval. Tenant Admin cannot auto-approve.
            </div>
          </div>

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, background: '#FEF2F2',
              border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: 12, fontWeight: 600,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid #F1F5F9',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#475569',
              background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void submit()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
              background: '#2563EB', border: 'none', borderRadius: 999,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            <i className="ti ti-send" style={{ fontSize: 15 }} />
            {loading ? 'Submitting…' : 'Submit for Provider approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
