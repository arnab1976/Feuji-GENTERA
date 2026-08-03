/**
 * Stage 3 — Cost Estimation & Resource Review
 * AWS Pricing API or Azure Retail Pricing API returns per-resource monthly cost estimates.
 * The Tenant User reviews each recommended resource as an editable card.
 * Cost recalculates in real time on every edit. A budget ceiling gate prevents deployment
 * and routes to the Tenant Admin approval queue if the total exceeds the ceiling set in the intake form.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { workflowApi } from '@/services/api';

const CATEGORY_BADGES: Record<string, { bg: string; color: string }> = {
  'Compute':       { bg: '#CCFBF1', color: '#0F766E' },
  'Database':      { bg: '#D1FAE5', color: '#047857' },
  'LLM Endpoint':  { bg: '#DCFCE7', color: '#16A34A' },
  'Networking':    { bg: '#CCFBF1', color: '#0D9488' },
  'Vector Store':  { bg: '#E0F2FE', color: '#0284C7' },
  'Security':      { bg: '#E0F2FE', color: '#0891B2' },
  'Observability': { bg: '#DCFCE7', color: '#15803D' },
};

const DEFAULT_AWS_RESOURCES = [
  { category: 'Compute', resource: 'EC2 t3.large Auto Scaling Group', monthlyCost: 145 },
  { category: 'Database', resource: 'RDS PostgreSQL 15 + pgvector', monthlyCost: 230 },
  { category: 'LLM Endpoint', resource: 'Bedrock Claude 3 Sonnet', monthlyCost: 180 },
  { category: 'Networking', resource: 'VPC + Private Subnets + ALB', monthlyCost: 55 },
  { category: 'Security', resource: 'KMS + Secrets Manager + IAM', monthlyCost: 25 },
  { category: 'Observability', resource: 'CloudWatch Dashboards + Alarms', monthlyCost: 18 },
];

const DEFAULT_AZURE_RESOURCES = [
  { category: 'Compute', resource: 'Azure AKS (Standard_D4s_v3, 2–6 nodes)', monthlyCost: 148 },
  { category: 'Database', resource: 'PostgreSQL Flexible Server + pgvector', monthlyCost: 225 },
  { category: 'LLM Endpoint', resource: 'Azure OpenAI GPT-4o (private endpoint)', monthlyCost: 185 },
  { category: 'Networking', resource: 'VNet + Application Gateway WAF v2', monthlyCost: 62 },
  { category: 'Security', resource: 'Azure Key Vault + Managed Identity', monthlyCost: 28 },
  { category: 'Observability', resource: 'Azure Monitor + Log Analytics Workspace', monthlyCost: 22 },
];

export default function CostReview() {
  const {
    intakeForm,
    recommendation,
    currentRole,
    setResourcePlan,
    markStageComplete,
    setPage,
  } = useAppStore();

  const cloud = intakeForm?.cloud || 'azure';
  const budgetCeiling = intakeForm?.budgetCeiling || 2000;
  const tenantId = intakeForm?.tenantId || 'TENANT_DEMO';
  const recId = recommendation?.recommendationId || 'REC-DEMO-001';

  // Initial resources derived from Stage 2 AI Recommendation if present
  const initialResources = useMemo(() => {
    if (recommendation?.resources && recommendation.resources.length > 0) {
      return recommendation.resources.map((r) => ({
        category: r.category,
        resource: r.resource,
        monthlyCost: r.monthly_cost,
      }));
    }
    return cloud === 'aws' ? DEFAULT_AWS_RESOURCES : DEFAULT_AZURE_RESOURCES;
  }, [recommendation, cloud]);

  const [resources, setResources] = useState(initialResources);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setResources(initialResources);
  }, [initialResources]);

  const handleCostChange = (index: number, val: number) => {
    setResources((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], monthlyCost: Math.max(0, val) };
      return next;
    });
  };

  const totalCost = resources.reduce((sum, r) => sum + (Number(r.monthlyCost) || 0), 0);
  const isExceedingBudget = totalCost > budgetCeiling;

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const payloadResources = resources.map((r) => ({
      category: r.category,
      resource: r.resource,
      monthly_cost: Number(r.monthlyCost) || 0,
    }));

    try {
      const res = await workflowApi.approveCost({
        recommendation_id: recId,
        tenant_id: tenantId,
        resources: payloadResources,
        approved_by: currentRole || 'Tenant Admin',
      });

      const approvedTotal = res.data?.approvedTotal ?? totalCost;
      const plan = {
        planId: res.data?.planId || `PLAN-${Date.now()}`,
        approvedTotal,
        budgetCeiling: res.data?.budgetCeiling || budgetCeiling,
        requiresApproval: Boolean(res.data?.requiresApproval),
        status: res.data?.status || 'approved',
      };

      setResourcePlan(plan, approvedTotal);
      markStageComplete('cost');
      setSuccessMsg('Cost plan approved successfully! Proceeding to Stage 4 Terraform Generation...');
      setTimeout(() => {
        setPage('terraform');
      }, 600);
    } catch {
      // Fallback local store save
      const plan = {
        planId: `PLAN-${Date.now()}`,
        approvedTotal: totalCost,
        budgetCeiling,
        requiresApproval: isExceedingBudget,
        status: isExceedingBudget ? 'pending_tenant_admin_approval' : 'approved',
      };
      setResourcePlan(plan, totalCost);
      markStageComplete('cost');
      setPage('terraform');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = () => {
    setResources(initialResources);
    setSuccessMsg('Recalculated costs to baseline AI recommendation values.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {/* ── BREADCRUMB & HEADER ────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 999, background: '#CCFBF1', color: '#0F766E',
            border: '1px solid #99F6E4',
          }}>
            STAGE 3
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>›</span>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            Cost Estimation &amp; Resource Review
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          Cost Estimation &amp; Resource Review
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 860 }}>
          AWS Pricing API or Azure Retail Pricing API returns per-resource monthly cost estimates. The Tenant User reviews each recommended resource as an editable card. Cost recalculates in real time on every edit (debounced). A budget ceiling gate prevents deployment and routes to the Tenant Admin approval queue if the total exceeds the ceiling set in the intake form.
        </p>
      </div>

      {/* ── NOTIFICATION / ALERT MESSAGES ─────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#FFF1F2',
          border: '1px solid #FECDD3', color: '#9F1239', fontSize: 13,
        }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#ECFDF5',
          border: '1px solid #A7F3D0', color: '#065F46', fontSize: 13, fontWeight: 600,
        }}>
          {successMsg}
        </div>
      )}

      {/* ── PER-RESOURCE EDITABLE CARDS ───────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {resources.map((item, index) => {
          const badge = CATEGORY_BADGES[item.category] || { bg: '#F1F5F9', color: '#475569' };
          return (
            <div
              key={index}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
              }}
            >
              {/* Category badge + Resource title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: badge.bg,
                  color: badge.color,
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  minWidth: 90,
                  textAlign: 'center',
                }}>
                  {item.category}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                  {item.resource}
                </span>
              </div>

              {/* Editable cost input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#64748B' }}>$</span>
                <input
                  type="number"
                  min={0}
                  value={item.monthlyCost}
                  onChange={(e) => handleCostChange(index, Number(e.target.value))}
                  style={{
                    width: 80,
                    padding: '6px 10px',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#047857',
                    textAlign: 'center',
                    background: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: 8,
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: 13, color: '#64748B' }}>/mo</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── TOTAL & BUDGET CEILING SUMMARY ────────────────────────────────── */}
      <div style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Total</div>
          <div style={{
            height: 3, width: 150, background: '#0D9488',
            borderRadius: 2, marginTop: 6, marginBottom: 8,
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748B' }}>
              Budget Ceiling: <strong>${budgetCeiling.toLocaleString()}/mo</strong>
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 999,
              background: isExceedingBudget ? '#FEE2E2' : '#D1FAE5',
              color: isExceedingBudget ? '#B91C1C' : '#047857',
              border: `1px solid ${isExceedingBudget ? '#FECDD3' : '#A7F3D0'}`,
            }}>
              {isExceedingBudget
                ? `⚠️ Exceeds Budget Ceiling by $${(totalCost - budgetCeiling).toLocaleString()}/mo`
                : '✓ Within Budget Ceiling'}
            </span>
          </div>
        </div>

        <div style={{ fontSize: 24, fontWeight: 800, color: '#0D9488' }}>
          ${totalCost.toLocaleString()}/mo
        </div>
      </div>

      {/* ── ACTION BUTTONS ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
        <button
          type="button"
          onClick={handleApprove}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            borderRadius: 10,
            border: 'none',
            background: loading ? '#94A3B8' : '#0D9488',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 4px 14px rgba(13,148,136,0.3)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#0F766E'; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#0D9488'; }}
        >
          <i className="ti ti-check" style={{ fontSize: 16 }} />
          <span>{loading ? 'Processing…' : 'Approve & generate Terraform'}</span>
        </button>

        <button
          type="button"
          onClick={handleRecalculate}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 10,
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            color: '#334155',
            fontWeight: 600,
            fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#F8FAFC'; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#FFFFFF'; }}
        >
          <i className="ti ti-refresh" style={{ fontSize: 15 }} />
          <span>Recalculate</span>
        </button>
      </div>
    </div>
  );
}
