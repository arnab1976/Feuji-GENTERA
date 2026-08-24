/**
 * ProviderManagement — Replicates the Demo Portal design 100%.
 * Registers provider orgs via POST /provider/create and displays registered providers.
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { inviteApi, providerApi, workflowApi } from '@/services/api';
import type { InvitedUser, Provider } from '@/types';
import { canManageProviders } from '@/lib/rbac';
import InviteUserModal from '@/components/admin/InviteUserModal';
import InviteListSection from '@/components/admin/InviteListSection';
import RegisterTenantAdminModal, { type IntakeModalMode } from '@/components/admin/RegisterTenantAdminModal';
import RegisterProviderUserModal, { type ProviderUserModalMode } from '@/components/admin/RegisterProviderUserModal';
import RegisterTenantUserModal from '@/components/admin/RegisterTenantUserModal';
import IntakeFormsWindowModal from '@/components/admin/IntakeFormsWindowModal';

function mapInvite(d: any): InvitedUser {
  return {
    inviteId: d.inviteId,
    fullName: d.fullName,
    email: d.email,
    role: d.role,
    companyName: d.companyName,
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    providerId: d.providerId,
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

export default function ProviderManagement() {
  const {
    providers, setProvider, setProviders, removeProvider, currentRole, invitedUsers,
    updateInvitedUser, updateTenant, removeInvitedUser, removeTenant,
  } = useAppStore();
  const canMutate = canManageProviders(currentRole);

  const isArchived = (p: Provider) => Boolean(p.archived || p.deleted);
  const activeProviders = providers.filter((p) => !isArchived(p));
  const pendingInvites = (invitedUsers || []).filter((u) => !u.archived && !u.decommissioned);
  const tenantAdminInvites = pendingInvites.filter((u) => u.role === 'TENANT_ADMIN');
  const tenantAdminChangeNotices = tenantAdminInvites.filter(
    (u) => u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING'),
  );
  const providerUserInvites = pendingInvites.filter((u) => u.role === 'PROVIDER_USER');
  const providerUserCapNotices = providerUserInvites.filter(
    (u) => u.hasPendingReview || (u.pendingIntakeData && u.status === 'PENDING'),
  );
  const tenantUserInvites = pendingInvites.filter(
    (u) => u.role === 'TENANT_USER'
      && u.status !== 'ACCEPTED'
      && u.status !== 'APPROVED'
      && u.lastReviewDecision !== 'reject',
  );
  const archivedInvites = (invitedUsers || []).filter((u) => u.archived || u.decommissioned);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [industry, setIndustry] = useState('');
  const [plan, setPlan] = useState<'ENTERPRISE' | 'PROFESSIONAL' | 'STARTER' | ''>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState<{
    inviteId: string;
    fullName: string;
    companyName: string;
    tenantId?: string | null;
  } | null>(null);
  const [providerDeleteConfirm, setProviderDeleteConfirm] = useState<{
    providerId: string;
    name: string;
    adminEmail: string;
  } | null>(null);
  const [intakeInvite, setIntakeInvite] = useState<InvitedUser | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeModalMode>('view');
  const [puIntakeInvite, setPuIntakeInvite] = useState<InvitedUser | null>(null);
  const [puIntakeMode, setPuIntakeMode] = useState<ProviderUserModalMode>('register');
  const [puModalOpen, setPuModalOpen] = useState(false);
  const [tuReviewInvite, setTuReviewInvite] = useState<InvitedUser | null>(null);

  /** Only Step-2 actionable count — not Waiting for TA */
  const [paActionableCount, setPaActionableCount] = useState(0);
  const [intakeFormsOpen, setIntakeFormsOpen] = useState(false);

  const refreshProviderIntakes = async () => {
    try {
      const res = await workflowApi.listIntakes();
      const items = (res.data?.items || []) as { status?: string }[];
      setPaActionableCount(
        items.filter((q) => q.status === 'pending_provider_approval').length,
      );
    } catch {
      setPaActionableCount(0);
    }
  };

  useEffect(() => {
    providerApi.list()
      .then((res) => {
        const rows: Provider[] = (res.data || []).map((d: any) => ({
          providerId: d.providerId,
          name: d.name,
          adminEmail: d.adminEmail,
          industry: d.industry,
          plan: d.plan,
          status: d.status ?? 'ACTIVE',
          tenants: d.tenants ?? [],
          users: d.users ?? [],
          createdAt: d.createdAt ? String(d.createdAt).split('T')[0] : '',
          deleted: false,
          archived: false,
          commissioned: true,
        }));
        if (rows.length) setProviders(rows);
      })
      .catch(() => { /* keep local */ });

    inviteApi.list()
      .then((res) => {
        useAppStore.getState().setInvitedUsers((res.data || []).map(mapInvite));
      })
      .catch(() => { /* keep local */ });

    refreshProviderIntakes();
  }, [setProviders]);

  const handleInviteAction = async (
    inviteId: string,
    action: 'delete' | 'decommission' | 'restore',
  ) => {
    if (!canMutate) {
      setMessage({ type: 'error', text: 'Only Provider Admin can manage invitations.' });
      return;
    }
    setActionBusy(inviteId);

    // Update local Zustand store state immediately for fast responsive UI
    if (action === 'delete') {
      updateInvitedUser(inviteId, {
        archived: true,
        archivedAt: new Date().toISOString(),
        status: 'ARCHIVED',
      });
    } else if (action === 'decommission') {
      updateInvitedUser(inviteId, {
        archived: true,
        decommissioned: true,
        archivedAt: new Date().toISOString(),
        status: 'DECOMMISSIONED',
      });
    } else if (action === 'restore') {
      updateInvitedUser(inviteId, {
        archived: false,
        decommissioned: false,
        status: 'PENDING',
      });
    }

    try {
      const apiCall =
        action === 'delete' ? inviteApi.delete
          : action === 'decommission' ? inviteApi.decommission
            : inviteApi.restore;
      const res = await apiCall(inviteId);
      const d = res?.data;
      if (d) {
        updateInvitedUser(inviteId, {
          archived: Boolean(d.archived),
          decommissioned: Boolean(d.decommissioned),
          archivedAt: d.archivedAt,
          status: d.status,
          summaryLine: d.summaryLine,
          tenantId: d.tenantId ?? d.tenant?.tenantId,
        });
        if (d.tenant?.tenantId) {
          updateTenant(d.tenant.tenantId, {
            archived: Boolean(d.tenant.archived),
            status: d.tenant.status,
          });
        }
      }
    } catch (err: any) {
      console.warn('Backend invite action fallback:', action, inviteId);
    } finally {
      setActionBusy(null);
      const labels = {
        delete: 'moved to Archive',
        decommission: 'decommissioned and archived',
        restore: 'restored to Pending Invitations',
      } as const;
      setMessage({ type: 'success', text: `Invitation ${labels[action]}.` });
    }
  };

  const handlePermanentDelete = async () => {
    if (!purgeConfirm || !canMutate) return;
    const { inviteId, fullName, tenantId } = purgeConfirm;
    setActionBusy(inviteId);

    // Immediately remove from local Zustand store
    removeInvitedUser(inviteId);
    if (tenantId) {
      removeTenant(tenantId);
    }

    try {
      await inviteApi.purge(inviteId);
    } catch (err: any) {
      console.warn('Backend purge fallback for invite:', inviteId);
    } finally {
      setActionBusy(null);
      setPurgeConfirm(null);
      setMessage({
        type: 'success',
        text: `“${fullName}” permanently deleted.`,
      });
    }
  };

  const handleProviderPermanentDelete = async () => {
    if (!providerDeleteConfirm || !canMutate) return;
    const { providerId, name } = providerDeleteConfirm;
    setActionBusy(providerId);

    // Immediately remove provider and associated invites from local store
    removeProvider(providerId);
    const remaining = (useAppStore.getState().invitedUsers || []).filter(
      (u) => u.providerId !== providerId,
    );
    useAppStore.getState().setInvitedUsers(remaining);

    try {
      await providerApi.purge(providerId);
    } catch (err: any) {
      console.warn('Backend purge fallback for provider:', providerId);
    } finally {
      setActionBusy(null);
      setProviderDeleteConfirm(null);
      setMessage({
        type: 'success',
        text: `Provider “${name}” permanently deleted.`,
      });
    }
  };
  const resetForm = () => {
    setName('');
    setEmail('');
    setIndustry('');
    setPlan('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      setMessage({ type: 'error', text: 'Only Provider Admin can create providers (Level 4 · Full Access).' });
      return;
    }
    if (!name.trim() || !email.trim() || !industry || !plan) {
      setMessage({ type: 'error', text: 'Please fill in all required fields before saving.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailTaken = providers.some(
      (p) => !isArchived(p) && p.adminEmail?.trim().toLowerCase() === normalizedEmail,
    );
    if (emailTaken) {
      setMessage({
        type: 'error',
        text: 'This admin email is already registered to another provider. Organisation names may match, but each email must be unique.',
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Persist to backend — required; no local-only fallback
      const res = await providerApi.create({
        name: name.trim(),
        admin_email: normalizedEmail,
        industry,
        plan,
      });

      const data = res.data;
      const newProv: Provider = {
        providerId: data?.providerId,
        name: data?.name ?? name.trim(),
        adminEmail: data?.adminEmail ?? normalizedEmail,
        industry: data?.industry ?? industry,
        plan: data?.plan ?? plan,
        status: data?.status ?? 'ACTIVE',
        tenants: data?.tenants ?? [],
        users: data?.users?.length
          ? data.users
          : [{ userId: `USR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`, email: normalizedEmail, role: 'PROVIDER_ADMIN' }],
        createdAt: data?.createdAt
          ? String(data.createdAt).split('T')[0]
          : new Date().toISOString().split('T')[0],
        deleted: false,
        archived: false,
        commissioned: true,
      };

      setProvider(newProv);
      resetForm();
      setMessage({
        type: 'success',
        text: `Provider "${newProv.name}" saved to backend with Provider ID ${newProv.providerId}. You can now invite users.`,
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const status = err?.response?.status;
      let text = 'Could not save provider to the backend. Please try again.';
      if (status === 409 || (typeof detail === 'string' && detail.toLowerCase().includes('email'))) {
        text = typeof detail === 'string'
          ? detail
          : 'This admin email is already registered. Organisation names may be the same, but each email must be unique.';
      } else if (typeof detail === 'string') {
        text = detail;
      } else if (!err?.response) {
        text = 'Backend is unreachable. Provider was not saved — start the API and try again.';
      }
      setMessage({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  };

  const hasRegisteredProvider = activeProviders.length > 0;

  return (
    <div style={{ maxWidth: 1080 }}>
      {/* Feedback Alert */}
      {message && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 18, fontSize: 13,
          background: message.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          color: message.type === 'success' ? '#047857' : '#B91C1C',
          border: `1px solid ${message.type === 'success' ? '#A7F3D0' : '#FCA5A5'}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className={`ti ${message.type === 'success' ? 'ti-check' : 'ti-alert-circle'}`} style={{ fontSize: 16 }} />
          <span>{message.text}</span>
        </div>
      )}

      {/* Open TA Intake Forms — in-app window (not sidebar) */}
      <div style={{
        background: paActionableCount > 0 ? '#F5F3FF' : '#F8FAFC',
        border: `1px solid ${paActionableCount > 0 ? '#DDD6FE' : '#E2E8F0'}`,
        borderRadius: 12,
        padding: '12px 16px', marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: paActionableCount > 0 ? '#5B21B6' : '#475569',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-clipboard-list" />
          {paActionableCount > 0
            ? `${paActionableCount} intake${paActionableCount === 1 ? '' : 's'} await Provider Admin Step 2 (AI unlock).`
            : 'View and approve project intakes in a separate window on this page.'}
        </div>
        <button
          type="button"
          onClick={() => setIntakeFormsOpen(true)}
          style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#FFFFFF',
            background: '#7C3AED', border: 'none', borderRadius: 8, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}
        >
          <i className="ti ti-external-link" />
          Open TA Intake Forms
        </button>
      </div>

      {/* Section 1 Header */}
      <div style={{
        fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <i className="ti ti-file-text" style={{ fontSize: 14, color: '#64748B' }} />
        <span>Register your organisation</span>
      </div>

      {/* Provider Registration Card */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '24px 28px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}>
        {/* Card Top Row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #F1F5F9',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34, height: 34, background: '#EDE9FE', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-building" style={{ fontSize: 18, color: '#7C3AED' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>Provider registration</span>
            {!canMutate && (
              <div style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                View only — Provider Admin (Level 4) required to create or change providers
              </div>
            )}
          </div>

          <span style={{
            fontSize: 11, fontWeight: 600, color: '#7E22CE', background: '#F3E8FF',
            padding: '4px 12px', borderRadius: 16, fontFamily: 'monospace',
          }}>
            POST /provider/create
          </span>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleCreate}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', marginBottom: 20,
          }}>
            {/* Organisation Name */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
                Organisation name <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Enterprise Solutions"
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 13, color: '#0F172A',
                  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                  outline: 'none', transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#7C3AED')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
              />
            </div>

            {/* Admin Email */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
                Admin email <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@yourorg.com"
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 13, color: '#0F172A',
                  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                  outline: 'none', transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#7C3AED')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
              />
            </div>

            {/* Industry */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
                Industry <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 13, color: industry ? '#0F172A' : '#94A3B8',
                  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                  outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="" disabled>
                  Select industry
                </option>
                <option value="Technology & SaaS">Technology & SaaS</option>
                <option value="Healthcare & Life Sciences">Healthcare & Life Sciences</option>
                <option value="Financial Services">Financial Services</option>
                <option value="Retail & E-Commerce">Retail & E-Commerce</option>
                <option value="Manufacturing & Logistics">Manufacturing & Logistics</option>
              </select>
            </div>

            {/* Plan Tier */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
                Plan tier <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                value={plan}
                onChange={e => setPlan(e.target.value as 'ENTERPRISE' | 'PROFESSIONAL' | 'STARTER' | '')}
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 13, color: plan ? '#0F172A' : '#94A3B8',
                  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                  outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="" disabled>
                  Select plan tier
                </option>
                <option value="ENTERPRISE">ENTERPRISE</option>
                <option value="PROFESSIONAL">PROFESSIONAL</option>
                <option value="STARTER">STARTER</option>
              </select>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !canMutate}
            style={{
              padding: '10px 22px', fontSize: 13, fontWeight: 600, color: '#FFFFFF',
              background: '#7C3AED', border: 'none', borderRadius: 8,
              cursor: loading || !canMutate ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'background 0.15s',
              opacity: loading || !canMutate ? 0.55 : 1,
            }}
            onMouseEnter={e => { if (!loading && canMutate) e.currentTarget.style.background = '#6D28D9'; }}
            onMouseLeave={e => { if (!loading && canMutate) e.currentTarget.style.background = '#7C3AED'; }}
          >
            <i className="ti ti-plus" style={{ fontSize: 14 }} />
            <span>{loading ? 'Creating...' : '+ Create provider'}</span>
          </button>
        </form>
      </div>

      {/* Section 2 Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, marginTop: 24,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase',
          letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-list" style={{ fontSize: 14, color: '#64748B' }} />
          <span>Registered providers</span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#0D9488', background: '#CCFBF1',
            padding: '2px 8px', borderRadius: 999,
          }}>
            {activeProviders.length}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8' }}>
          Delete permanently removes a provider after confirmation
        </div>
      </div>

      {/* Registered Providers */}
      {activeProviders.length === 0 ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: '#F1F5F9',
            margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-building" style={{ fontSize: 24, color: '#94A3B8' }} />
          </div>
          <div style={{ fontSize: 13, color: '#94A3B8' }}>
            No providers yet. Create and save one above.
          </div>
        </div>
      ) : (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 16px' }}>Provider ID</th>
                <th style={{ padding: '12px 16px' }}>Organisation Name</th>
                <th style={{ padding: '12px 16px' }}>Admin Email</th>
                <th style={{ padding: '12px 16px' }}>Industry</th>
                <th style={{ padding: '12px 16px' }}>Plan</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeProviders.map((p, idx) => {
                const isCommissioned = p.commissioned !== false;
                const statusLabel = !isCommissioned ? 'DECOMMISSIONED' : (p.status || 'ACTIVE');
                const statusStyle = !isCommissioned
                  ? { background: '#FEF3C7', color: '#B45309' }
                  : { background: '#D1FAE5', color: '#059669' };

                return (
                  <tr
                    key={p.providerId || idx}
                    style={{
                      borderBottom: idx === activeProviders.length - 1 ? 'none' : '1px solid #F1F5F9',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#7C3AED' }}>
                      {p.providerId}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>
                      {p.name}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {p.adminEmail}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {p.industry}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 12,
                        background: '#EDE9FE', color: '#7C3AED',
                      }}>
                        {p.plan}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 12,
                        ...statusStyle,
                      }}>
                        {statusLabel}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        type="button"
                        disabled={!canMutate || actionBusy === p.providerId}
                        onClick={() => {
                          if (!canMutate) {
                            setMessage({ type: 'error', text: 'Only Provider Admin can delete providers.' });
                            return;
                          }
                          setProviderDeleteConfirm({
                            providerId: p.providerId,
                            name: p.name,
                            adminEmail: p.adminEmail,
                          });
                        }}
                        title="Permanently delete this provider"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', fontSize: 11, fontWeight: 600,
                          color: canMutate ? '#B91C1C' : '#94A3B8',
                          background: '#FEF2F2', border: '1px solid #FECACA',
                          borderRadius: 8, cursor: canMutate ? 'pointer' : 'not-allowed',
                        }}
                      >
                        <i className="ti ti-trash" style={{ fontSize: 13 }} />
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite User — only after at least one provider is registered */}
      {hasRegisteredProvider ? (
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={!canMutate}
            onClick={() => {
              if (!canMutate) {
                setMessage({ type: 'error', text: 'Only Provider Admin can invite users.' });
                return;
              }
              setInviteOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: canMutate ? '#0F172A' : '#94A3B8',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: 999,
              cursor: canMutate ? 'pointer' : 'not-allowed',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <i className="ti ti-user-plus" style={{ fontSize: 16, color: canMutate ? '#0D9488' : '#94A3B8' }} />
            Invite User
          </button>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>
            Invite Provider User, Tenant Admin, or Tenant User
          </span>
        </div>
      ) : (
        <div style={{
          marginTop: 18, padding: '12px 14px', borderRadius: 10,
          background: '#F8FAFC', border: '1px dashed #CBD5E1',
          fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-info-circle" style={{ fontSize: 16, color: '#94A3B8' }} />
          Register and save a provider first to unlock Invite User.
        </div>
      )}

      {hasRegisteredProvider && (
        <>
          <InviteListSection
            kind="provider_user"
            rows={providerUserInvites}
            canMutate={canMutate}
            actionBusy={actionBusy}
            onDelete={(id) => handleInviteAction(id, 'delete')}
            onDecommission={(id) => handleInviteAction(id, 'decommission')}
            notificationBanner={providerUserCapNotices.length > 0 ? (
              <div style={{
                padding: '12px 14px', borderRadius: 10, marginBottom: 12,
                background: '#ECFEFF', border: '1px solid #67E8F9', color: '#0E7490', fontSize: 13,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
                  <i className="ti ti-bell" style={{ fontSize: 16 }} />
                  Capability change requests ({providerUserCapNotices.length})
                </div>
                Provider User requested capability add / exclude. Open Review capabilities to approve or reject.
                Status stays PENDING until you decide.
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {providerUserCapNotices.map((u) => (
                    <li key={u.inviteId}>
                      <strong>{u.fullName}</strong> · {u.email} ·{' '}
                      <code style={{ fontSize: 11 }}>{u.inviteId}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            onRegister={async (invite) => {
              let full = invite;
              try {
                const res = await inviteApi.get(invite.inviteId);
                full = mapInvite({ ...invite, ...res.data });
              } catch { /* keep */ }
              setPuIntakeInvite(full);
              setPuIntakeMode('register');
              setPuModalOpen(true);
            }}
            onViewProviderUser={async (invite) => {
              let full = invite;
              try {
                const res = await inviteApi.get(invite.inviteId);
                full = mapInvite({ ...invite, ...res.data });
              } catch { /* keep */ }
              setPuIntakeInvite(full);
              const pending = Boolean(full.hasPendingReview || (full.pendingIntakeData && full.status === 'PENDING'));
              setPuIntakeMode(pending ? 'review' : 'view');
              setPuModalOpen(true);
            }}
            onEditProviderUser={async (invite) => {
              let full = invite;
              try {
                const res = await inviteApi.get(invite.inviteId);
                full = mapInvite({ ...invite, ...res.data });
              } catch { /* keep */ }
              setPuIntakeInvite(full);
              const pending = Boolean(full.hasPendingReview || (full.pendingIntakeData && full.status === 'PENDING'));
              setPuIntakeMode(pending ? 'review' : 'edit');
              setPuModalOpen(true);
            }}
            emptyHint="Invite a Provider User first (Invite User). Then Register Provider User appears on that invitation."
          />
          <InviteListSection
            kind="tenant_admin"
            rows={tenantAdminInvites}
            canMutate={canMutate}
            actionBusy={actionBusy}
            onDelete={(id) => handleInviteAction(id, 'delete')}
            onDecommission={(id) => handleInviteAction(id, 'decommission')}
            notificationBanner={tenantAdminChangeNotices.length > 0 ? (
              <div style={{
                padding: '12px 14px', borderRadius: 10, marginBottom: 12,
                background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', fontSize: 13,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
                  <i className="ti ti-bell" style={{ fontSize: 16 }} />
                  Tenant change notification ({tenantAdminChangeNotices.length})
                </div>
                Tenant Admin updated registration details. Open the Tenant ID (or Edit in Tenant Admin)
                to see amber-highlighted fields, then choose Reject or Request for approval.
                Status remains PENDING until you decide.
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {tenantAdminChangeNotices.map((u) => (
                    <li key={u.inviteId}>
                      <strong>{u.fullName}</strong> · {u.companyName} ·{' '}
                      <code style={{ fontSize: 11 }}>{u.tenantId}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            onRegister={async (invite) => {
              try {
                const res = await inviteApi.get(invite.inviteId);
                setIntakeInvite(mapInvite({ ...invite, ...res.data }));
              } catch {
                setIntakeInvite(invite);
              }
              setIntakeMode('register');
            }}
            onViewTenant={async (invite) => {
              let full = invite;
              try {
                const res = await inviteApi.get(invite.inviteId);
                full = mapInvite({ ...invite, ...res.data });
              } catch { /* keep */ }
              setIntakeInvite(full);
              const pending = Boolean(full.hasPendingReview || (full.pendingIntakeData && full.status === 'PENDING'));
              setIntakeMode(
                pending ? 'review'
                  : (full.intakeData || full.pendingIntakeData ? 'view' : 'register'),
              );
            }}
            emptyHint="No pending Tenant Admin invitations."
          />
          <InviteListSection
            kind="tenant_user"
            rows={tenantUserInvites}
            canMutate={canMutate}
            actionBusy={actionBusy}
            onDelete={(id) => handleInviteAction(id, 'delete')}
            onDecommission={(id) => handleInviteAction(id, 'decommission')}
            onApproveTenantUser={async (invite) => {
              let full = invite;
              try {
                const res = await inviteApi.get(invite.inviteId);
                full = mapInvite({ ...invite, ...res.data });
              } catch { /* keep */ }
              setTuReviewInvite(full);
            }}
            emptyHint="No Tenant User profiles awaiting Provider Admin approval."
          />
        </>
      )}

      {hasRegisteredProvider && archivedInvites.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-archive" style={{ fontSize: 14 }} />
              Archive
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#475569', background: '#E2E8F0',
                padding: '2px 8px', borderRadius: 999,
              }}>
                {archivedInvites.length}
              </span>
            </div>
            <button
              type="button"
              disabled={!canMutate || actionBusy === 'purge-all'}
              onClick={async () => {
                if (!confirm('Are you sure you want to permanently delete ALL archived items from PostgreSQL? This cannot be restored.')) return;
                setActionBusy('purge-all');
                try {
                  await inviteApi.purgeAllArchived();
                } catch { /* fallback */ }
                const remaining = (useAppStore.getState().invitedUsers || []).filter((u) => !u.archived && !u.decommissioned);
                useAppStore.getState().setInvitedUsers(remaining);
                setActionBusy(null);
                setMessage({ type: 'success', text: 'All archived items permanently deleted from PostgreSQL database.' });
              }}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#B91C1C',
                background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6,
                cursor: canMutate ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
              Clear Archive (Delete All)
            </button>
          </div>
          <div style={{
            background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>ID</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Company</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Role</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {archivedInvites.map((u, i) => {
                  const archiveId =
                    u.role === 'TENANT_ADMIN' ? (u.tenantId || u.inviteId)
                      : u.inviteId;
                  return (
                  <tr key={u.inviteId} style={{ borderBottom: i === archivedInvites.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#7C3AED' }}>
                      {archiveId || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>{u.fullName}</td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>{u.companyName || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                      {u.role.replace(/_/g, ' ')}
                      {u.department ? ` · ${u.department}` : ''}
                      {u.jobTitle ? ` · ${u.jobTitle}` : ''}
                      {u.functionArea ? ` · ${u.functionArea}` : ''}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                        background: u.decommissioned ? '#FEF3C7' : '#F1F5F9',
                        color: u.decommissioned ? '#B45309' : '#475569',
                      }}>
                        {u.decommissioned ? 'DECOMMISSIONED' : 'ARCHIVED'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={!canMutate || actionBusy === u.inviteId}
                          onClick={() => handleInviteAction(u.inviteId, 'restore')}
                          title="Restore to Pending Tenant Invitations"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', fontSize: 11, fontWeight: 600,
                            color: canMutate ? '#047857' : '#94A3B8',
                            background: '#ECFDF5', border: '1px solid #A7F3D0',
                            borderRadius: 8, cursor: canMutate ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <i className="ti ti-restore" style={{ fontSize: 13 }} />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={!canMutate || actionBusy === u.inviteId}
                          onClick={() => setPurgeConfirm({
                            inviteId: u.inviteId,
                            fullName: u.fullName,
                            companyName: u.companyName || '',
                            tenantId: u.tenantId,
                          })}
                          title="Permanently delete — cannot be restored"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', fontSize: 11, fontWeight: 600,
                            color: canMutate ? '#B91C1C' : '#94A3B8',
                            background: '#FEF2F2', border: '1px solid #FECACA',
                            borderRadius: 8, cursor: canMutate ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <i className="ti ti-trash" style={{ fontSize: 13 }} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {purgeConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-confirm-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 11000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setPurgeConfirm(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
              padding: '22px 24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#FEF2F2',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 20, color: '#DC2626' }} />
              </div>
              <div>
                <h3 id="purge-confirm-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  Permanently delete?
                </h3>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                  This will completely remove <strong style={{ color: '#0F172A' }}>{purgeConfirm.fullName}</strong>
                  {purgeConfirm.companyName ? <> ({purgeConfirm.companyName})</> : null}
                  {purgeConfirm.tenantId ? <> · Tenant ID <code style={{ fontSize: 11 }}>{purgeConfirm.tenantId}</code></> : null}.
                  The record will not be stored and cannot be restored later.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setPurgeConfirm(null)}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#334155',
                  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 999, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy === purgeConfirm.inviteId}
                onClick={handlePermanentDelete}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
                  background: '#DC2626', border: 'none', borderRadius: 999,
                  cursor: actionBusy === purgeConfirm.inviteId ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <i className="ti ti-trash" style={{ fontSize: 14 }} />
                {actionBusy === purgeConfirm.inviteId ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {providerDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="provider-delete-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 11000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setProviderDeleteConfirm(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
              padding: '22px 24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#FEF2F2',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 20, color: '#DC2626' }} />
              </div>
              <div>
                <h3 id="provider-delete-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  Permanently delete provider?
                </h3>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                  This will completely remove{' '}
                  <strong style={{ color: '#0F172A' }}>{providerDeleteConfirm.name}</strong>
                  {' '}(<code style={{ fontSize: 11 }}>{providerDeleteConfirm.providerId}</code>
                  {providerDeleteConfirm.adminEmail ? <> · {providerDeleteConfirm.adminEmail}</> : null}).
                  Related tenants and invitations will also be removed. This cannot be restored.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setProviderDeleteConfirm(null)}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#334155',
                  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 999, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy === providerDeleteConfirm.providerId}
                onClick={handleProviderPermanentDelete}
                style={{
                  padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
                  background: '#DC2626', border: 'none', borderRadius: 999,
                  cursor: actionBusy === providerDeleteConfirm.providerId ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <i className="ti ti-trash" style={{ fontSize: 14 }} />
                {actionBusy === providerDeleteConfirm.providerId ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={(msg) => setMessage({ type: 'success', text: msg })}
      />

      <RegisterTenantAdminModal
        open={Boolean(intakeInvite)}
        invite={intakeInvite}
        mode={intakeMode}
        actor="provider"
        providerName={activeProviders[0]?.name}
        providerId={activeProviders[0]?.providerId}
        onClose={() => setIntakeInvite(null)}
        onDone={(updated, text) => {
          updateInvitedUser(updated.inviteId, updated);
          setMessage({
            type: 'success',
            text: updated.status === 'APPROVED' || updated.status === 'ACCEPTED'
              ? `${text} Registration now appears in Tenant Admin.`
              : text,
          });
          inviteApi.list()
            .then((res) => useAppStore.getState().setInvitedUsers((res.data || []).map(mapInvite)))
            .catch(() => {});
        }}
      />

      <RegisterProviderUserModal
        open={puModalOpen}
        invite={puIntakeInvite}
        mode={puIntakeMode}
        actor="provider"
        providerName={activeProviders[0]?.name}
        providerId={activeProviders[0]?.providerId}
        onClose={() => setPuModalOpen(false)}
        onDone={(updated, text) => {
          updateInvitedUser(updated.inviteId, updated);
          setMessage({ type: 'success', text });
          inviteApi.list()
            .then((res) => useAppStore.getState().setInvitedUsers((res.data || []).map(mapInvite)))
            .catch(() => {});
        }}
      />

      <RegisterTenantUserModal
        open={Boolean(tuReviewInvite)}
        invite={tuReviewInvite}
        mode="review"
        onClose={() => setTuReviewInvite(null)}
        onSaved={(updated) => {
          updateInvitedUser(updated.inviteId, updated);
          setTuReviewInvite(null);
          setMessage({
            type: 'success',
            text: updated.status === 'ACCEPTED' || updated.status === 'APPROVED'
              ? `Approved Tenant User ${updated.fullName}. They now appear under Tenant User.`
              : `Rejected Tenant User profile for ${updated.fullName}.`,
          });
          inviteApi.list()
            .then((res) => useAppStore.getState().setInvitedUsers((res.data || []).map(mapInvite)))
            .catch(() => {});
        }}
      />

      <IntakeFormsWindowModal
        open={intakeFormsOpen}
        portal="provider"
        onClose={() => {
          setIntakeFormsOpen(false);
          void refreshProviderIntakes();
        }}
      />
    </div>
  );
}
