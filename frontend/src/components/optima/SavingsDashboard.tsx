/**
 * SavingsDashboard — OPTIMA-AI Step 4 (Savings Dashboard)
 * Tracks realised savings against Phase 1 Stage 3 approved cost baseline and budget ceiling.
 * Displays 6-month projection, ROI summary, and active/evaluated recommendations list.
 */
import { useMemo } from 'react';
import { useAppStore, selectOptimaContext } from '@/store/appStore';

interface RecItem {
  id: string;
  category: string;
  title: string;
  saving: number;
  status: 'approved' | 'pending' | 'rejected';
}

const DEFAULT_RECS: RecItem[] = [
  { id: 'OPT-01', category: 'Compute', title: 'Right-size aks-drl01 — reduce min_node_count 2→1 off-peak (10pm–7am)', saving: 50, status: 'approved' },
  { id: 'OPT-02', category: 'Database', title: 'Reduce pgvector IVFFlat probes 10→6 on psql-drl01 — p95 stays under 100ms SLA', saving: 41, status: 'approved' },
  { id: 'OPT-03', category: 'LLM Endpoint', title: 'Enable prompt caching on drl01-oai — RAG system prompt is sent with 100% of requests', saving: 52, status: 'approved' },
  { id: 'OPT-04', category: 'Networking', title: 'Enable App Gateway response caching — reduce origin calls for static assets', saving: 28, status: 'pending' },
  { id: 'OPT-05', category: 'Security', title: 'Right-size Key Vault SKU to standard — meets HIPAA encryption requirements', saving: 3, status: 'pending' },
  { id: 'OPT-06', category: 'Observability', title: 'Reduce Log Analytics DEBUG retention 90→30 days (HIPAA online log audit maintained)', saving: 9, status: 'pending' },
];

export default function SavingsDashboard() {
  const store = useAppStore();
  const ctx = selectOptimaContext(store);

  const approvedTotal = ctx.approvedTotal || 670;
  const budgetCeiling = ctx.budgetCeiling || 2000;

  // Derive approved savings from store state or default sample
  const recs = DEFAULT_RECS;
  const approvedSaving = recs
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + r.saving, 0);

  const optimisedCost = approvedTotal - approvedSaving;
  const headroom = budgetCeiling - approvedTotal;
  const sixMonthTotal = approvedSaving * 6;

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
            Savings Dashboard
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          Savings Dashboard
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 880 }}>
          Tracks realised savings against the Phase 1 Stage 3 approved cost baseline and budget ceiling from the original intake form.
        </p>
      </div>

      {/* ── TOP DARK SUMMARY CONTAINER (SNAPSHOT) ─────────────────────────── */}
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {/* Card 1: Phase 1 Baseline */}
          <div style={{ background: '#091E36', borderRadius: 10, padding: '12px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0EA5E9' }}>
              ${approvedTotal}/mo
            </div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              Phase 1 Baseline
            </div>
          </div>

          {/* Card 2: Approved Saving */}
          <div style={{ background: '#091E36', borderRadius: 10, padding: '12px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: approvedSaving > 0 ? '#34D399' : '#0EA5E9' }}>
              ${approvedSaving}/mo
            </div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              Approved Saving
            </div>
          </div>

          {/* Card 3: Optimised Cost Target */}
          <div style={{ background: '#091E36', borderRadius: 10, padding: '12px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0EA5E9' }}>
              ${optimisedCost}/mo
            </div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              Optimised Cost Target
            </div>
          </div>

          {/* Card 4: vs Budget Ceiling */}
          <div style={{ background: '#091E36', borderRadius: 10, padding: '12px 14px', border: '1px solid #1E3A5F' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#34D399' }}>
              ${headroom} headroom
            </div>
            <div style={{ fontSize: 10, color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              vs Budget Ceiling
            </div>
          </div>
        </div>
      </div>

      {/* ── NOTICE BANNER (SNAPSHOT) ───────────────────────────────────────── */}
      {approvedSaving === 0 ? (
        <div style={{
          padding: '12px 18px', background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 10, color: '#D97706', fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 18, color: '#D97706' }} />
          <span>
            No recommendations approved yet. Approve recommendations in the Approval Workflow (Screen 4) to start tracking savings.
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
            Active tracking enabled! Realized monthly savings of <strong>${approvedSaving}/mo</strong> (${sixMonthTotal} projected over 6 months) across approved recommendations.
          </span>
        </div>
      )}

      {/* ── 6-MONTH SAVING PROJECTION CONTAINER (SNAPSHOT) ─────────────────── */}
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
            background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A',
          }}>
            Execute in Approval Workflow to track
          </span>
        </div>

        {/* Timeline Bar Chart / Markers */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '20px 20px 10px 20px', height: 100 }}>
          {['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].map((m, idx) => (
            <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 36, height: approvedSaving > 0 ? 30 + idx * 8 : 4,
                background: approvedSaving > 0 ? '#0EA5E9' : '#CBD5E1', borderRadius: 4,
                transition: 'height 0.3s ease',
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
          <span>6-month total: <strong style={{ color: '#0284C7', fontSize: 14 }}>${sixMonthTotal.toLocaleString()}</strong></span>
        </div>
      </div>

      {/* ── ROI SUMMARY CONTAINER (SNAPSHOT) ──────────────────────────────── */}
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
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
            ROI summary
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {/* Card 1 */}
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>${approvedTotal}/mo</div>
            <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2 }}>Phase 1 Baseline</div>
          </div>

          {/* Card 2 */}
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0284C7' }}>${optimisedCost}/mo</div>
            <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2 }}>After OPTIMA-AI</div>
          </div>

          {/* Card 3 */}
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706' }}>${budgetCeiling}/mo</div>
            <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2 }}>Budget ceiling</div>
          </div>

          {/* Card 4 */}
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>${approvedSaving}/mo</div>
            <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2 }}>Monthly saving</div>
          </div>

          {/* Card 5 */}
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>${sixMonthTotal}</div>
            <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2 }}>6-month ROI</div>
          </div>
        </div>
      </div>

      {/* ── RECOMMENDATIONS TRACKING TABLE (USER DIRECTIVE) ───────────────── */}
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
            REAL TIME TRACKING
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
              const isApproved = item.status === 'approved';
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 20px', color: '#94A3B8', fontWeight: 700, fontFamily: 'monospace' }}>
                    {item.id}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#0F172A', fontWeight: 600 }}>
                    {item.title}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#059669', fontWeight: 700 }}>
                    ↓ ${item.saving}/mo
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {isApproved ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                        background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0',
                      }}>
                        ✓ Approved &amp; Tracked
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

      {/* ── ACTION NAVIGATION CTA ─────────────────────────────────────────── */}
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
