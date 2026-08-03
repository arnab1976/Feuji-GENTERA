variable "tenant_id"    { description = "Feuji tenant identifier — scopes all resources and OPTIMA-AI analysis" }
variable "project_name" { description = "Project name for tagging" }
variable "environment"  { description = "prod or uat or dev",    default = "prod" }
variable "location"     { description = "Azure region",          default = "eastus2" }
variable "compliance"   { description = "HIPAA or SOC2 or GDPR", default = "HIPAA" }
variable "state_rg"     { description = "TF state resource group" }
variable "state_sa"     { description = "TF state storage account" }
