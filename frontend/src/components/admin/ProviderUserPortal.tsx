/**
 * Provider User portal — registered roster + capability request / exclude.
 * Register Provider User lives only in Provider Management (Provider Admin).
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi } from '@/services/api';
import type { InvitedUser, ProviderUserIntakeData } from '@/types';
import RegisterProviderUserModal, {
  PROVIDER_USER_CAPABILITIES,
} from '@/components/admin/RegisterProviderUserModal';

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

/** Registered once intake exists (still shown while capability request is PENDING). */
function isRegistered(u: InvitedUser) {
  return Boolean(u.intakeData);
}

function statusLabel(u: InvitedUser) {
  if (u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING')) return 'PENDING';
  if (u.status === 'APPROVED' || u.status === 'ACCEPTED') return 'APPROVED';
  return u.status;
}

export default function ProviderUserPortal() {
  const { invitedUsers, setInvitedUsers, updateInvitedUser, provider, providers } = useAppStore();
  const activeProvider = provider || providers.find((p) => !p.archived && !p.deleted) || providers[0];

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeInvite, setActiveInvite] = useState<InvitedUser | null>(null);

  const providerUsers = (invitedUsers || []).filter(
    (u) => u.role === 'PROVIDER_USER' && !u.archived && !u.decommissioned && isRegistered(u),
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await inviteApi.list();
      setInvitedUsers((res.data || []).map(mapInvite));
    } catch {
      setMessage({ type: 'error', text: 'Could not load Provider User registrations.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setInvitedUsers]);

  const openAccess = async (invite: InvitedUser) => {
    let full = invite;
    try {
      const res = await inviteApi.get(invite.inviteId);
      full = mapInvite({ ...invite, ...res.data });
    } catch { /* keep */ }
    setActiveInvite(full);
  };

  const allowedCaps = PROVIDER_USER_CAPABILITIES.filter((c) => c.allowed);
  const deniedCaps = PROVIDER_USER_CAPABILITIES.filter((c) => !c.allowed);

  return (
    <div style={{ maxWidth: 1120 }}>
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
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
        gap: 14,
        marginBottom: 20,
      }}>
        <div style={{
          padding: 16, borderRadius: 12, border: '1px solid #A5F3FC',
          background: 'linear-gradient(135deg, #ECFEFF 0%, #F0FDFA 100%)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#0E7490', marginBottom: 6 }}>
            PROVIDER USER CONTRIBUTION
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
            Request capability changes · Provider Admin approves
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
            Open a registration to request additional capabilities or exclude existing ones.
            Requests go to Provider Admin and stay PENDING until Provider Admin approves or rejects.
          </p>
        </div>
        <div style={{
          padding: 16, borderRadius: 12, border: '1px solid #E2E8F0', background: '#FFFFFF',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#64748B', marginBottom: 8 }}>
            DEFAULT LEVEL 3 CAPABILITIES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {allowedCaps.slice(0, 3).map((c) => (
              <div key={c.key} style={{ fontSize: 12, color: '#047857', display: 'flex', gap: 6 }}>
                <i className="ti ti-check" style={{ marginTop: 2 }} />
                <span>{c.label}</span>
              </div>
            ))}
            {deniedCaps.slice(0, 2).map((c) => (
              <div key={c.key} style={{ fontSize: 12, color: '#94A3B8', display: 'flex', gap: 6 }}>
                <i className="ti ti-x" style={{ marginTop: 2 }} />
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Provider User registrations</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
            Feature-wise roster. Use Manage access to request add / exclude capabilities.
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', fontSize: 12, fontWeight: 600,
            color: '#0F766E', background: '#F0FDFA', border: '1px solid #99F6E4',
            borderRadius: 8, cursor: loading ? 'wait' : 'pointer', flexShrink: 0,
          }}
        >
          <i className="ti ti-refresh" style={{ fontSize: 14 }} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {providerUsers.length === 0 ? (
        <div style={{
          padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13,
          border: '1px dashed #E2E8F0', borderRadius: 10, background: '#F8FAFC',
        }}>
          No Provider User registrations yet. Provider Admin must Invite User → Provider User,
          then Register Provider User in Provider Admin.
        </div>
      ) : (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{
                background: '#F0FDFA', borderBottom: '1px solid #CCFBF1',
                color: '#0F766E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                <th style={{ padding: '11px 14px', textAlign: 'left' }}>Provider User ID</th>
                <th style={{ padding: '11px 14px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '11px 14px', textAlign: 'left' }}>Email Id</th>
                <th style={{ padding: '11px 14px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '11px 14px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '11px 14px', textAlign: 'left' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {providerUsers.map((u, i) => {
                const intake = u.intakeData as ProviderUserIntakeData | undefined;
                const label = statusLabel(u);
                const pending = label === 'PENDING';
                return (
                  <tr
                    key={u.inviteId}
                    style={{
                      borderBottom: i === providerUsers.length - 1 ? 'none' : '1px solid #F1F5F9',
                      background: pending ? '#FFFBEB' : undefined,
                    }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        type="button"
                        onClick={() => openAccess(u)}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                          color: '#0D9488', textDecoration: 'underline',
                        }}
                      >
                        {u.inviteId}
                      </button>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        {[
                          intake?.department || u.department,
                          intake?.job_title || u.jobTitle,
                        ].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>{u.fullName}</td>
                    <td style={{ padding: '12px 14px', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '12px 14px', color: '#64748B', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {formatDate(u.invitedAt)}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                        background: pending ? '#FEF3C7' : '#D1FAE5',
                        color: pending ? '#B45309' : '#047857',
                      }}>
                        {label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        type="button"
                        onClick={() => openAccess(u)}
                        style={{
                          padding: '5px 10px', fontSize: 11, fontWeight: 600, color: '#0369A1',
                          background: '#E0F2FE', border: '1px solid #BAE6FD', borderRadius: 8,
                          cursor: 'pointer',
                        }}
                      >
                        {pending ? 'View pending request' : 'Manage access'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RegisterProviderUserModal
        open={Boolean(activeInvite)}
        invite={activeInvite}
        mode="view"
        actor="provider_user"
        providerName={activeProvider?.name}
        providerId={activeProvider?.providerId}
        onClose={() => setActiveInvite(null)}
        onDone={(updated, msg) => {
          updateInvitedUser(updated.inviteId, updated);
          setMessage({ type: 'success', text: msg });
          void refresh();
        }}
      />
    </div>
  );
}
