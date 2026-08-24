/**
 * Dedicated tab: view all Project Intake forms + role-scoped approve/reject.
 * Used from Provider Admin and Tenant Admin sidebars — not embedded on home portals.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { workflowApi } from '@/services/api';
import type { IntakeForm as IntakeFormType } from '@/types';
import IntakeReviewModal from '@/components/workflow/IntakeReviewModal';

function mapIntake(d: any): IntakeFormType {
  return {
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
    tenantUserId: d.tenantUserId ?? null,
    tenantUserName: d.tenantUserName ?? null,
    approvedBy: d.approvedBy,
    approvedAt: d.approvedAt,
    reviewNotes: d.reviewNotes,
    submittedAt: d.submittedAt,
    unlockToken: d.unlockToken ?? null,
    unlockTokenExpiresAt: d.unlockTokenExpiresAt ?? null,
    unlockTokenValid: Boolean(d.unlockTokenValid),
    unlockTokenConsumed: Boolean(d.unlockTokenConsumed),
  };
}

function statusMeta(status: string) {
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    pending_tenant_approval: {
      bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', label: 'Pending Tenant Admin (Step 1)',
    },
    pending_provider_approval: {
      bg: '#EDE9FE', color: '#6D28D9', border: '#DDD6FE', label: 'Pending Provider Admin (Step 2)',
    },
    queued_for_recommendation: {
      bg: '#D1FAE5', color: '#047857', border: '#A7F3D0', label: 'Approved — AI Unlocked',
    },
    rejected: {
      bg: '#FEE2E2', color: '#B91C1C', border: '#FECDD3', label: 'Rejected',
    },
  };
  return map[status] || { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0', label: status };
}

function StatusBadge({ status }: { status: string }) {
  const s = statusMeta(status);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '4px 10px', borderRadius: 999, background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

export default function ProjectIntakeFormsPortal({
  portal,
}: {
  /** Which portal opened this tab — drives which approve step is offered */
  portal: 'provider' | 'tenant';
}) {
  const { currentRole } = useAppStore();
  const [items, setItems] = useState<IntakeFormType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [reviewIntake, setReviewIntake] = useState<IntakeFormType | null>(null);
  const [viewIntake, setViewIntake] = useState<IntakeFormType | null>(null);
  const [filter, setFilter] = useState<'all' | 'actionable' | 'approved'>('all');

  const actorRole = portal === 'provider' ? 'Provider Admin' : 'Tenant Admin';
  const isProviderPortal = portal === 'provider';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await workflowApi.listIntakes();
      const mapped = (res.data?.items || []).map(mapIntake) as IntakeFormType[];
      mapped.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
      setItems(mapped);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load intake forms');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const actionableCount = items.filter((i) => (
    isProviderPortal
      ? i.status === 'pending_provider_approval'
      : i.status === 'pending_tenant_approval'
  )).length;

  const filtered = items.filter((i) => {
    if (filter === 'approved') {
      return i.status === 'queued_for_recommendation';
    }
    if (filter === 'actionable') {
      return isProviderPortal
        ? i.status === 'pending_provider_approval'
        : i.status === 'pending_tenant_approval';
    }
    return true;
  });

  const decide = async (item: IntakeFormType, decision: 'approve' | 'reject') => {
    setDecidingId(item.intakeId);
    setError(null);
    try {
      const notes = isProviderPortal
        ? (decision === 'approve'
          ? 'Approved by Provider Admin (Step 2/2) — AI Engine unlocked'
          : 'Rejected by Provider Admin')
        : (decision === 'approve'
          ? 'Approved by Tenant Admin (Step 1/2) — awaiting Provider Admin'
          : 'Rejected by Tenant Admin');
      await workflowApi.decideIntake(item.intakeId, {
        decision,
        notes,
        actor_role: actorRole,
        actor_name: actorRole,
      });
      setMessage(
        decision === 'approve'
          ? (isProviderPortal
            ? `Intake ${item.intakeId} approved — AI Engine unlocked.`
            : `Intake ${item.intakeId} approved by Tenant Admin. Provider Admin Step 2 is still required.`)
          : `Intake ${item.intakeId} rejected.`,
      );
      setTimeout(() => setMessage(null), 5000);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Decision failed');
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: isProviderPortal ? '#F5F3FF' : '#F0FDFA',
        border: `1px solid ${isProviderPortal ? '#DDD6FE' : '#99F6E4'}`,
        borderRadius: 12, padding: '14px 16px', lineHeight: 1.5,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          color: isProviderPortal ? '#6D28D9' : '#0F766E',
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        }}>
          <i className="ti ti-forms" />
          {isProviderPortal
            ? 'Provider Admin — Project Intake Forms'
            : 'Tenant Admin — Project Intake Forms'}
        </div>
        <div style={{ fontSize: 12, color: '#475569' }}>
          All generated project intake forms live here (not on the main portal page).
          Strict 2-factor flow: Tenant Admin Step 1, then Provider Admin Step 2 unlocks AI.
          Fully approved intakes stay listed for view only — they no longer pop up on every open.
        </div>
      </div>

      {message && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#ECFDF5', color: '#047857',
          fontSize: 13, fontWeight: 600, border: '1px solid #A7F3D0',
        }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', color: '#B91C1C',
          fontSize: 13, border: '1px solid #FCA5A5',
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '16px 18px',
      }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, marginBottom: 14,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Intake form roster</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              {items.length} total · {actionableCount} awaiting your step
              {currentRole ? ` · Signed in as ${currentRole}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {([
              ['all', 'All'],
              ['actionable', 'Needs my action'],
              ['approved', 'Approved'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 999,
                  cursor: 'pointer',
                  background: filter === id ? (isProviderPortal ? '#7C3AED' : '#0D9488') : '#F8FAFC',
                  color: filter === id ? '#FFFFFF' : '#475569',
                  border: `1px solid ${filter === id ? 'transparent' : '#E2E8F0'}`,
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', fontSize: 12, fontWeight: 600,
                color: '#0F766E', background: '#F0FDFA', border: '1px solid #99F6E4',
                borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              }}
            >
              <i className="ti ti-refresh" />
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Loading intake forms…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: 28, textAlign: 'center', color: '#94A3B8', fontSize: 13,
            border: '1px dashed #E2E8F0', borderRadius: 10, background: '#F8FAFC',
          }}>
            No intake forms in this view.
            {filter !== 'all' && (
              <button
                type="button"
                onClick={() => setFilter('all')}
                style={{
                  display: 'block', margin: '10px auto 0', background: 'none', border: 'none',
                  color: '#2563EB', fontWeight: 600, cursor: 'pointer', fontSize: 12,
                }}
              >
                Show all
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{
                  background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
                  color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Project</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tenant</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Details</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const canAct = isProviderPortal
                    ? item.status === 'pending_provider_approval'
                    : item.status === 'pending_tenant_approval';
                  const waitingPeer = isProviderPortal
                    ? item.status === 'pending_tenant_approval'
                    : item.status === 'pending_provider_approval';
                  const busy = decidingId === item.intakeId;
                  return (
                    <tr
                      key={item.intakeId}
                      style={{
                        borderBottom: idx === filtered.length - 1 ? 'none' : '1px solid #F1F5F9',
                      }}
                    >
                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{item.project}</div>
                        <div style={{
                          fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginTop: 2,
                        }}>
                          {item.intakeId}
                        </div>
                        {item.tenantUserName && (
                          <div style={{ fontSize: 11, color: '#0F766E', marginTop: 4, fontWeight: 600 }}>
                            Raised by Tenant_User: {item.tenantUserName}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'top', fontWeight: 600, color: '#334155' }}>
                        {item.tenantName || item.tenantId}
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'top', color: '#64748B', fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>
                          {(item.cloud || '').toUpperCase()}
                        </span>
                        {' · '}{(item.appCategory || '').toUpperCase()}
                        {' · '}{item.environment}
                        <div style={{ marginTop: 4 }}>${item.budgetCeiling}/mo · {item.compliance}</div>
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        <StatusBadge status={item.status} />
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setViewIntake(item)}
                            style={{
                              padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#1D4ED8',
                              background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7,
                              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <i className="ti ti-eye" />
                            View
                          </button>
                          {canAct && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setReviewIntake(item)}
                                style={{
                                  padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#0F172A',
                                  background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 7,
                                  cursor: busy ? 'wait' : 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}
                              >
                                <i className="ti ti-edit" />
                                Review
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void decide(item, 'approve')}
                                style={{
                                  padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#FFFFFF',
                                  background: isProviderPortal ? '#7C3AED' : '#0D9488',
                                  border: 'none', borderRadius: 7,
                                  cursor: busy ? 'wait' : 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}
                              >
                                <i className="ti ti-check" />
                                {busy
                                  ? '…'
                                  : isProviderPortal
                                    ? 'Approve → Unlock AI'
                                    : 'Approve Step 1'}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void decide(item, 'reject')}
                                style={{
                                  padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#BE123C',
                                  background: '#FFFFFF', border: '1px solid #FECDD3', borderRadius: 7,
                                  cursor: busy ? 'wait' : 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}
                              >
                                <i className="ti ti-x" />
                                Reject
                              </button>
                            </>
                          )}
                          {waitingPeer && (
                            <span style={{
                              fontSize: 11, color: '#92400E', fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 4px',
                            }}>
                              <i className="ti ti-hourglass" />
                              {isProviderPortal
                                ? 'Awaiting Tenant Admin Step 1'
                                : 'Awaiting Provider Admin Step 2'}
                            </span>
                          )}
                          {item.status === 'queued_for_recommendation' && (
                            <span style={{
                              fontSize: 11, color: '#047857', fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 4px',
                            }}>
                              <i className="ti ti-circle-check" />
                              Done — view only
                            </span>
                          )}
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

      <IntakeReviewModal
        open={Boolean(reviewIntake)}
        intake={reviewIntake}
        actorRole={actorRole}
        approvalGate={isProviderPortal ? 'provider' : 'tenant'}
        onClose={() => setReviewIntake(null)}
        onSuccess={(text) => {
          setMessage(text);
          setTimeout(() => setMessage(null), 5000);
          setReviewIntake(null);
          void load();
        }}
      />

      {viewIntake && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setViewIntake(null)}
        >
          <div
            style={{
              width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
              background: '#FFFFFF', borderRadius: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.28)', border: '1px solid #E2E8F0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '18px 22px 12px', borderBottom: '1px solid #F1F5F9',
              display: 'flex', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  View Intake Form
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B' }}>
                  Read-only · {viewIntake.intakeId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewIntake(null)}
                aria-label="Close"
                style={{
                  width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#F8FAFC', color: '#64748B', cursor: 'pointer',
                }}
              >
                <i className="ti ti-x" />
              </button>
            </div>
            <div style={{ padding: '16px 22px', display: 'grid', gap: 10 }}>
              <StatusBadge status={viewIntake.status} />
              {([
                ['Project', viewIntake.project],
                ['Tenant', viewIntake.tenantName || viewIntake.tenantId],
                ['Raised by', viewIntake.tenantUserName || viewIntake.submittedBy || '—'],
                ['Role', viewIntake.submittedByRole || '—'],
                ['Cloud', (viewIntake.cloud || '—').toString().toUpperCase()],
                ['App', (viewIntake.appCategory || '—').toString().toUpperCase()],
                ['Environment', viewIntake.environment || '—'],
                ['Compliance', viewIntake.compliance || '—'],
                ['Budget', viewIntake.budgetCeiling != null ? `$${viewIntake.budgetCeiling}/mo` : '—'],
                ['Submitted', viewIntake.submittedAt
                  ? new Date(viewIntake.submittedAt).toLocaleString()
                  : '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: '#0F172A',
                    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                    padding: '8px 12px',
                  }}>
                    {value}
                  </div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 3 }}>
                  Description
                </div>
                <div style={{
                  fontSize: 13, color: '#334155', lineHeight: 1.5,
                  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                  padding: '10px 12px', whiteSpace: 'pre-wrap',
                }}>
                  {viewIntake.description || '—'}
                </div>
              </div>
            </div>
            <div style={{
              padding: '14px 22px', borderTop: '1px solid #F1F5F9',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                type="button"
                onClick={() => setViewIntake(null)}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#FFFFFF',
                  background: '#1D4ED8', border: 'none', borderRadius: 8, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProviderProjectIntakeForms() {
  return <ProjectIntakeFormsPortal portal="provider" />;
}

export function TenantProjectIntakeForms() {
  return <ProjectIntakeFormsPortal portal="tenant" />;
}
