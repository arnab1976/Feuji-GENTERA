# =============================================================================
# outputs.tf — Connection strings published after terraform apply.
#
# These values are saved as outputs.json to S3 (tenant-scoped prefix) and:
#   1. Consumed by the customer RAG application (Layer 3)
#   2. Read by Phase 2 OPTIMA-AI for resource identification in:
#      - Cost Breakdown screen (maps category → identifier)
#      - Recommendations screen (references exact resource names)
#      - Savings Dashboard (tracks savings against named resources)
# =============================================================================

output "postgresql_fqdn" {
  description = "PostgreSQL FQDN — used by OPTIMA-AI OPT-03 (pgvector optimization)"
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "aks_cluster_name" {
  description = "AKS cluster name — used by OPTIMA-AI OPT-01 (right-sizing)"
  value       = azurerm_kubernetes_cluster.main.name
}

output "resource_group" {
  description = "Resource group — used by OPTIMA-AI for networking and observability resources"
  value       = azurerm_resource_group.main.name
}

output "vnet_id" {
  description = "VNet ID — used for network peering and egress cost analysis"
  value       = azurerm_virtual_network.main.id
}

output "key_vault_uri" {
  description = "Key Vault URI — used by OPTIMA-AI security lever analysis"
  value       = azurerm_key_vault.main.vault_uri
}

output "tenant_id" {
  description = "Feuji tenant identifier — scopes all OPTIMA-AI analysis"
  value       = var.tenant_id
}
