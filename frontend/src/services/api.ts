/**
 * Axios API client — all requests go to FastAPI backend.
 * Tenant ID is injected automatically via request interceptor.
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8050';

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

export const optimaApi = axios.create({
  baseURL: `${BASE_URL}/api/v2/optima`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Phase 1 — LLM Kit endpoints
export const providerApi = {
  create:  (data: object) => api.post('/provider/create', data),
  get:     (id: string)   => api.get(`/provider/${id}`),
  list:    ()             => api.get('/providers'),
  purge:   (id: string)   => api.delete(`/provider/${id}`),
};

export const tenantApi = {
  register:     (data: object)                  => api.post('/tenant/register', data),
  get:          (id: string)                     => api.get(`/tenant/${id}`),
  updateStatus: (id: string, status: string)     => api.patch(`/tenant/${id}/status`, { status }),
};

export const inviteApi = {
  create:           (data: object) => api.post('/invite/create', data),
  list:             ()             => api.get('/invites'),
  get:              (id: string)   => api.get(`/invite/${id}`),
  tenantCompanies:  ()             => api.get('/invites/tenant-companies'),
  delete:           (id: string)   => api.patch(`/invite/${id}/delete`),
  decommission:     (id: string)   => api.patch(`/invite/${id}/decommission`),
  restore:          (id: string)   => api.patch(`/invite/${id}/restore`),
  approve:          (id: string, data?: object) => api.patch(`/invite/${id}/approve`, data ?? {}),
  updateProviderUser: (id: string, data: object) => api.patch(`/invite/${id}/provider-user`, data),
  requestCapabilities: (id: string, data: object) => api.patch(`/invite/${id}/capability-request`, data),
  reviewCapabilities: (id: string, data: object) => api.patch(`/invite/${id}/capability-review`, data),
  submitEdit:       (id: string, data: object) => api.patch(`/invite/${id}/submit-edit`, data),
  review:           (id: string, data: object) => api.patch(`/invite/${id}/review`, data),
  purge:            (id: string)   => api.delete(`/invite/${id}/purge`),
  purgeAllArchived: ()             => api.delete('/invites/purge-all-archived'),
};

export const activityApi = {
  list:       (limit = 100) => api.get('/activity', { params: { limit } }),
  unreadCount: ()           => api.get('/activity/unread-count'),
  markRead:   (id: string)  => api.patch(`/activity/${id}/read`),
  markAllRead: ()           => api.patch('/activity/read-all'),
  create:     (data: object) => api.post('/activity', data),
  delete:     (id: string)  => api.delete(`/activity/${id}`),
  deleteBulk: (ids: string[]) => api.post('/activity/delete-bulk', { ids }),
};

export const workflowApi = {
  submitIntake:    (data: object) => api.post('/intake/submit', data),
  listIntakes:     (params?: { status?: string; tenant_id?: string }) =>
    api.get('/intake/list', { params }),
  getIntake:       (id: string)   => api.get(`/intake/${id}`),
  deleteIntake:    (id: string)   => api.delete(`/intake/${id}`),
  decideIntake:    (id: string, data: object) => api.patch(`/intake/${id}/approve`, data),
  verifyUnlockToken: (id: string, token: string) =>
    api.post(`/intake/${id}/verify-unlock-token`, { token }),
  recommend:       (data: object) => api.post('/ai/recommend', data),
  approveCost:     (data: object) => api.post('/cost/approve', data),
  generateTF:      (data: object) => api.post('/terraform/generate', data),
  validateTF:      (data: object) => api.post('/terraform/validate', data),
  getArtifact:     (id: string)   => api.get(`/terraform/artifact/${id}`),
  executeTF:       (data: object) => api.post('/jumpbox/execute', data),
  getOutputs:      (tenantId: string) => api.get(`/jumpbox/outputs/${tenantId}`),
};

export const healthApi = {
  getTenantHealth: (tenantId: string) => api.get(`/health/${tenantId}`),
};

export const testingApi = {
  runSuite: (data?: object) => api.post('/testing/run', data || {}),
};

// Phase 2 — OPTIMA-AI endpoints (derive from Phase 1 outputs)
export const optimaApiClient = {
  overview:            (tenantId: string) => optimaApi.get(`/overview/${tenantId}`),
  costBreakdown:       (tenantId: string) => optimaApi.get(`/cost-breakdown/${tenantId}`),
  generateRecs:        (tenantId: string) => optimaApi.post(`/recommendations/generate/${tenantId}`),
  getRecommendations:  (tenantId: string) => optimaApi.get(`/recommendations/${tenantId}`),
  approveRec:          (recId: string, data: object) => optimaApi.patch(`/recommendations/${recId}/approve`, data),
  savings:             (tenantId: string) => optimaApi.get(`/savings/${tenantId}`),
};

// WebSocket helper — for Stage 5 log streaming
export const createLogSocket = (jobId: string) => {
  const WS_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8050';
  return new WebSocket(`${WS_URL}/api/v1/jumpbox/logs/${jobId}`);
};
