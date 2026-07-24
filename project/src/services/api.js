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

// KPI Dashboard services
export const kpiService = {
  // Dashboard endpoint (all KPIs with latest values + sparklines)
  getDashboard: (filters = {}) => {
    const params = {};
    if (filters.category) params.category = filters.category;
    if (filters.product_id) params.product_id = filters.product_id;
    return api.get('/kpi/dashboard', { params });
  },

  // CRUD for KPI definitions
  listDefinitions: () => api.get('/kpi/definitions'),
  createDefinition: (data) => api.post('/kpi/definitions', data),
  updateDefinition: (id, data) => api.put(`/kpi/definitions/${id}`, data),
  deleteDefinition: (id) => api.delete(`/kpi/definitions/${id}`),

  // Built-in KPI templates
  getBuiltInTemplates: () => api.get('/kpi/definitions/built-in'),

  // Computation
  computeAll: () => api.post('/kpi/compute'),

  // History
  getHistory: (id, limit = 12) => api.get(`/kpi/${id}/history`, { params: { limit } }),

  // Promote formula to KPI
  promoteFormula: (formulaId, params = {}) =>
    api.post(`/kpi/from-formula/${formulaId}`, null, { params }),
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
