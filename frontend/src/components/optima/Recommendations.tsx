/**
 * Recommendations — OPTIMA-AI Step 2
 * Persists approve/reject into store.optimaRecommendations so Approval Workflow
 * and Savings Dashboard share the same decisions and savings totals.
 */
import { useEffect } from 'react';
import { useAppStore, selectOptimaContext } from '@/store/appStore';
import { buildOptimaRecsFromResources, sumApprovedSaving } from './optimaRecs';

const CATEGORY_BADGES: Record<string, { bg: string; color: string }> = {
  Compute: { bg: '#CCFBF1', color: '#0F766E' },
  Database: { bg: '#D1FAE5', color: '#047857' },
  'LLM Endpoint': { bg: '#DCFCE7', color: '#16A34A' },
  Networking: { bg: '#CCFBF1', color: '#0D9488' },
  'Vector Store': { bg: '#E0F2FE', color: '#0284C7' },
  Security: { bg: '#E0F2FE', color: '#0891B2' },
  Observability: { bg: '#DCFCE7', color: '#15803D' },
};

export default function Recommendations() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);
  const {
    optimaRecommendations,
    setOptimaRecommendations,
    approveOptimaRec,
  } = store;

  useEffect(() => {
    if (!optimaRecommendations?.length) {
      setOptimaRecommendations(buildOptimaRecsFromResources(ctx.resources || []));
    }
  }, []);

  const recs = optimaRecommendations?.length
    ? optimaRecommendations
    : buildOptimaRecsFromResources(ctx.resources || []);

  const totalCount = recs.length;
  const pendingCount = recs.filter((r) => r.status === 'pending').length;
  const approvedCount = recs.filter((r) => r.status === 'approved' || r.status === 'executed').length;
  const totalPotentialSaving = recs.reduce((sum, r) => sum + (Number(r.estimatedMonthlySaving) || 0), 0);
  const approvedSaving = sumApprovedSaving(recs);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      <div style={{
        padding: '12px 18px', background: '#F0F9FF', border: '1px solid #BAE6FD',
        borderRadius: 10, color: '#0369A1', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-info-circle" style={{ fontSize: 18, color: '#0284C7' }} />
        <span>
          Recommendations target <strong>Phase 1 provisioned resources</strong>
          {ctx.resources?.length ? ` (${ctx.resources.length} items)` : ''}.
          Approvals sync to Approval Workflow and Savings Dashboard.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          [`${totalCount} total`, 'FROM PHASE 1 RESOURCES'],
          [`${pendingCount} pending`, 'AWAITING DECISION'],
          [`${approvedCount} approved`, 'READY FOR PHASE 1 TF'],
          [`$${totalPotentialSaving}/mo`, 'TOTAL POTENTIAL SAVING'],
        ].map(([v, l]) => (
          <div key={l} style={{
            background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
            padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>{v}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              {l}
            </div>
          </div>
        ))}
      </div>

      {approvedSaving > 0 && (
        <div style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>
          Approved so far: ${approvedSaving}/mo (carries to Approval Workflow &amp; Savings)
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {recs.map((item) => {
          const badge = CATEGORY_BADGES[item.lever] || { bg: '#F1F5F9', color: '#475569' };
          const isApproved = item.status === 'approved' || item.status === 'executed';
          const isRejected = item.status === 'rejected';

          return (
            <div
              key={item.id}
              style={{
                background: '#FFFFFF',
                border: `1px solid ${isApproved ? '#BBF7D0' : isRejected ? '#FECDD3' : '#E2E8F0'}`,
                borderRadius: 14,
                padding: '16px 20px',
                boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, width: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', fontFamily: 'monospace' }}>
                      {item.id}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                      background: badge.bg, color: badge.color,
                    }}>
                      {item.lever}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                      background: item.severity === 'HIGH' ? '#FEE2E2' : item.severity === 'MED' ? '#FEF3C7' : '#E0F2FE',
                      color: item.severity === 'HIGH' ? '#DC2626' : item.severity === 'MED' ? '#D97706' : '#0284C7',
                    }}>
                      {item.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', lineHeight: 1.4 }}>
                    {item.title}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 'auto' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
                    background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0',
                    whiteSpace: 'nowrap',
                  }}>
                    ↓ ${item.estimatedMonthlySaving}/mo
                  </span>

                  {item.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => approveOptimaRec(item.id, true)}
                        style={{
                          fontSize: 12, fontWeight: 700, color: '#16A34A',
                          background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8,
                          padding: '6px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <i className="ti ti-check" />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => approveOptimaRec(item.id, false)}
                        style={{
                          fontSize: 12, fontWeight: 700, color: '#DC2626',
                          background: '#FEE2E2', border: '1px solid #FECDD3', borderRadius: 8,
                          padding: '6px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <i className="ti ti-x" />
                        <span>Reject</span>
                      </button>
                    </>
                  ) : isApproved ? (
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: '#16A34A', background: '#DCFCE7',
                      border: '1px solid #BBF7D0', borderRadius: 8, padding: '6px 14px', whiteSpace: 'nowrap',
                    }}>
                      ✓ Approved
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: '#DC2626', background: '#FEE2E2',
                      border: '1px solid #FECDD3', borderRadius: 8, padding: '6px 14px', whiteSpace: 'nowrap',
                    }}>
                      ✕ Rejected
                    </span>
                  )}
                </div>
              </div>

              <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginTop: 12, marginBottom: 10 }}>
                {item.detail}
              </p>
              <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                <strong style={{ color: '#334155' }}>Remediation:</strong> {item.actionDescription}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => store.setPage('optima-approval')}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: '#0284C7', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
          }}
        >
          <span>Proceed to Approval Workflow &amp; Execution</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>
      </div>
    </div>
  );
}
