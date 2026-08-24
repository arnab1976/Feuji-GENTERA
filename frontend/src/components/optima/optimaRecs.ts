/**
 * Shared OPTIMA recommendation seed — used by Recommendations, Approval Workflow,
 * and Savings Dashboard so all three stages share one persisted list.
 */
import type { OptimaRecommendation } from '@/types';

type ResourceLike = { category: string; resource: string; monthly_cost?: number };

const FALLBACK_SEED: OptimaRecommendation[] = [
  {
    id: 'OPT-01', recId: 'OPT-01', lever: 'Compute', severity: 'HIGH',
    title: 'Right-size aks-drl01 — reduce min_node_count 2→1 off-peak (10pm–7am)',
    detail: 'Stage 6 Health Dashboard shows AKS CPU at 42% average — well below the 70% threshold.',
    resourceName: 'aks-drl01', resourceIdentifier: 'aks-drl01',
    estimatedMonthlySaving: 50, effort: 'Low', risk: 'Low',
    actionDescription: 'Modify main.tf: set min_count=1 in default_node_pool + enable HPA.',
    status: 'pending',
  },
  {
    id: 'OPT-02', recId: 'OPT-02', lever: 'Database', severity: 'MED',
    title: 'Reduce pgvector IVFFlat probes 10→6 on psql-drl01 — p95 stays under 100ms SLA',
    detail: 'Health Dashboard shows pgvector query p95 at 62ms with probes=10.',
    resourceName: 'psql-drl01', resourceIdentifier: 'psql-drl01',
    estimatedMonthlySaving: 41, effort: 'Low', risk: 'Low',
    actionDescription: 'SET ivfflat.probes=6 in PostgreSQL session config.',
    status: 'pending',
  },
  {
    id: 'OPT-03', recId: 'OPT-03', lever: 'LLM Endpoint', severity: 'HIGH',
    title: 'Enable prompt caching on drl01-oai — RAG system prompt is sent with 100% of requests',
    detail: '1,420-token RAG system prompt is sent redundantly on every completion request.',
    resourceName: 'drl01-oai', resourceIdentifier: 'drl01-oai',
    estimatedMonthlySaving: 52, effort: 'Low', risk: 'Low',
    actionDescription: 'Update RAG middleware header: cache_control={"type": "ephemeral"}.',
    status: 'pending',
  },
  {
    id: 'OPT-04', recId: 'OPT-04', lever: 'Networking', severity: 'MED',
    title: 'Enable App Gateway response caching — reduce origin calls for static assets',
    detail: 'Cross-AZ egress bandwidth can be reduced with response caching and service endpoints.',
    resourceName: 'rag-vnet-01', resourceIdentifier: 'rag-vnet-01',
    estimatedMonthlySaving: 28, effort: 'Med', risk: 'Low',
    actionDescription: 'Add VNet service endpoints and App Gateway cache rules in main.tf.',
    status: 'pending',
  },
  {
    id: 'OPT-05', recId: 'OPT-05', lever: 'Security', severity: 'LOW',
    title: 'Right-size Key Vault SKU to standard — meets HIPAA encryption requirements',
    detail: 'Key Vault API telemetry indicates over-provisioned premium SKU usage.',
    resourceName: 'kv-drl01', resourceIdentifier: 'kv-drl01',
    estimatedMonthlySaving: 3, effort: 'Low', risk: 'Low',
    actionDescription: 'Downgrade Key Vault SKU to standard where premium features are unused.',
    status: 'pending',
  },
  {
    id: 'OPT-06', recId: 'OPT-06', lever: 'Observability', severity: 'LOW',
    title: 'Reduce Log Analytics DEBUG retention 90→30 days (HIPAA online log audit maintained)',
    detail: 'Log Analytics retention can be tuned while remaining HIPAA audit compliant.',
    resourceName: 'law-drl01', resourceIdentifier: 'law-drl01',
    estimatedMonthlySaving: 9, effort: 'Low', risk: 'Low',
    actionDescription: 'Modify main.tf: set retention_in_days=30 for DEBUG category.',
    status: 'pending',
  },
];

function severityFor(category: string, index: number): 'HIGH' | 'MED' | 'LOW' {
  if (category === 'Compute' || category === 'LLM Endpoint') return 'HIGH';
  if (category === 'Security' || category === 'Observability') return 'LOW';
  if (index % 2 === 0) return 'MED';
  return 'MED';
}

/** Build OPTIMA recs from Phase 1 Stage 2 resources (25% per-row, same as FinOps/Cost Breakdown). */
export function buildOptimaRecsFromResources(resources: ResourceLike[]): OptimaRecommendation[] {
  if (!resources?.length) return FALLBACK_SEED.map((r) => ({ ...r }));

  return resources.map((r, i) => {
    const id = `OPT-${String(i + 1).padStart(2, '0')}`;
    const cost = Number(r.monthly_cost) || 0;
    const saving = Math.round(cost * 0.25);
    return {
      id,
      recId: id,
      lever: r.category,
      severity: severityFor(r.category, i),
      title: `Optimize ${r.resource} — ${r.category} right-sizing & efficiency`,
      detail: `Derived from Phase 1 provisioned resource "${r.resource}" (${r.category}) at $${cost}/mo. OPTIMA estimates ~25% reversible saving.`,
      resourceName: r.resource,
      resourceIdentifier: r.resource,
      estimatedMonthlySaving: saving,
      effort: 'Low',
      risk: 'Low',
      actionDescription: `Apply OPTIMA remediation for ${r.resource} via Phase 1 Terraform pipeline.`,
      status: 'pending' as const,
    };
  });
}

export function sumApprovedSaving(recs: OptimaRecommendation[]): number {
  return (recs || [])
    .filter((r) => r.status === 'approved' || r.status === 'executed')
    .reduce((s, r) => s + (Number(r.estimatedMonthlySaving) || 0), 0);
}
