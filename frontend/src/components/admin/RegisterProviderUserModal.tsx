/**
 * Provider User registration / intake modal.
 * Modes: register | view | edit | review
 * Actors: provider (Admin can allow/deny all caps) | provider_user (request add/exclude)
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { InvitedUser, ProviderUserIntakeData } from '@/types';
import { inviteApi } from '@/services/api';

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#334155',
  marginBottom: 6,
  letterSpacing: '0.02em',
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

const DEPARTMENTS = ['AI Practice', 'Delivery', 'Analytics', 'Customer Success', 'Platform Ops'];
const FUNCTION_AREAS = [
  'AI Practice Leadership',
  'Portfolio Oversight',
  'FinOps / OPTIMA',
  'Customer Success',
  'Platform Health',
];
const PORTFOLIO_SCOPES = [
  { id: 'all_tenants', label: 'All tenants (platform-wide)' },
  { id: 'practice', label: 'Assigned practice / department' },
  { id: 'named', label: 'Named tenant portfolio' },
];

export const PROVIDER_USER_CAPABILITIES = [
  { key: 'view_providers_tenants', label: 'View all providers & tenants', allowed: true },
  { key: 'view_llm_kit_progress', label: 'Monitor LLM Kit stage progress (read)', allowed: true },
  { key: 'view_portfolio_analytics', label: 'Portfolio analytics across clients', allowed: true },
  { key: 'view_optima_savings', label: 'OPTIMA-AI savings (view only)', allowed: true },
  { key: 'view_health_dashboards', label: 'Infrastructure health dashboards', allowed: true },
  { key: 'view_audit_readonly', label: 'Audit log (read-only)', allowed: true },
  { key: 'invite_users', label: 'Invite or manage users', allowed: false },
  { key: 'manage_tenants', label: 'Create / modify tenants or budgets', allowed: false },
  { key: 'approve_costs', label: 'Approve cost reviews or OPTIMA changes', allowed: false },
  { key: 'submit_workflow', label: 'Submit LLM Kit intake / workflow stages', allowed: false },
] as const;

export type ProviderUserCapKey = (typeof PROVIDER_USER_CAPABILITIES)[number]['key'];
export type ProviderUserModalMode = 'register' | 'view' | 'edit' | 'review';
export type ProviderUserModalActor = 'provider' | 'provider_user';

function mapInvite(d: any, fallback?: InvitedUser | null): InvitedUser {
  return {
    inviteId: d.inviteId ?? fallback?.inviteId ?? '',
    fullName: d.fullName ?? fallback?.fullName ?? '',
    email: d.email ?? fallback?.email ?? '',
    role: d.role ?? fallback?.role ?? 'PROVIDER_USER',
    companyName: d.companyName ?? fallback?.companyName ?? '',
    tenantId: d.tenantId ?? fallback?.tenantId,
    tenantName: d.tenantName ?? fallback?.tenantName,
    providerId: d.providerId ?? fallback?.providerId,
    department: d.department ?? fallback?.department,
    jobTitle: d.jobTitle ?? fallback?.jobTitle,
    functionArea: d.functionArea ?? fallback?.functionArea,
    invitedBy: d.invitedBy ?? fallback?.invitedBy ?? 'Provider Admin',
    invitedAt: d.invitedAt ?? fallback?.invitedAt ?? '',
    status: d.status ?? fallback?.status ?? 'APPROVED',
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

function defaultCaps(from?: ProviderUserIntakeData['capabilities'] | null) {
  return Object.fromEntries(
    PROVIDER_USER_CAPABILITIES.map((c) => [c.key, from?.[c.key as keyof typeof from] ?? c.allowed]),
  ) as Record<string, boolean>;
}

function fromIntake(data?: ProviderUserIntakeData | null, invite?: InvitedUser | null, providerName?: string) {
  return {
    fullName: data?.full_name || invite?.fullName || '',
    email: data?.contact_email || invite?.email || '',
    orgName: data?.org_name || invite?.companyName || providerName || '',
    department: data?.department || invite?.department || 'AI Practice',
    jobTitle: data?.job_title || invite?.jobTitle || '',
    functionArea: data?.function_area || invite?.functionArea || 'AI Practice Leadership',
    portfolioScope: data?.portfolio_scope || 'all_tenants',
    contribution: data?.contribution || (
      invite
        ? `Platform oversight for ${invite.fullName} — monitor tenant portfolio health, LLM Kit progress, and OPTIMA savings.`
        : 'Contribute platform-wide visibility across tenants, LLM Kit progress, OPTIMA, health, and audit.'
    ),
    notes: data?.provider_notes || invite?.providerNotes || '',
    caps: defaultCaps(data?.capabilities),
  };
}

export default function RegisterProviderUserModal({
  open,
  invite,
  mode,
  actor = 'provider',
  providerName,
  providerId,
  onClose,
  onDone,
}: {
  open: boolean;
  invite: InvitedUser | null;
  mode: ProviderUserModalMode;
  actor?: ProviderUserModalActor;
  providerName?: string;
  providerId?: string;
  onClose: () => void;
  onDone: (updated: InvitedUser, msg: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [department, setDepartment] = useState('AI Practice');
  const [jobTitle, setJobTitle] = useState('');
  const [functionArea, setFunctionArea] = useState('AI Practice Leadership');
  const [portfolioScope, setPortfolioScope] = useState('all_tenants');
  const [contribution, setContribution] = useState('');
  const [notes, setNotes] = useState('');
  const [caps, setCaps] = useState<Record<string, boolean>>({});
  const [approvedCaps, setApprovedCaps] = useState<Record<string, boolean>>({});
  const [requestNote, setRequestNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isProviderUser = actor === 'provider_user';
  const adminCanEditCaps = actor === 'provider' && (mode === 'register' || mode === 'edit');
  const identityReadOnly = mode === 'view' || mode === 'review' || isProviderUser;
  const showPending = Boolean(
    (mode === 'review' || (isProviderUser && mode === 'view'))
    && invite?.pendingIntakeData
    && (invite.hasPendingReview || invite.status === 'PENDING'),
  );

  const pendingRequests = useMemo(() => {
    const pending = invite?.pendingIntakeData as ProviderUserIntakeData | undefined;
    return pending?.capability_requests || [];
  }, [invite?.pendingIntakeData]);

  useEffect(() => {
    if (!open) return;
    const approved = (invite?.intakeData as ProviderUserIntakeData | undefined) || null;
    const pending = (invite?.pendingIntakeData as ProviderUserIntakeData | undefined) || null;
    const source = (mode === 'review' || (showPending && mode === 'view')) && pending
      ? pending
      : approved;
    const v = fromIntake(source, invite, providerName);
    const approvedMap = defaultCaps(approved?.capabilities);
    setFullName(v.fullName);
    setEmail(v.email);
    setOrgName(v.orgName || providerName || '');
    setDepartment(v.department);
    setJobTitle(v.jobTitle);
    setFunctionArea(v.functionArea);
    setPortfolioScope(v.portfolioScope);
    setContribution(v.contribution);
    setNotes(v.notes || '');
    setCaps(isProviderUser ? { ...approvedMap } : v.caps);
    setApprovedCaps(approvedMap);
    setRequestNote('');
    setError(null);
  }, [open, invite, providerName, mode, isProviderUser, showPending]);

  const pendingDiffs = useMemo(() => {
    const changes: { key: string; action: 'add' | 'exclude'; label: string }[] = [];
    for (const c of PROVIDER_USER_CAPABILITIES) {
      const before = Boolean(approvedCaps[c.key]);
      const after = Boolean(caps[c.key]);
      if (before === after) continue;
      changes.push({
        key: c.key,
        action: after ? 'add' : 'exclude',
        label: c.label,
      });
    }
    return changes;
  }, [caps, approvedCaps]);

  if (!open) return null;

  const title =
    mode === 'register' ? 'Register Provider User'
      : mode === 'edit' ? 'Edit Provider User registration'
        : mode === 'review' ? 'Review capability request'
          : isProviderUser ? 'My Provider User access'
            : 'Provider User registration';

  const buildPayload = () => ({
    full_name: fullName.trim(),
    org_name: orgName.trim(),
    contact_email: email.trim().toLowerCase(),
    department,
    job_title: jobTitle.trim(),
    function_area: functionArea,
    portfolio_scope: portfolioScope,
    contribution: contribution.trim(),
    capabilities: { ...caps },
    provider_notes: notes.trim(),
    actor: 'provider',
  });

  const toggleCap = (key: string) => {
    if (!adminCanEditCaps) return;
    setCaps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const requestAdd = (key: string) => {
    setCaps((prev) => ({ ...prev, [key]: true }));
  };

  const requestExclude = (key: string) => {
    setCaps((prev) => ({ ...prev, [key]: false }));
  };

  const handleSave = async () => {
    if (!invite?.inviteId) {
      setError('Invite a Provider User first from Invite User, then register that invitation.');
      return;
    }
    if (!fullName.trim() || !email.trim()) {
      setError('Full name and work email are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid work email (e.g. name@company.com).');
      return;
    }
    if (!department) {
      setError('Department is required.');
      return;
    }
    if (!jobTitle.trim()) {
      setError('Job title is required.');
      return;
    }

    setLoading(true);
    setError(null);
    const payload = buildPayload();

    try {
      const res = mode === 'register'
        ? await inviteApi.approve(invite.inviteId, payload)
        : await inviteApi.updateProviderUser(invite.inviteId, payload);
      onDone(
        mapInvite(res.data, invite),
        mode === 'register'
          ? `Provider User ${fullName.trim()} registered and APPROVED. Feature roster is in the Provider User portal.`
          : `Provider User registration updated for ${fullName.trim()}.`,
      );
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not save Provider User registration.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCapabilityRequest = async () => {
    if (!invite?.inviteId) return;
    if (pendingDiffs.length === 0) {
      setError('Change at least one capability (Request access or Request exclude) before submitting.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await inviteApi.requestCapabilities(invite.inviteId, {
        capabilities: caps,
        capability_requests: pendingDiffs,
        request_note: requestNote.trim(),
      });
      onDone(
        mapInvite(res.data, invite),
        'Capability change request sent to Provider Admin for approval. Status is PENDING until Provider Admin decides.',
      );
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not submit capability request.');
    } finally {
      setLoading(false);
    }
  };

  const handleCapabilityReview = async (decision: 'approve' | 'reject') => {
    if (!invite?.inviteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await inviteApi.reviewCapabilities(invite.inviteId, {
        decision,
        notes: notes.trim(),
      });
      onDone(
        mapInvite(res.data, invite),
        decision === 'approve'
          ? 'Capability changes approved. Provider User portal now reflects the new access.'
          : 'Capability request rejected. Previous capabilities remain in effect.',
      );
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : `Could not ${decision} capability request.`);
    } finally {
      setLoading(false);
    }
  };

  const pendingKeySet = new Set(
    (showPending ? pendingRequests : pendingDiffs).map((r) => r.key),
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 760, maxHeight: '92vh', overflow: 'auto',
        background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0',
        boxShadow: '0 24px 64px rgba(15,23,42,0.2)',
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #E2E8F0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>{title}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              {isProviderUser
                ? 'Request additional access or exclude a capability. Provider Admin must approve.'
                : mode === 'review'
                  ? 'Approve or reject the Provider User capability change request.'
                  : 'Provider Admin controls every capability (allow / deny).'}
              {invite?.inviteId ? (
                <span style={{ marginLeft: 8, fontFamily: 'monospace', color: '#0D9488', fontWeight: 600 }}>
                  {invite.inviteId}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none', background: '#F1F5F9', width: 32, height: 32,
              borderRadius: 8, cursor: 'pointer', color: '#64748B',
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {invite?.reviewMessage && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.45,
              background: invite.lastReviewDecision === 'reject' ? '#FEF2F2' : '#FFFBEB',
              border: `1px solid ${invite.lastReviewDecision === 'reject' ? '#FCA5A5' : '#FDE68A'}`,
              color: invite.lastReviewDecision === 'reject' ? '#991B1B' : '#92400E',
            }}>
              <strong>Latest note:</strong> {invite.reviewMessage}
            </div>
          )}

          {!isProviderUser && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0D9488', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Identity
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Full name *</label>
                  <input
                    style={{ ...inputStyle, background: identityReadOnly ? '#F1F5F9' : inputStyle.background }}
                    value={fullName}
                    disabled={identityReadOnly}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Work email *</label>
                  <input
                    style={{ ...inputStyle, background: identityReadOnly ? '#F1F5F9' : inputStyle.background }}
                    value={email}
                    disabled={identityReadOnly}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Company · defaults to provider</label>
                  <input style={{ ...inputStyle, background: '#F1F5F9', color: '#64748B' }} value={orgName} disabled />
                </div>
                <div>
                  <label style={labelStyle}>Department *</label>
                  <select
                    style={{ ...inputStyle, background: identityReadOnly ? '#F1F5F9' : inputStyle.background }}
                    value={department}
                    disabled={identityReadOnly}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Job title *</label>
                  <input
                    style={{ ...inputStyle, background: identityReadOnly ? '#F1F5F9' : inputStyle.background }}
                    value={jobTitle}
                    disabled={identityReadOnly}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Function area</label>
                  <select
                    style={{ ...inputStyle, background: identityReadOnly ? '#F1F5F9' : inputStyle.background }}
                    value={functionArea}
                    disabled={identityReadOnly}
                    onChange={(e) => setFunctionArea(e.target.value)}
                  >
                    {FUNCTION_AREAS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {mode !== 'review' && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0D9488', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Portfolio & contribution
                  </div>
                  <div>
                    <label style={labelStyle}>Portfolio scope</label>
                    <select
                      style={{ ...inputStyle, background: identityReadOnly ? '#F1F5F9' : inputStyle.background }}
                      value={portfolioScope}
                      disabled={identityReadOnly}
                      onChange={(e) => setPortfolioScope(e.target.value)}
                    >
                      {PORTFOLIO_SCOPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Contribution to the project</label>
                    <textarea
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', background: identityReadOnly ? '#F1F5F9' : inputStyle.background }}
                      value={contribution}
                      disabled={identityReadOnly}
                      onChange={(e) => setContribution(e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {(mode === 'register' || mode === 'edit' || mode === 'review') && actor === 'provider' && (
            <div>
              <label style={labelStyle}>
                {mode === 'review' ? 'Provider Admin decision notes' : 'Provider notes (optional)'}
              </label>
              <textarea
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={mode === 'review'
                  ? 'Notes shown to the Provider User after approve / reject'
                  : 'Internal notes for this Provider User assignment'}
              />
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#0D9488', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {adminCanEditCaps
              ? 'Capabilities (Level 3 · Provider Admin controlled)'
              : isProviderUser
                ? 'Capabilities — request add or exclude'
                : mode === 'review'
                  ? 'Requested capability changes'
                  : 'Capabilities'}
          </div>

          {showPending && pendingRequests.length > 0 && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, background: '#FEF3C7',
              border: '1px solid #FCD34D', fontSize: 12, color: '#92400E',
            }}>
              <strong>Pending request:</strong>{' '}
              {pendingRequests.map((r) => `${r.action === 'add' ? 'Add' : 'Exclude'} “${r.label || r.key}”`).join(' · ')}
            </div>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
            padding: 12, borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC',
          }}>
            {PROVIDER_USER_CAPABILITIES.map((c) => {
              const on = Boolean(caps[c.key]);
              const approvedOn = Boolean(approvedCaps[c.key]);
              const isChanged = pendingKeySet.has(c.key) || (isProviderUser && on !== approvedOn);
              const cardBg = on ? '#ECFDF5' : '#F1F5F9';
              const cardBorder = isChanged ? '#F59E0B' : (on ? '#A7F3D0' : '#E2E8F0');

              return (
                <div
                  key={c.key}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    fontSize: 12, color: '#334155',
                    padding: '8px 10px', borderRadius: 8,
                    background: isChanged ? '#FFFBEB' : cardBg,
                    border: `1px solid ${cardBorder}`,
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: adminCanEditCaps ? 'pointer' : 'default' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!adminCanEditCaps}
                      onChange={() => toggleCap(c.key)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      {c.label}
                      <span style={{
                        display: 'block', fontSize: 10, fontWeight: 700, marginTop: 2,
                        color: on ? '#047857' : '#94A3B8',
                      }}>
                        {on ? 'ALLOWED' : 'DENIED'}
                        {isChanged ? ' · CHANGE REQUESTED' : ''}
                      </span>
                    </span>
                  </label>
                  {isProviderUser && !showPending && (
                    <div style={{ display: 'flex', gap: 6, paddingLeft: 22 }}>
                      {!approvedOn ? (
                        <button
                          type="button"
                          onClick={() => requestAdd(c.key)}
                          disabled={on}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                            border: '1px solid #99F6E4', background: on ? '#CCFBF1' : '#F0FDFA',
                            color: '#0F766E', cursor: on ? 'default' : 'pointer',
                          }}
                        >
                          Request access
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => requestExclude(c.key)}
                          disabled={!on}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                            border: '1px solid #FECACA', background: !on ? '#FEE2E2' : '#FEF2F2',
                            color: '#B91C1C', cursor: !on ? 'default' : 'pointer',
                          }}
                        >
                          Request exclude
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isProviderUser && !showPending && (
            <div>
              <label style={labelStyle}>Request note (optional)</label>
              <textarea
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="Why you need this access change…"
              />
              {pendingDiffs.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#92400E' }}>
                  Pending local changes: {pendingDiffs.map((d) => `${d.action} “${d.label}”`).join(' · ')}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, background: '#FEF2F2',
              border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: 13,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid #E2E8F0',
          display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 600,
              color: '#475569', background: '#FFFFFF', border: '1px solid #E2E8F0',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            {mode === 'view' && !isProviderUser ? 'Close' : 'Cancel'}
          </button>

          {adminCanEditCaps && (
            <button
              type="button"
              disabled={loading}
              onClick={handleSave}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 18px', fontSize: 13, fontWeight: 700,
                color: '#FFFFFF', background: loading ? '#94A3B8' : '#0D9488',
                border: 'none', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              }}
            >
              <i className="ti ti-check" style={{ fontSize: 15 }} />
              {loading ? 'Saving…' : mode === 'register' ? 'Register & approve' : 'Save registration'}
            </button>
          )}

          {isProviderUser && !showPending && (
            <button
              type="button"
              disabled={loading || pendingDiffs.length === 0}
              onClick={handleSubmitCapabilityRequest}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 18px', fontSize: 13, fontWeight: 700,
                color: '#FFFFFF',
                background: loading || pendingDiffs.length === 0 ? '#94A3B8' : '#0891B2',
                border: 'none', borderRadius: 8,
                cursor: loading || pendingDiffs.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <i className="ti ti-send" style={{ fontSize: 15 }} />
              {loading ? 'Submitting…' : 'Submit request for approval'}
            </button>
          )}

          {mode === 'review' && actor === 'provider' && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleCapabilityReview('reject')}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#B91C1C',
                  background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                Reject (keep previous)
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleCapabilityReview('approve')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
                  background: loading ? '#94A3B8' : '#0D9488', border: 'none', borderRadius: 8,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                <i className="ti ti-check" />
                Approve capability request
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
