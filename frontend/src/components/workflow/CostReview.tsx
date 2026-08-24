/**
 * Stage 3 — Cost Estimation & Resource Review
 * Cards stream one-by-one. Each cost is tagged Lower / Inline / Upper vs AI baseline
 * and category standard share of the intake budget ceiling (LLM-assisted bands).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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

/** LLM-style standard share of monthly budget ceiling by infrastructure category */
const STANDARD_BUDGET_SHARE: Record<string, number> = {
  'Compute': 0.22,
  'Database': 0.28,
  'LLM Endpoint': 0.25,
  'Networking': 0.08,
  'Vector Store': 0.04,
  'Security': 0.04,
  'Observability': 0.03,
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

const DEFAULT_GCP_RESOURCES = [
  { category: 'Compute', resource: 'GKE Autopilot (e2-standard-4 class, 2–6 nodes)', monthlyCost: 155 },
  { category: 'Database', resource: 'Cloud SQL PostgreSQL 15 + pgvector (HA)', monthlyCost: 235 },
  { category: 'LLM Endpoint', resource: 'Vertex AI Gemini 1.5 Pro (private Google Access)', monthlyCost: 188 },
  { category: 'Networking', resource: 'VPC + Cloud Load Balancing + Cloud Armor', monthlyCost: 64 },
  { category: 'Security', resource: 'Secret Manager + Workload Identity', monthlyCost: 29 },
  { category: 'Observability', resource: 'Cloud Monitoring + Cloud Logging', monthlyCost: 24 },
];

type CostBand = 'lower' | 'inline' | 'upper' | 'critical';

const BAND_STYLE: Record<CostBand, { bg: string; color: string; border: string; label: string }> = {
  lower:    { bg: '#D1FAE5', color: '#047857', border: '#A7F3D0', label: 'Lower side' },
  inline:   { bg: '#E0F2FE', color: '#0369A1', border: '#BAE6FD', label: 'Inline with standard' },
  upper:    { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', label: 'Upper side' },
  critical: { bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA', label: 'Upper side — high' },
};

function classifyVsReference(current: number, reference: number): CostBand {
  if (reference <= 0) {
    if (current <= 0) return 'inline';
    return current > 50 ? 'upper' : 'inline';
  }
  const delta = (current - reference) / reference;
  if (delta < -0.08) return 'lower';
  if (delta <= 0.10) return 'inline';
  if (delta <= 0.28) return 'upper';
  return 'critical';
}

function worseBand(a: CostBand, b: CostBand): CostBand {
  const rank: Record<CostBand, number> = { lower: 0, inline: 1, upper: 2, critical: 3 };
  return rank[a] >= rank[b] ? a : b;
}

function assessCost(
  category: string,
  current: number,
  aiBaseline: number,
  budgetCeiling: number,
): { band: CostBand; tip: string; standardCost: number; baseline: number } {
  const share = STANDARD_BUDGET_SHARE[category] ?? 0.1;
  const standardCost = Math.round(budgetCeiling * share);
  const vsBaseline = classifyVsReference(current, aiBaseline);
  const vsStandard = classifyVsReference(current, standardCost);
  const band = worseBand(vsBaseline, vsStandard);

  const tipParts: string[] = [];
  tipParts.push(`AI baseline $${aiBaseline}/mo`);
  tipParts.push(`LLM standard ~$${standardCost}/mo (${Math.round(share * 100)}% of $${budgetCeiling} ceiling)`);
  if (band === 'lower') tipParts.push('Current estimate is on the lower side of standard.');
  if (band === 'inline') tipParts.push('Current estimate is in line with AI / budget standard.');
  if (band === 'upper') tipParts.push('Current estimate sits on the upper side of standard.');
  if (band === 'critical') tipParts.push('Current estimate is significantly above standard — review sizing.');

  return { band, tip: tipParts.join(' · '), standardCost, baseline: aiBaseline };
}

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

  const initialResources = useMemo(() => {
    if (recommendation?.resources && recommendation.resources.length > 0) {
      return recommendation.resources.map((r) => ({
        category: r.category,
        resource: r.resource,
        monthlyCost: r.monthly_cost,
      }));
    }
    return cloud === 'aws'
      ? DEFAULT_AWS_RESOURCES
      : cloud === 'gcp'
        ? DEFAULT_GCP_RESOURCES
        : DEFAULT_AZURE_RESOURCES;
  }, [recommendation, cloud]);

  const [resources, setResources] = useState(initialResources);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [streamDone, setStreamDone] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResources(initialResources);
  }, [initialResources]);

  // Reveal cost cards one-by-one for viewer UX
  useEffect(() => {
    setRevealedCount(0);
    setStreamDone(false);
    if (!initialResources.length) {
      setStreamDone(true);
      return;
    }
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setRevealedCount(n);
      if (n >= initialResources.length) {
        clearInterval(timer);
        setStreamDone(true);
      }
    }, 420);
    return () => clearInterval(timer);
  }, [initialResources]);

  useEffect(() => {
    if (!streamDone && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }
  }, [revealedCount, streamDone]);

  const handleCostChange = (index: number, val: number) => {
    setResources((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], monthlyCost: Math.max(0, val) };
      return next;
    });
  };

  const totalCost = resources.reduce((sum, r) => sum + (Number(r.monthlyCost) || 0), 0);
  const isExceedingBudget = totalCost > budgetCeiling;
  const visibleResources = resources.slice(0, revealedCount);

  const breakdownDescription = useMemo(() => {
    if (!resources.length) {
      return 'No recommended resources available yet. Complete Stage 2 AI Recommendation to populate the cost breakdown.';
    }
    const cloudLabel = cloud.toUpperCase();
    const project = intakeForm?.project || 'the Stage 2 recommendation';
    const budgetStatus = isExceedingBudget
      ? `Total $${totalCost}/mo exceeds the intake budget ceiling of $${budgetCeiling}/mo and will route to Tenant Admin approval.`
      : `Total $${totalCost}/mo is within the intake budget ceiling of $${budgetCeiling}/mo.`;
    return (
      `${cloudLabel} cost breakdown for ${project} (${resources.length} resources). ` +
      `Cards stream in with LLM cost bands: Lower side / Inline with standard / Upper side vs AI baseline & category budget share. ` +
      `${budgetStatus} Edit any $/mo value — bands update in real time.`
    );
  }, [resources.length, cloud, intakeForm?.project, totalCost, budgetCeiling, isExceedingBudget]);

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
      setTimeout(() => setPage('terraform'), 600);
    } catch {
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
      <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.65, margin: 0, maxWidth: 900 }}>
        {breakdownDescription}
      </p>

      <div style={{
        padding: '10px 14px', borderRadius: 8, background: '#F0F9FF', border: '1px solid #BAE6FD',
        color: '#0369A1', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <i className="ti ti-sparkles" />
        <span>
          {streamDone
            ? 'LLM cost tagging active: '
            : `Streaming cost cards… ${revealedCount}/${resources.length} · `}
        </span>
        <span style={{ ...pill(BAND_STYLE.lower) }}>Lower side</span>
        <span style={{ ...pill(BAND_STYLE.inline) }}>Inline with standard</span>
        <span style={{ ...pill(BAND_STYLE.upper) }}>Upper side</span>
        <span style={{ ...pill(BAND_STYLE.critical) }}>Upper — high</span>
      </div>

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleResources.length === 0 && (
          <div style={{
            padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: 13,
            background: '#FFFFFF', border: '1px dashed #CBD5E1', borderRadius: 12,
          }}>
            <i className="ti ti-loader spin" style={{ marginRight: 8 }} />
            Loading AI cost estimates…
          </div>
        )}

        {visibleResources.map((item, index) => {
          const badge = CATEGORY_BADGES[item.category] || { bg: '#F1F5F9', color: '#475569' };
          const baseline = Number(initialResources[index]?.monthlyCost) || 0;
          const assessment = assessCost(
            item.category,
            Number(item.monthlyCost) || 0,
            baseline,
            budgetCeiling,
          );
          const band = BAND_STYLE[assessment.band];
          const inputColor = band.color;

          return (
            <div
              key={`${item.category}-${index}`}
              style={{
                background: '#FFFFFF',
                border: `1px solid ${assessment.band === 'inline' ? '#E2E8F0' : band.border}`,
                borderRadius: 12,
                padding: '12px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
                animation: 'costCardIn 0.35s ease',
              }}
              title={assessment.tip}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                    background: badge.bg, color: badge.color, whiteSpace: 'nowrap',
                    display: 'inline-block', minWidth: 90, textAlign: 'center',
                  }}>
                    {item.category}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                    {item.resource}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
                    background: band.bg, color: band.color, border: `1px solid ${band.border}`,
                    letterSpacing: '0.02em', whiteSpace: 'nowrap',
                  }}>
                    {band.label}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#64748B' }}>$</span>
                  <input
                    type="number"
                    min={0}
                    value={item.monthlyCost}
                    onChange={(e) => handleCostChange(index, Number(e.target.value))}
                    style={{
                      width: 80, padding: '6px 10px', fontSize: 14, fontWeight: 700,
                      color: inputColor, textAlign: 'center', background: '#F8FAFC',
                      border: `1px solid ${band.border}`, borderRadius: 8, outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 13, color: '#64748B' }}>/mo</span>
                </div>
              </div>

              <div style={{
                fontSize: 11, color: band.color, lineHeight: 1.4,
                background: band.bg, border: `1px solid ${band.border}`,
                borderRadius: 8, padding: '6px 10px',
              }}>
                <strong>LLM signal:</strong> {assessment.tip}
              </div>
            </div>
          );
        })}
        {!streamDone && revealedCount > 0 && (
          <div style={{
            padding: '10px 14px', fontSize: 12, color: '#64748B',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="ti ti-loader spin" />
            Estimating next resource cost…
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {streamDone && (
        <>
          <div style={{
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
            padding: '18px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginTop: 4,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Total</div>
              <div style={{
                height: 3, width: 150, background: '#0D9488',
                borderRadius: 2, marginTop: 6, marginBottom: 8,
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>
                  Budget Ceiling: <strong>${budgetCeiling.toLocaleString()}/mo</strong>
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                  background: isExceedingBudget ? '#FEE2E2' : '#D1FAE5',
                  color: isExceedingBudget ? '#B91C1C' : '#047857',
                  border: `1px solid ${isExceedingBudget ? '#FECDD3' : '#A7F3D0'}`,
                }}>
                  {isExceedingBudget
                    ? `Exceeds Budget Ceiling by $${(totalCost - budgetCeiling).toLocaleString()}/mo`
                    : 'Within Budget Ceiling'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: 24, fontWeight: 800, color: '#0D9488' }}>
              ${totalCost.toLocaleString()}/mo
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleApprove}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: 10, border: 'none',
                background: loading ? '#94A3B8' : '#0D9488', color: '#FFFFFF',
                fontWeight: 700, fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(13,148,136,0.3)',
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
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 20px', borderRadius: 10, border: '1px solid #CBD5E1',
                background: '#FFFFFF', color: '#334155', fontWeight: 600, fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#F8FAFC'; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#FFFFFF'; }}
            >
              <i className="ti ti-refresh" style={{ fontSize: 15 }} />
              <span>Recalculate</span>
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes costCardIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function pill(s: { bg: string; color: string; border: string }) {
  return {
    fontSize: 10,
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: 999,
    background: s.bg,
    color: s.color,
    border: `1px solid ${s.border}`,
  } as const;
}
