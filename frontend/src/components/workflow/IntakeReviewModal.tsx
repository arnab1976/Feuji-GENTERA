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

export default function IntakeReviewModal({
  open,
  intake,
  actorRole,
  onClose,
  onSuccess,
}: {
  open: boolean;
  intake: IntakeForm | null;
  actorRole: 'Tenant Admin' | 'Provider Admin';
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

  const handleDecision = async (decision: 'approve' | 'reject') => {
    setLoading(true);
    setError(null);
    try {
      await workflowApi.decideIntake(intake.intakeId, {
        decision,
        notes: notes.trim(),
        actor_role: actorRole,
        actor_name: actorRole,
        project_name: projectName.trim(),
        cloud,
        app_category: appCategory,
        environment,
        compliance,
        budget_ceiling: Number(budgetCeiling) || 2000,
        description: description.trim(),
      });

      if (decision === 'approve') {
        const nextMsg = actorRole === 'Tenant Admin'
          ? `Intake ${intake.intakeId} approved by Tenant Admin! Forwarded to Provider Admin portal.`
          : `Intake ${intake.intakeId} approved by Provider Admin! Stage 2 AI Recommendation unlocked.`;
        onSuccess(nextMsg);
      } else {
        onSuccess(`Intake ${intake.intakeId} rejected.`);
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
            You can review, make adjustments if needed, and approve or reject.
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
              placeholder="e.g. Approved with adjustments. Forwarded for Provider sign-off."
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
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDecision('reject')}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#BE123C', background: '#FFFFFF', border: '1px solid #FECDD3', borderRadius: 8, cursor: loading ? 'wait' : 'pointer' }}
          >
            <i className="ti ti-x" style={{ marginRight: 4 }} />
            Reject
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDecision('approve')}
            style={{
              padding: '8px 18px', fontSize: 12, fontWeight: 700, color: '#FFFFFF',
              background: actorRole === 'Tenant Admin' ? '#0D9488' : '#7C3AED',
              border: 'none', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className="ti ti-check" />
            {actorRole === 'Tenant Admin' ? 'Approve & Forward to Provider Admin' : 'Approve → Unlock AI Engine'}
          </button>
        </div>
      </div>
    </div>
  );
}
