/**
 * Invite User modal — Provider Admin invites Provider User / Tenant Admin / Tenant User.
 * Company name rules:
 *  - Provider User → defaults to Provider Name
 *  - Tenant Admin → manually entered (feeds Tenant User dropdown + tenant registry)
 *  - Tenant User → Tenant Company Name dropdown from Tenant Admin companies
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi, providerApi } from '@/services/api';
import type { InviteRole, InvitedUser, Tenant } from '@/types';

type InviteRoleOption = {
  id: InviteRole;
  initials: string;
  title: string;
  desc: string;
  color: string;
  bg: string;
};

const ROLE_OPTIONS: InviteRoleOption[] = [
  {
    id: 'PROVIDER_USER',
    initials: 'PU',
    title: 'Provider User',
    desc: 'View-only platform access',
    color: '#0369A1',
    bg: '#E0F2FE',
  },
  {
    id: 'TENANT_ADMIN',
    initials: 'TA',
    title: 'Tenant Admin',
    desc: 'Tenant-scoped management',
    color: '#0F766E',
    bg: '#CCFBF1',
  },
  {
    id: 'TENANT_USER',
    initials: 'TU',
    title: 'Tenant User',
    desc: 'Workflow feature access',
    color: '#1D4ED8',
    bg: '#DBEAFE',
  },
];

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: '#64748B',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  color: '#0F172A',
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
};

export default function InviteUserModal({
  open,
  onClose,
  onSuccess,
  lockedRole,
  lockedCompany,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  /** When set, skips role picker (e.g. Invite Tenant User from Tenant Admin portal). */
  lockedRole?: InviteRole;
  /** When set, locks Tenant Company Name (Tenant Admin inviting under own tenant). */
  lockedCompany?: string;
}) {
  const {
    provider, providers, tenants, invitedUsers, addInvitedUser,
    setActiveTenant, setProviders, setProvider, currentRole,
  } = useAppStore();
  const activeProvider = provider
    ?? providers.find((p) => !p.archived && !p.deleted)
    ?? providers[0]
    ?? null;

  const tenantAdminCompanies = useMemo(() => {
    const fromInvites = (invitedUsers || [])
      .filter((u) => u.role === 'TENANT_ADMIN' && u.companyName?.trim() && !u.archived && !u.decommissioned)
      .map((u) => u.companyName.trim());
    const fromTenants = (tenants || [])
      .filter((t: Tenant) => !t.archived && t.status !== 'INACTIVE')
      .map((t: Tenant) => t.orgName?.trim())
      .filter(Boolean) as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...fromInvites, ...fromTenants]) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [invitedUsers, tenants]);

  const [role, setRole] = useState<InviteRole | null>(lockedRole ?? null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [functionArea, setFunctionArea] = useState('');
  const [apiCompanies, setApiCompanies] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const companyOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...apiCompanies, ...tenantAdminCompanies]) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [apiCompanies, tenantAdminCompanies]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Sync providers from Postgres so invite uses a real providerId
    providerApi.list()
      .then((res) => {
        if (cancelled) return;
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
      .catch(() => { /* keep local store */ });

    inviteApi.tenantCompanies()
      .then((res) => {
        if (!cancelled) setApiCompanies(res.data?.companies ?? []);
      })
      .catch(() => {
        if (!cancelled) setApiCompanies([]);
      });
    return () => { cancelled = true; };
  }, [open, invitedUsers.length, setProviders]);

  useEffect(() => {
    if (!open) return;
    if (lockedRole) {
      setRole(lockedRole);
    }
    if (lockedCompany?.trim()) {
      setCompanyName(lockedCompany.trim());
    }
  }, [open, lockedRole, lockedCompany]);

  useEffect(() => {
    if (!open) return;
    if (role === 'PROVIDER_USER') {
      setCompanyName(activeProvider?.name ?? '');
    } else if (role === 'TENANT_ADMIN') {
      setCompanyName('');
    } else if (role === 'TENANT_USER') {
      if (lockedCompany?.trim()) {
        setCompanyName(lockedCompany.trim());
      } else if (currentRole === 'Tenant Admin' && companyOptions.length === 1) {
        setCompanyName(companyOptions[0]);
      } else if (!lockedRole) {
        setCompanyName('');
      }
    }
  }, [role, open, activeProvider?.name, currentRole, companyOptions, lockedRole, lockedCompany]);

  if (!open) return null;

  const reset = () => {
    setRole(lockedRole ?? null);
    setFullName('');
    setEmail('');
    setCompanyName('');
    setDepartment('');
    setJobTitle('');
    setFunctionArea('');
    setError(null);
    setLoading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const sendInvite = async () => {
    if (!role) {
      setError('Please select a role.');
      return;
    }
    if (!fullName.trim() || !email.trim()) {
      setError('Full name and work email are required.');
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) {
      setError('Enter a valid work email (e.g. name@company.com).');
      return;
    }
    if (role === 'PROVIDER_USER' && !department) {
      setError('Select a department for Provider User.');
      return;
    }
    if (role === 'TENANT_ADMIN' && !jobTitle.trim()) {
      setError('Job title is required for Tenant Admin.');
      return;
    }
    if (role === 'TENANT_ADMIN' && !companyName.trim()) {
      setError('Company name is required for Tenant Admin.');
      return;
    }
    if (role === 'TENANT_USER' && !functionArea) {
      setError('Select a function area for Tenant User.');
      return;
    }
    if (role === 'TENANT_USER' && !companyName.trim()) {
      setError('Select a Tenant Company Name.');
      return;
    }
    if (role === 'PROVIDER_USER' && !companyName.trim() && !activeProvider?.name) {
      setError('Register a provider first so Company name can default to the provider name.');
      return;
    }

    const resolvedCompany =
      role === 'PROVIDER_USER'
        ? (activeProvider?.name || companyName).trim()
        : companyName.trim();

    // Prefer backend ID matching the company/provider name (avoids stale local IDs)
    const synced = useAppStore.getState().providers || [];
    const matchedByName = synced.find(
      (p) => p.name?.trim().toLowerCase() === resolvedCompany.toLowerCase(),
    ) ?? synced.find(
      (p) => activeProvider?.name
        && p.name?.trim().toLowerCase() === activeProvider.name.trim().toLowerCase(),
    );
    const resolvedProviderId = matchedByName?.providerId
      ?? activeProvider?.providerId
      ?? synced[0]?.providerId
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
      const invitedBy =
        role === 'TENANT_USER'
          ? (currentRole === 'Tenant Admin' ? 'Tenant Admin' : (currentRole || 'Provider Admin'))
          : 'Provider Admin';

      const res = await inviteApi.create({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        company_name: resolvedCompany,
        provider_id: resolvedProviderId,
        department: role === 'PROVIDER_USER' ? department : null,
        job_title: role === 'TENANT_ADMIN' ? jobTitle.trim() : null,
        function_area: role === 'TENANT_USER' ? functionArea : null,
        invited_by: invitedBy,
      });

      const data = res.data;
      const invite: InvitedUser = {
        inviteId: data.inviteId,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        companyName: data.companyName,
        tenantId: data.tenantId ?? null,
        tenantName: data.tenantName ?? (role !== 'PROVIDER_USER' ? data.companyName : null),
        department: data.department ?? undefined,
        jobTitle: data.jobTitle ?? undefined,
        functionArea: data.functionArea ?? undefined,
        invitedBy: data.invitedBy ?? invitedBy,
        invitedAt: data.invitedAt ?? new Date().toISOString(),
        status: data.status ?? 'PENDING',
        summaryLine: data.summaryLine,
        intakeData: data.intakeData,
      };

      addInvitedUser(invite);

      if (data.tenant) {
        const t = data.tenant;
        setActiveTenant({
          tenantId: t.tenantId,
          providerId: t.providerId,
          orgName: t.orgName,
          contact: t.contact,
          billing: t.billing ?? { plan: 'PROFESSIONAL', currency: 'USD' },
          cloud: t.cloud ?? { primary: 'azure' },
          compliance: t.compliance ?? 'HIPAA',
          status: t.status ?? 'ACTIVE',
          budgetCeiling: t.budgetCeiling ?? 2000,
          createdAt: t.createdAt ? String(t.createdAt).split('T')[0] : new Date().toISOString().split('T')[0],
        });
      }

      onSuccess(
        role === 'PROVIDER_USER'
          ? `Provider User invitation saved for ${invite.fullName}. Open Provider Admin → Register Provider User to complete intake (then it appears in the Provider User portal).`
          : role === 'TENANT_ADMIN'
            ? `Tenant Admin invitation saved for ${invite.fullName}. Register them from Tenant Admin Invitations, then manage in Tenant Admin.`
            : `Tenant User profile for ${invite.fullName} submitted. Status is PENDING until Provider Admin approves it.`,
      );
      close();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let msg = 'Could not save invitation to the backend. Please try again.';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail)) {
        const first = detail[0];
        const loc = Array.isArray(first?.loc) ? first.loc.join('.') : '';
        msg = first?.msg
          ? `${loc ? `${loc}: ` : ''}${first.msg}`
          : msg;
        if (String(first?.msg || '').toLowerCase().includes('email')
          || String(loc).includes('email')) {
          msg = 'Enter a valid work email (e.g. name@company.com).';
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-user-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={close}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid #F1F5F9', position: 'relative' }}>
          <h2 id="invite-user-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
            {lockedRole === 'TENANT_USER' ? 'Invite Tenant User' : 'Invite new user'}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B', lineHeight: 1.45 }}>
            {lockedRole === 'TENANT_USER'
              ? 'Tenant Admin submits the profile. Provider Admin must approve before the Tenant User is active.'
              : 'As Provider Admin, you can invite any role level below you.'}
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              background: '#F8FAFC',
              color: '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 16 }} />
          </button>
        </div>

        <div style={{ padding: '16px 22px 20px', maxHeight: '70vh', overflowY: 'auto' }}>
          {!lockedRole && (
            <>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Select role</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {ROLE_OPTIONS.filter((opt) => {
                  // Only Tenant Admin may invite Tenant Users (from Tenant Admin Portal).
                  if (opt.id === 'TENANT_USER') return false;
                  return true;
                }).map((opt) => {
                  const selected = role === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setRole(opt.id);
                        setError(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: selected ? `2px solid ${opt.color}` : '1px solid #E2E8F0',
                        background: selected ? `${opt.bg}` : '#FFFFFF',
                        cursor: 'pointer',
                        fontFamily: 'var(--fn)',
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: opt.bg,
                          color: opt.color,
                          fontSize: 12,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {opt.initials}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{opt.title}</div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{opt.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {role && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Full name *</label>
                  <input
                    style={inputStyle}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Work email *</label>
                  <input
                    type="email"
                    style={inputStyle}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@company.com"
                  />
                </div>
              </div>

              {role === 'PROVIDER_USER' && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Company name · defaults to Provider</label>
                    <input
                      style={{ ...inputStyle, background: '#F1F5F9', color: '#334155' }}
                      value={companyName || activeProvider?.name || ''}
                      readOnly
                      title="Defaults to the registered Provider name"
                    />
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                      Locked to provider organisation: {activeProvider?.name || '— register a provider first'}
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Department * · Provider User pattern</label>
                    <select
                      style={{ ...inputStyle, cursor: 'pointer' }}
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    >
                      <option value="">Select department</option>
                      <option value="AI Practice">AI Practice</option>
                      <option value="Delivery">Delivery</option>
                      <option value="Analytics">Analytics</option>
                      <option value="Customer Success">Customer Success</option>
                    </select>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                      Platform-wide access — no tenant assignment required.
                    </div>
                  </div>
                </>
              )}

              {role === 'TENANT_ADMIN' && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Company name *</label>
                    <input
                      style={inputStyle}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Enter tenant company name"
                    />
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                      Saved to PostgreSQL and available in Tenant User → Tenant Company Name.
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Job title * · Tenant Admin pattern</label>
                    <input
                      style={inputStyle}
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="VP IT / Head of Digital"
                    />
                  </div>
                </>
              )}

              {role === 'TENANT_USER' && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Tenant Company Name *</label>
                    {lockedCompany?.trim() ? (
                      <>
                        <input
                          style={{ ...inputStyle, background: '#F1F5F9', color: '#334155' }}
                          value={companyName}
                          readOnly
                        />
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                          Locked to your Tenant Admin company — users are invited under this tenant only.
                        </div>
                      </>
                    ) : (
                      <>
                        <select
                          style={{ ...inputStyle, cursor: 'pointer' }}
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                        >
                          <option value="">Select tenant company</option>
                          {companyOptions.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        {companyOptions.length === 0 && (
                          <div style={{ fontSize: 11, color: '#B45309', marginTop: 6 }}>
                            No tenant companies yet. Invite a Tenant Admin with a Company name first.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Function area * · Tenant User pattern</label>
                    <select
                      style={{ ...inputStyle, cursor: 'pointer' }}
                      value={functionArea}
                      onChange={(e) => setFunctionArea(e.target.value)}
                    >
                      <option value="">Select function</option>
                      <option value="Data Science">Data Science</option>
                      <option value="Clinical / Domain">Clinical / Domain</option>
                      <option value="Engineering">Engineering</option>
                      <option value="Operations">Operations</option>
                    </select>
                  </div>
                </>
              )}
            </>
          )}

          {!role && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: '#F8FAFC',
                border: '1px dashed #E2E8F0',
                fontSize: 12,
                color: '#64748B',
                marginBottom: 8,
              }}
            >
              Select a role above. Provider Admin will then fill the role-specific details.
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10, fontWeight: 600 }}>{error}</div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '14px 22px',
            borderTop: '1px solid #F1F5F9',
            background: '#FAFBFC',
          }}
        >
          <button
            type="button"
            onClick={close}
            style={{
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={sendInvite}
            disabled={!role || loading}
            style={{
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 700,
              color: '#FFFFFF',
              background: role && !loading ? '#0D9488' : '#94A3B8',
              border: 'none',
              borderRadius: 999,
              cursor: role && !loading ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className="ti ti-send" style={{ fontSize: 15 }} />
            {loading ? 'Saving…' : 'Send invitation'}
          </button>
        </div>
      </div>
    </div>
  );
}
