# =============================================================================
# providers.tf — Azure Workload Identity authentication (ADR-004).
# No client secrets stored in Kubernetes. IRSA/Workload Identity only.
# Injected in-memory by Jump Box (Stage 5) from Azure Key Vault.
# =============================================================================
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
  use_oidc = true
}
