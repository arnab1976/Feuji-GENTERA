/**
 * Tenant Admin portal — own registration + per-admin Invite Tenant User requirement form.
 * Tenant User profiles stay PENDING until Provider Admin approves.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi, workflowApi } from '@/services/api';
import type { InvitedUser, IntakeForm as IntakeFormType } from '@/types';
import RegisterTenantAdminModal, { type IntakeModalMode } from './RegisterTenantAdminModal';
import InviteTenantUserFormModal from '@/components/admin/InviteTenantUserFormModal';
import IntakeReviewModal from '@/components/workflow/IntakeReviewModal';

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
  const [pendingIntakes, setPendingIntakes] = useState<IntakeFormType[]>([]);
  const [decidingIntakeId, setDecidingIntakeId] = useState<string | null>(null);
  const [reviewModalIntake, setReviewModalIntake] = useState<IntakeFormType | null>(null);

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
      const intakeRes = await workflowApi.listIntakes({ status: 'pending_tenant_approval' });
      const items = (intakeRes.data?.items || []).map((d: any) => ({
        intakeId: d.intakeId,
        tenantId: d.tenantId,
        tenantName: d.tenantName,
        project: d.project,
        cloud: d.cloud,
        appCategory: d.appCategory,
        environment: d.environment,
        compliance: d.compliance,
        budgetCeiling: d.budgetCeiling,
        description: d.description || '',
        status: d.status,
        submittedBy: d.submittedBy,
        submittedByRole: d.submittedByRole,
        submittedAt: d.submittedAt,
      })) as IntakeFormType[];
      setPendingIntakes(items);
    } catch {
      setPendingIntakes([]);
    } finally {
      setLoading(false);
    }
  };

  const decideTenantIntake = async (intakeId: string, decision: 'approve' | 'reject') => {
    setDecidingIntakeId(intakeId);
    try {
      await workflowApi.decideIntake(intakeId, {
        decision,
        notes: decision === 'approve' ? 'Approved by Tenant Admin persona' : 'Rejected by Tenant Admin persona',
        actor_role: 'Tenant Admin',
        actor_name: 'Tenant Admin',
      });
      if (decision === 'approve') {
        setMsg(`Intake ${intakeId} approved by Tenant Admin! Forwarded to Provider Admin portal for Provider level approval.`);
      } else {
        setMsg(`Intake ${intakeId} rejected by Tenant Admin.`);
      }
      setTimeout(() => setMsg(null), 6000);
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Decision failed');
    } finally {
      setDecidingIntakeId(null);
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
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Tenant Admin portal</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              View your registration, invite Tenant Users via the requirement form, and submit edits for Provider review.
              Tenant User forms stay <strong>PENDING</strong> until Provider Admin approves.
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

        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, background: '#ECFDF5', color: '#047857',
            fontSize: 13, fontWeight: 600, marginBottom: 12,
          }}>
            {msg}
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>{error}</div>}

        {myAdmins.length === 0 ? (
          <div style={{
            padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13,
            border: '1px dashed #E2E8F0', borderRadius: 10, background: '#F8FAFC',
          }}>
            No Tenant Admin registration found yet. Ask your Provider to invite and register you first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {myAdmins.map((u) => {
              const label = statusLabel(u);
              const approved = label === 'APPROVED';
              const intake = u.intakeData;
              return (
                <div
                  key={u.inviteId}
                  style={{
                    border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px',
                    background: '#F8FAFC',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                        {(intake && 'org_name' in intake ? intake.org_name : undefined) || u.companyName}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                        Tenant ID{' '}
                        <button
                          type="button"
                          onClick={() => open(u, 'view')}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            fontFamily: 'monospace', fontSize: 11, color: '#0284C7', fontWeight: 600,
                            textDecoration: 'underline',
                          }}
                        >
                          {u.tenantId || '—'}
                        </button>
                        {' · '}{u.fullName} · {u.email}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999, height: 'fit-content',
                      background: approved ? '#D1FAE5' : '#FEF3C7',
                      color: approved ? '#047857' : '#B45309',
                    }}>
                      {label}
                    </span>
                  </div>

                  {u.reviewMessage && u.lastReviewDecision === 'reject' && (
                    <div style={{
                      marginTop: 12, padding: '10px 12px', borderRadius: 8,
                      background: '#FEF2F2', border: '1px solid #FECACA',
                      color: '#B91C1C', fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.45,
                    }}>
                      <strong>Rejected by Provider:</strong> {u.reviewMessage}
                    </div>
                  )}

                  {u.reviewMessage && u.lastReviewDecision === 'approve' && (
                    <div style={{
                      marginTop: 12, padding: '10px 12px', borderRadius: 8,
                      background: '#ECFDF5', border: '1px solid #A7F3D0',
                      color: '#047857', fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.45,
                    }}>
                      <strong>Approved by Provider:</strong> {u.reviewMessage}
                    </div>
                  )}

                  {u.pendingIntakeData && (
                    <div style={{
                      marginTop: 10, padding: '10px 12px', borderRadius: 8,
                      background: '#FFFBEB', border: '1px solid #FDE68A',
                      color: '#92400E', fontSize: 12,
                    }}>
                      Your proposed changes are waiting for Provider review
                      (org: <strong>{'org_name' in u.pendingIntakeData ? u.pendingIntakeData.org_name : '—'}</strong>).
                    </div>
                  )}

                  {/* ── Project Intake Form Approval Notifications for Tenant Admin ─────── */}
                  {pendingIntakes
                    .filter((item) => !u.tenantId || item.tenantId === u.tenantId || (u.companyName && item.tenantName?.toLowerCase().includes(u.companyName.toLowerCase())))
                    .map((item) => (
                      <div key={item.intakeId} style={{
                        marginTop: 12, padding: '14px 16px', borderRadius: 10,
                        background: '#FFFBEB', border: '1px solid #FDE68A', boxShadow: '0 4px 12px rgba(180,83,9,0.05)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="ti ti-bell-ringing" style={{ fontSize: 16 }} />
                            <span>Project Intake Approval Notification (Tenant User Submission)</span>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#B45309',
                            padding: '3px 9px', borderRadius: 999, border: '1px solid #FCD34D',
                          }}>
                            Step 1 of 2 · Tenant Approval
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                          {item.project} <span style={{ fontSize: 11, color: '#64748B', fontWeight: 400, fontFamily: 'monospace' }}>({item.intakeId})</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                          Submitted by: <strong>{item.submittedByRole || item.submittedBy || 'Tenant User'}</strong> · Cloud: <strong>{item.cloud?.toUpperCase()}</strong> · App: <strong>{item.appCategory?.toUpperCase()}</strong> · Budget: <strong>${item.budgetCeiling}/mo</strong>
                        </div>
                        {item.description && (
                          <div style={{
                            fontSize: 12, color: '#334155', marginTop: 6, fontStyle: 'italic',
                            background: '#FFFFFF', padding: '6px 10px', borderRadius: 6, border: '1px solid #FEF3C7',
                          }}>
                            "{item.description}"
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                          <button
                            type="button"
                            disabled={decidingIntakeId === item.intakeId}
                            onClick={() => decideTenantIntake(item.intakeId, 'approve')}
                            style={{
                              padding: '8px 16px', background: '#0D9488', color: '#FFFFFF', border: 'none',
                              borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(13,148,136,0.25)',
                            }}
                          >
                            <i className="ti ti-check" />
                            {decidingIntakeId === item.intakeId ? 'Processing…' : 'Approve & Forward to Provider Admin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewModalIntake(item)}
                            style={{
                              padding: '8px 14px', background: '#FFFFFF', color: '#0F172A', border: '1px solid #CBD5E1',
                              borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <i className="ti ti-edit" />
                            View / Edit Form
                          </button>
                          <button
                            type="button"
                            disabled={decidingIntakeId === item.intakeId}
                            onClick={() => decideTenantIntake(item.intakeId, 'reject')}
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

                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => open(u, 'view')}
                      style={{
                        padding: '7px 12px', fontSize: 12, fontWeight: 600,
                        color: '#334155', background: '#FFFFFF', border: '1px solid #E2E8F0',
                        borderRadius: 8, cursor: 'pointer',
                      }}
                    >
                      View details
                    </button>
                    {approved && !u.pendingIntakeData && (
                      <button
                        type="button"
                        onClick={() => open(u, 'edit')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '7px 12px', fontSize: 12, fontWeight: 700,
                          color: '#FFFFFF', background: '#0D9488', border: 'none',
                          borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        <i className="ti ti-edit" style={{ fontSize: 14 }} />
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!approved}
                      title={approved
                        ? 'Open Tenant User requirement form for this tenant'
                        : 'Tenant Admin must be APPROVED before inviting users'}
                      onClick={() => setInviteForAdmin(u)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', fontSize: 12, fontWeight: 700,
                        color: '#FFFFFF', background: approved ? '#2563EB' : '#94A3B8',
                        border: 'none', borderRadius: 8,
                        cursor: approved ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <i className="ti ti-mail-forward" style={{ fontSize: 14 }} />
                      Invite Tenant User
                    </button>
                  </div>
                </div>
              );
            })}
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
            Status stays <strong>PENDING</strong> until Provider Admin approves in Provider Admin or Tenant User.
          </div>
        </div>

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

      <IntakeReviewModal
        open={Boolean(reviewModalIntake)}
        intake={reviewModalIntake}
        actorRole="Tenant Admin"
        onClose={() => setReviewModalIntake(null)}
        onSuccess={(text) => {
          setMsg(text);
          setTimeout(() => setMsg(null), 8000);
          void refresh();
        }}
      />
    </div>
  );
}
