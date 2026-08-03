/**
 * Tenant User portal (Platform Admin) — review/approve Tenant User profiles.
 * Invite Tenant User lives only in Tenant Admin Portal.
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi } from '@/services/api';
import { canApproveTenantUsers } from '@/lib/rbac';
import type { InvitedUser } from '@/types';
import RegisterTenantUserModal from '@/components/admin/RegisterTenantUserModal';

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

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(u: InvitedUser) {
  if (u.status === 'APPROVED' || u.status === 'ACCEPTED') return 'APPROVED';
  if (u.lastReviewDecision === 'reject') return 'REJECTED';
  return 'PENDING';
}

function statusStyle(label: string) {
  if (label === 'APPROVED') return { background: '#D1FAE5', color: '#047857' };
  if (label === 'REJECTED') return { background: '#FEE2E2', color: '#B91C1C' };
  return { background: '#FEF3C7', color: '#B45309' };
}

export default function TenantUserPortal() {
  const { invitedUsers, setInvitedUsers, updateInvitedUser, currentRole } = useAppStore();
  const canApprove = canApproveTenantUsers(currentRole);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [reviewInvite, setReviewInvite] = useState<InvitedUser | null>(null);

  const tenantUsers = (invitedUsers || []).filter(
    (u) => u.role === 'TENANT_USER' && !u.archived && !u.decommissioned,
  );
  const pending = tenantUsers.filter((u) => statusLabel(u) === 'PENDING');
  const approved = tenantUsers.filter((u) => statusLabel(u) === 'APPROVED');

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await inviteApi.list();
      setInvitedUsers((res.data || []).map(mapInvite));
    } catch {
      setMessage({ type: 'error', text: 'Could not load Tenant User invitations.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setInvitedUsers]);

  const openReview = async (invite: InvitedUser) => {
    let full = invite;
    try {
      const res = await inviteApi.get(invite.inviteId);
      full = mapInvite({ ...invite, ...res.data });
    } catch { /* keep */ }
    setReviewInvite(full);
  };

  const renderTable = (rows: InvitedUser[], empty: string) => {
    if (rows.length === 0) {
      return (
        <div style={{
          background: '#FFFFFF', border: '1px dashed #E2E8F0', borderRadius: 12,
          padding: '20px 16px', fontSize: 12, color: '#94A3B8', textAlign: 'center',
        }}>
          {empty}
        </div>
      );
    }
    return (
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{
              background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
              color: '#64748B', fontSize: 11, textTransform: 'uppercase',
            }}>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Tenant User ID</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Email</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Company</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Function</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Invited by</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u, i) => {
              const label = statusLabel(u);
              const style = statusStyle(label);
              return (
                <tr key={u.inviteId} style={{
                  borderBottom: i === rows.length - 1 ? 'none' : '1px solid #F1F5F9',
                  background: label === 'PENDING' ? '#FFFBEB' : undefined,
                }}>
                  <td style={{
                    padding: '10px 14px', fontFamily: 'monospace', fontSize: 11,
                    fontWeight: 600, color: '#2563EB',
                  }}>
                    {u.inviteId}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>{u.fullName}</td>
                  <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px', color: '#475569' }}>{u.companyName || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#334155' }}>{u.functionArea || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#64748B', fontSize: 12 }}>{u.invitedBy || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#64748B', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatDate(u.invitedAt)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, ...style,
                    }}>
                      {label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {canApprove && label === 'PENDING' ? (
                      <button
                        type="button"
                        onClick={() => openReview(u)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', fontSize: 12, fontWeight: 700,
                          color: '#FFFFFF', background: '#2563EB', border: 'none',
                          borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        <i className="ti ti-shield-check" style={{ fontSize: 14 }} />
                        Review &amp; approve
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openReview(u)}
                        style={{
                          padding: '5px 10px', fontSize: 11, fontWeight: 600, color: '#1D4ED8',
                          background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8,
                          cursor: 'pointer',
                        }}
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1180 }}>
      {message && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 18, fontSize: 13,
          background: message.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          color: message.type === 'success' ? '#047857' : '#B91C1C',
          border: `1px solid ${message.type === 'success' ? '#A7F3D0' : '#FCA5A5'}`,
        }}>
          {message.text}
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 16, marginBottom: 18, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Tenant User approvals</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, maxWidth: 640, lineHeight: 1.5 }}>
            Profiles invited by <strong>Tenant Admin</strong> (from Tenant Admin Portal) stay{' '}
            <strong>PENDING</strong> here until Provider Admin approves.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            padding: '9px 14px', fontSize: 12, fontWeight: 600, color: '#475569',
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 22,
      }}>
        {[
          { label: 'Total', value: tenantUsers.length, color: '#2563EB', bg: '#DBEAFE' },
          { label: 'Pending approval', value: pending.length, color: '#B45309', bg: '#FEF3C7' },
          { label: 'Approved', value: approved.length, color: '#047857', bg: '#D1FAE5' },
        ].map((c) => (
          <div key={c.label} style={{
            background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
              {c.label}
            </div>
            <div style={{
              marginTop: 6, fontSize: 24, fontWeight: 800, color: c.color,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              {c.value}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: c.bg, color: c.color,
              }}>
                live
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-hourglass" style={{ fontSize: 14 }} />
          Awaiting Provider Admin approval
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#B45309', background: '#FEF3C7',
            padding: '2px 8px', borderRadius: 999,
          }}>
            {pending.length}
          </span>
        </div>
        {renderTable(pending, 'No Tenant User profiles awaiting Provider approval.')}
      </div>

      <div>
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-user-check" style={{ fontSize: 14 }} />
          Approved Tenant Users
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#047857', background: '#D1FAE5',
            padding: '2px 8px', borderRadius: 999,
          }}>
            {approved.length}
          </span>
        </div>
        {renderTable(approved, 'No approved Tenant Users yet.')}
      </div>

      <RegisterTenantUserModal
        open={Boolean(reviewInvite)}
        invite={reviewInvite}
        mode={canApprove && reviewInvite && statusLabel(reviewInvite) === 'PENDING' ? 'review' : 'view'}
        onClose={() => setReviewInvite(null)}
        onSaved={(updated) => {
          updateInvitedUser(updated.inviteId, updated);
          setReviewInvite(null);
          setMessage({
            type: 'success',
            text: updated.status === 'ACCEPTED' || updated.status === 'APPROVED'
              ? `Approved Tenant User ${updated.fullName}. They now appear in the approved roster.`
              : updated.lastReviewDecision === 'reject'
                ? `Rejected Tenant User profile for ${updated.fullName}.`
                : `Updated Tenant User ${updated.fullName}.`,
          });
          void refresh();
        }}
      />
    </div>
  );
}
