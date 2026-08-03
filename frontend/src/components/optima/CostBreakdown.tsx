/**
 * CostBreakdown — OPTIMA-AI Step 1
 * Detailed cost breakdown of every resource provisioned during Phase 1 Terraform execution.
 * Resource identifiers are derived in real-time from outputs.json & Stage 5 Jump Box execution.
 */
import { useMemo, useState } from 'react';
import { useAppStore, selectOptimaContext } from '@/store/appStore';

const CATEGORY_BADGES: Record<string, { bg: string; color: string }> = {
  'Compute':       { bg: '#CCFBF1', color: '#0F766E' },
  'Database':      { bg: '#D1FAE5', color: '#047857' },
  'LLM Endpoint':  { bg: '#DCFCE7', color: '#16A34A' },
  'Networking':    { bg: '#CCFBF1', color: '#0D9488' },
  'Vector Store':  { bg: '#E0F2FE', color: '#0284C7' },
  'Security':      { bg: '#E0F2FE', color: '#0891B2' },
  'Observability': { bg: '#DCFCE7', color: '#15803D' },
};

interface ProvisionItem {
  category: string;
  resource: string;
  monthlyCost: number;
  optPct: number;
  optSaving: number;
  logic: string;
}

const DEFAULT_AZURE_RESOURCES: ProvisionItem[] = [
  {
    category: 'Compute',
    resource: 'Azure AKS (Standard_D4s_v3, 2–6 nodes auto-scale)',
    monthlyCost: 148,
    optPct: 25,
    optSaving: 37,
    logic: 'KEDA auto-scaling node pool right-sizing & Spot VM instance utilization during off-peak traffic hours.',
  },
  {
    category: 'Database',
    resource: 'PostgreSQL Flexible Server + pgvector extension',
    monthlyCost: 225,
    optPct: 25,
    optSaving: 56,
    logic: 'Dynamic vCore scaling & automated compute auto-pause for staging/dev instances during non-business hours.',
  },
  {
    category: 'LLM Endpoint',
    resource: 'Azure OpenAI GPT-4o — East US 2 (private endpoint)',
    monthlyCost: 185,
    optPct: 25,
    optSaving: 46,
    logic: 'Semantic Redis cache for repeated RAG embedding queries & prompt routing low-complexity tasks to smaller LLM tiers.',
  },
  {
    category: 'Networking',
    resource: 'VNet + Application Gateway WAF v2',
    monthlyCost: 62,
    optPct: 20,
    optSaving: 12,
    logic: 'Cross-AZ data egress route optimization & ingress WAF rule consolidation.',
  },
  {
    category: 'Security',
    resource: 'Azure Key Vault + Managed Identity',
    monthlyCost: 28,
    optPct: 15,
    optSaving: 4,
    logic: 'Pruning unattached secret versions & KMS key policy policy reuse across microservices.',
  },
  {
    category: 'Observability',
    resource: 'Azure Monitor + Log Analytics Workspace',
    monthlyCost: 22,
    optPct: 30,
    optSaving: 7,
    logic: 'Reducing log retention horizon from 365 days to 90 days & filtering verbose debug log streams.',
  },
];

const DEFAULT_AWS_RESOURCES: ProvisionItem[] = [
  {
    category: 'Compute',
    resource: 'EC2 t3.large Auto Scaling Group',
    monthlyCost: 145,
    optPct: 25,
    optSaving: 36,
    logic: 'Auto-scaling instance right-sizing & Spot instance blending during off-peak hours.',
  },
  {
    category: 'Database',
    resource: 'RDS PostgreSQL 15 + pgvector',
    monthlyCost: 230,
    optPct: 25,
    optSaving: 58,
    logic: 'Aurora Serverless v2 auto-scaling vCPU bounds & IOPS tier optimization.',
  },
  {
    category: 'LLM Endpoint',
    resource: 'Bedrock Claude 3 Sonnet',
    monthlyCost: 180,
    optPct: 25,
    optSaving: 45,
    logic: 'Semantic caching layer & prompt token batching to reduce raw Bedrock API invocations.',
  },
  {
    category: 'Networking',
    resource: 'VPC + Private Subnets + ALB',
    monthlyCost: 55,
    optPct: 20,
    optSaving: 11,
    logic: 'NAT Gateway traffic routing consolidation & VPC endpoint optimization.',
  },
  {
    category: 'Security',
    resource: 'KMS + Secrets Manager + IAM',
    monthlyCost: 25,
    optPct: 15,
    optSaving: 4,
    logic: 'KMS key policy consolidation & Secrets Manager rotation cleanup.',
  },
  {
    category: 'Observability',
    resource: 'CloudWatch Dashboards + Alarms',
    monthlyCost: 18,
    optPct: 30,
    optSaving: 5,
    logic: 'CloudWatch log group retention tuning from 1 year to 90 days.',
  },
];

export default function CostBreakdown() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const cloud = (ctx.cloud || 'azure').toLowerCase();
  const tenantName = ctx.tenant?.orgName || 'TENANT_BL2WST';
  const projectName = ctx.intake?.project || 'Clinical RAG Assistant — Phase 1';
  const compliance = (ctx.compliance || 'HIPAA').toUpperCase();

  // Derive provisioned resources in real time from Stage 5 / Stage 2 or fallbacks
  const provisionedItems: ProvisionItem[] = useMemo(() => {
    if (ctx.resources && ctx.resources.length > 0) {
      return ctx.resources.map((r) => {
        const cost = r.monthly_cost || 100;
        const optPct = r.category === 'Observability' ? 30 : r.category === 'Networking' ? 20 : 25;
        const optSaving = Math.round(cost * (optPct / 100));
        let logic = 'Resource optimization derived by OPTIMA-AI heuristics.';
        if (r.category === 'Compute') logic = 'KEDA auto-scaling & right-sizing compute node pools during off-peak hours.';
        else if (r.category === 'Database') logic = 'Auto-pause non-prod instances & dynamic vCore scaling during idle workloads.';
        else if (r.category === 'LLM Endpoint') logic = 'Semantic Redis caching & prompt routing to low-cost model tiers.';
        else if (r.category === 'Networking') logic = 'Egress bandwidth route optimization & ingress rule consolidation.';
        else if (r.category === 'Security') logic = 'Pruning unattached key versions & secret rotation policy optimization.';
        else if (r.category === 'Observability') logic = 'Log retention policy reduction from 365 to 90 days & verbose log filtering.';

        return {
          category: r.category,
          resource: r.resource,
          monthlyCost: cost,
          optPct,
          optSaving,
          logic,
        };
      });
    }
    return cloud === 'aws' ? DEFAULT_AWS_RESOURCES : DEFAULT_AZURE_RESOURCES;
  }, [ctx.resources, cloud]);

  const approvedTotal = ctx.approvedTotal || provisionedItems.reduce((s, item) => s + item.monthlyCost, 0);
  const budgetCeiling = ctx.budgetCeiling || 2000;
  const totalOptSaving = provisionedItems.reduce((s, item) => s + item.optSaving, 0);
  const optPotentialPct = Math.round((totalOptSaving / approvedTotal) * 100) || 28;

  const toggleExpand = (idx: number) => {
    setExpandedIndex(expandedIndex === idx ? null : idx);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {/* ── BREADCRUMB & HEADER (SNAPSHOT 1) ───────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 999, background: '#E0F2FE', color: '#0284C7',
            border: '1px solid #BAE6FD',
          }}>
            OPTIMA-AI STEP 1
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>›</span>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            Cost Breakdown — Provisioned LLM Stack
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          Cost Breakdown — Provisioned LLM Stack
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 880 }}>
          Detailed cost breakdown of every resource provisioned during Phase 1 Terraform execution. Resource identifiers are derived from <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, color: '#0F172A' }}>outputs.json</code> in real-time.
        </p>
      </div>

      {/* ── TOP INFO BANNER (SNAPSHOT 1) ───────────────────────────────────── */}
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
            OPTIMA-AI is analysing the LLM Kit infrastructure provisioned for this tenant
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div style={{ background: '#091E36', borderRadius: 8, padding: '10px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              <i className="ti ti-users" style={{ marginRight: 4 }} /> TENANT
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{tenantName}</div>
          </div>

          <div style={{ background: '#091E36', borderRadius: 8, padding: '10px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              <i className="ti ti-folder" style={{ marginRight: 4 }} /> PROJECT
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{projectName}</div>
          </div>

          <div style={{ background: '#091E36', borderRadius: 8, padding: '10px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              <i className="ti ti-cloud" style={{ marginRight: 4 }} /> CLOUD
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{cloud.toUpperCase()}</div>
          </div>

          <div style={{ background: '#091E36', borderRadius: 8, padding: '10px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              <i className="ti ti-shield-check" style={{ marginRight: 4 }} /> COMPLIANCE
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{compliance}</div>
          </div>
        </div>
      </div>

      {/* ── 4 SUMMARY METRIC CARDS (SNAPSHOT 1) ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div style={{
          background: 'linear-gradient(135deg, #061828, #0C4A6E)',
          border: '1px solid #0EA5E9', borderRadius: 12, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.02em' }}>
            ${approvedTotal}/mo
          </div>
          <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            PHASE 1 APPROVED MONTHLY COST (STAGE 3 BASELINE)
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #061828, #0C4A6E)',
          border: '1px solid #0EA5E9', borderRadius: 12, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.02em' }}>
            ${budgetCeiling}/mo
          </div>
          <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            ORIGINAL BUDGET CEILING (PHASE 1 INTAKE FORM)
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #061828, #0C4A6E)',
          border: '1px solid #0EA5E9', borderRadius: 12, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.02em' }}>
            ${totalOptSaving}/mo
          </div>
          <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            OPTIMA-AI OPTIMIZATION POTENTIAL ({optPotentialPct}% OF APPROVED)
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #061828, #0C4A6E)',
          border: '1px solid #0EA5E9', borderRadius: 12, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.02em' }}>
            {ctx.deployed ? 'Live' : 'Active'}
          </div>
          <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            REAL INFRASTRUCTURE METRICS AVAILABLE
          </div>
        </div>
      </div>

      {/* ── OPTIMIZATION RATIONALE OVERVIEW BOX ───────────────────────────── */}
      <div style={{
        padding: '14px 18px', background: '#F0FDF4', border: '1px solid #BBF7D0',
        borderRadius: 12, color: '#166534', fontSize: 13, lineHeight: 1.6,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-chart-arrows-vertical" style={{ fontSize: 18, color: '#15803D' }} />
          <span>OPTIMA-AI Optimization Logic Overview ({optPotentialPct}% Total Potential Savings)</span>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: '#15803D' }}>
          OPTIMA-AI calculates a total potential savings of <strong>${totalOptSaving}/mo ({optPotentialPct}% reduction)</strong> by applying 4 non-disruptive optimization heuristics: Node Pool Autoscaling (Compute), Serverless Auto-Pause (Database), Semantic Query Caching (LLM Endpoint), and Telemetry Retention Horizon Tuning (Observability). Click any provision below to view its specific optimization logic.
        </p>
      </div>

      {/* ── RESOURCE PROVISION BREAKDOWN LIST (SNAPSHOT 1) ────────────────── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <div style={{
          padding: '14px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
            Phase 1 Provisioned Stack — {provisionedItems.length} resources
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            background: '#E0F2FE', color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            PHASE 1 DERIVED
          </span>
        </div>

        <div>
          {provisionedItems.map((item, idx) => {
            const badge = CATEGORY_BADGES[item.category] || { bg: '#F1F5F9', color: '#475569' };
            const isExpanded = expandedIndex === idx;

            return (
              <div key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <div
                  onClick={() => toggleExpand(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                    cursor: 'pointer', background: isExpanded ? '#F8FAFC' : '#FFFFFF',
                    transition: 'background 0.15s ease',
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
                    ${item.monthlyCost}/mo
                  </span>

                  <span style={{
                    fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                    background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <span>↓ ~${item.optSaving}/mo</span>
                    <span style={{ fontSize: 10, opacity: 0.85 }}>({item.optPct}%)</span>
                  </span>

                  <i className={`ti ti-chevron-${isExpanded ? 'up' : 'down'}`} style={{ fontSize: 16, color: '#64748B' }} />
                </div>

                {/* Expanded Logic Explanation Drawer */}
                {isExpanded && (
                  <div style={{
                    padding: '12px 20px 16px 125px', background: '#F8FAFC',
                    borderTop: '1px dashed #E2E8F0', fontSize: 12.5, color: '#334155', lineHeight: 1.6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0EA5E9', marginBottom: 4 }}>
                      <i className="ti ti-bulb" style={{ fontSize: 16 }} />
                      <span>OPTIMA-AI Optimization Logic ({item.optPct}% Potential Saving):</span>
                    </div>
                    <p style={{ margin: 0, color: '#475569' }}>
                      {item.logic}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ACTION BUTTON ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => store.setPage('optima-recs')}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: '#0EA5E9', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#0284C7'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#0EA5E9'}
        >
          <span>Proceed to AI Optimization Recommendations</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>
      </div>
    </div>
  );
}
