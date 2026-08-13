import axios from 'axios';
import { jwtDecode } from "jwt-decode";


let rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
if (rawBaseUrl && !rawBaseUrl.startsWith('http://') && !rawBaseUrl.startsWith('https://')) {
  rawBaseUrl = `https://${rawBaseUrl}`;
}
if (rawBaseUrl.endsWith('/')) {
  rawBaseUrl = rawBaseUrl.slice(0, -1);
}
const API_BASE_URL = rawBaseUrl;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    if (error.response?.status === 403 && error.response?.data?.detail === "LICENSE_REQUIRED") {
      const event = new CustomEvent("license-required", {
        detail: {
          reason: error.response.data.reason || "REVOKED",
          licenseKey: error.response.data.licenseKey || "",
          expiresAt: error.response.data.expiresAt || null,
          hoursLeft: error.response.data.hoursLeft || 0.0,
          machineId: error.response.data.machineId || ""
        }
      });
      window.dispatchEvent(event);
    }
    return Promise.reject(error);
  }
);

// Auth services
export const authService = {
  signup: async (userData) => {
    const payload = {
      user_in: { 
        name: userData.name, 
        email: userData.email, 
        password: userData.password 
      },
      org_in: { 
        name: `${userData.name}'s Organization`, 
        subscription_plan: "free" 
      }
    };
    const response = await api.post('/auth/register', payload);
    return response.data;
  },



  login: async (credentials) => {
    const response = await api.post("/login/login", credentials);
    if (response.data.access_token) {
      const token = response.data.access_token;
      localStorage.setItem("token", token);

      // decode token to get role
      const decoded = jwtDecode(token);
      localStorage.setItem("role", decoded.role);

      if (response.data.requires_password_change) {
        localStorage.setItem("requires_password_change", "true");
      } else {
        localStorage.removeItem("requires_password_change");
      }

      // Persist license_bound flag from the server response.
      // This tells the frontend whether this org already has a license bound,
      // so we only show the license-key entry screen on first-time setup.
      const licenseBound = response.data.license_bound;
      if (typeof licenseBound === 'boolean') {
        localStorage.setItem("license_bound", licenseBound ? "true" : "false");
      } else {
        // If the server didn't send the flag (older backend), assume bound
        // so existing users are not incorrectly shown the license screen.
        localStorage.setItem("license_bound", "true");
      }
    }
    return response.data;
  },


  logout: () => {
    localStorage.clear();
    window.location.href = '/login';
  },

  getRole: () => {
    return localStorage.getItem('role');
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },

  /**
   * Returns true if a valid license is already bound to this account's organization.
   * This flag is written at login time from the server response, so it is always
   * authoritative. It is cleared on logout via localStorage.clear().
   *
   * Returns true by default (safe fallback) to avoid locking out existing users
   * whose localStorage was cleared before this flag was introduced.
   */
  isLicenseBound: () => {
    const val = localStorage.getItem('license_bound');
    // If the key is absent (e.g. pre-existing session), default to true
    if (val === null) return true;
    return val === 'true';
  }
};

// Productivity calculation services
export const productivityService = {
  calculate: async (data) => {
    
    const response = await api.post('/productivity/calculate', data);
    console.log(response.data);
    return response.data;

  },
  getAnalysisCount: async () => {
    try {
      const response = await api.get('/analysis-count'); // use api instance!
      return response.data; // { analysis_count: 5 }
    } catch (error) {
      console.error('Error fetching analysis count:', error);
      return { analysis_count: 0 };
    }
  }
  ,

  getRecords: async () => {
    try {
      const response = await api.get('/analytics/productivity-records');
      return response.data;
    } catch (error) {
      // Return empty array if endpoint doesn't exist yet
      console.warn('Productivity records endpoint not available:', error.message);
      return [];
    }
  }
};

// AI Analysis services
export const analysisService = {
  analyze: async (data) => {
    const response = await api.post('/ai/analyze', data);
    return response.data;
  }
};

// Chatbot services
export const chatbotService = {
  sendMessage: async (data) => {
    const response = await api.post('/chatbot/rag', data);
    return response.data;
  }
};

// AI Agent services
export const agentService = {
  generateReport: async (data) => {
    const response = await api.post('/agent', data);
    return response.data;
  },
  downloadReport: (reportId) => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    return `${baseUrl}/agent/${reportId}/download`;
  },
};

export const ragChatbotService = {
  sendMessage: async (data) => {
    const response = await api.post("/rag_chat", data);
    return response.data; // ✅ returns plain string
  },
};


// Product and Data services
export const productService = {
  getProducts: () => api.get('/products/'),
  createProduct: (data) => api.post('/products/', data),
  updateProduct: (id, data) => api.put(`/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/products/${id}`),


  
  getRegions: async () => {
    const res = await api.get('/products/');
    const products = res.data || [];
    const regions = products.map(p => p.region).filter(Boolean);
    return { data: Array.from(new Set(regions)) };
  },
  getTowersByRegion: async (region) => {
    const res = await api.get('/products/');
    const products = res.data || [];
    if (!region || region === 'all') return { data: products };
    return { data: products.filter(p => p.region === region) };
  }
};

// Data Record services (flat model: Tower + Month + metrics)
export const dataRecordService = {
  getRecords: (productId) =>
    api.get('/data-records/', { params: productId ? { product_id: productId } : {} }),
  getFilteredRecords: (filters) => api.get('/data-records/', { params: filters }),
  createRecord: (data) => api.post('/data-records/', data),
  bulkCreate: (data) => api.post('/data-records/bulk', data),
  updateRecord: (id, data) => api.put(`/data-records/${id}`, data),
  deleteRecord: (id) => api.delete(`/data-records/${id}`),
};

// Formula Builder services
export const formulaService = {
  // Get fixed column list
  getColumns: () => api.get('/api/formulas/columns'),

  // Get formula templates
  getTemplates: () => api.get('/api/formulas/templates'),

  // Preview expression (no save)
  preview: (template, columns) =>
    api.post('/api/formulas/preview', null, { params: { template, columns } }),

  // CRUD
  list: () => api.get('/api/formulas/'),
  get: (id) => api.get(`/api/formulas/${id}`),
  create: (data) => api.post('/api/formulas/', data),
  update: (id, data) => api.put(`/api/formulas/${id}`, data),
  delete: (id) => api.delete(`/api/formulas/${id}`),
  duplicate: (id) => api.post(`/api/formulas/duplicate/${id}`),

  // Evaluate a single formula against data
  evaluate: (payload) => api.post('/api/formulas/evaluate', payload),

  // Evaluate all formulas for dashboard widget
  evaluateAll: (filters = {}) => {
    const params = {};
    if (filters.unit_id) params.unit_id = filters.unit_id;
    if (filters.city) params.city = filters.city;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    return api.post('/api/formulas/evaluate-all', null, { params });
  },
};

// PHP Licensing / KPI Server Base URL
// PHP Licensing / KPI Server Base URL
const PHP_KPI_BASE_URL = (import.meta.env.VITE_PHP_KPI_URL || 'https://license.techohub.net/kpi_dashboard/api').replace(/\/+$/, '');

const getKPIHeaders = () => {
  const token = localStorage.getItem('token') || '';
  return {
    'Content-Type': 'application/json',
    'X-Organization-ID': '1',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// KPI Dashboard services — Connected to PHP KPI Engine Server with offline fallback
export const kpiService = {
  // Dashboard endpoint (all KPIs with latest values + sparklines)
  getDashboard: async (filters = {}) => {
    try {
      const params = new URLSearchParams(filters).toString();
      const url = `${PHP_KPI_BASE_URL}/dashboard.php${params ? '?' + params : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: getKPIHeaders()
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      localStorage.setItem('cached_kpi_dashboard', JSON.stringify(data));
      return { data };
    } catch (err) {
      console.warn("KPI Server offline or unreachable. Trying local fallback:", err);
      // Fallback to FastAPI backend endpoint if PHP is unreachable
      try {
        const res = await api.get('/kpi/dashboard');
        return { data: res.data };
      } catch (fallbackErr) {
        const cached = localStorage.getItem('cached_kpi_dashboard');
        if (cached) return { data: JSON.parse(cached) };
        return { data: { summary: [], kpis: [] } };
      }
    }
  },

  // CRUD for KPI definitions
  listDefinitions: async () => {
    try {
      const response = await fetch(`${PHP_KPI_BASE_URL}/kpi_definitions.php`, {
        headers: getKPIHeaders()
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      localStorage.setItem('cached_kpi_definitions', JSON.stringify(data));
      return { data: data.data || [] };
    } catch (err) {
      console.warn("KPI definitions fetch offline, using fallback:", err);
      try {
        const res = await api.get('/kpi/definitions');
        return { data: res.data || [] };
      } catch {
        const cached = localStorage.getItem('cached_kpi_definitions');
        return { data: cached ? (JSON.parse(cached).data || []) : [] };
      }
    }
  },

  createDefinition: async (kpiData) => {
    try {
      const response = await fetch(`${PHP_KPI_BASE_URL}/kpi_definitions.php`, {
        method: 'POST',
        headers: getKPIHeaders(),
        body: JSON.stringify(kpiData)
      });
      const responseText = await response.text();
      let resData;
      try {
        resData = JSON.parse(responseText);
      } catch {
        throw new Error(`Server response invalid: ${responseText.slice(0, 100)}`);
      }
      if (!response.ok || resData.error || resData.status === 'error') {
        const msg = resData.message || resData.error || `HTTP ${response.status}`;
        const errorObj = new Error(msg);
        errorObj.response = { data: { detail: msg } };
        throw errorObj;
      }
      return { data: resData };
    } catch (err) {
      console.error("Failed to create KPI definition on PHP server, trying FastAPI fallback:", err);
      try {
        const res = await api.post('/kpi/definitions', kpiData);
        return { data: res.data };
      } catch (fallbackErr) {
        if (!err.response) {
          err.response = { data: { detail: err.message || "Failed to create KPI definition." } };
        }
        throw err;
      }
    }
  },

  updateDefinition: async (id, kpiData) => {
    try {
      const response = await fetch(`${PHP_KPI_BASE_URL}/kpi_definitions.php?id=${id}`, {
        method: 'PUT',
        headers: getKPIHeaders(),
        body: JSON.stringify(kpiData)
      });
      const responseText = await response.text();
      let resData;
      try {
        resData = JSON.parse(responseText);
      } catch {
        throw new Error(`Server response invalid: ${responseText.slice(0, 100)}`);
      }
      if (!response.ok || resData.error || resData.status === 'error') {
        const msg = resData.message || resData.error || `HTTP ${response.status}`;
        const errorObj = new Error(msg);
        errorObj.response = { data: { detail: msg } };
        throw errorObj;
      }
      return { data: resData };
    } catch (err) {
      console.error("Failed to update KPI definition on PHP server:", err);
      try {
        const res = await api.put(`/kpi/definitions/${id}`, kpiData);
        return { data: res.data };
      } catch (fallbackErr) {
        if (!err.response) {
          err.response = { data: { detail: err.message || "Failed to update KPI definition." } };
        }
        throw err;
      }
    }
  },

  deleteDefinition: async (id) => {
    try {
      const response = await fetch(`${PHP_KPI_BASE_URL}/kpi_definitions.php?id=${id}`, {
        method: 'DELETE',
        headers: getKPIHeaders()
      });
      const resData = await response.json().catch(() => ({}));
      if (!response.ok || resData.error) {
        const msg = resData.message || resData.error || `HTTP ${response.status}`;
        const errorObj = new Error(msg);
        errorObj.response = { data: { detail: msg } };
        throw errorObj;
      }
      return { data: resData };
    } catch (err) {
      console.error("Failed to delete KPI definition:", err);
      try {
        const res = await api.delete(`/kpi/definitions/${id}`);
        return { data: res.data };
      } catch (fallbackErr) {
        throw err;
      }
    }
  },

  // Built-in KPI templates
  getBuiltInTemplates: async () => {
    return {
      data: [
        { key: 'revenue_growth', name: 'Revenue Growth Rate', unit: '%', category: 'financial', description: 'Month-over-month revenue growth' },
        { key: 'customer_churn', name: 'Customer Churn Rate', unit: '%', category: 'operational', description: 'Percentage of lost customers' },
        { key: 'active_users', name: 'Monthly Active Users', unit: 'users', category: 'operational', description: 'Active user count per month' },
        { key: 'profit_margin', name: 'Net Profit Margin', unit: '%', category: 'financial', description: 'Net profit percentage of total revenue' }
      ]
    };
  },

  // Computation
  computeAll: async () => {
    try {
      const response = await fetch(`${PHP_KPI_BASE_URL}/kpi_compute.php`, {
        method: 'POST',
        headers: getKPIHeaders()
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error || data.status === 'error') throw new Error(data.message || data.error);
      return { data };
    } catch (err) {
      console.warn("PHP KPI compute failed or offline. Trying FastAPI fallback:", err);
      try {
        const res = await api.post('/kpi/compute');
        return { data: res.data };
      } catch (fallbackErr) {
        console.error("FastAPI KPI compute failed:", fallbackErr);
        throw fallbackErr.response?.data?.detail ? fallbackErr : err;
      }
    }
  },

  // History
  getHistory: async (id, limit = 12) => {
    try {
      const response = await fetch(`${PHP_KPI_BASE_URL}/dashboard.php?kpi_id=${id}&limit=${limit}`, {
        headers: getKPIHeaders()
      });
      const data = await response.json();
      return { data };
    } catch (err) {
      return { data: [] };
    }
  },

  // Promote formula to KPI
  promoteFormula: async (formulaId, params = {}) => {
    try {
      const response = await fetch(`${PHP_KPI_BASE_URL}/kpi_definitions.php`, {
        method: 'POST',
        headers: getKPIHeaders(),
        body: JSON.stringify({ formula_id: formulaId, ...params })
      });
      return { data: await response.json() };
    } catch (err) {
      console.error("Failed to promote formula to KPI:", err);
      throw err;
    }
  },
};

export default api;

// Organization Settings services (chatbot, goals)
export const orgSettingsService = {
  getChatbotSettings: () => api.get('/organizations/me/chatbot-settings'),
  updateChatbotSettings: (data) => api.post('/organizations/me/chatbot-settings', data),
  getAnalysisGoals: () => api.get('/organizations/me/analysis-goals'),
  updateAnalysisGoals: (goals) => api.post('/organizations/me/analysis-goals', { goals }),
};

// Admin User management service
export const adminUserService = {
  editUser: (userId, data) => api.put(`/users/${userId}`, data),
};

// Custom Chatbot Services
export const customChatbotService = {
  list: () => api.get('/custom-chatbots/'),
  create: (data) => api.post('/custom-chatbots/', data),
  update: (id, data) => api.put(`/custom-chatbots/${id}`, data),
  delete: (id) => api.delete(`/custom-chatbots/${id}`),
  myBots: () => api.get('/custom-chatbots/my-bots'),
};

// Alert Notification services
export const alertService = {
  // Validation endpoints (validate without saving)
  validateShiftEntry: (data) => api.post('/alerts/validate/shift-entry', data),
  validateDataRecord: (data, productFields) => api.post('/alerts/validate/data-record', { data, product_fields: productFields }),
  validateTowerData: (unitData, customerData) => api.post('/alerts/validate/unit-data', { unit_data: unitData, customer_data: customerData }),

  // Alert CRUD
  getAlerts: (filters = {}) => {
    const params = {};
    if (filters.dismissed !== undefined) params.dismissed = filters.dismissed;
    if (filters.alert_type) params.alert_type = filters.alert_type;
    if (filters.severity) params.severity = filters.severity;
    if (filters.limit) params.limit = filters.limit;
    return api.get('/alerts/', { params });
  },
  getAlert: (id) => api.get(`/alerts/${id}`),
  createAlert: (data) => api.post('/alerts/', data),
  dismissAlert: (id) => api.put(`/alerts/${id}/dismiss`),
  deleteAlert: (id) => api.delete(`/alerts/${id}`),

  // Alert statistics
  getStats: () => api.get('/alerts/stats/summary'),
};
