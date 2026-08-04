/**
 * Zustand global store — replaces the ST.* session state from the demo portal.
 * Phase 2 OPTIMA-AI reads directly from this store for all its analysis.
 * All Phase 1 workflow data is persisted here as the user progresses.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Provider, Tenant, IntakeForm, AIRecommendation,
  ResourcePlan, TerraformArtifact, DeploymentOutputs,
  OptimaRecommendation, PageId, InvitedUser,
} from '@/types';

interface AppState {
  // ── Navigation ────────────────────────────────────────────────────────────
  currentPage: PageId;
  setPage: (page: PageId) => void;

  // ── RBAC ──────────────────────────────────────────────────────────────────
  currentRole: string;
  setRole: (role: string) => void;

  // ── Phase 1 Admin ─────────────────────────────────────────────────────────
  provider: Provider | null;
  providers: Provider[];
  activeTenant: Tenant | null;
  tenants: Tenant[];
  setProvider: (p: Provider) => void;
  setProviders: (providers: Provider[]) => void;
  removeProvider: (providerId: string) => void;
  updateProvider: (providerId: string, patch: Partial<Provider>) => void;
  setActiveTenant: (t: Tenant) => void;
  invitedUsers: InvitedUser[];
  addInvitedUser: (u: InvitedUser) => void;
  setInvitedUsers: (users: InvitedUser[]) => void;
  updateInvitedUser: (inviteId: string, patch: Partial<InvitedUser>) => void;
  removeInvitedUser: (inviteId: string) => void;
  updateTenant: (tenantId: string, patch: Partial<Tenant>) => void;
  removeTenant: (tenantId: string) => void;

  // ── Phase 1 Workflow — Stage 1 ────────────────────────────────────────────
  intakeForm: IntakeForm | null;
  setIntakeForm: (f: IntakeForm) => void;

  // ── Phase 1 Workflow — Stage 2 ────────────────────────────────────────────
  recommendation: AIRecommendation | null;
  setRecommendation: (r: AIRecommendation) => void;

  // ── Phase 1 Workflow — Stage 3 ────────────────────────────────────────────
  resourcePlan: ResourcePlan | null;
  approvedTotal: number;
  setResourcePlan: (p: ResourcePlan, total: number) => void;

  // ── Phase 1 Workflow — Stage 4 ────────────────────────────────────────────
  terraformArtifact: TerraformArtifact | null;
  setTerraformArtifact: (a: TerraformArtifact) => void;

  // ── Phase 1 Workflow — Stage 5 ───────────────────────────────────────────
  deploymentOutputs: DeploymentOutputs | null;
  setDeploymentOutputs: (o: DeploymentOutputs) => void;

  // ── Phase 1 Completion Tracking ──────────────────────────────────────────
  completedStages: string[];
  markStageComplete: (stage: string) => void;

  // ── Phase 2 OPTIMA-AI ─────────────────────────────────────────────────────
  optimaRecommendations: OptimaRecommendation[];
  setOptimaRecommendations: (recs: OptimaRecommendation[]) => void;
  approveOptimaRec: (id: string, approved: boolean) => void;
  optimaExecuted: boolean;
  setOptimaExecuted: (v: boolean) => void;

  // ── Reset ─────────────────────────────────────────────────────────────────
  reset: () => void;
}

const initialState = {
  currentPage: 'home' as PageId,
  currentRole: 'Provider Admin',
  provider: null as Provider | null,
  providers: [] as Provider[],
  activeTenant: null as Tenant | null,
  tenants: [] as Tenant[],
  invitedUsers: [] as InvitedUser[],
  intakeForm: null, recommendation: null,
  resourcePlan: null, approvedTotal: 0,
  terraformArtifact: null, deploymentOutputs: null,
  completedStages: [] as string[],
  optimaRecommendations: [], optimaExecuted: false,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setPage: (page) => set({ currentPage: page }),
      setRole: (role) => set({ currentRole: role }),

      setProvider: (p) => set((state) => ({
        provider: p,
        providers: [p, ...(state.providers || []).filter(x => x.providerId !== p.providerId)],
      })),
      setProviders: (providers) => set((state) => {
        const list = providers || [];
        const currentId = state.provider?.providerId;
        const matched = currentId
          ? list.find((p) => p.providerId === currentId)
          : null;
        // Prefer matching by name when local ID is stale
        const byName = state.provider?.name
          ? list.find((p) => p.name?.toLowerCase() === state.provider!.name.toLowerCase())
          : null;
        return {
          providers: list,
          provider: matched ?? byName ?? list[0] ?? state.provider,
        };
      }),
      removeProvider: (providerId) => set((state) => {
        const providers = (state.providers || []).filter((p) => p.providerId !== providerId);
        const provider =
          state.provider?.providerId === providerId
            ? (providers[0] ?? null)
            : state.provider;
        const tenants = (state.tenants || []).filter((t) => t.providerId !== providerId);
        const activeTenant =
          state.activeTenant?.providerId === providerId ? null : state.activeTenant;
        const invitedUsers = (state.invitedUsers || []).filter(
          (u) => u.providerId !== providerId,
        );
        return { providers, provider, tenants, activeTenant, invitedUsers };
      }),
      updateProvider: (providerId, patch) => set((state) => {
        const isArchiving = patch.archived === true || patch.deleted === true;
        const isRestoring = patch.archived === false || patch.deleted === false;

        const providers = (state.providers || []).map((p) => {
          if (p.providerId !== providerId) return p;
          const next = { ...p, ...patch };
          if (isArchiving) {
            next.archived = true;
            next.deleted = true;
            next.status = 'INACTIVE';
            next.archivedAt = new Date().toISOString();
          }
          if (isRestoring) {
            next.archived = false;
            next.deleted = false;
            next.status = next.commissioned === false ? 'INACTIVE' : 'ACTIVE';
            next.archivedAt = undefined;
          }
          return next;
        });

        const updated = providers.find((p) => p.providerId === providerId) ?? null;

        // Archive / restore linked tenants (Tenant Admin workspace) with the provider
        let tenants = state.tenants || [];
        let activeTenant = state.activeTenant;
        if (isArchiving) {
          tenants = tenants.map((t) =>
            t.providerId === providerId ? { ...t, status: 'INACTIVE' as const } : t
          );
          if (activeTenant?.providerId === providerId) activeTenant = null;
        }
        if (isRestoring) {
          tenants = tenants.map((t) =>
            t.providerId === providerId ? { ...t, status: 'ACTIVE' as const } : t
          );
        }

        const provider =
          state.provider?.providerId === providerId
            ? (isArchiving ? null : updated)
            : state.provider;

        return { providers, provider, tenants, activeTenant };
      }),
      setActiveTenant: (t) => set((state) => ({
        activeTenant: t,
        tenants: [t, ...(state.tenants || []).filter(x => x.tenantId !== t.tenantId)],
      })),
      addInvitedUser: (u) => set((state) => ({
        invitedUsers: [u, ...(state.invitedUsers || []).filter((x) => x.inviteId !== u.inviteId)],
      })),
      setInvitedUsers: (users) => set({ invitedUsers: users }),
      updateInvitedUser: (inviteId, patch) => set((state) => ({
        invitedUsers: (state.invitedUsers || []).map((u) =>
          u.inviteId === inviteId ? { ...u, ...patch } : u
        ),
      })),
      removeInvitedUser: (inviteId) => set((state) => ({
        invitedUsers: (state.invitedUsers || []).filter((u) => u.inviteId !== inviteId),
      })),
      updateTenant: (tenantId, patch) => set((state) => {
        const tenants = (state.tenants || []).map((t) =>
          t.tenantId === tenantId ? { ...t, ...patch } : t
        );
        const activeTenant =
          state.activeTenant?.tenantId === tenantId
            ? (patch.archived || patch.status === 'INACTIVE' ? null : { ...state.activeTenant, ...patch })
            : state.activeTenant;
        return { tenants, activeTenant };
      }),
      removeTenant: (tenantId) => set((state) => ({
        tenants: (state.tenants || []).filter((t) => t.tenantId !== tenantId),
        activeTenant: state.activeTenant?.tenantId === tenantId ? null : state.activeTenant,
      })),

      setIntakeForm: (f) => set({ intakeForm: f }),
      setRecommendation: (r) => set({ recommendation: r }),
      setResourcePlan: (p, total) => set({ resourcePlan: p, approvedTotal: total }),
      setTerraformArtifact: (a) => set({ terraformArtifact: a }),
      setDeploymentOutputs: (o) => set({ deploymentOutputs: o }),
      markStageComplete: (stage) => set((state) => {
        const current = Array.isArray(state.completedStages) ? state.completedStages : [];
        return { completedStages: current.includes(stage) ? current : [...current, stage] };
      }),

      setOptimaRecommendations: (recs) => set({ optimaRecommendations: recs }),
      approveOptimaRec: (id, approved) => set((state) => ({
        optimaRecommendations: (state.optimaRecommendations || []).map(r =>
          r.id === id ? { ...r, status: approved ? 'approved' : 'rejected' } : r
        ),
      })),
      setOptimaExecuted: (v) => set({ optimaExecuted: v }),

      reset: () => set(initialState),
    }),
    {
      name: 'feuji-llm-kit-store-v4',
      partialize: (state) => {
        const { currentPage, ...rest } = state;
        return rest;
      },
    }
  )
);

// ── Derived selectors ─────────────────────────────────────────────────────────
export const selectPhase1Complete = (state: AppState) =>
  Array.isArray(state.completedStages) && state.completedStages.includes('launch');

export const selectCanAccessOptima = (state: AppState) =>
  state.recommendation !== null; // Need at least Stage 2 complete

export const selectOptimaContext = (state: AppState) => ({
  tenant: state.activeTenant,
  intake: state.intakeForm,
  recommendation: state.recommendation,
  resources: state.recommendation?.resources ?? [],
  approvedTotal: state.approvedTotal,
  budgetCeiling: state.intakeForm?.budgetCeiling ?? 2000,
  cloud: state.intakeForm?.cloud ?? state.activeTenant?.cloud.primary ?? 'azure',
  compliance: state.intakeForm?.compliance ?? state.activeTenant?.compliance ?? 'HIPAA',
  outputs: state.deploymentOutputs,
  deployed: state.deploymentOutputs !== null,
});
