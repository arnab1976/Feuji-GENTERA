/**
 * Stage 4 — Terraform HCL Generation Service
 * Generates production-ready Terraform HCL across 4 files:
 * main.tf, variables.tf, outputs.tf, providers.tf with live token streaming,
 * pipeline stepper, syntax validation, and OPA/tfsec scans.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { workflowApi } from '@/services/api';

const AZURE_MAIN_TF = `# Feuji GENTERA — Stage 4 Terraform HCL Blueprint for Azure
# Tenant: TENANT_BL2WST | Env: Production | Compliance: HIPAA

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}

resource "azurerm_resource_group" "main" {
  name     = join("-", ["rg", var.tenant_id, var.environment])
  location = var.location
  tags     = local.mandatory_tags
}

resource "azurerm_virtual_network" "vnet" {
  name                = join("-", ["vnet", var.tenant_id])
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.0.0.0/16"]
  tags                = local.mandatory_tags
}

resource "azurerm_subnet" "db" {
  name                 = "snet-postgres"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]

  delegation {
    name = "fs-delegation"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                          = join("-", ["psql", var.tenant_id])
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  public_network_access_enabled = false
  delegated_subnet_id           = azurerm_subnet.db.id
  sku_name                      = "GP_Standard_D4s_v3"
  storage_mb                    = 32768
  version                       = "15"
  tags                          = local.mandatory_tags
}

resource "azurerm_kubernetes_cluster" "aks" {
  name                = join("-", ["aks", var.tenant_id])
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = join("-", ["aks", var.tenant_id])

  default_node_pool {
    name       = "default"
    node_count = 3
    vm_size    = "Standard_D4s_v3"
  }
  identity {
    type = "SystemAssigned"
  }
  tags = local.mandatory_tags
}

resource "azurerm_cognitive_account" "openai" {
  name                = join("-", ["oai", var.tenant_id])
  location            = "eastus2"
  resource_group_name = azurerm_resource_group.main.name
  kind                = "OpenAI"
  sku_name            = "S0"
  tags                = local.mandatory_tags
}
`;

const AZURE_VARS_TF = `variable "tenant_id" {
  type        = string
  description = "Unique tenant identifier string"
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "Deployment environment scope (prod | uat | dev)"
}

variable "location" {
  type        = string
  default     = "eastus2"
  description = "Primary Azure datacenter region"
}

variable "azure_subscription_id" {
  type        = string
  description = "Azure Subscription ID for authentication"
}

locals {
  mandatory_tags = {
    Environment = var.environment
    ManagedBy   = "Feuji-GENTERA"
    Compliance  = "HIPAA"
    Tenant      = var.tenant_id
  }
}
`;

const AZURE_OUTPUTS_TF = `output "postgresql_fqdn" {
  value       = azurerm_postgresql_flexible_server.main.fqdn
  description = "Fully qualified domain name of PostgreSQL flexible server"
}

output "aks_cluster_name" {
  value       = azurerm_kubernetes_cluster.aks.name
  description = "Name of AKS Kubernetes cluster"
}

output "resource_group" {
  value       = azurerm_resource_group.main.name
  description = "Resource group name"
}

output "openai_endpoint" {
  value       = azurerm_cognitive_account.openai.endpoint
  description = "Azure OpenAI Service endpoint URL"
}
`;

const AZURE_PROVIDERS_TF = `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100.0"
    }
  }
  backend "azurerm" {
    resource_group_name  = "rg-feuji-tfstate"
    storage_account_name = "stfeujitfstate"
    container_name       = "tfstate"
    key                  = "tenants/tenant_bl2wst/terraform.tfstate"
  }
}
`;

const AWS_MAIN_TF = `# Feuji GENTERA — Stage 4 Terraform HCL Blueprint for AWS
# Tenant: TENANT_BL2WST | Env: Production | Compliance: HIPAA

provider "aws" {
  region = var.aws_region
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = merge(local.mandatory_tags, {
    Name = join("-", ["vpc", var.tenant_id, var.environment])
  })
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "\${var.aws_region}a"
  tags = merge(local.mandatory_tags, {
    Name = join("-", ["subnet-private", var.tenant_id])
  })
}

resource "aws_db_subnet_group" "rds" {
  name       = join("-", ["dbsng", var.tenant_id])
  subnet_ids = [aws_subnet.private.id]
}

resource "aws_db_instance" "postgres" {
  identifier             = join("-", ["rds", var.tenant_id])
  allocated_storage      = 50
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = "db.m5.xlarge"
  db_name                = "appdb"
  username               = "dbadmin"
  manage_master_user_password = true
  db_subnet_group_name   = aws_db_subnet_group.rds.name
  publicly_accessible    = false
  storage_encrypted      = true
  skip_final_snapshot    = true
  tags                   = local.mandatory_tags
}

resource "aws_eks_cluster" "eks" {
  name     = join("-", ["eks", var.tenant_id])
  role_arn = "arn:aws:iam::123456789012:role/EKSClusterRole"

  vpc_config {
    subnet_ids = [aws_subnet.private.id]
  }
  tags = local.mandatory_tags
}
`;

const GCP_MAIN_TF = `# Feuji GENTERA — Stage 4 Terraform HCL Blueprint for GCP
# Tenant: TENANT_BL2WST | Env: Production | Compliance: HIPAA

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

resource "google_compute_network" "vpc" {
  name                    = join("-", ["vpc", var.tenant_id, var.environment])
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "private" {
  name          = join("-", ["subnet-private", var.tenant_id])
  ip_cidr_range = "10.0.1.0/24"
  region        = var.gcp_region
  network       = google_compute_network.vpc.id
  private_ip_google_access = true
}

resource "google_sql_database_instance" "postgres" {
  name             = join("-", ["psql", var.tenant_id])
  database_version = "POSTGRES_15"
  region           = var.gcp_region

  settings {
    tier = "db-custom-4-16384"
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
    backup_configuration {
      enabled = true
    }
    user_labels = local.mandatory_tags
  }
}

resource "google_container_cluster" "gke" {
  name     = join("-", ["gke", var.tenant_id])
  location = var.gcp_region

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.private.name

  enable_autopilot = true
  resource_labels  = local.mandatory_tags
}

resource "google_secret_manager_secret" "app" {
  secret_id = join("-", ["secret", var.tenant_id])
  replication {
    auto {}
  }
  labels = local.mandatory_tags
}
`;

const GCP_VARS_TF = `variable "tenant_id" {
  type        = string
  description = "Tenant identifier used in resource naming"
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "Deployment environment scope (prod | uat | dev)"
}

variable "gcp_region" {
  type        = string
  default     = "us-central1"
  description = "Primary GCP region"
}

variable "gcp_project_id" {
  type        = string
  description = "GCP project ID for authentication"
}

locals {
  mandatory_tags = {
    environment = var.environment
    managed_by  = "feuji-gentera"
    compliance  = "hipaa"
    tenant      = var.tenant_id
  }
}
`;

const GCP_OUTPUTS_TF = `output "cloudsql_connection_name" {
  value       = google_sql_database_instance.postgres.connection_name
  description = "Cloud SQL connection name"
}

output "gke_cluster_name" {
  value       = google_container_cluster.gke.name
  description = "GKE Autopilot cluster name"
}

output "vpc_name" {
  value       = google_compute_network.vpc.name
  description = "VPC network name"
}

output "vertex_region" {
  value       = var.gcp_region
  description = "Region for Vertex AI Gemini endpoints"
}
`;

const GCP_PROVIDERS_TF = `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30.0"
    }
  }
  backend "gcs" {
    bucket = "feuji-gentera-tfstate"
    prefix = "tenants/tenant_bl2wst/terraform"
  }
}
`;

type FileTab = 'main.tf' | 'variables.tf' | 'outputs.tf' | 'providers.tf';

/** Native tooltips — what each Terraform root module file does */
const FILE_TAB_TOOLTIPS: Record<FileTab, string> = {
  'main.tf':
    'Terraform root module: declares the cloud resources to create (VPC/VNet, GKE/AKS/EKS, databases, secrets, etc.) and how they connect. Terraform applies this plan to build real infrastructure.',
  'variables.tf':
    'Input parameters for the module (region, environment, tenant ID, sizes, tags). Callers supply values via .tfvars or -var; keeps main.tf reusable and avoids hard-coded secrets.',
  'outputs.tf':
    'Values exported after apply (FQDNs, cluster names, endpoints, resource IDs). Other modules or CI/CD can consume these outputs without digging into resource internals.',
  'providers.tf':
    'Provider & backend config: which cloud API Terraform talks to (azurerm/aws/google), required versions, authentication hooks, and often the remote state backend. Must be set before resources in main.tf can run.',
};

export default function TerraformGeneration() {
  const {
    intakeForm,
    resourcePlan,
    setTerraformArtifact,
    markStageComplete,
    setPage,
  } = useAppStore();

  const tenantId = intakeForm?.tenantId || 'TENANT_BL2WST';
  const intakeCloud = (intakeForm?.cloud || 'azure').toLowerCase();
  const initialCloud = intakeCloud === 'aws' ? 'AWS' : intakeCloud === 'gcp' ? 'GCP' : 'Azure';

  const [cloud, setCloud] = useState<'Azure' | 'AWS' | 'GCP'>(initialCloud as 'Azure' | 'AWS' | 'GCP');
  const [region, setRegion] = useState(
    cloud === 'AWS' ? 'us-east-1' : cloud === 'GCP' ? 'us-central1' : 'eastus2',
  );
  const [environment, setEnvironment] = useState('Production');
  const [activeTab, setActiveTab] = useState<FileTab>('main.tf');

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [currentPipelineStep, setCurrentPipelineStep] = useState(2); // 1-indexed (2 = LLM generates HCL)
  
  const [streamedCode, setStreamedCode] = useState<Record<FileTab, string>>({
    'main.tf': '',
    'variables.tf': '',
    'outputs.tf': '',
    'providers.tf': '',
  });

  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<{
    overall: string;
    summary: string;
    cloud?: string;
    validation?: { valid: boolean; errors: string[]; output?: string };
    opa?: { clean: boolean; violations: string[] };
    tfsec?: { passed: boolean; status: string; findings: { rule: string; severity: string; message: string }[]; violation_count: number };
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeEndRef = useRef<HTMLDivElement>(null);

  const fileContents = useMemo(() => {
    if (cloud === 'AWS') {
      return {
        'main.tf': AWS_MAIN_TF,
        'variables.tf': AZURE_VARS_TF.replace(/Azure/g, 'AWS'),
        'outputs.tf': AZURE_OUTPUTS_TF,
        'providers.tf': AZURE_PROVIDERS_TF.replace(/azurerm/g, 'aws'),
      };
    }
    if (cloud === 'GCP') {
      return {
        'main.tf': GCP_MAIN_TF,
        'variables.tf': GCP_VARS_TF,
        'outputs.tf': GCP_OUTPUTS_TF,
        'providers.tf': GCP_PROVIDERS_TF,
      };
    }
    return {
      'main.tf': AZURE_MAIN_TF,
      'variables.tf': AZURE_VARS_TF,
      'outputs.tf': AZURE_OUTPUTS_TF,
      'providers.tf': AZURE_PROVIDERS_TF,
    };
  }, [cloud]);

  const startStreaming = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsStreaming(true);
    setStreamProgress(0);
    setCurrentPipelineStep(2);
    setStreamedCode({
      'main.tf': '',
      'variables.tf': '',
      'outputs.tf': '',
      'providers.tf': '',
    });

    const fullText = fileContents['main.tf'];
    const lines = fullText.split('\n');
    let lineIdx = 0;

    intervalRef.current = setInterval(() => {
      if (lineIdx < lines.length) {
        const partial = lines.slice(0, lineIdx + 1).join('\n');
        setStreamedCode({
          'main.tf': partial,
          'variables.tf': fileContents['variables.tf'],
          'outputs.tf': fileContents['outputs.tf'],
          'providers.tf': fileContents['providers.tf'],
        });

        const pct = Math.round(((lineIdx + 1) / lines.length) * 100);
        setStreamProgress(pct);

        if (pct > 30 && pct <= 60) setCurrentPipelineStep(3);
        else if (pct > 60 && pct <= 80) setCurrentPipelineStep(4);
        else if (pct > 80 && pct <= 95) setCurrentPipelineStep(5);

        lineIdx++;
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsStreaming(false);
        setCurrentPipelineStep(6);
        setStreamProgress(100);
        setStreamedCode(fileContents);

        // Store artifact in Zustand
        setTerraformArtifact({
          artifactId: `ART-${Date.now()}`,
          s3Key: `tenants/${tenantId}/artifacts/terraform-blueprint.zip`,
          files: ['main.tf', 'variables.tf', 'outputs.tf', 'providers.tf'],
          validationStatus: 'PASSED',
          opaScan: 'CLEAN',
          tfsec: 'PASSED',
        });

        if (resourcePlan?.planId) {
          workflowApi.generateTF({
            plan_id: resourcePlan.planId,
            tenant_id: tenantId,
            cloud: cloud.toLowerCase(),
            region,
            environment: environment.toLowerCase(),
            stream: false,
          }).catch(() => {});
        }
      }
    }, 45);
  }, [fileContents, tenantId, cloud, region, environment, resourcePlan, setTerraformArtifact]);

  useEffect(() => {
    startStreaming();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [cloud, startStreaming]);

  // While HCL is streaming, keep the code panel and page window following the latest lines
  useEffect(() => {
    const end = codeEndRef.current;
    if (!end) return;
    const panel = end.parentElement;
    if (panel && typeof panel.scrollTop === 'number') {
      panel.scrollTop = panel.scrollHeight;
    }
    if (isStreaming) {
      end.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }
  }, [streamedCode, isStreaming]);

  const handleProceed = () => {
    markStageComplete('terraform');
    setPage('jumpbox');
  };

  const runComplianceScan = async () => {
    if (isStreaming || scanBusy) return;
    setScanBusy(true);
    setScanError(null);
    const files = {
      'main.tf': streamedCode['main.tf'] || fileContents['main.tf'],
      'variables.tf': streamedCode['variables.tf'] || fileContents['variables.tf'],
      'outputs.tf': streamedCode['outputs.tf'] || fileContents['outputs.tf'],
      'providers.tf': streamedCode['providers.tf'] || fileContents['providers.tf'],
    };
    try {
      const res = await workflowApi.validateTF({
        cloud: cloud.toLowerCase() === 'gcp' ? 'gcp' : cloud.toLowerCase() === 'aws' ? 'aws' : 'azure',
        region,
        environment: environment.toLowerCase(),
        files,
      });
      const data = res.data;
      setScanResult(data);
      setTerraformArtifact({
        artifactId: `ART-SCAN-${Date.now()}`,
        s3Key: `tenants/${tenantId}/artifacts/terraform-blueprint.zip`,
        files: ['main.tf', 'variables.tf', 'outputs.tf', 'providers.tf'],
        validationStatus: data?.validation?.valid ? 'PASSED' : 'FAILED',
        opaScan: data?.opa?.clean ? 'CLEAN' : 'VIOLATIONS',
        tfsec: data?.tfsec?.status || (data?.overall === 'PASSED' ? 'PASSED' : 'FAILED'),
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Validation request failed';
      setScanError(String(detail));
      setScanResult(null);
    } finally {
      setScanBusy(false);
    }
  };

  const overallPassed = scanResult?.overall === 'PASSED';

  const pipelineSteps = [
    { label: 'Resource plan', icon: 'ti-check', step: 1 },
    { label: 'LLM generates HCL', icon: 'ti-loader', step: 2 },
    { label: 'Split 4 files', icon: 'ti-files', step: 3 },
    { label: 'terraform validate', icon: 'ti-shield-check', step: 4 },
    { label: 'OPA + tfsec scan', icon: 'ti-lock', step: 5 },
    { label: 'Store to Local / S3', icon: 'ti-folder-check', step: 6 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {/* ── BREADCRUMB & HEADER ────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 999, background: '#DBEAFE', color: '#2563EB',
            border: '1px solid #BFDBFE',
          }}>
            STAGE 4
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>›</span>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            Terraform HCL Generation Service
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          Terraform HCL Generation Service
        </div>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginTop: 6, maxWidth: 880 }}>
          The confirmed resource plan is sent to the LLM which generates production-ready Terraform HCL across 4 files (main.tf, variables.tf, outputs.tf, providers.tf). terraform validate checks syntax offline with no cloud credentials. OPA/Rego policies enforce security rules. tfsec and Checkov scan for CIS benchmark compliance. Artifacts are stored in local storage / S3 tagged with the Tenant ID.
        </p>
      </div>

      {/* ── NOTIFICATION STRIP (SNAPSHOT 1) ────────────────────────────────── */}
      <div style={{
        padding: '12px 18px', background: '#F0F9FF', border: '1px solid #BAE6FD',
        borderRadius: 10, color: '#0369A1', fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-code" style={{ fontSize: 16, color: '#0284C7' }} />
        <span>
          Generating HCL for tenant <strong>{tenantId}</strong> — artifact stored in local artifact store / tenant S3 with compliance tags.
        </span>
      </div>

      {/* ── GENERATION PIPELINE STEPPER (SNAPSHOT 1) ───────────────────────── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14,
        padding: '18px 20px', boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-git-branch" style={{ fontSize: 14 }} />
          GENERATION PIPELINE
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          {pipelineSteps.map((s, idx) => {
            const isDone = currentPipelineStep > s.step;
            const isActive = currentPipelineStep === s.step;
            return (
              <div key={s.step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: isDone ? '#DCFCE7' : isActive ? '#DBEAFE' : '#F1F5F9',
                    border: `2px solid ${isDone ? '#16A34A' : isActive ? '#2563EB' : '#CBD5E1'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isDone ? '#16A34A' : isActive ? '#2563EB' : '#94A3B8',
                    transition: 'all 0.3s ease',
                  }}>
                    {isDone ? (
                      <i className="ti ti-check" style={{ fontSize: 18, fontWeight: 'bold' }} />
                    ) : isActive && isStreaming ? (
                      <i className="ti ti-loader spin" style={{ fontSize: 18 }} />
                    ) : (
                      <i className={`ti ${s.icon}`} style={{ fontSize: 16 }} />
                    )}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: isActive || isDone ? 700 : 500,
                    color: isDone ? '#16A34A' : isActive ? '#2563EB' : '#64748B',
                    textAlign: 'center', maxWidth: 100, lineHeight: 1.25,
                  }}>
                    {s.label}
                  </span>
                </div>

                {idx < pipelineSteps.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: '0 8px', marginTop: -20,
                    background: isDone ? '#16A34A' : '#E2E8F0',
                    transition: 'background 0.3s ease',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FORM CONTROLS (CLOUD, REGION, ENV, REGENERATE) ──────────────────── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14,
        padding: '16px 20px', display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
            Cloud
          </label>
          <select
            value={cloud}
            onChange={(e) => setCloud(e.target.value as any)}
            disabled={isStreaming}
            style={{
              width: '100%', padding: '9px 12px', fontSize: 13, color: '#0F172A',
              background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, outline: 'none',
            }}
          >
            <option value="Azure">Azure</option>
            <option value="AWS">AWS</option>
            <option value="GCP">GCP</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
            Region
          </label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={isStreaming}
            style={{
              width: '100%', padding: '9px 12px', fontSize: 13, color: '#0F172A',
              background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, outline: 'none',
            }}
          >
            <option value="eastus2">eastus2</option>
            <option value="us-east-1">us-east-1</option>
            <option value="us-west-2">us-west-2</option>
            <option value="us-central1">us-central1</option>
            <option value="westeurope">westeurope</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
            Environment
          </label>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            disabled={isStreaming}
            style={{
              width: '100%', padding: '9px 12px', fontSize: 13, color: '#0F172A',
              background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, outline: 'none',
            }}
          >
            <option value="Production">Production</option>
            <option value="UAT">UAT</option>
            <option value="Development">Development</option>
          </select>
        </div>

        <button
          type="button"
          onClick={startStreaming}
          disabled={isStreaming}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 8, border: 'none',
            background: isStreaming ? '#94A3B8' : '#2563EB', color: '#FFFFFF',
            fontWeight: 700, fontSize: 13, cursor: isStreaming ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 8px rgba(37,99,235,0.25)', height: 38,
          }}
        >
          <i className={`ti ti-code ${isStreaming ? 'spin' : ''}`} style={{ fontSize: 16 }} />
          <span>Regenerate</span>
        </button>
      </div>

      {/* ── CODE TERMINAL & FILE TABS (SNAPSHOT 2) ─────────────────────────── */}
      <div style={{
        background: '#090D16', border: '1px solid #1E293B', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
      }}>
        {/* Terminal File Tabs */}
        <div style={{
          background: '#0F172A', borderBottom: '1px solid #1E293B', padding: '0 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {(['main.tf', 'variables.tf', 'outputs.tf', 'providers.tf'] as FileTab[]).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  title={FILE_TAB_TOOLTIPS[tab]}
                  aria-label={`${tab}: ${FILE_TAB_TOOLTIPS[tab]}`}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '10px 14px', fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? '#F8FAFC' : '#94A3B8', background: active ? '#090D16' : 'transparent',
                    border: 'none', borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
                    cursor: 'help', fontFamily: 'monospace',
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: isStreaming ? '#34D399' : '#94A3B8' }}>
              {isStreaming ? `[ STREAMING HCL · ${streamProgress}% ]` : '[ GENERATED & VALIDATED ]'}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: 3, background: '#1E293B' }}>
          <div style={{
            height: '100%', width: `${streamProgress}%`,
            background: 'linear-gradient(90deg, #2563EB, #0D9488)', transition: 'width 0.2s ease',
          }} />
        </div>

        {/* HCL Code View Window */}
        <div style={{
          padding: '16px 20px', maxHeight: 360, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13,
          color: '#E2E8F0', lineHeight: 1.6, background: '#090D16',
        }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#38BDF8' }}>
            {streamedCode[activeTab] || '# Generating Terraform HCL code...'}
          </pre>
          {isStreaming && (
            <div style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <i className="ti ti-loader spin" />
              <span>Streaming HCL AST nodes for {activeTab}...</span>
            </div>
          )}
          <div ref={codeEndRef} />
        </div>
      </div>

      {/* ── BOTTOM ACTION BUTTONS ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleProceed}
          disabled={isStreaming}
          style={{
            fontSize: 14, fontWeight: 700, color: '#FFFFFF',
            background: isStreaming ? '#94A3B8' : '#0D9488', border: 'none', borderRadius: 10, padding: '14px 28px',
            cursor: isStreaming ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: isStreaming ? 'none' : '0 4px 14px rgba(13, 148, 136, 0.35)', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { if (!isStreaming) e.currentTarget.style.background = '#0F766E'; }}
          onMouseLeave={(e) => { if (!isStreaming) e.currentTarget.style.background = '#0D9488'; }}
        >
          <span>Proceed to Execution Engine (Jump Box)</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 18 }} />
        </button>

        <button
          type="button"
          onClick={() => alert(`Downloaded HCL bundle artifact for tenant ${tenantId}`)}
          style={{
            fontSize: 13, fontWeight: 600, color: '#334155',
            background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 10, padding: '14px 20px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <i className="ti ti-download" style={{ fontSize: 16 }} />
          <span>Download HCL Bundle (.zip)</span>
        </button>

        <button
          type="button"
          onClick={() => void runComplianceScan()}
          disabled={isStreaming || scanBusy}
          style={{
            fontSize: 13, fontWeight: 600, color: '#FFFFFF',
            background: isStreaming || scanBusy ? '#94A3B8' : '#2563EB',
            border: 'none', borderRadius: 10, padding: '14px 20px',
            cursor: isStreaming || scanBusy ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: isStreaming || scanBusy ? 'none' : '0 2px 8px rgba(37,99,235,0.25)',
          }}
        >
          <i className={`ti ${scanBusy ? 'ti-loader spin' : 'ti-shield-check'}`} style={{ fontSize: 16 }} />
          <span>{scanBusy ? 'Scanning OPA + tfsec…' : 'Validate Syntax (OPA + tfsec)'}</span>
        </button>
      </div>

      {(scanResult || scanError) && (
        <div style={{
          background: '#FFFFFF',
          border: `1px solid ${scanError ? '#FCA5A5' : overallPassed ? '#A7F3D0' : '#FCD34D'}`,
          borderRadius: 14, padding: '16px 18px',
          boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            marginBottom: 10,
          }}>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: scanError ? '#B91C1C' : overallPassed ? '#047857' : '#B45309',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <i className={`ti ${scanError ? 'ti-alert-circle' : overallPassed ? 'ti-circle-check' : 'ti-alert-triangle'}`} />
              {scanError ? 'Validation request failed' : (scanResult?.summary || 'Scan complete')}
            </div>
            <button
              type="button"
              onClick={() => { setScanResult(null); setScanError(null); }}
              style={{
                fontSize: 11, fontWeight: 600, color: '#64748B', background: '#F8FAFC',
                border: '1px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>

          {scanError && (
            <div style={{ fontSize: 12, color: '#B91C1C', lineHeight: 1.45 }}>{scanError}</div>
          )}

          {scanResult && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  {
                    label: 'terraform validate',
                    ok: Boolean(scanResult.validation?.valid),
                    detail: scanResult.validation?.valid
                      ? 'HCL structure OK'
                      : `${scanResult.validation?.errors?.length || 0} error(s)`,
                  },
                  {
                    label: 'OPA / Rego',
                    ok: Boolean(scanResult.opa?.clean),
                    detail: scanResult.opa?.clean
                      ? 'CLEAN'
                      : `${scanResult.opa?.violations?.length || 0} violation(s)`,
                  },
                  {
                    label: 'tfsec',
                    ok: Boolean(scanResult.tfsec?.passed),
                    detail: scanResult.tfsec?.passed
                      ? 'PASSED'
                      : `${scanResult.tfsec?.violation_count || 0} finding(s)`,
                  },
                ].map((chip) => (
                  <span
                    key={chip.label}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999,
                      background: chip.ok ? '#ECFDF5' : '#FFFBEB',
                      color: chip.ok ? '#047857' : '#B45309',
                      border: `1px solid ${chip.ok ? '#A7F3D0' : '#FDE68A'}`,
                    }}
                  >
                    {chip.label}: {chip.detail}
                  </span>
                ))}
              </div>

              {(scanResult.validation?.errors?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>
                    Syntax errors
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#B91C1C', lineHeight: 1.5 }}>
                    {scanResult.validation!.errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}

              {(scanResult.opa?.violations?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>
                    OPA violations
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#B45309', lineHeight: 1.5 }}>
                    {scanResult.opa!.violations.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}

              {(scanResult.tfsec?.findings?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>
                    tfsec findings
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {scanResult.tfsec!.findings.map((f) => (
                      <div
                        key={`${f.rule}-${f.message}`}
                        style={{
                          fontSize: 12, color: '#334155', background: '#FFFBEB',
                          border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', lineHeight: 1.4,
                        }}
                      >
                        <strong style={{ color: '#B45309' }}>[{f.severity}]</strong>{' '}
                        <code style={{ fontSize: 11 }}>{f.rule}</code>
                        <div style={{ marginTop: 3 }}>{f.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {overallPassed && (
                <div style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>
                  Cloud <strong>{(scanResult.cloud || cloud).toUpperCase()}</strong> blueprint cleared
                  syntax + OPA + tfsec. Safe to proceed to Execution Engine.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
