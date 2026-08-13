import React, { useState, useEffect, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import api, { authService } from './services/api';

// Layout
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/layout';
import { AlertManager } from './components/AlertNotification';

// Auth Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Verify_Result from './pages/verify_result';

// Admin Pages
import SuperAdmin from './pages/system_admin';
import OrgDashboard from './pages/org_admin';
import Visuals from './pages/Visuals';

// ── Formula Builder Module
import FormulaBuilder from './pages/FormulaBuilder';
import FormulaLibrary from './pages/FormulaLibrary';
import UnitManager from './pages/UnitManager';

// ── Co-Pilot Pages
import HomeFeed from './pages/copilot/HomeFeed';
import VoiceInterface from './pages/copilot/VoiceInterface';
import AgentsScreen from './pages/copilot/AgentsScreen';
import GoalSetting from './pages/copilot/GoalSetting';
import AutoModeControl from './pages/copilot/AutoModeControl';

// ── Sector Plugin Pages
import TelcoPlugin from './pages/plugins/TelcoPlugin';
import RetailPlugin from './pages/plugins/RetailPlugin';
import EnergyPlugin from './pages/plugins/EnergyPlugin';
import RevenuePlugin from './pages/plugins/RevenuePlugin';
import TextilePlugin from './pages/plugins/TextilePlugin';

// ── Legacy Productivity Module
import Dashboard from './pages/Dashboard';
// Note: Calculate and Analyze pages removed per Task 9 — files kept on disk.
import Chatbot from './pages/Chatbot';
import Agent from './pages/Agent';
import Reports from './pages/productivity/Reports';
import AIAnalysis from './pages/productivity/AIAnalysis';
import RAGChat from './pages/productivity/RAGChat';
import KPIDashboard from './pages/KPIDashboard';

import UnitDataEntry from "./pages/UnitDataEntry";

export const LicenseContext = createContext(null);

// Error Boundary Component to prevent screen blackout on render errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-400 font-bold text-xl">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-white/50 text-sm mb-6">
              An unexpected error occurred while rendering this page. You can reload to try again.
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-all shadow-lg"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Public route guard (redirect if already logged in)
const PublicRoute = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();
  const role = authService.getRole();
  const defaultPath = role === 'system_admin' ? '/system_admin' : role === 'org_admin' ? '/org_admin' : '/kpi';
  return isAuthenticated ? <Navigate to={defaultPath} replace /> : children;
};

// Wrapped protected route with layout and error boundary
const LayoutRoute = ({ element, roles }) => (
  <ProtectedRoute allowedRoles={roles}>
    <Layout>
      <ErrorBoundary>
        {element}
      </ErrorBoundary>
    </Layout>
  </ProtectedRoute>
);

function App() {
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [checking, setChecking] = useState(true);

  const fetchLicenseStatus = async () => {
    // Skip license check if the user is not authenticated.
    // The check will be triggered after login via window.refreshLicenseStatus.
    if (!localStorage.getItem('token')) {
      setChecking(false);
      return;
    }
    try {
      const res = await api.get("/license/local-status");
      setLicenseStatus(res.data);
    } catch (err) {
      console.error("Failed to fetch license status:", err);
      setLicenseStatus({ valid: false, reason: "CONNECTION_ERROR", licenseKey: "", machineId: "Offline" });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
    window.refreshLicenseStatus = fetchLicenseStatus;

    // Poll local status every 2 minutes
    const interval = setInterval(fetchLicenseStatus, 120000);

    // Listen for global license block events
    const handleLicenseRequired = (e) => {
      setLicenseStatus({
        valid: false,
        reason: e.detail?.reason || "REVOKED",
        licenseKey: e.detail?.licenseKey || "",
        expiresAt: e.detail?.expiresAt || null,
        hoursLeft: e.detail?.hoursLeft || 0.0,
        machineId: e.detail?.machineId || ""
      });
    };

    window.addEventListener("license-required", handleLicenseRequired);

    return () => {
      clearInterval(interval);
      window.removeEventListener("license-required", handleLicenseRequired);
      delete window.refreshLicenseStatus;
    };
  }, []);

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#09090b]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-t-teal-500 border-white/10 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-500 text-sm font-semibold tracking-wider uppercase">Initializing Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <LicenseContext.Provider value={{ licenseStatus, refreshLicense: fetchLicenseStatus }}>
      <Router>
        <div className="page-wrapper">
          {/* Only show AlertManager when authenticated */}
          {localStorage.getItem('token') && <AlertManager />}
          <Routes>
            {/* ── Public Routes ── */}
            <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/verify-result" element={<Verify_Result />} />

            {/* ── Co-Pilot Routes (PRIMARY) ── */}
            <Route path="/feed" element={<LayoutRoute element={<HomeFeed />} />} />
            <Route path="/voice" element={<LayoutRoute element={<VoiceInterface />} />} />
            <Route path="/agents" element={<LayoutRoute element={<AgentsScreen />} />} />
            <Route path="/goals" element={<LayoutRoute element={<GoalSetting />} />} />
            <Route path="/auto-mode" element={<LayoutRoute element={<AutoModeControl />} />} />

            {/* ── Sector Plugin Routes ── */}
            <Route path="/plugins/telco" element={<LayoutRoute element={<TelcoPlugin />} />} />
            <Route path="/plugins/energy" element={<LayoutRoute element={<EnergyPlugin />} />} />
            <Route path="/plugins/revenue" element={<LayoutRoute element={<RevenuePlugin />} />} />
            <Route path="/plugins/retail" element={<LayoutRoute element={<RetailPlugin />} />} />
            <Route path="/plugins/textile" element={<LayoutRoute element={<TextilePlugin />} />} />

            {/* ── Legacy Productivity Routes ── */}
            <Route path="/dashboard" element={<LayoutRoute element={<Dashboard />} />} />
            {/* /calculate and /analyze routes removed (Task 9) */}
            <Route path="/chatbot" element={<LayoutRoute element={<Chatbot />} />} />
            <Route path="/chatbot/:botType" element={<LayoutRoute element={<Chatbot />} />} />
            <Route path="/agent" element={<LayoutRoute element={<Agent />} />} />
            <Route path="/productivity/reports" element={<LayoutRoute element={<Reports />} />} />
            <Route path="/productivity/ai" element={<LayoutRoute element={<AIAnalysis />} />} />
            <Route path="/productivity/rag-chat" element={<LayoutRoute element={<RAGChat />} />} />
            <Route path="/kpi" element={<LayoutRoute element={<KPIDashboard />} />} />

            <Route path="/unit-data" element={
              <ProtectedRoute allowedRoles={['org_user', 'org_admin']}>
                <Layout><UnitDataEntry /></Layout>
              </ProtectedRoute>
            } />
            {/* ── Formula Builder Routes (org_admin only) ── */}
            <Route path="/unit-manager" element={
              <ProtectedRoute allowedRoles={['org_admin']}>
                <Layout><UnitManager /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/formula-builder" element={
              <ProtectedRoute allowedRoles={['org_admin']}>
                <Layout><FormulaBuilder /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/formula-library" element={
              <ProtectedRoute allowedRoles={['org_admin']}>
                <Layout><FormulaLibrary /></Layout>
              </ProtectedRoute>
            } />

            {/* ── Visuals & Admin Routes ── */}
            <Route path="/visuals" element={
              <ProtectedRoute allowedRoles={['org_admin', 'org_user', 'system_admin']}>
                <Layout><Visuals /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/org_admin" element={
              <ProtectedRoute allowedRoles={['org_admin']}>
                <Layout><OrgDashboard /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/system_admin" element={
              <ProtectedRoute>
                <SuperAdmin />
              </ProtectedRoute>
            } />

            {/* ── Catch All ── */}
            <Route path="*" element={<Navigate to="/kpi" replace />} />
          </Routes>
        </div>
      </Router>
    </LicenseContext.Provider>
  );
}

export default App;
