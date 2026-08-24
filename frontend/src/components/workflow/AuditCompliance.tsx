/**
 * Stage 7 — Audit & Compliance Log
 * Live events from PostgreSQL activity_events (polled). One-line summary in table;
 * full detail on hover. Proper absolute timestamps. Rows stream in for viewer UX.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { activityApi } from '@/services/api';

interface AuditEventRow {
  id: string;
  summary: string;
  detail: string;
  actor: string;
  role: 'Provider Admin' | 'Tenant Admin' | 'Tenant User' | 'System';
  timestamp: string;
  rawIso: string;
  kind?: string;
  dotColor: string;
}

const ROLE_BADGES: Record<string, { bg: string; color: string }> = {
  'Provider Admin': { bg: '#F3E8FF', color: '#7E22CE' },
  'Tenant Admin':   { bg: '#CCFBF1', color: '#0F766E' },
  'Tenant User':    { bg: '#DCFCE7', color: '#15803D' },
  'System':         { bg: '#F1F5F9', color: '#475569' },
};

const formatRoleBadge = (rStr?: string): AuditEventRow['role'] => {
  if (!rStr) return 'System';
  const r = String(rStr).trim();
  if (r === 'Provider Admin' || r === 'PROVIDER_ADMIN' || r === 'Provider User' || r === 'PROVIDER_USER') return 'Provider Admin';
  if (r === 'Tenant Admin' || r === 'TENANT_ADMIN') return 'Tenant Admin';
  if (r === 'Tenant User' || r === 'TENANT_USER') return 'Tenant User';
  if (r.toLowerCase().includes('tenant admin')) return 'Tenant Admin';
  if (r.toLowerCase().includes('tenant user')) return 'Tenant User';
  if (r.toLowerCase().includes('provider')) return 'Provider Admin';
  return 'System';
};

/** Absolute timestamp for audit (e.g. 05 Aug 2026, 18:42:11) */
const formatTimestamp = (rawTime?: string | number): { display: string; iso: string } => {
  if (!rawTime) {
    const now = new Date();
    return { display: now.toLocaleString(), iso: now.toISOString() };
  }
  try {
    let str = String(rawTime).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(str) && !str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
      str += 'Z';
    }
    let date = new Date(str);
    if (isNaN(date.getTime())) date = new Date(String(rawTime));
    if (isNaN(date.getTime())) {
      return { display: String(rawTime), iso: String(rawTime) };
    }
    const display = date.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return { display, iso: date.toISOString() };
  } catch {
    return { display: String(rawTime), iso: String(rawTime) };
  }
};

/** One-line summary; keep detail for hover */
const buildSummaryAndDetail = (message?: string, detail?: string, kind?: string): { summary: string; detail: string } => {
  const msg = (message || '').trim();
  const det = (detail || '').trim();
  let summary = msg;
  if (det && msg.includes(` — ${det}`)) {
    summary = msg.slice(0, msg.length - (` — ${det}`).length).trim();
  } else if (msg.includes(' — ')) {
    summary = msg.split(' — ')[0].trim();
  }
  if (!summary) summary = kind ? `${kind} event` : 'Audit event';
  if (summary.length > 92) summary = `${summary.slice(0, 89)}…`;

  const fullDetail = [msg || summary, det && !msg.includes(det) ? det : '']
    .filter(Boolean)
    .join('\n');
  return { summary, detail: fullDetail || summary };
};

const dotForRole = (role: AuditEventRow['role']) => {
  if (role === 'Provider Admin') return '#7C3AED';
  if (role === 'Tenant Admin') return '#0D9488';
  if (role === 'Tenant User') return '#16A34A';
  return '#64748B';
};

export default function AuditCompliance() {
  const { markStageComplete, setPage } = useAppStore();

  const [apiEvents, setApiEvents] = useState<any[]>([]);
  const [feedSig, setFeedSig] = useState('');
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [streamDone, setStreamDone] = useState(false);
  const rowEndRef = useRef<HTMLDivElement>(null);

  const fetchPgActivity = async () => {
    try {
      const res = await activityApi.list(100);
      const events = res?.data?.events;
      if (Array.isArray(events)) {
        setApiEvents(events);
        setFeedSig(events.map((e: any) => e.id || e.createdAt || e.message).join('|'));
      }
    } catch (err) {
      console.warn('Failed to fetch PostgreSQL activity logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPgActivity();
    const timer = setInterval(fetchPgActivity, 10000);
    return () => clearInterval(timer);
  }, []);

  const allRows: AuditEventRow[] = useMemo(() => {
    return apiEvents.map((e, idx) => {
      const rawRole = e.fromRole || e.from_role || e.role;
      const rawName = e.fromName || e.from_name || e.actor;
      const rawTime = e.createdAt || e.created_at || e.time;
      const role = formatRoleBadge(rawRole);
      const toName = e.toName || e.to_name;
      let actor = rawName || 'System';
      if (toName && toName !== actor) {
        actor = `${rawName || 'System'} → ${toName}`;
      }
      const { summary, detail } = buildSummaryAndDetail(e.message, e.detail, e.kind);
      const { display, iso } = formatTimestamp(rawTime);
      return {
        id: e.id || `evt-${idx}`,
        summary,
        detail,
        actor,
        role,
        timestamp: display,
        rawIso: iso,
        kind: e.kind,
        dotColor: dotForRole(role),
      };
    });
  }, [apiEvents]);

  // Stream table rows in one-by-one when dataset (re)loads
  useEffect(() => {
    if (loading) return;
    setRevealedCount(0);
    setStreamDone(false);
    if (allRows.length === 0) {
      setStreamDone(true);
      return;
    }
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setRevealedCount(n);
      if (n >= allRows.length) {
        clearInterval(timer);
        setStreamDone(true);
      }
    }, 280);
    return () => clearInterval(timer);
  }, [loading, feedSig, allRows.length]);

  useEffect(() => {
    if (!streamDone && rowEndRef.current) {
      rowEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }
  }, [revealedCount, streamDone]);

  const visibleRows = allRows.slice(0, revealedCount);
  const uniqueKinds = useMemo(
    () => new Set(allRows.map((r) => r.kind).filter(Boolean)).size || Math.min(24, allRows.length),
    [allRows],
  );

  const handleContinueTesting = () => {
    markStageComplete('audit');
    setPage('testing');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 999, background: '#FEF3C7', color: '#D97706',
            border: '1px solid #FDE68A',
          }}>
            STAGE 7
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>›</span>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            Audit &amp; Compliance Log
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          Audit &amp; Compliance Log
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 880 }}>
          Live audit trail from PostgreSQL activity events (refreshed every 10s). Dual-write: 90-day hot store + Object Lock WORM cold store.
          Event column shows a one-line summary — hover a row for full detail.
        </p>
      </div>

      <div style={{
        padding: '12px 18px', background: '#FEF3C7', border: '1px solid #FDE68A',
        borderRadius: 10, color: '#B45309', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 18 }} />
        <span>
          {loading
            ? 'Loading live events from PostgreSQL…'
            : streamDone
              ? <>Showing <strong>{allRows.length}</strong> live event{allRows.length === 1 ? '' : 's'} from activity feed. Hover any row for detailed audit context.</>
              : <>Streaming audit rows… {revealedCount}/{allRows.length}</>}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '16px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>
            {allRows.length}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginTop: 4 }}>
            Events in sample (from PostgreSQL)
          </div>
        </div>

        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '16px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0D9488' }}>
            {uniqueKinds || 24}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginTop: 4 }}>
            Event types in current feed
          </div>
        </div>

        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '16px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0D9488' }}>
            90d
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginTop: 4 }}>
            Hot store retention
          </div>
        </div>
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(15,23,42,0.02)', position: 'relative',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>EVENT</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 200 }}>ACTOR</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 130 }}>ROLE</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 170, textAlign: 'right' }}>TIMESTAMP</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                  <i className="ti ti-loader spin" style={{ marginRight: 8 }} />
                  Fetching live audit events…
                </td>
              </tr>
            )}
            {!loading && allRows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                  No activity events yet. Complete earlier workflow stages to populate the audit log.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => {
              const roleBadge = ROLE_BADGES[row.role] || { bg: '#F1F5F9', color: '#475569' };
              const hovered = hoveredId === row.id;
              return (
                <tr
                  key={row.id}
                  onMouseEnter={() => setHoveredId(row.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    background: hovered ? '#FFFBEB' : '#FFFFFF',
                    transition: 'background 0.15s ease',
                    position: 'relative',
                  }}
                >
                  <td style={{ padding: '14px 20px', color: '#0F172A', fontWeight: 600, maxWidth: 420, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', marginTop: 5,
                        background: row.dotColor, flexShrink: 0,
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          maxWidth: 380,
                        }}>
                          {row.summary}
                        </div>
                        {hovered && (
                          <div style={{
                            position: 'absolute', left: 36, top: '100%', marginTop: 4, zIndex: 20,
                            maxWidth: 480, padding: '10px 12px', borderRadius: 8,
                            background: '#0F172A', color: '#F8FAFC', fontSize: 12, fontWeight: 500,
                            lineHeight: 1.45, whiteSpace: 'pre-wrap',
                            boxShadow: '0 8px 24px rgba(15,23,42,0.28)',
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>
                              Event detail
                            </div>
                            {row.detail}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', color: '#475569', fontWeight: 500 }}>
                    {row.actor}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                      background: roleBadge.bg, color: roleBadge.color, display: 'inline-block',
                    }}>
                      {row.role}
                    </span>
                  </td>
                  <td
                    style={{ padding: '14px 20px', color: '#334155', textAlign: 'right', fontWeight: 600, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                    title={row.rawIso}
                  >
                    {row.timestamp}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!streamDone && !loading && allRows.length > 0 && (
          <div style={{
            padding: '10px 20px', fontSize: 12, color: '#64748B', background: '#F8FAFC',
            display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #F1F5F9',
          }}>
            <i className="ti ti-loader spin" />
            Streaming next audit event…
          </div>
        )}
        <div ref={rowEndRef} />
      </div>

      {streamDone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleContinueTesting}
            style={{
              fontSize: 14, fontWeight: 700, color: '#FFFFFF',
              background: '#059669', border: 'none', borderRadius: 10, padding: '14px 28px',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)', transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#047857'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#059669'; }}
          >
            <span>Continue to Integration Testing &amp; QA (Stage 8)</span>
            <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
          </button>

          <button
            type="button"
            onClick={() => setPage('health')}
            style={{
              fontSize: 13, fontWeight: 600, color: '#334155',
              background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 10, padding: '14px 20px',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            <i className="ti ti-arrow-left" />
            <span>Back to Infrastructure Health (Stage 6)</span>
          </button>
        </div>
      )}
    </div>
  );
}
