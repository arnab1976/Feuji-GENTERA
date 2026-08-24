/**
 * Review/edit Project Intake and apply the correct 2-factor approval step.
 * Status drives the actor — never call Provider Admin approve on pending_tenant_approval.
 *
 * Step 1 pending_tenant_approval  → Tenant Admin → pending_provider_approval (AI still locked)
 * Step 2 pending_provider_approval → Provider Admin → queued_for_recommendation (AI unlocked)
 */
import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { IntakeForm } from '@/types';
import { workflowApi } from '@/services/api';

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  color: '#0F172A',
  background: '#F8FAFC',
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
};

function resolveStep(status?: string): {
  actor: 'Tenant Admin' | 'Provider Admin';
  step: 1 | 2 | null;
  approveLabel: string;
  accent: string;
  hint: string;
} {
  if (status === 'pending_tenant_approval') {
    return {
      actor: 'Tenant Admin',
      step: 1,
      approveLabel: 'Approve → Forward to Provider Admin',
      accent: '#0D9488',
      hint: 'Step 1 of 2 — Tenant Admin can approve now (no wait). After this, Provider Admin Level Sign-Off is still required. AI Engine stays locked.',
    };
  }
  if (status === 'pending_provider_approval') {
    return {
      actor: 'Provider Admin',
      step: 2,
      approveLabel: 'Approve → Unlock AI Engine',
      accent: '#7C3AED',
      hint: 'Step 2 of 2 — Tenant Admin already approved. Provider Admin Level Sign-Off unlocks AI / cost / Terraform for Tenant User.',
    };
  }
  return {
    actor: 'Provider Admin',
    step: null,
    approveLabel: 'Approve',
    accent: '#94A3B8',
    hint: `Intake status is "${status || 'unknown'}" — no approval action available.`,
  };
}

export default function IntakeReviewModal({
  open,
  intake,
  actorRole: _actorRoleProp,
  approvalGate = 'auto',
  onClose,
  onSuccess,
}: {
  open: boolean;
  intake: IntakeForm | null;
  /** Hint only — effective actor is derived from intake.status for strict 2-factor RBAC */
  actorRole?: 'Tenant Admin' | 'Provider Admin';
  /**
   * Page gate so both approvals are not offered on the same screen:
   * - tenant: Step 1 only; after TA approve show status + go to Provider Admin portal
   * - provider: Step 2 Unlock AI only; Step 1 must be done elsewhere
   * - auto: status-driven (legacy)
   */
  approvalGate?: 'tenant' | 'provider' | 'auto';
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [projectName, setProjectName] = useState('');
  const [cloud, setCloud] = useState('azure');
  const [appCategory, setAppCategory] = useState('rag');
  const [environment, setEnvironment] = useState('prod');
  const [compliance, setCompliance] = useState('HIPAA');
  const [budgetCeiling, setBudgetCeiling] = useState(2000);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !intake) return;
    setProjectName(intake.project || '');
    setCloud(intake.cloud || 'azure');
    setAppCategory(intake.appCategory || 'rag');
    setEnvironment(intake.environment || 'prod');
    setCompliance(intake.compliance || 'HIPAA');
    setBudgetCeiling(intake.budgetCeiling ?? 2000);
    setDescription(intake.description || '');
    setNotes('');
    setError(null);
    setLoading(false);
  }, [open, intake]);

  if (!open || !intake) return null;

  const stepInfo = resolveStep(intake.status);
  const gateBlocksStep2 = approvalGate === 'tenant' && intake.status === 'pending_provider_approval';
  const gateBlocksStep1 = approvalGate === 'provider' && intake.status === 'pending_tenant_approval';
  const canDecide = stepInfo.step !== null && !gateBlocksStep2 && !gateBlocksStep1;

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (gateBlocksStep2) {
      setError("It's require Provider Admin level approval. Open the Provider Admin portal — both approvals cannot be done on this page.");
      return;
    }
    if (gateBlocksStep1) {
      setError('Tenant Admin must approve first on the Tenant Admin page. Provider Admin Unlock AI is Step 2 only.');
      return;
    }
    if (!canDecide) {
      setError(stepInfo.hint);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await workflowApi.decideIntake(intake.intakeId, {
        decision,
        notes: notes.trim(),
        actor_role: stepInfo.actor,
        actor_name: stepInfo.actor,
        project_name: projectName.trim(),
        cloud,
        app_category: appCategory,
        environment,
        compliance,
        budget_ceiling: Number(budgetCeiling) || 2000,
        description: description.trim(),
      });

      if (decision === 'approve') {
        const nextMsg = stepInfo.step === 1
          ? `Intake ${intake.intakeId} approved by Tenant Admin (Step 1/2). Forwarded for Provider Admin Level Sign-Off — AI Engine stays locked until Step 2.`
          : `Intake ${intake.intakeId} approved by Provider Admin (Step 2/2). AI Recommendation unlocked for Tenant User.`;
        onSuccess(nextMsg);
      } else {
        onSuccess(`Intake ${intake.intakeId} rejected by ${stepInfo.actor}.`);
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Decision failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto',
          background: '#FFFFFF', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)', border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #F1F5F9', position: 'relative' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
            Review & Approve Project Intake ({intake.intakeId})
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B' }}>
            Submitted by <strong>{intake.submittedByRole || intake.submittedBy}</strong> under tenant{' '}
            <strong>{intake.tenantName || intake.tenantId}</strong>.
            {' '}Current status: <strong>{intake.status}</strong>
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 8,
              border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 16 }} />
          </button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>
          {gateBlocksStep2 ? (
            <div style={{
              fontSize: 12, lineHeight: 1.5, color: '#92400E', background: '#FFFBEB',
              border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px',
            }}>
              <strong>Approved by Tenant Admin.</strong>
              {' '}It&apos;s require Provider Admin level approval.
              Both approvals cannot be done on this page — close this form and open the{' '}
              <strong>Provider Admin</strong> portal to Unlock AI Engine.
            </div>
          ) : gateBlocksStep1 ? (
            <div style={{
              fontSize: 12, lineHeight: 1.5, color: '#92400E', background: '#FFFBEB',
              border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px',
            }}>
              Waiting for Tenant Admin Step 1. Provider Admin Unlock AI is only available after
              Tenant Admin approval — that step is done on the Tenant Admin page, not here.
            </div>
          ) : (
            <div style={{
              fontSize: 12, lineHeight: 1.45, color: stepInfo.step === 1 ? '#0F766E' : '#5B21B6',
              background: stepInfo.step === 1 ? '#F0FDFA' : '#F5F3FF',
              border: `1px solid ${stepInfo.step === 1 ? '#99F6E4' : '#DDD6FE'}`,
              borderRadius: 8, padding: '10px 12px',
            }}>
              <strong>{stepInfo.step ? `2-factor Step ${stepInfo.step}/2 — ${stepInfo.actor}` : 'No active approval step'}</strong>
              <div style={{ marginTop: 4 }}>{stepInfo.hint}</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Project Name</label>
              <input style={inputStyle} value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Cloud Provider</label>
              <select style={inputStyle} value={cloud} onChange={(e) => setCloud(e.target.value)}>
                <option value="azure">Azure</option>
                <option value="aws">AWS</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>App Category</label>
              <select style={inputStyle} value={appCategory} onChange={(e) => setAppCategory(e.target.value)}>
                <option value="rag">RAG — Retrieval-Augmented Gen</option>
                <option value="agent">Agent — Autonomous Workflows</option>
                <option value="summariser">Summariser — Document Intel</option>
                <option value="finetuning">Fine-tuning — Custom Models</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Environment</label>
              <select style={inputStyle} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                <option value="prod">Production</option>
                <option value="uat">UAT</option>
                <option value="dev">Development</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Compliance</label>
              <select style={inputStyle} value={compliance} onChange={(e) => setCompliance(e.target.value)}>
                <option value="HIPAA">HIPAA</option>
                <option value="SOC2">SOC2</option>
                <option value="GDPR">GDPR</option>
                <option value="None">None</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Budget Ceiling ($/mo)</label>
              <input type="number" min={0} style={inputStyle} value={budgetCeiling} onChange={(e) => setBudgetCeiling(Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Tenant Scope</label>
              <input style={{ ...inputStyle, background: '#F1F5F9' }} value={intake.tenantName || intake.tenantId} readOnly />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Requirement Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical', background: '#FFFFFF' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Approval / Review Notes (optional)</label>
            <input
              style={{ ...inputStyle, background: '#FFFFFF' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                stepInfo.step === 1
                  ? 'e.g. Approved with adjustments. Forwarded for Provider sign-off.'
                  : 'e.g. Provider sign-off complete. Unlock AI Engine.'
              }
            />
          </div>

          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#475569', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer' }}
          >
            Cancel
          </button>
          {!gateBlocksStep2 && (
            <button
              type="button"
              disabled={loading || !canDecide}
              onClick={() => handleDecision('reject')}
              style={{
                padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#BE123C', background: '#FFFFFF',
                border: '1px solid #FECDD3', borderRadius: 8,
                cursor: loading || !canDecide ? 'not-allowed' : 'pointer',
                opacity: canDecide ? 1 : 0.5,
              }}
            >
              <i className="ti ti-x" style={{ marginRight: 4 }} />
              Reject
            </button>
          )}
          <button
            type="button"
            disabled={loading || !canDecide || gateBlocksStep2}
            onClick={() => handleDecision('approve')}
            title={gateBlocksStep2 ? 'Go to Provider Admin portal for Step 2' : undefined}
            style={{
              padding: '8px 18px', fontSize: 12, fontWeight: 700,
              color: gateBlocksStep2 ? '#047857' : '#FFFFFF',
              background: gateBlocksStep2 ? '#D1FAE5' : (canDecide ? stepInfo.accent : '#94A3B8'),
              border: gateBlocksStep2 ? '1px solid #A7F3D0' : 'none', borderRadius: 8,
              cursor: loading || !canDecide || gateBlocksStep2 ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className={gateBlocksStep2 ? 'ti ti-circle-check' : 'ti ti-check'} />
            {loading ? 'Processing…' : (gateBlocksStep2 ? 'Approved by Tenant Admin' : stepInfo.approveLabel)}
          </button>
        </div>
      </div>
    </div>
  );
}
