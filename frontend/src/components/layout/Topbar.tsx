/**
 * Topbar — brand, home navigation, role switcher, activity bell.
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { activityApi } from '@/services/api';
import { canSeeAdminNav } from '@/lib/rbac';

const ROLES = [
  { name: 'Provider Admin', color: '#7C3AED', desc: 'Level 4 · Full platform access' },
  { name: 'Provider User',  color: '#0891B2', desc: 'Level 3 · View-only platform' },
  { name: 'Tenant Admin',   color: '#0D9488', desc: 'Level 2 · Tenant scope' },
  { name: 'Tenant User',    color: '#2563EB', desc: 'Level 1 · Feature access' },
];

const HOME_ROLE = ROLES[0]; // Provider Admin only on home

export default function Topbar() {
  const { currentRole, setRole, currentPage, setPage } = useAppStore();
  const [ddOpen, setDdOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const isHome = currentPage === 'home';
  const activeRole = ROLES.find(r => r.name === currentRole) ?? HOME_ROLE;
  const showBell = !isHome && canSeeAdminNav(currentRole);

  useEffect(() => {
    if (isHome && currentRole !== HOME_ROLE.name) {
      setRole(HOME_ROLE.name);
    }
    if (isHome) setDdOpen(false);
  }, [isHome, currentRole, setRole]);

  useEffect(() => {
    if (!showBell) return;
    let cancelled = false;
    const load = () => {
      activityApi.unreadCount()
        .then((res) => {
          if (!cancelled) setUnread(Number(res.data?.unreadCount || 0));
        })
        .catch(() => {
          if (!cancelled) setUnread(0);
        });
    };
    load();
    const t = window.setInterval(load, 20000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [showBell, currentPage]);

  return (
    <header style={{
      height: 52, background: '#0F172A', display: 'flex',
      alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0,
      borderBottom: '1px solid #1E293B',
    }}>
      {/* Brand & Home */}
      <div
        onClick={() => setPage('home')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
      >
        <div style={{
          width: 32, height: 32, background: '#0D9488', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="ti ti-circuit-cell" style={{ fontSize: 18, color: '#fff' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
          Feuji GENTERA
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#94A3B8',
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 'min(420px, 42vw)',
          }}
          title="GenAI Terraform Enterprise Resource Automation"
        >
          GenAI Terraform Enterprise Resource Automation
        </span>
      </div>

      {/* Nav Home Pill */}
      {!isHome && (
        <button
          onClick={() => setPage('home')}
          style={{
            marginLeft: 12, display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(13, 148, 136, 0.15)', color: '#14B8A6',
            border: '1px solid rgba(13, 148, 136, 0.3)', borderRadius: 6,
            padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <i className="ti ti-home" style={{ fontSize: 14 }} />
          <span>Home Overview</span>
        </button>
      )}

      {/* Role switcher & controls */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
        {showBell && (
          <button
            type="button"
            onClick={() => setPage('activity-feed')}
            title="Cross-Role Activity Feed"
            style={{
              position: 'relative',
              width: 34, height: 34, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: currentPage === 'activity-feed' ? '#1E293B' : 'transparent',
              border: '1px solid #334155', cursor: 'pointer', color: '#E2E8F0',
            }}
          >
            <i className="ti ti-bell" style={{ fontSize: 16 }} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                minWidth: 14, height: 14, borderRadius: 999,
                background: '#EF4444', color: '#fff',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', border: '1.5px solid #0F172A',
              }}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 2,
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid rgba(56, 189, 248, 0.28)',
            background: 'rgba(14, 165, 233, 0.08)',
            maxWidth: 'min(420px, 38vw)',
          }}
          title="Tools & tech stack powering GENTERA"
        >
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#94A3B8', textTransform: 'uppercase' }}>
            Powered by
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#38BDF8',
              letterSpacing: '0.01em',
              lineHeight: 1.25,
              textAlign: 'right',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            React · FastAPI · Terraform · PostgreSQL · Redis · Docker · AWS · Azure
          </span>
        </div>

        {isHome ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: '#1E293B',
              borderRadius: 8,
              padding: '6px 12px',
              border: '1px solid rgba(124, 58, 237, 0.35)',
            }}
            title="Home page role is fixed to Provider Admin"
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: HOME_ROLE.color }} />
            <span style={{ fontSize: 11, color: '#94A3B8' }}>Role:</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{HOME_ROLE.name}</span>
          </div>
        ) : (
          <>
            <button
              onClick={() => setDdOpen(!ddOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: '#1E293B', borderRadius: 8, padding: '6px 12px',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--fn)',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeRole.color }} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>Role:</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{currentRole}</span>
              <i className="ti ti-chevron-down" style={{ fontSize: 12, color: '#94A3B8' }} />
            </button>

            {ddOpen && (
              <div style={{
                position: 'absolute', top: 46, right: 0, background: '#1E293B',
                border: '1px solid #334155', borderRadius: 12, padding: 6,
                zIndex: 300, minWidth: 210, boxShadow: '0 10px 30px rgba(0,0,0,.4)',
              }}>
                {ROLES.map(role => (
                  <div
                    key={role.name}
                    onClick={() => { setRole(role.name); setDdOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: role.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{role.name}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{role.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
}
