import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request: attach access token + user ID ─────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Attach X-User-ID from persisted auth store
  try {
    const authState = JSON.parse(localStorage.getItem('eyeflow-auth') || '{}');
    const userId: string | undefined = authState?.state?.user?.id;
    if (userId) config.headers['X-User-ID'] = userId;
  } catch {
    // ignore parse errors
  }

  return config;
});

// ─── Response: auto-refresh on 401 ──────────────────────────────────────────
let isRefreshing = false;
let queue: Array<{ resolve: (t: string) => void; reject: (e: Error) => void }> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    isRefreshing = true;
    const refreshToken = localStorage.getItem('refreshToken');

    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      queue.forEach((p) => p.resolve(data.accessToken));
      queue = [];
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (err) {
      queue.forEach((p) => p.reject(err as Error));
      queue = [];
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  },
);

// ─── Auth endpoints ──────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; firstName: string; lastName: string }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
  verifyEmail: (token: string) => api.get(`/auth/verify-email?token=${token}`),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  resendVerification: () => api.post('/auth/resend-verification'),
  getPreferences: () => api.get('/auth/preferences'),
  updatePreferences: (data: Record<string, unknown>) => api.patch('/auth/preferences', data),
};

// ─── Connectors ──────────────────────────────────────────────────────────────
export const connectorsApi = {
  list: (params?: Record<string, string>) => api.get('/connectors', { params }),
  get: (id: string) => api.get(`/connectors/${id}`),
  create: (data: unknown) => api.post('/connectors', data),
  update: (id: string, data: unknown) => api.patch(`/connectors/${id}`, data),
  delete: (id: string) => api.delete(`/connectors/${id}`),
  test: (id: string) => api.post(`/connectors/${id}/test`),
  testConfig: (data: { type: string; config: Record<string, unknown> }) =>
    api.post('/connectors/test-config', data),
};

// ─── Rules / Tasks ────────────────────────────────────────────────────────────
export const rulesApi = {
  list: () => api.get('/tasks/rules'),
  get: (id: string) => api.get(`/tasks/rules/${id}`),
  create: (data: unknown) => api.post('/tasks/rules', data),
  update: (id: string, data: unknown) => api.patch(`/tasks/rules/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/rules/${id}`),
  generateFromIntent: (intent: string) =>
    api.post('/tasks/rules/generate-from-intent', { intent }),
  getDag: (id: string) => api.get(`/tasks/rules/${id}/dag`),
  forApproval: (id: string) => api.post(`/tasks/rules/${id}/for-approval`),
  approve: (id: string) => api.post(`/tasks/rules/${id}/approve`),
  reject: (id: string, reason?: string) =>
    api.post(`/tasks/rules/${id}/reject`, { reason }),
  pending: () => api.get('/tasks/rules/pending-approval'),
  execute: (id: string) => api.post(`/tasks/rules/${id}/execute`),
  toggle:  (id: string) => api.patch(`/tasks/rules/${id}/toggle`),
  logs:    (id: string) => api.get(`/tasks/rules/${id}/logs`),
  generateReport: (id: string) => api.post(`/tasks/rules/${id}/reports`),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  list:   (ruleId?: string) => api.get('/tasks/reports', { params: ruleId ? { ruleId } : {} }),
  get:    (reportId: string) => api.get(`/tasks/reports/${reportId}`),
  delete: (reportId: string) => api.delete(`/tasks/reports/${reportId}`),
};

// ─── Projects LLM ────────────────────────────────────────────────────────────
export const projectsApi = {
  list: () => api.get('/tasks/projects'),
  get: (id: string) => api.get(`/tasks/projects/${id}`),
  create: (data: unknown) => api.post('/tasks/projects', data),
  execute: (id: string, input?: unknown) =>
    api.post(`/tasks/projects/${id}/execute`, input),
  executions: (id: string) => api.get(`/tasks/projects/${id}/executions`),
  versions: (id: string) => api.get(`/tasks/projects/${id}/versions`),
  activateVersion: (id: string, versionId: string) =>
    api.post(`/tasks/projects/${id}/versions/${versionId}/activate`),
};

// ─── Nodes edge ──────────────────────────────────────────────────────────────
export const nodesApi = {
  list: () => api.get('/nodes'),
  summary: () => api.get('/nodes/summary'),
  get: (id: string) => api.get(`/nodes/${id}`),
  healthCheck: (id: string) => api.get(`/nodes/${id}/health-check`),
  triggerDrivers: (id: string) => api.get(`/nodes/${id}/trigger-drivers`),
};

// ─── Actions ─────────────────────────────────────────────────────────────────
export const actionsApi = {
  list: () => api.get('/actions'),
  get: (id: string) => api.get(`/actions/${id}`),
  create: (data: unknown) => api.post('/actions', data),
  execute: (id: string) => api.post('/jobs', { actionId: id }),
};

// ─── Audit ────────────────────────────────────────────────────────────────────
export const auditApi = {
  chain: (workflowId: string) => api.get(`/tasks/audit/chain/${workflowId}`),
  verify: (workflowId: string) => api.get(`/tasks/audit/chain/${workflowId}/verify`),
  stats: (workflowId: string) => api.get(`/tasks/audit/chain/${workflowId}/stats`),
  events: (params?: Record<string, unknown>) => api.get('/audit/events', { params }),
};

// ─── LLM Config ──────────────────────────────────────────────────────────────
export const llmConfigApi = {
  list: () => api.get('/llm-config'),
  get: (id: string) => api.get(`/llm-config/${id}`),
  create: (data: unknown) => api.post('/llm-config', data),
  update: (id: string, data: unknown) => api.patch(`/llm-config/${id}`, data),
  delete: (id: string) => api.delete(`/llm-config/${id}`),
  setDefault: (id: string) => api.post(`/llm-config/${id}/set-default`),
  getDefault: () => api.get('/llm-config/default'),
};

// ─── Agents / Jobs ────────────────────────────────────────────────────────────
export const agentsApi = {
  list: () => api.get('/agents'),
  get: (id: string) => api.get(`/agents/${id}`),
  create: (data: unknown) => api.post('/agents', data),
  execute: (id: string) => api.post(`/agents/${id}/execute`),
};

export const jobsApi = {
  list: () => api.get('/jobs'),
  get: (id: string) => api.get(`/jobs/${id}`),
  status: (id: string) => api.get(`/jobs/${id}/status`),
};

// ─── Manifest ────────────────────────────────────────────────────────────────
export const manifestApi = {
  getAggregated:    () => api.get('/tasks/manifest/llm-context/aggregated'),
  getEnhancedRule:  () => api.get('/tasks/manifest/llm-context/enhanced/rule'),
  getEnhancedTask:  () => api.get('/tasks/manifest/llm-context/enhanced/task'),
  getConnectors:    () => api.get('/tasks/manifest/connectors'),
  getProviders:     () => api.get('/tasks/manifest/llm-context/providers'),
};

// ─── LLM Service (direct calls to FastAPI on :8000) ─────────────────────────
const LLM_URL = (import.meta.env.VITE_LLM_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';

const llmService = axios.create({
  baseURL: LLM_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
});

export const llmServiceApi = {
  health: () =>
    llmService.get('/health'),

  generateRules: (
    intent: string,
    filteredContext: Record<string, unknown>,
  ) =>
    llmService.post('/api/rules/generate', {
      user_intent: intent,
      aggregated_context: filteredContext,
    }),

  refineRules: (
    currentRules: unknown,
    feedback: string,
    filteredContext: Record<string, unknown>,
  ) =>
    llmService.post('/api/rules/refine', {
      current_rules: currentRules,
      feedback,
      aggregated_context: filteredContext,
    }),

  analyzeIntent: (intent: string) =>
    llmService.post('/api/intent/analyze', { user_intent: intent }),

  selectAgent: (taskType: string) =>
    llmService.get(`/api/agent/select/${taskType}`),

  cacheStatus: () =>
    llmService.get('/cache/status'),
};

// ─── Suggestions ────────────────────────────────────────────────────────────
export const suggestionsApi = {
  list:         (status?: string) => api.get('/suggestions', { params: status ? { status } : {} }),
  listPending:  () => api.get('/suggestions/pending'),
  countPending: () => api.get('/suggestions/count/pending'),
  stats:        () => api.get('/suggestions/stats'),
  get:          (id: string) => api.get(`/suggestions/${id}`),
  create:       (data: Record<string, unknown>) => api.post('/suggestions', data),
  decide:       (id: string, decision: string, comment?: string, deferUntil?: string) =>
    api.post(`/suggestions/${id}/decide`, { decision, comment, deferUntil }),
  remove:       (id: string) => api.delete(`/suggestions/${id}`),
  execute:      (id: string, comment?: string) => api.post(`/suggestions/${id}/execute`, { comment }),
  actionPlan:   (id: string) => api.get(`/suggestions/${id}/action-plan`),
  // Engine endpoints
  engineStatus: () => api.get('/suggestions/engine/status'),
  engineTrigger: () => api.post('/suggestions/engine/trigger'),
  engineConfig: () => api.get('/suggestions/engine/config'),
  engineUpdateConfig: (patch: Record<string, unknown>) => api.put('/suggestions/engine/config', patch),
};

// ─── Suggestion Watches ───────────────────────────────────────────────────────
export const suggestionWatchesApi = {
  list:            ()                                      => api.get('/suggestions/watches'),
  get:             (id: string)                            => api.get(`/suggestions/watches/${id}`),
  create:          (data: Record<string, unknown>)         => api.post('/suggestions/watches', data),
  update:          (id: string, data: Record<string, unknown>) => api.put(`/suggestions/watches/${id}`, data),
  remove:          (id: string)                            => api.delete(`/suggestions/watches/${id}`),
  trigger:         (id: string)                            => api.post(`/suggestions/watches/${id}/trigger`),
  generatePrompt:  (connectorIds: string[], userHint?: string) =>
    api.post('/suggestions/watches/generate-prompt', { connectorIds, userHint }),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  users: () => api.get('/auth/users'),
  setRole: (id: string, role: string) => api.patch(`/auth/users/${id}/role`, { role }),
  unlock: (id: string) => api.post(`/auth/users/${id}/unlock`),
  deleteUser: (id: string) => api.delete(`/auth/users/${id}`),
};
