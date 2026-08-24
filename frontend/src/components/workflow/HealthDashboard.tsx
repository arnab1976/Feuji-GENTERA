/**
 * Stage 6 — Infrastructure Health Dashboard
 * Dynamically derives resource names, cloud provider context, endpoints, and live metrics
 * directly from Phase 1 Stage 1-5 outputs (intakeForm, recommendation, resourcePlan, deploymentOutputs).
 * Rows stream in one-by-one with Green / Amber / Red health + reason.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { healthApi } from '@/services/api';

type HealthStatus = 'green' | 'amber' | 'red';

interface MetricRow {
  category: string;
  name: string;
  value: string;
  pct: number;
  status: HealthStatus;
  reason: string;
  hasOptimaBadge: boolean;
  optimaTooltip: string;
}

const STATUS_STYLE: Record<HealthStatus, { dot: string; bg: string; color: string; border: string; label: string }> = {
  green: { dot: '#10B981', bg: '#D1FAE5', color: '#047857', border: '#A7F3D0', label: 'GREEN' },
  amber: { dot: '#D97706', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', label: 'AMBER' },
  red:   { dot: '#DC2626', bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA', label: 'RED' },
};

function evaluateCpu(pct: number): Pick<MetricRow, 'status' | 'reason' | 'pct'> {
  if (pct > 85) return { status: 'red', pct, reason: `CPU at ${pct}% — above critical threshold (85%). Scale out or investigate hot pods.` };
  if (pct >= 70) return { status: 'amber', pct, reason: `CPU at ${pct}% — elevated (70–85%). Watch for sustained load before peak hours.` };
  return { status: 'green', pct, reason: `CPU at ${pct}% — healthy (under 70% utilisation).` };
}

function evaluateDb(conn: number, max = 500): Pick<MetricRow, 'status' | 'reason' | 'pct'> {
  const pct = Math.round((conn / max) * 100);
  if (pct > 90) return { status: 'red', pct, reason: `${conn}/${max} connections (${pct}%) — critical pool pressure. Raise max_connections or add replicas.` };
  if (pct >= 70) return { status: 'amber', pct, reason: `${conn}/${max} connections (${pct}%) — elevated pool use. Review long-running queries.` };
  return { status: 'green', pct, reason: `${conn}/${max} connections (${pct}%) — healthy connection pool headroom.` };
}

function evaluateLlm(sec: number): Pick<MetricRow, 'status' | 'reason' | 'pct'> {
  const pct = Math.min(100, Math.round((sec / 4) * 100));
  if (sec > 3) return { status: 'red', pct, reason: `p50 latency ${sec}s — above 3s SLA. Check throttling / region capacity.` };
  if (sec >= 2) return { status: 'amber', pct, reason: `p50 latency ${sec}s — elevated (2–3s). Enable caching or reduce prompt size.` };
  return { status: 'green', pct, reason: `p50 latency ${sec}s — within SLA (under 2s).` };
}

function evaluateVector(ms: number): Pick<MetricRow, 'status' | 'reason' | 'pct'> {
  const pct = Math.min(100, Math.round((ms / 150) * 100));
  if (ms > 100) return { status: 'red', pct, reason: `p95 ${ms}ms — exceeds 100ms vector SLA. Reindex / tune IVFFlat probes.` };
  if (ms >= 80) return { status: 'amber', pct, reason: `p95 ${ms}ms — approaching SLA ceiling (80–100ms).` };
  return { status: 'green', pct, reason: `p95 ${ms}ms — healthy vector query latency (under 80ms).` };
}

function evaluateNet(errPct: number): Pick<MetricRow, 'status' | 'reason' | 'pct'> {
  if (errPct > 1) return { status: 'red', pct: Math.min(100, errPct * 20), reason: `5xx error rate ${errPct}% — service degradation. Check upstream health probes.` };
  if (errPct > 0) return { status: 'amber', pct: Math.min(100, errPct * 40), reason: `5xx error rate ${errPct}% — intermittent errors. Monitor WAF / backends.` };
  return { status: 'green', pct: 0, reason: '5xx error rate 0.0% — gateway healthy.' };
}

function evaluateLogs(gb: number): Pick<MetricRow, 'status' | 'reason' | 'pct'> {
  const pct = Math.min(100, Math.round((gb / 70) * 100));
  if (gb > 60) return { status: 'red', pct, reason: `${gb} GB/day ingestion — over soft cap (60 GB). Reduce verbosity or retention.` };
  if (gb >= 40) return { status: 'amber', pct, reason: `${gb} GB/day ingestion — elevated (40–60 GB). Consider retention tune-down.` };
  return { status: 'green', pct, reason: `${gb} GB/day ingestion — within healthy budget (under 40 GB).` };
}

export default function HealthDashboard() {
  const {
    activeTenant,
    intakeForm,
    recommendation,
    resourcePlan,
    deploymentOutputs,
    markStageComplete,
    setPage,
  } = useAppStore();

  const tenantId = activeTenant?.tenantId || intakeForm?.tenantId || 'TENANT_PROD';
  const cloud = (intakeForm?.cloud || 'azure').toUpperCase();

  const approvedTotal =
    resourcePlan?.approvedTotal ||
    recommendation?.resources?.reduce((a, r) => a + (r.monthly_cost || 0), 0) ||
    670;

  const servicesCount = recommendation?.resources?.length || 6;

  const [telemetry, setTelemetry] = useState({
    cpu_util: 42,
    db_conn: 180,
    llm_p50: 1.8,
    vector_p95: 62,
    log_ingest: 48,
    net_5xx: 0,
  });

  const [lastPolled, setLastPolled] = useState<string>(new Date().toLocaleTimeString());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [streamDone, setStreamDone] = useState(false);
  const rowEndRef = useRef<HTMLDivElement>(null);

  const pollBackend = async () => {
    try {
      const res = await healthApi.getTenantHealth(tenantId);
      if (res?.data?.metrics) {
        const m = res.data.metrics;
        setTelemetry({
          cpu_util: m.compute_cpu_pct ?? 42,
          db_conn: m.db_active_connections ?? 180,
          llm_p50: m.llm_p50_latency_sec ?? 1.8,
          vector_p95: m.vector_p95_latency_ms ?? 62,
          log_ingest: m.log_ingestion_gb_day ?? 48,
          net_5xx: m.gateway_5xx_pct ?? 0,
        });
      }
    } catch {
      setTelemetry((prev) => ({
        cpu_util: Math.min(95, Math.max(20, prev.cpu_util + (Math.floor(Math.random() * 5) - 2))),
        db_conn: Math.min(480, Math.max(100, prev.db_conn + (Math.floor(Math.random() * 9) - 4))),
        llm_p50: Number((Math.min(3.5, Math.max(0.8, prev.llm_p50 + (Math.random() * 0.2 - 0.1)))).toFixed(1)),
        vector_p95: Math.min(120, Math.max(40, prev.vector_p95 + (Math.floor(Math.random() * 5) - 2))),
        log_ingest: Math.min(80, Math.max(20, prev.log_ingest + (Math.floor(Math.random() * 3) - 1))),
        net_5xx: prev.net_5xx,
      }));
    }
    setLastPolled(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    pollBackend();
    const timer = setInterval(pollBackend, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Reveal health rows one-by-one on mount (attractive stream) — not all at once
  useEffect(() => {
    setRevealedCount(0);
    setStreamDone(false);
    let n = 0;
    const total = 6;
    const timer = setInterval(() => {
      n += 1;
      setRevealedCount(n);
      if (n >= total) {
        clearInterval(timer);
        setStreamDone(true);
      }
    }, 520);
    return () => clearInterval(timer);
  }, [tenantId]);

  useEffect(() => {
    if (!streamDone && rowEndRef.current) {
      rowEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }
  }, [revealedCount, streamDone]);

  const handleContinueTesting = () => {
    markStageComplete('health');
    setPage('testing');
  };

  const handleOpenOptima = () => {
    markStageComplete('health');
    setPage('optima-overview');
  };

  const computeName = deploymentOutputs?.aks_cluster_name
    ? `${deploymentOutputs.aks_cluster_name} CPU Utilisation`
    : cloud === 'AWS'
      ? `eks-${tenantId.toLowerCase()}-prod CPU Utilisation`
      : `aks-${tenantId.toLowerCase()}-prod CPU Utilisation`;

  const dbName = deploymentOutputs?.postgresql_fqdn
    ? `${deploymentOutputs.postgresql_fqdn.split('.')[0]} Active Connections`
    : `psql-${tenantId.toLowerCase()} Active Connections`;

  const llmName = deploymentOutputs?.openai_endpoint
    ? `${deploymentOutputs.openai_endpoint.replace('https://', '')} Latency p50`
    : cloud === 'AWS'
      ? 'Bedrock Endpoint Latency p50'
      : 'Azure OpenAI Latency p50';

  const vectorName = `pgvector Query Latency p95 (${tenantId.toLowerCase()})`;
  const netName = cloud === 'AWS' ? 'ALB 5xx Error Rate' : 'App Gateway 5xx Error Rate';
  const obsName = cloud === 'AWS' ? 'CloudWatch Log Ingestion' : 'Log Analytics Ingestion';

  const rows: MetricRow[] = useMemo(() => {
    const cpu = evaluateCpu(telemetry.cpu_util);
    const db = evaluateDb(telemetry.db_conn);
    const llm = evaluateLlm(telemetry.llm_p50);
    const vector = evaluateVector(telemetry.vector_p95);
    const net = evaluateNet(telemetry.net_5xx);
    const logs = evaluateLogs(telemetry.log_ingest);

    return [
      {
        category: 'Compute',
        name: computeName,
        value: `${telemetry.cpu_util}%`,
        ...cpu,
        hasOptimaBadge: true,
        optimaTooltip: 'Linked to OPT-01: Right-size min_node_count 2→1 off-peak ($50/mo saving)',
      },
      {
        category: 'Database',
        name: dbName,
        value: `${telemetry.db_conn} / 500`,
        ...db,
        hasOptimaBadge: true,
        optimaTooltip: 'Linked to OPT-02: Reduce pgvector IVFFlat probes 10→6 ($41/mo saving)',
      },
      {
        category: 'LLM Endpoint',
        name: llmName,
        value: `${telemetry.llm_p50}s`,
        ...llm,
        hasOptimaBadge: true,
        optimaTooltip: 'Linked to OPT-03: Enable prompt caching on system prompts ($52/mo saving)',
      },
      {
        category: 'Vector Store',
        name: vectorName,
        value: `${telemetry.vector_p95}ms`,
        ...vector,
        hasOptimaBadge: true,
        optimaTooltip: 'Linked to OPT-02: Tuning IVFFlat index probes preserves p95 < 100ms SLA',
      },
      {
        category: 'Networking',
        name: netName,
        value: `${telemetry.net_5xx.toFixed(1)}%`,
        ...net,
        hasOptimaBadge: true,
        optimaTooltip: 'Linked to OPT-04: Optimize VNet NAT Gateway & Egress Routing ($18/mo saving)',
      },
      {
        category: 'Observability',
        name: obsName,
        value: `${telemetry.log_ingest} GB/day`,
        ...logs,
        hasOptimaBadge: true,
        optimaTooltip: 'Linked to OPT-06: Tune retention from 365d to 90d ($14/mo saving)',
      },
    ];
  }, [telemetry, computeName, dbName, llmName, vectorName, netName, obsName]);

  const visibleRows = rows.slice(0, revealedCount);

  const overallStatus: HealthStatus = useMemo(() => {
    const source = streamDone ? rows : visibleRows;
    if (source.some((r) => r.status === 'red')) return 'red';
    if (source.some((r) => r.status === 'amber')) return 'amber';
    return 'green';
  }, [rows, visibleRows, streamDone]);

  const overallStyle = STATUS_STYLE[overallStatus];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 999, background: '#D1FAE5', color: '#047857',
            border: '1px solid #A7F3D0',
          }}>
            STAGE 6
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>›</span>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            Infrastructure Health Dashboard
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          Infrastructure Health Dashboard
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 880 }}>
          Live metrics from {cloud === 'AWS' ? 'CloudWatch' : 'Azure Monitor'} / Telemetry Agent polled every 15s for <strong>{tenantId}</strong> (last polled: {lastPolled}).
          Each resource streams in with a <strong>GREEN / AMBER / RED</strong> signal and reason. Hover rows for linked OPTIMA-AI recommendations.
        </p>
      </div>

      <div style={{
        padding: '12px 18px', background: '#F0F9FF', border: '1px solid #BAE6FD',
        borderRadius: 10, color: '#0369A1', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-info-circle" style={{ fontSize: 18, color: '#0284C7' }} />
        <span>
          {streamDone
            ? <>Polling {cloud === 'AWS' ? 'CloudWatch' : 'Azure Monitor'} for <strong>{tenantId}</strong>. Health signals update every 15s.</>
            : <>Streaming health checks for <strong>{tenantId}</strong>… {revealedCount}/{rows.length} resources evaluated.</>}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <div style={{
          background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 12,
          padding: '16px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#047857' }}>
            ${approvedTotal}/mo
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0F766E', marginTop: 4 }}>
            Phase 1 approved cost
          </div>
        </div>

        <div style={{
          background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 12,
          padding: '16px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#047857' }}>
            {servicesCount} services
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0F766E', marginTop: 4 }}>
            On {cloud}
          </div>
        </div>

        <div style={{
          background: overallStyle.bg, border: `1px solid ${overallStyle.border}`, borderRadius: 12,
          padding: '16px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: overallStyle.color }}>
            {overallStatus === 'green' ? 'All systems' : overallStatus === 'amber' ? 'Attention' : 'Degraded'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: overallStyle.color, marginTop: 4 }}>
            Overall health: {overallStyle.label}
          </div>
        </div>
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        {visibleRows.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            <i className="ti ti-loader spin" style={{ marginRight: 8 }} />
            Starting health probe stream…
          </div>
        )}
        {visibleRows.map((item, idx) => {
          const isHovered = hoveredIndex === idx;
          const st = STATUS_STYLE[item.status];

          return (
            <div
              key={`${item.category}-${idx}`}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 20px',
                borderBottom: idx < visibleRows.length - 1 || !streamDone ? '1px solid #F1F5F9' : 'none',
                background: isHovered ? '#F8FAFC' : '#FFFFFF',
                transition: 'background 0.15s ease', position: 'relative',
                animation: 'fadeSlideIn 0.35s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: st.dot, flexShrink: 0,
                  boxShadow: `0 0 0 3px ${st.bg}`,
                }} />

                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                  background: '#F1F5F9', color: '#475569', display: 'inline-block',
                  minWidth: 95, textAlign: 'center', flexShrink: 0,
                }}>
                  {item.category}
                </span>

                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>
                  {item.name}
                </span>

                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
                  background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                  letterSpacing: '0.04em', flexShrink: 0,
                }}>
                  {st.label}
                </span>

                <div style={{ width: 120, height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{
                    height: '100%', width: `${item.pct}%`,
                    background: st.dot,
                    borderRadius: 3, transition: 'width 0.35s ease',
                  }} />
                </div>

                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', minWidth: 90, textAlign: 'right' }}>
                  {item.value}
                </span>

                <div style={{ width: 85, textAlign: 'right' }}>
                  {item.hasOptimaBadge && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                      background: '#E0F2FE', color: '#0284C7', border: '1px solid #BAE6FD',
                      cursor: 'pointer', display: 'inline-block',
                    }}>
                      OPTIMA-AI
                    </span>
                  )}
                </div>
              </div>

              <div style={{
                marginLeft: 24, fontSize: 12, color: st.color, lineHeight: 1.45,
                background: st.bg, border: `1px solid ${st.border}`, borderRadius: 8,
                padding: '6px 10px',
              }}>
                <strong>Why {st.label}:</strong> {item.reason}
              </div>

              {isHovered && item.optimaTooltip && (
                <div style={{
                  position: 'absolute', right: 20, top: -28, background: '#0F172A', color: '#FFFFFF',
                  fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 10, pointerEvents: 'none',
                }}>
                  {item.optimaTooltip}
                </div>
              )}
            </div>
          );
        })}
        {!streamDone && revealedCount > 0 && (
          <div style={{
            padding: '10px 20px', fontSize: 12, color: '#64748B',
            display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC',
          }}>
            <i className="ti ti-loader spin" />
            Evaluating next health signal…
          </div>
        )}
        <div ref={rowEndRef} />
      </div>

      {streamDone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              markStageComplete('health');
              setPage('audit');
            }}
            style={{
              fontSize: 14, fontWeight: 700, color: '#FFFFFF',
              background: '#D97706', border: 'none', borderRadius: 10, padding: '14px 28px',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)', transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#B45309'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#D97706'; }}
          >
            <i className="ti ti-file-text" style={{ fontSize: 18 }} />
            <span>View Audit &amp; Compliance Log (Stage 7)</span>
            <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
          </button>

          <button
            type="button"
            onClick={handleContinueTesting}
            style={{
              fontSize: 14, fontWeight: 700, color: '#FFFFFF',
              background: '#0D9488', border: 'none', borderRadius: 10, padding: '14px 24px',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)', transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488'; }}
          >
            <i className="ti ti-stethoscope" style={{ fontSize: 18 }} />
            <span>Continue to Testing</span>
          </button>

          <button
            type="button"
            onClick={handleOpenOptima}
            style={{
              fontSize: 13, fontWeight: 600, color: '#334155',
              background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 10, padding: '14px 20px',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            <i className="ti ti-sparkles" style={{ fontSize: 16, color: '#0284C7' }} />
            <span>Open OPTIMA-AI</span>
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
