/**
 * Tenant User profile review — Provider Admin approves/rejects requirement forms from Tenant Admin.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { inviteApi } from '@/services/api';
import type { InvitedUser } from '@/types';

export type TenantUserModalMode = 'view' | 'review';

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: '#64748B',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const fieldBox: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  color: '#0F172A',
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
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

export default function RegisterTenantUserModal({
  open,
  invite,
  mode,
  onClose,
  onSaved,
}: {
  open: boolean;
  invite: InvitedUser | null;
  mode: TenantUserModalMode;
  onClose: () => void;
  onSaved: (updated: InvitedUser) => void;
}) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invite) return;
    setNotes(invite.providerNotes || '');
    setError(null);
    setLoading(false);
  }, [open, invite]);

  if (!open || !invite) return null;

  const intake = (invite.intakeData || {}) as Record<string, unknown>;
  const str = (key: string, fallback = '') => String((intake[key] ?? fallback) || '');

  const fullName = str('full_name', invite.fullName);
  const email = str('contact_email', invite.email);
  const company = str('org_name', invite.companyName || '');
  const functionArea = str('function_area', invite.functionArea || '');
  const jobTitle = str('job_title', invite.jobTitle || '');
  const department = str('department', invite.department || '');
  const project = str('project');
  const environment = str('environment');
  const accessScope = str('access_scope');
  const primaryCloud = str('primary_cloud');
  const compliance = str('compliance');
  const description = str('description') || str('contribution');

  const approve = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await inviteApi.approve(invite.inviteId, {
        ...(invite.intakeData || {}),
        full_name: fullName,
        org_name: company,
        contact_email: email,
        function_area: functionArea,
        job_title: jobTitle,
        department,
        project,
        environment,
        access_scope: accessScope,
        primary_cloud: primaryCloud,
        compliance,
        description,
        contribution: description,
        provider_notes: notes.trim() || undefined,
        actor: 'Provider Admin',
      });
      onSaved(mapInvite({ ...invite, ...res.data }));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not approve Tenant User.');
    } finally {
      setLoading(false);
    }
  };

  const reject = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await inviteApi.review(invite.inviteId, {
        decision: 'reject',
        notes: notes.trim() || 'Rejected by Provider Admin.',
        provider_notes: notes.trim() || 'Rejected by Provider Admin.',
        actor: 'Provider Admin',
      });
      onSaved(mapInvite({ ...invite, ...res.data }));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not reject Tenant User.');
    } finally {
      setLoading(false);
    }
  };

  const rows: { label: string; value: string }[] = [
    { label: 'Full name', value: fullName },
    { label: 'Work email', value: email },
    { label: 'Tenant company', value: company },
    { label: 'Tenant ID', value: invite.tenantId || str('tenant_id') || '—' },
    { label: 'Job title', value: jobTitle || '—' },
    { label: 'Function area', value: functionArea || '—' },
    { label: 'Department / team', value: department || '—' },
    { label: 'Project / use case', value: project || '—' },
    { label: 'Environment', value: environment || '—' },
    { label: 'Access scope', value: accessScope || '—' },
    { label: 'Primary cloud', value: primaryCloud || '—' },
    { label: 'Compliance', value: compliance || '—' },
    { label: 'Tenant User ID', value: invite.inviteId },
    { label: 'Invited by', value: invite.invitedBy || str('invited_by') || 'Tenant Admin' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tenant-user-review-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'auto',
          background: '#FFFFFF', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)', border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #F1F5F9', position: 'relative' }}>
          <h2 id="tenant-user-review-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
            {mode === 'review' ? 'Review Tenant User requirement form' : 'Tenant User requirement form'}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B', lineHeight: 1.45 }}>
            Submitted by <strong>{invite.invitedBy || 'Tenant Admin'}</strong>.
            {mode === 'review'
              ? ' Approve to activate workflow access, or reject with notes.'
              : ' Read-only view of the submitted requirement form.'}
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

        <div style={{ padding: '18px 22px', display: 'grid', gap: 12 }}>
          {mode === 'review' && (
            <div style={{
              padding: '10px 12px', borderRadius: 10, background: '#FEF3C7',
              border: '1px solid #FCD34D', color: '#92400E', fontSize: 12, lineHeight: 1.45,
            }}>
              Requirement form from Tenant Admin awaiting Provider Admin approval.
            </div>
          )}

          {rows.map((row) => (
            <div key={row.label}>
              <label style={labelStyle}>{row.label}</label>
              <div style={fieldBox}>{row.value || '—'}</div>
            </div>
          ))}

          {description ? (
            <div>
              <label style={labelStyle}>Requirement description</label>
              <div style={{ ...fieldBox, whiteSpace: 'pre-wrap' }}>{description}</div>
            </div>
          ) : null}

          {(mode === 'review' || invite.providerNotes || invite.reviewMessage) && (
            <div>
              <label style={labelStyle}>Provider notes</label>
              {mode === 'review' ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional notes for Tenant Admin / Tenant User"
                  style={{ ...fieldBox, resize: 'vertical', background: '#FFFFFF' }}
                />
              ) : (
                <div style={{ ...fieldBox, whiteSpace: 'pre-wrap' }}>
                  {invite.reviewMessage || invite.providerNotes || '—'}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, background: '#FEF2F2',
              border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: 12,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid #F1F5F9',
          display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#475569',
              background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, cursor: 'pointer',
            }}
          >
            Close
          </button>
          {mode === 'review' && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => void reject()}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#B91C1C',
                  background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 999,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Working…' : 'Reject'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void approve()}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
                  background: '#2563EB', border: 'none', borderRadius: 999,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Approving…' : 'Approve Tenant User'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
