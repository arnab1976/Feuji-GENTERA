/**
 * In-app floating window for Project / TA Intake Forms (no sidebar page).
 */
import ProjectIntakeFormsPortal from '@/components/admin/ProjectIntakeFormsPortal';

export default function IntakeFormsWindowModal({
  open,
  portal,
  onClose,
}: {
  open: boolean;
  portal: 'provider' | 'tenant';
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="TA Intake Forms"
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(1120px, 96vw)',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#F8FAFC',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          boxShadow: '0 28px 80px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          flexShrink: 0,
          padding: '14px 18px',
          borderBottom: '1px solid #E2E8F0',
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-clipboard-list" style={{ color: portal === 'provider' ? '#7C3AED' : '#0D9488' }} />
              TA Intake Forms
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              {portal === 'provider'
                ? 'Provider Admin view — Step 2 approve / unlock AI when ready'
                : 'Tenant Admin view — Step 1 approve when ready'}
              {' · '}Same main window overlay
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: '1px solid #E2E8F0', background: '#F8FAFC',
              color: '#475569', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 20px' }}>
          <ProjectIntakeFormsPortal portal={portal} />
        </div>
      </div>
    </div>
  );
}
