/**
 * Tenant Admin portal — own registration + per-admin Invite Tenant User requirement form.
 * Tenant User profiles stay PENDING until Provider Admin approves.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi, workflowApi } from '@/services/api';
import type { InvitedUser } from '@/types';
import RegisterTenantAdminModal, { type IntakeModalMode } from './RegisterTenantAdminModal';
import InviteTenantUserFormModal from '@/components/admin/InviteTenantUserFormModal';
import RegisterTenantUserModal, { type TenantUserModalMode } from '@/components/admin/RegisterTenantUserModal';
import IntakeFormsWindowModal from '@/components/admin/IntakeFormsWindowModal';

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

function statusLabel(u: InvitedUser) {
  if (u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING')) return 'PENDING';
  if (u.status === 'ACCEPTED' || u.status === 'APPROVED') return 'APPROVED';
  return u.status;
}

function tuStatus(u: InvitedUser) {
  if (u.status === 'APPROVED' || u.status === 'ACCEPTED') return 'APPROVED';
  if (u.lastReviewDecision === 'reject') return 'REJECTED';
  return 'PENDING';
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function TenantAdminPortal() {
  const { invitedUsers, setInvitedUsers, updateInvitedUser, providers, provider } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [modalInvite, setModalInvite] = useState<InvitedUser | null>(null);
  const [modalMode, setModalMode] = useState<IntakeModalMode>('view');
  const [inviteForAdmin, setInviteForAdmin] = useState<InvitedUser | null>(null);
  const [taActionableCount, setTaActionableCount] = useState(0);
  const [intakeFormsOpen, setIntakeFormsOpen] = useState(false);
  const [tuReviewInvite, setTuReviewInvite] = useState<InvitedUser | null>(null);
  const [tuReviewMode, setTuReviewMode] = useState<TenantUserModalMode>('review');

  const handleReviewTenantUser = async (inviteId: string, decision: 'approve' | 'reject', notes?: string) => {
    try {
      const res = await inviteApi.review(inviteId, {
        decision,
        review_message: notes || (decision === 'approve' ? 'Approved by Tenant Admin' : 'Rejected by Tenant Admin'),
        actor_role: 'Tenant Admin',
      });
      const d = res.data;
      updateInvitedUser(inviteId, {
        status: d?.status ?? (decision === 'approve' ? 'APPROVED' : 'REJECTED'),
        lastReviewDecision: decision,
        reviewMessage: notes || (decision === 'approve' ? 'Approved by Tenant Admin' : 'Rejected by Tenant Admin'),
        hasPendingReview: false,
      });
      setMsg(`Tenant User profile ${decision === 'approve' ? 'approved' : 'rejected'} successfully by Tenant Admin.`);
      setTimeout(() => setMsg(null), 6000);
      void refresh();
    } catch {
      setError(`Failed to ${decision} Tenant User profile.`);
    }
  };

  const currentProvider = provider ?? providers.find((p) => !p.archived && !p.deleted) ?? null;

  const myAdmins = invitedUsers.filter(
    (u) => u.role === 'TENANT_ADMIN' && !u.archived && !u.decommissioned,
  );

  const myTenantKeys = useMemo(() => {
    const ids = new Set<string>();
    const companies = new Set<string>();
    for (const a of myAdmins) {
      if (a.tenantId) ids.add(a.tenantId);
      const name = (
        (a.intakeData && 'org_name' in a.intakeData ? a.intakeData.org_name : undefined)
        || a.companyName
        || ''
      ).trim().toLowerCase();
      if (name) companies.add(name);
    }
    return { ids, companies };
  }, [myAdmins]);

  const myTenantUsers = useMemo(() => {
    return (invitedUsers || []).filter((u) => {
      if (u.role !== 'TENANT_USER' || u.archived || u.decommissioned) return false;
      if (u.tenantId && myTenantKeys.ids.has(u.tenantId)) return true;
      const company = (u.companyName || '').trim().toLowerCase();
      return company && myTenantKeys.companies.has(company);
    });
  }, [invitedUsers, myTenantKeys]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await inviteApi.list();
      setInvitedUsers((res.data || []).map(mapInviteRow));
    } catch {
      setError('Could not load Tenant Admin registrations.');
    }
    try {
      const intakeRes = await workflowApi.listIntakes();
      const items = (intakeRes.data?.items || []) as { status?: string }[];
      setTaActionableCount(
        items.filter((q) => q.status === 'pending_tenant_approval').length,
      );
    } catch {
      setTaActionableCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async (invite: InvitedUser, mode: IntakeModalMode) => {
    try {
      const res = await inviteApi.get(invite.inviteId);
      setModalInvite(mapInviteRow({ ...invite, ...res.data }));
    } catch {
      setModalInvite(invite);
    }
    setModalMode(mode);
  };

  return (
    <div style={{ minHeight: 420, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1120 }}>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#ECFDF5', color: '#047857',
          fontSize: 13, fontWeight: 600,
        }}>
          {msg}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: '#B91C1C' }}>{error}</div>}

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
            display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}
        >
          <i className="ti ti-external-link" />
          Open TA Intake Forms
        </button>
      </div>

      {/* ── 2. BOTTOM STANDALONE TENANT ADMIN ROSTER CARD WITH TABLE (MATCHES SNAPSHOT CARD 2) ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Tenant Admin roster</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 1.5 }}>
              Registered Tenant Admins from Provider Admin. Click Tenant ID to view details. Use <strong>Invite Tenant User</strong> to open the requirement form for that tenant;
              submitted profiles stay <strong>PENDING</strong> until Provider Admin approves. Provider: <strong>{currentProvider?.name || 'Feuji Software Solutions Pvt. Ltd.'}</strong> · Active workspace: <strong>{myAdmins[0]?.companyName || 'TCS'}</strong>
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
              borderRadius: 8, cursor: loading ? 'wait' : 'pointer', flexShrink: 0, height: 'fit-content',
            }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 14 }} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {myAdmins.length === 0 ? (
          <div style={{
            padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13,
            border: '1px dashed #E2E8F0', borderRadius: 10, background: '#F8FAFC',
          }}>
            No Tenant Admin registration found yet. Ask your Provider to invite and register you first.
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
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Admin Name</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Job Title</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Actions</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Invite Tenant User</th>
                </tr>
              </thead>
              <tbody>
                {myAdmins.map((u, i) => {
                  const label = statusLabel(u);
                  const approved = label === 'APPROVED';
                  const intake = u.intakeData;
                  return (
                    <tr key={u.inviteId} style={{
                      borderBottom: i === myAdmins.length - 1 ? 'none' : '1px solid #F1F5F9',
                    }}>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          type="button"
                          onClick={() => open(u, 'view')}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            fontFamily: 'monospace', fontSize: 12, color: '#0284C7', fontWeight: 600,
                            textDecoration: 'underline',
                          }}
                        >
                          {u.tenantId || 'TENANT_' + u.inviteId.slice(-8).toUpperCase()}
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                        {(intake && 'org_name' in intake ? intake.org_name : undefined) || u.companyName || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{u.fullName}</td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email}</td>
                      <td style={{ padding: '10px 14px', color: '#64748B' }}>{u.jobTitle || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: approved ? '#D1FAE5' : '#FEF3C7',
                          color: approved ? '#047857' : '#B45309',
                        }}>
                          {label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          type="button"
                          onClick={() => open(u, 'edit')}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', fontSize: 11, fontWeight: 600,
                            color: '#0F766E', background: '#F0FDFA', border: '1px solid #99F6E4',
                            borderRadius: 6, cursor: 'pointer',
                          }}
                        >
                          <i className="ti ti-edit" /> Edit
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          type="button"
                          disabled={!approved}
                          onClick={() => setInviteForAdmin(u)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', fontSize: 12, fontWeight: 700,
                            color: '#FFFFFF', background: approved ? '#2563EB' : '#94A3B8',
                            border: 'none', borderRadius: 8,
                            cursor: approved ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <i className="ti ti-mail-forward" /> Invite Tenant User
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '18px 20px',
      }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Tenant User roster</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, maxWidth: 720, lineHeight: 1.5 }}>
            Users invited via the requirement form on each Tenant Admin above.
            Tenant Admins can review and approve/reject Tenant User profiles directly below.
          </div>
        </div>

        {/* ── Tenant User Profile Approval Notifications Box for Tenant Admin ── */}
        {myTenantUsers.filter((u) => tuStatus(u) === 'PENDING' || u.hasPendingReview).length > 0 && (
          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
            padding: '16px 18px', marginBottom: 16, boxShadow: '0 4px 14px rgba(180,83,9,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#B45309', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-user-check" style={{ fontSize: 18 }} />
                <span>Tenant User Profile Approval Notifications (Tenant Admin Level Sign-Off)</span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, background: '#FEF3C7', color: '#B45309',
                padding: '4px 10px', borderRadius: 999, border: '1px solid #FCD34D',
              }}>
                {myTenantUsers.filter((u) => tuStatus(u) === 'PENDING' || u.hasPendingReview).length} Pending Approval
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myTenantUsers.filter((u) => tuStatus(u) === 'PENDING' || u.hasPendingReview).map((u) => (
                <div key={u.inviteId} style={{
                  background: '#FFFFFF', border: '1px solid #FCD34D', borderRadius: 10,
                  padding: '14px 16px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                        {u.fullName} <span style={{ fontSize: 11, color: '#64748B', fontWeight: 400, fontFamily: 'monospace' }}>({u.email})</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                        Company: <strong>{u.companyName || u.tenantName || '—'}</strong> · Job Title: <strong>{u.jobTitle || '—'}</strong> · Function: <strong>{u.functionArea || '—'}</strong> · Invited By: <strong>{u.invitedBy || 'Tenant Admin'}</strong>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                      background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D',
                    }}>
                      Pending Tenant Admin Approval
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleReviewTenantUser(u.inviteId, 'approve')}
                      style={{
                        padding: '8px 16px', background: '#0D9488', color: '#FFFFFF', border: 'none',
                        borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(13,148,136,0.25)',
                      }}
                    >
                      <i className="ti ti-check" />
                      Approve Tenant User
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTuReviewInvite(u);
                        setTuReviewMode('review');
                      }}
                      style={{
                        padding: '8px 14px', background: '#FFFFFF', color: '#0F172A', border: '1px solid #CBD5E1',
                        borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <i className="ti ti-eye" />
                      View / Review Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewTenantUser(u.inviteId, 'reject')}
                      style={{
                        padding: '8px 14px', background: '#FFFFFF', color: '#BE123C', border: '1px solid #FECDD3',
                        borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <i className="ti ti-x" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {myTenantUsers.length === 0 ? (
          <div style={{
            padding: '22px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13,
            border: '1px dashed #E2E8F0', borderRadius: 10, background: '#F8FAFC',
          }}>
            No Tenant Users yet. Use <strong>Invite Tenant User</strong> on an approved Tenant Admin card to open the requirement form.
          </div>
        ) : (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{
                  background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
                  color: '#64748B', fontSize: 11, textTransform: 'uppercase',
                }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Job / Function</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Company</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {myTenantUsers.map((u, i) => {
                  const label = tuStatus(u);
                  const intake = (u.intakeData || {}) as Record<string, unknown>;
                  return (
                    <tr key={u.inviteId} style={{
                      borderBottom: i === myTenantUsers.length - 1 ? 'none' : '1px solid #F1F5F9',
                      background: label === 'PENDING' ? '#FFFBEB' : undefined,
                    }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>{u.fullName}</td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email}</td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>
                        {u.jobTitle || String(intake.job_title || '—')}
                        {u.functionArea || intake.function_area
                          ? ` · ${u.functionArea || String(intake.function_area)}`
                          : ''}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>{u.companyName || '—'}</td>
                      <td style={{ padding: '10px 14px', color: '#64748B', fontSize: 12 }}>{formatDate(u.invitedAt)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: label === 'APPROVED' ? '#D1FAE5' : label === 'REJECTED' ? '#FEE2E2' : '#FEF3C7',
                          color: label === 'APPROVED' ? '#047857' : label === 'REJECTED' ? '#B91C1C' : '#B45309',
                        }}>
                          {label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {label === 'PENDING' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleReviewTenantUser(u.inviteId, 'approve')}
                              style={{
                                padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#FFFFFF',
                                background: '#0D9488', border: 'none', borderRadius: 6, cursor: 'pointer',
                              }}
                            >
                              <i className="ti ti-check" /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTuReviewInvite(u);
                                setTuReviewMode('review');
                              }}
                              style={{
                                padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#334155',
                                background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer',
                              }}
                            >
                              Review
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewTenantUser(u.inviteId, 'reject')}
                              style={{
                                padding: '4px 8px', fontSize: 11, fontWeight: 600, color: '#BE123C',
                                background: '#FFFFFF', border: '1px solid #FECDD3', borderRadius: 6, cursor: 'pointer',
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setTuReviewInvite(u);
                              setTuReviewMode('view');
                            }}
                            style={{
                              padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#334155',
                              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer',
                            }}
                          >
                            View profile
                          </button>
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

      <RegisterTenantUserModal
        open={Boolean(tuReviewInvite)}
        invite={tuReviewInvite}
        mode={tuReviewMode}
        onClose={() => setTuReviewInvite(null)}
        onSaved={(updated) => {
          updateInvitedUser(updated.inviteId, updated);
          setTuReviewInvite(null);
          setMsg(
            updated.status === 'ACCEPTED' || updated.status === 'APPROVED'
              ? `Approved Tenant User ${updated.fullName}.`
              : `Rejected Tenant User profile for ${updated.fullName}.`,
          );
          setTimeout(() => setMsg(null), 6000);
          void refresh();
        }}
      />

      <RegisterTenantAdminModal
        open={Boolean(modalInvite)}
        invite={modalInvite}
        mode={modalMode}
        actor="tenant_admin"
        providerName={currentProvider?.name}
        providerId={currentProvider?.providerId}
        onClose={() => setModalInvite(null)}
        onDone={(updated, message) => {
          const pending = Boolean(
            updated.hasPendingReview
            || updated.pendingIntakeData
            || updated.status === 'PENDING',
          );
          updateInvitedUser(updated.inviteId, {
            ...updated,
            status: pending ? 'PENDING' : updated.status,
            hasPendingReview: pending,
          });
          setMsg(
            pending
              ? 'Save changes sent to Provider Admin. Status is now PENDING — a Tenant cannot auto-approve; wait for Provider approval with notes.'
              : message,
          );
          setTimeout(() => setMsg(null), 7000);
          void refresh();
        }}
      />

      <InviteTenantUserFormModal
        open={Boolean(inviteForAdmin)}
        tenantAdmin={inviteForAdmin}
        onClose={() => setInviteForAdmin(null)}
        onSuccess={(text) => {
          setMsg(text);
          setTimeout(() => setMsg(null), 8000);
          void refresh();
        }}
      />

      <IntakeFormsWindowModal
        open={intakeFormsOpen}
        portal="tenant"
        onClose={() => {
          setIntakeFormsOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}
