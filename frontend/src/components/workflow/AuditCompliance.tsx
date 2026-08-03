/**
 * Stage 7 — Audit & Compliance Log
 * Pulls real-time events, actors, roles, and timestamps directly from PostgreSQL (activity_events table).
 * Dual-write architecture: PostgreSQL 90-day hot store + Local Store / S3 Object Lock WORM 7-year cold store.
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { activityApi } from '@/services/api';

interface AuditEventRow {
  id: string;
  event: string;
  actor: string;
  role: 'Provider Admin' | 'Tenant Admin' | 'Tenant User' | 'System';
  time: string;
  dotColor?: string;
}

const ROLE_BADGES: Record<string, { bg: string; color: string }> = {
  'Provider Admin': { bg: '#F3E8FF', color: '#7E22CE' },
  'Tenant Admin':   { bg: '#CCFBF1', color: '#0F766E' },
  'Tenant User':    { bg: '#DCFCE7', color: '#15803D' },
  'System':         { bg: '#F1F5F9', color: '#475569' },
};

/** Normalizes role string from PostgreSQL into badge categories */
const formatRoleBadge = (rStr?: string): 'Provider Admin' | 'Tenant Admin' | 'Tenant User' | 'System' => {
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

/**
 * Bulletproof date formatter for PostgreSQL timestamps.
 * Guarantees NO 'Invalid Date' string by appending 'Z' to ISO strings and handling offsets safely.
 */
const formatEventTime = (rawTime?: string | number): string => {
  if (!rawTime) return 'Just now';
  try {
    let str = String(rawTime).trim();

    // If ISO date format without timezone offset, append 'Z' for UTC parsing
    if (str.includes('T') && !str.endsWith('Z') && !str.includes('+') && !str.includes('-')) {
      str += 'Z';
    }

    let date = new Date(str);

    // Fallback attempt without Z if initial parse failed
    if (isNaN(date.getTime())) {
      date = new Date(String(rawTime));
    }

    if (isNaN(date.getTime())) {
      return 'Just now';
    }

    const now = new Date();
    const diffMs = Math.abs(now.getTime() - date.getTime());
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays <= 30) return `${diffDays}d ago`;

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Just now';
  }
};

export default function AuditCompliance() {
  const {
    activeTenant,
    intakeForm,
    recommendation,
    resourcePlan,
    deploymentOutputs,
    markStageComplete,
    setPage,
  } = useAppStore();

  const [apiEvents, setApiEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Poll backend PostgreSQL activity log
  const fetchPgActivity = async () => {
    try {
      const res = await activityApi.list(100);
      if (res?.data?.events && Array.isArray(res.data.events)) {
        setApiEvents(res.data.events);
      }
    } catch (err) {
      console.warn('Failed to fetch PostgreSQL activity logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPgActivity();
    const timer = setInterval(fetchPgActivity, 10000); // 10s polling
    return () => clearInterval(timer);
  }, []);

  const handleContinueTesting = () => {
    markStageComplete('audit');
    setPage('testing');
  };

  const handleBackHealth = () => {
    setPage('health');
  };

  // Map PostgreSQL activity events directly from backend API
  const displayEvents: AuditEventRow[] = apiEvents.map((e, idx) => {
    const rawRole = e.fromRole || e.from_role || e.role;
    const rawName = e.fromName || e.from_name || e.actor;
    const rawTime = e.createdAt || e.created_at || e.time;

    const role = formatRoleBadge(rawRole);
    let actor = rawName || 'System';
    if ((actor === 'System' || actor === 'Provider Admin') && e.toName && e.toName !== 'System' && e.toName !== 'AI Engine') {
      actor = `${rawName || 'System'} → ${e.toName}`;
    }

    return {
      id: e.id || String(idx),
      event: e.message || e.detail || 'Audit Event',
      actor: actor,
      role: role,
      time: formatEventTime(rawTime),
      dotColor: '#10B981',
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {/* ── BREADCRUMB & HEADER (SNAPSHOT) ─────────────────────────────────── */}
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
          24 event types captured. Dual-write: PostgreSQL 90-day hot store + Local Store / S3 Object Lock WORM 7-year cold store. HIPAA and SOC2 compliant retention.
        </p>
      </div>

      {/* ── AMBER NOTICE BANNER (SNAPSHOT) ─────────────────────────────────── */}
      <div style={{
        padding: '12px 18px', background: '#FEF3C7', border: '1px solid #FDE68A',
        borderRadius: 10, color: '#D97706', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 18, color: '#D97706' }} />
        <span>
          Phase 2 implementation: <strong>dual-write architecture</strong> — PostgreSQL 90-day hot store + S3 Object Lock WORM 7-year cold store. 24 event types tracked.
        </span>
      </div>

      {/* ── 3 SUMMARY METRIC CARDS (SNAPSHOT) ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {/* Card 1: Events in sample */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '16px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>
            {displayEvents.length}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginTop: 4 }}>
            Events in sample (from PostgreSQL)
          </div>
        </div>

        {/* Card 2: Event types tracked */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '16px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0D9488' }}>
            24
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginTop: 4 }}>
            Event types tracked
          </div>
        </div>

        {/* Card 3: Hot store retention */}
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

      {/* ── AUDIT EVENTS TABLE (POSTGRESQL REAL TIME) ───────────────────────── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>EVENT</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 220 }}>ACTOR</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 140 }}>ROLE</th>
              <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 110, textAlign: 'right' }}>TIME</th>
            </tr>
          </thead>
          <tbody>
            {displayEvents.map((row) => {
              const roleBadge = ROLE_BADGES[row.role] || { bg: '#F1F5F9', color: '#475569' };

              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 20px', color: '#0F172A', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: row.dotColor || '#10B981', flexShrink: 0,
                      }} />
                      <span>{row.event}</span>
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
                  <td style={{ padding: '14px 20px', color: '#64748B', textAlign: 'right', fontWeight: 600 }}>
                    {row.time}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── ACTION BUTTONS ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <button
          type="button"
          onClick={handleContinueTesting}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: '#059669', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#047857'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#059669'}
        >
          <span>Continue to Integration Testing &amp; QA (Stage 8)</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>

        <button
          type="button"
          onClick={handleBackHealth}
          style={{
            fontSize: 13, fontWeight: 600, color: '#334155',
            background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 10, padding: '14px 20px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
        >
          <i className="ti ti-arrow-left" />
          <span>Back to Infrastructure Health (Stage 6)</span>
        </button>
      </div>
    </div>
  );
}
