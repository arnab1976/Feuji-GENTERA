/**
 * Sidebar — Phase 1 (LLM Kit) + Phase 2 (OPTIMA-AI) navigation.
 * Phase 2 section is always visible but shows a gate when Phase 1
 * prerequisites are not met (handled inside each OPTIMA screen).
 */
import { useAppStore } from '@/store/appStore';
import type { PageId } from '@/types';
import { canSeeAdminNav, canSeeTenantAdminPortal, canUseWorkflow, canViewOptima } from '@/lib/rbac';

interface NavItem {
  id: PageId; icon: string; label: string; badge?: string;
  phase2?: boolean; stageNum?: number;
}

const ADMIN_ITEMS: NavItem[] = [
  { id: 'provider',      icon: 'ti-building',     label: 'Provider Admin' },
  { id: 'provider-user', icon: 'ti-user-check',   label: 'Provider User' },
  { id: 'tenant',        icon: 'ti-users',        label: 'Tenant Admin' },
  { id: 'tenant-user',   icon: 'ti-user-plus',    label: 'Tenant User' },
  { id: 'rbac',          icon: 'ti-shield-lock',  label: 'Roles & Access' },
  { id: 'activity-feed', icon: 'ti-bell',         label: 'Activity Feed' },
];

const TENANT_ADMIN_ITEMS: NavItem[] = [
  { id: 'tenant-admin-portal', icon: 'ti-user-cog', label: 'Tenant Admin Portal' },
  { id: 'tenant',              icon: 'ti-users',    label: 'Tenant Admin' },
];

const WORKFLOW_ITEMS: NavItem[] = [
  { id: 'intake',    icon: 'ti-forms',          label: 'Intake Form',         stageNum: 1 },
  { id: 'ai',        icon: 'ti-robot',          label: 'AI Recommendation',   stageNum: 2 },
  { id: 'cost',      icon: 'ti-calculator',     label: 'Cost & Review',       stageNum: 3 },
  { id: 'terraform', icon: 'ti-code',           label: 'Terraform Generation',stageNum: 4 },
  { id: 'jumpbox',   icon: 'ti-box',            label: 'Execution Engine',    stageNum: 5 },
  { id: 'health',    icon: 'ti-activity',       label: 'Health Dashboard',    stageNum: 6 },
  { id: 'audit',     icon: 'ti-shield-check',   label: 'Audit & Compliance',  stageNum: 7 },
  { id: 'testing',   icon: 'ti-test-pipe',      label: 'Testing & QA',        stageNum: 8 },
  { id: 'launch',    icon: 'ti-rocket',         label: 'Launch & Operations', stageNum: 9 },
];

const OPTIMA_ITEMS: NavItem[] = [
  { id: 'optima-overview',  icon: 'ti-gauge',            label: 'FinOps Overview',   phase2: true },
  { id: 'optima-scan',      icon: 'ti-scan',             label: 'Cost Breakdown',    phase2: true },
  { id: 'optima-recs',      icon: 'ti-bulb',             label: 'Recommendations',   phase2: true },
  { id: 'optima-approval',  icon: 'ti-clipboard-check',  label: 'Approval Workflow', phase2: true },
  { id: 'optima-savings',   icon: 'ti-trending-down',    label: 'Savings Dashboard', phase2: true },
];

export default function Sidebar() {
  const { currentPage, setPage, completedStages, currentRole } = useAppStore();
  const stageList = ['intake','ai','cost','terraform','jumpbox','health','audit','testing','launch'];
  const showAdmin = canSeeAdminNav(currentRole);
  const showTenantAdminPortal = canSeeTenantAdminPortal(currentRole);
  const showWorkflow = canUseWorkflow(currentRole);
  const showOptima = canViewOptima(currentRole);

  const navItem = (item: NavItem) => {
    const isActive = currentPage === item.id;
    const isDone = item.stageNum !== undefined && Array.isArray(completedStages) && completedStages.includes(item.id);
    const isOptima = item.phase2;

    return (
      <div
        key={item.id}
        onClick={() => setPage(item.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
          marginBottom: 2, transition: '0.15s',
          borderLeft: isActive
            ? `2px solid ${isOptima ? '#0EA5E9' : '#0D9488'}`
            : '2px solid transparent',
          background: isActive ? '#1E293B' : 'transparent',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#1E293B'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        <i className={`ti ${isDone ? 'ti-check' : item.icon}`}
          style={{
            fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0,
            color: isActive ? (isOptima ? '#0EA5E9' : '#fff')
              : isDone ? '#059669'
              : isOptima ? '#0891B2'
              : '#94A3B8',
          }}
        />
        <span style={{
          fontSize: 12.5, flex: 1,
          color: isActive ? '#fff' : isDone ? '#059669' : '#94A3B8',
        }}>
          {item.label}
        </span>
        {item.stageNum !== undefined && (
          <div style={{
            width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: isActive ? '#0D9488' : isDone ? '#059669' : '#334155',
            color: isActive || isDone ? '#fff' : '#94A3B8',
          }}>
            {isDone ? <i className="ti ti-check" style={{ fontSize: 10 }} /> : item.stageNum}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav style={{
      width: 236, background: '#0F172A', display: 'flex',
      flexDirection: 'column', overflowY: 'auto', flexShrink: 0,
    }}>
      {/* Platform Administration — Provider Admin & Provider User */}
      {showAdmin && (
        <div style={{ padding: '14px 12px 4px' }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase',
            letterSpacing: '0.1em', padding: '0 6px', marginBottom: 6,
          }}>Platform Administration</div>
          {ADMIN_ITEMS.map(navItem)}
        </div>
      )}

      {/* Tenant Admin portal */}
      {showTenantAdminPortal && (
        <div style={{ padding: '14px 12px 4px' }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase',
            letterSpacing: '0.1em', padding: '0 6px', marginBottom: 6,
          }}>Tenant Administration</div>
          {TENANT_ADMIN_ITEMS.map(navItem)}
        </div>
      )}

      {(showAdmin || showTenantAdminPortal) && showWorkflow && (
        <div style={{ height: 1, background: '#1E293B', margin: '8px 12px' }} />
      )}

      {/* Workflow Stages — Tenant + Provider Admin */}
      {showWorkflow && (
        <div style={{ padding: '14px 12px 4px' }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase',
            letterSpacing: '0.1em', padding: '0 6px', marginBottom: 6,
          }}>Workflow Stages</div>
          {WORKFLOW_ITEMS.map(navItem)}
        </div>
      )}

      {/* Phase 2 OPTIMA-AI — derived from Phase 1 */}
      {showOptima && (
        <>
          <div style={{
            height: 1, margin: '8px 12px',
            background: 'linear-gradient(to right, transparent, #0EA5E9, transparent)',
          }} />
          <div style={{ padding: '14px 12px 4px' }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#0EA5E9', textTransform: 'uppercase',
              letterSpacing: '0.1em', padding: '0 6px', marginBottom: 4,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#0EA5E9',
                display: 'inline-block', animation: 'pulse-dot 1.8s infinite',
              }} />
              Phase 2 — OPTIMA-AI
            </div>
            <div style={{ fontSize: 10, color: '#64748B', padding: '0 6px 6px', lineHeight: 1.45 }}>
              GenAI FinOps derived from your provisioned LLM Kit infrastructure
            </div>
            {OPTIMA_ITEMS.map(navItem)}
          </div>
        </>
      )}

      {!showAdmin && !showTenantAdminPortal && !showWorkflow && !showOptima && (
        <div style={{ padding: 16, fontSize: 12, color: '#94A3B8' }}>
          No modules available for this role.
        </div>
      )}
    </nav>
  );
}
