/**
 * CostBreakdown — OPTIMA-AI Step 1
 * Carried forward from FinOps Overview: same selectOptimaContext
 * (tenant / project / cloud / budget / approved Stage 3 baseline / Stage 2 resources).
 */
import { useMemo, useState } from 'react';
import { useAppStore, selectOptimaContext } from '@/store/appStore';

/** Same headline rate as FinOpsOverview */
const OPTIMA_POTENTIAL_RATE = 0.28;
/** Same per-row preview rate as FinOpsOverview stack list */
const ROW_OPT_RATE = 0.25;

const CATEGORY_BADGES: Record<string, { bg: string; color: string }> = {
  Compute: { bg: '#CCFBF1', color: '#0F766E' },
  Database: { bg: '#D1FAE5', color: '#047857' },
  'LLM Endpoint': { bg: '#DCFCE7', color: '#16A34A' },
  Networking: { bg: '#CCFBF1', color: '#0D9488' },
  'Vector Store': { bg: '#E0F2FE', color: '#0284C7' },
  Security: { bg: '#E0F2FE', color: '#0891B2' },
  Observability: { bg: '#DCFCE7', color: '#15803D' },
};

function money(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}

function rowLogic(category: string): string {
  if (category === 'Compute') return 'KEDA auto-scaling & right-sizing compute node pools during off-peak hours.';
  if (category === 'Database') return 'Auto-pause non-prod instances & dynamic vCore scaling during idle workloads.';
  if (category === 'LLM Endpoint') return 'Semantic Redis caching & prompt routing to low-cost model tiers.';
  if (category === 'Networking') return 'Egress bandwidth route optimization & ingress rule consolidation.';
  if (category === 'Security') return 'Pruning unattached key versions & secret rotation policy optimization.';
  if (category === 'Observability') return 'Log retention policy reduction from 365 to 90 days & verbose log filtering.';
  if (category === 'Vector Store') return 'Index parameter tuning & idle replica scale-down for vector workloads.';
  return 'Resource optimization derived by OPTIMA-AI heuristics (same Phase 1 stack as FinOps Overview).';
}

export default function CostBreakdown() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const provisionedItems = useMemo(() => (
    (ctx.resources || []).map((r) => {
      const cost = Number(r.monthly_cost) || 0;
      return {
        category: r.category,
        resource: r.resource,
        monthlyCost: cost,
        optPct: Math.round(ROW_OPT_RATE * 100),
        optSaving: Math.round(cost * ROW_OPT_RATE),
        logic: rowLogic(r.category),
      };
    })
  ), [ctx.resources]);

  // Gate identically to FinOps Overview — this page is a drill-down of that context
  if (!ctx.recommendation) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 48, textAlign: 'center',
        background: '#fff', border: '2px dashed #E2E8F0', borderRadius: 12,
      }}>
        <i className="ti ti-lock" style={{ fontSize: 48, color: '#94A3B8', marginBottom: 16 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
          FinOps Overview context required
        </div>
        <div style={{ fontSize: 13, color: '#64748B', maxWidth: 480, lineHeight: 1.6, marginBottom: 18 }}>
          Cost Breakdown continues from <strong>FinOps Overview</strong>, which is derived from your
          Phase 1 intake, Stage 2 recommendation, and Stage 3 approved cost. Complete those steps first.
        </div>
        <button
          type="button"
          onClick={() => store.setPage('optima-overview')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: '#0EA5E9', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <i className="ti ti-gauge" />
          Open FinOps Overview
        </button>
      </div>
    );
  }

  const resourceSum = ctx.resources.reduce((a, r) => a + (Number(r.monthly_cost) || 0), 0);
  // Exact same baseline as FinOpsOverview
  const approvedTotal = ctx.approvedTotal > 0 ? ctx.approvedTotal : resourceSum;
  const budgetCeiling = ctx.budgetCeiling;
  const optPotential = Math.round(approvedTotal * OPTIMA_POTENTIAL_RATE);
  const optPotentialPct = Math.round(OPTIMA_POTENTIAL_RATE * 100);

  const tenantName = ctx.tenantName || ctx.tenant?.orgName || 'Not registered';
  const projectName = ctx.projectName || ctx.intake?.project || 'Not submitted';
  const cloud = String(ctx.cloud || 'azure').toUpperCase();
  const compliance = String(ctx.compliance || 'HIPAA').toUpperCase();

  const originLabel = ctx.costApproved
    ? 'Phase 1 Approved Monthly Cost (Stage 3 baseline)'
    : 'Phase 1 AI Recommendation total (approve Stage 3 for baseline)';

  const rowOptSum = provisionedItems.reduce((s, item) => s + item.optSaving, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {/* Page title/desc come from MainContent — do not duplicate them here */}
      <div>
        <button
          type="button"
          onClick={() => store.setPage('optima-overview')}
          style={{
            fontSize: 12, fontWeight: 600, color: '#0284C7',
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} />
          Back to FinOps Overview
        </button>
      </div>

      {!ctx.costApproved && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: 12, lineHeight: 1.45,
        }}>
          Stage 3 cost approval not found in session — same warning as FinOps Overview.
          Showing Stage 2 recommendation totals until you approve in <strong>Cost &amp; Review</strong>.
        </div>
      )}

      <div style={{
        background: 'linear-gradient(135deg, #061828, #0C4A6E)',
        border: '1px solid #0EA5E9', borderRadius: 14, padding: '16px 20px',
        boxShadow: '0 4px 20px rgba(12,74,110,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%', background: '#0EA5E9',
            display: 'inline-block', boxShadow: '0 0 10px #0EA5E9',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#7DD3FC' }}>
            Carried from FinOps Overview — Phase 1 intake &amp; approved cost context
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            ['TENANT', tenantName, 'ti-users'],
            ['PROJECT', projectName, 'ti-folder'],
            ['CLOUD', cloud, 'ti-cloud'],
            ['COMPLIANCE', compliance, 'ti-shield-check'],
          ].map(([label, val, icon]) => (
            <div key={label} style={{ background: '#091E36', borderRadius: 8, padding: '10px 14px', border: '1px solid #1E3A5F' }}>
              <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                <i className={`ti ${icon}`} style={{ marginRight: 4 }} /> {label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{val}</div>
            </div>
          ))}
        </div>

        {ctx.intake?.intakeId && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#7DD3FC', fontFamily: 'monospace' }}>
            Intake {ctx.intake.intakeId}
            {ctx.intake.tenantId ? ` · Tenant ${ctx.intake.tenantId}` : ''}
            {ctx.resourcePlan?.planId ? ` · Plan ${ctx.resourcePlan.planId}` : ''}
          </div>
        )}
      </div>

      {/* Same 4 metric cards as FinOps Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          [`${money(approvedTotal)}/mo`, originLabel],
          [`${money(budgetCeiling)}/mo`, 'Original Budget Ceiling (Phase 1 Intake Form)'],
          [`${money(optPotential)}/mo`, `OPTIMA-AI Optimization Potential (${optPotentialPct}% of approved)`],
          [
            ctx.deployed ? 'Live' : 'Estimated',
            ctx.deployed ? 'Real infrastructure metrics available' : 'Deploy Phase 1 Stage 5 for live data',
          ],
        ].map(([v, l]) => (
          <div key={l} style={{
            background: 'linear-gradient(135deg, #061828, #0C4A6E)',
            border: '1px solid #0EA5E9', borderRadius: 12, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.02em' }}>{v}</div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              {l}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '14px 18px', background: '#F0FDF4', border: '1px solid #BBF7D0',
        borderRadius: 12, color: '#166534', fontSize: 13, lineHeight: 1.6,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-chart-arrows-vertical" style={{ fontSize: 18, color: '#15803D' }} />
          <span>OPTIMA-AI Optimization Logic Overview ({optPotentialPct}% from FinOps Overview)</span>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: '#15803D' }}>
          Headline potential <strong>{money(optPotential)}/mo ({optPotentialPct}%)</strong> matches FinOps Overview
          ({money(approvedTotal)}/mo × {optPotentialPct}%). Per-resource badges use the same ~{Math.round(ROW_OPT_RATE * 100)}%
          preview as the previous page (line-item sum {money(rowOptSum)}/mo). Stack sum on FinOps: {money(resourceSum)}/mo.
        </p>
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <div style={{
          padding: '14px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
            Phase 1 Provisioned Stack — {provisionedItems.length} resources
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            background: '#E0F2FE', color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            From FinOps Overview
          </span>
        </div>

        <div>
          {provisionedItems.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              No Stage 2 resources in session (same as FinOps Overview). Re-run AI Recommendation.
            </div>
          ) : provisionedItems.map((item, idx) => {
            const badge = CATEGORY_BADGES[item.category] || { bg: '#F1F5F9', color: '#475569' };
            const isExpanded = expandedIndex === idx;

            return (
              <div key={`${item.category}-${item.resource}-${idx}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <div
                  onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                    cursor: 'pointer', background: isExpanded ? '#F8FAFC' : '#FFFFFF',
                  }}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                    background: badge.bg, color: badge.color, display: 'inline-block',
                    minWidth: 95, textAlign: 'center', flexShrink: 0,
                  }}>
                    {item.category}
                  </span>

                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>
                    {item.resource}
                  </span>

                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', minWidth: 90, textAlign: 'right' }}>
                    {money(item.monthlyCost)}/mo
                  </span>

                  <span style={{
                    fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                    background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <span>↓ ~{money(item.optSaving)}</span>
                    <span style={{ fontSize: 10, opacity: 0.85 }}>({item.optPct}%)</span>
                  </span>

                  <i className={`ti ti-chevron-${isExpanded ? 'up' : 'down'}`} style={{ fontSize: 16, color: '#64748B' }} />
                </div>

                {isExpanded && (
                  <div style={{
                    padding: '12px 20px 16px 125px', background: '#F8FAFC',
                    borderTop: '1px dashed #E2E8F0', fontSize: 12.5, color: '#334155', lineHeight: 1.6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0EA5E9', marginBottom: 4 }}>
                      <i className="ti ti-bulb" style={{ fontSize: 16 }} />
                      <span>OPTIMA-AI Optimization Logic ({item.optPct}% Potential Saving):</span>
                    </div>
                    <p style={{ margin: 0, color: '#475569' }}>{item.logic}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {provisionedItems.length > 0 && (
          <div style={{
            padding: '10px 14px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0',
            display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ color: '#64748B' }}>Stack sum {money(resourceSum)}/mo</span>
            <span style={{ color: '#0F172A' }}>Approved baseline {money(approvedTotal)}/mo</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => store.setPage('optima-overview')}
          style={{
            fontSize: 13, fontWeight: 600, color: '#0369A1',
            background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '12px 20px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <i className="ti ti-arrow-left" />
          Back to FinOps Overview
        </button>
        <button
          type="button"
          onClick={() => store.setPage('optima-recs')}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: '#0EA5E9', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
          }}
        >
          <span>Proceed to AI Optimization Recommendations</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>
      </div>
    </div>
  );
}
