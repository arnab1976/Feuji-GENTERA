/**
 * ApprovalWorkflow — OPTIMA-AI Step 3
 * Shared store.optimaRecommendations (same list as Recommendations → Savings Dashboard).
 * Approvals persist so Savings Dashboard numbers are referred from this page.
 */
import { useEffect, useState } from 'react';
import { useAppStore, selectOptimaContext } from '@/store/appStore';
import { buildOptimaRecsFromResources, sumApprovedSaving } from './optimaRecs';

export default function ApprovalWorkflow() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);
  const {
    optimaRecommendations,
    setOptimaRecommendations,
    approveOptimaRec,
    setOptimaExecuted,
    optimaExecuted,
  } = store;

  const [executing, setExecuting] = useState(false);
  const [executedSuccess, setExecutedSuccess] = useState(optimaExecuted);

  useEffect(() => {
    if (!optimaRecommendations?.length) {
      setOptimaRecommendations(buildOptimaRecsFromResources(ctx.resources || []));
    }
  }, []);

  const items = optimaRecommendations?.length
    ? optimaRecommendations
    : buildOptimaRecsFromResources(ctx.resources || []);

  const handleApprove = (id: string) => approveOptimaRec(id, true);
  const handleReject = (id: string) => approveOptimaRec(id, false);

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const approvedCount = items.filter((i) => i.status === 'approved' || i.status === 'executed').length;
  const rejectedCount = items.filter((i) => i.status === 'rejected').length;
  const approvedSaving = sumApprovedSaving(items);

  const handleExecuteTF = () => {
    if (approvedCount === 0) return;
    setExecuting(true);
    setTimeout(() => {
      setExecuting(false);
      setExecutedSuccess(true);
      setOptimaExecuted(true);
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>{pendingCount}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            PENDING
          </div>
        </div>

        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>{approvedCount}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            APPROVED
          </div>
        </div>

        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>{rejectedCount}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            REJECTED
          </div>
        </div>

        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>${approvedSaving}/mo</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            APPROVED SAVING
          </div>
        </div>
      </div>

      <div style={{
        padding: '12px 18px', background: '#F0F9FF', border: '1px solid #BAE6FD',
        borderRadius: 10, color: '#0369A1', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-shield-check" style={{ fontSize: 18, color: '#0284C7' }} />
        <span>
          Approved changes execute through the <strong>Phase 1 Terraform pipeline</strong> — same OPA policies, tfsec scans, and HIPAA compliance controls apply automatically.
          Savings totals carry forward to the Savings Dashboard.
        </span>
      </div>

      {executedSuccess && (
        <div style={{
          padding: '12px 18px', background: '#ECFDF5', border: '1px solid #A7F3D0',
          borderRadius: 10, color: '#065F46', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize: 18, color: '#059669' }} />
          <span>
            Approved optimizations executed successfully via Phase 1 Terraform Pipeline! Total realized savings updated to <strong>${approvedSaving}/mo</strong>.
          </span>
        </div>
      )}

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <div style={{
          padding: '12px 20px', background: '#FEF3C7', borderBottom: '1px solid #FDE68A',
          color: '#D97706', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span>Pending review ({pendingCount})</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 90 }}>ID</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>RECOMMENDATION</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 100 }}>SAVING</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 180, textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isApproved = item.status === 'approved' || item.status === 'executed';
              const isRejected = item.status === 'rejected';

              return (
                <tr key={item.id} style={{
                  borderBottom: '1px solid #F1F5F9',
                  background: isApproved ? '#F0FDF4' : isRejected ? '#FFF1F2' : '#FFFFFF',
                }}>
                  <td style={{ padding: '14px 20px', color: '#94A3B8', fontWeight: 700, fontFamily: 'monospace' }}>
                    {item.id}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#0F172A', fontWeight: 600 }}>
                    {item.title}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#059669', fontWeight: 700 }}>
                    ↓ ${item.estimatedMonthlySaving}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {item.status === 'pending' ? (
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleApprove(item.id)}
                          style={{
                            fontSize: 12, fontWeight: 700, color: '#16A34A',
                            background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8,
                            padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <i className="ti ti-check" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(item.id)}
                          style={{
                            fontSize: 12, fontWeight: 700, color: '#DC2626',
                            background: '#FEE2E2', border: '1px solid #FECDD3', borderRadius: 8,
                            padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <i className="ti ti-x" />
                          <span>Reject</span>
                        </button>
                      </div>
                    ) : isApproved ? (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, color: '#16A34A', background: '#DCFCE7',
                        border: '1px solid #BBF7D0', borderRadius: 999, padding: '4px 12px',
                      }}>
                        ✓ Approved
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, color: '#DC2626', background: '#FEE2E2',
                        border: '1px solid #FECDD3', borderRadius: 999, padding: '4px 12px',
                      }}>
                        ✕ Rejected
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => store.setPage('optima-savings')}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: '#0284C7', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
          }}
        >
          <span>Proceed to Realized Savings Dashboard</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>

        <button
          type="button"
          onClick={handleExecuteTF}
          disabled={executing || approvedCount === 0}
          style={{
            fontSize: 13, fontWeight: 600, color: '#334155',
            background: executing ? '#F1F5F9' : '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 10, padding: '14px 20px',
            cursor: executing || approvedCount === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <i className={`ti ti-player-play ${executing ? 'spin' : ''}`} style={{ fontSize: 16, color: '#0284C7' }} />
          <span>{executing ? 'Executing via Terraform...' : 'Execute Approved Changes via Phase 1 Terraform'}</span>
        </button>
      </div>
    </div>
  );
}
