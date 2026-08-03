/**
 * Tenant Management — full-width Tenant Admin roster.
 * Click Tenant ID to view saved intake. Provider can edit / review pending TA edits.
 * Invite Tenant User opens the requirement form (PENDING until Provider Admin approves).
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi } from '@/services/api';
import type { InvitedUser, Tenant } from '@/types';
import { canMutateAdmin } from '@/lib/rbac';
import RegisterTenantAdminModal, { type IntakeModalMode } from './RegisterTenantAdminModal';
import InviteTenantUserFormModal from '@/components/admin/InviteTenantUserFormModal';

function displayInviteStatus(u: InvitedUser) {
  if (u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING')) return 'PENDING';
  if (u.status === 'ACCEPTED' || u.status === 'APPROVED') return 'APPROVED';
  return u.status;
}

function statusBadge(u: InvitedUser) {
  const label = displayInviteStatus(u);
  const approved = label === 'APPROVED';
  return {
    label,
    background: approved ? '#D1FAE5' : '#FEF3C7',
    color: approved ? '#047857' : '#B45309',
  };
}

function mapInviteRow(d: any): InvitedUser {
  return {
    inviteId: d.inviteId,
    fullName: d.fullName,
    email: d.email,
    role: d.role,
    companyName: d.companyName,
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    providerId: d.providerId,
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

export default function TenantManagement() {
  const {
    provider,
    providers,
    activeTenant,
    invitedUsers,
    setInvitedUsers,
    updateInvitedUser,
    setActiveTenant,
    currentRole,
  } = useAppStore();

  const [loadingInvites, setLoadingInvites] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [modalInvite, setModalInvite] = useState<InvitedUser | null>(null);
  const [modalMode, setModalMode] = useState<IntakeModalMode>('register');
  const [inviteForAdmin, setInviteForAdmin] = useState<InvitedUser | null>(null);

  const isProviderAdmin = canMutateAdmin(currentRole);
  const currentProvider = provider
    ?? providers.find((p) => !p.archived && !p.deleted)
    ?? null;

  const tenantAdmins = invitedUsers.filter(
    (u) => u.role === 'TENANT_ADMIN' && !u.archived && !u.decommissioned,
  );

  const refreshInvites = async () => {
    setLoadingInvites(true);
    setLoadError(null);
    try {
      const res = await inviteApi.list();
      const rows = (res.data || []).map(mapInviteRow);
      setInvitedUsers(rows);

      const state = useAppStore.getState();
      for (const inv of rows) {
        if (inv.role === 'TENANT_ADMIN' && inv.companyName && inv.tenantId) {
          const exists = state.tenants.some((t) => t.tenantId === inv.tenantId);
          const isApproved = displayInviteStatus(inv) === 'APPROVED';
          if (!exists) {
            const intake = inv.intakeData;
            const t: Tenant = {
              tenantId: inv.tenantId,
              providerId: currentProvider?.providerId ?? inv.providerId ?? '',
              orgName: intake?.org_name || inv.companyName,
              contact: intake?.contact_email || inv.email,
              billing: { plan: intake?.plan || 'PROFESSIONAL', currency: 'USD' },
              cloud: { primary: (intake?.primary_cloud as 'aws' | 'azure') || 'azure' },
              compliance: (intake?.compliance as Tenant['compliance']) || 'HIPAA',
              status: isApproved ? 'ACTIVE' : 'INACTIVE',
              budgetCeiling: intake?.budget_ceiling ?? 2000,
              createdAt: inv.invitedAt?.split('T')[0] ?? new Date().toISOString().split('T')[0],
            };
            setActiveTenant(t);
          }
        }
      }
    } catch {
      setLoadError('Could not load invitations from the backend.');
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    refreshInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openModal = async (invite: InvitedUser, mode?: IntakeModalMode) => {
    let full = invite;
    try {
      const res = await inviteApi.get(invite.inviteId);
      full = mapInviteRow({ ...invite, ...res.data });
    } catch {
      full = invite;
    }
    const pending = Boolean(full.hasPendingReview || (full.pendingIntakeData && full.status === 'PENDING'));
    const resolved: IntakeModalMode = mode
      ?? (pending ? 'review' : (full.intakeData || full.pendingIntakeData ? 'view' : 'register'));
    setModalInvite(full);
    setModalMode(resolved);
  };

  const pendingReviews = tenantAdmins.filter(
    (u) => u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING'),
  );
  const decisionNotices = tenantAdmins.filter(
    (u) => u.reviewMessage && (u.lastReviewDecision === 'reject' || u.lastReviewDecision === 'approve'),
  );

  const onDone = (updated: InvitedUser, msg: string, tenantPayload?: Record<string, unknown> | null) => {
    const pending = Boolean(
      updated.hasPendingReview
      || (updated.pendingIntakeData && (updated.status === 'PENDING' || updated.status === 'APPROVED')),
    );
    updateInvitedUser(updated.inviteId, {
      ...updated,
      status: pending ? 'PENDING' : updated.status,
      hasPendingReview: pending || updated.hasPendingReview,
    });
    if (updated.tenantId) {
      const tp = tenantPayload || {};
      const intake = (updated.intakeData || {}) as Record<string, unknown>;
      const cloudPrimary = (tp.cloud as { primary?: 'aws' | 'azure' } | undefined)?.primary
        ?? (typeof intake.primary_cloud === 'string' ? intake.primary_cloud as 'aws' | 'azure' : undefined)
        ?? 'azure';
      const t: Tenant = {
        tenantId: (tp.tenantId as string) || updated.tenantId,
        providerId: (tp.providerId as string) || currentProvider?.providerId || '',
        orgName: (tp.orgName as string) || String(intake.org_name || '') || updated.companyName,
        contact: (tp.contact as string) || String(intake.contact_email || '') || updated.email,
        billing: (tp.billing as Tenant['billing']) || {
          plan: String(intake.plan || 'PROFESSIONAL'),
          currency: 'USD',
        },
        cloud: { primary: cloudPrimary },
        compliance: (tp.compliance as Tenant['compliance'])
          || (intake.compliance as Tenant['compliance'])
          || 'HIPAA',
        status: displayInviteStatus(updated) === 'APPROVED' ? 'ACTIVE' : 'INACTIVE',
        budgetCeiling: typeof tp.budgetCeiling === 'number'
          ? tp.budgetCeiling
          : (typeof intake.budget_ceiling === 'number' ? intake.budget_ceiling : 2000),
        createdAt: (tp.createdAt as string)?.split('T')[0]
          || updated.invitedAt?.split('T')[0]
          || new Date().toISOString().split('T')[0],
        archived: false,
      };
      setActiveTenant(t);
    }
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 6000);
    void refreshInvites();
  };

  return (
    <div style={{ minHeight: 420 }}>
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Tenant Admin roster</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              Registered Tenant Admins from Provider Admin. Click Tenant ID to view details.
              Use <strong>Invite Tenant User</strong> to open the requirement form for that tenant;
              submitted profiles stay <strong>PENDING</strong> until Provider Admin approves.
              Provider:{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {currentProvider?.name ?? 'none'}
              </code>
              {activeTenant ? (
                <> · Active workspace: <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{activeTenant.orgName}</code></>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={refreshInvites}
            disabled={loadingInvites}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', fontSize: 12, fontWeight: 600,
              color: '#0F766E', background: '#F0FDFA', border: '1px solid #99F6E4',
              borderRadius: 8, cursor: loadingInvites ? 'wait' : 'pointer', flexShrink: 0,
            }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 14 }} />
            {loadingInvites ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {successMsg && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, background: '#ECFDF5', color: '#047857',
            fontSize: 13, fontWeight: 600, marginBottom: 12,
          }}>
            {successMsg}
          </div>
        )}
        {pendingReviews.length > 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, background: '#FEF3C7', color: '#92400E',
            fontSize: 13, marginBottom: 12, border: '1px solid #FCD34D',
          }}>
            <strong>Pending Provider review:</strong>{' '}
            {pendingReviews.map((u) => u.companyName || u.tenantId).join(', ')}.
            Click Tenant ID or <strong>Edit</strong> to view highlighted changes. Status stays <strong>PENDING</strong> until
            you choose Reject or <strong>Approved Tenant&apos;s request with notes</strong>.
          </div>
        )}
        {decisionNotices.filter((u) => u.lastReviewDecision === 'reject').map((u) => (
          <div
            key={`rej-${u.inviteId}`}
            style={{
              padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', color: '#B91C1C',
              fontSize: 13, marginBottom: 12, border: '1px solid #FECACA', whiteSpace: 'pre-wrap',
            }}
          >
            <strong>Rejected by Provider</strong> — {u.companyName} ({u.tenantId}): {u.reviewMessage}
          </div>
        ))}
        {decisionNotices.filter((u) => u.lastReviewDecision === 'approve').map((u) => (
          <div
            key={`apr-${u.inviteId}`}
            style={{
              padding: '10px 14px', borderRadius: 8, background: '#ECFDF5', color: '#047857',
              fontSize: 13, marginBottom: 12, border: '1px solid #A7F3D0', whiteSpace: 'pre-wrap',
            }}
          >
            <strong>Approved by Provider</strong> — {u.companyName} ({u.tenantId})
            {u.reviewMessage ? `: ${u.reviewMessage}` : ''}
          </div>
        ))}
        {loadError && (
          <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>{loadError}</div>
        )}

        {tenantAdmins.length === 0 ? (
          <div style={{
            padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13,
            border: '1px dashed #E2E8F0', borderRadius: 10, background: '#F8FAFC',
          }}>
            No Tenant Admins yet. Invite a Tenant Admin from Provider Admin, then use
            Register Tenant Admin under Tenant Admin Invitations — they appear here after approval.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{
                  background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
                  color: '#64748B', fontSize: 11, textTransform: 'uppercase',
                }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tenant ID</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Company</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Admin name</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Job title</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Actions</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Invite Tenant User</th>
                </tr>
              </thead>
              <tbody>
                {tenantAdmins.map((u, i) => {
                  const badge = statusBadge(u);
                  const isApproved = badge.label === 'APPROVED';
                  const needsReview = Boolean(u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING'));
                  return (
                    <tr
                      key={u.inviteId}
                      style={{ borderBottom: i === tenantAdmins.length - 1 ? 'none' : '1px solid #F1F5F9' }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        {u.tenantId ? (
                          <button
                            type="button"
                            onClick={() => openModal(u)}
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              fontFamily: 'monospace', fontSize: 11, color: '#0284C7',
                              fontWeight: 600, textDecoration: 'underline',
                            }}
                            title="View saved registration"
                          >
                            {u.tenantId}
                          </button>
                        ) : (
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>
                        {u.companyName || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>{u.fullName}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{u.email}</td>
                      <td style={{ padding: '10px 12px', color: '#64748B' }}>{u.jobTitle || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: badge.background, color: badge.color,
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          {(isApproved || needsReview) && isProviderAdmin ? (
                            <button
                              type="button"
                              onClick={() => openModal(u, needsReview ? 'review' : 'edit')}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '7px 12px', fontSize: 12, fontWeight: 600,
                                color: '#0F766E', background: '#F0FDFA', border: '1px solid #99F6E4',
                                borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              <i className="ti ti-edit" style={{ fontSize: 14 }} />
                              Edit
                            </button>
                          ) : needsReview && !isProviderAdmin ? (
                            <span style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>Awaiting Provider</span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#94A3B8' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {isApproved ? (
                          <button
                            type="button"
                            onClick={() => setInviteForAdmin(u)}
                            title="Open Tenant User requirement form for this tenant"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 12px', fontSize: 12, fontWeight: 700,
                              color: '#FFFFFF', background: '#2563EB', border: 'none',
                              borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            <i className="ti ti-mail-forward" style={{ fontSize: 14 }} />
                            Invite Tenant User
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RegisterTenantAdminModal
        open={Boolean(modalInvite)}
        invite={modalInvite}
        mode={modalMode}
        actor={modalMode === 'review' ? 'provider' : 'tenant_admin'}
        providerName={currentProvider?.name}
        providerId={currentProvider?.providerId}
        onClose={() => setModalInvite(null)}
        onDone={onDone}
      />

      <InviteTenantUserFormModal
        open={Boolean(inviteForAdmin)}
        tenantAdmin={inviteForAdmin}
        onClose={() => setInviteForAdmin(null)}
        onSuccess={(text) => {
          setSuccessMsg(text);
          setTimeout(() => setSuccessMsg(null), 8000);
          void refreshInvites();
        }}
      />
    </div>
  );
}
