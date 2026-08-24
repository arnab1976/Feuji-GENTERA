/**
 * SavingsDashboard — OPTIMA-AI Step 4
 * Continues from Approval Workflow: Phase 1 Stage 3 baseline + approved OPTIMA savings
 * from store.optimaRecommendations (same list as Recommendations → Approval).
 * Page title/desc come from MainContent — do not duplicate here.
 */
import { useEffect } from 'react';
import { useAppStore, selectOptimaContext } from '@/store/appStore';
import { buildOptimaRecsFromResources, sumApprovedSaving } from './optimaRecs';

function money(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}

export default function SavingsDashboard() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);
  const {
    optimaRecommendations,
    setOptimaRecommendations,
    optimaExecuted,
  } = store;

  // Ensure shared rec list exists (same seed path as Approval / Recommendations)
  useEffect(() => {
    if (!optimaRecommendations?.length) {
      setOptimaRecommendations(buildOptimaRecsFromResources(ctx.resources || []));
    }
  }, []);

  const recs = optimaRecommendations?.length
    ? optimaRecommendations
    : buildOptimaRecsFromResources(ctx.resources || []);

  const resourceSum = (ctx.resources || []).reduce((a, r) => a + (Number(r.monthly_cost) || 0), 0);
  const approvedTotal = ctx.approvedTotal > 0 ? ctx.approvedTotal : resourceSum;
  const budgetCeiling = ctx.budgetCeiling || 0;
  const approvedSaving = sumApprovedSaving(recs);
  const optimisedCost = Math.max(0, approvedTotal - approvedSaving);
  const headroom = Math.max(0, budgetCeiling - approvedTotal);
  const sixMonthTotal = approvedSaving * 6;
  const approvedCount = recs.filter((r) => r.status === 'approved' || r.status === 'executed').length;
  const pendingCount = recs.filter((r) => r.status === 'pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      <div>
        <button
          type="button"
          onClick={() => store.setPage('optima-approval')}
          style={{
            fontSize: 12, fontWeight: 600, color: '#0284C7',
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} />
          Back to Approval Workflow
        </button>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 8, lineHeight: 1.5 }}>
          Figures carried from <strong>Approval Workflow</strong> (
          {approvedCount} approved{pendingCount ? `, ${pendingCount} pending` : ''}
          ) against Phase 1 Stage 3 baseline {money(approvedTotal)}/mo
          {ctx.tenantName ? ` · ${ctx.tenantName}` : ''}
          {ctx.projectName ? ` · ${ctx.projectName}` : ''}.
        </p>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, #061828, #0C4A6E)',
        border: '1px solid #0EA5E9', borderRadius: 14, padding: '18px 20px',
        boxShadow: '0 4px 20px rgba(12,74,110,0.25)',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#7DD3FC', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 14,
        }}>
          SAVINGS VS PHASE 1 STAGE 3 APPROVED COST BASELINE
          {optimaExecuted ? ' · EXECUTED' : ''}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div style={{ background: '#091E36', borderRadius: 10, padding: '12px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0EA5E9' }}>{money(approvedTotal)}/mo</div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              Phase 1 Baseline
            </div>
          </div>

          <div style={{ background: '#091E36', borderRadius: 10, padding: '12px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: approvedSaving > 0 ? '#34D399' : '#0EA5E9' }}>
              {money(approvedSaving)}/mo
            </div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              Approved Saving
            </div>
          </div>

          <div style={{ background: '#091E36', borderRadius: 10, padding: '12px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0EA5E9' }}>{money(optimisedCost)}/mo</div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              Optimised Cost Target
            </div>
          </div>

          <div style={{ background: '#091E36', borderRadius: 10, padding: '12px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#34D399' }}>
              {money(headroom)} headroom
            </div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              vs Budget Ceiling
            </div>
          </div>
        </div>
      </div>

      {approvedSaving === 0 ? (
        <div style={{
          padding: '12px 18px', background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 10, color: '#D97706', fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 18, color: '#D97706' }} />
          <span>
            No recommendations approved yet. Approve items in <strong>Approval Workflow</strong> to start tracking savings on this dashboard.
          </span>
        </div>
      ) : (
        <div style={{
          padding: '12px 18px', background: '#ECFDF5', border: '1px solid #A7F3D0',
          borderRadius: 10, color: '#065F46', fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize: 18, color: '#059669' }} />
          <span>
            Carried from Approval Workflow — monthly savings of <strong>{money(approvedSaving)}/mo</strong>
            {' '}({money(sixMonthTotal)} projected over 6 months) across {approvedCount} approved recommendation{approvedCount === 1 ? '' : 's'}.
          </span>
        </div>
      )}

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderLeft: '4px solid #0EA5E9',
        borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: '#F0F9FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284C7',
            }}>
              <i className="ti ti-trending-down" style={{ fontSize: 18 }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
              6-month saving projection
            </span>
          </div>

          <span style={{
            fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
            background: approvedSaving > 0 ? '#DCFCE7' : '#FEF3C7',
            color: approvedSaving > 0 ? '#16A34A' : '#D97706',
            border: `1px solid ${approvedSaving > 0 ? '#BBF7D0' : '#FDE68A'}`,
          }}>
            {approvedSaving > 0 ? 'From Approval Workflow' : 'Approve in Approval Workflow to track'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '20px 20px 10px 20px', height: 100 }}>
          {['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].map((m, idx) => (
            <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 36, height: approvedSaving > 0 ? 30 + idx * 8 : 4,
                background: approvedSaving > 0 ? '#0EA5E9' : '#CBD5E1', borderRadius: 4,
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>{m}</span>
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderTop: '1px solid #F1F5F9', paddingTop: 12, marginTop: 10, fontSize: 12, color: '#64748B',
        }}>
          <span>Month 1 post-approval</span>
          <span>6-month total: <strong style={{ color: '#0284C7', fontSize: 14 }}>{money(sixMonthTotal)}</strong></span>
        </div>
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderLeft: '4px solid #0EA5E9',
        borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: '#F0F9FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284C7',
          }}>
            <i className="ti ti-award" style={{ fontSize: 18 }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>ROI summary</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            [money(approvedTotal) + '/mo', 'Phase 1 Baseline', '#0F172A'],
            [money(optimisedCost) + '/mo', 'After OPTIMA-AI', '#0284C7'],
            [money(budgetCeiling) + '/mo', 'Budget ceiling', '#D97706'],
            [money(approvedSaving) + '/mo', 'Monthly saving', '#059669'],
            [money(sixMonthTotal), '6-month ROI', '#059669'],
          ].map(([v, l, c]) => (
            <div key={l} style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <div style={{
          padding: '14px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
            Evaluated &amp; Approved Recommendations ({recs.length})
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            background: '#D1FAE5', color: '#047857', border: '1px solid #A7F3D0',
          }}>
            FROM APPROVAL WORKFLOW
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 90 }}>ID</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>RECOMMENDATION</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 100 }}>SAVING</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 150, textAlign: 'right' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((item) => {
              const isApproved = item.status === 'approved' || item.status === 'executed';
              const isRejected = item.status === 'rejected';
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 20px', color: '#94A3B8', fontWeight: 700, fontFamily: 'monospace' }}>
                    {item.id}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#0F172A', fontWeight: 600 }}>
                    {item.title}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#059669', fontWeight: 700 }}>
                    ↓ {money(item.estimatedMonthlySaving)}/mo
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {isApproved ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                        background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0',
                      }}>
                        ✓ Approved &amp; Tracked
                      </span>
                    ) : isRejected ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                        background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECDD3',
                      }}>
                        ✕ Rejected
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                        background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A',
                      }}>
                        ⏳ Pending Approval
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => store.setPage('optima-approval')}
          style={{
            fontSize: 13, fontWeight: 700, color: '#0284C7',
            background: '#FFFFFF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '12px 20px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <i className="ti ti-arrow-left" />
          <span>Back to Approval Workflow</span>
        </button>

        <button
          type="button"
          onClick={() => store.setPage('optima-scan')}
          style={{
            fontSize: 13, fontWeight: 700, color: '#334155',
            background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 10, padding: '12px 20px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <i className="ti ti-refresh" />
          <span>Re-scan Infrastructure Telemetry</span>
        </button>
      </div>
    </div>
  );
}
