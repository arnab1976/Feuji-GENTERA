/**
 * ApprovalWorkflow — OPTIMA-AI Step 3 (Approval Workflow & Execution)
 * Approved recommendations execute through the Phase 1 Terraform pipeline.
 * Interactive table allowing approval/rejection of pending recommendations with real-time approved savings tracking.
 */
import { useState } from 'react';
import { useAppStore, selectOptimaContext } from '@/store/appStore';

interface ApprovalItem {
  id: string;
  recommendation: string;
  saving: number;
  status: 'pending' | 'approved' | 'rejected';
}

const INITIAL_ITEMS: ApprovalItem[] = [
  {
    id: 'OPT-01',
    recommendation: 'Right-size aks-drl01 — reduce min_node_count 2→1 off-peak (10pm–7am)',
    saving: 50,
    status: 'pending',
  },
  {
    id: 'OPT-02',
    recommendation: 'Reduce pgvector IVFFlat probes 10→6 on psql-drl01 — p95 stays under 100ms SLA',
    saving: 41,
    status: 'pending',
  },
  {
    id: 'OPT-03',
    recommendation: 'Enable prompt caching on drl01-oai — RAG system prompt is sent with 100% of requests',
    saving: 52,
    status: 'pending',
  },
  {
    id: 'OPT-04',
    recommendation: 'Enable App Gateway response caching — reduce origin calls for static assets',
    saving: 28,
    status: 'pending',
  },
  {
    id: 'OPT-05',
    recommendation: 'Right-size Key Vault SKU to standard — meets HIPAA encryption requirements',
    saving: 3,
    status: 'pending',
  },
  {
    id: 'OPT-06',
    recommendation: 'Reduce Log Analytics DEBUG retention 90→30 days (HIPAA online log audit maintained)',
    saving: 9,
    status: 'pending',
  },
];

export default function ApprovalWorkflow() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);

  const [items, setItems] = useState<ApprovalItem[]>(INITIAL_ITEMS);
  const [executing, setExecuting] = useState(false);
  const [executedSuccess, setExecutedSuccess] = useState(false);

  const handleApprove = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'approved' } : item))
    );
  };

  const handleReject = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'rejected' } : item))
    );
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const approvedCount = items.filter((i) => i.status === 'approved').length;
  const rejectedCount = items.filter((i) => i.status === 'rejected').length;
  const approvedSaving = items
    .filter((i) => i.status === 'approved')
    .reduce((sum, i) => sum + i.saving, 0);

  const handleExecuteTF = () => {
    setExecuting(true);
    setTimeout(() => {
      setExecuting(false);
      setExecutedSuccess(true);
    }, 1500);
  };

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
            Approval Workflow
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          Approval Workflow
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 880 }}>
          Approved recommendations execute through the Phase 1 Terraform pipeline — same OPA policies, tfsec scans, and compliance controls apply.
        </p>
      </div>

      {/* ── 4 METRIC SUMMARY CARDS (SNAPSHOT) ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {/* Card 1: PENDING */}
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            PENDING
          </div>
        </div>

        {/* Card 2: APPROVED */}
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>
            {approvedCount}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            APPROVED
          </div>
        </div>

        {/* Card 3: REJECTED */}
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>
            {rejectedCount}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            REJECTED
          </div>
        </div>

        {/* Card 4: APPROVED SAVING */}
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284C7' }}>
            ${approvedSaving}/mo
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
            APPROVED SAVING
          </div>
        </div>
      </div>

      {/* ── NOTICE BANNER (SNAPSHOT) ───────────────────────────────────────── */}
      <div style={{
        padding: '12px 18px', background: '#F0F9FF', border: '1px solid #BAE6FD',
        borderRadius: 10, color: '#0369A1', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-shield-check" style={{ fontSize: 18, color: '#0284C7' }} />
        <span>
          Approved changes execute through the <strong>Phase 1 Terraform pipeline</strong> — same OPA policies, tfsec scans, and HIPAA compliance controls apply automatically.
        </span>
      </div>

      {/* ── EXECUTION SUCCESS MESSAGE ──────────────────────────────────────── */}
      {executedSuccess && (
        <div style={{
          padding: '12px 18px', background: '#ECFDF5', border: '1px solid #A7F3D0',
          borderRadius: 10, color: '#065F46', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize: 18, color: '#059669' }} />
          <span>
            Approved optimizations executed successfully via Phase 1 Terraform Pipeline! Total realized savings updated to <strong>${approvedSaving}/mo</strong>.
          </span>
        </div>
      )}

      {/* ── PENDING REVIEW TABLE CONTAINER (SNAPSHOT) ──────────────────────── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        {/* Yellow Amber Header Banner */}
        <div style={{
          padding: '12px 20px', background: '#FEF3C7', borderBottom: '1px solid #FDE68A',
          color: '#D97706', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span>Pending review ({pendingCount})</span>
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 90 }}>ID</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>RECOMMENDATION</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 100 }}>SAVING</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 180, textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isApproved = item.status === 'approved';
              const isRejected = item.status === 'rejected';

              return (
                <tr key={item.id} style={{
                  borderBottom: '1px solid #F1F5F9',
                  background: isApproved ? '#F0FDF4' : isRejected ? '#FFF1F2' : '#FFFFFF',
                  transition: 'background 0.15s ease',
                }}>
                  <td style={{ padding: '14px 20px', color: '#94A3B8', fontWeight: 700, fontFamily: 'monospace' }}>
                    {item.id}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#0F172A', fontWeight: 600 }}>
                    {item.recommendation}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#059669', fontWeight: 700 }}>
                    ↓ ${item.saving}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {item.status === 'pending' ? (
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleApprove(item.id)}
                          style={{
                            fontSize: 12, fontWeight: 700, color: '#16A34A',
                            background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8,
                            padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
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
                            padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <i className="ti ti-x" />
                          <span>Reject</span>
                        </button>
                      </div>
                    ) : isApproved ? (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, color: '#16A34A', background: '#DCFCE7',
                        border: '1px solid #BBF7D0', borderRadius: 999, padding: '4px 12px',
                      }}>
                        ✓ Approved
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, color: '#DC2626', background: '#FEE2E2',
                        border: '1px solid #FECDD3', borderRadius: 999, padding: '4px 12px',
                      }}>
                        ✕ Rejected
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── ACTION BUTTONS (SNAPSHOT) ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => store.setPage('optima-savings')}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: '#0284C7', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#0369A1'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#0284C7'}
        >
          <span>Proceed to Realized Savings Dashboard</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>

        <button
          type="button"
          onClick={handleExecuteTF}
          disabled={executing || approvedCount === 0}
          style={{
            fontSize: 13, fontWeight: 600, color: '#334155',
            background: executing ? '#F1F5F9' : '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 10, padding: '14px 20px',
            cursor: executing || approvedCount === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <i className={`ti ti-player-play ${executing ? 'spin' : ''}`} style={{ fontSize: 16, color: '#0284C7' }} />
          <span>{executing ? 'Executing via Terraform...' : 'Execute Approved Changes via Phase 1 Terraform'}</span>
        </button>
      </div>
    </div>
  );
}
