/**
 * Cross-Role Activity Feed — live events from PostgreSQL.
 * Sourced from Provider Admin / Provider User / Tenant Admin / Tenant User actions.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { activityApi } from '@/services/api';
import { ROLE_META, type PortalRole } from '@/lib/rbac';

type ActivityKind = 'invite' | 'escalation' | 'intake' | 'provision' | 'capability' | 'approval' | 'notification';

type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  fromRole: PortalRole | string;
  toRole: PortalRole | string;
  fromName: string;
  toName: string;
  message: string;
  detail?: string | null;
  unread: boolean;
  createdAt?: string | null;
};

const KIND_META: Record<string, { icon: string; bg: string; color: string; unreadBg?: string; unreadBorder?: string }> = {
  invite: { icon: 'ti-user-plus', bg: '#DBEAFE', color: '#2563EB', unreadBg: '#EFF6FF' },
  escalation: { icon: 'ti-alert-triangle', bg: '#FFEDD5', color: '#EA580C', unreadBg: '#FFFBEB', unreadBorder: '#FDBA74' },
  intake: { icon: 'ti-circle-check', bg: '#D1FAE5', color: '#059669' },
  provision: { icon: 'ti-lock', bg: '#EDE9FE', color: '#7C3AED' },
  capability: { icon: 'ti-shield-check', bg: '#CFFAFE', color: '#0891B2', unreadBg: '#ECFEFF' },
  approval: { icon: 'ti-checks', bg: '#D1FAE5', color: '#047857' },
  notification: { icon: 'ti-bell', bg: '#E0F2FE', color: '#0284C7', unreadBg: '#F0F9FF' },
};

function relativeTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role as PortalRole];
  const color = meta?.color || '#64748B';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      color, background: `${color}18`, border: `1px solid ${color}44`, whiteSpace: 'nowrap',
    }}>
      {role}
    </span>
  );
}

function mapEvent(d: any): ActivityEvent {
  return {
    id: d.id,
    kind: d.kind || 'notification',
    fromRole: d.fromRole,
    toRole: d.toRole,
    fromName: d.fromName,
    toName: d.toName,
    message: d.message,
    detail: d.detail,
    unread: Boolean(d.unread),
    createdAt: d.createdAt,
  };
}

export default function ActivityFeed() {
  const { currentRole } = useAppStore();
  const [feed, setFeed] = useState<ActivityEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifTo, setNotifTo] = useState<PortalRole>('Provider User');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await activityApi.list(100);
      const data = res.data || {};
      setFeed((data.events || []).map(mapEvent));
      setUnreadCount(Number(data.unreadCount || 0));
    } catch {
      setError('Could not load activity feed from PostgreSQL. Ensure the backend is running.');
      setFeed([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const markAllRead = async () => {
    try {
      await activityApi.markAllRead();
      setFeed((prev) => prev.map((e) => ({ ...e, unread: false })));
      setUnreadCount(0);
      setToast('All activity marked as read.');
    } catch {
      setToast('Could not mark all as read.');
    }
  };

  const markOneRead = async (id: string) => {
    try {
      await activityApi.markRead(id);
      setFeed((prev) => prev.map((e) => (e.id === id ? { ...e, unread: false } : e)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  const sendNotification = async () => {
    if (!notifTitle.trim()) {
      setToast('Enter a notification title.');
      return;
    }
    const fromRole = (['Provider Admin', 'Provider User', 'Tenant Admin', 'Tenant User'].includes(currentRole)
      ? currentRole
      : 'Provider Admin') as PortalRole;
    try {
      await activityApi.create({
        kind: 'notification',
        from_role: fromRole,
        to_role: notifTo,
        from_name: fromRole,
        to_name: notifTo,
        message: notifTitle.trim(),
        detail: notifBody.trim() || null,
      });
      setNotifTitle('');
      setNotifBody('');
      setToast('Cross-role notification saved to PostgreSQL and posted to the feed.');
      await refresh();
    } catch {
      setToast('Could not save notification to the backend.');
    }
  };

  return (
    <div style={{ maxWidth: 920 }}>
      {toast && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
          background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857',
        }}>
          {toast}
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ float: 'right', border: 'none', background: 'transparent', cursor: 'pointer', color: '#047857' }}
          >
            <i className="ti ti-x" />
          </button>
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
          background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C',
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)', marginBottom: 18,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 18px', borderBottom: '1px solid #F1F5F9',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Activity Feed</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              {unreadCount} unread · {feed.length} events
              <span style={{ marginLeft: 8, color: '#94A3B8' }}>
                · live from PostgreSQL
                {loading ? ' · refreshing…' : ''}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => void refresh()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', fontSize: 12, fontWeight: 600,
                color: '#0F766E', background: '#F0FDFA', border: '1px solid #99F6E4',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              <i className="ti ti-refresh" style={{ fontSize: 14 }} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', fontSize: 12, fontWeight: 600,
                color: unreadCount === 0 ? '#94A3B8' : '#0F766E',
                background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 8,
                cursor: unreadCount === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <i className="ti ti-checks" style={{ fontSize: 14 }} />
              Mark all read
            </button>
          </div>
        </div>

        {feed.length === 0 && !loading ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            No activity yet. Events appear here when Provider Admin invites users, Provider Users
            request capabilities, Tenant Admins submit edits, Tenant Users submit intake, or cost
            escalations occur.
          </div>
        ) : (
          <div>
            {feed.map((e) => {
              const meta = KIND_META[e.kind] || KIND_META.notification;
              return (
                <div
                  key={e.id}
                  onClick={() => e.unread && void markOneRead(e.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '14px 18px',
                    borderBottom: '1px solid #F1F5F9',
                    background: e.unread ? (meta.unreadBg || '#F8FAFC') : '#FFFFFF',
                    borderLeft: e.unread && meta.unreadBorder
                      ? `3px solid ${meta.unreadBorder}`
                      : e.unread
                        ? `3px solid ${meta.color}55`
                        : '3px solid transparent',
                    cursor: e.unread ? 'pointer' : 'default',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: meta.bg, color: meta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className={`ti ${meta.icon}`} style={{ fontSize: 16 }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <RoleBadge role={String(e.fromRole)} />
                      <i className="ti ti-arrow-right" style={{ fontSize: 12, color: '#94A3B8' }} />
                      <RoleBadge role={String(e.toRole)} />
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.45 }}>
                      <strong style={{ color: '#0F172A' }}>{e.fromName}</strong>
                      <span style={{ color: '#94A3B8' }}> → </span>
                      <span style={{ color: '#475569' }}>{e.toName}</span>
                      <span style={{ color: '#64748B' }}>: {e.message}</span>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
                    flexShrink: 0, paddingTop: 2,
                  }}>
                    <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                      {relativeTime(e.createdAt)}
                    </span>
                    {e.unread && (
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: e.kind === 'escalation' ? '#EA580C' : '#2563EB',
                      }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18,
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
          Send cross-role notification
        </div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
          Persists to the <code>activity_events</code> PostgreSQL table and appears in this feed.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 10, marginBottom: 10 }}>
          <input
            value={notifTitle}
            onChange={(e) => setNotifTitle(e.target.value)}
            placeholder="Notification title"
            style={{
              padding: '10px 12px', fontSize: 13, borderRadius: 8,
              border: '1px solid #E2E8F0', background: '#F8FAFC', outline: 'none',
            }}
          />
          <select
            value={notifTo}
            onChange={(e) => setNotifTo(e.target.value as PortalRole)}
            style={{
              padding: '10px 12px', fontSize: 13, borderRadius: 8,
              border: '1px solid #E2E8F0', background: '#F8FAFC', outline: 'none',
            }}
          >
            {(['Provider Admin', 'Provider User', 'Tenant Admin', 'Tenant User'] as PortalRole[]).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <textarea
          value={notifBody}
          onChange={(e) => setNotifBody(e.target.value)}
          rows={2}
          placeholder="Optional detail…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 13,
            borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC',
            outline: 'none', resize: 'vertical', marginBottom: 12,
          }}
        />
        <button
          type="button"
          onClick={() => void sendNotification()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
            background: '#0D9488', border: 'none', borderRadius: 8, cursor: 'pointer',
          }}
        >
          <i className="ti ti-send" style={{ fontSize: 14 }} />
          Send notification
        </button>
      </div>
    </div>
  );
}
