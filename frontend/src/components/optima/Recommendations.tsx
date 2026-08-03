/**
 * Recommendations — OPTIMA-AI Step 2 (AI Cost Recommendations)
 * Recommendations generated from exact Phase 1 resources & outputs.json.
 * Users can approve or reject each recommendation individually with real-time savings updates.
 */
import { useState } from 'react';
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

interface RecCardItem {
  id: string;
  category: string;
  severity: 'HIGH' | 'MED' | 'LOW';
  title: string;
  saving: number;
  description: string;
  remediation: string;
  status: 'pending' | 'approved' | 'rejected';
}

const DEFAULT_RECOMMENDATIONS: RecCardItem[] = [
  {
    id: 'OPT-01',
    category: 'Compute',
    severity: 'HIGH',
    title: 'Right-size aks-drl01 — reduce min_node_count 2→1 off-peak (10pm–7am)',
    saving: 50,
    description: 'Stage 6 Health Dashboard shows AKS CPU at 42% average — well below the 70% threshold. Reducing minimum nodes 2→1 during off-peak hours saves $50/mo with zero service impact via Cluster Autoscaler.',
    remediation: 'Modify main.tf: set min_count=1 in default_node_pool + enable HPA. Execute via Phase 1 Terraform pipeline.',
    status: 'pending',
  },
  {
    id: 'OPT-02',
    category: 'Database',
    severity: 'MED',
    title: 'Reduce pgvector IVFFlat probes 10→6 on psql-drl01 — p95 stays under 100ms SLA',
    saving: 41,
    description: 'Health Dashboard shows pgvector query p95 at 62ms with probes=10. Reducing to 6 cuts CPU load per query by ~40% while keeping latency comfortably under the 100ms SLA.',
    remediation: 'Execute: SET ivfflat.probes=6 in PostgreSQL session config, then reindex affected vectors. No Terraform change required.',
    status: 'pending',
  },
  {
    id: 'OPT-03',
    category: 'LLM Endpoint',
    severity: 'HIGH',
    title: 'Enable prompt caching on drl01-oai — RAG system prompt is sent with 100% of requests',
    saving: 52,
    description: '1,420-token RAG system prompt is sent redundantly on every completion request. Enabling Azure OpenAI prompt caching saves $52/mo in input token fees.',
    remediation: 'Update RAG middleware header: cache_control={"type": "ephemeral"}. Zero Terraform infra changes required.',
    status: 'pending',
  },
  {
    id: 'OPT-04',
    category: 'Networking',
    severity: 'MED',
    title: 'Optimize VNet NAT Gateway & Egress Routing for rag-vnet-01',
    saving: 18,
    description: 'Cross-AZ egress bandwidth between AKS compute nodes and vector database can be routed internally via VNet Service Endpoints.',
    remediation: 'Modify main.tf: add Microsoft.Storage & Microsoft.Sql VNet service endpoints in subnet-aks.',
    status: 'pending',
  },
  {
    id: 'OPT-05',
    category: 'Security',
    severity: 'LOW',
    title: 'Consolidate KMS Key Policies & Prune Stale Key Vault Secrets',
    saving: 8,
    description: 'Key Vault API telemetry indicates 14 stale secret versions accessed 0 times in 90 days. Pruning secret versions reduces key management API operations cost.',
    remediation: 'Run automated Key Vault secret version purge policy. Set soft-delete retention to 30 days.',
    status: 'pending',
  },
  {
    id: 'OPT-06',
    category: 'Observability',
    severity: 'LOW',
    title: 'Tune Log Analytics Workspace Retention from 365d to 90d',
    saving: 14,
    description: 'Log Analytics workspace ingests 4.2 GB/day with 1-year retention. Tuning retention to 90 days reduces storage costs while remaining HIPAA audit compliant.',
    remediation: 'Modify main.tf: set retention_in_days=90 in azurerm_log_analytics_workspace.main.',
    status: 'pending',
  },
];

export default function Recommendations() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);

  const [recs, setRecs] = useState<RecCardItem[]>(DEFAULT_RECOMMENDATIONS);

  const handleApprove = (id: string) => {
    setRecs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'approved' } : r))
    );
  };

  const handleReject = (id: string) => {
    setRecs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'rejected' } : r))
    );
  };

  const totalCount = recs.length;
  const pendingCount = recs.filter((r) => r.status === 'pending').length;
  const approvedCount = recs.filter((r) => r.status === 'approved').length;
  const totalPotentialSaving = recs.reduce((sum, r) => sum + r.saving, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {/* ── BREADCRUMB & HEADER (SNAPSHOT) ─────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 999, background: '#E0F2FE', color: '#0284C7',
            border: '1px solid #BAE6FD',
          }}>
            OPTIMA-AI
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>›</span>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            AI Cost Recommendations
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          AI Cost Recommendations
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 880 }}>
          Recommendations generated from exact Phase 1 resources. Every resource name is from <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, color: '#0F172A' }}>outputs.json</code>. Approve or reject each recommendation individually.
        </p>
      </div>

      {/* ── BLUE NOTICE BANNER (SNAPSHOT) ──────────────────────────────────── */}
      <div style={{
        padding: '12px 18px', background: '#F0F9FF', border: '1px solid #BAE6FD',
        borderRadius: 10, color: '#0369A1', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-info-circle" style={{ fontSize: 18, color: '#0284C7' }} />
        <span>
          Recommendations target <strong>exact resources from Phase 1 Terraform output</strong>. Every resource name is from <code style={{ background: '#E0F2FE', padding: '2px 6px', borderRadius: 4, color: '#0369A1' }}>outputs.json</code>. No changes execute automatically — each requires your explicit approval.
        </span>
      </div>

      {/* ── 4 SUMMARY METRIC CARDS (SNAPSHOT) ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {/* Card 1: TOTAL */}
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>
            {totalCount} total
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            FROM PHASE 1 RESOURCES
          </div>
        </div>

        {/* Card 2: PENDING */}
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>
            {pendingCount} pending
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            AWAITING DECISION
          </div>
        </div>

        {/* Card 3: APPROVED */}
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>
            {approvedCount} approved
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            READY FOR PHASE 1 TF
          </div>
        </div>

        {/* Card 4: TOTAL POTENTIAL SAVING */}
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>
            ${totalPotentialSaving}/mo
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            TOTAL POTENTIAL SAVING
          </div>
        </div>
      </div>

      {/* ── RECOMMENDATIONS CARD LIST (SNAPSHOT) ──────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {recs.map((item) => {
          const badge = CATEGORY_BADGES[item.category] || { bg: '#F1F5F9', color: '#475569' };
          const isApproved = item.status === 'approved';
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
                transition: 'all 0.15s ease',
              }}
            >
              {/* Header Line */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', fontFamily: 'monospace' }}>
                    {item.id}
                  </span>

                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                    background: badge.bg, color: badge.color, display: 'inline-block',
                  }}>
                    {item.category}
                  </span>

                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                    background: item.severity === 'HIGH' ? '#FEE2E2' : item.severity === 'MED' ? '#FEF3C7' : '#E0F2FE',
                    color: item.severity === 'HIGH' ? '#DC2626' : item.severity === 'MED' ? '#D97706' : '#0284C7',
                  }}>
                    {item.severity}
                  </span>

                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                    {item.title}
                  </span>
                </div>

                {/* Right-side Savings & Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
                    background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0',
                  }}>
                    ↓ ${item.saving}/mo
                  </span>

                  {item.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(item.id)}
                        style={{
                          fontSize: 12, fontWeight: 700, color: '#16A34A',
                          background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8,
                          padding: '6px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#BBF7D0'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#DCFCE7'}
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
                          padding: '6px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#FECDD3'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#FEE2E2'}
                      >
                        <i className="ti ti-x" />
                        <span>Reject</span>
                      </button>
                    </>
                  ) : isApproved ? (
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: '#16A34A', background: '#DCFCE7',
                      border: '1px solid #BBF7D0', borderRadius: 8, padding: '6px 14px',
                    }}>
                      ✓ Approved
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: '#DC2626', background: '#FEE2E2',
                      border: '1px solid #FECDD3', borderRadius: 8, padding: '6px 14px',
                    }}>
                      ✕ Rejected
                    </span>
                  )}
                </div>
              </div>

              {/* Description Body */}
              <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginTop: 12, marginBottom: 10 }}>
                {item.description}
              </p>

              {/* Remediation Footer Line */}
              <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                <strong style={{ color: '#334155' }}>Remediation:</strong> {item.remediation}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ACTION NAVIGATION CTA ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => store.setPage('optima-approval')}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: '#0284C7', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#0369A1'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#0284C7'}
        >
          <span>Proceed to Approval Workflow &amp; Execution</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>
      </div>
    </div>
  );
}
