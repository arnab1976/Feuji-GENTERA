/**
 * MainContent — page header + scrollable body.
 * Routes to the correct component based on store.currentPage.
 */
import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import type { PageId } from '@/types';

// ── Home screen ───────────────────────────────────────────────────────────────
import HomePage from '@/components/home/HomePage';

// ── Admin screens ─────────────────────────────────────────────────────────────
import ProviderManagement from '@/components/admin/ProviderManagement';
import ProviderUserPortal from '@/components/admin/ProviderUserPortal';
import TenantManagement from '@/components/admin/TenantManagement';
import TenantUserPortal from '@/components/admin/TenantUserPortal';
import TenantAdminPortal from '@/components/admin/TenantAdminPortal';
import RolesAccess from '@/components/admin/RolesAccess';
import ActivityFeed from '@/components/admin/ActivityFeed';
import {
  ProviderProjectIntakeForms,
  TenantProjectIntakeForms,
} from '@/components/admin/ProjectIntakeFormsPortal';

// ── Phase 1 workflow screens ──────────────────────────────────────────────────
import IntakeForm from '@/components/workflow/IntakeForm';
import AIRecommendation from '@/components/workflow/AIRecommendation';
import CostReview from '@/components/workflow/CostReview';
import TerraformGeneration from '@/components/workflow/TerraformGeneration';
import ExecutionEngine from '@/components/workflow/ExecutionEngine';
import HealthDashboard from '@/components/workflow/HealthDashboard';
import AuditCompliance from '@/components/workflow/AuditCompliance';
import TestingQA from '@/components/workflow/TestingQA';
import LaunchOps from '@/components/workflow/LaunchOps';

// ── Phase 2 OPTIMA-AI screens ─────────────────────────────────────────────────
import FinOpsOverview from '@/components/optima/FinOpsOverview';
import CostBreakdown from '@/components/optima/CostBreakdown';
import Recommendations from '@/components/optima/Recommendations';
import ApprovalWorkflow from '@/components/optima/ApprovalWorkflow';
import SavingsDashboard from '@/components/optima/SavingsDashboard';

// ── Phase 3 Cloud Architecture screen ───────────────────────────────────────
import CloudArchitecturePortal from '@/components/cloud/CloudArchitecturePortal';
import AzureArchitecturePortal from '@/components/cloud/AzureArchitecturePortal';

const PAGE_META: Record<PageId, { tag: string; tagColor: string; tagBg: string; title: string; desc: string; isOptima?: boolean }> = {
  home:            { tag:'GENTERA Landing Hub',   tagColor:'#0D9488', tagBg:'#CCFBF1', title:'GENTERA Home Overview',       desc:'GenAI Terraform Enterprise Resource Automation' },
  provider:        { tag:'Platform Admin',        tagColor:'#7C3AED', tagBg:'#EDE9FE', title:'Provider Admin',              desc:'Register provider organisations and manage the default PROVIDER_ADMIN user. Use Open TA Intake Forms for project intake review.' },
  'provider-user': { tag:'Platform Admin',        tagColor:'#0D9488', tagBg:'#CCFBF1', title:'Provider User',               desc:'Feature-wise roster of registered Provider Users (ID, Name, Email, Date, Status). Invite + Register happen only in Provider Admin.' },
  tenant:          { tag:'Platform Admin',        tagColor:'#0891B2', tagBg:'#E0F7FA', title:'Tenant Admin',                desc:'Tenant Admin roster. Use Open TA Intake Forms for Step 1 project intake approvals.' },
  'tenant-user':   { tag:'Platform Admin',        tagColor:'#2563EB', tagBg:'#DBEAFE', title:'Tenant User',                 desc:'Provider Admin reviews Tenant User profiles invited from Tenant Admin Portal. Approve to activate; invite is Tenant Admin only.' },
  'tenant-admin-portal': { tag:'Tenant Admin',    tagColor:'#0D9488', tagBg:'#CCFBF1', title:'Tenant Admin Portal',         desc:'Tenant Admin roster with Invite Tenant User, and Tenant User roster. Use Open TA Intake Forms for project intake approvals.' },
  rbac:            { tag:'Platform Admin',        tagColor:'#2563EB', tagBg:'#EFF6FF', title:'Roles & Access Control',      desc:'Access hierarchy · permission matrix (feature + API) · active Provider Users and Tenant Admins. Four-persona RBAC with platform vs tenant isolation.' },
  'activity-feed': { tag:'Platform Admin',        tagColor:'#D97706', tagBg:'#FEF3C7', title:'Cross-Role Activity Feed',  desc:'Real-time log of all role interactions — invitations, cost approvals, budget escalations, and workflow events across all tenants.' },
  'provider-intake': { tag:'Platform Admin',       tagColor:'#7C3AED', tagBg:'#EDE9FE', title:'Project Intake Forms',      desc:'Legacy route — open from Provider Admin via Open TA Intake Forms.' },
  'tenant-intake':   { tag:'Tenant Admin',         tagColor:'#0D9488', tagBg:'#CCFBF1', title:'Project Intake Forms',      desc:'Legacy route — open from Tenant Admin via Open TA Intake Forms.' },
  intake:          { tag:'Stage 1',              tagColor:'#0D9488', tagBg:'#CCFBF1', title:'Project Intake Form',         desc:'Single structured entry point to the LLM Kit workflow. All AI recommendation, cost estimation, and Terraform generation derive from this form input. Generate: PA / TA / TU · Approve: TA (primary) / PA.' },
  ai:              { tag:'Stage 2',              tagColor:'#7C3AED', tagBg:'#EDE9FE', title:'AI Recommendation Engine',    desc:'LLM reads the tenant-scoped intake JSON and recommends infrastructure resources across 7 categories. NFR: under 10 seconds.' },
  cost:            { tag:'Stage 3',              tagColor:'#0891B2', tagBg:'#E0F7FA', title:'Cost Estimation & Resource Review', desc:'' },
  terraform:       { tag:'Stage 4',              tagColor:'#2563EB', tagBg:'#EFF6FF', title:'', desc:'' },
  jumpbox:         { tag:'Stage 5',              tagColor:'#059669', tagBg:'#D1FAE5', title:'', desc:'' },
  health:          { tag:'Stage 6',              tagColor:'#D97706', tagBg:'#FEF3C7', title:'', desc:'' },
  audit:           { tag:'Stage 7 — Phase 2',   tagColor:'#D97706', tagBg:'#FEF3C7', title:'', desc:'' },
  testing:         { tag:'Stage 8',              tagColor:'#059669', tagBg:'#D1FAE5', title:'Integration Testing & QA',   desc:'30+ Playwright E2E scenarios. k6 load tests. Tenant isolation verified. Post-test teardown mandatory.' },
  launch:          { tag:'Stage 9',              tagColor:'#2563EB', tagBg:'#EFF6FF', title:'Production Launch & Ops',    desc:'2-approver CI/CD gate. Canary rollout 10%→100%. 3 sign-offs required. PagerDuty alerts configured.' },
  'optima-overview':  { tag:'OPTIMA-AI Phase 2', tagColor:'#0EA5E9', tagBg:'#E0F2FE', title:'GenAI FinOps Overview',      desc:'OPTIMA-AI analyses the exact infrastructure provisioned by Phase 1. All cost analysis derives from your actual provisioned resources — not generic benchmarks.', isOptima: true },
  'optima-scan':      { tag:'OPTIMA-AI Step 1',  tagColor:'#0EA5E9', tagBg:'#E0F2FE', title:'Cost Breakdown — Provisioned LLM Stack', desc:'Drill-down of the FinOps Overview stack — same tenant, project, cloud, Stage 3 approved baseline, and Phase 1 provisioned resources.', isOptima: true },
  'optima-recs':      { tag:'OPTIMA-AI Step 2',  tagColor:'#0EA5E9', tagBg:'#E0F2FE', title:'AI Cost Recommendations',   desc:'Optimization recommendations generated for the exact resources provisioned in Phase 1. Each references an actual resource from outputs.json. Nothing auto-applied.', isOptima: true },
  'optima-approval':  { tag:'OPTIMA-AI Step 3',  tagColor:'#0EA5E9', tagBg:'#E0F2FE', title:'Approval Workflow',         desc:'Every recommendation requires approval. Approved changes execute through the Phase 1 Terraform pipeline — same OPA, tfsec, and compliance controls.', isOptima: true },
  'optima-savings':   { tag:'OPTIMA-AI Step 4',  tagColor:'#0EA5E9', tagBg:'#E0F2FE', title:'Savings Dashboard',         desc:'Tracks savings from Approval Workflow decisions against Phase 1 Stage 3 approved cost baseline and the Intake Form budget ceiling.', isOptima: true },
  'phase3-architecture': { tag:'Phase 3 Free Tools', tagColor:'#0D9488', tagBg:'#F0FDFA', title:'Phase 3 — Free Tier Cloud Architecture & Deployment Guide', desc:'Interactive Serverless Multi-Tenant Control Plane Topology, Free Tool Capabilities, Inter-Service Connection Matrix & Deployment Blueprint.' },
  'phase3-azure':        { tag:'Phase 3 Azure',      tagColor:'#0284C7', tagBg:'#E0F2FE', title:'Phase 3 — Azure Architecture & Deployment Guide', desc:'Azure Cloud System Architecture Topology, Azure Free Tools Matrix, Connection Map & Step-by-Step Deployment Walkthrough.' },
};

const PAGE_COMPONENTS: Record<PageId, React.ComponentType> = {
  home: HomePage,
  provider: ProviderManagement,  'provider-user': ProviderUserPortal,  tenant: TenantManagement,  'tenant-user': TenantUserPortal,  'tenant-admin-portal': TenantAdminPortal,  rbac: RolesAccess,  'activity-feed': ActivityFeed,
  'provider-intake': ProviderProjectIntakeForms,  'tenant-intake': TenantProjectIntakeForms,
  intake: IntakeForm,  ai: AIRecommendation,  cost: CostReview,
  terraform: TerraformGeneration,  jumpbox: ExecutionEngine,  health: HealthDashboard,
  audit: AuditCompliance,  testing: TestingQA,  launch: LaunchOps,
  'optima-overview': FinOpsOverview,  'optima-scan': CostBreakdown,
  'optima-recs': Recommendations,  'optima-approval': ApprovalWorkflow,
  'optima-savings': SavingsDashboard,
  'phase3-architecture': CloudArchitecturePortal,
  'phase3-azure': AzureArchitecturePortal,
};

export default function MainContent() {
  const { currentPage, setPage } = useAppStore();
  const safePage = PAGE_COMPONENTS[currentPage] ? currentPage : 'home';
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  // Always open each stage at the top so Tenant User sees header/description first (no scroll-up)
  useEffect(() => {
    const reset = () => {
      const el = bodyScrollRef.current;
      if (el) el.scrollTop = 0;
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    };
    reset();
    const id = window.requestAnimationFrame(reset);
    const t = window.setTimeout(reset, 50);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [safePage]);

  if (safePage !== currentPage) {
    // Recover from a corrupted/persisted navigation state
    queueMicrotask(() => setPage('home'));
  }

  if (safePage === 'home') {
    return (
      <div style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
        <HomePage />
      </div>
    );
  }

  const meta = PAGE_META[safePage];
  const PageComponent = PAGE_COMPONENTS[safePage];

  const headerBg = meta?.isOptima
    ? 'linear-gradient(135deg, #061828 0%, #0C4A6E 100%)'
    : '#fff';
  const borderBottom = meta?.isOptima ? '2px solid #0EA5E9' : '1px solid #E2E8F0';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Page Header — omitted when the stage page renders its own header (e.g. Stage 4) */}
      {meta?.title ? (
      <div style={{
        background: headerBg, borderBottom, padding: '16px 24px', flexShrink: 0,
      }}>
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '3px 10px', borderRadius: 20,
                color: meta.tagColor, background: meta.tagBg,
              }}>{meta.tag}</span>
              <i className="ti ti-chevron-right" style={{ fontSize: 12, color: meta.isOptima ? '#7DD3FC' : '#94A3B8' }} />
              <span style={{ fontSize: 12, color: meta.isOptima ? '#7DD3FC' : '#64748B' }}>{meta.title}</span>
            </div>
            <div style={{
              fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: meta.desc ? 5 : 0,
              color: meta.isOptima ? '#fff' : '#0F172A',
            }}>{meta.title}</div>
            {meta.desc ? (
              <div style={{
                fontSize: 13, lineHeight: 1.65, maxWidth: 740,
                color: meta.isOptima ? '#7DD3FC' : '#64748B',
              }}>{meta.desc}</div>
            ) : null}
          </>
      </div>
      ) : null}

      {/* Page Body */}
      <div ref={bodyScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {PageComponent && <PageComponent />}
      </div>
    </div>
  );
}
