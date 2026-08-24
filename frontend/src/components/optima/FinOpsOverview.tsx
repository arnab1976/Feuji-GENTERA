/**
 * FinOpsOverview — OPTIMA-AI Phase 2
 * ALL data derived from Phase 1 store (intake, Stage 2 recommendation, Stage 3 approved cost).
 * Never use stale activeTenant over the intake that drove the journey.
 */
import { useAppStore, selectOptimaContext } from '@/store/appStore';

function money(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}

export default function FinOpsOverview() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);

  if (!ctx.recommendation) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 48, textAlign: 'center',
        background: '#fff', border: '2px dashed #E2E8F0', borderRadius: 12,
      }}>
        <i className="ti ti-lock" style={{ fontSize: 48, color: '#94A3B8', marginBottom: 16 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
          Phase 1 step required
        </div>
        <div style={{ fontSize: 13, color: '#64748B', maxWidth: 480, lineHeight: 1.6, marginBottom: 18 }}>
          OPTIMA-AI derives its analysis from the resources your LLM Kit provisioned.
          Complete at least <strong>Stage 2 (AI Recommendation)</strong> and
          <strong> Stage 3 (Cost Review)</strong> in Phase 1 to unlock FinOps Overview.
        </div>
        <button
          type="button"
          onClick={() => store.setPage('ai')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: '#0D9488', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <i className="ti ti-arrow-right" />
          Go to AI Recommendation (Stage 2)
        </button>
      </div>
    );
  }

  const resourceSum = ctx.resources.reduce((a, r) => a + (Number(r.monthly_cost) || 0), 0);
  const total = ctx.approvedTotal > 0 ? ctx.approvedTotal : resourceSum;
  const optPotential = Math.round(total * 0.28);
  const tenantLabel = ctx.tenantName || ctx.tenant?.orgName || 'Not registered';
  const projectLabel = ctx.projectName || ctx.intake?.project || 'Not submitted';
  const originLabel = ctx.costApproved
    ? 'Phase 1 Approved Monthly Cost (Stage 3 baseline)'
    : 'Phase 1 AI Recommendation total (approve Stage 3 for baseline)';

  return (
    <div>
      {!ctx.costApproved && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8,
          background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: 12, lineHeight: 1.45,
        }}>
          Stage 3 cost approval not found in session — showing Stage 2 recommendation totals.
          Open <strong>Cost &amp; Review</strong> and approve to lock the FinOps baseline.
        </div>
      )}

      <div style={{
        background: 'linear-gradient(135deg, #061828, #0C4A6E)',
        border: '1px solid #0EA5E9', borderRadius: 12, padding: '14px 18px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#0EA5E9',
            display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#7DD3FC' }}>
            OPTIMA-AI is analysing the LLM Kit infrastructure from your Phase 1 intake &amp; approved cost
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            ['Tenant', tenantLabel, 'ti-users'],
            ['Project', projectLabel, 'ti-folder'],
            ['Cloud', String(ctx.cloud).toUpperCase(), 'ti-cloud'],
            ['Compliance', String(ctx.compliance).toUpperCase(), 'ti-shield-check'],
          ].map(([label, val, icon]) => (
            <div key={label} style={{ background: '#0C1829', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{
                fontSize: 9.5, color: '#7DD3FC', fontWeight: 500, textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 3,
              }}>
                <i className={`ti ${icon}`} style={{ fontSize: 11, marginRight: 3 }} /> {label}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{val}</div>
            </div>
          ))}
        </div>
        {ctx.intake?.intakeId && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#7DD3FC', fontFamily: 'monospace' }}>
            Intake {ctx.intake.intakeId}
            {ctx.intake.tenantId ? ` · Tenant ${ctx.intake.tenantId}` : ''}
            {ctx.resourcePlan?.planId ? ` · Plan ${ctx.resourcePlan.planId}` : ''}
          </div>
        )}
        {!ctx.deployed && (
          <div style={{
            marginTop: 10, padding: '7px 12px', background: '#0C2D1A', borderRadius: 6,
            fontSize: 11, color: '#4ADE80',
          }}>
            Infrastructure not yet deployed. Complete Stage 5 (Execution Engine) for live resource identifiers.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          [`${money(total)}/mo`, originLabel],
          [`${money(ctx.budgetCeiling)}/mo`, 'Original Budget Ceiling (Phase 1 Intake Form)'],
          [`${money(optPotential)}/mo`, 'OPTIMA-AI Optimization Potential (28% of approved)'],
          [
            ctx.deployed ? 'Live' : 'Estimated',
            ctx.deployed ? 'Real infrastructure metrics available' : 'Deploy Phase 1 Stage 5 for live data',
          ],
        ].map(([v, l]) => (
          <div key={l} style={{
            background: 'linear-gradient(135deg, #061828, #0C4A6E)',
            border: '1px solid #0EA5E9', borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.02em' }}>{v}</div>
            <div style={{
              fontSize: 10, color: '#7DD3FC', fontWeight: 500, textTransform: 'uppercase',
              letterSpacing: '0.05em', marginTop: 2,
            }}>
              {l}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: '#fff', border: '1px solid #E2E8F0', borderLeft: '3px solid #0EA5E9',
        borderRadius: 12, overflow: 'hidden', marginBottom: 12,
      }}>
        <div style={{
          padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
            Phase 1 Provisioned Stack — {ctx.resources.length} resources
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: '#E0F2FE', color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Phase 1 derived
          </span>
        </div>
        {ctx.resources.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            No Stage 2 resources in session. Re-run AI Recommendation.
          </div>
        ) : (
          ctx.resources.map((r, i) => {
            const cost = Number(r.monthly_cost) || 0;
            return (
              <div
                key={`${r.category}-${r.resource}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  borderBottom: '1px solid #F1F5F9', fontSize: 12.5,
                  background: i % 2 === 0 ? '#F8FAFC' : '#fff',
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: '#E0F2FE', color: '#0284C7',
                }}>
                  {r.category}
                </span>
                <span style={{ flex: 1, color: '#334155' }}>{r.resource}</span>
                <span style={{ fontWeight: 600, color: '#0F172A', minWidth: 72, textAlign: 'right' }}>
                  {money(cost)}/mo
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: '#D1FAE5', color: '#059669',
                }}>
                  ↓ ~{money(Math.round(cost * 0.25))}
                </span>
              </div>
            );
          })
        )}
        {ctx.resources.length > 0 && (
          <div style={{
            padding: '10px 14px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0',
            display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ color: '#64748B' }}>Stack sum {money(resourceSum)}/mo</span>
            <span style={{ color: '#0F172A' }}>Approved baseline {money(total)}/mo</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
          type="button"
          onClick={() => store.setPage('optima-scan')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px',
            borderRadius: 8, border: 'none', background: '#0EA5E9', color: '#fff',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <i className="ti ti-scan" /> View Cost Breakdown
        </button>
      </div>
    </div>
  );
}
