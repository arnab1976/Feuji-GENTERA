/**
 * Roles & Access — GENTERA four-persona RBAC.
 * 1) Access hierarchy diagram  2) Permission matrix (feature + API)  3) Active PU / TA lists
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi } from '@/services/api';
import { ROLE_META, type PortalRole } from '@/lib/rbac';
import type { InvitedUser } from '@/types';

type Cell = true | false | 'own';

type MatrixRow = {
  feature: string;
  endpoint: string;
  roles: Record<PortalRole, Cell>;
};

const ROLE_ORDER: PortalRole[] = [
  'Provider Admin',
  'Provider User',
  'Tenant Admin',
  'Tenant User',
];

const ROLE_SHORT: Record<PortalRole, { code: string; sub: string }> = {
  'Provider Admin': { code: 'PA', sub: 'Admin' },
  'Provider User': { code: 'PU', sub: 'User' },
  'Tenant Admin': { code: 'TA', sub: 'Admin' },
  'Tenant User': { code: 'TU', sub: 'User' },
};

/** Permission matrix — relevant GENTERA platform + tenant features (snapshot style). */
const MATRIX: MatrixRow[] = [
  {
    feature: 'Create provider',
    endpoint: 'POST /api/v1/provider/create',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'View all providers',
    endpoint: 'GET /api/v1/providers',
    roles: { 'Provider Admin': true, 'Provider User': true, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'Create tenant',
    endpoint: 'POST /api/v1/tenant/register',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'View all tenants',
    endpoint: 'GET /api/v1/tenants',
    roles: { 'Provider Admin': true, 'Provider User': true, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'Assign / register Tenant Admin',
    endpoint: 'POST /api/v1/invite/create · PATCH /invite/{id}/approve',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'Invite Provider Users',
    endpoint: 'POST /api/v1/invite/create (PROVIDER_USER)',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'Invite Tenant Users',
    endpoint: 'POST /api/v1/invite/create (TENANT_USER)',
    roles: { 'Provider Admin': false, 'Provider User': false, 'Tenant Admin': true, 'Tenant User': false },
  },
  {
    feature: 'Approve Tenant User profiles',
    endpoint: 'PATCH /api/v1/invite/{id}/approve (TENANT_USER)',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'Approve budget overrun',
    endpoint: 'POST /api/v1/cost/escalate/approve',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'Approve cost reviews',
    endpoint: 'POST /api/v1/cost/approve',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': true, 'Tenant User': false },
  },
  {
    feature: 'Submit LLM Kit intake / stages',
    endpoint: 'POST /api/v1/intake/submit',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': true, 'Tenant User': true },
  },
  {
    feature: 'Approve Project Intake (unlock AI / cost / TF)',
    endpoint: 'PATCH /api/v1/intake/{id}/approve',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': true, 'Tenant User': false },
  },
  {
    feature: 'OPTIMA-AI access',
    endpoint: 'GET /api/v2/optima/*',
    roles: { 'Provider Admin': true, 'Provider User': 'own', 'Tenant Admin': true, 'Tenant User': false },
  },
  {
    feature: 'Audit log',
    endpoint: 'GET /api/v1/audit',
    roles: { 'Provider Admin': true, 'Provider User': 'own', 'Tenant Admin': 'own', 'Tenant User': false },
  },
  {
    feature: 'Capability request review (PU)',
    endpoint: 'PATCH /api/v1/invite/{id}/capability-review',
    roles: { 'Provider Admin': true, 'Provider User': false, 'Tenant Admin': false, 'Tenant User': false },
  },
  {
    feature: 'View own tenant workspace',
    endpoint: 'GET /api/v1/tenant/{id}',
    roles: { 'Provider Admin': true, 'Provider User': true, 'Tenant Admin': 'own', 'Tenant User': 'own' },
  },
];

function mapInvite(d: any): InvitedUser {
  return {
    inviteId: d.inviteId,
    fullName: d.fullName,
    email: d.email,
    role: d.role,
    companyName: d.companyName,
    providerId: d.providerId,
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    department: d.department,
    jobTitle: d.jobTitle,
    functionArea: d.functionArea,
    invitedBy: d.invitedBy,
    invitedAt: d.invitedAt,
    status: d.status,
    summaryLine: d.summaryLine,
    archived: Boolean(d.archived),
    decommissioned: Boolean(d.decommissioned),
    archivedAt: d.archivedAt,
    intakeData: d.intakeData,
    pendingIntakeData: d.pendingIntakeData,
    providerNotes: d.providerNotes,
    reviewMessage: d.reviewMessage,
    lastReviewedAt: d.lastReviewedAt,
    lastEditedBy: d.lastEditedBy,
    lastReviewDecision: d.lastReviewDecision,
    hasPendingReview: Boolean(d.hasPendingReview),
  };
}

function RoleCard({
  role,
  bullets,
  accent,
  example,
}: {
  role: PortalRole;
  bullets: string[];
  accent: string;
  example?: string;
}) {
  const meta = ROLE_META[role];
  return (
    <div style={{
      flex: '1 1 220px', minWidth: 200, background: '#FFFFFF',
      border: `1.5px solid ${accent}55`, borderRadius: 14, padding: '14px 16px',
      boxShadow: `0 8px 24px ${accent}14`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{role}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: accent,
          background: `${accent}18`, border: `1px solid ${accent}44`,
          padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
        }}>
          {meta.label}
        </span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: accent, marginBottom: 10 }}>{meta.scope}</div>
      {example && (
        <div style={{
          fontSize: 11, color: '#475569', background: '#F8FAFC', border: '1px solid #E2E8F0',
          borderRadius: 8, padding: '6px 8px', marginBottom: 10, lineHeight: 1.35,
        }}>
          {example}
        </div>
      )}
      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {bullets.map((b) => (
          <li key={b} style={{ fontSize: 12, color: '#334155', lineHeight: 1.4 }}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

function MatrixCell({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <span title="Allowed" style={{ color: '#059669', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
        <i className="ti ti-square-rounded-check-filled" />
      </span>
    );
  }
  if (value === 'own') {
    return (
      <span title="Own scope / read-only" style={{ color: '#EA580C', fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
        <i className="ti ti-circle-dot" />
      </span>
    );
  }
  return (
    <span title="Denied" style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1 }}>
      <i className="ti ti-lock" />
    </span>
  );
}

function statusPill(u: InvitedUser) {
  const pending = Boolean(u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING'));
  if (pending) return { label: 'PENDING', bg: '#FEF3C7', color: '#B45309' };
  if (u.status === 'APPROVED' || u.status === 'ACCEPTED') return { label: 'APPROVED', bg: '#D1FAE5', color: '#047857' };
  return { label: u.status || 'PENDING', bg: '#FEF3C7', color: '#B45309' };
}

function PersonList({
  title,
  icon,
  accent,
  rows,
  emptyHint,
  idLabel,
}: {
  title: string;
  icon: string;
  accent: string;
  rows: InvitedUser[];
  emptyHint: string;
  idLabel: (u: InvitedUser) => string;
}) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '12px 16px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 16, color: accent }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{title}</span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color: accent, background: `${accent}18`,
          border: `1px solid ${accent}44`, padding: '2px 8px', borderRadius: 999,
        }}>
          {rows.length} active
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '22px 16px', textAlign: 'center', fontSize: 12, color: '#94A3B8' }}>
          {emptyHint}
        </div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
            <thead>
              <tr style={{ color: '#64748B', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>ID</th>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Org / Dept</th>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => {
                const st = statusPill(u);
                return (
                  <tr key={u.inviteId} style={{ borderTop: i === 0 ? '1px solid #F1F5F9' : '1px solid #F8FAFC' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: accent }}>
                      {idLabel(u)}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                      {u.fullName}
                      {u.jobTitle ? (
                        <div style={{ fontSize: 10, fontWeight: 500, color: '#94A3B8' }}>{u.jobTitle}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '10px 14px', color: '#64748B' }}>
                      {u.companyName || '—'}
                      {u.department ? ` · ${u.department}` : ''}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                        background: st.bg, color: st.color,
                      }}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RolesAccess() {
  const {
    currentRole, provider, activeTenant, invitedUsers, setInvitedUsers, tenants,
  } = useAppStore();
  const activeMeta = ROLE_META[currentRole as PortalRole] ?? ROLE_META['Provider Admin'];
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    inviteApi.list()
      .then((res) => setInvitedUsers((res.data || []).map(mapInvite)))
      .catch(() => { /* keep store */ })
      .finally(() => setLoading(false));
  }, [setInvitedUsers]);

  const activeProviderUsers = (invitedUsers || []).filter(
    (u) => u.role === 'PROVIDER_USER' && !u.archived && !u.decommissioned && Boolean(u.intakeData),
  );
  const activeTenantAdmins = (invitedUsers || []).filter(
    (u) => u.role === 'TENANT_ADMIN' && !u.archived && !u.decommissioned && Boolean(u.intakeData || u.tenantId),
  );

  const tenantExamples = (tenants || [])
    .filter((t) => !t.archived)
    .slice(0, 3)
    .map((t) => ({
      title: t.orgName,
      meta: `${t.compliance || '—'} · ${(t.cloud?.primary || 'azure').toUpperCase()}`,
      tenantId: t.tenantId,
    }));

  const fallbackTenants = [
    { title: "Dr. Reddy's Laboratories", meta: 'Pharma · HIPAA · Azure', tenantId: 'TENANT_DEMO_1' },
    { title: 'HDFC Bank', meta: 'BFSI · SOC2 · Azure', tenantId: 'TENANT_DEMO_2' },
    { title: 'HDFC Ergo', meta: 'Insurance · SOC2 · AWS', tenantId: 'TENANT_DEMO_3' },
  ];
  const shownTenants = tenantExamples.length > 0 ? tenantExamples : fallbackTenants;

  return (
    <div style={{ maxWidth: 1180 }}>
      {/* Context banner */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', marginBottom: 18, borderRadius: 12,
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', border: '1px solid #334155',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#38BDF8', marginBottom: 4 }}>
            GENTERA RBAC ARCHITECTURE
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC' }}>
            Four personas · Platform + Tenant isolation · Feuji Software Solutions — Hyderabad
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(15,23,42,0.65)',
          border: `1px solid ${activeMeta.color}66`, borderRadius: 10, padding: '8px 12px',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeMeta.color }} />
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8' }}>Signed in as</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
              {currentRole} · {activeMeta.label}
            </div>
          </div>
        </div>
      </div>

      {/* 1. Access hierarchy diagram */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#64748B', marginBottom: 10, textTransform: 'uppercase' }}>
        <i className="ti ti-hierarchy-2" style={{ marginRight: 6 }} />
        1. Access hierarchy diagram
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20,
        marginBottom: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Platform level */}
        <div style={{
          border: '2px dashed #A78BFA', borderRadius: 16, padding: 16,
          background: 'linear-gradient(180deg, #FAF5FF 0%, #FFFFFF 100%)', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: '#7C3AED', textTransform: 'uppercase' }}>
              Platform level
            </div>
            <div style={{ fontSize: 11, color: '#6B21A8' }}>
              Both roles share visibility across provider and tenant data
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <RoleCard
              role="Provider Admin"
              accent="#7C3AED"
              example="e.g. Arnab Das — Principal Solution Architect AI/ML · Feuji"
              bullets={[
                'Create providers & tenants; assign Tenant Admins',
                'Invite any role (Provider User, Tenant Admin, Tenant User)',
                'Approve budget escalations across clients',
                'Full OPTIMA-AI + full cross-tenant audit log',
                'Modify compliance frameworks & global budget ceilings',
                'Allow / deny Provider User capabilities; review requests',
              ]}
            />
            <RoleCard
              role="Provider User"
              accent="#0891B2"
              example="e.g. Venkat Kongani — VP/Manager, Feuji AI Practice"
              bullets={[
                'View all providers, tenants & LLM Kit stage progress',
                'Portfolio analytics & OPTIMA-AI savings (read)',
                'Health dashboards + read-only audit log',
                'Request add / exclude capabilities (Provider Admin approves)',
                'Cannot invite users, modify tenants, or approve costs by default',
              ]}
            />
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: '#7C3AED', fontWeight: 600, textAlign: 'center' }}>
            Provider Admin invites Provider Users · Provider Admin only creates tenants and assigns Tenant Admins
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 48, margin: '6px 0 10px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center', color: '#0D9488', maxWidth: 180 }}>
            <i className="ti ti-arrow-down" style={{ fontSize: 18 }} />
            <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.35 }}>
              creates tenant · assigns Tenant Admin
            </div>
          </div>
          <div style={{ textAlign: 'center', color: '#64748B', maxWidth: 200 }}>
            <i className="ti ti-arrow-down" style={{ fontSize: 18 }} />
            <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.35 }}>
              budget overrun escalates up · cost approval stays at Tenant Admin
            </div>
          </div>
        </div>

        {/* Tenant level */}
        <div style={{
          border: '2px dashed #5EEAD4', borderRadius: 16, padding: 16,
          background: 'linear-gradient(180deg, #F0FDFA 0%, #FFFFFF 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: '#0D9488', textTransform: 'uppercase' }}>
              Tenant level — isolated workspaces
            </div>
            <div style={{ fontSize: 11, color: '#115E59' }}>
              Data never crosses between tenants
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {shownTenants.map((t, idx) => (
              <div
                key={t.tenantId || t.title}
                style={{
                  border: '1.5px dashed #14B8A6', borderRadius: 14, padding: 12,
                  background: 'rgba(255,255,255,0.85)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F766E', marginBottom: 2 }}>
                  Tenant {idx + 1} · {t.title}
                </div>
                <div style={{ fontSize: 10, color: '#64748B', marginBottom: 10 }}>{t.meta} · fully isolated</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <RoleCard
                    role="Tenant Admin"
                    accent="#0D9488"
                    example={idx === 0 ? 'VP IT / Head of Digital' : idx === 1 ? 'Head of AI / VP Digital Banking' : 'Head of Technology'}
                    bullets={[
                      'Invite Tenant Users in own tenant only',
                      'Generate & approve Project Intake (unlocks AI / cost / TF)',
                      'Approve cost reviews & Stage 9 launch',
                      'Approve OPTIMA-AI recommendations',
                      'Escalate budget overruns to Provider Admin',
                      'Cannot see other tenants',
                    ]}
                  />
                  <div style={{ textAlign: 'center', fontSize: 10, color: '#0D9488', fontWeight: 600 }}>
                    ↓ invites Tenant Users
                  </div>
                  <RoleCard
                    role="Tenant User"
                    accent="#2563EB"
                    example={idx === 0 ? 'Clinical scientists, data scientists' : idx === 1 ? 'Loan officers, data scientists' : 'Claims assessors, underwriters'}
                    bullets={[
                      'Submit Project Intake forms & use LLM Kit stages',
                      'Intake stays PENDING until Tenant Admin / Provider Admin approves',
                      'Review AI recommendations & health dashboards',
                      'Monitor deployment logs for own projects',
                      'Cannot approve intakes, costs, invite users, or change compliance',
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Permission matrix */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#64748B', marginBottom: 10, textTransform: 'uppercase' }}>
        <i className="ti ti-table" style={{ marginRight: 6 }} />
        2. Permission matrix
      </div>

      <div style={{
        marginBottom: 10, padding: '10px 14px', borderRadius: 10,
        background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: 12, color: '#1E40AF',
      }}>
        Your current role (<strong>{currentRole}</strong>) column is highlighted.
        <span style={{ marginLeft: 12 }}>
          <i className="ti ti-square-rounded-check-filled" style={{ color: '#059669' }} /> allowed
        </span>
        <span style={{ marginLeft: 10 }}>
          <i className="ti ti-circle-dot" style={{ color: '#EA580C' }} /> own scope / read-only
        </span>
        <span style={{ marginLeft: 10 }}>
          <i className="ti ti-lock" style={{ color: '#94A3B8' }} /> denied
        </span>
      </div>

      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'auto',
        marginBottom: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{
                textAlign: 'left', padding: '12px 14px', color: '#64748B', fontSize: 11,
                textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 220,
              }}>
                Permission / Feature
              </th>
              {ROLE_ORDER.map((r) => {
                const active = r === currentRole;
                const short = ROLE_SHORT[r];
                return (
                  <th
                    key={r}
                    style={{
                      textAlign: 'center', padding: '12px 10px', minWidth: 88,
                      color: ROLE_META[r].color, fontSize: 11, fontWeight: 700,
                      background: active ? `${ROLE_META[r].color}14` : undefined,
                      boxShadow: active ? `inset 0 -2px 0 ${ROLE_META[r].color}` : undefined,
                    }}
                  >
                    <div>{short.code}</div>
                    <div style={{ fontWeight: 600, color: '#64748B', marginTop: 2 }}>{short.sub}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row, i) => (
              <tr key={row.feature} style={{ borderBottom: i === MATRIX.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{row.feature}</div>
                  <div style={{
                    fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    color: '#64748B', marginTop: 3, wordBreak: 'break-all',
                  }}>
                    {row.endpoint}
                  </div>
                </td>
                {ROLE_ORDER.map((r) => {
                  const active = r === currentRole;
                  return (
                    <td
                      key={r}
                      style={{
                        padding: '12px 10px', textAlign: 'center',
                        background: active ? `${ROLE_META[r].color}0A` : undefined,
                      }}
                    >
                      <MatrixCell value={row.roles[r]} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 3. Active lists */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        marginBottom: 10, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#64748B', textTransform: 'uppercase' }}>
          <i className="ti ti-users" style={{ marginRight: 6 }} />
          3. Active Provider Users & Tenant Admins
          {loading ? <span style={{ marginLeft: 8, fontWeight: 500, color: '#94A3B8' }}>Refreshing…</span> : null}
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8' }}>
          Provider: {provider?.name ?? '—'} · Tenant context: {activeTenant?.orgName ?? 'None selected'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
        <PersonList
          title="List of Active Provider Users"
          icon="ti-user-check"
          accent="#0891B2"
          rows={activeProviderUsers}
          emptyHint="No registered Provider Users yet. Invite + Register from Provider Admin."
          idLabel={(u) => u.inviteId}
        />
        <PersonList
          title="List of Tenant Admins"
          icon="ti-building"
          accent="#0D9488"
          rows={activeTenantAdmins}
          emptyHint="No registered Tenant Admins yet. Invite + Register from Provider Admin."
          idLabel={(u) => u.tenantId || u.inviteId}
        />
      </div>
    </div>
  );
}
