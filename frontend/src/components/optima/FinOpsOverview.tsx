/**
 * FinOpsOverview — OPTIMA-AI Phase 2
 * Overview screen. Reads tenant, intake, recommendation, and approvedTotal from Phase 1 store. Shows gate if Phase 1 not started.
 *
 * Key design principle: ALL data comes from Phase 1 store state.
 * This component NEVER has independent data — it is always derived
 * from what Phase 1 provisioned.
 *
 * Phase 1 store fields consumed:
 *   selectOptimaContext() returns:
 *     tenant        — from appStore.activeTenant (Phase 1 Tenant Management)
 *     intake        — from appStore.intakeForm    (Phase 1 Stage 1)
 *     resources     — from appStore.recommendation.resources (Phase 1 Stage 2)
 *     approvedTotal — from appStore.approvedTotal  (Phase 1 Stage 3)
 *     outputs       — from appStore.deploymentOutputs (Phase 1 Stage 5)
 *     cloud         — from intake.cloud
 *     compliance    — from intake.compliance
 *     budgetCeiling — from intake.budgetCeiling
 *     deployed      — true if deploymentOutputs is present
 */
import { useAppStore, selectOptimaContext } from '@/store/appStore';
import { optimaApiClient } from '@/services/api';

export default function FinOpsOverview() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);

  // Gate: require Phase 1 AI Recommendation at minimum
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
          <strong> Stage 3 (Cost Review)</strong> in Phase 1 to unlock FinOpsOverview.
        </div>
        <button
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

  const total = ctx.approvedTotal || ctx.resources.reduce((a, r) => a + (r.monthly_cost || 0), 0);
  const optPotential = Math.round(total * 0.28);

  return (
    <div>
      {/* Phase 1 Context Banner */}
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
            OPTIMA-AI is analysing the LLM Kit infrastructure provisioned for this tenant
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            ['Tenant',     ctx.tenant?.orgName ?? 'Not registered', 'ti-users'],
            ['Project',    ctx.intake?.project ?? 'Not submitted',  'ti-folder'],
            ['Cloud',      ctx.cloud.toUpperCase(),                 'ti-cloud'],
            ['Compliance', ctx.compliance.toUpperCase(),            'ti-shield-check'],
          ].map(([label, val, icon]) => (
            <div key={label} style={{ background: '#0C1829', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 9.5, color: '#7DD3FC', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                <i className={`ti ${icon}`} style={{ fontSize: 11, marginRight: 3 }} /> {label}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{val}</div>
            </div>
          ))}
        </div>
        {!ctx.deployed && (
          <div style={{ marginTop: 10, padding: '7px 12px', background: '#0C2D1A', borderRadius: 6, fontSize: 11, color: '#4ADE80' }}>
            Infrastructure not yet deployed. Complete Stage 5 (Execution Engine) for live resource identifiers.
          </div>
        )}
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          [`$${total}/mo`,       'Phase 1 Approved Monthly Cost (Stage 3 baseline)'],
          [`$${ctx.budgetCeiling}/mo`, 'Original Budget Ceiling (Phase 1 Intake Form)'],
          [`$${optPotential}/mo`, 'OPTIMA-AI Optimization Potential (28% of approved)'],
          [ctx.deployed ? 'Live' : 'Estimated', ctx.deployed ? 'Real infrastructure metrics available' : 'Deploy Phase 1 Stage 5 for live data'],
        ].map(([v, l]) => (
          <div key={l} style={{
            background: 'linear-gradient(135deg, #061828, #0C4A6E)',
            border: '1px solid #0EA5E9', borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.02em' }}>{v}</div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Resource list from Phase 1 */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderLeft: '3px solid #0EA5E9', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Phase 1 Provisioned Stack — {ctx.resources.length} resources</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#E0F2FE', color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Phase 1 derived</span>
        </div>
        {ctx.resources.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
            borderBottom: '1px solid #F1F5F9', fontSize: 12.5,
            background: i % 2 === 0 ? '#F8FAFC' : '#fff',
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#E0F2FE', color: '#0284C7' }}>{r.category}</span>
            <span style={{ flex: 1, color: '#334155' }}>{r.resource}</span>
            <span style={{ fontWeight: 600, color: '#0F172A', minWidth: 65, textAlign: 'right' }}>$${r.monthly_cost}/mo</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#D1FAE5', color: '#059669' }}>
              &darr; ~$${Math.round(r.monthly_cost * 0.25)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
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
