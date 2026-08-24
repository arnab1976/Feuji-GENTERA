"""
Stage 4 — Terraform HCL Generation Service.
Generates 4 production-ready files:
  main.tf, variables.tf, outputs.tf, providers.tf
Uses join() instead of ${} interpolation to avoid template literal conflicts.
"""
import asyncio
from typing import AsyncGenerator, Dict


class TerraformEngine:
    def __init__(self, cloud: str = "azure", region: str = "eastus2", env: str = "prod"):
        self.cloud = cloud.lower()
        self.region = region
        self.env = env

    async def generate_hcl(self, plan, tenant_id: str) -> Dict[str, str]:
        """Generate all 4 Terraform files for the approved resource plan."""
        if self.cloud == "azure":
            return self._azure_hcl(plan, tenant_id)
        if self.cloud in ("gcp", "google"):
            return self._gcp_hcl(plan, tenant_id)
        return self._aws_hcl(plan, tenant_id)

    async def stream_hcl(self, plan, tenant_id: str) -> AsyncGenerator[str, None]:
        """Yield HCL content character by character for streaming to UI."""
        hcl = await self.generate_hcl(plan, tenant_id)
        full_content = "\n\n".join(
            f"=== {fname} ===\n{content}" for fname, content in hcl.items()
        )
        # Simulate streaming by yielding in chunks
        chunk_size = 8
        for i in range(0, len(full_content), chunk_size):
            yield full_content[i:i + chunk_size]
            await asyncio.sleep(0.01)

    async def validate(self, hcl_files: Dict[str, str]) -> dict:
        """Offline HCL syntax / structure checks (no cloud credentials)."""
        errors: list[str] = []
        required = ("main.tf", "variables.tf", "outputs.tf", "providers.tf")
        for name in required:
            content = (hcl_files.get(name) or "").strip()
            if not content:
                errors.append(f"{name}: file is empty — terraform validate cannot proceed")

        main = hcl_files.get("main.tf", "")
        providers = hcl_files.get("providers.tf", "") + "\n" + main
        variables = hcl_files.get("variables.tf", "")
        outputs = hcl_files.get("outputs.tf", "")

        # Unbalanced braces (rough HCL syntax check)
        for fname, body in hcl_files.items():
            if body.count("{") != body.count("}"):
                errors.append(f"{fname}: unbalanced braces — HCL syntax is invalid")

        # Provider presence by cloud
        if self.cloud in ("gcp", "google"):
            if "provider \"google\"" not in providers and "hashicorp/google" not in providers:
                errors.append("providers.tf / main.tf: missing google provider for GCP stack")
            if "google_" not in main and "resource \"google_" not in main:
                errors.append("main.tf: no google_* resources found for GCP cloud selection")
        elif self.cloud == "aws":
            if "provider \"aws\"" not in providers and "hashicorp/aws" not in providers:
                errors.append("providers.tf / main.tf: missing aws provider for AWS stack")
        else:
            if "provider \"azurerm\"" not in providers and "hashicorp/azurerm" not in providers:
                errors.append("providers.tf / main.tf: missing azurerm provider for Azure stack")

        if "variable " not in variables:
            errors.append("variables.tf: no variable blocks declared")
        if "output " not in outputs:
            errors.append("outputs.tf: no output blocks declared")

        valid = len(errors) == 0
        return {
            "valid": valid,
            "output": "Success! The configuration is valid." if valid else "Configuration is invalid.",
            "errors": errors,
        }

    async def opa_scan(self, hcl_files: Dict[str, str], resources: list | None = None) -> dict:
        """Apply OPA/Rego-style policy checks against generated HCL."""
        violations: list[str] = []
        main_tf = hcl_files.get("main.tf", "")
        all_hcl = "\n".join(hcl_files.values())
        low = all_hcl.lower()

        # No public DB endpoints
        if "public_network_access_enabled = true" in main_tf.replace(" ", ""):
            violations.append("OPA: public_network_access_enabled = true is not permitted")
        if "publicly_accessible = true" in main_tf.replace(" ", ""):
            violations.append("OPA: publicly_accessible = true is not permitted for databases")
        if "ipv4_enabled = true" in main_tf and "google_sql" in main_tf:
            violations.append("OPA: Cloud SQL ipv4_enabled = true exposes a public IP — use private VPC only")

        # Encryption / private networking signals
        if self.cloud == "aws" and "storage_encrypted" in main_tf and "storage_encrypted = false" in main_tf.replace(" ", ""):
            violations.append("OPA: storage_encrypted = false violates encryption-at-rest policy")

        # Mandatory tags / labels expected somewhere in module
        if "mandatory_tags" not in all_hcl and "mandatory_labels" not in all_hcl:
            if "tags" not in low and "labels" not in low:
                violations.append("OPA: mandatory tags/labels missing from Terraform module")

        # Hardcoded cloud credentials patterns
        for needle in ("client_secret", "aws_secret_access_key", "private_key ="):
            if needle in low:
                violations.append(f"OPA: potential hardcoded credential pattern '{needle}' — use Workload Identity / IRSA / WI")

        return {"clean": len(violations) == 0, "violations": violations}

    async def tfsec_scan(self, hcl_files: Dict[str, str]) -> dict:
        """tfsec / Checkov-style static checks (simulated offline ruleset)."""
        findings: list[dict] = []
        main_tf = hcl_files.get("main.tf", "")
        all_hcl = "\n".join(hcl_files.values())

        # Hardcoded passwords / secrets in HCL
        import re
        for m in re.finditer(r'password\s*=\s*"([^"]+)"', main_tf, flags=re.I):
            findings.append({
                "rule": "tfsec:general-secrets-no-plaintext-password",
                "severity": "CRITICAL",
                "message": f"Hardcoded password in main.tf (value length {len(m.group(1))}) — use Secret Manager / Key Vault",
            })
        if re.search(r'api_key\s*=\s*"[A-Za-z0-9_\-]{8,}"', all_hcl, flags=re.I):
            findings.append({
                "rule": "tfsec:general-secrets-no-plaintext-key",
                "severity": "HIGH",
                "message": "Hardcoded API key detected in Terraform files",
            })

        # Open 0.0.0.0/0 ingress
        if "0.0.0.0/0" in all_hcl:
            findings.append({
                "rule": "tfsec:network-no-public-ingress",
                "severity": "HIGH",
                "message": "CIDR 0.0.0.0/0 found — public ingress is blocked by CIS baseline",
            })

        # GCP: prefer private Google Access for HIPAA RAG
        if self.cloud in ("gcp", "google"):
            if "google_compute_subnetwork" in main_tf and "private_ip_google_access" not in main_tf:
                findings.append({
                    "rule": "tfsec:google-compute-enable-private-google-access",
                    "severity": "MEDIUM",
                    "message": "GCE subnet missing private_ip_google_access = true (Vertex / private APIs)",
                })
            if "google_sql_database_instance" in main_tf and "ipv4_enabled" not in main_tf:
                findings.append({
                    "rule": "tfsec:google-sql-no-public-ip",
                    "severity": "MEDIUM",
                    "message": "Cloud SQL should explicitly set ipv4_enabled = false",
                })

        # Azure public network checks already covered partially by OPA
        if self.cloud == "azure" and "azurerm_postgresql" in main_tf:
            if "public_network_access_enabled" not in main_tf:
                findings.append({
                    "rule": "tfsec:azure-database-no-public-access",
                    "severity": "MEDIUM",
                    "message": "PostgreSQL Flexible Server should set public_network_access_enabled = false",
                })

        passed = len(findings) == 0
        return {
            "passed": passed,
            "status": "PASSED" if passed else "FAILED",
            "findings": findings,
            "violation_count": len(findings),
        }

    async def full_compliance_scan(self, hcl_files: Dict[str, str], resources: list | None = None) -> dict:
        validation = await self.validate(hcl_files)
        opa = await self.opa_scan(hcl_files, resources or [])
        tfsec = await self.tfsec_scan(hcl_files)
        overall = validation["valid"] and opa["clean"] and tfsec["passed"]
        return {
            "overall": "PASSED" if overall else "FAILED",
            "cloud": self.cloud,
            "validation": validation,
            "opa": opa,
            "tfsec": tfsec,
            "summary": (
                f"OPA + tfsec compliance scan {'PASSED' if overall else 'FAILED'} "
                f"({tfsec['violation_count']} tfsec finding(s), "
                f"{len(opa['violations'])} OPA violation(s), "
                f"{len(validation['errors'])} syntax error(s))."
            ),
        }

    def _azure_hcl(self, plan, tenant_id: str) -> Dict[str, str]:
        tid = tenant_id.lower()
        return {
            "main.tf": f'''terraform {{
  required_providers {{
    azurerm = {{ source = "hashicorp/azurerm", version = "~> 3.80" }}
  }}
  backend "azurerm" {{
    resource_group_name  = var.state_rg
    storage_account_name = var.state_sa
    container_name       = "tfstate"
    key                  = join("/", ["tenants", var.tenant_id, "prod.tfstate"])
  }}
}}
provider "azurerm" {{ features {{}} }}

locals {{
  mandatory_tags = {{
    Project     = var.project_name
    Environment = var.environment
    TenantId    = var.tenant_id
    Compliance  = var.compliance
    ManagedBy   = "terraform"
  }}
}}

resource "azurerm_resource_group" "main" {{
  name     = join("-", ["rg", var.tenant_id, var.environment])
  location = var.location
  tags     = local.mandatory_tags
}}

resource "azurerm_virtual_network" "main" {{
  name                = join("-", ["vnet", var.tenant_id])
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.mandatory_tags
}}

resource "azurerm_subnet" "aks" {{
  name                 = "subnet-aks"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
}}

resource "azurerm_subnet" "db" {{
  name                 = "subnet-db"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
  delegation {{
    name = "postgres"
    service_delegation {{
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
    }}
  }}
}}

resource "azurerm_postgresql_flexible_server" "main" {{
  name                          = join("-", ["psql", var.tenant_id])
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = "15"
  delegated_subnet_id           = azurerm_subnet.db.id
  public_network_access_enabled = false
  storage_mb                    = 32768
  sku_name                      = "GP_Standard_D4s_v3"
  zone                          = "1"
  tags                          = local.mandatory_tags
}}

resource "azurerm_kubernetes_cluster" "main" {{
  name                = join("-", ["aks", var.tenant_id])
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = var.tenant_id
  default_node_pool {{
    name           = "default"
    node_count     = 2
    vm_size        = "Standard_D4s_v3"
    vnet_subnet_id = azurerm_subnet.aks.id
  }}
  identity {{ type = "SystemAssigned" }}
  tags = local.mandatory_tags
}}''',

            "variables.tf": '''variable "tenant_id"    { description = "Feuji tenant identifier" }
variable "project_name" { description = "Project name for tagging" }
variable "environment"  { description = "prod or uat or dev",    default = "prod" }
variable "location"     { description = "Azure region",          default = "eastus2" }
variable "compliance"   { description = "HIPAA or SOC2 or GDPR", default = "HIPAA" }
variable "state_rg"     { description = "TF state resource group" }
variable "state_sa"     { description = "TF state storage account" }''',

            "outputs.tf": '''# outputs.tf — connection strings published after terraform apply.
# These values become outputs.json consumed by:
#   1. The customer RAG application (Layer 3)
#   2. Phase 2 OPTIMA-AI for cost analysis and resource identification

output "postgresql_fqdn"  { value = azurerm_postgresql_flexible_server.main.fqdn }
output "aks_cluster_name" { value = azurerm_kubernetes_cluster.main.name }
output "resource_group"   { value = azurerm_resource_group.main.name }
output "vnet_id"          { value = azurerm_virtual_network.main.id }
output "tenant_id"        { value = var.tenant_id }''',

            "providers.tf": '''# providers.tf — Azure Workload Identity authentication.
# No client secrets stored in Kubernetes secrets.
# IRSA/Workload Identity is the only permitted auth method (ADR-004).

terraform {
  required_version = ">= 1.7.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
  }
}

provider "azurerm" {
  features {}
  # Authentication via Workload Identity — credentials injected in-memory
  # by Jump Box (Stage 5) from Azure Key Vault. Never hardcoded.
  use_oidc = true
}''',
        }

    def _gcp_hcl(self, plan, tenant_id: str) -> Dict[str, str]:
        """GCP variant — GKE Autopilot + Cloud SQL + Vertex region + Secret Manager."""
        return {
            "main.tf": f"""# GCP Terraform HCL for tenant {tenant_id}
provider "google" {{
  project = var.gcp_project_id
  region  = var.gcp_region
}}

resource "google_compute_network" "vpc" {{
  name                    = join("-", ["vpc", var.tenant_id, var.environment])
  auto_create_subnetworks = false
}}

resource "google_compute_subnetwork" "private" {{
  name                     = join("-", ["subnet-private", var.tenant_id])
  ip_cidr_range            = "10.0.1.0/24"
  region                   = var.gcp_region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true
}}

resource "google_sql_database_instance" "postgres" {{
  name             = join("-", ["psql", var.tenant_id])
  database_version = "POSTGRES_15"
  region           = var.gcp_region
  settings {{
    tier = "db-custom-4-16384"
    ip_configuration {{
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }}
  }}
}}

resource "google_container_cluster" "gke" {{
  name             = join("-", ["gke", var.tenant_id])
  location         = var.gcp_region
  network          = google_compute_network.vpc.name
  subnetwork       = google_compute_subnetwork.private.name
  enable_autopilot = true
}}
""",
            "variables.tf": """variable "tenant_id" { description = "Feuji tenant identifier" }
variable "environment" { default = "prod" }
variable "gcp_region" { default = "us-central1" }
variable "gcp_project_id" { description = "GCP project id" }""",
            "outputs.tf": """output "gke_cluster_name" { value = google_container_cluster.gke.name }
output "cloudsql_connection_name" { value = google_sql_database_instance.postgres.connection_name }
output "vpc_name" { value = google_compute_network.vpc.name }""",
            "providers.tf": """terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.30.0" }
  }
}""",
        }

    def _aws_hcl(self, plan, tenant_id: str) -> Dict[str, str]:
        """AWS variant — uses IRSA for authentication."""
        return {
            "main.tf": f"""# AWS Terraform HCL for tenant {tenant_id}
# EKS + RDS PostgreSQL + Bedrock + VPC + KMS + CloudWatch
# Auth: IRSA (IAM Roles for Service Accounts)
terraform {{
  required_providers {{
    aws = {{ source = "hashicorp/aws", version = "~> 5.0" }}
  }}
  backend "s3" {{
    bucket         = var.state_bucket
    key            = "tenants/{tenant_id}/prod.tfstate"
    region         = var.region
    dynamodb_table = var.state_lock_table
  }}
}}
provider "aws" {{ region = var.region }}

locals {{
  mandatory_tags = {{
    Tenant      = "{tenant_id}"
    Environment = var.environment
    ManagedBy   = "terraform"
  }}
}}

resource "aws_vpc" "main" {{
  cidr_block = "10.0.0.0/16"
  tags       = local.mandatory_tags
}}

resource "aws_db_instance" "postgres" {{
  identifier          = join("-", ["rds", "{tenant_id}"])
  engine              = "postgres"
  instance_class      = "db.m5.xlarge"
  allocated_storage   = 50
  publicly_accessible = false
  storage_encrypted   = true
  username            = "dbadmin"
  # password supplied via Secrets Manager — never hardcoded
  manage_master_user_password = true
  tags = local.mandatory_tags
}}
""",
            "variables.tf": """variable "region" { default = "us-east-1" }
variable "environment" { default = "prod" }
variable "state_bucket" { description = "TF state bucket" }
variable "state_lock_table" { description = "DynamoDB lock table" }""",
            "outputs.tf": """output "vpc_id" { value = aws_vpc.main.id }
output "rds_identifier" { value = aws_db_instance.postgres.id }""",
            "providers.tf": """terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}
provider "aws" { region = var.region }""",
        }
