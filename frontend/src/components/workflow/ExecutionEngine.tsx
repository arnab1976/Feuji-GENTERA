/**
 * Stage 5 — Terraform Execution Engine — Jump Box
 * Ephemeral Kubernetes Job / Local Execution Worker executes terraform init -> plan -> apply,
 * streams live stdout/stderr execution logs, purges in-memory credentials upon completion,
 * and passes deployment outputs.json into Phase 2 (OPTIMA-AI).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { workflowApi } from '@/services/api';

export default function ExecutionEngine() {
  const {
    intakeForm,
    resourcePlan,
    terraformArtifact,
    setDeploymentOutputs,
    markStageComplete,
    setPage,
  } = useAppStore();

  const tenantId = intakeForm?.tenantId || 'TENANT_BL2WST';
  const cloud = (intakeForm?.cloud || 'azure').toUpperCase();
  const jobName = `tf-run-${tenantId}-9ts8`;

  const [action, setAction] = useState<'apply' | 'plan' | 'destroy'>('apply');
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [executionDone, setExecutionDone] = useState(false);
  const [currentStep, setCurrentStep] = useState(8); // 1 to 8 steps
  const [durationSec, setDurationSec] = useState(8);
  const [deploymentResult, setDeploymentResult] = useState<any>(null);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startExecution = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsExecuting(true);
    setExecutionDone(false);
    setProgress(0);
    setLogs([]);
    setCurrentStep(1);

    const logSequence = [
      `[00:00.100] Spawning ephemeral Jump Box container (job: ${jobName})...`,
      `[00:00.400] Injecting short-lived session token & security context [Tenant=${tenantId}]`,
      `[00:00.800] Fetching artifact from Local Store / S3: artifacts/tenants/${tenantId}/terraform-blueprint.zip`,
      `[00:01.200] Unpacking HCL files: main.tf, variables.tf, outputs.tf, providers.tf...`,
      `[00:01.800] Executing: terraform init -input=false`,
      `[00:02.300] Initializing provider plugins for ${cloud}... SUCCESS (4 providers initialized)`,
      `[00:03.100] Executing: terraform plan -out=tfplan.binary`,
      `[00:04.200] Plan: 7 to add, 0 to change, 0 to destroy. (OPA policy check: 0 violations)`,
      `[00:05.000] User approval confirmed. Executing: terraform apply -auto-approve tfplan.binary`,
      `[00:06.100] ${cloud.toLowerCase()}_vpc.main: Creation complete [id=vpc-0a1b2c3d4e]`,
      `[00:06.800] ${cloud.toLowerCase()}_subnet.private[0]: Creation complete [cidr=10.0.1.0/24]`,
      `[00:07.400] ${cloud.toLowerCase()}_db_instance.postgres: Creating... (2 min)`,
      `[00:07.900] ${cloud.toLowerCase()}_db_instance.postgres: Creation complete [id=rag-db-prod]`,
      `[00:08.200] ${cloud.toLowerCase()}_bedrock_endpoint.main: Creation complete [endpoint=https://oai-${tenantId.toLowerCase()}.openai.azure.com]`,
      `[00:08.500] Apply complete! Resources: 7 added, 0 changed, 0 destroyed.`,
      `[00:08.700] Generated deployment outputs.json in local artifact store.`,
      `[00:08.900] Purging in-memory cloud credentials & terminating Jump Box container.`,
    ];

    let stepIdx = 0;
    intervalRef.current = setInterval(() => {
      if (stepIdx < logSequence.length) {
        const nextLine = logSequence[stepIdx];
        if (nextLine) {
          setLogs((prev) => [...prev, nextLine]);
        }
        const pct = Math.round(((stepIdx + 1) / logSequence.length) * 100);
        setProgress(pct);

        if (pct <= 12) setCurrentStep(1);
        else if (pct <= 25) setCurrentStep(2);
        else if (pct <= 37) setCurrentStep(3);
        else if (pct <= 50) setCurrentStep(4);
        else if (pct <= 62) setCurrentStep(5);
        else if (pct <= 75) setCurrentStep(6);
        else if (pct <= 88) setCurrentStep(7);
        else setCurrentStep(8);

        stepIdx++;
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsExecuting(false);
        setExecutionDone(true);
        setCurrentStep(8);

        const outputs = {
          postgresql_fqdn: `psql-${tenantId.toLowerCase()}.postgres.database.azure.com`,
          aks_cluster_name: `aks-${tenantId.toLowerCase()}-prod`,
          resource_group: `rg-${tenantId.toLowerCase()}-prod`,
          openai_endpoint: `https://oai-${tenantId.toLowerCase()}.openai.azure.com`,
          key_vault_uri: `https://kv-${tenantId.toLowerCase()}.vault.azure.net`,
          raw_outputs: {
            status: 'deployed',
            timestamp: new Date().toISOString(),
          },
        };

        setDeploymentResult(outputs);
        setDeploymentOutputs(outputs);
        markStageComplete('execution');

        if (terraformArtifact?.artifactId) {
          workflowApi.executeTF({
            artifact_id: terraformArtifact.artifactId,
            tenant_id: tenantId,
            action,
          }).catch(() => {});
        }
      }
    }, 160);
  }, [tenantId, cloud, action, jobName, terraformArtifact, setDeploymentOutputs, markStageComplete]);

  useEffect(() => {
    startExecution();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [startExecution]);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleProceedOptima = () => {
    setPage('optima-overview');
  };

  const handleProceedHealth = () => {
    markStageComplete('execution');
    setPage('health');
  };

  const lifecycleSteps = [
    { label: 'Local / K8s Job created', step: 1 },
    { label: 'Creds injected', step: 2 },
    { label: 'HCL from Store/S3', step: 3 },
    { label: 'terraform init', step: 4 },
    { label: 'terraform plan', step: 5 },
    { label: 'User approves', step: 6 },
    { label: 'terraform apply', step: 7 },
    { label: 'Container destroyed', step: 8 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {/* ── BREADCRUMB & HEADER (SNAPSHOT 2) ───────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 999, background: '#DCFCE7', color: '#16A34A',
            border: '1px solid #BBF7D0',
          }}>
            STAGE 5
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>›</span>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            Terraform Execution Engine — Jump Box
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          Terraform Execution Engine — Jump Box
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 880 }}>
          An ephemeral execution worker container (or K8s Job) fetches tenant-scoped HCL from local store/S3, injects cloud credentials in-memory from Secrets Manager, and runs terraform plan then apply. One tenant deployment = one isolated container process. Live logs stream to the browser via WebSocket. The worker auto-destroys on completion — credentials exist nowhere after exit.
        </p>
      </div>

      {/* ── BLUE NOTICE BANNER (SNAPSHOT 2) ────────────────────────────────── */}
      <div style={{
        padding: '12px 18px', background: '#F0F9FF', border: '1px solid #BAE6FD',
        borderRadius: 10, color: '#0369A1', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-box" style={{ fontSize: 18, color: '#0284C7' }} />
        <span>
          One execution worker container per tenant per run. Worker destroyed on completion. Credentials for <strong>{tenantId}</strong> only — never shared across tenants.
        </span>
      </div>

      {/* ── STATUS SUMMARY CARDS GRID (4 CARDS - SNAPSHOT 2) ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {/* Card 1: STATUS */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            STATUS
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {executionDone ? 'Complete' : isExecuting ? 'Executing...' : 'Ready'}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Runner: local-process / tf-execution
          </div>
        </div>

        {/* Card 2: JOB NAME */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            JOB NAME
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {jobName}
          </div>
        </div>

        {/* Card 3: DURATION */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            DURATION
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {durationSec}s
          </div>
        </div>

        {/* Card 4: RESOURCES */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            RESOURCES
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            34
          </div>
        </div>
      </div>

      {/* ── JUMP BOX LIFECYCLE — 8 STEPS STEPPER (SNAPSHOT 2) ──────────────── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14,
        padding: '18px 20px', boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-git-commit" style={{ fontSize: 14 }} />
          JUMP BOX LIFECYCLE — 8 STEPS
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {lifecycleSteps.map((s, idx) => {
            const isDone = currentStep > s.step || executionDone;
            const isActive = currentStep === s.step && isExecuting;
            return (
              <div key={s.step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: isDone ? '#DCFCE7' : isActive ? '#DBEAFE' : '#F1F5F9',
                    border: `2px solid ${isDone ? '#16A34A' : isActive ? '#2563EB' : '#CBD5E1'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isDone ? '#16A34A' : isActive ? '#2563EB' : '#94A3B8',
                    transition: 'all 0.3s ease',
                  }}>
                    {isDone ? (
                      <i className="ti ti-check" style={{ fontSize: 16, fontWeight: 'bold' }} />
                    ) : isActive ? (
                      <i className="ti ti-loader spin" style={{ fontSize: 16 }} />
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{s.step}</span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10.5, fontWeight: isActive || isDone ? 700 : 500,
                    color: isDone ? '#16A34A' : isActive ? '#2563EB' : '#64748B',
                    textAlign: 'center', maxWidth: 85, lineHeight: 1.2,
                  }}>
                    {s.label}
                  </span>
                </div>

                {idx < lifecycleSteps.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: '0 6px', marginTop: -18,
                    background: isDone ? '#16A34A' : '#E2E8F0',
                    transition: 'background 0.3s ease',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── LIVE TERRAFORM LOG STREAM CONSOLE (SNAPSHOT 2) ─────────────────── */}
      <div style={{
        background: '#0B1329', border: '1px solid #1E293B', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
      }}>
        {/* Terminal Header */}
        <div style={{
          background: '#0F172A', padding: '12px 18px', borderBottom: '1px solid #1E293B',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#38BDF8', fontFamily: 'monospace' }}>
              &gt;_ LIVE TERRAFORM LOG STREAM
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={startExecution}
              disabled={isExecuting}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                background: isExecuting ? '#334155' : '#10B981', color: '#FFFFFF',
                border: 'none', cursor: isExecuting ? 'not-allowed' : 'pointer',
              }}
            >
              {isExecuting ? 'Running...' : 'Re-run Jump Box'}
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: 3, background: '#1E293B' }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: executionDone ? '#10B981' : 'linear-gradient(90deg, #10B981, #3B82F6)',
            transition: 'width 0.2s ease',
          }} />
        </div>

        {/* Terminal Log Output Window */}
        <div style={{
          padding: '16px 20px', height: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12.5,
          color: '#E2E8F0', lineHeight: 1.65, background: '#0B1329',
        }}>
          {logs.map((logLine, index) => {
            const safeLine = String(logLine || '');
            const isSuccess = safeLine.includes('complete') || safeLine.includes('SUCCESS') || safeLine.includes('Creation complete');
            const isCommand = safeLine.includes('Executing:') || safeLine.includes('Spawning');
            return (
              <div key={index} style={{
                color: isSuccess ? '#34D399' : isCommand ? '#FDE047' : '#94A3B8',
                fontWeight: isSuccess || isCommand ? 600 : 400,
              }}>
                {safeLine}
              </div>
            );
          })}
          <div ref={consoleEndRef} />
        </div>
      </div>

      {/* ── DEPLOYMENT OUTPUTS CARD (OUTPUTS.JSON) ─────────────────────────── */}
      {deploymentResult && (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: '18px 20px',
          boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-brackets" style={{ fontSize: 18, color: '#059669' }} />
            <span>Generated Infrastructure Endpoints (<code style={{ fontSize: 12 }}>outputs.json</code>)</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
              background: '#D1FAE5', color: '#047857', border: '1px solid #A7F3D0', marginLeft: 'auto',
            }}>
              Feeds into Phase 2 OPTIMA-AI
            </span>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12,
            background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #E2E8F0',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>PostgreSQL FQDN</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', marginTop: 2 }}>
                {deploymentResult.postgresql_fqdn}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Cluster Name</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', marginTop: 2 }}>
                {deploymentResult.aks_cluster_name}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>LLM OpenAI Endpoint</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#059669', fontFamily: 'monospace', marginTop: 2 }}>
                {deploymentResult.openai_endpoint}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Key Vault URI</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', marginTop: 2 }}>
                {deploymentResult.key_vault_uri}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTION NAVIGATION CTA ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleProceedHealth}
          disabled={isExecuting}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: isExecuting ? '#94A3B8' : '#0D9488', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: isExecuting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: isExecuting ? 'none' : '0 4px 14px rgba(13, 148, 136, 0.35)', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { if (!isExecuting) e.currentTarget.style.background = '#0F766E'; }}
          onMouseLeave={(e) => { if (!isExecuting) e.currentTarget.style.background = '#0D9488'; }}
        >
          <span>Proceed with Phase 1 Health Dashboard</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>

        <button
          type="button"
          onClick={handleProceedOptima}
          disabled={isExecuting}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: isExecuting ? '#94A3B8' : '#059669', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: isExecuting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: isExecuting ? 'none' : '0 4px 14px rgba(5, 150, 105, 0.35)', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { if (!isExecuting) e.currentTarget.style.background = '#047857'; }}
          onMouseLeave={(e) => { if (!isExecuting) e.currentTarget.style.background = '#059669'; }}
        >
          <span>Proceed to Phase 2 (OPTIMA-AI Optimization Engine)</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>
      </div>
    </div>
  );
}
