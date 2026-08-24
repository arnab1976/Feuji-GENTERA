/**
 * Tenant Admin page — layout:
 * 1) Project Intake Approval Notifications (Tenant Admin Step 1 only)
 *    After TA approves → "Approved by Tenant Admin" + go to Provider Admin portal
 * 2) Tenant Admin roster (Invite Tenant User column)
 */
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi, workflowApi } from '@/services/api';
import type { InvitedUser, Tenant } from '@/types';
import { canMutateAdmin } from '@/lib/rbac';
import RegisterTenantAdminModal, { type IntakeModalMode } from './RegisterTenantAdminModal';
import InviteTenantUserFormModal from '@/components/admin/InviteTenantUserFormModal';
import IntakeFormsWindowModal from '@/components/admin/IntakeFormsWindowModal';

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
  const [taActionableCount, setTaActionableCount] = useState(0);
  const [intakeFormsOpen, setIntakeFormsOpen] = useState(false);

  const isProviderAdmin = canMutateAdmin(currentRole);
  const currentProvider = provider
    ?? providers.find((p) => !p.archived && !p.deleted)
    ?? null;

  const tenantAdmins = invitedUsers.filter(
    (u) => u.role === 'TENANT_ADMIN' && !u.archived && !u.decommissioned,
  );

  const refreshIntakes = useCallback(async () => {
    try {
      const res = await workflowApi.listIntakes();
      const items = (res.data?.items || []) as { status?: string }[];
      setTaActionableCount(
        items.filter((q) => q.status === 'pending_tenant_approval').length,
      );
    } catch {
      setTaActionableCount(0);
    }
  }, []);

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
              cloud: { primary: (intake?.primary_cloud as 'aws' | 'azure' | 'gcp') || 'azure' },
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

  const refreshAll = async () => {
    await Promise.all([refreshInvites(), refreshIntakes()]);
  };

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tenant Admin page — Step 1 only. Unlock AI is on Provider Admin portal. */

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
      const cloudPrimary = (tp.cloud as { primary?: 'aws' | 'azure' | 'gcp' } | undefined)?.primary
        ?? (typeof intake.primary_cloud === 'string' ? intake.primary_cloud as 'aws' | 'azure' | 'gcp' : undefined)
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
    <div style={{ minHeight: 420, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {successMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#ECFDF5', color: '#047857',
          fontSize: 13, fontWeight: 600,
        }}>
          {successMsg}
        </div>
      )}
      {loadError && (
        <div style={{ fontSize: 12, color: '#B91C1C' }}>{loadError}</div>
      )}

      {/* Open TA Intake Forms — in-app window (not sidebar) */}
      <div style={{
        background: taActionableCount > 0 ? '#F0FDFA' : '#F8FAFC',
        border: `1px solid ${taActionableCount > 0 ? '#99F6E4' : '#E2E8F0'}`,
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: taActionableCount > 0 ? '#0F766E' : '#475569',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-clipboard-list" />
          {taActionableCount > 0
            ? `${taActionableCount} intake${taActionableCount === 1 ? '' : 's'} await Tenant Admin Step 1.`
            : 'View and approve project intakes in a separate window on this page.'}
        </div>
        <button
          type="button"
          onClick={() => setIntakeFormsOpen(true)}
          style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#FFFFFF',
            background: '#0D9488', border: 'none', borderRadius: 8, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <i className="ti ti-external-link" />
          Open TA Intake Forms
        </button>
      </div>

      {/* ── 2. Tenant Admin roster ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '18px 20px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14, gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Tenant Admin roster</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 1.5 }}>
              Registered Tenant Admins from Provider Admin. Click Tenant ID to view details.
              Use <strong>Invite Tenant User</strong> to open the requirement form for that tenant;
              submitted profiles stay <strong>PENDING</strong> until Provider Admin approves.
              Provider:{' '}
              <strong>{currentProvider?.name ?? 'none'}</strong>
              {activeTenant ? (
                <> · Active workspace: <strong>{activeTenant.orgName}</strong></>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
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

        {pendingReviews.length > 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, background: '#FEF3C7', color: '#92400E',
            fontSize: 13, marginBottom: 12, border: '1px solid #FCD34D',
          }}>
            <strong>Pending Provider review:</strong>{' '}
            {pendingReviews.map((u) => u.companyName || u.tenantId).join(', ')}.
            Click Tenant ID or <strong>Edit</strong> to view highlighted changes.
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

        {tenantAdmins.length === 0 ? (
          <div style={{
            padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13,
            border: '1px dashed #E2E8F0', borderRadius: 10, background: '#F8FAFC',
          }}>
            No Tenant Admins yet. Invite a Tenant Admin from Provider Admin, then register them —
            they appear here after approval.
          </div>
        ) : (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{
                  background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
                  color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Tenant ID</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Company</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Admin name</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Job title</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Actions</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Invite Tenant User</th>
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
                      <td style={{ padding: '10px 14px' }}>
                        {u.tenantId ? (
                          <button
                            type="button"
                            onClick={() => openModal(u)}
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              fontFamily: 'monospace', fontSize: 12, color: '#0284C7',
                              fontWeight: 600, textDecoration: 'underline',
                            }}
                            title="View saved registration"
                          >
                            {u.tenantId}
                          </button>
                        ) : (
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                        {u.companyName || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{u.fullName}</td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email}</td>
                      <td style={{ padding: '10px 14px', color: '#64748B' }}>{u.jobTitle || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: badge.background, color: badge.color,
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
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
                      </td>
                      <td style={{ padding: '10px 14px' }}>
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

      <IntakeFormsWindowModal
        open={intakeFormsOpen}
        portal="tenant"
        onClose={() => {
          setIntakeFormsOpen(false);
          void refreshIntakes();
        }}
      />
    </div>
  );
}
