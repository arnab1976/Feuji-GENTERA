/**
 * Shared invitation table section used by Provider Management / Provider User portal.
 */
import type { ReactNode } from 'react';
import type { InvitedUser } from '@/types';

export type InviteSectionKind = 'tenant_admin' | 'provider_user' | 'tenant_user';

const SECTION_META: Record<InviteSectionKind, { title: string; icon: string; badgeBg: string; badgeColor: string }> = {
  provider_user: {
    title: 'Provider User Information',
    icon: 'ti-user-check',
    badgeBg: '#D1FAE5',
    badgeColor: '#047857',
  },
  tenant_admin: {
    title: 'Tenant Admin Invitations',
    icon: 'ti-mail-forward',
    badgeBg: '#E0F2FE',
    badgeColor: '#0369A1',
  },
  tenant_user: {
    title: 'Pending Tenant User Approvals',
    icon: 'ti-users',
    badgeBg: '#DBEAFE',
    badgeColor: '#1D4ED8',
  },
};

function idColumn(kind: InviteSectionKind): { header: string; value: (u: InvitedUser) => string } {
  if (kind === 'provider_user') {
    return {
      header: 'Provider User ID',
      value: (u) => u.inviteId || u.providerId || '—',
    };
  }
  if (kind === 'tenant_admin') {
    return {
      header: 'Tenant ID',
      value: (u) => u.tenantId || '—',
    };
  }
  return {
    header: 'Tenant User ID',
    value: (u) => u.inviteId || '—',
  };
}

function displayStatus(u: InvitedUser, kind: InviteSectionKind) {
  if (u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING')) return 'PENDING';
  if (u.status === 'ACCEPTED' || u.status === 'APPROVED') return 'APPROVED';
  if (u.status === 'ARCHIVED' || u.status === 'DECOMMISSIONED') return 'PENDING';
  return u.status;
}

function statusStyle(label: string) {
  if (label === 'APPROVED' || label === 'ACCEPTED') {
    return { background: '#D1FAE5', color: '#047857' };
  }
  return { background: '#FEF3C7', color: '#B45309' };
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function InviteListSection({
  kind,
  rows,
  canMutate,
  actionBusy,
  onDelete,
  onDecommission,
  onReview,
  onViewTenant,
  onRegister,
  onViewProviderUser,
  onEditProviderUser,
  onApproveTenantUser,
  notificationBanner,
  emptyHint,
}: {
  kind: InviteSectionKind;
  rows: InvitedUser[];
  canMutate: boolean;
  actionBusy: string | null;
  onDelete: (inviteId: string) => void;
  onDecommission: (inviteId: string) => void;
  onReview?: (invite: InvitedUser) => void;
  onViewTenant?: (invite: InvitedUser) => void;
  /** Per-row Register after invite (Tenant Admin or Provider User) */
  onRegister?: (invite: InvitedUser) => void;
  onViewProviderUser?: (invite: InvitedUser) => void;
  onEditProviderUser?: (invite: InvitedUser) => void;
  /** Provider Admin reviews Tenant User profile invited by Tenant Admin */
  onApproveTenantUser?: (invite: InvitedUser) => void;
  notificationBanner?: ReactNode;
  emptyHint?: string;
}) {
  const meta = SECTION_META[kind];
  const idCol = idColumn(kind);
  const isProviderUser = kind === 'provider_user';
  const isTenantUser = kind === 'tenant_user';

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
        flexWrap: 'wrap',
      }}>
        <i className={`ti ${meta.icon}`} style={{ fontSize: 14 }} />
        {meta.title}
        <span style={{
          fontSize: 10, fontWeight: 700, color: meta.badgeColor, background: meta.badgeBg,
          padding: '2px 8px', borderRadius: 999,
        }}>
          {rows.length}
        </span>
        {isProviderUser && (
          <span style={{ fontSize: 11, fontWeight: 500, color: '#64748B', textTransform: 'none', letterSpacing: 0 }}>
            · invite first, then Register (Provider Admin only)
          </span>
        )}
        {isTenantUser && (
          <span style={{ fontSize: 11, fontWeight: 500, color: '#64748B', textTransform: 'none', letterSpacing: 0 }}>
            · invited by Tenant Admin · approve profile here
          </span>
        )}
      </div>

      {notificationBanner}

      {rows.length === 0 ? (
        <div style={{
          background: '#FFFFFF', border: '1px dashed #E2E8F0', borderRadius: 12,
          padding: '20px 16px', fontSize: 12, color: '#94A3B8', textAlign: 'center',
        }}>
          {emptyHint || 'No records yet.'}
        </div>
      ) : (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>{idCol.header}</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>{isProviderUser ? 'Email Id' : 'Email'}</th>
                {isProviderUser ? (
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Date</th>
                ) : (
                  <>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Company</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Role</th>
                  </>
                )}
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => {
                const label = displayStatus(u, kind);
                const style = statusStyle(label);
                const needsReview = kind === 'tenant_admin'
                  && Boolean(u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING'));
                const needsRegister = Boolean(onRegister) && !u.intakeData && !u.pendingIntakeData
                  && (kind === 'tenant_admin' || kind === 'provider_user');
                const needsCapReview = isProviderUser
                  && Boolean(u.intakeData)
                  && Boolean(u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING'))
                  && Boolean(onViewProviderUser);
                const needsTuApprove = isTenantUser
                  && Boolean(onApproveTenantUser)
                  && u.status !== 'ACCEPTED'
                  && u.status !== 'APPROVED'
                  && u.lastReviewDecision !== 'reject';
                return (
                  <tr key={u.inviteId} style={{
                    borderBottom: i === rows.length - 1 ? 'none' : '1px solid #F1F5F9',
                    background: needsReview || needsCapReview || needsTuApprove ? '#FFFBEB' : undefined,
                  }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#7C3AED' }}>
                      {kind === 'tenant_admin' && u.tenantId && onViewTenant ? (
                        <button
                          type="button"
                          onClick={() => onViewTenant(u)}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
                            color: '#0284C7', textDecoration: 'underline',
                          }}
                        >
                          {u.tenantId}
                        </button>
                      ) : isProviderUser && u.intakeData && onViewProviderUser ? (
                        <button
                          type="button"
                          onClick={() => onViewProviderUser(u)}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
                            color: '#0D9488', textDecoration: 'underline',
                          }}
                        >
                          {idCol.value(u)}
                        </button>
                      ) : (
                        idCol.value(u)
                      )}
                      {needsReview && (
                        <span style={{
                          marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#92400E',
                          background: '#FDE68A', padding: '2px 6px', borderRadius: 999,
                          verticalAlign: 'middle',
                        }}>
                          CHANGED
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>{u.fullName}</td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email}</td>
                    {isProviderUser ? (
                      <td style={{ padding: '10px 14px', color: '#64748B', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {formatDate(u.invitedAt)}
                      </td>
                    ) : (
                      <>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>{u.companyName || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#334155' }}>
                          {u.role.replace(/_/g, ' ')}
                          {u.department ? ` · ${u.department}` : ''}
                          {u.jobTitle ? ` · ${u.jobTitle}` : ''}
                          {u.functionArea ? ` · ${u.functionArea}` : ''}
                        </td>
                      </>
                    )}
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                        ...style,
                      }}>
                        {label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {needsRegister && (
                          <button
                            type="button"
                            disabled={!canMutate || actionBusy === u.inviteId}
                            onClick={() => onRegister?.(u)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 14px', fontSize: 12, fontWeight: 700,
                              color: '#FFFFFF', background: canMutate ? '#0D9488' : '#94A3B8',
                              border: 'none', borderRadius: 999,
                              cursor: canMutate ? 'pointer' : 'not-allowed',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <i className="ti ti-user-plus" style={{ fontSize: 14 }} />
                            {kind === 'provider_user' ? 'Register Provider User' : 'Register Tenant Admin'}
                          </button>
                        )}
                        {needsTuApprove && (
                          <button
                            type="button"
                            disabled={!canMutate || actionBusy === u.inviteId}
                            onClick={() => onApproveTenantUser?.(u)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 14px', fontSize: 12, fontWeight: 700,
                              color: '#FFFFFF', background: canMutate ? '#2563EB' : '#94A3B8',
                              border: 'none', borderRadius: 999,
                              cursor: canMutate ? 'pointer' : 'not-allowed',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <i className="ti ti-shield-check" style={{ fontSize: 14 }} />
                            Approve Tenant User
                          </button>
                        )}
                        {needsCapReview && (
                          <button
                            type="button"
                            disabled={!canMutate}
                            onClick={() => onViewProviderUser?.(u)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 14px', fontSize: 12, fontWeight: 700,
                              color: '#FFFFFF', background: canMutate ? '#0891B2' : '#94A3B8',
                              border: 'none', borderRadius: 999,
                              cursor: canMutate ? 'pointer' : 'not-allowed',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <i className="ti ti-shield-check" style={{ fontSize: 14 }} />
                            Review capabilities
                          </button>
                        )}
                        {isProviderUser && u.intakeData && !needsCapReview && onViewProviderUser && (
                          <button
                            type="button"
                            onClick={() => onViewProviderUser(u)}
                            style={{
                              padding: '5px 10px', fontSize: 11, fontWeight: 600, color: '#0F766E',
                              background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 8,
                              cursor: 'pointer',
                            }}
                          >
                            View
                          </button>
                        )}
                        {isProviderUser && u.intakeData && onEditProviderUser && canMutate && (
                          <button
                            type="button"
                            onClick={() => onEditProviderUser(u)}
                            style={{
                              padding: '5px 10px', fontSize: 11, fontWeight: 600, color: '#0369A1',
                              background: '#E0F2FE', border: '1px solid #BAE6FD', borderRadius: 8,
                              cursor: 'pointer',
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!canMutate || actionBusy === u.inviteId}
                          onClick={() => onDelete(u.inviteId)}
                          title="Delete — move to Archive"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', fontSize: 11, fontWeight: 600,
                            color: canMutate ? '#B91C1C' : '#94A3B8',
                            background: '#FEF2F2', border: '1px solid #FECACA',
                            borderRadius: 8, cursor: canMutate ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <i className="ti ti-trash" style={{ fontSize: 13 }} />
                          Delete
                        </button>
                        <button
                          type="button"
                          disabled={!canMutate || actionBusy === u.inviteId}
                          onClick={() => onDecommission(u.inviteId)}
                          title="Decommission — archive as decommissioned"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', fontSize: 11, fontWeight: 600,
                            color: canMutate ? '#92400E' : '#94A3B8',
                            background: '#FFFBEB', border: '1px solid #FDE68A',
                            borderRadius: 8, cursor: canMutate ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <i className="ti ti-player-pause" style={{ fontSize: 13 }} />
                          Decommission
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
