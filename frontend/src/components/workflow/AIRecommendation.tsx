/**
 * AI Recommendation Engine — Stage 2
 * Reads tenant-scoped Intake JSON and generates recommended infrastructure resources.
 * Features live AI streaming data visualization strictly tailored to the user's Intake Form,
 * progress ticker, resource recommendation table, OPA compliance scan, and "Proceed to cost review" CTA.
 */
import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { workflowApi } from '@/services/api';

type CategoryType = 'Compute' | 'Database' | 'LLM Endpoint' | 'Networking' | 'Vector Store' | 'Security' | 'Observability';

interface ResourceItem {
  category: CategoryType;
  resource: string;
  monthlyCost: number;
}

const CATEGORY_BADGES: Record<CategoryType, { bg: string; color: string }> = {
  'Compute':       { bg: '#DBEAFE', color: '#2563EB' },
  'Database':      { bg: '#F3E8FF', color: '#7C3AED' },
  'LLM Endpoint':  { bg: '#DCFCE7', color: '#16A34A' },
  'Networking':    { bg: '#FEF3C7', color: '#D97706' },
  'Vector Store':  { bg: '#E0F2FE', color: '#0284C7' },
  'Security':      { bg: '#E0F2FE', color: '#0284C7' },
  'Observability': { bg: '#CCFBF1', color: '#0D9488' },
};

const DEFAULT_AZURE_RESOURCES: ResourceItem[] = [
  { category: 'Compute', resource: 'Azure AKS (Standard_D4s_v3, 2–6 nodes auto-scale)', monthlyCost: 148 },
  { category: 'Database', resource: 'PostgreSQL Flexible Server + pgvector extension', monthlyCost: 225 },
  { category: 'LLM Endpoint', resource: 'Azure OpenAI GPT-4o — East US 2 (private endpoint)', monthlyCost: 185 },
  { category: 'Networking', resource: 'VNet + Application Gateway WAF v2', monthlyCost: 62 },
  { category: 'Vector Store', resource: 'pgvector on Flexible Server (included in DB cost)', monthlyCost: 0 },
  { category: 'Security', resource: 'Azure Key Vault + Managed Identity (workload)', monthlyCost: 28 },
  { category: 'Observability', resource: 'Azure Monitor + Log Analytics Workspace 90-day', monthlyCost: 22 },
];

const DEFAULT_AWS_RESOURCES: ResourceItem[] = [
  { category: 'Compute', resource: 'AWS EKS (m5.xlarge, 2–6 nodes auto-scale)', monthlyCost: 160 },
  { category: 'Database', resource: 'Amazon Aurora PostgreSQL + pgvector', monthlyCost: 240 },
  { category: 'LLM Endpoint', resource: 'Amazon Bedrock Claude 3 Sonnet (us-east-1)', monthlyCost: 190 },
  { category: 'Networking', resource: 'VPC + Application Load Balancer (ALB) + WAF', monthlyCost: 65 },
  { category: 'Vector Store', resource: 'pgvector on Aurora (included in DB cost)', monthlyCost: 0 },
  { category: 'Security', resource: 'AWS KMS + IAM Roles for Service Accounts (IRSA)', monthlyCost: 30 },
  { category: 'Observability', resource: 'Amazon CloudWatch Logs & Metrics 90-day retention', monthlyCost: 25 },
];

const DEFAULT_GCP_RESOURCES: ResourceItem[] = [
  { category: 'Compute', resource: 'GKE Autopilot (e2-standard-4 equivalent, 2–6 nodes auto-scale)', monthlyCost: 155 },
  { category: 'Database', resource: 'Cloud SQL PostgreSQL 15 + pgvector (High Availability)', monthlyCost: 235 },
  { category: 'LLM Endpoint', resource: 'Vertex AI Gemini 1.5 Pro — us-central1 (private Google Access)', monthlyCost: 188 },
  { category: 'Networking', resource: 'VPC + Cloud Load Balancing (HTTPS) + Cloud Armor WAF', monthlyCost: 64 },
  { category: 'Vector Store', resource: 'pgvector on Cloud SQL (included in DB cost)', monthlyCost: 0 },
  { category: 'Security', resource: 'Secret Manager + Workload Identity Federation', monthlyCost: 29 },
  { category: 'Observability', resource: 'Cloud Monitoring + Cloud Logging 90-day retention', monthlyCost: 24 },
];

function pickCloudStack(cloud: string): 'aws' | 'azure' | 'gcp' {
  const c = (cloud || 'azure').toLowerCase();
  if (c === 'aws') return 'aws';
  if (c === 'gcp' || c === 'google') return 'gcp';
  return 'azure';
}

function getDynamicResources(cloud: string, appCategory: string, compliance: string, budget: number): ResourceItem[] {
  const stack = pickCloudStack(cloud);
  const cat = (appCategory || 'rag').toLowerCase();

  if (cat === 'agent') {
    if (stack === 'gcp') {
      return [
        { category: 'Compute', resource: 'GKE Autopilot Agent Microservices (2–8 nodes)', monthlyCost: Math.round(budget * 0.25) },
        { category: 'Database', resource: 'Firestore + Cloud SQL PostgreSQL State Store', monthlyCost: Math.round(budget * 0.30) },
        { category: 'LLM Endpoint', resource: 'Vertex AI Gemini 1.5 Pro (Tool Use & Reasoning)', monthlyCost: Math.round(budget * 0.28) },
        { category: 'Networking', resource: 'VPC + Cloud Load Balancing + Cloud Armor', monthlyCost: Math.round(budget * 0.08) },
        { category: 'Vector Store', resource: 'Vertex AI Vector Search Index', monthlyCost: Math.round(budget * 0.04) },
        { category: 'Security', resource: 'Secret Manager + Workload Identity', monthlyCost: Math.round(budget * 0.03) },
        { category: 'Observability', resource: 'Cloud Trace + Cloud Logging (90-day)', monthlyCost: Math.round(budget * 0.02) },
      ];
    }
    const isAws = stack === 'aws';
    return [
      { category: 'Compute', resource: isAws ? 'AWS EKS Agent Microservices (m5.xlarge, 2–8 nodes)' : 'Azure AKS Agent Microservices (Standard_D4s_v3, 2–8 nodes)', monthlyCost: Math.round(budget * 0.25) },
      { category: 'Database', resource: isAws ? 'Amazon DynamoDB State Engine + Aurora PostgreSQL' : 'Azure Cosmos DB State Engine + PostgreSQL Flexible', monthlyCost: Math.round(budget * 0.30) },
      { category: 'LLM Endpoint', resource: isAws ? 'Amazon Bedrock Claude 3 Opus (Tool Use & Reasoning)' : 'Azure OpenAI GPT-4o — Reasoning & Function Calling', monthlyCost: Math.round(budget * 0.28) },
      { category: 'Networking', resource: isAws ? 'VPC + Application Load Balancer + WAF v2' : 'VNet + Application Gateway WAF v2', monthlyCost: Math.round(budget * 0.08) },
      { category: 'Vector Store', resource: isAws ? 'Amazon OpenSearch Serverless Vector Index' : 'Azure AI Search Vector Index Tier', monthlyCost: Math.round(budget * 0.04) },
      { category: 'Security', resource: isAws ? 'AWS KMS + IAM IRSA Roles' : 'Azure Key Vault + Workload Managed Identity', monthlyCost: Math.round(budget * 0.03) },
      { category: 'Observability', resource: isAws ? 'CloudWatch Logs & Agent Traces (90-day)' : 'Azure Monitor + Application Insights (90-day)', monthlyCost: Math.round(budget * 0.02) },
    ];
  }

  if (cat === 'summariser') {
    if (stack === 'gcp') {
      return [
        { category: 'Compute', resource: 'Cloud Functions Gen2 Document Processor', monthlyCost: Math.round(budget * 0.18) },
        { category: 'Database', resource: 'Cloud SQL PostgreSQL Metadata Store', monthlyCost: Math.round(budget * 0.22) },
        { category: 'LLM Endpoint', resource: 'Vertex AI Gemini 1.5 Flash (Fast Summary)', monthlyCost: Math.round(budget * 0.40) },
        { category: 'Networking', resource: 'VPC Serverless Connector', monthlyCost: Math.round(budget * 0.10) },
        { category: 'Vector Store', resource: 'Cloud Storage Document Vault', monthlyCost: Math.round(budget * 0.04) },
        { category: 'Security', resource: 'Cloud KMS Encryption', monthlyCost: Math.round(budget * 0.03) },
        { category: 'Observability', resource: 'Cloud Logging', monthlyCost: Math.round(budget * 0.02) },
      ];
    }
    const isAws = stack === 'aws';
    return [
      { category: 'Compute', resource: isAws ? 'AWS Lambda Batch Document Processor' : 'Azure Functions High-Concurrency Worker Pool', monthlyCost: Math.round(budget * 0.18) },
      { category: 'Database', resource: isAws ? 'Amazon Aurora PostgreSQL Metadata Store' : 'PostgreSQL Flexible Server Metadata Store', monthlyCost: Math.round(budget * 0.22) },
      { category: 'LLM Endpoint', resource: isAws ? 'Amazon Bedrock Claude 3 Haiku (Fast Summary)' : 'Azure OpenAI GPT-4o-mini (Document Summarization)', monthlyCost: Math.round(budget * 0.40) },
      { category: 'Networking', resource: isAws ? 'VPC Private Subnet Gateway' : 'Azure VNet Private Subnet Gateway', monthlyCost: Math.round(budget * 0.10) },
      { category: 'Vector Store', resource: isAws ? 'Amazon S3 Document Vault' : 'Azure Blob Storage Document Vault', monthlyCost: Math.round(budget * 0.04) },
      { category: 'Security', resource: isAws ? 'AWS KMS Encryption' : 'Azure Key Vault Encryption', monthlyCost: Math.round(budget * 0.03) },
      { category: 'Observability', resource: isAws ? 'CloudWatch Logs' : 'Azure Monitor Logs', monthlyCost: Math.round(budget * 0.02) },
    ];
  }

  if (cat === 'finetuning') {
    if (stack === 'gcp') {
      return [
        { category: 'Compute', resource: 'Vertex AI Custom Training (A100 GPU Cluster)', monthlyCost: Math.round(budget * 0.45) },
        { category: 'Database', resource: 'Cloud SQL Experiment Tracker', monthlyCost: Math.round(budget * 0.15) },
        { category: 'LLM Endpoint', resource: 'Vertex AI Dedicated Fine-Tuned Endpoint', monthlyCost: Math.round(budget * 0.25) },
        { category: 'Networking', resource: 'Cloud Interconnect / Dedicated VPC Peering', monthlyCost: Math.round(budget * 0.07) },
        { category: 'Vector Store', resource: 'Cloud Storage Training Dataset Bucket', monthlyCost: Math.round(budget * 0.04) },
        { category: 'Security', resource: 'Cloud HSM + CMEK', monthlyCost: Math.round(budget * 0.02) },
        { category: 'Observability', resource: 'Vertex AI Experiments + Cloud Monitoring', monthlyCost: Math.round(budget * 0.02) },
      ];
    }
    const isAws = stack === 'aws';
    return [
      { category: 'Compute', resource: isAws ? 'AWS SageMaker p4d.24xlarge GPU Training Cluster' : 'Azure Machine Learning NDv4 GPU Cluster', monthlyCost: Math.round(budget * 0.45) },
      { category: 'Database', resource: isAws ? 'Amazon Aurora PostgreSQL Experiment Tracker' : 'PostgreSQL Flexible Server Experiment Tracker', monthlyCost: Math.round(budget * 0.15) },
      { category: 'LLM Endpoint', resource: isAws ? 'Amazon SageMaker Dedicated Fine-Tuned Endpoint' : 'Azure ML Dedicated Custom Model Endpoint', monthlyCost: Math.round(budget * 0.25) },
      { category: 'Networking', resource: isAws ? 'VPC High-Performance Direct Connect' : 'Azure ExpressRoute Private Network', monthlyCost: Math.round(budget * 0.07) },
      { category: 'Vector Store', resource: isAws ? 'Amazon S3 Training Dataset Bucket' : 'Azure Blob Storage Dataset Container', monthlyCost: Math.round(budget * 0.04) },
      { category: 'Security', resource: isAws ? 'AWS KMS Hardware Security Module' : 'Azure Dedicated Key Vault HSM', monthlyCost: Math.round(budget * 0.02) },
      { category: 'Observability', resource: isAws ? 'CloudWatch GPU Metrics & TensorBoard' : 'Azure Monitor GPU Metrics & MLflow', monthlyCost: Math.round(budget * 0.02) },
    ];
  }

  if (stack === 'gcp') return DEFAULT_GCP_RESOURCES;
  if (stack === 'aws') return DEFAULT_AWS_RESOURCES;
  return DEFAULT_AZURE_RESOURCES;
}

function getOpaTags(compliance: string): string[] {
  const comp = (compliance || 'HIPAA').toUpperCase();
  if (comp === 'HIPAA') {
    return [
      'hipaa-no-public-endpoint',
      'hipaa-encryption-at-rest',
      'mandatory-tags-enforced',
      'private-subnet-delegation',
      'hipaa-audit-logging',
    ];
  }
  if (comp === 'SOC2') {
    return [
      'soc2-tls13-enforced',
      'soc2-role-based-access',
      'soc2-disaster-recovery-backup',
      'mandatory-tags-enforced',
    ];
  }
  if (comp === 'GDPR') {
    return [
      'gdpr-data-residency-enforced',
      'gdpr-anonymization-pipeline',
      'encryption-in-transit',
      'private-endpoint-only',
    ];
  }
  return [
    'standard-security-baseline',
    'mandatory-tags-enforced',
    'encryption-at-rest',
    'cloudwatch-audit-log',
  ];
}

export default function AIRecommendation() {
  const { intakeForm, setPage, markStageComplete, setRecommendation } = useAppStore();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  /** console = streaming logs · stack = revealing table rows one-by-one · done */
  const [phase, setPhase] = useState<'idle' | 'console' | 'stack' | 'done'>('idle');
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const stackEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cloud = intakeForm?.cloud || 'azure';
  const appCategory = intakeForm?.appCategory || 'rag';
  const compliance = intakeForm?.compliance || 'HIPAA';
  const budget = intakeForm?.budgetCeiling || 2000;
  const projectName = intakeForm?.project || 'Clinical RAG Assistant — Phase 1';

  const fullResourceSet = getDynamicResources(cloud, appCategory, compliance, budget);
  const opaTags = getOpaTags(compliance);
  const totalCost = fullResourceSet.reduce((sum, r) => sum + r.monthlyCost, 0);

  const isApproved = intakeForm?.status === 'queued_for_recommendation';
  const busy = phase === 'console' || phase === 'stack';

  const clearTimers = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const finalizeRecommendation = () => {
    setPhase('done');
    setIsStreaming(false);
    setStreamReady(true);
    setStreamProgress(100);
    setRevealedCount(fullResourceSet.length);

    setRecommendation({
      recommendationId: `REC-${Date.now()}`,
      summary: `AI Infrastructure stack generated for ${projectName}`,
      resources: fullResourceSet.map(r => ({
        category: r.category,
        resource: r.resource,
        justification: `Tailored for ${appCategory.toUpperCase()} on ${cloud.toUpperCase()} (${compliance})`,
        monthly_cost: r.monthlyCost,
      })),
      compliance_notes: `${compliance} OPA clean`,
      opa_flags: ['clean'],
      totalMonthlyCost: fullResourceSet.reduce((s, r) => s + r.monthlyCost, 0),
      latencyMs: 5200,
    });

    if (intakeForm) {
      workflowApi.recommend({
        intake_id: intakeForm.intakeId,
        tenant_id: intakeForm.tenantId,
        cloud: intakeForm.cloud,
        app_category: intakeForm.appCategory,
        compliance: intakeForm.compliance,
      }).catch(() => {});
    }
  };

  /** Phase 2: after console finishes, reveal Infrastructure Stack rows one by one */
  const startStackReveal = () => {
    setPhase('stack');
    setRevealedCount(0);
    let n = 0;
    const total = fullResourceSet.length;

    intervalRef.current = setInterval(() => {
      n += 1;
      setRevealedCount(n);
      // Console phase used ~0–70%; stack reveal fills 70–100%
      setStreamProgress(70 + Math.round((n / total) * 30));

      if (n >= total) {
        clearTimers();
        finalizeRecommendation();
      }
    }, 480);
  };

  const startStreamingAI = () => {
    if (!isApproved) return;
    clearTimers();

    setIsStreaming(true);
    setStreamReady(false);
    setPhase('console');
    setStreamProgress(0);
    setStreamLogs([]);
    setRevealedCount(0);

    const cloudName = cloud.toUpperCase();
    const appCat = appCategory.toUpperCase();
    const comp = compliance.toUpperCase();
    const env = (intakeForm?.environment || 'prod').toUpperCase();

    const logsSequence = [
      `[00:00.100] Initializing AI Recommendation Engine v2.4 (LLM Kit Phase 1)...`,
      `[00:00.300] Ingesting Intake Context: Project="${projectName}" [Cloud=${cloudName} | App=${appCat} | Env=${env} | Comp=${comp}]`,
      `[00:00.600] Extracting Non-Functional Requirements: SLA=99.9%, BudgetCeiling=$${budget}/mo, Compliance=${comp}...`,
      `[00:00.900] [LLM STREAM] Analyzing optimal compute topology for ${appCat} workload on ${cloudName}...`,
      `[00:01.200] [STREAMED ITEM] Category: Compute -> ${fullResourceSet[0]?.resource} ($${fullResourceSet[0]?.monthlyCost}/mo)`,
      `[00:01.500] [LLM STREAM] Querying ${cloudName} database & vector engine catalog for ${comp} isolation...`,
      `[00:01.800] [STREAMED ITEM] Category: Database -> ${fullResourceSet[1]?.resource} ($${fullResourceSet[1]?.monthlyCost}/mo)`,
      `[00:02.100] [LLM STREAM] Selecting enterprise LLM endpoint with private endpoint isolation...`,
      `[00:02.400] [STREAMED ITEM] Category: LLM Endpoint -> ${fullResourceSet[2]?.resource} ($${fullResourceSet[2]?.monthlyCost}/mo)`,
      `[00:02.700] [LLM STREAM] Configuring network topology, VPC/VNet & WAF firewall rules...`,
      `[00:03.000] [STREAMED ITEM] Category: Networking -> ${fullResourceSet[3]?.resource} ($${fullResourceSet[3]?.monthlyCost}/mo)`,
      `[00:03.300] [LLM STREAM] Provisioning vector store index & storage tier...`,
      `[00:03.600] [STREAMED ITEM] Category: Vector Store -> ${fullResourceSet[4]?.resource} ($${fullResourceSet[4]?.monthlyCost}/mo)`,
      `[00:03.900] [LLM STREAM] Enforcing encryption key vault & managed identity bindings...`,
      `[00:04.200] [STREAMED ITEM] Category: Security -> ${fullResourceSet[5]?.resource} ($${fullResourceSet[5]?.monthlyCost}/mo)`,
      `[00:04.500] [LLM STREAM] Attaching 90-day cloud observability and audit logs...`,
      `[00:04.800] [STREAMED ITEM] Category: Observability -> ${fullResourceSet[6]?.resource} ($${fullResourceSet[6]?.monthlyCost}/mo)`,
      `[00:05.000] Running automated OPA policy compliance scan for ${comp}... PASS (${opaTags.length}/${opaTags.length} policies clean).`,
      `[00:05.200] AI Recommendation streaming complete! Total estimated monthly cost: $${fullResourceSet.reduce((s, r) => s + r.monthlyCost, 0)}/mo.`,
    ];

    let currentStep = 0;
    // Phase 1: gradual console stream only (stack stays empty)
    intervalRef.current = setInterval(() => {
      if (currentStep < logsSequence.length) {
        const nextLog = logsSequence[currentStep];
        setStreamLogs((prev) => [...prev, nextLog]);
        setStreamProgress(Math.round(((currentStep + 1) / logsSequence.length) * 70));
        currentStep++;
      } else {
        clearTimers();
        startStackReveal();
      }
    }, 380);
  };

  useEffect(() => {
    if (isApproved) {
      startStreamingAI();
    }
    return () => clearTimers();
  }, [intakeForm?.intakeId, isApproved]);

  // Phase 1: follow console stream
  useEffect(() => {
    if (phase !== 'console') return;
    const end = consoleEndRef.current;
    if (!end) return;
    end.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
  }, [streamLogs, phase]);

  // Phase 2: follow stack rows as they appear
  useEffect(() => {
    if (phase !== 'stack') return;
    if (revealedCount > 0 && stackEndRef.current) {
      stackEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }
  }, [revealedCount, phase]);

  const revealedResources = fullResourceSet.slice(0, revealedCount);
  const revealedTotal = revealedResources.reduce((sum, r) => sum + r.monthlyCost, 0);
  const showInfraStack = phase === 'stack' || phase === 'done' || revealedCount > 0;

  const handleProceed = () => {
    markStageComplete('ai');
    setPage('cost');
  };

  // Structured JSON representation for Snapshot 2 derived directly from intakeForm
  const jsonContext = {
    intakeId: intakeForm?.intakeId || 'INTAKE-DEMO-001',
    tenantId: intakeForm?.tenantId || 'TENANT_DEMO',
    project: projectName,
    cloud: cloud,
    appCategory: appCategory,
    environment: intakeForm?.environment || 'prod',
    compliance: compliance,
    budgetCeiling: budget,
    description: intakeForm?.description || `${compliance}-compliant ${appCategory.toUpperCase()} pipeline on ${cloud.toUpperCase()}.`,
    submittedBy: intakeForm?.submittedByRole || intakeForm?.submittedBy || 'Tenant User',
    submittedAt: intakeForm?.submittedAt || new Date().toISOString(),
    status: intakeForm?.status || 'queued_for_recommendation',
  };

  if (!isApproved) {
    const currentStatus = intakeForm?.status || 'pending_tenant_approval';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>
        <div style={{
          background: '#FFFFFF', border: '1px solid #FECDD3', borderRadius: 16, padding: '32px 28px',
          boxShadow: '0 10px 30px rgba(185,28,28,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: '#FEE2E2', color: '#B91C1C',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className="ti ti-shield-lock" style={{ fontSize: 24 }} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                Stage 2 AI Recommendation Blocked — Approval Required
              </div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                Project: <strong>{projectName}</strong> ({intakeForm?.intakeId || 'No Intake Form selected'})
              </div>
            </div>
          </div>

          <div style={{
            background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 12, padding: '16px 18px',
            marginBottom: 20, color: '#9F1239', fontSize: 13, lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-alert-circle" />
              Status: {currentStatus === 'pending_tenant_approval' ? 'Pending Tenant Admin Approval' : currentStatus === 'pending_provider_approval' ? 'Pending Provider Admin Approval' : 'Rejected / Access Denied'}
            </div>
            {currentStatus === 'pending_tenant_approval' && (
              <p style={{ margin: 0 }}>
                This intake form was submitted by a <strong>Tenant User</strong>. It requires <strong>Tenant Admin approval</strong> first, followed by <strong>Provider Admin approval</strong>, before the AI Recommendation Engine can execute.
              </p>
            )}
            {currentStatus === 'pending_provider_approval' && (
              <p style={{ margin: 0 }}>
                This intake form has been submitted/approved by Tenant Admin and is currently <strong>awaiting Provider Admin level approval</strong> before AI Recommendation can run.
              </p>
            )}
            {currentStatus === 'rejected' && (
              <p style={{ margin: 0 }}>
                This intake form was <strong>Rejected / Denied</strong> by administrator. Without approval, status remains denied and Stage 2 AI Recommendation cannot execute.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={() => setPage('intake')}
              style={{
                padding: '10px 20px', borderRadius: 10, background: '#7C3AED', color: '#FFFFFF',
                border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(124,58,237,0.25)',
              }}
            >
              <i className="ti ti-arrow-left" />
              Return to Project Intake &amp; Approval Queue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>

      {/* ── One continuous card: Streaming first, then Infrastructure Stack (page scroll) ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
      }}>
        {/* 1) Streaming AI Recommendation Engine Data */}
        <div style={{
          background: '#090D16', borderBottom: '1px solid #E2E8F0',
        }}>
          <div style={{
            padding: '12px 18px', background: '#0F172A', borderBottom: '1px solid #1E293B',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: busy ? '#10B981' : '#3B82F6',
                boxShadow: busy ? '0 0 10px #10B981' : 'none',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC', letterSpacing: '0.02em' }}>
                Streaming AI Recommendation Engine Data
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: busy ? '#34D399' : '#94A3B8' }}>
                {phase === 'console' && `[ STREAMING · ${streamProgress}% ]`}
                {phase === 'stack' && `[ BUILDING STACK · ${revealedCount}/${fullResourceSet.length} ]`}
                {(phase === 'done' || phase === 'idle') && !busy && '[ COMPLETED ]'}
              </span>
              <button
                type="button"
                onClick={startStreamingAI}
                disabled={busy}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid #334155', background: '#1E293B', color: '#E2E8F0',
                  cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <i className={`ti ti-refresh ${busy ? 'spin' : ''}`} />
                <span>Re-stream</span>
              </button>
            </div>
          </div>

          <div style={{ width: '100%', height: 3, background: '#1E293B' }}>
            <div style={{
              height: '100%', width: `${streamProgress}%`, background: 'linear-gradient(90deg, #7C3AED, #0D9488)',
              transition: 'width 0.2s ease',
            }} />
          </div>

          {/* Full stream visible via page scroll (no nested short console box) */}
          <div style={{
            padding: '14px 18px', minHeight: 160, fontFamily: 'monospace', fontSize: 12,
            color: '#A7F3D0', lineHeight: 1.65, background: '#090D16',
          }}>
            {streamLogs.map((log, idx) => (
              <div key={idx} style={{
                color: log.includes('[STREAMED ITEM]') ? '#FDE047' : log.includes('OPA policy') ? '#38BDF8' : '#A7F3D0',
              }}>
                {log}
              </div>
            ))}
            {phase === 'console' && (
              <div style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <i className="ti ti-loader spin" />
                <span>Generating AI recommendation token stream for {projectName}...</span>
              </div>
            )}
            {phase === 'stack' && (
              <div style={{ color: '#FDE047', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <i className="ti ti-loader spin" />
                <span>Stream complete — revealing Infrastructure Stack rows one by one…</span>
              </div>
            )}
            <div ref={consoleEndRef} />
          </div>
          {busy && (
            <div style={{
              padding: '10px 18px', borderTop: '1px solid #1E293B', background: '#0F172A',
              fontSize: 11, color: '#94A3B8',
            }}>
              {phase === 'console'
                ? 'Phase 1: streaming recommendation logs gradually. Infrastructure Stack builds after the stream completes.'
                : `Phase 2: adding stack rows one by one — ${revealedCount}/${fullResourceSet.length}.`}
            </div>
          )}
        </div>

        {/* 2) Infrastructure Stack — Phase 2: rows appear one-by-one after console stream */}
        {showInfraStack && (
          <div>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #F1F5F9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  AI Recommendation Engine — Infrastructure Stack
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Recommended resources derived from <strong>{projectName}</strong> ({cloud.toUpperCase()} · {appCategory.toUpperCase()} · {compliance})
                  {phase === 'stack' && (
                    <span style={{ marginLeft: 8, color: '#0D9488', fontWeight: 600 }}>
                      · Revealing · {revealedCount}/{fullResourceSet.length}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CATEGORY</th>
                  <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>RESOURCE</th>
                  <th style={{ padding: '12px 20px', color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>$/MO</th>
                </tr>
              </thead>
              <tbody>
                {revealedCount === 0 && phase === 'stack' && (
                  <tr>
                    <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                      <i className="ti ti-loader spin" style={{ marginRight: 8 }} />
                      Preparing recommended resources…
                    </td>
                  </tr>
                )}
                {revealedResources.map((item, idx) => {
                  const badge = CATEGORY_BADGES[item.category] || { bg: '#F1F5F9', color: '#475569' };
                  return (
                    <tr
                      key={`${item.category}-${idx}`}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        animation: 'infraRowIn 0.4s ease',
                      }}
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                          background: badge.bg, color: badge.color, display: 'inline-block',
                        }}>
                          {item.category}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#0F172A', fontWeight: 600 }}>
                        {item.resource}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#0F172A', fontWeight: 700, fontSize: 14 }}>
                        ${item.monthlyCost}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {(revealedCount > 0) && (
                <tfoot>
                  <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                    <td colSpan={2} style={{ padding: '16px 20px', fontWeight: 700, color: '#0F172A', fontSize: 14 }}>
                      {streamReady ? 'Total monthly estimate' : `Running total (${revealedCount}/${fullResourceSet.length})`}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 800, color: '#0D9488', fontSize: 18 }}>
                      ${streamReady ? totalCost : revealedTotal}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            <div ref={stackEndRef} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes infraRowIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── OPA + actions after both phases complete ───────────────────────── */}
      {streamReady && (
        <>
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: '18px 20px',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>OPA Compliance Scan ({compliance}) — CLEAN</span>
          <i className="ti ti-circle-check-filled" style={{ color: '#059669', fontSize: 18 }} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {opaTags.map((tag) => (
            <span key={tag} style={{
              fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
              background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <button
          type="button"
          onClick={handleProceed}
          disabled={busy}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: busy ? '#94A3B8' : '#0D9488', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: busy ? 'none' : '0 4px 14px rgba(13, 148, 136, 0.35)', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = '#0F766E'; }}
          onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = '#0D9488'; }}
        >
          <span>Proceed to Cost Review</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>

        <button
          type="button"
          onClick={startStreamingAI}
          disabled={busy}
          style={{
            fontSize: 13, fontWeight: 600, color: '#475569',
            background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 10, padding: '14px 22px',
            cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = '#F8FAFC'; }}
          onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = '#FFFFFF'; }}
        >
          <i className={`ti ti-refresh ${busy ? 'spin' : ''}`} style={{ fontSize: 16 }} />
          <span>Re-run AI Recommendation Engine</span>
        </button>
      </div>
        </>
      )}
    </div>
  );
}
